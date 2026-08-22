// bulk state-change handlers: close, open, delete, lock, unlock, pin, unpin.
//
// All seven are the same run — resolve items, issue one mutation each, pace at
// 1s — so they share `runBulkVerb` and differ only in the fields below. Each
// `onMessage` call site is kept so its payload stays exactly typed.

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
import { sleep } from '@/lib/queue'
import { logger } from '@/lib/debug-logger'
import { plural } from '@/lib/format'

import { runBulkVerb } from '@/background/run-bulk-verb'

/** One mutation, then the mandatory anti-abuse pause. */
const mutate =
  (document: string, variables: Record<string, unknown>) => async (): Promise<void> => {
    await gql(document, variables)
    await sleep(1000)
  }

export function registerBulkStateHandlers(): void {
  onMessage('bulkClose', async ({ data, sender }) => {
    logger.log('[rgp:bg] bulkClose received', {
      itemCount: data.itemIds.length,
      reason: data.reason,
    })
    await runBulkVerb({
      idPrefix: 'close',
      label: `Bulk close · ${plural(data.itemIds.length, 'item')}`,
      progressVerb: 'Closing',
      itemIds: data.itemIds,
      projectId: data.projectId,
      tabId: sender.tab?.id,
      buildTask: ({ issueNodeId }) =>
        mutate(CLOSE_ISSUE, { issueId: issueNodeId, stateReason: data.reason }),
      // §4.9 — Close is the only verb with a cheap inverse, so it is the only
      // one that offers Undo.
      buildReverse: (succeededDomIds) =>
        succeededDomIds.length > 0
          ? {
              messageType: 'bulkOpen',
              data: { projectId: data.projectId },
              affectedItemIds: succeededDomIds,
              label: `Undo close (${succeededDomIds.length})`,
            }
          : undefined,
    })
  })

  onMessage('bulkOpen', async ({ data, sender }) => {
    logger.log('[rgp:bg] bulkOpen received', { itemCount: data.itemIds.length })
    await runBulkVerb({
      idPrefix: 'open',
      label: `Bulk open · ${plural(data.itemIds.length, 'item')}`,
      progressVerb: 'Reopening',
      itemIds: data.itemIds,
      projectId: data.projectId,
      tabId: sender.tab?.id,
      buildTask: ({ issueNodeId }) => mutate(REOPEN_ISSUE, { issueId: issueNodeId }),
    })
  })

  onMessage('bulkDelete', async ({ data, sender }) => {
    logger.log('[rgp:bg] bulkDelete received', { itemCount: data.itemIds.length })
    await runBulkVerb({
      idPrefix: 'delete',
      label: `Bulk delete · ${plural(data.itemIds.length, 'item')}`,
      progressVerb: 'Removing',
      itemIds: data.itemIds,
      projectId: data.projectId,
      tabId: sender.tab?.id,
      buildTask: ({ projectItemId }) =>
        mutate(DELETE_PROJECT_ITEM, { projectId: data.projectId, itemId: projectItemId }),
    })
  })

  onMessage('bulkLock', async ({ data, sender }) => {
    logger.log('[rgp:bg] bulkLock received', { itemCount: data.itemIds.length })
    await runBulkVerb({
      idPrefix: 'lock',
      label: `Lock · ${plural(data.itemIds.length, 'item')}`,
      progressVerb: 'Locking',
      itemIds: data.itemIds,
      projectId: data.projectId,
      tabId: sender.tab?.id,
      buildTask: ({ issueNodeId }) =>
        mutate(LOCK_ISSUE, {
          lockableId: issueNodeId,
          ...(data.lockReason ? { lockReason: data.lockReason } : {}),
        }),
    })
  })

  onMessage('bulkUnlock', async ({ data, sender }) => {
    logger.log('[rgp:bg] bulkUnlock received', { itemCount: data.itemIds.length })
    await runBulkVerb({
      idPrefix: 'unlock',
      label: `Unlock · ${plural(data.itemIds.length, 'item')}`,
      progressVerb: 'Unlocking',
      itemIds: data.itemIds,
      projectId: data.projectId,
      tabId: sender.tab?.id,
      buildTask: ({ issueNodeId }) => mutate(UNLOCK_ISSUE, { lockableId: issueNodeId }),
    })
  })

  onMessage('bulkPin', async ({ data, sender }) => {
    logger.log('[rgp:bg] bulkPin received', { itemCount: data.itemIds.length })
    await runBulkVerb({
      idPrefix: 'pin',
      label: `Pin · ${plural(data.itemIds.length, 'item')}`,
      progressVerb: 'Pinning',
      itemIds: data.itemIds,
      projectId: data.projectId,
      tabId: sender.tab?.id,
      buildTask: ({ issueNodeId }) => mutate(PIN_ISSUE, { issueId: issueNodeId }),
    })
  })

  onMessage('bulkUnpin', async ({ data, sender }) => {
    logger.log('[rgp:bg] bulkUnpin received', { itemCount: data.itemIds.length })
    await runBulkVerb({
      idPrefix: 'unpin',
      label: `Unpin · ${plural(data.itemIds.length, 'item')}`,
      progressVerb: 'Unpinning',
      itemIds: data.itemIds,
      projectId: data.projectId,
      tabId: sender.tab?.id,
      buildTask: ({ issueNodeId }) => mutate(UNPIN_ISSUE, { issueId: issueNodeId }),
    })
  })
}
