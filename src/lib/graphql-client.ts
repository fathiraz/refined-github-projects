import { logger } from '@/lib/debug-logger'
import {
  GithubDecodeError,
  GithubGraphQLError,
  GithubNetworkError,
  classifyHttpError,
  type GithubError,
} from '@/lib/errors'
import { patStorage } from '@/lib/storage'

/**
 * The single entry point for GitHub's GraphQL API.
 *
 * Encapsulates:
 *   - PAT injection from storage.
 *   - HTTP error classification via `classifyHttpError`.
 *   - Retry on `GithubRateLimitError` ONLY — 3 attempts total, each wait being
 *     the server's `Retry-After` plus a jittered exponential backoff.
 *   - A 30s timeout per attempt, surfaced as `GithubNetworkError` (and so not
 *     retried).
 *
 * Throws the tagged `GithubError` variant so callers' existing
 * `catch (err) { if (err.status === 403) ... }` chains keep working.
 */

const GITHUB_ENDPOINT = 'https://api.github.com/graphql'
const TIMEOUT_MS = 30_000
const MAX_ATTEMPTS = 3

interface GraphQLBody {
  data?: unknown
  errors?: { message: string }[]
}

function operationName(query: string): string {
  return query.match(/(?:query|mutation)\s+(\w+)/)?.[1] ?? 'unknown'
}

/**
 * Jittered exponential backoff, base 1s, factor 2, ±20% — the delays the
 * previous `Schedule.exponential('1 seconds', 2.0).pipe(Schedule.jittered)`
 * produced. The jitter keeps concurrent clients from resynchronising on the
 * same retry instant.
 */
function backoffMs(attempt: number): number {
  return 1000 * 2 ** attempt * (0.8 + 0.4 * Math.random())
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Settle within `ms` whatever the transport does.
 *
 * The `AbortSignal` handed to `fetch` cancels the in-flight request, but only
 * if the transport honours it. Racing a timer as well keeps the guarantee the
 * previous `Effect.timeout` gave: `gql` never hangs, even against a transport
 * that ignores the signal.
 */
function withDeadline<T>(work: Promise<T>, ms: number, op: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout: ${op}`)), ms)
  })
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer)) as Promise<T>
}

/** GitHub may omit these headers or return non-numeric placeholders. */
function numericHeader(raw: string | null): number {
  const n = Number(raw)
  return Number.isFinite(n) ? n : 0
}

async function attempt(
  query: string,
  variables: Record<string, unknown>,
  options: { silent?: boolean } | undefined,
  op: string,
): Promise<unknown> {
  const pat = await patStorage.getValue()

  logger.debug('→ request', { op, vars: variables })

  let res: Response
  try {
    res = await withDeadline(
      fetch(GITHUB_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${pat ?? ''}`,
          'Content-Type': 'application/json',
          'GitHub-Feature-Request': 'ProjectV2',
        },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }),
      TIMEOUT_MS,
      op,
    )
  } catch (cause) {
    // network failure or the per-attempt timeout firing — neither is a rate
    // limit, so neither is retried.
    throw new GithubNetworkError({ cause })
  }

  if (!res.ok) {
    const retryAfter = numericHeader(res.headers.get('retry-after'))
    const rateLimitRemainingHeader = res.headers.get('x-ratelimit-remaining')
    const rateLimitRemaining =
      rateLimitRemainingHeader === null ? null : numericHeader(rateLimitRemainingHeader)

    logger.error('HTTP error', { op, status: res.status, retryAfter })

    throw classifyHttpError({
      status: res.status,
      message: `HTTP ${res.status}`,
      retryAfter,
      rateLimitRemaining,
    })
  }

  let json: GraphQLBody
  try {
    json = (await res.json()) as GraphQLBody
  } catch (cause) {
    throw new GithubDecodeError({ message: `Failed to parse GraphQL response for ${op}`, cause })
  }

  if (json.errors && json.errors.length > 0) {
    if (!options?.silent) {
      logger.error('GraphQL errors', { op, errors: json.errors })
      // user data may live in query/variables — keep at debug level so they're
      // gated by the logger's debug flag.
      logger.debug('QUERY', { query })
      logger.debug('VARIABLES', { variables })
    }
    throw new GithubGraphQLError({ message: json.errors[0].message })
  }

  return json.data
}

export async function gql<T = unknown>(
  query: string,
  variables: Record<string, unknown>,
  options?: { silent?: boolean },
): Promise<T> {
  const op = operationName(query)

  for (let i = 0; ; i++) {
    try {
      return (await attempt(query, variables, options, op)) as T
    } catch (error) {
      const err = error as GithubError
      if (err._tag !== 'GithubRateLimitError') throw err

      if (i >= MAX_ATTEMPTS - 1) {
        logger.warn('rate limit exhausted', { op, retryAfter: err.retryAfter })
        throw err
      }

      // honor the server's mandated window first, then add the jittered
      // backoff on top so two clients don't resynchronise.
      if (Number.isFinite(err.retryAfter) && err.retryAfter > 0) {
        await sleep(err.retryAfter * 1000)
      }
      await sleep(backoffMs(i))
    }
  }
}
