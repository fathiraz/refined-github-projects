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

/**
 * The two DOM spellings of an issue reference. The SEPARATOR says which number
 * the id carries, and the distinction is load-bearing:
 *
 *   `issue:4140984079` — colon, from `data-hovercard-subject-tag` → databaseId
 *   `issue-58`         — hyphen, scraped from an `/issues/58` href → issue NUMBER
 *
 * Both spellings can name the same issue. Matching a hyphen id's number against
 * a content databaseId therefore never resolves, which is what surfaced as
 * "Item issue-58 not found in project — it may belong to a different project".
 */
export interface IssueRef {
  kind: 'databaseId' | 'number'
  value: number
}

export function parseIssueRef(domId: string): IssueRef | null {
  const match = domId.match(/^issue([:-])(\d+)$/)
  if (!match) return null
  return { kind: match[1] === ':' ? 'databaseId' : 'number', value: parseInt(match[2], 10) }
}

/** What a project item offers to be matched on. */
interface IssueRefKeys {
  databaseId?: number | null
  number?: number | null
}

/**
 * Lookup that resolves EITHER id spelling to the same entry.
 *
 * Items go in indexed twice — once by content databaseId, once by issue number
 * — because the spelling of the id is the only thing saying which of the two a
 * caller supplied. Looking a hyphen id up against databaseIds silently finds
 * either nothing or, worse, an unrelated item that happens to share the number.
 */
export function createIssueRefIndex<T>() {
  const byDatabaseId = new Map<number, T>()
  const byNumber = new Map<number, T>()

  return {
    add(keys: IssueRefKeys, value: T): void {
      if (keys.databaseId != null) byDatabaseId.set(keys.databaseId, value)
      if (keys.number != null) byNumber.set(keys.number, value)
    },
    get(domId: string): T | undefined {
      const ref = parseIssueRef(domId)
      if (!ref) return undefined
      return ref.kind === 'databaseId' ? byDatabaseId.get(ref.value) : byNumber.get(ref.value)
    },
  }
}

/** DOM ids indexed by whichever number they carry, warning on anything unparseable. */
interface WantedIds {
  byDatabaseId: Map<number, string>
  byNumber: Map<number, string>
  size: number
}

function indexByRef(domIds: readonly string[]): WantedIds {
  const byDatabaseId = new Map<number, string>()
  const byNumber = new Map<number, string>()
  for (const domId of domIds) {
    const ref = parseIssueRef(domId)
    if (!ref) {
      logger.warn('[rgp:bg] could not parse DOM ID:', domId)
      continue
    }
    ;(ref.kind === 'databaseId' ? byDatabaseId : byNumber).set(ref.value, domId)
  }
  return { byDatabaseId, byNumber, size: byDatabaseId.size + byNumber.size }
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
 * Walk a project's items until every wanted id is matched or the pages run out,
 * handing each match to `collect`. An item matches on its content databaseId or
 * on its issue number, depending on which spelling the caller supplied — see
 * `parseIssueRef`. Paging sleeps 1s between requests for rate-limit safety.
 */
async function collectMatchingItems<TContent extends { databaseId: number; number?: number }, TOut>(
  query: string,
  projectId: string,
  wanted: WantedIds,
  collect: (item: { id: string; content: TContent }, domId: string) => TOut,
  tabId?: number,
): Promise<TOut[]> {
  const results: TOut[] = []
  const remainingDbIds = new Set(wanted.byDatabaseId.keys())
  const remainingNumbers = new Set(wanted.byNumber.keys())
  const remaining = () => remainingDbIds.size + remainingNumbers.size
  let cursor: string | null = null

  while (remaining() > 0) {
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
      const content = item.content
      if (!content) continue

      // one item can satisfy both spellings when a caller passed each of them
      if (remainingDbIds.has(content.databaseId)) {
        results.push(
          collect({ id: item.id, content }, wanted.byDatabaseId.get(content.databaseId)!),
        )
        remainingDbIds.delete(content.databaseId)
      }
      if (content.number !== undefined && remainingNumbers.has(content.number)) {
        results.push(collect({ id: item.id, content }, wanted.byNumber.get(content.number)!))
        remainingNumbers.delete(content.number)
      }
    }

    if (!items.pageInfo.hasNextPage || remaining() === 0) break
    cursor = items.pageInfo.endCursor
    await sleep(1000)
  }

  if (remaining() > 0) {
    logger.warn('[rgp:bg] could not resolve these ids:', [
      ...[...remainingDbIds].map((id) => `issue:${id}`),
      ...[...remainingNumbers].map((n) => `issue-${n}`),
    ])
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
  const wanted = indexByRef(domIds)
  if (wanted.size === 0) return []

  logger.log('[rgp:bg] resolving ids:', domIds)

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
    wanted,
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
  const wanted = indexByRef(domIds)
  if (wanted.size === 0) return []

  interface RenameContent {
    __typename: string
    id: string
    databaseId: number
    /** Selected so hyphen-spelled ids (`issue-58`) can match — see `parseIssueRef`. */
    number?: number
    title: string
    repository?: { owner: { login: string }; name: string }
  }

  return collectMatchingItems<RenameContent, ResolvedItemWithTitle>(
    GET_PROJECT_ITEMS_FOR_RENAME,
    projectId,
    wanted,
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
