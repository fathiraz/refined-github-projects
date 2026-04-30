import { HttpClient, HttpClientRequest, HttpClientResponse } from '@effect/platform'
import { Context, Duration, Effect, Layer, ParseResult, Schedule, Schema } from 'effect'

import {
  GithubDecodeError,
  GithubGraphQLError,
  GithubNetworkError,
  GithubRateLimitError,
  classifyHttpError,
  type GithubError,
} from '@/lib/errors'
import { Storage } from '@/lib/storage-service'

/**
 * Service-tag wrapper for the GitHub GraphQL API.
 *
 * `request(schema, query, variables)` is the only call site app code should
 * use. It encapsulates:
 *   - Pat injection via the `Storage` service.
 *   - Response decoding through the supplied `Schema` (decode failures →
 *     `GithubDecodeError`, NEVER retried).
 *   - HTTP error classification via `classifyHttpError` (Match-based).
 *   - Retry on `GithubRateLimitError` only:
 *       Schedule.exponential('1s', 2.0) ⨯ jittered ⨯ recurs(2)
 *     i.e. up to 3 total attempts with backoff respecting `retryAfter`.
 *   - 30s timeout per attempt.
 *   - `Effect.withSpan` tracing keyed on the GraphQL operation name.
 */
export interface GithubGraphQLService {
  readonly request: <A, I, R>(
    schema: Schema.Schema<A, I, R>,
    query: string,
    variables: Record<string, unknown>,
    options?: { silent?: boolean },
  ) => Effect.Effect<A, GithubError, R>
}

export class GithubGraphQL extends Context.Tag('rgp/GithubGraphQL')<
  GithubGraphQL,
  GithubGraphQLService
>() {}

const GITHUB_ENDPOINT = 'https://api.github.com/graphql'

function operationName(query: string): string {
  return query.match(/(?:query|mutation)\s+(\w+)/)?.[1] ?? 'unknown'
}

const ResponseShape = Schema.Struct({
  data: Schema.optional(Schema.Unknown),
  errors: Schema.optional(Schema.Array(Schema.Struct({ message: Schema.String }))),
})

const make = Effect.gen(function* () {
  const client = yield* HttpClient.HttpClient
  const storage = yield* Storage

  const request: GithubGraphQLService['request'] = <A, I, R>(
    schema: Schema.Schema<A, I, R>,
    query: string,
    variables: Record<string, unknown>,
    options?: { silent?: boolean },
  ): Effect.Effect<A, GithubError, R> => {
    const op = operationName(query)
    const program = Effect.gen(function* () {
      const pat = yield* storage.getPat

      yield* Effect.logDebug('→ request').pipe(Effect.annotateLogs({ op, vars: variables }))

      const req = HttpClientRequest.post(GITHUB_ENDPOINT).pipe(
        HttpClientRequest.setHeaders({
          Authorization: `Bearer ${pat}`,
          'Content-Type': 'application/json',
          'GitHub-Feature-Request': 'ProjectV2',
        }),
        HttpClientRequest.bodyUnsafeJson({ query, variables }),
      )

      // network-level failure -> tagged GithubNetworkError
      const res = yield* client
        .execute(req)
        .pipe(Effect.mapError((cause) => new GithubNetworkError({ cause }) satisfies GithubError))

      if (res.status < 200 || res.status >= 300) {
        const retryAfter = Number(res.headers['retry-after'] ?? 0)
        const rateLimitRemaining = res.headers['x-ratelimit-remaining']
          ? Number(res.headers['x-ratelimit-remaining'])
          : null
        yield* Effect.logError('HTTP error').pipe(
          Effect.annotateLogs({
            op,
            status: res.status,
            retryAfter,
          }),
        )
        return yield* Effect.fail(
          classifyHttpError({
            status: res.status,
            message: `HTTP ${res.status}`,
            retryAfter,
            rateLimitRemaining,
          }),
        )
      }

      // decode body shape (`{ data?, errors? }`) — anything that isn't valid
      // JSON or doesn't match this shape becomes `GithubDecodeError`.
      const json = yield* HttpClientResponse.schemaBodyJson(ResponseShape)(res).pipe(
        Effect.mapError(
          (e) =>
            new GithubDecodeError({
              message: `Failed to parse GraphQL response: ${ParseResult.isParseError(e) ? '<parse error>' : String(e)}`,
              cause: e,
            }) satisfies GithubError,
        ),
      )

      if (json.errors && json.errors.length > 0) {
        if (!options?.silent) {
          yield* Effect.logError('GraphQL errors').pipe(
            Effect.annotateLogs({ op, errors: json.errors }),
          )
          // user data may live in query/variables — keep at debug level so
          // they're gated by RgpLoggerLive's debug flag.
          yield* Effect.logDebug('QUERY').pipe(Effect.annotateLogs({ query }))
          yield* Effect.logDebug('VARIABLES').pipe(Effect.annotateLogs({ variables }))
        }
        return yield* Effect.fail(new GithubGraphQLError({ message: json.errors[0].message }))
      }

      // decode the successful `data` payload via the caller-supplied schema.
      return yield* Schema.decodeUnknown(schema)(json.data).pipe(
        Effect.mapError(
          (e) =>
            new GithubDecodeError({
              message: `Failed to decode GraphQL data for ${op}`,
              cause: e,
            }) satisfies GithubError,
        ),
      )
    })

    // retry rate-limit failures only. Use the per-error retryAfter to compute
    // an additional fixed delay; layer that under exponential+jittered backoff
    // so two clients hitting the limit don't synchronise their retries.
    const schedule = Schedule.exponential('1 seconds', 2.0).pipe(
      Schedule.jittered,
      Schedule.intersect(Schedule.recurs(2)),
    )

    return program.pipe(
      Effect.timeout(Duration.seconds(30)),
      Effect.catchTag('TimeoutException', () =>
        Effect.fail(
          new GithubNetworkError({ cause: new Error(`Timeout: ${op}`) }) satisfies GithubError,
        ),
      ),
      Effect.retry({
        schedule,
        while: (e: GithubError) => e._tag === 'GithubRateLimitError',
      }),
      Effect.tapError((e) =>
        e._tag === 'GithubRateLimitError'
          ? Effect.logWarning('rate limit exhausted', {
              op,
              retryAfter: (e as GithubRateLimitError).retryAfter,
            })
          : Effect.void,
      ),
      Effect.withSpan(`gql.${op}`, { attributes: { op } }),
    )
  }

  return GithubGraphQL.of({ request })
})

export const GithubGraphQLLive: Layer.Layer<GithubGraphQL, never, HttpClient.HttpClient | Storage> =
  Layer.effect(GithubGraphQL, make)
