// bulkUpdate handler — applies field/title/body/comment/relationship updates.

import { onMessage } from '@/lib/messages'
import { gql } from '@/lib/graphql-client'
import {
  ADD_ASSIGNEES,
  ADD_LABELS,
  UPDATE_ISSUE_MILESTONE,
  UPDATE_ISSUE_TYPE,
  UPDATE_ISSUE_TITLE,
  UPDATE_PR_TITLE,
  UPDATE_ISSUE_BODY,
  UPDATE_PR_BODY,
  ADD_COMMENT,
  UPDATE_PROJECT_FIELD,
} from '@/lib/graphql-mutations'
import { processQueue, sleep } from '@/lib/queue'
import type { QueueTask } from '@/lib/queue'
import { logger } from '@/lib/debug-logger'

import { isBulkFull, acquireBulk, releaseBulk } from '@/background/concurrency'
import { takeCachedResolvedItems } from '@/background/cache'
import { broadcastQueue } from '@/background/rest-helpers'
import { buildBulkRelationshipTasks } from '@/background/relationship-helpers'
import { resolveProjectItemIds } from '@/background/project-helpers'

function formatDetailDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function registerBulkUpdateHandler(): void {
  onMessage('bulkUpdate', async ({ data, sender }) => {
    logger.log('[rgp:bg] bulkUpdate received', {
      itemCount: data.itemIds.length,
      updatesCount: data.updates.length,
      projectId: data.projectId,
    })

    if (isBulkFull()) {
      console.warn('[rgp:bg] max concurrent bulk updates reached, rejecting')
      return
    }

    acquireBulk()
    const processId = `bulk-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const label = `Bulk update · ${data.itemIds.length} item${data.itemIds.length !== 1 ? 's' : ''}`
    const tabId = sender.tab?.id

    try {
      await broadcastQueue(
        {
          total: data.itemIds.length,
          completed: 0,
          paused: false,
          status: 'Resolving items...',
          processId,
          label,
        },
        tabId,
      )
      const cachedResolvedItems = data.relationships
        ? takeCachedResolvedItems(data.projectId, data.itemIds)
        : undefined
      const resolvedItems =
        cachedResolvedItems ?? (await resolveProjectItemIds(data.itemIds, data.projectId, tabId))
      logger.log('[rgp:bg] resolved item IDs', resolvedItems)

      if (resolvedItems.length === 0) {
        console.error('[rgp:bg] no valid ProjectV2Item IDs resolved, aborting')
        return
      }

      const tasks: QueueTask[] = []

      for (const item of resolvedItems) {
        const { domId, projectItemId, issueNodeId, typename } = item
        for (const update of data.updates) {
          const { dataType, singleSelectOptionId, iterationId, array } = update.value as any

          const meta = data.fieldMeta?.[update.fieldId]
          const fieldLabel = meta?.name ?? 'Field'

          let detail: string
          if (dataType === 'ASSIGNEES') {
            const logins: string[] = (array ?? []).map((a: any) => a.login).filter(Boolean)
            detail =
              logins.length > 0
                ? `Adding assignees: ${logins.map((l: string) => '@' + l).join(', ')}`
                : 'Adding assignees'
          } else if (dataType === 'LABELS') {
            const names: string[] = (array ?? []).map((l: any) => l.name).filter(Boolean)
            detail = names.length > 0 ? `Adding labels: ${names.join(', ')}` : 'Adding labels'
          } else if (dataType === 'MILESTONE') {
            const milestoneName: string =
              (array as any)?.[0]?.title ?? (array as any)?.[0]?.name ?? ''
            detail = milestoneName ? `Setting milestone → ${milestoneName}` : 'Setting milestone'
          } else if (dataType === 'ISSUE_TYPE') {
            const issueTypeName: string = (array as any)?.[0]?.name ?? ''
            detail = issueTypeName ? `Setting issue type → ${issueTypeName}` : 'Setting issue type'
          } else if (dataType === 'TITLE') {
            const { text } = update.value as any
            const trimmed: string = text?.trim() ?? ''
            detail = trimmed
              ? `Changing title → "${trimmed.length > 40 ? trimmed.slice(0, 40) + '…' : trimmed}"`
              : 'Updating title'
          } else if (dataType === 'BODY') {
            detail = 'Updating body'
          } else if (dataType === 'COMMENT') {
            detail = 'Adding comment'
          } else if (dataType === 'SINGLE_SELECT') {
            const optName = meta?.options?.find(
              (o: { id: string; name: string }) => o.id === singleSelectOptionId,
            )?.name
            detail = optName ? `${fieldLabel} → ${optName}` : `${fieldLabel} → (option)`
          } else if (dataType === 'ITERATION') {
            const iterTitle = meta?.iterations?.find(
              (i: { id: string; title: string }) => i.id === iterationId,
            )?.title
            detail = iterTitle ? `${fieldLabel} → ${iterTitle}` : `${fieldLabel} → (iteration)`
          } else {
            const { text, date, number: num } = update.value as any
            if (text !== undefined) {
              const preview: string =
                (text as string).length > 30 ? (text as string).slice(0, 30) + '…' : text
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

              // default project custom fields
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

      await processQueue(
        tasks,
        async (state) => {
          logger.log('[rgp:bg] queue state broadcast', {
            completed: state.completed,
            total: state.total,
            processId,
          })
          await broadcastQueue(
            {
              total: state.total,
              completed: state.completed,
              paused: state.paused,
              retryAfter: state.retryAfter,
              status: `Updating ${resolvedItems.length} item${resolvedItems.length !== 1 ? 's' : ''}...`,
              detail: state.detail,
              processId,
              label,
              failedItems: state.failedItems,
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
      releaseBulk()
    }
  })
}
