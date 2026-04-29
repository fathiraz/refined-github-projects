import { Cause, Effect, Exit, Schema } from 'effect'

import { GithubGraphQL } from '../effect/services/graphql'
import { runPromise } from '../effect/runtime'
import type { GithubError } from '../errors'

/**
 * Backward-compatible Promise wrapper around `GithubGraphQL.request`.
 *
 * New code should depend on the `GithubGraphQL` service directly so it can
 * supply a Schema for the response — this shim keeps the legacy signature
 * (`gql<T>(query, variables): Promise<T>`) working by:
 *   - decoding the response with `Schema.Unknown` (no validation),
 *   - re-throwing the typed `GithubError` so callers' existing
 *     `try { ... } catch (err: any) { if (err.status === 403) ... }` chains
 *     continue to function.
 */
export async function gql<T = unknown>(
  query: string,
  variables: Record<string, unknown>,
  options?: { silent?: boolean },
): Promise<T> {
  const program = Effect.flatMap(GithubGraphQL, (svc) =>
    svc.request(Schema.Unknown, query, variables, options),
  )
  const exit = await runPromise(Effect.exit(program))
  if (Exit.isSuccess(exit)) return exit.value as T
  const cause = exit.cause
  if (Cause.isFailType(cause)) throw cause.error as GithubError
  if (Cause.isDieType(cause)) throw cause.defect
  throw new Error('gql: unexpected fiber failure')
}
