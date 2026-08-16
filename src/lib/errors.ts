// ─── GitHub-domain tagged ADT ────────────────────────────────────────────────
// Tagged union of GitHub error variants. Use `classifyHttpError` to map an
// HTTP status onto the right variant when constructing a failure from a
// non-OK Response.
//
// Every variant is a real `Error` with a literal `_tag`, so callers narrow on
// `_tag`, `instanceof` works, and DevTools renders a usable stack. Structural
// comparison (`expect(a).toEqual(b)`) compares the declared fields plus
// `message`.

export class GithubAuthError extends Error {
  readonly _tag = 'GithubAuthError' as const

  constructor(args: { readonly message: string }) {
    super(args.message)
    this.name = 'GithubAuthError'
  }
}

export class GithubRateLimitError extends Error {
  readonly _tag = 'GithubRateLimitError' as const
  readonly status: number
  readonly retryAfter: number

  constructor(args: {
    readonly status: number
    readonly message: string
    readonly retryAfter: number
  }) {
    super(args.message)
    this.name = 'GithubRateLimitError'
    this.status = args.status
    this.retryAfter = args.retryAfter
  }
}

export class GithubServerError extends Error {
  readonly _tag = 'GithubServerError' as const
  readonly status: number

  constructor(args: { readonly status: number; readonly message: string }) {
    super(args.message)
    this.name = 'GithubServerError'
    this.status = args.status
  }
}

export class GithubClientError extends Error {
  readonly _tag = 'GithubClientError' as const
  readonly status: number

  constructor(args: { readonly status: number; readonly message: string }) {
    super(args.message)
    this.name = 'GithubClientError'
    this.status = args.status
  }
}

export class GithubGraphQLError extends Error {
  readonly _tag = 'GithubGraphQLError' as const

  constructor(args: { readonly message: string }) {
    super(args.message)
    this.name = 'GithubGraphQLError'
  }
}

export class GithubNetworkError extends Error {
  readonly _tag = 'GithubNetworkError' as const

  constructor(args: { readonly cause: unknown }) {
    super(args.cause instanceof Error ? args.cause.message : String(args.cause))
    this.name = 'GithubNetworkError'
    this.cause = args.cause
  }
}

export class GithubDecodeError extends Error {
  readonly _tag = 'GithubDecodeError' as const

  constructor(args: { readonly message: string; readonly cause?: unknown }) {
    super(args.message)
    this.name = 'GithubDecodeError'
    this.cause = args.cause
  }
}

/** Closed union of every GitHub-domain error this app surfaces. */
export type GithubError =
  | GithubAuthError
  | GithubRateLimitError
  | GithubServerError
  | GithubClientError
  | GithubGraphQLError
  | GithubNetworkError
  | GithubDecodeError

// ─── Classifier ──────────────────────────────────────────────────────────────
/**
 * Map an HTTP `status` (and optional rate-limit headers) onto the appropriate
 * tagged error variant. Use from the GraphQL client when constructing a
 * failure from a non-OK Response. Replaces hand-rolled
 * `if (status === 403 || status === 429) ...` chains across the codebase.
 */
export function classifyHttpError(args: {
  status: number
  message: string
  retryAfter: number
  rateLimitRemaining?: number | null
}): GithubError {
  const { status, message } = args

  if (status === 401) return new GithubAuthError({ message })
  if (status === 429) return new GithubRateLimitError(args)

  // GitHub returns 403 for two unrelated reasons:
  //   - secondary rate limits / abuse detection (X-RateLimit-Remaining=0)
  //   - permission errors (token lacks scope, repo locked, ...)
  // we surface them as different tagged variants so the retry path only
  // re-fires on actual rate limits and the UI can show the correct
  // message for permission failures.
  if (status === 403) {
    return args.rateLimitRemaining === 0
      ? new GithubRateLimitError(args)
      : new GithubClientError({ status, message })
  }

  if (status >= 500 && status < 600) return new GithubServerError({ status, message })

  return new GithubClientError({ status, message })
}

// ─── PAT validation ──────────────────────────────────────────────────────────

export type PatErrorType =
  | 'expired_or_invalid'
  | 'missing_scopes'
  | 'rate_limit'
  | 'network'
  | 'unknown'

export interface PatError {
  type: PatErrorType
  title: string
  message: string
  actionLabel?: string
  actionHref?: string
}
