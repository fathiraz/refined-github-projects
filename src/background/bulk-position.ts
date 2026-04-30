// Bulk reorder/position handlers.

import { onMessage } from '@/lib/messages'
import { gql } from '@/lib/graphql-client'
import {
  GET_PROJECT_ITEMS_FOR_REORDER,
  UPDATE_PROJECT_ITEM_POSITION,
} from '@/lib/graphql-queries'
import { processQueue, sleep } from '@/lib/queue'
import type { QueueTask } from '@/lib/queue'
import { logger } from '@/lib/debug-logger'

import { isBulkFull, acquireBulk, releaseBulk } from '@/background/concurrency'
import { broadcastQueue, withRateLimitRetry } from '@/background/rest-helpers'
import { getProjectFieldsData } from '@/background/project-helpers'

export function registerBulkPositionHandlers(): void {
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

      // use DOM order as the base ordering when provided (avoids GraphQL insertion-order mismatch)
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
