import { Data } from 'effect'

// Data.TaggedError sets `message` via the Error super constructor, which
// makes it a NON-enumerable own property. Effect's default StructuralPrototype
// equality iterates `Object.keys`, so two instances with different `message`
// values would otherwise be considered Equal. We redefine `message` as an
// enumerable own property so it participates in structural equality, matching
// how callers use these errors (message is part of the payload contract).

export class GithubHttpError extends Data.TaggedError('GithubHttpError')<{
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
    Object.defineProperty(this, 'message', {
      value: args.message,
      enumerable: true,
      writable: false,
      configurable: true,
    })
  }
}

export class GithubGraphQLError extends Data.TaggedError('GithubGraphQLError')<{
  readonly message: string
}> {
  constructor(args: { readonly message: string }) {
    super(args)
    Object.defineProperty(this, 'message', {
      value: args.message,
      enumerable: true,
      writable: false,
      configurable: true,
    })
  }
}

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
