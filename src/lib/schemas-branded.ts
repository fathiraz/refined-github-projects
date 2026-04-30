import { Schema } from 'effect'

/**
 * Branded primitives that distinguish otherwise-identical string/number IDs.
 * Raw values cross into branded types only via `Schema.decode(...)`. This
 * eliminates the historical class of bugs where `domId` and `projectItemId`
 * (both strings) were swapped at call sites.
 */

export const ProjectId = Schema.String.pipe(Schema.brand('ProjectId'))
export type ProjectId = Schema.Schema.Type<typeof ProjectId>

export const ProjectItemId = Schema.String.pipe(Schema.brand('ProjectItemId'))
export type ProjectItemId = Schema.Schema.Type<typeof ProjectItemId>

/** DOM-extracted identifier such as "issue:3960969873". Resolved → ProjectItemId. */
export const ProjectItemDomId = Schema.String.pipe(Schema.brand('ProjectItemDomId'))
export type ProjectItemDomId = Schema.Schema.Type<typeof ProjectItemDomId>

export const IssueNodeId = Schema.String.pipe(Schema.brand('IssueNodeId'))
export type IssueNodeId = Schema.Schema.Type<typeof IssueNodeId>

export const IssueNumber = Schema.Number.pipe(Schema.int(), Schema.brand('IssueNumber'))
export type IssueNumber = Schema.Schema.Type<typeof IssueNumber>

export const IssueDatabaseId = Schema.Number.pipe(Schema.int(), Schema.brand('IssueDatabaseId'))
export type IssueDatabaseId = Schema.Schema.Type<typeof IssueDatabaseId>

export const Pat = Schema.String.pipe(Schema.brand('Pat'))
export type Pat = Schema.Schema.Type<typeof Pat>

export const Login = Schema.String.pipe(Schema.brand('Login'))
export type Login = Schema.Schema.Type<typeof Login>

export const RepoOwner = Schema.String.pipe(Schema.brand('RepoOwner'))
export type RepoOwner = Schema.Schema.Type<typeof RepoOwner>

export const RepoName = Schema.String.pipe(Schema.brand('RepoName'))
export type RepoName = Schema.Schema.Type<typeof RepoName>
