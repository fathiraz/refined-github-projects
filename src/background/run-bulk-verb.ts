// The shell every per-item bulk verb shares: concurrency gate, queue frames,
// sequential execution, Done! frame, slot release.
//
// Extracted from eight hand-copied instances (close, open, delete, lock,
// unlock, pin, unpin, transfer) that differed only in the mutation they issue
// and the words they put on screen. Verbs that do NOT fit this shape — rename
// (trusts caller-supplied titles), random-assign (two mutations per item), and
// the two reorder handlers (operate on positions, not resolved items) — keep
// their own handlers rather than bending this one out of shape.

import { plural, newProcessId } from '@/lib/format'
import type { QueueTask } from '@/lib/queue'

import { isBulkFull, acquireBulk, releaseBulk } from '@/background/concurrency'
import { type ReverseHint } from '@/background/rest-helpers'
import { broadcastDone, broadcastStatus, runQueueWithProgress } from '@/background/queue-run'
import { resolveProjectItemIds } from '@/background/project-helpers'
import type { ResolvedItem } from '@/background/types'

interface BulkVerbOptions<TPrepared = void> {
  /** Names the processId and every task id, e.g. `close` -> `close-issue:42`. */
  idPrefix: string
  /** Queue tracker heading, e.g. `Bulk close · 3 items`. */
  label: string
  /** Gerund for the progress line, e.g. `Closing` -> `Closing item 2 of 3…`. */
  progressVerb: string
  itemIds: readonly string[]
  projectId: string
  tabId: number | undefined
  /** Status shown while work is being prepared. */
  resolvingStatus?: string
  /**
   * Runs before resolution; its result is handed to `buildTask`. `setStatus`
   * re-broadcasts the preparing frame, so a multi-step prepare can narrate
   * itself (transfer resolves a repository before it resolves items).
   */
  prepare?: (setStatus: (status: string) => Promise<void>) => Promise<TPrepared>
  /** The mutation to run for one item. Must pace itself per the anti-abuse rules. */
  buildTask: (item: ResolvedItem, prepared: TPrepared) => () => Promise<void>
  /**
   * Build the Undo hint from the items that actually succeeded. Called with
   * only the processed, non-failed ids — items past the completed count were
   * never attempted (e.g. the queue was cancelled) and must not be offered.
   */
  buildReverse?: (succeededDomIds: string[]) => ReverseHint | undefined
}

export async function runBulkVerb<TPrepared = void>(
  options: BulkVerbOptions<TPrepared>,
): Promise<void> {
  const { idPrefix, label, progressVerb, itemIds, projectId, tabId } = options

  if (isBulkFull()) {
    console.warn(`[rgp:bg] max concurrent bulk reached, rejecting ${idPrefix}`)
    return
  }

  acquireBulk()
  const run = { processId: newProcessId(idPrefix), label, tabId }

  const setStatus = (status: string) => broadcastStatus(run, itemIds.length, status)

  try {
    await setStatus(options.resolvingStatus ?? 'Resolving items...')

    const prepared = (await options.prepare?.(setStatus)) as TPrepared
    const resolvedItems = await resolveProjectItemIds([...itemIds], projectId, tabId)

    if (resolvedItems.length === 0) {
      console.error(`[rgp:bg] no valid items resolved for ${idPrefix}, aborting`)
      return
    }

    const total = resolvedItems.length
    const tasks: QueueTask[] = resolvedItems.map((item) => ({
      id: `${idPrefix}-${item.domId}`,
      run: options.buildTask(item, prepared),
    }))

    const last = await runQueueWithProgress(tasks, run, (state) => ({
      status:
        state.completed < total
          ? `${progressVerb} item ${state.completed + 1} of ${total}…`
          : `${progressVerb} ${plural(total, 'item')}…`,
    }))

    const failedTaskIds = new Set((last.failedItems ?? []).map((f) => f.id))
    const succeededDomIds = resolvedItems
      .slice(0, last.completed)
      .map((item) => item.domId)
      .filter((domId) => !failedTaskIds.has(`${idPrefix}-${domId}`))

    await broadcastDone(run, options.buildReverse?.(succeededDomIds))
  } finally {
    releaseBulk()
  }
}
