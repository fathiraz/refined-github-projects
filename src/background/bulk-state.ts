// bulk state-change handlers: close, open, delete, lock, unlock, pin, unpin.

import { onMessage } from '@/lib/messages'
import { gql } from '@/lib/graphql-client'
import {
  CLOSE_ISSUE,
  REOPEN_ISSUE,
  LOCK_ISSUE,
  UNLOCK_ISSUE,
  PIN_ISSUE,
  UNPIN_ISSUE,
  DELETE_PROJECT_ITEM,
} from '@/lib/graphql-mutations'
import { processQueue, sleep } from '@/lib/queue'
import type { QueueTask } from '@/lib/queue'
import { logger } from '@/lib/debug-logger'

import { isBulkFull, acquireBulk, releaseBulk } from '@/background/concurrency'
import { broadcastQueue } from '@/background/rest-helpers'
import { resolveProjectItemIds } from '@/background/project-helpers'
import { newProcessId, plural } from '@/lib/format'

export function registerBulkStateHandlers(): void {
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
    const processId = newProcessId('close')
    const label = `Bulk close · ${plural(data.itemIds.length, 'item')}`
    const tabId = sender.tab?.id
    let lastFailedTaskIds = new Set<string>()
    let lastCompleted = 0

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
          lastFailedTaskIds = new Set((state.failedItems ?? []).map((f) => f.id))
          lastCompleted = state.completed
          await broadcastQueue(
            {
              total: state.total,
              completed: state.completed,
              paused: state.paused,
              retryAfter: state.retryAfter,
              status:
                state.completed < resolvedItems.length
                  ? `Closing item ${state.completed + 1} of ${resolvedItems.length}…`
                  : `Closing ${plural(resolvedItems.length, 'item')}…`,
              processId,
              label,
              failedItems: state.failedItems,
            },
            tabId,
          )
        },
        processId,
      )

      // §4.9 — reverse hint for Undo (Close → Reopen). Only items that were
      // actually processed and not failed are offered for Undo. Items beyond
      // `lastCompleted` are unprocessed (e.g. queue cancelled mid-run) and
      // must not appear in the Undo target list.
      const succeededDomIds = resolvedItems
        .slice(0, lastCompleted)
        .map((r) => r.domId)
        .filter((domId) => !lastFailedTaskIds.has(`close-${domId}`))
      const reverse =
        succeededDomIds.length > 0
          ? {
              messageType: 'bulkOpen',
              data: { projectId: data.projectId },
              affectedItemIds: succeededDomIds,
              label: `Undo close (${succeededDomIds.length})`,
            }
          : undefined

      await broadcastQueue(
        { total: 0, completed: 0, paused: false, status: 'Done!', processId, label, reverse },
        tabId,
      )
    } finally {
      releaseBulk()
    }
  })

  onMessage('bulkOpen', async ({ data, sender }) => {
    logger.log('[rgp:bg] bulkOpen received', { itemCount: data.itemIds.length })

    if (isBulkFull()) {
      console.warn('[rgp:bg] max concurrent bulk reached, rejecting bulkOpen')
      return
    }

    acquireBulk()
    const processId = newProcessId('open')
    const label = `Bulk open · ${plural(data.itemIds.length, 'item')}`
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
                  : `Reopening ${plural(resolvedItems.length, 'item')}…`,
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

  onMessage('bulkDelete', async ({ data, sender }) => {
    logger.log('[rgp:bg] bulkDelete received', { itemCount: data.itemIds.length })

    if (isBulkFull()) {
      console.warn('[rgp:bg] max concurrent bulk reached, rejecting bulkDelete')
      return
    }

    acquireBulk()
    const processId = newProcessId('delete')
    const label = `Bulk delete · ${plural(data.itemIds.length, 'item')}`
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
                  : `Removing ${plural(resolvedItems.length, 'item')}…`,
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

  onMessage('bulkLock', async ({ data, sender }) => {
    logger.log('[rgp:bg] bulkLock received', { itemCount: data.itemIds.length })
    if (isBulkFull()) {
      console.warn('[rgp:bg] max concurrent bulk reached, rejecting bulkLock')
      return
    }
    acquireBulk()
    const processId = newProcessId('lock')
    const label = `Lock · ${plural(data.itemIds.length, 'item')}`
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
                  : `Locking ${plural(resolvedItems.length, 'item')}…`,
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

  onMessage('bulkUnlock', async ({ data, sender }) => {
    logger.log('[rgp:bg] bulkUnlock received', { itemCount: data.itemIds.length })
    if (isBulkFull()) {
      console.warn('[rgp:bg] max concurrent bulk reached, rejecting bulkUnlock')
      return
    }
    acquireBulk()
    const processId = newProcessId('unlock')
    const label = `Unlock · ${plural(data.itemIds.length, 'item')}`
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
        console.error('[rgp:bg] no valid items resolved for bulkUnlock, aborting')
        return
      }
      const tasks: QueueTask[] = resolvedItems.map(({ domId, issueNodeId }) => ({
        id: `unlock-${domId}`,
        run: async () => {
          await gql(UNLOCK_ISSUE, { lockableId: issueNodeId })
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
                  ? `Unlocking item ${state.completed + 1} of ${resolvedItems.length}…`
                  : `Unlocking ${plural(resolvedItems.length, 'item')}…`,
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

  onMessage('bulkPin', async ({ data, sender }) => {
    logger.log('[rgp:bg] bulkPin received', { itemCount: data.itemIds.length })
    if (isBulkFull()) {
      console.warn('[rgp:bg] max concurrent bulk reached, rejecting bulkPin')
      return
    }
    acquireBulk()
    const processId = newProcessId('pin')
    const label = `Pin · ${plural(data.itemIds.length, 'item')}`
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
                  : `Pinning ${plural(resolvedItems.length, 'item')}…`,
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

  onMessage('bulkUnpin', async ({ data, sender }) => {
    logger.log('[rgp:bg] bulkUnpin received', { itemCount: data.itemIds.length })
    if (isBulkFull()) {
      console.warn('[rgp:bg] max concurrent bulk reached, rejecting bulkUnpin')
      return
    }
    acquireBulk()
    const processId = newProcessId('unpin')
    const label = `Unpin · ${plural(data.itemIds.length, 'item')}`
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
                  : `Unpinning ${plural(resolvedItems.length, 'item')}…`,
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
