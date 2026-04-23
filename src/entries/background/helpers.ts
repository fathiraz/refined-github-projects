// ─── Shared helpers ───────────────────────────────────────────────────────────

import { gql } from '@/lib/graphql/client'
import {
  GET_PROJECT_FIELDS,
  GET_PROJECT_ITEMS_FOR_RESOLUTION,
  GET_PROJECT_ITEMS_FOR_RENAME,
  GET_REPOSITORY_ID,
} from '@/lib/graphql/queries'
import { sendMessage } from '@/lib/messages'
import type {
  BulkEditRelationshipsUpdate,
  IssueRelationshipData,
  IssueSearchResultData,
  SubIssueData,
} from '@/lib/messages'
import { sleep } from '@/lib/queue'
import type { QueueTask } from '@/lib/queue'
import { patStorage } from '@/lib/storage'
import { logger } from '@/lib/debug-logger'
import { GithubHttpError } from '@/lib/errors'

import type {
  FieldsResultProject,
  ResolvedItem,
  ResolvedItemWithTitle,
  FieldValue,
  RestIssuePayload,
  RestIssueDependencyEntry,
  RestIssueDependencyResponse,
  RestSubIssue,
  RelationshipSearchIssueNode,
} from './types'

import { fieldsCache, FIELDS_CACHE_TTL_MS, pruneExpiredCache } from './cache'

// ─── getProjectFieldsData ────────────────────────────────────────────────────

export async function getProjectFieldsData(
  owner: string,
  number: number,
  isOrg: boolean,
): Promise<{ project: FieldsResultProject | undefined }> {
  const cacheKey = `${owner}/${number}`
  const cached = fieldsCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return { project: cached.data }
  const result = await gql<{
    organization?: { projectV2: FieldsResultProject }
    user?: { projectV2: FieldsResultProject }
  }>(GET_PROJECT_FIELDS, { owner, number, isOrg })
  const project = result.organization?.projectV2 || result.user?.projectV2
  if (project) {
    pruneExpiredCache(fieldsCache)
    fieldsCache.set(cacheKey, { data: project, expiresAt: Date.now() + FIELDS_CACHE_TTL_MS })
  }
  return { project }
}

// ─── relationshipKey ─────────────────────────────────────────────────────────

export function relationshipKey(issue: IssueRelationshipData): string {
  return issue.databaseId
    ? `db:${issue.databaseId}`
    : `${issue.repoOwner}/${issue.repoName}#${issue.number}`
}

// ─── parseExactIssueReference ────────────────────────────────────────────────

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

// ─── buildRelationshipSearchQuery ────────────────────────────────────────────

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

// ─── mapIssueNodeToRelationshipSearchResult ──────────────────────────────────

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

// ─── GitHubRequestError ──────────────────────────────────────────────────────

export { GithubHttpError as GitHubRequestError } from '@/lib/errors'

// ─── parseRepoFromUrl ────────────────────────────────────────────────────────

export function parseRepoFromUrl(url?: string): { repoOwner: string; repoName: string } | null {
  if (!url) return null

  const apiMatch = url.match(/\/repos\/([^/]+)\/([^/]+)$/)
  if (apiMatch) {
    return {
      repoOwner: decodeURIComponent(apiMatch[1]),
      repoName: decodeURIComponent(apiMatch[2]),
    }
  }

  const htmlMatch = url.match(/github\.com\/([^/]+)\/([^/]+)\/issues\/\d+$/)
  if (htmlMatch) {
    return {
      repoOwner: decodeURIComponent(htmlMatch[1]),
      repoName: decodeURIComponent(htmlMatch[2]),
    }
  }

  return null
}

// ─── getIssueFromDependencyEntry ─────────────────────────────────────────────

export function getIssueFromDependencyEntry(
  entry: RestIssueDependencyEntry,
): RestIssuePayload | null {
  return entry.issue ?? entry.blocking_issue ?? entry.blocked_issue ?? entry
}

// ─── normalizeIssueRelationship ──────────────────────────────────────────────

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

// ─── getRelationshipEntries ──────────────────────────────────────────────────

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

// ─── githubRest ──────────────────────────────────────────────────────────────

export async function githubRest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const pat = await patStorage.getValue()
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/vnd.github+json')
  headers.set('Authorization', `Bearer ${pat ?? ''}`)
  headers.set('X-GitHub-Api-Version', '2022-11-28')
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers,
  })

  if (!res.ok) {
    const retryAfter = Number(res.headers.get('Retry-After') ?? 0)
    let message = res.statusText

    try {
      const json = (await res.json()) as { message?: string }
      if (json.message) {
        message = json.message
      }
    } catch {
      // Ignore JSON parse failures and fall back to status text.
    }

    throw new GithubHttpError({ message, status: res.status, retryAfter })
  }

  if (res.status === 204) {
    return undefined as T
  }

  return (await res.json()) as T
}

// ─── listIssueRelationships ──────────────────────────────────────────────────

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

// ─── getCurrentParentRelationship ────────────────────────────────────────────

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
    if (error instanceof GithubHttpError && error.status === 404) {
      return undefined
    }

    throw error
  }
}

// ─── listIssueRelationshipsSafe ──────────────────────────────────────────────

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

// ─── listSubIssuesSafe ──────────────────────────────────────────────────────

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

// ─── buildFieldValueFromSource ───────────────────────────────────────────────

export function buildFieldValueFromSource(fieldValue: FieldValue): Record<string, unknown> | null {
  if ('text' in fieldValue) return { text: fieldValue.text }
  if ('optionId' in fieldValue) return { singleSelectOptionId: fieldValue.optionId }
  if ('iterationId' in fieldValue) return { iterationId: fieldValue.iterationId }
  if ('number' in fieldValue) return { number: fieldValue.number }
  if ('date' in fieldValue) return { date: fieldValue.date }
  return null
}

// ─── formatRelationshipLabel ─────────────────────────────────────────────────

export function formatRelationshipLabel(issue: IssueRelationshipData): string {
  return `${issue.repoOwner}/${issue.repoName}#${issue.number}`
}

// ─── dedupeRelationships ─────────────────────────────────────────────────────

export function dedupeRelationships(issues: IssueRelationshipData[]): IssueRelationshipData[] {
  const deduped = new Map<string, IssueRelationshipData>()
  for (const issue of issues) {
    deduped.set(relationshipKey(issue), issue)
  }
  return [...deduped.values()]
}

// ─── formatResolvedIssueLabel ────────────────────────────────────────────────

export function formatResolvedIssueLabel(item: ResolvedItem): string {
  if (item.repoOwner && item.repoName && item.issueNumber) {
    return `${item.repoOwner}/${item.repoName}#${item.issueNumber}`
  }

  if (item.repoOwner && item.repoName) {
    return `${item.repoOwner}/${item.repoName}`
  }

  return item.domId
}

// ─── getBulkRelationshipValidationErrors ─────────────────────────────────────

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

// ─── buildBulkRelationshipTasks ──────────────────────────────────────────────

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
          if (!(error instanceof GithubHttpError) || error.status !== 404) {
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

// ─── resolveProjectItemIds ───────────────────────────────────────────────────

/**
 * Convert DOM-extracted item IDs (e.g. "issue:3960969873" from data-hovercard-subject-tag,
 * or "issue-123" from link scraping) to real ProjectV2Item Node IDs.
 *
 * Approach: Fetch the project's items with their content databaseId,
 * then match the DOM-extracted database IDs against the results.
 */
export async function resolveProjectItemIds(
  domIds: string[],
  projectId: string,
  tabId?: number,
): Promise<ResolvedItem[]> {
  // Parse DOM IDs to extract database IDs
  const databaseIdMap = new Map<number, string>() // databaseId -> domId
  for (const domId of domIds) {
    const colonMatch = domId.match(/^issue:(\d+)$/)
    if (colonMatch) {
      databaseIdMap.set(parseInt(colonMatch[1], 10), domId)
      continue
    }
    const dashMatch = domId.match(/^issue-(\d+)$/)
    if (dashMatch) {
      databaseIdMap.set(parseInt(dashMatch[1], 10), domId)
      continue
    }
    logger.warn('[rgp:bg] could not parse DOM ID:', domId)
  }

  if (databaseIdMap.size === 0) return []

  logger.log('[rgp:bg] resolving database IDs:', [...databaseIdMap.keys()])

  // Fetch project items with pagination, matching content databaseId
  interface ProjectItemsResult {
    node: {
      items: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null }
        nodes: {
          id: string
          content: {
            __typename?: string
            id: string
            databaseId: number
            number?: number
            parent?: {
              id: string
              databaseId: number
              number: number
              title: string
              repository: {
                owner: { login: string }
                name: string
              }
            } | null
            repository?: { owner: { login: string }; name: string }
          } | null
        }[]
      }
    } | null
  }

  const results: ResolvedItem[] = []
  const remaining = new Set(databaseIdMap.keys())
  let cursor: string | null = null

  // Paginate through project items until we find all matches or run out
  while (remaining.size > 0) {
    const page = await withRateLimitRetry(
      () =>
        gql<ProjectItemsResult>(GET_PROJECT_ITEMS_FOR_RESOLUTION, {
          projectId,
          cursor,
        }),
      tabId,
    )

    const items = page.node?.items
    if (!items) {
      logger.warn('[rgp:bg] project node returned null items')
      break
    }

    for (const item of items.nodes) {
      if (!item.content?.databaseId) continue
      const dbId = item.content.databaseId
      if (remaining.has(dbId)) {
        const domId = databaseIdMap.get(dbId)!
        results.push({
          domId,
          issueNodeId: item.content.id,
          projectItemId: item.id,
          repoOwner: item.content.repository?.owner?.login || '',
          repoName: item.content.repository?.name || '',
          issueDatabaseId: item.content.databaseId,
          issueNumber: item.content.number,
          currentParent: item.content.parent
            ? {
                nodeId: item.content.parent.id,
                databaseId: item.content.parent.databaseId,
                number: item.content.parent.number,
                title: item.content.parent.title,
                repoOwner: item.content.parent.repository.owner.login,
                repoName: item.content.parent.repository.name,
              }
            : undefined,
          typename: (item.content as any).__typename as 'Issue' | 'PullRequest' | undefined,
        })
        remaining.delete(dbId)
        logger.log('[rgp:bg] resolved', domId, '->', item.id, 'issueNodeId:', item.content.id)
      }
    }

    if (!items.pageInfo.hasNextPage || remaining.size === 0) break
    cursor = items.pageInfo.endCursor
    await sleep(1000) // Rate limit safety between pages
  }

  if (remaining.size > 0) {
    logger.warn('[rgp:bg] could not resolve these database IDs:', [...remaining])
  }

  return results
}

// ─── getRepositoryId ─────────────────────────────────────────────────────────

export async function getRepositoryId(owner: string, name: string): Promise<string> {
  const data = await gql<{ repository: { id: string } }>(GET_REPOSITORY_ID, { owner, name })
  return data.repository.id
}

// ─── resolveProjectItemIdsWithTitles ─────────────────────────────────────────

export async function resolveProjectItemIdsWithTitles(
  domIds: string[],
  projectId: string,
): Promise<ResolvedItemWithTitle[]> {
  const databaseIdMap = new Map<number, string>()
  for (const domId of domIds) {
    const colonMatch = domId.match(/^issue:(\d+)$/)
    if (colonMatch) {
      databaseIdMap.set(parseInt(colonMatch[1], 10), domId)
      continue
    }
    const dashMatch = domId.match(/^issue-(\d+)$/)
    if (dashMatch) {
      databaseIdMap.set(parseInt(dashMatch[1], 10), domId)
      continue
    }
    logger.warn('[rgp:bg] could not parse DOM ID:', domId)
  }

  if (databaseIdMap.size === 0) return []

  interface RenameItemsResult {
    node: {
      items: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null }
        nodes: {
          id: string
          content: {
            __typename: string
            id: string
            databaseId: number
            title: string
            repository?: { owner: { login: string }; name: string }
          } | null
        }[]
      }
    } | null
  }

  const results: ResolvedItemWithTitle[] = []
  const remaining = new Set(databaseIdMap.keys())
  let cursor: string | null = null

  while (remaining.size > 0) {
    const page = await withRateLimitRetry(() =>
      gql<RenameItemsResult>(GET_PROJECT_ITEMS_FOR_RENAME, { projectId, cursor }),
    )

    const items = page.node?.items
    if (!items) {
      logger.warn('[rgp:bg] project node returned null items')
      break
    }

    for (const item of items.nodes) {
      if (!item.content?.databaseId) continue
      const dbId = item.content.databaseId
      if (remaining.has(dbId)) {
        const domId = databaseIdMap.get(dbId)!
        results.push({
          domId,
          issueNodeId: item.content.id,
          projectItemId: item.id,
          repoOwner: item.content.repository?.owner?.login || '',
          repoName: item.content.repository?.name || '',
          title: item.content.title,
          typename: item.content.__typename === 'PullRequest' ? 'PullRequest' : 'Issue',
        })
        remaining.delete(dbId)
      }
    }

    if (!items.pageInfo.hasNextPage || remaining.size === 0) break
    cursor = items.pageInfo.endCursor
    await sleep(1000)
  }

  if (remaining.size > 0) {
    logger.warn('[rgp:bg] could not resolve these database IDs for rename:', [...remaining])
  }

  return results
}

// ─── broadcastQueue ──────────────────────────────────────────────────────────

export async function broadcastQueue(
  state: {
    total: number
    completed: number
    paused: boolean
    retryAfter?: number
    status?: string
    detail?: string
    processId?: string
    label?: string
    failedItems?: Array<{ id: string; title: string; error: string }>
    retryContext?: { messageType: string; data: Record<string, unknown> }
  },
  tabId?: number,
) {
  try {
    await sendMessage('queueStateUpdate', state, tabId)
  } catch (err) {
    // Swallow errors - tab may have navigated away while job was running
    logger.warn('[rgp:bg] broadcastQueue failed (tab may be gone):', err)
  }
}

// ─── withRateLimitRetry ──────────────────────────────────────────────────────

export async function withRateLimitRetry<T>(fn: () => Promise<T>, tabId?: number): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      const e = err as { status?: number; retryAfter?: number }
      if (e.status === 403 || e.status === 429) {
        const retryAfter = e.retryAfter ?? 60
        logger.warn('[rgp:bg] rate limited, retrying in', {
          retryAfter,
          attempt: attempt + 1,
          maxAttempts: 3,
        })
        logger.verbose(`⏸ paused ${retryAfter}s — attempt ${attempt + 1}/3`)
        await broadcastQueue({ total: 0, completed: 0, paused: true, retryAfter }, tabId)
        await sleep(retryAfter * 1000)
        await broadcastQueue({ total: 0, completed: 0, paused: false }, tabId)
      } else {
        logger.error('[rgp:bg] task failed permanently', err)
        throw err
      }
    }
  }
  throw lastErr
}
