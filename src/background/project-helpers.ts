// project field/item resolution helpers (GraphQL).

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

/** The two DOM spellings of an issue reference: `issue:123` and `issue-123`. */
export function parseIssueDatabaseId(domId: string): number | null {
  const match = domId.match(/^issue[:-](\d+)$/)
  return match ? parseInt(match[1], 10) : null
}

/** Index DOM ids by the database id they carry, warning on anything unparseable. */
function indexByDatabaseId(domIds: readonly string[]): Map<number, string> {
  const databaseIdMap = new Map<number, string>()
  for (const domId of domIds) {
    const databaseId = parseIssueDatabaseId(domId)
    if (databaseId === null) {
      logger.warn('[rgp:bg] could not parse DOM ID:', domId)
      continue
    }
    databaseIdMap.set(databaseId, domId)
  }
  return databaseIdMap
}

/** One page of a project's `items` connection, whatever `content` was selected. */
interface ItemsPage<TContent> {
  node: {
    items: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null }
      nodes: { id: string; content: TContent | null }[]
    }
  } | null
}

/**
 * Walk a project's items until every wanted database id is matched or the pages
 * run out, handing each match to `collect`. Paging sleeps 1s between requests
 * for rate-limit safety.
 */
async function collectMatchingItems<TContent extends { databaseId: number }, TOut>(
  query: string,
  projectId: string,
  wanted: Map<number, string>,
  collect: (item: { id: string; content: TContent }, domId: string) => TOut,
  tabId?: number,
): Promise<TOut[]> {
  const results: TOut[] = []
  const remaining = new Set(wanted.keys())
  let cursor: string | null = null

  while (remaining.size > 0) {
    const page: ItemsPage<TContent> = await withRateLimitRetry(
      () => gql<ItemsPage<TContent>>(query, { projectId, cursor }),
      tabId,
    )

    const items = page.node?.items
    if (!items) {
      logger.warn('[rgp:bg] project node returned null items')
      break
    }

    for (const item of items.nodes) {
      const databaseId = item.content?.databaseId
      if (databaseId === undefined || !remaining.has(databaseId)) continue
      results.push(collect({ id: item.id, content: item.content! }, wanted.get(databaseId)!))
      remaining.delete(databaseId)
    }

    if (!items.pageInfo.hasNextPage || remaining.size === 0) break
    cursor = items.pageInfo.endCursor
    await sleep(1000)
  }

  if (remaining.size > 0) {
    logger.warn('[rgp:bg] could not resolve these database IDs:', [...remaining])
  }

  return results
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
  const databaseIdMap = indexByDatabaseId(domIds)
  if (databaseIdMap.size === 0) return []

  logger.log('[rgp:bg] resolving database IDs:', [...databaseIdMap.keys()])

  interface ResolutionContent {
    __typename?: string
    id: string
    databaseId: number
    number?: number
    parent?: {
      id: string
      databaseId: number
      number: number
      title: string
      repository: { owner: { login: string }; name: string }
    } | null
    repository?: { owner: { login: string }; name: string }
  }

  return collectMatchingItems<ResolutionContent, ResolvedItem>(
    GET_PROJECT_ITEMS_FOR_RESOLUTION,
    projectId,
    databaseIdMap,
    ({ id, content }, domId) => {
      logger.log('[rgp:bg] resolved', domId, '->', id, 'issueNodeId:', content.id)
      return {
        domId: decodeProjectItemDomId(domId),
        issueNodeId: decodeIssueNodeId(content.id),
        projectItemId: decodeProjectItemId(id),
        repoOwner: decodeRepoOwner(content.repository?.owner?.login || ''),
        repoName: decodeRepoName(content.repository?.name || ''),
        issueDatabaseId: decodeIssueDatabaseId(content.databaseId),
        issueNumber: content.number !== undefined ? decodeIssueNumber(content.number) : undefined,
        currentParent: content.parent
          ? {
              nodeId: content.parent.id,
              databaseId: content.parent.databaseId,
              number: content.parent.number,
              title: content.parent.title,
              repoOwner: content.parent.repository.owner.login,
              repoName: content.parent.repository.name,
            }
          : undefined,
        typename: content.__typename as 'Issue' | 'PullRequest' | undefined,
      }
    },
    tabId,
  )
}

export async function getRepositoryId(owner: string, name: string): Promise<string> {
  const data = await gql<{ repository: { id: string } }>(GET_REPOSITORY_ID, { owner, name })
  return data.repository.id
}

export async function resolveProjectItemIdsWithTitles(
  domIds: string[],
  projectId: string,
): Promise<ResolvedItemWithTitle[]> {
  const databaseIdMap = indexByDatabaseId(domIds)
  if (databaseIdMap.size === 0) return []

  interface RenameContent {
    __typename: string
    id: string
    databaseId: number
    title: string
    repository?: { owner: { login: string }; name: string }
  }

  return collectMatchingItems<RenameContent, ResolvedItemWithTitle>(
    GET_PROJECT_ITEMS_FOR_RENAME,
    projectId,
    databaseIdMap,
    ({ id, content }, domId) => ({
      domId: decodeProjectItemDomId(domId),
      issueNodeId: decodeIssueNodeId(content.id),
      projectItemId: decodeProjectItemId(id),
      repoOwner: decodeRepoOwner(content.repository?.owner?.login || ''),
      repoName: decodeRepoName(content.repository?.name || ''),
      title: content.title,
      typename: content.__typename === 'PullRequest' ? 'PullRequest' : 'Issue',
    }),
  )
}
