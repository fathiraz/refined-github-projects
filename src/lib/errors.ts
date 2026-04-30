import { Data, Match } from 'effect'

// `Data.TaggedError` initialises `message` via the Error super constructor,
// which makes it a NON-enumerable own property. Effect's default
// StructuralPrototype equality iterates `Object.keys`, so two instances with
// different `message` values would otherwise be considered Equal. We redefine
// `message` as an enumerable own property so it participates in structural
// equality, matching how callers use these errors (message is part of the
// payload contract).
function redefineMessage(target: object, message: string): void {
  Object.defineProperty(target, 'message', {
    value: message,
    enumerable: true,
    writable: false,
    configurable: true,
  })
}

// ─── GitHub-domain tagged ADT ────────────────────────────────────────────────
// tagged-union of GitHub error variants. Use `classifyHttpError` to map an
// HTTP status onto the right variant when constructing a failure from a
// non-OK Response.

export class GithubAuthError extends Data.TaggedError('GithubAuthError')<{
  readonly message: string
}> {
  constructor(args: { readonly message: string }) {
    super(args)
    redefineMessage(this, args.message)
  }
}

export class GithubRateLimitError extends Data.TaggedError('GithubRateLimitError')<{
  readonly status: number
  readonly message: string
  readonly retryAfter: number
}> {
  constructor(args: {
    readonly status: number
    readonly message: string
    readonly retryAfter: number
  }) {
    super(args)
    redefineMessage(this, args.message)
  }
}

export class GithubServerError extends Data.TaggedError('GithubServerError')<{
  readonly status: number
  readonly message: string
}> {
  constructor(args: { readonly status: number; readonly message: string }) {
    super(args)
    redefineMessage(this, args.message)
  }
}

export class GithubClientError extends Data.TaggedError('GithubClientError')<{
  readonly status: number
  readonly message: string
}> {
  constructor(args: { readonly status: number; readonly message: string }) {
    super(args)
    redefineMessage(this, args.message)
  }
}

export class GithubGraphQLError extends Data.TaggedError('GithubGraphQLError')<{
  readonly message: string
}> {
  constructor(args: { readonly message: string }) {
    super(args)
    redefineMessage(this, args.message)
  }
}

export class GithubNetworkError extends Data.TaggedError('GithubNetworkError')<{
  readonly cause: unknown
}> {}

export class GithubDecodeError extends Data.TaggedError('GithubDecodeError')<{
  readonly message: string
  readonly cause?: unknown
}> {
  constructor(args: { readonly message: string; readonly cause?: unknown }) {
    super(args)
    redefineMessage(this, args.message)
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
 * tagged error variant. Use from the GraphQL service when constructing a
 * failure from a non-OK Response. Replaces hand-rolled
 * `if (status === 403 || status === 429) ...` chains across the codebase.
 */
export const classifyHttpError = (args: {
  status: number
  message: string
  retryAfter: number
  rateLimitRemaining?: number | null
}): GithubError =>
  Match.value(args.status).pipe(
    Match.when(401, () => new GithubAuthError({ message: args.message })),
    Match.when(429, () => new GithubRateLimitError(args)),
    Match.when(403, () =>
      // GitHub returns 403 for two unrelated reasons:
      //   - secondary rate limits / abuse detection (X-RateLimit-Remaining=0)
      //   - permission errors (token lacks scope, repo locked, ...)
      // we surface them as different tagged variants so the retry path only
      // re-fires on actual rate limits and the UI can show the correct
      // message for permission failures.
      args.rateLimitRemaining === 0
        ? new GithubRateLimitError(args)
        : new GithubClientError({ status: args.status, message: args.message }),
    ),
    Match.when(
      (s) => s >= 500 && s < 600,
      (s) => new GithubServerError({ status: s, message: args.message }),
    ),
    Match.orElse((s) => new GithubClientError({ status: s, message: args.message })),
  )

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

/**
 * Map a `PatErrorType` onto a user-facing `PatError`. Pure function — relies
 * on `Match.value(...).pipe(Match.when(...), Match.exhaustive)` so adding a
 * new variant fails typecheck instead of silently falling through.
 */
export const renderPatError = (type: PatErrorType, message: string | undefined): PatError =>
  Match.value(type).pipe(
    Match.when(
      'expired_or_invalid',
      () =>
        ({
          type: 'expired_or_invalid' as const,
          title: 'Personal access token is invalid or expired',
          message: message ?? 'Generate a new token in GitHub settings and paste it below.',
          actionLabel: 'Open GitHub tokens',
          actionHref: 'https://github.com/settings/tokens',
        }) satisfies PatError,
    ),
    Match.when(
      'missing_scopes',
      () =>
        ({
          type: 'missing_scopes' as const,
          title: 'Token is missing required scopes',
          message: message ?? 'Grant the `repo` and `project` scopes to this token.',
          actionLabel: 'Open GitHub tokens',
          actionHref: 'https://github.com/settings/tokens',
        }) satisfies PatError,
    ),
    Match.when(
      'rate_limit',
      () =>
        ({
          type: 'rate_limit' as const,
          title: 'Rate limit hit while validating',
          message: message ?? 'Wait a minute and try again.',
        }) satisfies PatError,
    ),
    Match.when(
      'network',
      () =>
        ({
          type: 'network' as const,
          title: 'Network error',
          message: message ?? 'Could not reach api.github.com — check your connection.',
        }) satisfies PatError,
    ),
    Match.when(
      'unknown',
      () =>
        ({
          type: 'unknown' as const,
          title: 'Unknown validation error',
          message: message ?? 'GitHub rejected the token without a clear reason.',
        }) satisfies PatError,
    ),
    Match.exhaustive,
  )
