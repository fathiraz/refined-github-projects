// shared relationship helpers used by background, features, and ui layers.

import type { IssueRelationshipData } from '@/lib/messages'

interface RelationshipLike {
  databaseId?: number
  repoOwner: string
  repoName: string
  number: number
}

export function relationshipKey(issue: RelationshipLike): string {
  return issue.databaseId
    ? `db:${issue.databaseId}`
    : `${issue.repoOwner}/${issue.repoName}#${issue.number}`
}

export function formatIssueReference(issue: RelationshipLike): string {
  return `${issue.repoOwner}/${issue.repoName}#${issue.number}`
}

/** The `parent` selection shared by the item-details GraphQL queries. */
interface ParentIssueNode {
  id: string
  databaseId: number
  number: number
  title: string
  repository: { owner: { login: string }; name: string }
}

/** Flatten a GraphQL parent selection into the wire shape the UI consumes. */
export function toIssueRelationship(
  parent: ParentIssueNode | undefined,
): IssueRelationshipData | undefined {
  if (!parent) return undefined
  return {
    nodeId: parent.id,
    databaseId: parent.databaseId,
    number: parent.number,
    title: parent.title,
    repoOwner: parent.repository.owner.login,
    repoName: parent.repository.name,
  }
}
