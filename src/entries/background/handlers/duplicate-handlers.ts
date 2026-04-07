// ─── Duplicate handlers ───────────────────────────────────────────────────────

import { onMessage } from '@/lib/messages'
import type { DuplicateItemPlan, IssueRelationshipData } from '@/lib/messages'
import { gql } from '@/lib/graphql/client'
import { GET_PROJECT_ITEM_DETAILS } from '@/lib/graphql/queries'
import {
  CLONE_ISSUE,
  ATTACH_TO_PROJECT,
  UPDATE_PROJECT_FIELD,
  ADD_SUB_ISSUE,
  ADD_LABELS,
  UPDATE_ISSUE_TYPE,
} from '@/lib/graphql/mutations'
import { processQueue, sleep } from '@/lib/queue'
import type { QueueTask } from '@/lib/queue'
import { logger } from '@/lib/debug-logger'

import { isDuplicateFull, acquireDuplicate, releaseDuplicate } from '../concurrency'
import {
  broadcastQueue,
  withRateLimitRetry,
  buildFieldValueFromSource,
  formatRelationshipLabel,
  githubRest,
} from '../helpers'
import type { ProjectItemDetails, FieldValue } from '../types'

// ─── runDeepDuplicate (private) ──────────────────────────────────────────────

async function runDeepDuplicate(
  itemId: string,
  _projectId: string,
  tabId?: number,
  plan?: DuplicateItemPlan,
) {
  if (isDuplicateFull()) {
    console.warn('[rgp:bg] max concurrent duplicates reached, rejecting new request')
    return
  }

  acquireDuplicate()
  const processId = `dup-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  logger.log('[rgp:bg] runDeepDuplicate starting', { itemId, processId })

  await broadcastQueue(
    {
      total: 2,
      completed: 0,
      paused: false,
      status: 'Fetching item…',
      processId,
      label: 'Deep duplicate',
    },
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
      await broadcastQueue(
        {
          total: 0,
          completed: 0,
          paused: false,
          status: 'Done!',
          processId,
          label: 'Deep duplicate',
        },
        tabId,
      )
      releaseDuplicate()
      return
    }

    const source = details.node
    if (!source) {
      console.error('[rgp:bg] item not found')
      await broadcastQueue(
        {
          total: 0,
          completed: 0,
          paused: false,
          status: 'Done!',
          processId,
          label: 'Deep duplicate',
        },
        tabId,
      )
      releaseDuplicate()
      return
    }

    const issue = source.content
    if (!issue?.title) {
      console.error('[rgp:bg] item is not a GitHub Issue (Draft/PR)')
      await broadcastQueue(
        {
          total: 0,
          completed: 0,
          paused: false,
          status: 'Done!',
          processId,
          label: 'Deep duplicate',
        },
        tabId,
      )
      releaseDuplicate()
      return
    }

    const sourceFieldValues = source.fieldValues.nodes.filter(Boolean)
    const supportedFieldTypes = new Set(['TEXT', 'SINGLE_SELECT', 'ITERATION', 'NUMBER', 'DATE'])
    const filteredFieldValues = sourceFieldValues.filter(
      (fieldValue): fieldValue is FieldValue =>
        !!fieldValue.field && supportedFieldTypes.has(fieldValue.field.dataType),
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
      ? plan.fieldValues.filter((field) => field.enabled)
      : filteredFieldValues
          .map((fieldValue) => ({
            fieldId: fieldValue.field.id,
            enabled: true,
            value: buildFieldValueFromSource(fieldValue) ?? {},
          }))
          .filter((field) => field.enabled)

    const fieldNameById = new Map(
      filteredFieldValues.map((fieldValue) => [fieldValue.field.id, fieldValue.field.name]),
    )
    const title = plan?.title.enabled === false ? issue.title : (plan?.title.value ?? issue.title)
    const body = plan ? (plan.body.enabled ? plan.body.value : undefined) : issue.body
    const assigneeIds = plan
      ? plan.assignees.enabled
        ? plan.assignees.ids
        : []
      : issue.assignees.nodes.map((a) => a.id)
    const labelIds = plan
      ? plan.labels.enabled
        ? plan.labels.ids
        : []
      : issue.labels.nodes.map((label) => label.id)
    const issueTypeId = plan
      ? plan.issueType.enabled
        ? plan.issueType.id
        : undefined
      : issue.issueType?.id
    const issueTypeName = plan?.issueType.name ?? issue.issueType?.name
    const parentRelationship = plan?.relationships.parent
      ? plan.relationships.parent.enabled
        ? plan.relationships.parent.issue
        : undefined
      : sourceParent
    const blockedByRelationships = plan?.relationships.blockedBy
      ? plan.relationships.blockedBy.enabled
        ? plan.relationships.blockedBy.issues
        : []
      : []
    const blockingRelationships = plan?.relationships.blocking
      ? plan.relationships.blocking.enabled
        ? plan.relationships.blocking.issues
        : []
      : []
    const hasIssueType = Boolean(issueTypeId)
    const hasLabels = labelIds.length > 0
    const trackerLabel = title
    const totalSteps =
      3 +
      enabledFieldPlans.length +
      (hasIssueType ? 1 : 0) +
      (hasLabels ? 1 : 0) +
      (parentRelationship?.nodeId ? 1 : 0) +
      blockedByRelationships.length +
      blockingRelationships.length

    let newIssueId = ''
    let newIssueDatabaseId: number | null = null
    let newIssueNumber: number | null = null
    let newItemId = ''

    const tasks: QueueTask[] = [
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
        ? [
            {
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
            },
          ]
        : []),
      {
        id: 'attach-project',
        detail: issue.repository.name,
        run: async () => {
          logger.log('[rgp:bg] attaching to project', { newIssueId, projectId: source.project.id })
          interface AttachResult {
            addProjectV2ItemById: { item: { id: string } }
          }
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
        ? [
            {
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
            },
          ]
        : []),
      ...enabledFieldPlans.map((field) => ({
        id: `field-${(fieldNameById.get(field.fieldId) ?? field.fieldId).toLowerCase().replace(/\s+/g, '-')}`,
        detail: fieldNameById.get(field.fieldId) ?? field.fieldId,
        run: async () => {
          const value = field.value
          const values = Object.values(value)
          if (
            values.length === 0 ||
            values.every((candidate) => candidate === '' || candidate == null)
          ) {
            return
          }

          await withRateLimitRetry(
            () =>
              gql(UPDATE_PROJECT_FIELD, {
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
        ? [
            {
              id: `rel-parent-${parentRelationship.number}`,
              detail: formatRelationshipLabel(parentRelationship),
              run: async () => {
                logger.log('[rgp:bg] linking sub-issue to parent', {
                  parentId: parentRelationship.nodeId,
                  subIssueId: newIssueId,
                })
                await withRateLimitRetry(
                  () =>
                    gql(ADD_SUB_ISSUE, {
                      issueId: parentRelationship.nodeId,
                      subIssueId: newIssueId,
                    }),
                  tabId,
                )
                await sleep(1000)
              },
            },
          ]
        : []),
      ...blockedByRelationships.map((relationship) => ({
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
            () =>
              githubRest(
                `/repos/${encodeURIComponent(issue.repository.owner.login)}/${encodeURIComponent(issue.repository.name)}/issues/${newIssueNumber}/dependencies/blocked_by`,
                {
                  method: 'POST',
                  body: JSON.stringify({ issue_id: relationship.databaseId }),
                },
              ),
            tabId,
          )
          await sleep(1000)
        },
      })),
      ...blockingRelationships.map((relationship) => ({
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
            () =>
              githubRest(
                `/repos/${encodeURIComponent(relationship.repoOwner)}/${encodeURIComponent(relationship.repoName)}/issues/${relationship.number}/dependencies/blocked_by`,
                {
                  method: 'POST',
                  body: JSON.stringify({ issue_id: newIssueDatabaseId }),
                },
              ),
            tabId,
          )
          await sleep(1000)
        },
      })),
    ]

    await processQueue(
      tasks,
      async (state) => {
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
            failedItems: state.failedItems,
          },
          tabId,
        )
      },
      processId,
    )

    await broadcastQueue(
      { total: 0, completed: 0, paused: false, status: 'Done!', processId, label: trackerLabel },
      tabId,
    )
    logger.log('[rgp:bg] deep duplicate complete', { processId })
  } finally {
    releaseDuplicate()
  }
}

// ─── Register ─────────────────────────────────────────────────────────────────

export function registerDuplicateHandlers(): void {
  onMessage('duplicateItem', async ({ data, sender }) => {
    logger.log('[rgp:bg] duplicateItem received', {
      itemId: data.itemId,
      projectId: data.projectId,
    })
    const tabId = sender.tab?.id
    await runDeepDuplicate(data.itemId, data.projectId, tabId, data.plan)
  })
}
