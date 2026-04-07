// ─── Bulk handlers ────────────────────────────────────────────────────────────

import { onMessage } from '@/lib/messages'
import { gql } from '@/lib/graphql/client'
import {
  ADD_ASSIGNEES,
  REMOVE_ASSIGNEES,
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
  UPDATE_PROJECT_FIELD,
} from '@/lib/graphql/mutations'
import {
  GET_PROJECT_ITEMS_FOR_REORDER,
  GET_ISSUE_ASSIGNEES,
  UPDATE_PROJECT_ITEM_POSITION,
} from '@/lib/graphql/queries'
import { processQueue, sleep } from '@/lib/queue'
import type { QueueTask } from '@/lib/queue'
import { logger } from '@/lib/debug-logger'

import { isBulkFull, acquireBulk, releaseBulk } from '../concurrency'
import { takeCachedResolvedItems } from '../cache'
import {
  resolveProjectItemIds,
  withRateLimitRetry,
  broadcastQueue,
  buildBulkRelationshipTasks,
  getProjectFieldsData,
  getRepositoryId,
} from '../helpers'

// ─── Private helpers ──────────────────────────────────────────────────────────

function formatDetailDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ─── Register ─────────────────────────────────────────────────────────────────

export function registerBulkHandlers(): void {
  // ─── bulkUpdate ───────────────────────────────────────────────────────────

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
      // Resolve DOM-extracted item IDs to real ProjectV2Item Node IDs
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

      // Final done broadcast
      await broadcastQueue(
        { total: 0, completed: 0, paused: false, status: 'Done!', processId, label },
        tabId,
      )
    } finally {
      releaseBulk()
    }
  })

  // ─── bulkClose ────────────────────────────────────────────────────────────

  onMessage('bulkClose', async ({ data, sender }) => {
    logger.log('[rgp:bg] bulkClose received', {
      itemCount: data.itemIds.length,
      reason: data.reason,
    })

    if (isBulkFull()) {
      console.warn('[rgp:bg] max concurrent bulk reached, rejecting bulkClose')
      return
    }

    acquireBulk()
    const processId = `close-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const label = `Bulk close · ${data.itemIds.length} item${data.itemIds.length !== 1 ? 's' : ''}`
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
      const resolvedItems = await resolveProjectItemIds(data.itemIds, data.projectId, tabId)

      if (resolvedItems.length === 0) {
        console.error('[rgp:bg] no valid items resolved for bulkClose, aborting')
        return
      }

      const tasks: QueueTask[] = resolvedItems.map(({ domId, issueNodeId }) => ({
        id: `close-${domId}`,
        run: async () => {
          await gql(CLOSE_ISSUE, { issueId: issueNodeId, stateReason: data.reason })
          await sleep(1000)
        },
      }))

      await processQueue(
        tasks,
        async (state) => {
          await broadcastQueue(
            {
              total: state.total,
              completed: state.completed,
              paused: state.paused,
              retryAfter: state.retryAfter,
              status:
                state.completed < resolvedItems.length
                  ? `Closing item ${state.completed + 1} of ${resolvedItems.length}…`
                  : `Closing ${resolvedItems.length} item${resolvedItems.length !== 1 ? 's' : ''}…`,
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

  // ─── bulkOpen ─────────────────────────────────────────────────────────────

  onMessage('bulkOpen', async ({ data, sender }) => {
    logger.log('[rgp:bg] bulkOpen received', { itemCount: data.itemIds.length })

    if (isBulkFull()) {
      console.warn('[rgp:bg] max concurrent bulk reached, rejecting bulkOpen')
      return
    }

    acquireBulk()
    const processId = `open-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const label = `Bulk open · ${data.itemIds.length} item${data.itemIds.length !== 1 ? 's' : ''}`
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
      const resolvedItems = await resolveProjectItemIds(data.itemIds, data.projectId, tabId)

      if (resolvedItems.length === 0) {
        console.error('[rgp:bg] no valid items resolved for bulkOpen, aborting')
        return
      }

      const tasks: QueueTask[] = resolvedItems.map(({ domId, issueNodeId }) => ({
        id: `open-${domId}`,
        run: async () => {
          await gql(REOPEN_ISSUE, { issueId: issueNodeId })
          await sleep(1000)
        },
      }))

      await processQueue(
        tasks,
        async (state) => {
          await broadcastQueue(
            {
              total: state.total,
              completed: state.completed,
              paused: state.paused,
              retryAfter: state.retryAfter,
              status:
                state.completed < resolvedItems.length
                  ? `Reopening item ${state.completed + 1} of ${resolvedItems.length}…`
                  : `Reopening ${resolvedItems.length} item${resolvedItems.length !== 1 ? 's' : ''}…`,
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

  // ─── bulkDelete ───────────────────────────────────────────────────────────

  onMessage('bulkDelete', async ({ data, sender }) => {
    logger.log('[rgp:bg] bulkDelete received', { itemCount: data.itemIds.length })

    if (isBulkFull()) {
      console.warn('[rgp:bg] max concurrent bulk reached, rejecting bulkDelete')
      return
    }

    acquireBulk()
    const processId = `delete-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const label = `Bulk delete · ${data.itemIds.length} item${data.itemIds.length !== 1 ? 's' : ''}`
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
      const resolvedItems = await resolveProjectItemIds(data.itemIds, data.projectId, tabId)

      if (resolvedItems.length === 0) {
        console.error('[rgp:bg] no valid items resolved for bulkDelete, aborting')
        return
      }

      const tasks: QueueTask[] = resolvedItems.map(({ domId, projectItemId }) => ({
        id: `delete-${domId}`,
        run: async () => {
          await gql(DELETE_PROJECT_ITEM, { projectId: data.projectId, itemId: projectItemId })
          await sleep(1000)
        },
      }))

      await processQueue(
        tasks,
        async (state) => {
          await broadcastQueue(
            {
              total: state.total,
              completed: state.completed,
              paused: state.paused,
              retryAfter: state.retryAfter,
              status:
                state.completed < resolvedItems.length
                  ? `Removing item ${state.completed + 1} of ${resolvedItems.length}…`
                  : `Removing ${resolvedItems.length} item${resolvedItems.length !== 1 ? 's' : ''}…`,
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

  // ─── bulkLock ─────────────────────────────────────────────────────────────

  onMessage('bulkLock', async ({ data, sender }) => {
    logger.log('[rgp:bg] bulkLock received', { itemCount: data.itemIds.length })
    if (isBulkFull()) {
      console.warn('[rgp:bg] max concurrent bulk reached, rejecting bulkLock')
      return
    }
    acquireBulk()
    const processId = `lock-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const label = `Lock · ${data.itemIds.length} item${data.itemIds.length !== 1 ? 's' : ''}`
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
      const resolvedItems = await resolveProjectItemIds(data.itemIds, data.projectId, tabId)
      if (resolvedItems.length === 0) {
        console.error('[rgp:bg] no valid items resolved for bulkLock, aborting')
        return
      }
      const tasks: QueueTask[] = resolvedItems.map(({ domId, issueNodeId }) => ({
        id: `lock-${domId}`,
        run: async () => {
          await gql(LOCK_ISSUE, {
            lockableId: issueNodeId,
            ...(data.lockReason ? { lockReason: data.lockReason } : {}),
          })
          await sleep(1000)
        },
      }))
      await processQueue(
        tasks,
        async (state) => {
          await broadcastQueue(
            {
              total: state.total,
              completed: state.completed,
              paused: state.paused,
              retryAfter: state.retryAfter,
              status:
                state.completed < resolvedItems.length
                  ? `Locking item ${state.completed + 1} of ${resolvedItems.length}…`
                  : `Locking ${resolvedItems.length} item${resolvedItems.length !== 1 ? 's' : ''}…`,
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

  // ─── bulkPin ──────────────────────────────────────────────────────────────

  onMessage('bulkPin', async ({ data, sender }) => {
    logger.log('[rgp:bg] bulkPin received', { itemCount: data.itemIds.length })
    if (isBulkFull()) {
      console.warn('[rgp:bg] max concurrent bulk reached, rejecting bulkPin')
      return
    }
    acquireBulk()
    const processId = `pin-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const label = `Pin · ${data.itemIds.length} item${data.itemIds.length !== 1 ? 's' : ''}`
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
      const resolvedItems = await resolveProjectItemIds(data.itemIds, data.projectId, tabId)
      if (resolvedItems.length === 0) {
        console.error('[rgp:bg] no valid items resolved for bulkPin, aborting')
        return
      }
      const tasks: QueueTask[] = resolvedItems.map(({ domId, issueNodeId }) => ({
        id: `pin-${domId}`,
        run: async () => {
          await gql(PIN_ISSUE, { issueId: issueNodeId })
          await sleep(1000)
        },
      }))
      await processQueue(
        tasks,
        async (state) => {
          await broadcastQueue(
            {
              total: state.total,
              completed: state.completed,
              paused: state.paused,
              retryAfter: state.retryAfter,
              status:
                state.completed < resolvedItems.length
                  ? `Pinning item ${state.completed + 1} of ${resolvedItems.length}…`
                  : `Pinning ${resolvedItems.length} item${resolvedItems.length !== 1 ? 's' : ''}…`,
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

  // ─── bulkUnpin ────────────────────────────────────────────────────────────

  onMessage('bulkUnpin', async ({ data, sender }) => {
    logger.log('[rgp:bg] bulkUnpin received', { itemCount: data.itemIds.length })
    if (isBulkFull()) {
      console.warn('[rgp:bg] max concurrent bulk reached, rejecting bulkUnpin')
      return
    }
    acquireBulk()
    const processId = `unpin-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const label = `Unpin · ${data.itemIds.length} item${data.itemIds.length !== 1 ? 's' : ''}`
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
      const resolvedItems = await resolveProjectItemIds(data.itemIds, data.projectId, tabId)
      if (resolvedItems.length === 0) {
        console.error('[rgp:bg] no valid items resolved for bulkUnpin, aborting')
        return
      }
      const tasks: QueueTask[] = resolvedItems.map(({ domId, issueNodeId }) => ({
        id: `unpin-${domId}`,
        run: async () => {
          await gql(UNPIN_ISSUE, { issueId: issueNodeId })
          await sleep(1000)
        },
      }))
      await processQueue(
        tasks,
        async (state) => {
          await broadcastQueue(
            {
              total: state.total,
              completed: state.completed,
              paused: state.paused,
              retryAfter: state.retryAfter,
              status:
                state.completed < resolvedItems.length
                  ? `Unpinning item ${state.completed + 1} of ${resolvedItems.length}…`
                  : `Unpinning ${resolvedItems.length} item${resolvedItems.length !== 1 ? 's' : ''}…`,
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

  // ─── bulkTransfer ─────────────────────────────────────────────────────────

  onMessage('bulkTransfer', async ({ data, sender }) => {
    logger.log('[rgp:bg] bulkTransfer received', { itemCount: data.itemIds.length })
    if (isBulkFull()) {
      console.warn('[rgp:bg] max concurrent bulk reached, rejecting bulkTransfer')
      return
    }
    acquireBulk()
    const processId = `transfer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const label = `Transfer · ${data.itemIds.length} item${data.itemIds.length !== 1 ? 's' : ''}`
    const tabId = sender.tab?.id
    try {
      await broadcastQueue(
        {
          total: data.itemIds.length,
          completed: 0,
          paused: false,
          status: 'Resolving target repository...',
          processId,
          label,
        },
        tabId,
      )
      const targetRepoId = await getRepositoryId(data.targetRepoOwner, data.targetRepoName)
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
      const resolvedItems = await resolveProjectItemIds(data.itemIds, data.projectId, tabId)
      if (resolvedItems.length === 0) {
        console.error('[rgp:bg] no valid items resolved for bulkTransfer, aborting')
        return
      }
      const tasks: QueueTask[] = resolvedItems.map(({ domId, issueNodeId }) => ({
        id: `transfer-${domId}`,
        run: async () => {
          await gql(TRANSFER_ISSUE, { issueId: issueNodeId, repositoryId: targetRepoId })
          await sleep(1000)
        },
      }))
      await processQueue(
        tasks,
        async (state) => {
          await broadcastQueue(
            {
              total: state.total,
              completed: state.completed,
              paused: state.paused,
              retryAfter: state.retryAfter,
              status:
                state.completed < resolvedItems.length
                  ? `Transferring item ${state.completed + 1} of ${resolvedItems.length}…`
                  : `Transferring ${resolvedItems.length} item${resolvedItems.length !== 1 ? 's' : ''}…`,
              failedItems: state.failedItems,
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
      releaseBulk()
    }
  })

  // ─── bulkRename ───────────────────────────────────────────────────────────

  onMessage('bulkRename', async ({ data, sender }) => {
    logger.log('[rgp:bg] bulkRename received', {
      itemCount: data.itemIds.length,
      renamesCount: data.renames.length,
    })

    if (isBulkFull()) {
      console.warn('[rgp:bg] max concurrent bulk reached, rejecting bulkRename')
      return
    }

    acquireBulk()
    const processId = `rename-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const label = `Rename · ${data.renames.length} item${data.renames.length !== 1 ? 's' : ''}`
    const tabId = sender.tab?.id

    try {
      const tasks: QueueTask[] = data.renames.map(({ domId, issueNodeId, newTitle, typename }) => ({
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

      await broadcastQueue(
        {
          total: tasks.length,
          completed: 0,
          paused: false,
          status: 'Renaming items...',
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
              status:
                state.completed < data.renames.length
                  ? `Renaming item ${state.completed + 1} of ${data.renames.length}…`
                  : `Renaming ${data.renames.length} item${data.renames.length !== 1 ? 's' : ''}…`,
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

  // ─── bulkRandomAssign ─────────────────────────────────────────────────────

  onMessage('bulkRandomAssign', async ({ data, sender }) => {
    logger.log('[rgp:bg] bulkRandomAssign received', {
      itemCount: data.itemIds.length,
      strategy: data.strategy,
    })

    if (isBulkFull()) {
      console.warn('[rgp:bg] max concurrent bulk reached, rejecting bulkRandomAssign')
      return
    }

    acquireBulk()
    const processId = `assign-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const label = `Random assign · ${data.itemIds.length} item${data.itemIds.length !== 1 ? 's' : ''}`
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
      const resolvedItems = await resolveProjectItemIds(data.itemIds, data.projectId, tabId)

      if (resolvedItems.length === 0) {
        console.error('[rgp:bg] no valid items resolved for bulkRandomAssign, aborting')
        await broadcastQueue(
          {
            total: 0,
            completed: 0,
            paused: false,
            status: 'No valid items found',
            processId,
            label,
          },
          tabId,
        )
        return
      }

      const itemToIssueMap = new Map(resolvedItems.map((r) => [r.domId, r.issueNodeId]))
      const tasks: QueueTask[] = []

      for (const assignment of data.assignments) {
        const issueNodeId = itemToIssueMap.get(assignment.itemId)
        if (issueNodeId && assignment.assigneeIds.length > 0) {
          tasks.push({
            id: `assign-${assignment.itemId}`,
            detail: 'Clearing and reassigning…',
            run: async () => {
              const res = await gql<{ node: { assignees?: { nodes: { id: string }[] } } }>(
                GET_ISSUE_ASSIGNEES,
                { id: issueNodeId },
              )
              const currentIds = res.node?.assignees?.nodes?.map((n) => n.id) ?? []
              if (currentIds.length > 0) {
                await gql(REMOVE_ASSIGNEES, { assignableId: issueNodeId, assigneeIds: currentIds })
                await sleep(1000)
              }
              await gql(ADD_ASSIGNEES, {
                assignableId: issueNodeId,
                assigneeIds: assignment.assigneeIds,
              })
              await sleep(1000)
            },
          })
        }
      }

      await processQueue(
        tasks,
        async (state) => {
          await broadcastQueue(
            {
              total: state.total,
              completed: state.completed,
              paused: state.paused,
              retryAfter: state.retryAfter,
              status:
                state.completed < tasks.length
                  ? `Clearing and reassigning item ${state.completed + 1} of ${tasks.length}…`
                  : `Reassigned ${tasks.length} item${tasks.length !== 1 ? 's' : ''}…`,
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

  // ─── bulkReorder ──────────────────────────────────────────────────────────

  onMessage('bulkReorder', async ({ data, sender }) => {
    logger.log('[rgp:bg] bulkReorder received', { opCount: data.reorderOps.length })

    if (isBulkFull()) {
      console.warn('[rgp:bg] max concurrent bulk reached, rejecting bulkReorder')
      return
    }

    acquireBulk()
    const processId = `reorder-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const label =
      data.label ??
      `Move · ${data.reorderOps.length} item${data.reorderOps.length !== 1 ? 's' : ''}`
    const tabId = sender.tab?.id

    try {
      const tasks: QueueTask[] = data.reorderOps.map((op, i) => ({
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

      await broadcastQueue(
        {
          total: tasks.length,
          completed: 0,
          paused: false,
          status: 'Moving items...',
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
              status:
                state.completed < data.reorderOps.length
                  ? `Moving item ${state.completed + 1} of ${data.reorderOps.length}…`
                  : `Moving ${data.reorderOps.length} item${data.reorderOps.length !== 1 ? 's' : ''}…`,
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

  // ─── bulkReorderByPosition ────────────────────────────────────────────────

  onMessage('bulkReorderByPosition', async ({ data, sender }) => {
    logger.log('[rgp:bg] bulkReorderByPosition received', { count: data.selectedDomIds.length })

    if (isBulkFull()) {
      console.warn('[rgp:bg] max concurrent bulk reached, rejecting bulkReorderByPosition')
      return
    }

    acquireBulk()
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
          gql<PosItemsResult>(GET_PROJECT_ITEMS_FOR_REORDER, { projectId: project.id, cursor }),
        )
        const items = page.node?.items
        if (!items) break
        for (const item of items.nodes) {
          if (item.content?.databaseId) {
            allItems.push({
              memexItemId: item.databaseId,
              nodeId: item.id,
              contentDbId: item.content.databaseId,
            })
          }
        }
        if (!items.pageInfo.hasNextPage) break
        cursor = items.pageInfo.endCursor
        await sleep(500)
      }

      const contentDbToMemex = new Map(allItems.map((i) => [i.contentDbId, i.memexItemId]))
      const contentDbToNode = new Map(allItems.map((i) => [i.contentDbId, i.nodeId]))

      function parseContentDbId(domId: string): number | null {
        const m = domId.match(/^issue:(\d+)$/) || domId.match(/^issue-(\d+)$/)
        return m ? parseInt(m[1], 10) : null
      }

      const selectedMemexIds = data.selectedDomIds
        .map((domId) => contentDbToMemex.get(parseContentDbId(domId)!))
        .filter((id): id is number => id != null)

      const insertAfterContentDbId = data.insertAfterDomId
        ? parseContentDbId(data.insertAfterDomId)
        : null
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
          if (memexItemId != null && nodeId != null)
            orderedItems.push({ memexItemId, nodeId, contentDbId })
        }
        // Append items not in DOM (hidden/filtered) at the end
        const inDomSet = new Set(orderedItems.map((i) => i.memexItemId))
        for (const item of allItems) {
          if (!inDomSet.has(item.memexItemId)) orderedItems.push(item)
        }
      } else {
        orderedItems = allItems
      }

      const selectedSet = new Set(selectedMemexIds)
      const nonSelected = orderedItems.filter((i) => !selectedSet.has(i.memexItemId))
      const selected = orderedItems.filter((i) => selectedSet.has(i.memexItemId))

      let newOrder: typeof orderedItems
      if (insertAfterMemexId === '') {
        newOrder = [...selected, ...nonSelected]
      } else {
        const insertIdx = nonSelected.findIndex((i) => i.memexItemId === insertAfterMemexId)
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

      const reorderOps = newOrder.reduce<Array<{ nodeId: string; previousNodeId: string | null }>>(
        (acc, item, i) => {
          if (!selectedSet.has(item.memexItemId)) return acc
          const prev = newOrder[i - 1]
          acc.push({
            nodeId: item.nodeId,
            previousNodeId: prev?.nodeId ?? null,
          })
          return acc
        },
        [],
      )

      const tasks: QueueTask[] = reorderOps.map((op, i) => ({
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

      await broadcastQueue(
        {
          total: tasks.length,
          completed: 0,
          paused: false,
          status: 'Moving items...',
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
              status:
                state.completed < reorderOps.length
                  ? `Moving item ${state.completed + 1} of ${reorderOps.length}…`
                  : `Moved ${reorderOps.length} items`,
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
