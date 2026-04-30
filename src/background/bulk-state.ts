// bulk state-change handlers: close, open, delete, lock, pin, unpin.

import { onMessage } from '@/lib/messages'
import { gql } from '@/lib/graphql-client'
import {
  CLOSE_ISSUE,
  REOPEN_ISSUE,
  LOCK_ISSUE,
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
}
