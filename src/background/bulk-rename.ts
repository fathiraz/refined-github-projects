// Bulk rename, transfer, and random-assign handlers.

import { onMessage } from '@/lib/messages'
import { gql } from '@/lib/graphql-client'
import {
  ADD_ASSIGNEES,
  REMOVE_ASSIGNEES,
  TRANSFER_ISSUE,
  UPDATE_ISSUE_TITLE,
  UPDATE_PR_TITLE,
} from '@/lib/graphql-mutations'
import { GET_ISSUE_ASSIGNEES } from '@/lib/graphql-queries'
import { processQueue, sleep } from '@/lib/queue'
import type { QueueTask } from '@/lib/queue'
import { logger } from '@/lib/debug-logger'
import { decodeProjectItemDomId } from '@/lib/schemas-decode'

import { isBulkFull, acquireBulk, releaseBulk } from '@/background/concurrency'
import { broadcastQueue } from '@/background/rest-helpers'
import { resolveProjectItemIds, getRepositoryId } from '@/background/project-helpers'

export function registerBulkRenameHandlers(): void {
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
        const issueNodeId = itemToIssueMap.get(decodeProjectItemDomId(assignment.itemId))
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
}
