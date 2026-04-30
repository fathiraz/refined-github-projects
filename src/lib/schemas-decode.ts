import { Schema } from 'effect'

import {
  IssueDatabaseId,
  IssueNodeId,
  IssueNumber,
  Login,
  Pat,
  ProjectId,
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
 * 1. String-branded helpers (`decodeProjectId`, `decodeProjectItemId`,
 *    `decodeProjectItemDomId`, `decodeIssueNodeId`, `decodePat`,
 *    `decodeLogin`, `decodeRepoOwner`, `decodeRepoName`) carry no extra
 *    runtime predicate beyond `Schema.String`, so they cannot fail on a
 *    `string` input. Safe to call on the hot path (DOM extraction, message
 *    receipt) without try/catch.
 *
 * 2. Integer-branded helpers (`decodeIssueNumber`, `decodeIssueDatabaseId`)
 *    DO validate at runtime — `Schema.decodeSync` checks `Schema.Int` — and
 *    will THROW `ParseError` on a non-integer input (e.g. `NaN`, `1.5`).
 *    Either supply already-validated integers or wrap the call in a
 *    try/catch.
 */
export const decodeProjectId: (raw: string) => ProjectId = Schema.decodeSync(ProjectId)
export const decodeProjectItemId: (raw: string) => ProjectItemId = Schema.decodeSync(ProjectItemId)
export const decodeProjectItemDomId: (raw: string) => ProjectItemDomId =
  Schema.decodeSync(ProjectItemDomId)
export const decodeIssueNodeId: (raw: string) => IssueNodeId = Schema.decodeSync(IssueNodeId)
export const decodeIssueNumber: (raw: number) => IssueNumber = Schema.decodeSync(IssueNumber)
export const decodeIssueDatabaseId: (raw: number) => IssueDatabaseId =
  Schema.decodeSync(IssueDatabaseId)
export const decodePat: (raw: string) => Pat = Schema.decodeSync(Pat)
export const decodeLogin: (raw: string) => Login = Schema.decodeSync(Login)
export const decodeRepoOwner: (raw: string) => RepoOwner = Schema.decodeSync(RepoOwner)
export const decodeRepoName: (raw: string) => RepoName = Schema.decodeSync(RepoName)
