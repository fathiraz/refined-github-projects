import type {
  IssueDatabaseId,
  IssueNodeId,
  IssueNumber,
  ProjectItemDomId,
  ProjectItemId,
  RepoName,
  RepoOwner,
} from '@/lib/schemas-branded'

/**
 * Synchronous brand-decoders.
 *
 * Two flavors:
 *
 * 1. String-branded helpers (`decodeProjectItemId`, `decodeProjectItemDomId`,
 *    `decodeIssueNodeId`, `decodeRepoOwner`, `decodeRepoName`) carry no
 *    runtime predicate, so they cannot fail on a `string` input. Safe to call
 *    on the hot path (DOM extraction, message receipt) without try/catch.
 *
 * 2. Integer-branded helpers (`decodeIssueNumber`, `decodeIssueDatabaseId`)
 *    DO validate at runtime and will THROW on a non-integer input (e.g.
 *    `NaN`, `1.5`, `Infinity`). Either supply already-validated integers or
 *    wrap the call in a try/catch.
 */

export const decodeProjectItemId = (raw: string): ProjectItemId => raw as ProjectItemId

export const decodeProjectItemDomId = (raw: string): ProjectItemDomId => raw as ProjectItemDomId

export const decodeIssueNodeId = (raw: string): IssueNodeId => raw as IssueNodeId

export const decodeRepoOwner = (raw: string): RepoOwner => raw as RepoOwner

export const decodeRepoName = (raw: string): RepoName => raw as RepoName

function requireInteger(raw: number, brand: string): number {
  if (!Number.isInteger(raw)) throw new TypeError(`${brand} must be an integer, received ${raw}`)
  return raw
}

export const decodeIssueNumber = (raw: number): IssueNumber =>
  requireInteger(raw, 'IssueNumber') as IssueNumber

export const decodeIssueDatabaseId = (raw: number): IssueDatabaseId =>
  requireInteger(raw, 'IssueDatabaseId') as IssueDatabaseId
