// Relationship parsing, REST listing, and bulk relationship task building.

import { sleep } from '@/lib/queue'
import type { QueueTask } from '@/lib/queue'
import { logger } from '@/lib/debug-logger'
import { GithubClientError } from '@/lib/errors'
import type {
  BulkEditRelationshipsUpdate,
  IssueRelationshipData,
  IssueSearchResultData,
  SubIssueData,
} from '@/lib/messages'

import type {
  ResolvedItem,
  RestIssuePayload,
  RestIssueDependencyEntry,
  RestIssueDependencyResponse,
  RestSubIssue,
  RelationshipSearchIssueNode,
} from '@/background/types'

import {
  githubRest,
  parseRepoFromUrl,
  withRateLimitRetry,
} from '@/background/rest-helpers'
import {
  formatIssueReference,
  relationshipKey,
} from '@/lib/relationship-utils'

export { relationshipKey } from '@/lib/relationship-utils'

export function parseExactIssueReference(
  query: string,
  fallbackOwner?: string,
  fallbackRepoName?: string,
): { owner: string; repoName: string; number: number } | null {
  const explicitMatch = query.match(/^([^/\s]+)\/([^#\s]+)#(\d+)$/)
  if (explicitMatch) {
    return {
      owner: explicitMatch[1],
      repoName: explicitMatch[2],
      number: parseInt(explicitMatch[3], 10),
    }
  }

  const localMatch = query.match(/^#?(\d+)$/)
  if (localMatch && fallbackOwner && fallbackRepoName) {
    return {
      owner: fallbackOwner,
      repoName: fallbackRepoName,
      number: parseInt(localMatch[1], 10),
    }
  }

  return null
}

export function buildRelationshipSearchQuery(
  query: string,
  fallbackOwner?: string,
  fallbackRepoName?: string,
): string {
  const repoScope =
    fallbackOwner && fallbackRepoName && !/\brepo:[^\s]+/.test(query)
      ? `repo:${fallbackOwner}/${fallbackRepoName} `
      : ''

  return `${repoScope}is:issue archived:false sort:updated-desc ${query}`.trim()
}

export function mapIssueNodeToRelationshipSearchResult(
  issue: RelationshipSearchIssueNode,
): IssueSearchResultData {
  return {
    nodeId: issue.id,
    databaseId: issue.databaseId,
    number: issue.number,
    title: issue.title,
    repoOwner: issue.repository.owner.login,
    repoName: issue.repository.name,
    state: issue.state,
  }
}

export function getIssueFromDependencyEntry(
  entry: RestIssueDependencyEntry,
): RestIssuePayload | null {
  return entry.issue ?? entry.blocking_issue ?? entry.blocked_issue ?? entry
}

export function normalizeIssueRelationship(
  entry: RestIssueDependencyEntry,
): IssueRelationshipData | null {
  const issue = getIssueFromDependencyEntry(entry)
  if (!issue || typeof issue.number !== 'number' || typeof issue.title !== 'string') {
    return null
  }

  const fullName = entry.repository?.full_name
  const [fullNameOwner, fullNameRepo] = fullName?.split('/') ?? []
  const repoFromUrl = parseRepoFromUrl(issue.repository_url ?? issue.html_url)
  const repoOwner = fullNameOwner ?? repoFromUrl?.repoOwner
  const repoName = fullNameRepo ?? repoFromUrl?.repoName

  if (!repoOwner || !repoName) {
    return null
  }

  return {
    nodeId: issue.node_id,
    databaseId: issue.id,
    number: issue.number,
    title: issue.title,
    repoOwner,
    repoName,
  }
}

export function getRelationshipEntries(
  response: RestIssueDependencyResponse,
  kind: 'blocked_by' | 'blocking',
): RestIssueDependencyEntry[] {
  if (Array.isArray(response)) {
    return response
  }

  return kind === 'blocking'
    ? (response.blocking_issues ?? response.dependencies ?? [])
    : (response.dependencies ?? [])
}

export async function listIssueRelationships(
  kind: 'blocked_by' | 'blocking',
  owner: string,
  repo: string,
  issueNumber: number,
  tabId?: number,
): Promise<IssueRelationshipData[]> {
  const relationships: IssueRelationshipData[] = []
  const seen = new Set<string>()

  for (let page = 1; page <= 10; page++) {
    const response = await withRateLimitRetry(
      () =>
        githubRest<RestIssueDependencyResponse>(
          `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}/dependencies/${kind}?per_page=100&page=${page}`,
        ),
      tabId,
    )

    const entries = getRelationshipEntries(response, kind)

    for (const entry of entries) {
      const normalized = normalizeIssueRelationship(entry)
      if (!normalized) continue

      const dedupeKey = normalized.databaseId
        ? `db:${normalized.databaseId}`
        : `${normalized.repoOwner}/${normalized.repoName}#${normalized.number}`

      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)
      relationships.push(normalized)
    }

    if (entries.length < 100) {
      break
    }
  }

  return relationships
}

export async function getCurrentParentRelationship(
  owner: string,
  repo: string,
  issueNumber: number,
  tabId?: number,
): Promise<IssueRelationshipData | undefined> {
  try {
    const response = await withRateLimitRetry(
      () =>
        githubRest<RestIssueDependencyEntry>(
          `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}/parent`,
        ),
      tabId,
    )

    return normalizeIssueRelationship(response) ?? undefined
  } catch (error) {
    if (error instanceof GithubClientError && error.status === 404) {
      return undefined
    }

    throw error
  }
}

export async function listIssueRelationshipsSafe(
  kind: 'blocked_by' | 'blocking',
  owner: string,
  repo: string,
  issueNumber: number,
  tabId?: number,
): Promise<IssueRelationshipData[]> {
  try {
    return await listIssueRelationships(kind, owner, repo, issueNumber, tabId)
  } catch (error) {
    logger.warn('[rgp:bg] failed to load issue relationships', {
      kind,
      owner,
      repo,
      issueNumber,
      error,
    })
    return []
  }
}

export async function listSubIssuesSafe(
  owner: string,
  repo: string,
  issueNumber: number,
): Promise<SubIssueData[]> {
  try {
    const items = await withRateLimitRetry(() =>
      githubRest<RestSubIssue[]>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}/sub_issues?per_page=50`,
      ),
    )
    if (!Array.isArray(items)) return []
    return items.map((item) => ({
      number: item.number,
      title: item.title,
      repoOwner: item.repository?.owner?.login ?? owner,
      repoName: item.repository?.name ?? repo,
      state: item.state?.toUpperCase() === 'CLOSED' ? 'CLOSED' : 'OPEN',
    }))
  } catch (error) {
    logger.warn('[rgp:bg] listSubIssuesSafe failed', { owner, repo, issueNumber, error })
    return []
  }
}

export const formatRelationshipLabel = formatIssueReference

export function dedupeRelationships(issues: IssueRelationshipData[]): IssueRelationshipData[] {
  const deduped = new Map<string, IssueRelationshipData>()
  for (const issue of issues) {
    deduped.set(relationshipKey(issue), issue)
  }
  return [...deduped.values()]
}

export function formatResolvedIssueLabel(item: ResolvedItem): string {
  if (item.repoOwner && item.repoName && item.issueNumber) {
    return `${item.repoOwner}/${item.repoName}#${item.issueNumber}`
  }

  if (item.repoOwner && item.repoName) {
    return `${item.repoOwner}/${item.repoName}`
  }

  return item.domId
}

export async function getBulkRelationshipValidationErrors(
  resolvedItems: ResolvedItem[],
  relationships: BulkEditRelationshipsUpdate | undefined,
): Promise<string[]> {
  if (!relationships) return []

  const errors = new Set<string>()
  const blockedByAdd = dedupeRelationships(relationships.blockedBy.add)
  const blockingAdd = dedupeRelationships(relationships.blocking.add)
  const blockedByRemoveKeys = new Set(
    dedupeRelationships(relationships.blockedBy.remove).map(relationshipKey),
  )
  const blockingRemoveKeys = new Set(
    dedupeRelationships(relationships.blocking.remove).map(relationshipKey),
  )
  const blockedByAddKeys = new Set(blockedByAdd.map(relationshipKey))
  const blockingAddKeys = new Set(blockingAdd.map(relationshipKey))
  const needsDependencyValidation = blockedByAdd.length > 0 || blockingAdd.length > 0

  for (const item of resolvedItems) {
    if (item.typename !== 'Issue' || !item.issueDatabaseId || !item.issueNumber) continue

    const itemLabel = formatResolvedIssueLabel(item)
    if (relationships.parent.set?.databaseId === item.issueDatabaseId) {
      errors.add(`${itemLabel} cannot be its own parent.`)
    }

    if (!needsDependencyValidation) continue

    const currentBlockedBy = await listIssueRelationshipsSafe(
      'blocked_by',
      item.repoOwner,
      item.repoName,
      item.issueNumber,
    )
    const currentBlocking = await listIssueRelationshipsSafe(
      'blocking',
      item.repoOwner,
      item.repoName,
      item.issueNumber,
    )
    const effectiveBlockedByKeys = new Set(currentBlockedBy.map(relationshipKey))
    const effectiveBlockingKeys = new Set(currentBlocking.map(relationshipKey))

    if (relationships.blockedBy.clear) {
      effectiveBlockedByKeys.clear()
    } else {
      for (const key of blockedByRemoveKeys) {
        effectiveBlockedByKeys.delete(key)
      }
    }

    if (relationships.blocking.clear) {
      effectiveBlockingKeys.clear()
    } else {
      for (const key of blockingRemoveKeys) {
        effectiveBlockingKeys.delete(key)
      }
    }

    for (const issue of blockedByAdd) {
      const key = relationshipKey(issue)
      if (issue.databaseId === item.issueDatabaseId) {
        errors.add(`${itemLabel} cannot be blocked by itself.`)
        continue
      }

      if (effectiveBlockingKeys.has(key) || blockingAddKeys.has(key)) {
        errors.add(
          `${itemLabel} cannot both block and be blocked by ${formatRelationshipLabel(issue)}.`,
        )
      }
    }

    for (const issue of blockingAdd) {
      const key = relationshipKey(issue)
      if (issue.databaseId === item.issueDatabaseId) {
        errors.add(`${itemLabel} cannot block itself.`)
        continue
      }

      if (effectiveBlockedByKeys.has(key) || blockedByAddKeys.has(key)) {
        errors.add(
          `${itemLabel} cannot both block and be blocked by ${formatRelationshipLabel(issue)}.`,
        )
      }
    }
  }

  return [...errors]
}

export function buildBulkRelationshipTasks(
  item: ResolvedItem,
  relationships: BulkEditRelationshipsUpdate | undefined,
  tabId?: number,
): QueueTask[] {
  if (!relationships || item.typename !== 'Issue' || !item.issueDatabaseId || !item.issueNumber) {
    return []
  }

  const issueDatabaseId = item.issueDatabaseId
  const issueNumber = item.issueNumber
  const tasks: QueueTask[] = []

  const nextParent = relationships.parent.set
  if (
    (nextParent && nextParent.databaseId && nextParent.databaseId !== issueDatabaseId) ||
    relationships.parent.clear
  ) {
    tasks.push({
      id: `bulk-rel-parent-${item.domId}`,
      detail: nextParent
        ? `Parent → ${formatRelationshipLabel(nextParent)}`
        : 'Clear parent relationship',
      run: async () => {
        if (nextParent?.databaseId && nextParent.databaseId !== issueDatabaseId) {
          if (item.currentParent?.databaseId === nextParent.databaseId) {
            return
          }

          await withRateLimitRetry(
            () =>
              githubRest(
                `/repos/${encodeURIComponent(nextParent.repoOwner)}/${encodeURIComponent(nextParent.repoName)}/issues/${nextParent.number}/sub_issues`,
                {
                  method: 'POST',
                  body: JSON.stringify({ sub_issue_id: issueDatabaseId, replace_parent: true }),
                },
              ),
            tabId,
          )
          await sleep(1000)
          return
        }

        if (!relationships.parent.clear) {
          return
        }

        const currentParent =
          item.currentParent ??
          (await getCurrentParentRelationship(item.repoOwner, item.repoName, issueNumber, tabId))

        if (!currentParent) {
          logger.warn('[rgp:bg] parent clear requested but no current parent could be resolved', {
            domId: item.domId,
            repoOwner: item.repoOwner,
            repoName: item.repoName,
            issueNumber,
          })
          return
        }

        try {
          await withRateLimitRetry(
            () =>
              githubRest(
                `/repos/${encodeURIComponent(currentParent.repoOwner)}/${encodeURIComponent(currentParent.repoName)}/issues/${currentParent.number}/sub_issue`,
                {
                  method: 'DELETE',
                  body: JSON.stringify({ sub_issue_id: issueDatabaseId }),
                },
              ),
            tabId,
          )
          await sleep(1000)
        } catch (error) {
          logger.error('[rgp:bg] failed to clear parent relationship', {
            domId: item.domId,
            repoOwner: item.repoOwner,
            repoName: item.repoName,
            issueNumber,
            currentParent,
            error,
          })
          if (!(error instanceof GithubClientError) || error.status !== 404) {
            throw error
          }
        }
      },
    })
  }

  if (
    relationships.blockedBy.clear ||
    relationships.blockedBy.add.length > 0 ||
    relationships.blockedBy.remove.length > 0
  ) {
    tasks.push({
      id: `bulk-rel-blocked-by-${item.domId}`,
      detail: 'Blocked by relationships',
      run: async () => {
        const current = await listIssueRelationshipsSafe(
          'blocked_by',
          item.repoOwner,
          item.repoName,
          issueNumber,
          tabId,
        )
        const currentByKey = new Map(current.map((issue) => [relationshipKey(issue), issue]))

        const removeBlockedBy = async (issue: IssueRelationshipData) => {
          if (!issue.databaseId) return
          await withRateLimitRetry(
            () =>
              githubRest(
                `/repos/${encodeURIComponent(item.repoOwner)}/${encodeURIComponent(item.repoName)}/issues/${issueNumber}/dependencies/blocked_by/${issue.databaseId}`,
                {
                  method: 'DELETE',
                },
              ),
            tabId,
          )
          await sleep(1000)
        }

        if (relationships.blockedBy.clear) {
          for (const issue of current) {
            await removeBlockedBy(issue)
          }
          currentByKey.clear()
        } else {
          for (const issue of dedupeRelationships(relationships.blockedBy.remove)) {
            const existing = currentByKey.get(relationshipKey(issue))
            if (!existing) continue
            await removeBlockedBy(existing)
            currentByKey.delete(relationshipKey(existing))
          }
        }

        for (const issue of dedupeRelationships(relationships.blockedBy.add)) {
          if (!issue.databaseId || issue.databaseId === issueDatabaseId) continue
          const key = relationshipKey(issue)
          if (currentByKey.has(key)) continue

          await withRateLimitRetry(
            () =>
              githubRest(
                `/repos/${encodeURIComponent(item.repoOwner)}/${encodeURIComponent(item.repoName)}/issues/${issueNumber}/dependencies/blocked_by`,
                {
                  method: 'POST',
                  body: JSON.stringify({ issue_id: issue.databaseId }),
                },
              ),
            tabId,
          )
          await sleep(1000)
          currentByKey.set(key, issue)
        }
      },
    })
  }

  if (
    relationships.blocking.clear ||
    relationships.blocking.add.length > 0 ||
    relationships.blocking.remove.length > 0
  ) {
    tasks.push({
      id: `bulk-rel-blocking-${item.domId}`,
      detail: 'Blocking relationships',
      run: async () => {
        const current = await listIssueRelationshipsSafe(
          'blocking',
          item.repoOwner,
          item.repoName,
          issueNumber,
          tabId,
        )
        const currentByKey = new Map(current.map((issue) => [relationshipKey(issue), issue]))

        const removeBlocking = async (issue: IssueRelationshipData) => {
          await withRateLimitRetry(
            () =>
              githubRest(
                `/repos/${encodeURIComponent(issue.repoOwner)}/${encodeURIComponent(issue.repoName)}/issues/${issue.number}/dependencies/blocked_by/${issueDatabaseId}`,
                {
                  method: 'DELETE',
                },
              ),
            tabId,
          )
          await sleep(1000)
        }

        if (relationships.blocking.clear) {
          for (const issue of current) {
            await removeBlocking(issue)
          }
          currentByKey.clear()
        } else {
          for (const issue of dedupeRelationships(relationships.blocking.remove)) {
            const existing = currentByKey.get(relationshipKey(issue))
            if (!existing) continue
            await removeBlocking(existing)
            currentByKey.delete(relationshipKey(existing))
          }
        }

        for (const issue of dedupeRelationships(relationships.blocking.add)) {
          if (!issue.databaseId || issue.databaseId === issueDatabaseId) continue
          const key = relationshipKey(issue)
          if (currentByKey.has(key)) continue

          await withRateLimitRetry(
            () =>
              githubRest(
                `/repos/${encodeURIComponent(issue.repoOwner)}/${encodeURIComponent(issue.repoName)}/issues/${issue.number}/dependencies/blocked_by`,
                {
                  method: 'POST',
                  body: JSON.stringify({ issue_id: issueDatabaseId }),
                },
              ),
            tabId,
          )
          await sleep(1000)
          currentByKey.set(key, issue)
        }
      },
    })
  }

  return tasks
}
