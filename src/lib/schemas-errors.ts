import { Schema } from 'effect'

/**
 * Schemas mirroring the runtime `Data.TaggedError` shapes in `src/lib/errors.ts`.
 * These exist so failures can be encoded across messaging boundaries
 * (background SW ↔ content script) without losing structure, then decoded back
 * into the matching tagged error class on the receiving side.
 */

export const GithubAuthError = Schema.TaggedStruct('GithubAuthError', {
  message: Schema.String,
})
export type GithubAuthError = Schema.Schema.Type<typeof GithubAuthError>

export const GithubRateLimitError = Schema.TaggedStruct('GithubRateLimitError', {
  message: Schema.String,
  status: Schema.Number,
  retryAfter: Schema.Number,
})
export type GithubRateLimitError = Schema.Schema.Type<typeof GithubRateLimitError>

export const GithubServerError = Schema.TaggedStruct('GithubServerError', {
  message: Schema.String,
  status: Schema.Number,
})
export type GithubServerError = Schema.Schema.Type<typeof GithubServerError>

export const GithubClientError = Schema.TaggedStruct('GithubClientError', {
  message: Schema.String,
  status: Schema.Number,
})
export type GithubClientError = Schema.Schema.Type<typeof GithubClientError>

export const GithubGraphQLError = Schema.TaggedStruct('GithubGraphQLError', {
  message: Schema.String,
})
export type GithubGraphQLError = Schema.Schema.Type<typeof GithubGraphQLError>

// the runtime class carries `cause: unknown` (set from the underlying
// `fetch` rejection or thrown error). Mirror it here so encode/decode across
// messaging boundaries preserves the failure shape.
export const GithubNetworkError = Schema.TaggedStruct('GithubNetworkError', {
  message: Schema.optional(Schema.String),
  cause: Schema.optional(Schema.Unknown),
})
export type GithubNetworkError = Schema.Schema.Type<typeof GithubNetworkError>

export const GithubDecodeError = Schema.TaggedStruct('GithubDecodeError', {
  message: Schema.String,
})
export type GithubDecodeError = Schema.Schema.Type<typeof GithubDecodeError>

/** Closed union of every GitHub-domain error this app surfaces. */
export const GithubError = Schema.Union(
  GithubAuthError,
  GithubRateLimitError,
  GithubServerError,
  GithubClientError,
  GithubGraphQLError,
  GithubNetworkError,
  GithubDecodeError,
)
export type GithubError = Schema.Schema.Type<typeof GithubError>

/** PAT validation outcomes used by the UI. */
export const PatErrorType = Schema.Literal(
  'expired_or_invalid',
  'missing_scopes',
  'rate_limit',
  'network',
  'unknown',
)
export type PatErrorType = Schema.Schema.Type<typeof PatErrorType>

export const PatError = Schema.Struct({
  type: PatErrorType,
  title: Schema.String,
  message: Schema.String,
  actionLabel: Schema.optional(Schema.String),
  actionHref: Schema.optional(Schema.String),
})
export type PatError = Schema.Schema.Type<typeof PatError>
