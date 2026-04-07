import { onMessage } from '@/lib/messages'
import type {
  BulkRelationshipValidationResult,
  HierarchyData,
  IssueRelationshipData,
  ItemPreviewData,
} from '@/lib/messages'
import { gql } from '@/lib/graphql/client'
import { GET_PROJECT_ITEM_DETAILS } from '@/lib/graphql/queries'
import { logger } from '@/lib/debug-logger'

import type { DateFieldValue, NumberFieldValue, ProjectItemDetails } from '../types'

import {
  previewCache,
  PREVIEW_CACHE_TTL_MS,
  hierarchyCache,
  HIERARCHY_CACHE_TTL_MS,
  pruneExpiredCache,
  cacheResolvedItems,
} from '../cache'

import {
  getProjectFieldsData,
  resolveProjectItemIds,
  withRateLimitRetry,
  listIssueRelationshipsSafe,
  listSubIssuesSafe,
  getBulkRelationshipValidationErrors,
} from '../helpers'

export function registerHierarchyHandlers(): void {
  onMessage('validateBulkRelationshipUpdates', async ({ data }) => {
    const resolvedItems = await resolveProjectItemIds(data.itemIds, data.projectId)
    cacheResolvedItems(data.projectId, data.itemIds, resolvedItems)
    const errors = await getBulkRelationshipValidationErrors(resolvedItems, data.relationships)

    const result: BulkRelationshipValidationResult = { errors }
    return result
  })

  onMessage('getItemPreview', async ({ data }) => {
    logger.log('[rgp:bg] getItemPreview received', data)

    // Check preview cache first
    const cacheKey = `${data.owner}/${data.number}/${data.itemId}`
    const previewCached = previewCache.get(cacheKey)
    if (previewCached && previewCached.expiresAt > Date.now()) return previewCached.data

    // 1. Fetch project field definitions first — also gives us the real projectV2.id
    const { project: projectV2 } = await getProjectFieldsData(data.owner, data.number, data.isOrg)
    const fieldDefs = new Map((projectV2?.fields.nodes ?? []).filter(Boolean).map((f) => [f.id, f]))

    // 2. Resolve DOM itemId (e.g. "issue:3960969873") → real ProjectV2Item node ID
    let resolvedItemId = data.itemId
    if (/^issue[:-]\d+$/.test(data.itemId)) {
      if (!projectV2?.id) throw new Error('Could not fetch project fields — cannot resolve item ID')
      const resolved = await resolveProjectItemIds([data.itemId], projectV2.id)
      if (resolved.length === 0)
        throw new Error(
          `Item ${data.itemId} not found in project — it may belong to a different project`,
        )
      resolvedItemId = resolved[0].projectItemId
    }

    // 3. Fetch item details with the correct node ID
    const details = await withRateLimitRetry(() =>
      gql<ProjectItemDetails>(GET_PROJECT_ITEM_DETAILS, { itemId: resolvedItemId }),
    )
    const source = details.node
    if (!source) throw new Error('Project item not found — ID resolution may have failed')
    const issue = source.content
    if (!issue?.title) throw new Error('Item is not a supported type (must be a GitHub Issue)')
    const [blockedBy, blocking] = await Promise.all([
      listIssueRelationshipsSafe(
        'blocked_by',
        issue.repository.owner.login,
        issue.repository.name,
        issue.number,
      ),
      listIssueRelationshipsSafe(
        'blocking',
        issue.repository.owner.login,
        issue.repository.name,
        issue.number,
      ),
    ])

    // 4. Correlate field values with definitions
    const fields: ItemPreviewData['fields'] = []
    for (const fv of source.fieldValues.nodes.filter(Boolean)) {
      if (!fv.field) continue // skips unrecognized field types (Number, Date, Milestone, etc.)
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
        const opt = def.options?.find((o) => o.id === fv.optionId)
        if (opt) {
          entry.optionName = opt.name
          entry.optionColor = opt.color
        }
        entry.options = def.options
      } else if (def.dataType === 'ITERATION' && 'iterationId' in fv) {
        entry.iterationId = fv.iterationId
        const iter = def.configuration?.iterations.find((i) => i.id === fv.iterationId)
        if (iter) {
          entry.iterationTitle = iter.title
          entry.iterationStartDate = iter.startDate
        }
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
      assignees: issue.assignees.nodes.map((a) => ({
        id: a.id,
        login: a.login,
        avatarUrl: a.avatarUrl,
      })),
      labels: issue.labels.nodes.map((l) => ({ id: l.id, name: l.name, color: '#' + l.color })),
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
      if (resolved.length === 0)
        throw new Error(
          `Item ${data.itemId} not found in project — it may belong to a different project`,
        )
      resolvedItemId = resolved[0].projectItemId
    }

    // Fetch item details for parent relationship (GraphQL)
    const details = await withRateLimitRetry(() =>
      gql<ProjectItemDetails>(GET_PROJECT_ITEM_DETAILS, { itemId: resolvedItemId }),
    )
    const source = details.node
    if (!source) throw new Error('Project item not found')
    const issue = source.content
    if (!issue?.title) throw new Error('Item is not a supported type')

    // Fetch sub-issues, blockedBy, blocking concurrently (all GETs — safe to parallelize)
    const [subIssues, blockedBy, blocking] = await Promise.all([
      listSubIssuesSafe(issue.repository.owner.login, issue.repository.name, issue.number),
      listIssueRelationshipsSafe(
        'blocked_by',
        issue.repository.owner.login,
        issue.repository.name,
        issue.number,
      ),
      listIssueRelationshipsSafe(
        'blocking',
        issue.repository.owner.login,
        issue.repository.name,
        issue.number,
      ),
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
}
