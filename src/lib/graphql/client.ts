import { Effect, Exit, Cause } from 'effect'
import { patStorage } from '../storage'
import { RgpLoggerLive } from '../debug-logger'
import { GithubHttpError, GithubGraphQLError, GithubNetworkError } from '../errors'

function operationName(query: string): string {
  return query.match(/(?:query|mutation)\s+(\w+)/)?.[1] ?? 'unknown'
}

// Re-export for callers that previously imported GqlError from this module
export { GithubHttpError as GqlError }

function gqlEffect<T>(
  query: string,
  variables: Record<string, unknown>,
  options?: { silent?: boolean },
): Effect.Effect<T, GithubHttpError | GithubGraphQLError | GithubNetworkError> {
  return Effect.gen(function* () {
    const pat = yield* Effect.promise(() => patStorage.getValue())
    const op = operationName(query)

    yield* Effect.logDebug('→ request').pipe(Effect.annotateLogs({ op, vars: variables }))

    const res = yield* Effect.tryPromise({
      try: () =>
        fetch('https://api.github.com/graphql', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${pat}`,
            'Content-Type': 'application/json',
            'GitHub-Feature-Request': 'ProjectV2',
          },
          body: JSON.stringify({ query, variables }),
        }),
      catch: (cause) => new GithubNetworkError({ cause }),
    })

    if (!res.ok) {
      const retryAfter = Number(res.headers.get('Retry-After') ?? 0)
      yield* Effect.logError('HTTP error').pipe(
        Effect.annotateLogs({ op, status: res.status, statusText: res.statusText, retryAfter }),
      )
      yield* Effect.logDebug('QUERY').pipe(Effect.annotateLogs({ query }))
      yield* Effect.logDebug('VARIABLES').pipe(Effect.annotateLogs({ variables }))
      return yield* Effect.fail(
        new GithubHttpError({ message: res.statusText, status: res.status, retryAfter }),
      )
    }

    yield* Effect.logDebug('← response').pipe(Effect.annotateLogs({ op, status: res.status }))

    const json = yield* Effect.tryPromise({
      try: () => res.json() as Promise<{ data?: T; errors?: { message: string }[] }>,
      catch: (cause) => new GithubNetworkError({ cause }),
    })

    if (json.errors?.length) {
      if (!options?.silent) {
        yield* Effect.logError('GraphQL errors').pipe(
          Effect.annotateLogs({ op, errors: json.errors }),
        )
        yield* Effect.logDebug('QUERY').pipe(Effect.annotateLogs({ query }))
        yield* Effect.logDebug('VARIABLES').pipe(Effect.annotateLogs({ variables }))
      }
      return yield* Effect.fail(new GithubGraphQLError({ message: json.errors[0].message }))
    }

    return json.data as T
  })
}

export async function gql<T = unknown>(
  query: string,
  variables: Record<string, unknown>,
  options?: { silent?: boolean },
): Promise<T> {
  const exit = await Effect.runPromiseExit(
    gqlEffect<T>(query, variables, options).pipe(Effect.provide(RgpLoggerLive)),
  )
  if (Exit.isSuccess(exit)) return exit.value
  const cause = exit.cause
  if (Cause.isFailType(cause)) throw cause.error
  if (Cause.isDieType(cause)) throw cause.defect
  throw new Error('gql: unexpected fiber failure')
}
