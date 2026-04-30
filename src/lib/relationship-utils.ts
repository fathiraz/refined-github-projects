// shared relationship helpers used by background, features, and ui layers.

export interface RelationshipLike {
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
