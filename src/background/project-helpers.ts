// Project field/item resolution helpers (GraphQL).

import { gql } from '@/lib/graphql-client'
import {
  GET_PROJECT_FIELDS,
  GET_PROJECT_ITEMS_FOR_RESOLUTION,
  GET_PROJECT_ITEMS_FOR_RENAME,
  GET_REPOSITORY_ID,
} from '@/lib/graphql-queries'
import { sleep } from '@/lib/queue'
import { logger } from '@/lib/debug-logger'
import {
  decodeIssueDatabaseId,
  decodeIssueNodeId,
  decodeIssueNumber,
  decodeProjectItemDomId,
  decodeProjectItemId,
  decodeRepoName,
  decodeRepoOwner,
} from '@/lib/schemas-decode'

import type {
  FieldsResultProject,
  ResolvedItem,
  ResolvedItemWithTitle,
  FieldValue,
} from '@/background/types'

import { fieldsCache, FIELDS_CACHE_TTL_MS, pruneExpiredCache } from '@/background/cache'
import { withRateLimitRetry } from '@/background/rest-helpers'

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

export function buildFieldValueFromSource(fieldValue: FieldValue): Record<string, unknown> | null {
  if ('text' in fieldValue) return { text: fieldValue.text }
  if ('optionId' in fieldValue) return { singleSelectOptionId: fieldValue.optionId }
  if ('iterationId' in fieldValue) return { iterationId: fieldValue.iterationId }
  if ('number' in fieldValue) return { number: fieldValue.number }
  if ('date' in fieldValue) return { date: fieldValue.date }
  return null
}

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
  // parse DOM IDs to extract database IDs
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

  // fetch project items with pagination, matching content databaseId
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

  // paginate through project items until we find all matches or run out
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
          domId: decodeProjectItemDomId(domId),
          issueNodeId: decodeIssueNodeId(item.content.id),
          projectItemId: decodeProjectItemId(item.id),
          repoOwner: decodeRepoOwner(item.content.repository?.owner?.login || ''),
          repoName: decodeRepoName(item.content.repository?.name || ''),
          issueDatabaseId: decodeIssueDatabaseId(item.content.databaseId),
          issueNumber:
            item.content.number !== undefined ? decodeIssueNumber(item.content.number) : undefined,
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
    await sleep(1000) // rate limit safety between pages
  }

  if (remaining.size > 0) {
    logger.warn('[rgp:bg] could not resolve these database IDs:', [...remaining])
  }

  return results
}

export async function getRepositoryId(owner: string, name: string): Promise<string> {
  const data = await gql<{ repository: { id: string } }>(GET_REPOSITORY_ID, { owner, name })
  return data.repository.id
}

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
          domId: decodeProjectItemDomId(domId),
          issueNodeId: decodeIssueNodeId(item.content.id),
          projectItemId: decodeProjectItemId(item.id),
          repoOwner: decodeRepoOwner(item.content.repository?.owner?.login || ''),
          repoName: decodeRepoName(item.content.repository?.name || ''),
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
