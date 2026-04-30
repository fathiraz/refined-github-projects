import { onMessage } from '@/lib/messages'
import { gql } from '@/lib/graphql-client'
import {
  GET_REPO_ASSIGNEES,
  GET_REPO_LABELS,
  GET_REPO_MILESTONES,
  GET_REPO_ISSUE_TYPES,
  SEARCH_RELATIONSHIP_ISSUES,
  GET_VIEWER_TOP_REPOS,
  GET_VIEWER_REPOS_PAGE,
  GET_POSSIBLE_TRANSFER_REPOS,
  GET_PROJECT_ITEMS_FOR_REORDER,
  GET_REPOSITORY_ISSUE_BY_NUMBER,
  GET_REPOSITORY_RECENT_OPEN_ISSUES,
} from '@/lib/graphql-queries'
import { Effect } from 'effect'

import { sleep } from '@/lib/queue'
import { logger } from '@/lib/debug-logger'
import { runHandler } from '@/lib/effect-runtime'

import { withRateLimitRetry } from '@/background/rest-helpers'
import { parseExactIssueReference, buildRelationshipSearchQuery, mapIssueNodeToRelationshipSearchResult, dedupeRelationships } from '@/background/relationship-helpers'
import { getProjectFieldsData, resolveProjectItemIds, resolveProjectItemIdsWithTitles } from '@/background/project-helpers'
import { ProjectService } from '@/background/project-service'
import { provideBackground } from '@/background/runtime-ext'

import type {
  IssueTypeNode,
  IssueTypesResult,
  RelationshipSearchIssueNode,
  RelationshipSearchResult,
} from '@/background/types'

export function registerFieldHandlers(): void {
  onMessage('searchRepoMetadata', async ({ data }) => {
    logger.log('[rgp:bg] searchRepoMetadata received', data)
    try {
      if (data.type === 'ASSIGNEES') {
        const result = await gql<{
          repository: {
            assignableUsers: {
              nodes: { id: string; login: string; name: string; avatarUrl: string }[]
            }
          }
        }>(GET_REPO_ASSIGNEES, { owner: data.owner, name: data.name, q: data.q })
        const raw = result.repository?.assignableUsers?.nodes || []
        return raw.map((u) => ({ id: u.id, name: u.login, avatarUrl: u.avatarUrl, color: '' }))
      } else if (data.type === 'LABELS') {
        const result = await gql<{
          repository: { labels: { nodes: { id: string; name: string; color: string }[] } }
        }>(GET_REPO_LABELS, { owner: data.owner, name: data.name, q: data.q })
        const raw = result.repository?.labels?.nodes || []
        return raw.map((l) => ({ id: l.id, name: l.name, color: '#' + l.color }))
      } else if (data.type === 'MILESTONES') {
        const result = await gql<{
          repository: { milestones: { nodes: { id: string; title: string; number: number }[] } }
        }>(GET_REPO_MILESTONES, { owner: data.owner, name: data.name, q: data.q || undefined })
        const raw = result.repository?.milestones?.nodes || []
        return raw.map((m) => ({ id: m.id, name: m.title, color: '' }))
      } else if (data.type === 'ISSUE_TYPES') {
        // fetch all repository issue types with pagination
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

        // only exclude explicitly disabled types
        let raw = allTypes.filter((t) => t.isEnabled !== false)

        // client-side filtering since GitHub API doesn't support search for issue types
        if (data.q) {
          const q = data.q.toLowerCase()
          raw = raw.filter((t) => t.name.toLowerCase().includes(q))
        }

        raw = raw.sort((a, b) => a.name.localeCompare(b.name))

        return raw.map((t) => ({
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
        const result = await withRateLimitRetry(() =>
          gql<RelationshipSearchResult>(GET_REPOSITORY_RECENT_OPEN_ISSUES, {
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
        const exactResult = await withRateLimitRetry(() =>
          gql<RelationshipSearchResult>(
            GET_REPOSITORY_ISSUE_BY_NUMBER,
            {
              owner: exactReference.owner,
              name: exactReference.repoName,
              number: exactReference.number,
            },
            { silent: true },
          ),
        )

        const exactIssue = exactResult.repository?.issue
        if (exactIssue) {
          return [mapIssueNodeToRelationshipSearchResult(exactIssue)]
        }
      }

      const result = await withRateLimitRetry(() =>
        gql<RelationshipSearchResult>(SEARCH_RELATIONSHIP_ISSUES, {
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

  onMessage('searchTransferTargets', async ({ data }) => {
    type RepoNode = {
      id: string
      name: string
      nameWithOwner: string
      isPrivate: boolean
      description: string | null
      hasIssuesEnabled: boolean
      isArchived: boolean
    }
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
      trimmedQuery === '' ||
      repo.name.toLowerCase().includes(trimmedQuery) ||
      repo.nameWithOwner.toLowerCase().includes(trimmedQuery)

    if (data.firstItemId && data.projectId) {
      try {
        const resolved = await resolveProjectItemIds([data.firstItemId], data.projectId)
        const issueNodeId = resolved[0]?.issueNodeId
        if (issueNodeId) {
          const result = await gql<{
            node: { possibleTransferRepositoriesForViewer?: { edges: { node: RepoNode }[] } }
          }>(GET_POSSIBLE_TRANSFER_REPOS, { issueId: issueNodeId, first: 100 }, { silent: true })
          let nodes =
            result.node?.possibleTransferRepositoriesForViewer?.edges.map((e) => e.node) ?? []
          nodes = nodes.filter((r) => isTransferEligible(r) && matchesQuery(r))
          return nodes
        }
      } catch (e) {
        console.warn('[rgp:bg] possibleTransferRepositoriesForViewer failed, falling back', e)
      }
    }

    let nodes: RepoNode[]
    if (trimmedQuery === '') {
      const result = await gql<{ viewer: { topRepositories: { nodes: RepoNode[] } } }>(
        GET_VIEWER_TOP_REPOS,
        { first: 5 },
      )
      nodes = result.viewer?.topRepositories.nodes ?? []
    } else {
      const matches: RepoNode[] = []
      const seenRepoIds = new Set<string>()
      let cursor: string | null = null
      let hasNextPage = true

      while (hasNextPage && matches.length < 20) {
        const result: ViewerReposPage = await gql<ViewerReposPage>(GET_VIEWER_REPOS_PAGE, {
          first: 100,
          after: cursor,
        })
        const repositories: ViewerReposPage['viewer']['repositories'] | undefined =
          result.viewer?.repositories
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

  onMessage('getProjectFields', ({ data }) =>
    runHandler(
      'getProjectFields',
      provideBackground(
        Effect.gen(function* () {
          logger.log('[rgp:bg] getProjectFields received', data)
          const projectService = yield* ProjectService
          const { project } = yield* projectService.getProjectFieldsData(
            data.owner,
            data.number,
            data.isOrg,
          )
          return {
            id: project?.id || '',
            title: project?.title || 'Project',
            fields: project?.fields.nodes.filter(Boolean) || [],
          }
        }),
      ),
    ),
  )

  onMessage('getItemTitles', ({ data }) =>
    runHandler(
      'getItemTitles',
      provideBackground(
        Effect.gen(function* () {
          logger.log('[rgp:bg] getItemTitles received', {
            itemCount: data.itemIds.length,
            projectId: data.projectId,
          })
          const projectService = yield* ProjectService
          const resolved = yield* projectService.resolveProjectItemIdsWithTitles(
            data.itemIds,
            data.projectId,
          )
          return resolved.map((r) => ({
            domId: r.domId,
            issueNodeId: r.issueNodeId,
            title: r.title,
            typename: r.typename,
          }))
        }),
      ),
    ),
  )

  onMessage('getReorderContext', async ({ data }) => {
    logger.log('[rgp:bg] getReorderContext received', { itemCount: data.itemIds.length })
    const { project } = await getProjectFieldsData(data.owner, data.number, data.isOrg)
    if (!project) throw new Error('Project not found')

    // build map from content databaseId → domId for selected items
    const selectedDbIdMap = new Map<number, string>()
    for (const domId of data.itemIds) {
      const m = domId.match(/^issue:(\d+)$/) || domId.match(/^issue-(\d+)$/)
      if (m) selectedDbIdMap.set(parseInt(m[1], 10), domId)
    }

    // paginate through all project items
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
    const selectedItems: Array<{
      domId: string
      memexItemId: number
      nodeId: string
      title: string
    }> = []
    // track contentDbId → entry for DOM-order re-sorting
    const contentDbIdToEntry = new Map<
      number,
      { memexItemId: number; nodeId: string; title: string }
    >()
    let cursor: string | null = null

    while (true) {
      const page = await withRateLimitRetry(() =>
        gql<ReorderItemsResult>(GET_PROJECT_ITEMS_FOR_REORDER, { projectId: project.id, cursor }),
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
            selectedItems.push({
              domId: selectedDbIdMap.get(contentDbId)!,
              memexItemId,
              nodeId,
              title,
            })
          }
        }
      }

      if (!items.pageInfo.hasNextPage) break
      cursor = items.pageInfo.endCursor
      await sleep(500)
    }

    // re-sort allOrderedItems to match DOM visual order when provided
    if (data.allDomIds?.length) {
      const sorted: Array<{ memexItemId: number; nodeId: string; title: string }> = []
      for (const domId of data.allDomIds) {
        const m = domId.match(/^issue:(\d+)$/) || domId.match(/^issue-(\d+)$/)
        if (!m) continue
        const entry = contentDbIdToEntry.get(parseInt(m[1], 10))
        if (entry) sorted.push(entry)
      }
      // append items not visible in the DOM (filtered/hidden) at the end
      const sortedSet = new Set(sorted.map((i) => i.memexItemId))
      const rest = allOrderedItems.filter((i) => !sortedSet.has(i.memexItemId))
      allOrderedItems.length = 0
      allOrderedItems.push(...sorted, ...rest)
    }

    return { projectId: project.id, allOrderedItems, selectedItems }
  })
}
