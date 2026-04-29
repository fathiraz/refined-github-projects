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
} from './branded'

/**
 * Synchronous brand-decoders. These are pure type-narrowers — no runtime
 * validation on top of the underlying primitive — so they're safe to call on
 * the hot path (DOM extraction, message receipt, etc).
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
