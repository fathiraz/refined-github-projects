import { onMessage, sendMessage, type BulkEditRelationshipsUpdate, type BulkRelationshipValidationResult, type DuplicateItemPlan, type HierarchyData, type IssueRelationshipData, type IssueSearchResultData, type ItemPreviewData, type SubIssueData } from '../../lib/messages'
import { logger, initDebugLogger } from '../../lib/debug-logger'
import { gql } from '../../lib/graphql/client'
import { GET_PROJECT_ITEM_DETAILS, GET_PROJECT_FIELDS, GET_PROJECT_ITEMS_FOR_RESOLUTION, GET_REPOSITORY_ID, GET_REPOSITORY_ISSUE_BY_NUMBER, GET_REPOSITORY_RECENT_OPEN_ISSUES, SEARCH_RELATIONSHIP_ISSUES } from '../../lib/graphql/queries'
import {
  CLONE_ISSUE,
  ATTACH_TO_PROJECT,
  UPDATE_PROJECT_FIELD,
  ADD_SUB_ISSUE,
  ADD_ASSIGNEES,
  ADD_LABELS,
  UPDATE_ISSUE_MILESTONE,
  UPDATE_ISSUE_TYPE,
  CLOSE_ISSUE,
  REOPEN_ISSUE,
  TRANSFER_ISSUE,
  LOCK_ISSUE,
  PIN_ISSUE,
  UNPIN_ISSUE,
  DELETE_PROJECT_ITEM,
  UPDATE_ISSUE_TITLE,
  UPDATE_PR_TITLE,
  UPDATE_ISSUE_BODY,
  UPDATE_PR_BODY,
  ADD_COMMENT,
} from '../../lib/graphql/mutations'
import { VALIDATE_TOKEN, GET_REPO_ASSIGNEES, GET_REPO_LABELS, GET_REPO_MILESTONES, GET_REPO_ISSUE_TYPES, SEARCH_OWNER_REPOS, GET_VIEWER_TOP_REPOS, GET_VIEWER_REPOS_PAGE, GET_POSSIBLE_TRANSFER_REPOS, GET_PROJECT_ITEMS_FOR_RENAME, GET_PROJECT_ITEMS_FOR_REORDER, UPDATE_PROJECT_ITEM_POSITION } from '../../lib/graphql/queries'
import { processQueue, cancelQueue, sleep } from '../../lib/queue'
import { patStorage, usernameStorage, allSprintSettingsStorage } from '../../lib/storage'
import { GET_PROJECT_ITEMS_WITH_FIELDS } from '../../lib/graphql/queries'
import { todayUtc, isActive, nearestUpcoming, nextAfter, iterationEndDate } from '../../lib/sprint-utils'
import type { SprintInfo } from '../../lib/messages'

// ─── Concurrency guards ───────────────────────────────────────────────────────
let activeDuplicateCount = 0
const MAX_CONCURRENT_DUPLICATES = 3

let activeBulkCount = 0
const MAX_CONCURRENT_BULK = 3

let activeSprintEndCount = 0
const MAX_CONCURRENT_SPRINT_END = 1

const RESOLVED_ITEM_CACHE_TTL_MS = 15_000
const resolvedItemCache = new Map<string, { resolvedItems: ResolvedItem[]; expiresAt: number }>()

const HIERARCHY_CACHE_TTL_MS = 30_000
const hierarchyCache = new Map<string, { data: HierarchyData; expiresAt: number }>()

const PREVIEW_CACHE_TTL_MS = 30_000
const previewCache = new Map<string, { data: ItemPreviewData; expiresAt: number }>()

const FIELDS_CACHE_TTL_MS = 60_000
const fieldsCache = new Map<string, { data: FieldsResultProject; expiresAt: number }>()

// ─── Types for Issue Types query ───────────────────────────────────────────────
interface IssueTypeNode {
  id: string
  name: string
  isEnabled: boolean
  description: string | null
  color: string | null
}
interface IssueTypesResult {
  repository: {
    issueTypes: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null }
      edges: { node: IssueTypeNode }[]
    }
  } | null
}

interface RelationshipSearchIssueNode {
  id: string
  databaseId: number
  number: number
  title: string
  state: 'OPEN' | 'CLOSED'
  repository: {
    owner: { login: string }
    name: string
  }
}

interface RelationshipSearchResult {
  repository?: {
    issue?: RelationshipSearchIssueNode | null
    issues?: {
      nodes: RelationshipSearchIssueNode[]
    }
  } | null
  search?: {
    nodes: Array<RelationshipSearchIssueNode | null>
  }
}

function pruneExpiredCache<T>(cache: Map<string, { data: T; expiresAt: number }>): void {
  const now = Date.now()
  for (const [key, entry] of cache.entries()) {
    if (entry.expiresAt <= now) cache.delete(key)
  }
}

function createResolvedItemCacheKey(projectId: string, itemIds: string[]): string {
  return `${projectId}::${[...new Set(itemIds)].sort().join('|')}`
}

function pruneResolvedItemCache(now = Date.now()): void {
  for (const [key, entry] of resolvedItemCache.entries()) {
    if (entry.expiresAt <= now) {
      resolvedItemCache.delete(key)
    }
  }
}

function cacheResolvedItems(projectId: string, itemIds: string[], resolvedItems: ResolvedItem[]): void {
  pruneResolvedItemCache()
  resolvedItemCache.set(createResolvedItemCacheKey(projectId, itemIds), {
    resolvedItems,
    expiresAt: Date.now() + RESOLVED_ITEM_CACHE_TTL_MS,
  })
}

function takeCachedResolvedItems(projectId: string, itemIds: string[]): ResolvedItem[] | undefined {
  pruneResolvedItemCache()

  const key = createResolvedItemCacheKey(projectId, itemIds)
  const entry = resolvedItemCache.get(key)
  if (!entry) {
    return undefined
  }

  resolvedItemCache.delete(key)
  return entry.resolvedItems
}

export default defineBackground(() => {
  initDebugLogger()

  // Open options on install
  browser.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
      browser.runtime.openOptionsPage()
    }
  })

  onMessage('openOptions', () => {
    browser.runtime.openOptionsPage()
  })

  onMessage('getPatStatus', async () => {
    const pat = await patStorage.getValue()
    return { hasPat: Boolean(pat?.trim()) }
  })

  onMessage('validatePat', async ({ data }) => {
    try {
      const res = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${data.token}`,
          'Content-Type': 'application/json',
          'GitHub-Feature-Request': 'ProjectV2',
        },
        body: JSON.stringify({ query: VALIDATE_TOKEN, variables: {} }),
      })

      if (!res.ok) return { valid: false }

      const json = await res.json()
      if (json.errors?.length) return { valid: false }

      const login = json.data?.viewer?.login
      if (login) {
        await usernameStorage.setValue(login)
      }
      return { valid: true, user: login }
    } catch {
      return { valid: false }
    }
  })

  onMessage('cancelProcess', ({ data }) => {
    cancelQueue(data.processId)
  })

  onMessage('searchRepoMetadata', async ({ data }) => {
    logger.log('[rgp:bg] searchRepoMetadata received', data)
    try {
      if (data.type === 'ASSIGNEES') {
        const result = await gql<{ repository: { assignableUsers: { nodes: { id: string, login: string, name: string, avatarUrl: string }[] } } }>(GET_REPO_ASSIGNEES, { owner: data.owner, name: data.name, q: data.q })
        const raw = result.repository?.assignableUsers?.nodes || []
        return raw.map(u => ({ id: u.id, name: u.login, avatarUrl: u.avatarUrl, color: '' }))
      } else if (data.type === 'LABELS') {
        const result = await gql<{ repository: { labels: { nodes: { id: string, name: string, color: string }[] } } }>(GET_REPO_LABELS, { owner: data.owner, name: data.name, q: data.q })
        const raw = result.repository?.labels?.nodes || []
        return raw.map(l => ({ id: l.id, name: l.name, color: '#' + l.color }))
      } else if (data.type === 'MILESTONES') {
        const result = await gql<{ repository: { milestones: { nodes: { id: string, title: string, number: number }[] } } }>(GET_REPO_MILESTONES, { owner: data.owner, name: data.name, q: data.q || undefined })
        const raw = result.repository?.milestones?.nodes || []
        return raw.map(m => ({ id: m.id, name: m.title, color: '' }))
      } else if (data.type === 'ISSUE_TYPES') {
        // Fetch all repository issue types with pagination
        const allTypes: IssueTypeNode[] = []
        let cursor: string | null = null
        let hasMore = true

        while (hasMore) {
          const pageResult: IssueTypesResult = await gql(GET_REPO_ISSUE_TYPES, {
            owner: data.owner,
            name: data.name,
            cursor,
          })

          const pageInfo = pageResult.repository?.issueTypes
          if (!pageInfo) break

          allTypes.push(...pageInfo.edges.map((e: { node: IssueTypeNode }) => e.node))
          hasMore = pageInfo.pageInfo.hasNextPage
          cursor = pageInfo.pageInfo.endCursor

          if (hasMore) {
            await sleep(500) // Rate limit safety between pages
          }
        }

        // Only exclude explicitly disabled types
        let raw = allTypes.filter(t => t.isEnabled !== false)

        // Client-side filtering since GitHub API doesn't support search for issue types
        if (data.q) {
          const q = data.q.toLowerCase()
          raw = raw.filter(t => t.name.toLowerCase().includes(q))
        }

        raw = raw.sort((a, b) => a.name.localeCompare(b.name))

        return raw.map(t => ({
          id: t.id,
          name: t.name,
          color: t.color || '',
          description: t.description || '',
        }))
      }
      return []
    } catch (e) {
      console.error('[rgp:bg] searchRepoMetadata failed', e)
      return []
    }
  })

  onMessage('searchRelationshipIssues', async ({ data }) => {
    try {
      const trimmedQuery = data.q.trim()

      if (trimmedQuery === '') {
        if (!data.owner || !data.repoName) return []
        const result = await withRateLimitRetry(
          () => gql<RelationshipSearchResult>(GET_REPOSITORY_RECENT_OPEN_ISSUES, {
            owner: data.owner,
            name: data.repoName,
            first: 5,
          }),
        )

        return dedupeRelationships(
          (result.repository?.issues?.nodes ?? [])
            .filter(Boolean)
            .map(mapIssueNodeToRelationshipSearchResult),
        )
      }

      const exactReference = parseExactIssueReference(trimmedQuery, data.owner, data.repoName)
      if (exactReference) {
        const exactResult = await withRateLimitRetry(
          () => gql<RelationshipSearchResult>(GET_REPOSITORY_ISSUE_BY_NUMBER, {
            owner: exactReference.owner,
            name: exactReference.repoName,
            number: exactReference.number,
          }, { silent: true }),
        )

        const exactIssue = exactResult.repository?.issue
        if (exactIssue) {
          return [mapIssueNodeToRelationshipSearchResult(exactIssue)]
        }
      }

      const result = await withRateLimitRetry(
        () => gql<RelationshipSearchResult>(SEARCH_RELATIONSHIP_ISSUES, {
          query: buildRelationshipSearchQuery(trimmedQuery, data.owner, data.repoName),
          first: 20,
        }),
      )

      return dedupeRelationships(
        (result.search?.nodes ?? [])
          .filter((node): node is RelationshipSearchIssueNode => Boolean(node))
          .map(mapIssueNodeToRelationshipSearchResult),
      )
    } catch (error) {
      console.error('[rgp:bg] searchRelationshipIssues failed', error)
      return []
    }
  })

  onMessage('validateBulkRelationshipUpdates', async ({ data }) => {
    const resolvedItems = await resolveProjectItemIds(data.itemIds, data.projectId)
    cacheResolvedItems(data.projectId, data.itemIds, resolvedItems)
    const errors = await getBulkRelationshipValidationErrors(resolvedItems, data.relationships)

    const result: BulkRelationshipValidationResult = { errors }
    return result
  })

  onMessage('searchTransferTargets', async ({ data }) => {
    type RepoNode = { id: string; name: string; nameWithOwner: string; isPrivate: boolean; description: string | null; hasIssuesEnabled: boolean; isArchived: boolean }
    type ViewerReposPage = {
      viewer: {
        repositories: {
          pageInfo: { hasNextPage: boolean; endCursor: string | null }
          nodes: RepoNode[]
        }
      }
    }
    const trimmedQuery = data.q.trim().toLowerCase()
    const isTransferEligible = (repo: RepoNode) => !repo.isArchived && repo.hasIssuesEnabled
    const matchesQuery = (repo: RepoNode) =>
      trimmedQuery === '' || repo.name.toLowerCase().includes(trimmedQuery) || repo.nameWithOwner.toLowerCase().includes(trimmedQuery)

    if (data.firstItemId && data.projectId) {
      try {
        const resolved = await resolveProjectItemIds([data.firstItemId], data.projectId)
        const issueNodeId = resolved[0]?.issueNodeId
        if (issueNodeId) {
          const result = await gql<{ node: { possibleTransferRepositoriesForViewer?: { edges: { node: RepoNode }[] } } }>(
            GET_POSSIBLE_TRANSFER_REPOS, { issueId: issueNodeId, first: 100 }, { silent: true }
          )
          let nodes = result.node?.possibleTransferRepositoriesForViewer?.edges.map(e => e.node) ?? []
          nodes = nodes.filter(r => isTransferEligible(r) && matchesQuery(r))
          return nodes
        }
      } catch (e) {
        console.warn('[rgp:bg] possibleTransferRepositoriesForViewer failed, falling back', e)
      }
    }

    let nodes: RepoNode[]
    if (trimmedQuery === '') {
      const result = await gql<{ viewer: { topRepositories: { nodes: RepoNode[] } } }>(
        GET_VIEWER_TOP_REPOS, { first: 5 }
      )
      nodes = result.viewer?.topRepositories.nodes ?? []
    } else {
      const matches: RepoNode[] = []
      const seenRepoIds = new Set<string>()
      let cursor: string | null = null
      let hasNextPage = true

      while (hasNextPage && matches.length < 20) {
        const result: ViewerReposPage = await gql<ViewerReposPage>(
          GET_VIEWER_REPOS_PAGE, { first: 100, after: cursor }
        )
        const repositories: ViewerReposPage['viewer']['repositories'] | undefined = result.viewer?.repositories
        const pageNodes = repositories?.nodes ?? []

        for (const repo of pageNodes) {
          if (seenRepoIds.has(repo.id)) continue
          seenRepoIds.add(repo.id)
          if (!isTransferEligible(repo) || !matchesQuery(repo)) continue
          matches.push(repo)
          if (matches.length >= 20) break
        }

        hasNextPage = repositories?.pageInfo.hasNextPage ?? false
        cursor = repositories?.pageInfo.endCursor ?? null
      }

      nodes = matches
    }
    return nodes.filter(isTransferEligible)
  })

  onMessage('duplicateItem', async ({ data, sender }) => {
    logger.log('[rgp:bg] duplicateItem received', { itemId: data.itemId, projectId: data.projectId })
    const tabId = sender.tab?.id
    await runDeepDuplicate(data.itemId, data.projectId, tabId, data.plan)
  })

  onMessage('getItemPreview', async ({ data }) => {
    logger.log('[rgp:bg] getItemPreview received', data)

    // Check preview cache first
    const cacheKey = `${data.owner}/${data.number}/${data.itemId}`
    const previewCached = previewCache.get(cacheKey)
    if (previewCached && previewCached.expiresAt > Date.now()) return previewCached.data

    // 1. Fetch project field definitions first — also gives us the real projectV2.id
    const { project: projectV2 } = await getProjectFieldsData(data.owner, data.number, data.isOrg)
    const fieldDefs = new Map(
      (projectV2?.fields.nodes ?? []).filter(Boolean).map(f => [f.id, f])
    )

    // 2. Resolve DOM itemId (e.g. "issue:3960969873") → real ProjectV2Item node ID
    let resolvedItemId = data.itemId
    if (/^issue[:-]\d+$/.test(data.itemId)) {
      if (!projectV2?.id) throw new Error('Could not fetch project fields — cannot resolve item ID')
      const resolved = await resolveProjectItemIds([data.itemId], projectV2.id)
      if (resolved.length === 0) throw new Error(`Item ${data.itemId} not found in project — it may belong to a different project`)
      resolvedItemId = resolved[0].projectItemId
    }

    // 3. Fetch item details with the correct node ID
    const details = await withRateLimitRetry(
      () => gql<ProjectItemDetails>(GET_PROJECT_ITEM_DETAILS, { itemId: resolvedItemId }),
    )
    const source = details.node
    if (!source) throw new Error('Project item not found — ID resolution may have failed')
    const issue = source.content
    if (!issue?.title) throw new Error('Item is not a supported type (must be a GitHub Issue)')
    const blockedBy = await listIssueRelationshipsSafe(
      'blocked_by',
      issue.repository.owner.login,
      issue.repository.name,
      issue.number,
    )
    const blocking = await listIssueRelationshipsSafe(
      'blocking',
      issue.repository.owner.login,
      issue.repository.name,
      issue.number,
    )

    // 4. Correlate field values with definitions
    const fields: ItemPreviewData['fields'] = []
    for (const fv of source.fieldValues.nodes.filter(Boolean)) {
      if (!fv.field) continue   // skips unrecognized field types (Number, Date, Milestone, etc.)
      const def = fieldDefs.get(fv.field.id)
      if (!def) continue
      const SUPPORTED_TYPES = ['TEXT', 'SINGLE_SELECT', 'ITERATION', 'NUMBER', 'DATE']
      if (!SUPPORTED_TYPES.includes(def.dataType)) continue

      const entry: ItemPreviewData['fields'][number] = {
        fieldId: def.id,
        fieldName: def.name,
        dataType: def.dataType as 'TEXT' | 'SINGLE_SELECT' | 'ITERATION' | 'NUMBER' | 'DATE',
      }

      if (def.dataType === 'TEXT' && 'text' in fv) {
        entry.text = fv.text
      } else if (def.dataType === 'SINGLE_SELECT' && 'optionId' in fv) {
        entry.optionId = fv.optionId
        const opt = def.options?.find(o => o.id === fv.optionId)
        if (opt) { entry.optionName = opt.name; entry.optionColor = opt.color }
        entry.options = def.options
      } else if (def.dataType === 'ITERATION' && 'iterationId' in fv) {
        entry.iterationId = fv.iterationId
        const iter = def.configuration?.iterations.find(i => i.id === fv.iterationId)
        if (iter) { entry.iterationTitle = iter.title; entry.iterationStartDate = iter.startDate }
        entry.iterations = def.configuration?.iterations
      } else if (def.dataType === 'NUMBER' && 'number' in fv) {
        entry.number = (fv as NumberFieldValue).number
      } else if (def.dataType === 'DATE' && 'date' in fv) {
        entry.date = (fv as DateFieldValue).date
      }

      fields.push(entry)
    }

    // Also include fields that have no current value but have a definition (optional — skip for now,
    // only include fields with existing values so the modal shows what would be copied)

    const parentRelationship = issue.parent
      ? {
          nodeId: issue.parent.id,
          databaseId: issue.parent.databaseId,
          number: issue.parent.number,
          title: issue.parent.title,
          repoOwner: issue.parent.repository.owner.login,
          repoName: issue.parent.repository.name,
        }
      : undefined

    const response: ItemPreviewData = {
      resolvedItemId,
      issueNumber: issue.number,
      title: issue.title,
      body: issue.body,
      repoOwner: issue.repository.owner.login,
      repoName: issue.repository.name,
      projectId: source.project.id,
      assignees: issue.assignees.nodes.map(a => ({ id: a.id, login: a.login, avatarUrl: a.avatarUrl })),
      labels: issue.labels.nodes.map(l => ({ id: l.id, name: l.name, color: '#' + l.color })),
      fields,
      issueTypeId: issue.issueType?.id,
      issueTypeName: issue.issueType?.name,
      relationships: {
        parent: parentRelationship,
        blockedBy,
        blocking,
      },
    }

    pruneExpiredCache(previewCache)
    previewCache.set(cacheKey, { data: response, expiresAt: Date.now() + PREVIEW_CACHE_TTL_MS })
    logger.log('[rgp:bg] getItemPreview returning', {
      fieldsCount: fields.length,
      relationships: {
        parent: Boolean(parentRelationship),
        blockedBy: blockedBy.length,
        blocking: blocking.length,
      },
    })
    return response
  })

  onMessage('getHierarchyData', async ({ data }) => {
    logger.log('[rgp:bg] getHierarchyData received', data)

    // Check cache first (keyed by DOM item ID)
    const cacheKey = `${data.owner}/${data.number}/${data.itemId}`
    const cached = hierarchyCache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data
    }

    // Resolve DOM item ID (e.g. "issue:3960969873") → real ProjectV2Item node ID
    let resolvedItemId = data.itemId
    if (/^issue[:-]\d+$/.test(data.itemId)) {
      const { project: projectV2 } = await getProjectFieldsData(data.owner, data.number, data.isOrg)
      if (!projectV2?.id) throw new Error('Could not fetch project fields — cannot resolve item ID')
      const resolved = await resolveProjectItemIds([data.itemId], projectV2.id)
      if (resolved.length === 0) throw new Error(`Item ${data.itemId} not found in project — it may belong to a different project`)
      resolvedItemId = resolved[0].projectItemId
    }

    // Fetch item details for parent relationship (GraphQL)
    const details = await withRateLimitRetry(
      () => gql<ProjectItemDetails>(GET_PROJECT_ITEM_DETAILS, { itemId: resolvedItemId }),
    )
    const source = details.node
    if (!source) throw new Error('Project item not found')
    const issue = source.content
    if (!issue?.title) throw new Error('Item is not a supported type')

    // Fetch sub-issues, blockedBy, blocking concurrently (all GETs — safe to parallelize)
    const [subIssues, blockedBy, blocking] = await Promise.all([
      listSubIssuesSafe(issue.repository.owner.login, issue.repository.name, issue.number),
      listIssueRelationshipsSafe('blocked_by', issue.repository.owner.login, issue.repository.name, issue.number),
      listIssueRelationshipsSafe('blocking', issue.repository.owner.login, issue.repository.name, issue.number),
    ])

    const parent: IssueRelationshipData | undefined = issue.parent
      ? {
          nodeId: issue.parent.id,
          databaseId: issue.parent.databaseId,
          number: issue.parent.number,
          title: issue.parent.title,
          repoOwner: issue.parent.repository.owner.login,
          repoName: issue.parent.repository.name,
        }
      : undefined

    const result: HierarchyData = {
      resolvedItemId,
      issueNumber: issue.number,
      repoOwner: issue.repository.owner.login,
      repoName: issue.repository.name,
      parent,
      subIssues,
      totalSubIssues: subIssues.length,
      completedSubIssues: subIssues.filter((s) => s.state === 'CLOSED').length,
      blockedBy,
      blocking,
    }

    pruneExpiredCache(hierarchyCache)
    hierarchyCache.set(cacheKey, { data: result, expiresAt: Date.now() + HIERARCHY_CACHE_TTL_MS })
    return result
  })

  function formatDetailDate(iso: string): string {
    const d = new Date(iso + 'T00:00:00')
    if (isNaN(d.getTime())) return iso
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  onMessage('bulkUpdate', async ({ data, sender }) => {
    logger.log('[rgp:bg] bulkUpdate received', { itemCount: data.itemIds.length, updatesCount: data.updates.length, projectId: data.projectId })

    if (activeBulkCount >= MAX_CONCURRENT_BULK) {
      console.warn('[rgp:bg] max concurrent bulk updates reached, rejecting')
      return
    }

    activeBulkCount++
    const processId = `bulk-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const label = `Bulk update · ${data.itemIds.length} item${data.itemIds.length !== 1 ? 's' : ''}`
    const tabId = sender.tab?.id

    try {
      // Resolve DOM-extracted item IDs to real ProjectV2Item Node IDs
      await broadcastQueue({ total: data.itemIds.length, completed: 0, paused: false, status: 'Resolving items...', processId, label }, tabId)
      const cachedResolvedItems = data.relationships
        ? takeCachedResolvedItems(data.projectId, data.itemIds)
        : undefined
      const resolvedItems = cachedResolvedItems ?? await resolveProjectItemIds(data.itemIds, data.projectId, tabId)
      logger.log('[rgp:bg] resolved item IDs', resolvedItems)

      if (resolvedItems.length === 0) {
        console.error('[rgp:bg] no valid ProjectV2Item IDs resolved, aborting')
        return
      }

      const tasks: import('../../lib/queue').QueueTask[] = []

      for (const item of resolvedItems) {
        const { domId, projectItemId, issueNodeId, typename } = item
        for (const update of data.updates) {
          const { dataType, singleSelectOptionId, iterationId, array } = update.value as any

          const meta = data.fieldMeta?.[update.fieldId]
          const fieldLabel = meta?.name ?? 'Field'

          let detail: string
          if (dataType === 'ASSIGNEES') {
            const logins: string[] = (array ?? []).map((a: any) => a.login).filter(Boolean)
            detail = logins.length > 0 ? `Adding assignees: ${logins.map((l: string) => '@' + l).join(', ')}` : 'Adding assignees'
          } else if (dataType === 'LABELS') {
            const names: string[] = (array ?? []).map((l: any) => l.name).filter(Boolean)
            detail = names.length > 0 ? `Adding labels: ${names.join(', ')}` : 'Adding labels'
          } else if (dataType === 'MILESTONE') {
            const milestoneName: string = (array as any)?.[0]?.title ?? (array as any)?.[0]?.name ?? ''
            detail = milestoneName ? `Setting milestone → ${milestoneName}` : 'Setting milestone'
          } else if (dataType === 'ISSUE_TYPE') {
            const issueTypeName: string = (array as any)?.[0]?.name ?? ''
            detail = issueTypeName ? `Setting issue type → ${issueTypeName}` : 'Setting issue type'
          } else if (dataType === 'TITLE') {
            const { text } = update.value as any
            const trimmed: string = text?.trim() ?? ''
            detail = trimmed ? `Changing title → "${trimmed.length > 40 ? trimmed.slice(0, 40) + '…' : trimmed}"` : 'Updating title'
          } else if (dataType === 'BODY') {
            detail = 'Updating body'
          } else if (dataType === 'COMMENT') {
            detail = 'Adding comment'
          } else if (dataType === 'SINGLE_SELECT') {
            const optName = meta?.options?.find((o: { id: string; name: string }) => o.id === singleSelectOptionId)?.name
            detail = optName ? `${fieldLabel} → ${optName}` : `${fieldLabel} → (option)`
          } else if (dataType === 'ITERATION') {
            const iterTitle = meta?.iterations?.find((i: { id: string; title: string }) => i.id === iterationId)?.title
            detail = iterTitle ? `${fieldLabel} → ${iterTitle}` : `${fieldLabel} → (iteration)`
          } else {
            const { text, date, number: num } = update.value as any
            if (text !== undefined) {
              const preview: string = (text as string).length > 30 ? (text as string).slice(0, 30) + '…' : text
              detail = `${fieldLabel} → "${preview}"`
            } else if (num !== undefined && num !== null) {
              detail = `${fieldLabel} → ${num}`
            } else if (date !== undefined) {
              detail = `${fieldLabel} → ${formatDetailDate(date as string)}`
            } else {
              detail = `Updating ${fieldLabel}`
            }
          }

          tasks.push({
            id: `bulk-${domId}-${update.fieldId}`,
            detail,
            run: async () => {
              // Handle Issue-level updates for default fields
              if (dataType === 'ASSIGNEES') {
                if (array?.length > 0) {
                  const assigneeIds = array.map((a: { id: string }) => a.id)
                  logger.log('[rgp:bg] Adding assignees:', assigneeIds, 'to issue:', issueNodeId)
                  await gql(ADD_ASSIGNEES, {
                    assignableId: issueNodeId,
                    assigneeIds,
                  })
                  await sleep(1000)
                }
                return
              }

              if (dataType === 'LABELS') {
                if (array?.length > 0) {
                  const labelIds = array.map((l: { id: string }) => l.id)
                  logger.log('[rgp:bg] Adding labels:', labelIds, 'to issue:', issueNodeId)
                  await gql(ADD_LABELS, {
                    labelableId: issueNodeId,
                    labelIds,
                  })
                  await sleep(1000)
                }
                return
              }

              if (dataType === 'MILESTONE') {
                if (array?.length > 0) {
                  const milestoneId = array[0].id
                  logger.log('[rgp:bg] Setting milestone:', milestoneId, 'on issue:', issueNodeId)
                  await gql(UPDATE_ISSUE_MILESTONE, {
                    issueId: issueNodeId,
                    milestoneId,
                  })
                  await sleep(1000)
                }
                return
              }

              if (dataType === 'ISSUE_TYPE') {
                if (array?.length > 0) {
                  const issueTypeId = array[0].id
                  logger.log('[rgp:bg] Setting issue type:', issueTypeId, 'on issue:', issueNodeId)
                  await gql(UPDATE_ISSUE_TYPE, {
                    issueId: issueNodeId,
                    issueTypeId,
                  })
                  await sleep(1000)
                }
                return
              }

              if (dataType === 'TITLE') {
                const { text } = update.value as any
                if (text?.trim()) {
                  if (typename === 'PullRequest') {
                    await gql(UPDATE_PR_TITLE, { prId: issueNodeId, title: text.trim() })
                  } else {
                    await gql(UPDATE_ISSUE_TITLE, { issueId: issueNodeId, title: text.trim() })
                  }
                  await sleep(1000)
                }
                return
              }

              if (dataType === 'BODY') {
                const { text } = update.value as any
                if (text !== undefined) {
                  if (typename === 'PullRequest') {
                    await gql(UPDATE_PR_BODY, { prId: issueNodeId, body: text })
                  } else {
                    await gql(UPDATE_ISSUE_BODY, { issueId: issueNodeId, body: text })
                  }
                  await sleep(1000)
                }
                return
              }

              if (dataType === 'COMMENT') {
                const { text } = update.value as any
                if (text?.trim()) {
                  await gql(ADD_COMMENT, { subjectId: issueNodeId, body: text.trim() })
                  await sleep(1000)
                }
                return
              }

              // Default project custom fields
              let valueOpt: any = {}
              if (singleSelectOptionId) valueOpt = { singleSelectOptionId }
              else if (iterationId) valueOpt = { iterationId }
              else {
                const { text, date, number: num } = update.value as any
                if (date !== undefined) valueOpt = { date }
                else if (num !== undefined && num !== null) valueOpt = { number: num }
                else if (text !== undefined) valueOpt = { text }
              }

              await gql(UPDATE_PROJECT_FIELD, {
                projectId: data.projectId,
                itemId: projectItemId,
                fieldId: update.fieldId,
                value: valueOpt,
              })
            },
          })
        }

        if (data.relationships) {
          tasks.push(...buildBulkRelationshipTasks(item, data.relationships, tabId))
        }
      }

      await processQueue(tasks, async state => {
        logger.log('[rgp:bg] queue state broadcast', { completed: state.completed, total: state.total, processId })
        await broadcastQueue({
          total: state.total,
          completed: state.completed,
          paused: state.paused,
          retryAfter: state.retryAfter,
          status: `Updating ${resolvedItems.length} item${resolvedItems.length !== 1 ? 's' : ''}...`,
          detail: state.detail,
          processId,
          label,
        }, tabId)
      }, processId)

      // Final done broadcast
      await broadcastQueue({ total: 0, completed: 0, paused: false, status: 'Done!', processId, label }, tabId)
    } finally {
      activeBulkCount--
    }
  })

  onMessage('bulkClose', async ({ data, sender }) => {
    logger.log('[rgp:bg] bulkClose received', { itemCount: data.itemIds.length, reason: data.reason })

    if (activeBulkCount >= MAX_CONCURRENT_BULK) {
      console.warn('[rgp:bg] max concurrent bulk reached, rejecting bulkClose')
      return
    }

    activeBulkCount++
    const processId = `close-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const label = `Bulk close · ${data.itemIds.length} item${data.itemIds.length !== 1 ? 's' : ''}`
    const tabId = sender.tab?.id

    try {
      await broadcastQueue({ total: data.itemIds.length, completed: 0, paused: false, status: 'Resolving items...', processId, label }, tabId)
      const resolvedItems = await resolveProjectItemIds(data.itemIds, data.projectId, tabId)

      if (resolvedItems.length === 0) {
        console.error('[rgp:bg] no valid items resolved for bulkClose, aborting')
        return
      }

      const tasks: import('../../lib/queue').QueueTask[] = resolvedItems.map(({ domId, issueNodeId }) => ({
        id: `close-${domId}`,
        run: async () => {
          await gql(CLOSE_ISSUE, { issueId: issueNodeId, stateReason: data.reason })
          await sleep(1000)
        },
      }))

      await processQueue(tasks, async state => {
        await broadcastQueue({
          total: state.total,
          completed: state.completed,
          paused: state.paused,
          retryAfter: state.retryAfter,
          status: state.completed < resolvedItems.length
            ? `Closing item ${state.completed + 1} of ${resolvedItems.length}…`
            : `Closing ${resolvedItems.length} item${resolvedItems.length !== 1 ? 's' : ''}…`,
          processId,
          label,
        }, tabId)
      }, processId)

      await broadcastQueue({ total: 0, completed: 0, paused: false, status: 'Done!', processId, label }, tabId)
    } finally {
      activeBulkCount--
    }
  })

  onMessage('bulkOpen', async ({ data, sender }) => {
    logger.log('[rgp:bg] bulkOpen received', { itemCount: data.itemIds.length })

    if (activeBulkCount >= MAX_CONCURRENT_BULK) {
      console.warn('[rgp:bg] max concurrent bulk reached, rejecting bulkOpen')
      return
    }

    activeBulkCount++
    const processId = `open-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const label = `Bulk open · ${data.itemIds.length} item${data.itemIds.length !== 1 ? 's' : ''}`
    const tabId = sender.tab?.id

    try {
      await broadcastQueue({ total: data.itemIds.length, completed: 0, paused: false, status: 'Resolving items...', processId, label }, tabId)
      const resolvedItems = await resolveProjectItemIds(data.itemIds, data.projectId, tabId)

      if (resolvedItems.length === 0) {
        console.error('[rgp:bg] no valid items resolved for bulkOpen, aborting')
        return
      }

      const tasks: import('../../lib/queue').QueueTask[] = resolvedItems.map(({ domId, issueNodeId }) => ({
        id: `open-${domId}`,
        run: async () => {
          await gql(REOPEN_ISSUE, { issueId: issueNodeId })
          await sleep(1000)
        },
      }))

      await processQueue(tasks, async state => {
        await broadcastQueue({
          total: state.total,
          completed: state.completed,
          paused: state.paused,
          retryAfter: state.retryAfter,
          status: state.completed < resolvedItems.length
            ? `Reopening item ${state.completed + 1} of ${resolvedItems.length}…`
            : `Reopening ${resolvedItems.length} item${resolvedItems.length !== 1 ? 's' : ''}…`,
          processId,
          label,
        }, tabId)
      }, processId)

      await broadcastQueue({ total: 0, completed: 0, paused: false, status: 'Done!', processId, label }, tabId)
    } finally {
      activeBulkCount--
    }
  })

  onMessage('bulkDelete', async ({ data, sender }) => {
    logger.log('[rgp:bg] bulkDelete received', { itemCount: data.itemIds.length })

    if (activeBulkCount >= MAX_CONCURRENT_BULK) {
      console.warn('[rgp:bg] max concurrent bulk reached, rejecting bulkDelete')
      return
    }

    activeBulkCount++
    const processId = `delete-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const label = `Bulk delete · ${data.itemIds.length} item${data.itemIds.length !== 1 ? 's' : ''}`
    const tabId = sender.tab?.id

    try {
      await broadcastQueue({ total: data.itemIds.length, completed: 0, paused: false, status: 'Resolving items...', processId, label }, tabId)
      const resolvedItems = await resolveProjectItemIds(data.itemIds, data.projectId, tabId)

      if (resolvedItems.length === 0) {
        console.error('[rgp:bg] no valid items resolved for bulkDelete, aborting')
        return
      }

      const tasks: import('../../lib/queue').QueueTask[] = resolvedItems.map(({ domId, projectItemId }) => ({
        id: `delete-${domId}`,
        run: async () => {
          await gql(DELETE_PROJECT_ITEM, { projectId: data.projectId, itemId: projectItemId })
          await sleep(1000)
        },
      }))

      await processQueue(tasks, async state => {
        await broadcastQueue({
          total: state.total,
          completed: state.completed,
          paused: state.paused,
          retryAfter: state.retryAfter,
          status: state.completed < resolvedItems.length
            ? `Removing item ${state.completed + 1} of ${resolvedItems.length}…`
            : `Removing ${resolvedItems.length} item${resolvedItems.length !== 1 ? 's' : ''}…`,
          processId,
          label,
        }, tabId)
      }, processId)

      await broadcastQueue({ total: 0, completed: 0, paused: false, status: 'Done!', processId, label }, tabId)
    } finally {
      activeBulkCount--
    }
  })

  onMessage('bulkLock', async ({ data, sender }) => {
    logger.log('[rgp:bg] bulkLock received', { itemCount: data.itemIds.length })
    if (activeBulkCount >= MAX_CONCURRENT_BULK) { console.warn('[rgp:bg] max concurrent bulk reached, rejecting bulkLock'); return }
    activeBulkCount++
    const processId = `lock-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const label = `Lock · ${data.itemIds.length} item${data.itemIds.length !== 1 ? 's' : ''}`
    const tabId = sender.tab?.id
    try {
      await broadcastQueue({ total: data.itemIds.length, completed: 0, paused: false, status: 'Resolving items...', processId, label }, tabId)
      const resolvedItems = await resolveProjectItemIds(data.itemIds, data.projectId, tabId)
      if (resolvedItems.length === 0) { console.error('[rgp:bg] no valid items resolved for bulkLock, aborting'); return }
      const tasks: import('../../lib/queue').QueueTask[] = resolvedItems.map(({ domId, issueNodeId }) => ({
        id: `lock-${domId}`,
        run: async () => {
          await gql(LOCK_ISSUE, { lockableId: issueNodeId, ...(data.lockReason ? { lockReason: data.lockReason } : {}) })
          await sleep(1000)
        },
      }))
      await processQueue(tasks, async state => {
        await broadcastQueue({
          total: state.total, completed: state.completed, paused: state.paused, retryAfter: state.retryAfter,
          status: state.completed < resolvedItems.length
            ? `Locking item ${state.completed + 1} of ${resolvedItems.length}…`
            : `Locking ${resolvedItems.length} item${resolvedItems.length !== 1 ? 's' : ''}…`,
          processId, label,
        }, tabId)
      }, processId)
      await broadcastQueue({ total: 0, completed: 0, paused: false, status: 'Done!', processId, label }, tabId)
    } finally { activeBulkCount-- }
  })

  onMessage('bulkPin', async ({ data, sender }) => {
    logger.log('[rgp:bg] bulkPin received', { itemCount: data.itemIds.length })
    if (activeBulkCount >= MAX_CONCURRENT_BULK) { console.warn('[rgp:bg] max concurrent bulk reached, rejecting bulkPin'); return }
    activeBulkCount++
    const processId = `pin-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const label = `Pin · ${data.itemIds.length} item${data.itemIds.length !== 1 ? 's' : ''}`
    const tabId = sender.tab?.id
    try {
      await broadcastQueue({ total: data.itemIds.length, completed: 0, paused: false, status: 'Resolving items...', processId, label }, tabId)
      const resolvedItems = await resolveProjectItemIds(data.itemIds, data.projectId, tabId)
      if (resolvedItems.length === 0) { console.error('[rgp:bg] no valid items resolved for bulkPin, aborting'); return }
      const tasks: import('../../lib/queue').QueueTask[] = resolvedItems.map(({ domId, issueNodeId }) => ({
        id: `pin-${domId}`,
        run: async () => { await gql(PIN_ISSUE, { issueId: issueNodeId }); await sleep(1000) },
      }))
      await processQueue(tasks, async state => {
        await broadcastQueue({
          total: state.total, completed: state.completed, paused: state.paused, retryAfter: state.retryAfter,
          status: state.completed < resolvedItems.length
            ? `Pinning item ${state.completed + 1} of ${resolvedItems.length}…`
            : `Pinning ${resolvedItems.length} item${resolvedItems.length !== 1 ? 's' : ''}…`,
          processId, label,
        }, tabId)
      }, processId)
      await broadcastQueue({ total: 0, completed: 0, paused: false, status: 'Done!', processId, label }, tabId)
    } finally { activeBulkCount-- }
  })

  onMessage('bulkUnpin', async ({ data, sender }) => {
    logger.log('[rgp:bg] bulkUnpin received', { itemCount: data.itemIds.length })
    if (activeBulkCount >= MAX_CONCURRENT_BULK) { console.warn('[rgp:bg] max concurrent bulk reached, rejecting bulkUnpin'); return }
    activeBulkCount++
    const processId = `unpin-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const label = `Unpin · ${data.itemIds.length} item${data.itemIds.length !== 1 ? 's' : ''}`
    const tabId = sender.tab?.id
    try {
      await broadcastQueue({ total: data.itemIds.length, completed: 0, paused: false, status: 'Resolving items...', processId, label }, tabId)
      const resolvedItems = await resolveProjectItemIds(data.itemIds, data.projectId, tabId)
      if (resolvedItems.length === 0) { console.error('[rgp:bg] no valid items resolved for bulkUnpin, aborting'); return }
      const tasks: import('../../lib/queue').QueueTask[] = resolvedItems.map(({ domId, issueNodeId }) => ({
        id: `unpin-${domId}`,
        run: async () => { await gql(UNPIN_ISSUE, { issueId: issueNodeId }); await sleep(1000) },
      }))
      await processQueue(tasks, async state => {
        await broadcastQueue({
          total: state.total, completed: state.completed, paused: state.paused, retryAfter: state.retryAfter,
          status: state.completed < resolvedItems.length
            ? `Unpinning item ${state.completed + 1} of ${resolvedItems.length}…`
            : `Unpinning ${resolvedItems.length} item${resolvedItems.length !== 1 ? 's' : ''}…`,
          processId, label,
        }, tabId)
      }, processId)
      await broadcastQueue({ total: 0, completed: 0, paused: false, status: 'Done!', processId, label }, tabId)
    } finally { activeBulkCount-- }
  })

  onMessage('bulkTransfer', async ({ data, sender }) => {
    logger.log('[rgp:bg] bulkTransfer received', { itemCount: data.itemIds.length })
    if (activeBulkCount >= MAX_CONCURRENT_BULK) { console.warn('[rgp:bg] max concurrent bulk reached, rejecting bulkTransfer'); return }
    activeBulkCount++
    const processId = `transfer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const label = `Transfer · ${data.itemIds.length} item${data.itemIds.length !== 1 ? 's' : ''}`
    const tabId = sender.tab?.id
    try {
      await broadcastQueue({ total: data.itemIds.length, completed: 0, paused: false, status: 'Resolving target repository...', processId, label }, tabId)
      const targetRepoId = await getRepositoryId(data.targetRepoOwner, data.targetRepoName)
      await broadcastQueue({ total: data.itemIds.length, completed: 0, paused: false, status: 'Resolving items...', processId, label }, tabId)
      const resolvedItems = await resolveProjectItemIds(data.itemIds, data.projectId, tabId)
      if (resolvedItems.length === 0) { console.error('[rgp:bg] no valid items resolved for bulkTransfer, aborting'); return }
      const tasks: import('../../lib/queue').QueueTask[] = resolvedItems.map(({ domId, issueNodeId }) => ({
        id: `transfer-${domId}`,
        run: async () => { await gql(TRANSFER_ISSUE, { issueId: issueNodeId, repositoryId: targetRepoId }); await sleep(1000) },
      }))
      await processQueue(tasks, async state => {
        await broadcastQueue({
          total: state.total, completed: state.completed, paused: state.paused, retryAfter: state.retryAfter,
          status: state.completed < resolvedItems.length
            ? `Transferring item ${state.completed + 1} of ${resolvedItems.length}…`
            : `Transferring ${resolvedItems.length} item${resolvedItems.length !== 1 ? 's' : ''}…`,
          processId, label,
        }, tabId)
      }, processId)
      await broadcastQueue({ total: 0, completed: 0, paused: false, status: 'Done!', processId, label }, tabId)
    } finally { activeBulkCount-- }
  })

  onMessage('getItemTitles', async ({ data }) => {
    logger.log('[rgp:bg] getItemTitles received', { itemCount: data.itemIds.length, projectId: data.projectId })
    const resolved = await resolveProjectItemIdsWithTitles(data.itemIds, data.projectId)
    return resolved.map(r => ({ domId: r.domId, issueNodeId: r.issueNodeId, title: r.title, typename: r.typename }))
  })

  onMessage('bulkRename', async ({ data, sender }) => {
    logger.log('[rgp:bg] bulkRename received', { itemCount: data.itemIds.length, renamesCount: data.renames.length })

    if (activeBulkCount >= MAX_CONCURRENT_BULK) {
      console.warn('[rgp:bg] max concurrent bulk reached, rejecting bulkRename')
      return
    }

    activeBulkCount++
    const processId = `rename-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const label = `Rename · ${data.renames.length} item${data.renames.length !== 1 ? 's' : ''}`
    const tabId = sender.tab?.id

    try {
      const tasks: import('../../lib/queue').QueueTask[] = data.renames.map(({ domId, issueNodeId, newTitle, typename }) => ({
        id: `rename-${domId}`,
        run: async () => {
          if (typename === 'PullRequest') {
            await gql(UPDATE_PR_TITLE, { prId: issueNodeId, title: newTitle })
          } else {
            await gql(UPDATE_ISSUE_TITLE, { issueId: issueNodeId, title: newTitle })
          }
          await sleep(1000)
        },
      }))

      await broadcastQueue({ total: tasks.length, completed: 0, paused: false, status: 'Renaming items...', processId, label }, tabId)

      await processQueue(tasks, async state => {
        await broadcastQueue({
          total: state.total,
          completed: state.completed,
          paused: state.paused,
          retryAfter: state.retryAfter,
          status: state.completed < data.renames.length
            ? `Renaming item ${state.completed + 1} of ${data.renames.length}…`
            : `Renaming ${data.renames.length} item${data.renames.length !== 1 ? 's' : ''}…`,
          processId,
          label,
        }, tabId)
      }, processId)

      await broadcastQueue({ total: 0, completed: 0, paused: false, status: 'Done!', processId, label }, tabId)
    } finally {
      activeBulkCount--
    }
  })

  onMessage('getReorderContext', async ({ data }) => {
    logger.log('[rgp:bg] getReorderContext received', { itemCount: data.itemIds.length })
    const { project } = await getProjectFieldsData(data.owner, data.number, data.isOrg)
    if (!project) throw new Error('Project not found')

    // Build map from content databaseId → domId for selected items
    const selectedDbIdMap = new Map<number, string>()
    for (const domId of data.itemIds) {
      const m = domId.match(/^issue:(\d+)$/) || domId.match(/^issue-(\d+)$/)
      if (m) selectedDbIdMap.set(parseInt(m[1], 10), domId)
    }

    // Paginate through all project items
    interface ReorderItemsResult {
      node: {
        items: {
          pageInfo: { hasNextPage: boolean; endCursor: string | null }
          nodes: {
            id: string
            databaseId: number
            content: { databaseId: number; title: string } | null
          }[]
        }
      } | null
    }

    const allOrderedItems: Array<{ memexItemId: number; nodeId: string; title: string }> = []
    const selectedItems: Array<{ domId: string; memexItemId: number; nodeId: string; title: string }> = []
    // Track contentDbId → entry for DOM-order re-sorting
    const contentDbIdToEntry = new Map<number, { memexItemId: number; nodeId: string; title: string }>()
    let cursor: string | null = null

    while (true) {
      const page = await withRateLimitRetry(() =>
        gql<ReorderItemsResult>(GET_PROJECT_ITEMS_FOR_REORDER, { projectId: project.id, cursor })
      )
      const items = page.node?.items
      if (!items) break

      for (const item of items.nodes) {
        const memexItemId = item.databaseId
        const nodeId = item.id
        const title = item.content?.title ?? ''
        const contentDbId = item.content?.databaseId
        allOrderedItems.push({ memexItemId, nodeId, title })
        if (contentDbId != null) {
          contentDbIdToEntry.set(contentDbId, { memexItemId, nodeId, title })
          if (selectedDbIdMap.has(contentDbId)) {
            selectedItems.push({ domId: selectedDbIdMap.get(contentDbId)!, memexItemId, nodeId, title })
          }
        }
      }

      if (!items.pageInfo.hasNextPage) break
      cursor = items.pageInfo.endCursor
      await sleep(500)
    }

    // Re-sort allOrderedItems to match DOM visual order when provided
    if (data.allDomIds?.length) {
      const sorted: Array<{ memexItemId: number; nodeId: string; title: string }> = []
      for (const domId of data.allDomIds) {
        const m = domId.match(/^issue:(\d+)$/) || domId.match(/^issue-(\d+)$/)
        if (!m) continue
        const entry = contentDbIdToEntry.get(parseInt(m[1], 10))
        if (entry) sorted.push(entry)
      }
      // Append items not visible in the DOM (filtered/hidden) at the end
      const sortedSet = new Set(sorted.map(i => i.memexItemId))
      const rest = allOrderedItems.filter(i => !sortedSet.has(i.memexItemId))
      allOrderedItems.length = 0
      allOrderedItems.push(...sorted, ...rest)
    }

    return { projectId: project.id, allOrderedItems, selectedItems }
  })

  onMessage('bulkReorder', async ({ data, sender }) => {
    logger.log('[rgp:bg] bulkReorder received', { opCount: data.reorderOps.length })

    if (activeBulkCount >= MAX_CONCURRENT_BULK) {
      console.warn('[rgp:bg] max concurrent bulk reached, rejecting bulkReorder')
      return
    }

    activeBulkCount++
    const processId = `reorder-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const label = data.label ?? `Move · ${data.reorderOps.length} item${data.reorderOps.length !== 1 ? 's' : ''}`
    const tabId = sender.tab?.id

    try {
      const tasks: import('../../lib/queue').QueueTask[] = data.reorderOps.map((op, i) => ({
        id: `reorder-${i}`,
        run: async () => {
          await gql(UPDATE_PROJECT_ITEM_POSITION, {
            input: {
              projectId: data.projectId,
              itemId: op.nodeId,
              afterId: op.previousNodeId ?? undefined,
            },
          })
        },
      }))

      await broadcastQueue({ total: tasks.length, completed: 0, paused: false, status: 'Moving items...', processId, label }, tabId)

      await processQueue(tasks, async state => {
        await broadcastQueue({
          total: state.total,
          completed: state.completed,
          paused: state.paused,
          retryAfter: state.retryAfter,
          status: state.completed < data.reorderOps.length
            ? `Moving item ${state.completed + 1} of ${data.reorderOps.length}…`
            : `Moving ${data.reorderOps.length} item${data.reorderOps.length !== 1 ? 's' : ''}…`,
          processId,
          label,
        }, tabId)
      }, processId)

      await broadcastQueue({ total: 0, completed: 0, paused: false, status: 'Done!', processId, label }, tabId)
    } finally {
      activeBulkCount--
    }
  })

  onMessage('bulkReorderByPosition', async ({ data, sender }) => {
    logger.log('[rgp:bg] bulkReorderByPosition received', { count: data.selectedDomIds.length })

    if (activeBulkCount >= MAX_CONCURRENT_BULK) {
      console.warn('[rgp:bg] max concurrent bulk reached, rejecting bulkReorderByPosition')
      return
    }

    activeBulkCount++
    const processId = `reorder-pos-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const count = data.selectedDomIds.length
    const label = data.label ?? `Move · ${count} item${count !== 1 ? 's' : ''}`
    const tabId = sender.tab?.id

    try {
      const { project } = await getProjectFieldsData(data.owner, data.number, data.isOrg)
      if (!project) throw new Error('Project not found')

      interface PosItemsResult {
        node: {
          items: {
            pageInfo: { hasNextPage: boolean; endCursor: string | null }
            nodes: { id: string; databaseId: number; content: { databaseId: number } | null }[]
          }
        } | null
      }

      const allItems: Array<{ memexItemId: number; nodeId: string; contentDbId: number }> = []
      let cursor: string | null = null
      while (true) {
        const page = await withRateLimitRetry(() =>
          gql<PosItemsResult>(GET_PROJECT_ITEMS_FOR_REORDER, { projectId: project.id, cursor })
        )
        const items = page.node?.items
        if (!items) break
        for (const item of items.nodes) {
          if (item.content?.databaseId) {
            allItems.push({ memexItemId: item.databaseId, nodeId: item.id, contentDbId: item.content.databaseId })
          }
        }
        if (!items.pageInfo.hasNextPage) break
        cursor = items.pageInfo.endCursor
        await sleep(500)
      }

      const contentDbToMemex = new Map(allItems.map(i => [i.contentDbId, i.memexItemId]))
      const contentDbToNode = new Map(allItems.map(i => [i.contentDbId, i.nodeId]))

      function parseContentDbId(domId: string): number | null {
        const m = domId.match(/^issue:(\d+)$/) || domId.match(/^issue-(\d+)$/)
        return m ? parseInt(m[1], 10) : null
      }

      const selectedMemexIds = data.selectedDomIds
        .map(domId => contentDbToMemex.get(parseContentDbId(domId)!))
        .filter((id): id is number => id != null)

      const insertAfterContentDbId = data.insertAfterDomId ? parseContentDbId(data.insertAfterDomId) : null
      const insertAfterMemexId: number | '' = insertAfterContentDbId
        ? (contentDbToMemex.get(insertAfterContentDbId) ?? '')
        : ''

      // Use DOM order as the base ordering when provided (avoids GraphQL insertion-order mismatch)
      let orderedItems: typeof allItems
      if (data.allDomIds?.length) {
        orderedItems = []
        for (const domId of data.allDomIds) {
          const contentDbId = parseContentDbId(domId)
          if (contentDbId == null) continue
          const memexItemId = contentDbToMemex.get(contentDbId)
          const nodeId = contentDbToNode.get(contentDbId)
          if (memexItemId != null && nodeId != null) orderedItems.push({ memexItemId, nodeId, contentDbId })
        }
        // Append items not in DOM (hidden/filtered) at the end
        const inDomSet = new Set(orderedItems.map(i => i.memexItemId))
        for (const item of allItems) {
          if (!inDomSet.has(item.memexItemId)) orderedItems.push(item)
        }
      } else {
        orderedItems = allItems
      }

      const selectedSet = new Set(selectedMemexIds)
      const nonSelected = orderedItems.filter(i => !selectedSet.has(i.memexItemId))
      const selected = orderedItems.filter(i => selectedSet.has(i.memexItemId))

      let newOrder: typeof orderedItems
      if (insertAfterMemexId === '') {
        newOrder = [...selected, ...nonSelected]
      } else {
        const insertIdx = nonSelected.findIndex(i => i.memexItemId === insertAfterMemexId)
        if (insertIdx === -1) {
          newOrder = [...nonSelected, ...selected]
        } else {
          newOrder = [
            ...nonSelected.slice(0, insertIdx + 1),
            ...selected,
            ...nonSelected.slice(insertIdx + 1),
          ]
        }
      }

      const reorderOps = newOrder.reduce<Array<{ nodeId: string; previousNodeId: string | null }>>((acc, item, i) => {
        if (!selectedSet.has(item.memexItemId)) return acc
        const prev = newOrder[i - 1]
        acc.push({
          nodeId: item.nodeId,
          previousNodeId: prev?.nodeId ?? null,
        })
        return acc
      }, [])

      const tasks: import('../../lib/queue').QueueTask[] = reorderOps.map((op, i) => ({
        id: `reorder-pos-${i}`,
        run: async () => {
          await gql(UPDATE_PROJECT_ITEM_POSITION, {
            input: {
              projectId: project.id,
              itemId: op.nodeId,
              afterId: op.previousNodeId ?? undefined,
            },
          })
        },
      }))

      await broadcastQueue({ total: tasks.length, completed: 0, paused: false, status: 'Moving items...', processId, label }, tabId)
      await processQueue(tasks, async state => {
        await broadcastQueue({
          total: state.total,
          completed: state.completed,
          paused: state.paused,
          retryAfter: state.retryAfter,
          status: `Moving item ${state.completed + 1} of ${reorderOps.length}…`,
          processId,
          label,
        }, tabId)
      }, processId)
      await broadcastQueue({ total: 0, completed: 0, paused: false, status: 'Done!', processId, label }, tabId)
    } finally {
      activeBulkCount--
    }
  })

  onMessage('getProjectFields', async ({ data }) => {
    logger.log('[rgp:bg] getProjectFields received', data)
    const { project } = await getProjectFieldsData(data.owner, data.number, data.isOrg)
    return {
      id: project?.id || '',
      title: project?.title || 'Project',
      fields: project?.fields.nodes.filter(Boolean) || []
    }
  })

  onMessage('getSprintStatus', async ({ data }) => {
    logger.log('[rgp:bg] getSprintStatus received', data)
    const allSettings = await allSprintSettingsStorage.getValue()
    const settings = allSettings[data.projectId] ?? null

    const { project } = await getProjectFieldsData(data.owner, data.number, data.isOrg)
    const fields = project?.fields.nodes.filter(Boolean) ?? []

    const iterField = fields.find(
      (f) => f.dataType === 'ITERATION' && (!settings || f.id === settings.sprintFieldId),
    )

    if (!iterField?.configuration) {
      return {
        hasSettings: !!settings,
        activeSprint: null,
        nearestUpcoming: null,
        acknowledgedSprint: null,
        iterationFieldId: iterField?.id ?? null,
        settings,
      }
    }

    const allIters = [
      ...(iterField.configuration.iterations ?? []),
      ...(iterField.configuration.completedIterations ?? []),
    ]
    const today = todayUtc()

    const active = allIters.find((i) => isActive(i, today)) ?? null
    const activeSprint: SprintInfo | null = active
      ? { ...active, endDate: iterationEndDate(active) }
      : null

    const upcoming = nearestUpcoming(iterField.configuration.iterations ?? [], today)
    const nearestUpcomingSprint: SprintInfo | null = upcoming
      ? { ...upcoming, endDate: iterationEndDate(upcoming) }
      : null

    // Check acknowledged sprint (if any) — clear stale IDs
    let acknowledgedSprint: SprintInfo | null = null
    if (settings?.acknowledgedSprintId) {
      const ackIter = iterField.configuration.iterations?.find(
        (i) => i.id === settings.acknowledgedSprintId,
      )
      if (ackIter) {
        acknowledgedSprint = { ...ackIter, endDate: iterationEndDate(ackIter) }
      } else {
        // Stale — clear it
        const updated = { ...settings, acknowledgedSprintId: undefined }
        await allSprintSettingsStorage.setValue({ ...allSettings, [data.projectId]: updated })
      }
    }

    return {
      hasSettings: !!settings,
      activeSprint,
      nearestUpcoming: nearestUpcomingSprint,
      acknowledgedSprint,
      iterationFieldId: iterField.id,
      settings,
    }
  })

  onMessage('saveSprintSettings', async ({ data }) => {
    const existing = await allSprintSettingsStorage.getValue()
    await allSprintSettingsStorage.setValue({ ...existing, [data.projectId]: data.settings })
    return { ok: true }
  })

  onMessage('acknowledgeUpcomingSprint', async ({ data }) => {
    const existing = await allSprintSettingsStorage.getValue()
    const current = existing[data.projectId]
    if (!current) return { ok: false }
    await allSprintSettingsStorage.setValue({
      ...existing,
      [data.projectId]: { ...current, acknowledgedSprintId: data.iterationId },
    })
    return { ok: true }
  })

  onMessage('endSprint', async ({ data, sender }) => {
    logger.log('[rgp:bg] endSprint received', data)

    if (activeSprintEndCount >= MAX_CONCURRENT_SPRINT_END) {
      console.warn('[rgp:bg] max concurrent sprint end reached, rejecting')
      return
    }

    activeSprintEndCount++
    const processId = `sprint-end-${Date.now()}`
    const label = 'End Sprint'
    const tabId = sender.tab?.id

    try {
      await broadcastQueue(
        { total: 0, completed: 0, paused: false, status: 'Fetching sprint items...', processId, label },
        tabId,
      )

      // Resolve real GraphQL node ID (data.projectId is a URL slug, not a node ID)
      const { project: sprintProject } = await getProjectFieldsData(data.owner, data.number, data.isOrg)
      if (!sprintProject) throw new Error('Could not load project fields')
      const realProjectId = sprintProject.id

      // Paginate all project items matching the active sprint
      interface SprintItemNode {
        id: string
        fieldValues: {
          nodes: (
            | { iterationId: string; field: { id: string } }
            | { optionId: string; field: { id: string } }
            | { text: string; field: { id: string } }
          )[]
        }
      }
      interface SprintItemsResult {
        node: {
          items: {
            pageInfo: { hasNextPage: boolean; endCursor: string | null }
            nodes: SprintItemNode[]
          }
        } | null
      }

      const sprintItems: SprintItemNode[] = []
      let cursor: string | null = null

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const page: SprintItemsResult = await gql<SprintItemsResult>(GET_PROJECT_ITEMS_WITH_FIELDS, {
          projectId: realProjectId,
          cursor,
        })

        const itemsPage = page.node?.items
        if (!itemsPage) break

        for (const item of itemsPage.nodes) {
          // Check if this item is in the active sprint
          const inSprint = item.fieldValues.nodes.filter(Boolean).some(
            (fv: { iterationId?: string; optionId?: string; text?: string; field: { id: string } | null }) =>
              'iterationId' in fv &&
              fv.field?.id === data.sprintFieldId &&
              fv.iterationId === data.activeIterationId,
          )
          if (inSprint) sprintItems.push(item)
        }

        if (!itemsPage.pageInfo.hasNextPage) break
        cursor = itemsPage.pageInfo.endCursor
        await sleep(1000)
      }

      // Classify done vs not-done
      const excludeConditions = data.excludeConditions ?? []
      const notDoneItems = sprintItems.filter((item) => {
        // Check done field
        type SprintFv = { iterationId?: string; optionId?: string; text?: string; field: { id: string } | null }
        const fvNodes = item.fieldValues.nodes.filter(Boolean) as SprintFv[]
        const doneFieldValue = fvNodes.find((fv) => fv.field?.id === data.doneFieldId)
        if (!doneFieldValue) return true // no done-field value → not done

        if (data.doneFieldType === 'SINGLE_SELECT' && 'optionId' in doneFieldValue) {
          if (doneFieldValue.optionId === data.doneOptionId) return false
        } else if (data.doneFieldType === 'TEXT' && 'text' in doneFieldValue) {
          if (doneFieldValue.text === data.doneOptionValue) return false
        } else {
          return true
        }

        // Exclude conditions — item stays in current sprint if it matches any
        for (const cond of excludeConditions) {
          const fv = fvNodes.find((f) => f.field?.id === cond.fieldId)
          if (!fv) continue
          if (cond.fieldType === 'SINGLE_SELECT' && 'optionId' in fv && fv.optionId === cond.optionId) return false
          if (cond.fieldType === 'TEXT' && 'text' in fv && fv.text === cond.optionName) return false
        }

        return true
      })

      if (notDoneItems.length === 0) {
        await broadcastQueue(
          { total: 0, completed: 0, paused: false, status: 'Done! All items are finished.', processId, label },
          tabId,
        )
        return
      }

      const tasks: import('../../lib/queue').QueueTask[] = notDoneItems.map((item) => ({
        id: `sprint-move-${item.id}`,
        run: async () => {
          await gql(UPDATE_PROJECT_FIELD, {
            projectId: realProjectId,
            itemId: item.id,
            fieldId: data.sprintFieldId,
            value: { iterationId: data.nextIterationId },
          })
          await sleep(1000)
        },
      }))

      await broadcastQueue(
        {
          total: tasks.length,
          completed: 0,
          paused: false,
          status: `Moving ${tasks.length} item${tasks.length !== 1 ? 's' : ''} to next sprint...`,
          processId,
          label,
        },
        tabId,
      )

      await processQueue(
        tasks,
        async (state) => {
          await broadcastQueue(
            {
              total: state.total,
              completed: state.completed,
              paused: state.paused,
              retryAfter: state.retryAfter,
              status: `Moving ${state.completed + 1} of ${tasks.length}...`,
              processId,
              label,
            },
            tabId,
          )
        },
        processId,
      )

      await broadcastQueue(
        { total: 0, completed: 0, paused: false, status: 'Done!', processId, label },
        tabId,
      )
    } finally {
      activeSprintEndCount--
    }
  })
})

// ─── Shared helpers ───────────────────────────────────────────────────────────

type FieldsResultProject = {
  id: string
  databaseId: number
  title: string
  fields: {
    nodes: {
      id: string
      name: string
      dataType: string
      options?: { id: string; name: string; color: string }[]
      configuration?: {
        iterations: { id: string; title: string; startDate: string; duration: number }[]
        completedIterations?: { id: string; title: string; startDate: string; duration: number }[]
      }
    }[]
  }
}

async function getProjectFieldsData(
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

// ─── Types ────────────────────────────────────────────────────────────────────

interface FieldBase {
  field: { id: string; name: string; dataType: string }
}
interface TextFieldValue extends FieldBase {
  text: string
}
interface SingleSelectFieldValue extends FieldBase {
  optionId: string
}
interface IterationFieldValue extends FieldBase {
  iterationId: string
}
interface NumberFieldValue extends FieldBase {
  number: number
}
interface DateFieldValue extends FieldBase {
  date: string
}

type FieldValue = TextFieldValue | SingleSelectFieldValue | IterationFieldValue | NumberFieldValue | DateFieldValue

interface ProjectItemDetails {
  node: {
    id: string
    project: { id: string }
    content: {
      id: string
      databaseId: number
      number: number
      title: string
      body: string
      repository: { id: string; owner: { login: string }; name: string }
      assignees: { nodes: { id: string; login: string; name: string; avatarUrl: string }[] }
      labels: { nodes: { id: string; name: string; color: string }[] }
      issueType?: { id: string; name: string }
      parent?: { id: string; databaseId: number; number: number; title: string; repository: { owner: { login: string }; name: string } }
    }
    fieldValues: {
      nodes: FieldValue[]
    }
  }
}

interface RestIssuePayload {
  id?: number
  node_id?: string
  number?: number
  title?: string
  repository_url?: string
  html_url?: string
}

interface RestIssueDependencyEntry extends RestIssuePayload {
  repository?: {
    full_name?: string
  }
  issue?: RestIssuePayload
  blocking_issue?: RestIssuePayload
  blocked_issue?: RestIssuePayload
}

type RestIssueDependencyResponse =
  | RestIssueDependencyEntry[]
  | {
      dependencies?: RestIssueDependencyEntry[]
      blocking_issues?: RestIssueDependencyEntry[]
    }

function relationshipKey(issue: IssueRelationshipData): string {
  return issue.databaseId ? `db:${issue.databaseId}` : `${issue.repoOwner}/${issue.repoName}#${issue.number}`
}

function parseExactIssueReference(
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

function buildRelationshipSearchQuery(
  query: string,
  fallbackOwner?: string,
  fallbackRepoName?: string,
): string {
  const repoScope = fallbackOwner && fallbackRepoName && !/\brepo:[^\s]+/.test(query)
    ? `repo:${fallbackOwner}/${fallbackRepoName} `
    : ''

  return `${repoScope}is:issue archived:false sort:updated-desc ${query}`.trim()
}

function mapIssueNodeToRelationshipSearchResult(issue: RelationshipSearchIssueNode): IssueSearchResultData {
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

class GitHubRequestError extends Error {
  constructor(
    message: string,
    public status: number,
    public retryAfter: number,
  ) {
    super(message)
    this.name = 'GitHubRequestError'
  }
}

function parseRepoFromUrl(url?: string): { repoOwner: string; repoName: string } | null {
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

function getIssueFromDependencyEntry(entry: RestIssueDependencyEntry): RestIssuePayload | null {
  return entry.issue ?? entry.blocking_issue ?? entry.blocked_issue ?? entry
}

function normalizeIssueRelationship(entry: RestIssueDependencyEntry): IssueRelationshipData | null {
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

function getRelationshipEntries(
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

async function githubRest<T>(path: string, init: RequestInit = {}): Promise<T> {
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
      const json = await res.json() as { message?: string }
      if (json.message) {
        message = json.message
      }
    } catch {
      // Ignore JSON parse failures and fall back to status text.
    }

    throw new GitHubRequestError(message, res.status, retryAfter)
  }

  if (res.status === 204) {
    return undefined as T
  }

  return await res.json() as T
}

async function listIssueRelationships(
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
      () => githubRest<RestIssueDependencyResponse>(
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

async function getCurrentParentRelationship(
  owner: string,
  repo: string,
  issueNumber: number,
  tabId?: number,
): Promise<IssueRelationshipData | undefined> {
  try {
    const response = await withRateLimitRetry(
      () => githubRest<RestIssueDependencyEntry>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}/parent`,
      ),
      tabId,
    )

    return normalizeIssueRelationship(response) ?? undefined
  } catch (error) {
    if (error instanceof GitHubRequestError && error.status === 404) {
      return undefined
    }

    throw error
  }
}

async function listIssueRelationshipsSafe(
  kind: 'blocked_by' | 'blocking',
  owner: string,
  repo: string,
  issueNumber: number,
  tabId?: number,
): Promise<IssueRelationshipData[]> {
  try {
    return await listIssueRelationships(kind, owner, repo, issueNumber, tabId)
  } catch (error) {
    console.warn('[rgp:bg] failed to load issue relationships', { kind, owner, repo, issueNumber, error })
    return []
  }
}

interface RestSubIssue {
  number: number
  title: string
  state: string
  repository?: { full_name?: string; owner?: { login?: string }; name?: string }
}

async function listSubIssuesSafe(
  owner: string,
  repo: string,
  issueNumber: number,
): Promise<SubIssueData[]> {
  try {
    const items = await withRateLimitRetry(
      () => githubRest<RestSubIssue[]>(
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
    console.warn('[rgp:bg] listSubIssuesSafe failed', { owner, repo, issueNumber, error })
    return []
  }
}

function buildFieldValueFromSource(fieldValue: FieldValue): Record<string, unknown> | null {
  if ('text' in fieldValue) return { text: fieldValue.text }
  if ('optionId' in fieldValue) return { singleSelectOptionId: fieldValue.optionId }
  if ('iterationId' in fieldValue) return { iterationId: fieldValue.iterationId }
  if ('number' in fieldValue) return { number: fieldValue.number }
  if ('date' in fieldValue) return { date: fieldValue.date }
  return null
}

function formatRelationshipLabel(issue: IssueRelationshipData): string {
  return `${issue.repoOwner}/${issue.repoName}#${issue.number}`
}

function dedupeRelationships(issues: IssueRelationshipData[]): IssueRelationshipData[] {
  const deduped = new Map<string, IssueRelationshipData>()
  for (const issue of issues) {
    deduped.set(relationshipKey(issue), issue)
  }
  return [...deduped.values()]
}

function formatResolvedIssueLabel(item: ResolvedItem): string {
  if (item.repoOwner && item.repoName && item.issueNumber) {
    return `${item.repoOwner}/${item.repoName}#${item.issueNumber}`
  }

  if (item.repoOwner && item.repoName) {
    return `${item.repoOwner}/${item.repoName}`
  }

  return item.domId
}

async function getBulkRelationshipValidationErrors(
  resolvedItems: ResolvedItem[],
  relationships: BulkEditRelationshipsUpdate | undefined,
): Promise<string[]> {
  if (!relationships) return []

  const errors = new Set<string>()
  const blockedByAdd = dedupeRelationships(relationships.blockedBy.add)
  const blockingAdd = dedupeRelationships(relationships.blocking.add)
  const blockedByRemoveKeys = new Set(dedupeRelationships(relationships.blockedBy.remove).map(relationshipKey))
  const blockingRemoveKeys = new Set(dedupeRelationships(relationships.blocking.remove).map(relationshipKey))
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

    const currentBlockedBy = await listIssueRelationshipsSafe('blocked_by', item.repoOwner, item.repoName, item.issueNumber)
    const currentBlocking = await listIssueRelationshipsSafe('blocking', item.repoOwner, item.repoName, item.issueNumber)
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
        errors.add(`${itemLabel} cannot both block and be blocked by ${formatRelationshipLabel(issue)}.`)
      }
    }

    for (const issue of blockingAdd) {
      const key = relationshipKey(issue)
      if (issue.databaseId === item.issueDatabaseId) {
        errors.add(`${itemLabel} cannot block itself.`)
        continue
      }

      if (effectiveBlockedByKeys.has(key) || blockedByAddKeys.has(key)) {
        errors.add(`${itemLabel} cannot both block and be blocked by ${formatRelationshipLabel(issue)}.`)
      }
    }
  }

  return [...errors]
}

function buildBulkRelationshipTasks(
  item: ResolvedItem,
  relationships: BulkEditRelationshipsUpdate | undefined,
  tabId?: number,
): import('../../lib/queue').QueueTask[] {
  if (!relationships || item.typename !== 'Issue' || !item.issueDatabaseId || !item.issueNumber) {
    return []
  }

  const issueDatabaseId = item.issueDatabaseId
  const issueNumber = item.issueNumber
  const tasks: import('../../lib/queue').QueueTask[] = []

  const nextParent = relationships.parent.set
  if ((nextParent && nextParent.databaseId && nextParent.databaseId !== issueDatabaseId) || relationships.parent.clear) {
    tasks.push({
      id: `bulk-rel-parent-${item.domId}`,
      detail: nextParent ? `Parent → ${formatRelationshipLabel(nextParent)}` : 'Clear parent relationship',
      run: async () => {
        if (nextParent?.databaseId && nextParent.databaseId !== issueDatabaseId) {
          if (item.currentParent?.databaseId === nextParent.databaseId) {
            return
          }

          await withRateLimitRetry(
            () => githubRest(`/repos/${encodeURIComponent(nextParent.repoOwner)}/${encodeURIComponent(nextParent.repoName)}/issues/${nextParent.number}/sub_issues`, {
              method: 'POST',
              body: JSON.stringify({ sub_issue_id: issueDatabaseId, replace_parent: true }),
            }),
            tabId,
          )
          await sleep(1000)
          return
        }

        if (!relationships.parent.clear) {
          return
        }

        const currentParent = item.currentParent ?? await getCurrentParentRelationship(
          item.repoOwner,
          item.repoName,
          issueNumber,
          tabId,
        )

        if (!currentParent) {
          console.warn('[rgp:bg] parent clear requested but no current parent could be resolved', {
            domId: item.domId,
            repoOwner: item.repoOwner,
            repoName: item.repoName,
            issueNumber,
          })
          return
        }

        try {
          await withRateLimitRetry(
            () => githubRest(`/repos/${encodeURIComponent(currentParent.repoOwner)}/${encodeURIComponent(currentParent.repoName)}/issues/${currentParent.number}/sub_issue`, {
              method: 'DELETE',
              body: JSON.stringify({ sub_issue_id: issueDatabaseId }),
            }),
            tabId,
          )
          await sleep(1000)
        } catch (error) {
          console.error('[rgp:bg] failed to clear parent relationship', {
            domId: item.domId,
            repoOwner: item.repoOwner,
            repoName: item.repoName,
            issueNumber,
            currentParent,
            error,
          })
          if (!(error instanceof GitHubRequestError) || error.status !== 404) {
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
        const current = await listIssueRelationshipsSafe('blocked_by', item.repoOwner, item.repoName, issueNumber, tabId)
        const currentByKey = new Map(current.map(issue => [relationshipKey(issue), issue]))

        const removeBlockedBy = async (issue: IssueRelationshipData) => {
          if (!issue.databaseId) return
          await withRateLimitRetry(
            () => githubRest(`/repos/${encodeURIComponent(item.repoOwner)}/${encodeURIComponent(item.repoName)}/issues/${issueNumber}/dependencies/blocked_by/${issue.databaseId}`, {
              method: 'DELETE',
            }),
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
            () => githubRest(`/repos/${encodeURIComponent(item.repoOwner)}/${encodeURIComponent(item.repoName)}/issues/${issueNumber}/dependencies/blocked_by`, {
              method: 'POST',
              body: JSON.stringify({ issue_id: issue.databaseId }),
            }),
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
        const current = await listIssueRelationshipsSafe('blocking', item.repoOwner, item.repoName, issueNumber, tabId)
        const currentByKey = new Map(current.map(issue => [relationshipKey(issue), issue]))

        const removeBlocking = async (issue: IssueRelationshipData) => {
          await withRateLimitRetry(
            () => githubRest(`/repos/${encodeURIComponent(issue.repoOwner)}/${encodeURIComponent(issue.repoName)}/issues/${issue.number}/dependencies/blocked_by/${issueDatabaseId}`, {
              method: 'DELETE',
            }),
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
            () => githubRest(`/repos/${encodeURIComponent(issue.repoOwner)}/${encodeURIComponent(issue.repoName)}/issues/${issue.number}/dependencies/blocked_by`, {
              method: 'POST',
              body: JSON.stringify({ issue_id: issueDatabaseId }),
            }),
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

// ─── Deep Duplicate ───────────────────────────────────────────────────────────

async function runDeepDuplicate(
  itemId: string,
  _projectId: string,
  tabId?: number,
  plan?: DuplicateItemPlan,
) {
  if (activeDuplicateCount >= MAX_CONCURRENT_DUPLICATES) {
    console.warn('[rgp:bg] max concurrent duplicates reached, rejecting new request')
    return
  }

  activeDuplicateCount++
  const processId = `dup-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  logger.log('[rgp:bg] runDeepDuplicate starting', { itemId, processId })

  await broadcastQueue(
    { total: 2, completed: 0, paused: false, status: 'Fetching item…', processId, label: 'Deep duplicate' },
    tabId,
  )

  try {
    let details: ProjectItemDetails
    try {
      details = await withRateLimitRetry(
        () => gql<ProjectItemDetails>(GET_PROJECT_ITEM_DETAILS, { itemId }),
        tabId,
      )
    } catch (error) {
      console.error('[rgp:bg] failed to fetch item details', error)
      return
    }

    const source = details.node
    if (!source) {
      console.error('[rgp:bg] item not found')
      return
    }

    const issue = source.content
    if (!issue?.title) {
      console.error('[rgp:bg] item is not a GitHub Issue (Draft/PR)')
      return
    }

    const sourceFieldValues = source.fieldValues.nodes.filter(Boolean)
    const supportedFieldTypes = new Set(['TEXT', 'SINGLE_SELECT', 'ITERATION', 'NUMBER', 'DATE'])
    const filteredFieldValues = sourceFieldValues.filter(
      (fieldValue): fieldValue is FieldValue => !!fieldValue.field && supportedFieldTypes.has(fieldValue.field.dataType),
    )
    const sourceParent: IssueRelationshipData | undefined = issue.parent
      ? {
          nodeId: issue.parent.id,
          databaseId: issue.parent.databaseId,
          number: issue.parent.number,
          title: issue.parent.title,
          repoOwner: issue.parent.repository.owner.login,
          repoName: issue.parent.repository.name,
        }
      : undefined

    const enabledFieldPlans = plan?.fieldValues
      ? plan.fieldValues.filter(field => field.enabled)
      : filteredFieldValues
          .map(fieldValue => ({
            fieldId: fieldValue.field.id,
            enabled: true,
            value: buildFieldValueFromSource(fieldValue) ?? {},
          }))
          .filter(field => field.enabled)

    const fieldNameById = new Map(filteredFieldValues.map(fieldValue => [fieldValue.field.id, fieldValue.field.name]))
    const title = plan?.title.enabled === false ? issue.title : (plan?.title.value ?? issue.title)
    const body = plan ? (plan.body.enabled ? plan.body.value : undefined) : issue.body
    const assigneeIds = plan ? (plan.assignees.enabled ? plan.assignees.ids : []) : issue.assignees.nodes.map(a => a.id)
    const labelIds = plan ? (plan.labels.enabled ? plan.labels.ids : []) : issue.labels.nodes.map(label => label.id)
    const issueTypeId = plan ? (plan.issueType.enabled ? plan.issueType.id : undefined) : issue.issueType?.id
    const issueTypeName = plan?.issueType.name ?? issue.issueType?.name
    const parentRelationship = plan?.relationships.parent
      ? (plan.relationships.parent.enabled ? plan.relationships.parent.issue : undefined)
      : sourceParent
    const blockedByRelationships = plan?.relationships.blockedBy
      ? (plan.relationships.blockedBy.enabled ? plan.relationships.blockedBy.issues : [])
      : []
    const blockingRelationships = plan?.relationships.blocking
      ? (plan.relationships.blocking.enabled ? plan.relationships.blocking.issues : [])
      : []
    const hasIssueType = Boolean(issueTypeId)
    const hasLabels = labelIds.length > 0
    const trackerLabel = title
    const totalSteps = 3 + enabledFieldPlans.length + (hasIssueType ? 1 : 0) + (hasLabels ? 1 : 0) + (parentRelationship?.nodeId ? 1 : 0) + blockedByRelationships.length + blockingRelationships.length

    let newIssueId = ''
    let newIssueDatabaseId: number | null = null
    let newIssueNumber: number | null = null
    let newItemId = ''

    const tasks: import('../../lib/queue').QueueTask[] = [
      {
        id: 'clone-issue',
        detail: title,
        run: async () => {
          logger.log('[rgp:bg] cloning issue', { repositoryId: issue.repository.id, title })
          interface CloneResult {
            createIssue: {
              issue: {
                id: string
                databaseId: number
                number: number
              }
            }
          }

          const result = await withRateLimitRetry(
            () =>
              gql<CloneResult>(CLONE_ISSUE, {
                repositoryId: issue.repository.id,
                title,
                body,
                assigneeIds,
              }),
            tabId,
          )

          newIssueId = result.createIssue.issue.id
          newIssueDatabaseId = result.createIssue.issue.databaseId
          newIssueNumber = result.createIssue.issue.number
          await sleep(1000)
        },
      },
      ...(hasLabels
        ? [{
            id: 'add-labels',
            detail: `${labelIds.length} label${labelIds.length !== 1 ? 's' : ''}`,
            run: async () => {
              logger.log('[rgp:bg] adding labels', { labelIds, issueId: newIssueId })
              await withRateLimitRetry(
                () => gql(ADD_LABELS, { labelableId: newIssueId, labelIds }),
                tabId,
              )
              await sleep(1000)
            },
          }]
        : []),
      {
        id: 'attach-project',
        detail: issue.repository.name,
        run: async () => {
          logger.log('[rgp:bg] attaching to project', { newIssueId, projectId: source.project.id })
          interface AttachResult { addProjectV2ItemById: { item: { id: string } } }
          const result = await withRateLimitRetry(
            () =>
              gql<AttachResult>(ATTACH_TO_PROJECT, {
                projectId: source.project.id,
                contentId: newIssueId,
              }),
            tabId,
          )
          newItemId = result.addProjectV2ItemById.item.id
          await sleep(1000)
        },
      },
      ...(hasIssueType && issueTypeId
        ? [{
            id: 'issue-type',
            detail: issueTypeName,
            run: async () => {
              logger.log('[rgp:bg] applying issue type', { issueTypeId, issueId: newIssueId })
              await withRateLimitRetry(
                () => gql(UPDATE_ISSUE_TYPE, { issueId: newIssueId, issueTypeId }),
                tabId,
              )
              await sleep(1000)
            },
          }]
        : []),
      ...enabledFieldPlans.map(field => ({
        id: `field-${(fieldNameById.get(field.fieldId) ?? field.fieldId).toLowerCase().replace(/\s+/g, '-')}`,
        detail: fieldNameById.get(field.fieldId) ?? field.fieldId,
        run: async () => {
          const value = field.value
          const values = Object.values(value)
          if (values.length === 0 || values.every(candidate => candidate === '' || candidate == null)) {
            return
          }

          await withRateLimitRetry(
            () => gql(UPDATE_PROJECT_FIELD, {
              projectId: source.project.id,
              itemId: newItemId,
              fieldId: field.fieldId,
              value,
            }),
            tabId,
          )
          await sleep(1000)
        },
      })),
      ...(parentRelationship?.nodeId
        ? [{
            id: `rel-parent-${parentRelationship.number}`,
            detail: formatRelationshipLabel(parentRelationship),
            run: async () => {
              logger.log('[rgp:bg] linking sub-issue to parent', { parentId: parentRelationship.nodeId, subIssueId: newIssueId })
              await withRateLimitRetry(
                () => gql(ADD_SUB_ISSUE, { issueId: parentRelationship.nodeId, subIssueId: newIssueId }),
                tabId,
              )
              await sleep(1000)
            },
          }]
        : []),
      ...blockedByRelationships.map(relationship => ({
        id: `rel-blocked-by-${relationship.databaseId ?? relationship.number}`,
        detail: formatRelationshipLabel(relationship),
        run: async () => {
          if (!newIssueNumber || !relationship.databaseId) {
            return
          }

          logger.log('[rgp:bg] copying blocked-by relationship', {
            issueNumber: newIssueNumber,
            blockingIssueId: relationship.databaseId,
          })
          await withRateLimitRetry(
            () => githubRest(`/repos/${encodeURIComponent(issue.repository.owner.login)}/${encodeURIComponent(issue.repository.name)}/issues/${newIssueNumber}/dependencies/blocked_by`, {
              method: 'POST',
              body: JSON.stringify({ issue_id: relationship.databaseId }),
            }),
            tabId,
          )
          await sleep(1000)
        },
      })),
      ...blockingRelationships.map(relationship => ({
        id: `rel-blocking-${relationship.databaseId ?? relationship.number}`,
        detail: formatRelationshipLabel(relationship),
        run: async () => {
          if (!newIssueDatabaseId) {
            return
          }

          logger.log('[rgp:bg] copying blocking relationship', {
            issueNumber: relationship.number,
            blockingIssueId: newIssueDatabaseId,
          })
          await withRateLimitRetry(
            () => githubRest(`/repos/${encodeURIComponent(relationship.repoOwner)}/${encodeURIComponent(relationship.repoName)}/issues/${relationship.number}/dependencies/blocked_by`, {
              method: 'POST',
              body: JSON.stringify({ issue_id: newIssueDatabaseId }),
            }),
            tabId,
          )
          await sleep(1000)
        },
      })),
    ]

    await processQueue(tasks, async state => {
      await broadcastQueue(
        {
          total: totalSteps,
          completed: 1 + state.completed,
          paused: state.paused,
          retryAfter: state.retryAfter,
          status: state.completed === 0 ? 'Cloning issue...' : 'Applying duplicate plan...',
          detail: state.detail,
          processId,
          label: trackerLabel,
        },
        tabId,
      )
    }, processId)

    await broadcastQueue({ total: 0, completed: 0, paused: false, status: 'Done!', processId, label: trackerLabel }, tabId)
    logger.log('[rgp:bg] deep duplicate complete', { processId })
  } finally {
    activeDuplicateCount--
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface ResolvedItem {
  domId: string
  issueNodeId: string
  projectItemId: string
  repoOwner: string
  repoName: string
  issueDatabaseId?: number
  issueNumber?: number
  currentParent?: IssueRelationshipData
  typename?: 'Issue' | 'PullRequest'
}

async function getRepositoryId(owner: string, name: string): Promise<string> {
  const data = await gql<{ repository: { id: string } }>(GET_REPOSITORY_ID, { owner, name })
  return data.repository.id
}

/**
 * Convert DOM-extracted item IDs (e.g. "issue:3960969873" from data-hovercard-subject-tag,
 * or "issue-123" from link scraping) to real ProjectV2Item Node IDs.
 *
 * Approach: Fetch the project's items with their content databaseId,
 * then match the DOM-extracted database IDs against the results.
 */
async function resolveProjectItemIds(domIds: string[], projectId: string, tabId?: number): Promise<ResolvedItem[]> {
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
    console.warn('[rgp:bg] could not parse DOM ID:', domId)
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
      console.warn('[rgp:bg] project node returned null items')
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
          currentParent: item.content.parent ? {
            nodeId: item.content.parent.id,
            databaseId: item.content.parent.databaseId,
            number: item.content.parent.number,
            title: item.content.parent.title,
            repoOwner: item.content.parent.repository.owner.login,
            repoName: item.content.parent.repository.name,
          } : undefined,
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
    console.warn('[rgp:bg] could not resolve these database IDs:', [...remaining])
  }

  return results
}

interface ResolvedItemWithTitle extends ResolvedItem {
  title: string
  typename: 'Issue' | 'PullRequest'
}

async function resolveProjectItemIdsWithTitles(domIds: string[], projectId: string): Promise<ResolvedItemWithTitle[]> {
  const databaseIdMap = new Map<number, string>()
  for (const domId of domIds) {
    const colonMatch = domId.match(/^issue:(\d+)$/)
    if (colonMatch) { databaseIdMap.set(parseInt(colonMatch[1], 10), domId); continue }
    const dashMatch = domId.match(/^issue-(\d+)$/)
    if (dashMatch) { databaseIdMap.set(parseInt(dashMatch[1], 10), domId); continue }
    console.warn('[rgp:bg] could not parse DOM ID:', domId)
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
    const page = await withRateLimitRetry(
      () => gql<RenameItemsResult>(GET_PROJECT_ITEMS_FOR_RENAME, { projectId, cursor }),
    )

    const items = page.node?.items
    if (!items) { console.warn('[rgp:bg] project node returned null items'); break }

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
    console.warn('[rgp:bg] could not resolve these database IDs for rename:', [...remaining])
  }

  return results
}

async function broadcastQueue(
  state: {
    total: number
    completed: number
    paused: boolean
    retryAfter?: number
    status?: string
    detail?: string
    processId?: string
    label?: string
  },
  tabId?: number,
) {
  try {
    await sendMessage('queueStateUpdate', state, tabId)
  } catch (err) {
    // Swallow errors - tab may have navigated away while job was running
    console.warn('[rgp:bg] broadcastQueue failed (tab may be gone):', err)
  }
}

async function withRateLimitRetry<T>(fn: () => Promise<T>, tabId?: number): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      const e = err as { status?: number; retryAfter?: number }
      if (e.status === 403 || e.status === 429) {
        const retryAfter = e.retryAfter ?? 60
        console.warn('[rgp:bg] rate limited, retrying in', retryAfter, 's (attempt', attempt + 1, '/ 3)')
        await broadcastQueue({ total: 0, completed: 0, paused: true, retryAfter }, tabId)
        await sleep(retryAfter * 1000)
        await broadcastQueue({ total: 0, completed: 0, paused: false }, tabId)
      } else {
        console.error('[rgp:bg] task failed permanently', err)
        throw err
      }
    }
  }
  throw lastErr
}
