// bulk reorder/position handlers.

import { onMessage } from '@/lib/messages'
import { gql } from '@/lib/graphql-client'
import { GET_PROJECT_ITEMS_FOR_REORDER, UPDATE_PROJECT_ITEM_POSITION } from '@/lib/graphql-queries'
import { sleep } from '@/lib/queue'
import type { QueueTask } from '@/lib/queue'
import { logger } from '@/lib/debug-logger'

import { isBulkFull, acquireBulk, releaseBulk } from '@/background/concurrency'
import { broadcastQueue, withRateLimitRetry } from '@/background/rest-helpers'
import { broadcastDone, runQueueWithProgress, type QueueRun } from '@/background/queue-run'
import { createIssueRefIndex, getProjectFieldsData } from '@/background/project-helpers'
import { newProcessId, plural } from '@/lib/format'

type ReorderOp = { nodeId: string; previousNodeId: string | null }

/** One position mutation per op. Both reorder handlers issue exactly these. */
function positionTasks(ops: ReorderOp[], projectId: string, idPrefix: string): QueueTask[] {
  return ops.map((op, i) => ({
    id: `${idPrefix}-${i}`,
    run: async () => {
      await gql(UPDATE_PROJECT_ITEM_POSITION, {
        input: { projectId, itemId: op.nodeId, afterId: op.previousNodeId ?? undefined },
      })
    },
  }))
}

function broadcastStart(total: number, run: QueueRun): Promise<void> {
  return broadcastQueue(
    {
      total,
      completed: 0,
      paused: false,
      status: 'Moving items...',
      processId: run.processId,
      label: run.label,
    },
    run.tabId,
  )
}

export function registerBulkPositionHandlers(): void {
  onMessage('bulkReorder', async ({ data, sender }) => {
    logger.log('[rgp:bg] bulkReorder received', { opCount: data.reorderOps.length })

    if (isBulkFull()) {
      console.warn('[rgp:bg] max concurrent bulk reached, rejecting bulkReorder')
      return
    }

    acquireBulk()
    const run = {
      processId: newProcessId('reorder'),
      label: data.label ?? `Move · ${plural(data.reorderOps.length, 'item')}`,
      tabId: sender.tab?.id,
    }

    try {
      const tasks = positionTasks(data.reorderOps, data.projectId, 'reorder')

      await broadcastStart(tasks.length, run)

      await runQueueWithProgress(tasks, run, (state) => ({
        status:
          state.completed < data.reorderOps.length
            ? `Moving item ${state.completed + 1} of ${data.reorderOps.length}…`
            : `Moving ${plural(data.reorderOps.length, 'item')}…`,
      }))

      await broadcastDone(run)
    } finally {
      releaseBulk()
    }
  })

  onMessage('bulkReorderByPosition', async ({ data, sender }) => {
    logger.log('[rgp:bg] bulkReorderByPosition received', { count: data.selectedDomIds.length })

    if (isBulkFull()) {
      console.warn('[rgp:bg] max concurrent bulk reached, rejecting bulkReorderByPosition')
      return
    }

    acquireBulk()
    const run = {
      processId: newProcessId('reorder-pos'),
      label: data.label ?? `Move · ${plural(data.selectedDomIds.length, 'item')}`,
      tabId: sender.tab?.id,
    }

    try {
      const { project } = await getProjectFieldsData(data.owner, data.number, data.isOrg)
      if (!project) throw new Error('Project not found')

      interface PosItemsResult {
        node: {
          items: {
            pageInfo: { hasNextPage: boolean; endCursor: string | null }
            nodes: {
              id: string
              databaseId: number
              content: { databaseId: number; number?: number } | null
            }[]
          }
        } | null
      }

      type PosItem = { memexItemId: number; nodeId: string; contentDbId: number }

      const allItems: PosItem[] = []
      // indexed by both numbers an item carries, so either id spelling resolves
      const byRef = createIssueRefIndex<PosItem>()
      let cursor: string | null = null
      while (true) {
        const page = await withRateLimitRetry(() =>
          gql<PosItemsResult>(GET_PROJECT_ITEMS_FOR_REORDER, { projectId: project.id, cursor }),
        )
        const items = page.node?.items
        if (!items) break
        for (const item of items.nodes) {
          if (item.content?.databaseId) {
            const entry: PosItem = {
              memexItemId: item.databaseId,
              nodeId: item.id,
              contentDbId: item.content.databaseId,
            }
            allItems.push(entry)
            byRef.add(item.content, entry)
          }
        }
        if (!items.pageInfo.hasNextPage) break
        cursor = items.pageInfo.endCursor
        await sleep(500)
      }

      const selectedMemexIds = data.selectedDomIds
        .map((domId) => byRef.get(domId)?.memexItemId)
        .filter((id): id is number => id != null)

      const insertAfterMemexId: number | '' = data.insertAfterDomId
        ? (byRef.get(data.insertAfterDomId)?.memexItemId ?? '')
        : ''

      // use DOM order as the base ordering when provided (avoids GraphQL insertion-order mismatch)
      let orderedItems: typeof allItems
      if (data.allDomIds?.length) {
        orderedItems = []
        for (const domId of data.allDomIds) {
          const entry = byRef.get(domId)
          if (entry) orderedItems.push(entry)
        }
        // append items not in DOM (hidden/filtered) at the end
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

      const tasks = positionTasks(reorderOps, project.id, 'reorder-pos')

      await broadcastStart(tasks.length, run)

      await runQueueWithProgress(tasks, run, (state) => ({
        status:
          state.completed < reorderOps.length
            ? `Moving item ${state.completed + 1} of ${reorderOps.length}…`
            : `Moved ${reorderOps.length} items`,
      }))

      await broadcastDone(run)
    } finally {
      releaseBulk()
    }
  })
}
