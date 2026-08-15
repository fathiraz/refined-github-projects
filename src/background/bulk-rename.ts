// bulk rename, transfer, and random-assign handlers.

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
import { sleep } from '@/lib/queue'
import type { QueueTask } from '@/lib/queue'
import { logger } from '@/lib/debug-logger'
import { decodeProjectItemDomId } from '@/lib/schemas-decode'

import { isBulkFull, acquireBulk, releaseBulk } from '@/background/concurrency'
import { broadcastQueue } from '@/background/rest-helpers'
import { broadcastDone, runQueueWithProgress } from '@/background/queue-run'
import { resolveProjectItemIds, getRepositoryId } from '@/background/project-helpers'
import { runBulkVerb } from '@/background/run-bulk-verb'
import { newProcessId, plural } from '@/lib/format'

export function registerBulkRenameHandlers(): void {
  onMessage('bulkTransfer', async ({ data, sender }) => {
    logger.log('[rgp:bg] bulkTransfer received', { itemCount: data.itemIds.length })
    await runBulkVerb({
      idPrefix: 'transfer',
      label: `Transfer · ${plural(data.itemIds.length, 'item')}`,
      progressVerb: 'Transferring',
      itemIds: data.itemIds,
      projectId: data.projectId,
      tabId: sender.tab?.id,
      resolvingStatus: 'Resolving target repository...',
      prepare: async (setStatus) => {
        const targetRepoId = await getRepositoryId(data.targetRepoOwner, data.targetRepoName)
        await setStatus('Resolving items...')
        return targetRepoId
      },
      buildTask:
        ({ issueNodeId }, targetRepoId) =>
        async () => {
          await gql(TRANSFER_ISSUE, { issueId: issueNodeId, repositoryId: targetRepoId })
          await sleep(1000)
        },
    })
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
    const run = {
      processId: newProcessId('rename'),
      label: `Rename · ${plural(data.renames.length, 'item')}`,
      tabId: sender.tab?.id,
    }

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
          processId: run.processId,
          label: run.label,
        },
        run.tabId,
      )

      await runQueueWithProgress(tasks, run, (state) => ({
        status:
          state.completed < data.renames.length
            ? `Renaming item ${state.completed + 1} of ${data.renames.length}…`
            : `Renaming ${plural(data.renames.length, 'item')}…`,
      }))

      await broadcastDone(run)
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
    const run = {
      processId: newProcessId('assign'),
      label: `Random assign · ${plural(data.itemIds.length, 'item')}`,
      tabId: sender.tab?.id,
    }

    try {
      await broadcastQueue(
        {
          total: data.itemIds.length,
          completed: 0,
          paused: false,
          status: 'Resolving items...',
          processId: run.processId,
          label: run.label,
        },
        run.tabId,
      )
      const resolvedItems = await resolveProjectItemIds(data.itemIds, data.projectId, run.tabId)

      if (resolvedItems.length === 0) {
        console.error('[rgp:bg] no valid items resolved for bulkRandomAssign, aborting')
        await broadcastQueue(
          {
            total: 0,
            completed: 0,
            paused: false,
            status: 'No valid items found',
            processId: run.processId,
            label: run.label,
          },
          run.tabId,
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

      await runQueueWithProgress(tasks, run, (state) => ({
        status:
          state.completed < tasks.length
            ? `Clearing and reassigning item ${state.completed + 1} of ${tasks.length}…`
            : `Reassigned ${plural(tasks.length, 'item')}…`,
      }))

      await broadcastDone(run)
    } finally {
      releaseBulk()
    }
  })
}
