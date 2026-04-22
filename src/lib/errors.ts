import { Data } from 'effect'

export class GithubHttpError extends Data.TaggedError('GithubHttpError')<{
  readonly status: number
  readonly message: string
  readonly retryAfter: number
}> {}

export class GithubGraphQLError extends Data.TaggedError('GithubGraphQLError')<{
  readonly message: string
}> {}

export class GithubNetworkError extends Data.TaggedError('GithubNetworkError')<{
  readonly cause: unknown
}> {}

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
