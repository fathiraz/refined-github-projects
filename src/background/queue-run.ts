// The queue-tracker frames every bulk verb emits: a progress frame per state
// change, then a terminal `Done!` frame.
//
// Nine handlers used to hand-copy the same ~26 lines of `processQueue` +
// `broadcastQueue` scaffolding, differing only in the status wording. Lives
// beside `rest-helpers` rather than inside it so that suites which mock
// `broadcastQueue` still observe the frames this module produces.

import { processQueue } from '@/lib/queue'
import type { QueueState, QueueTask } from '@/lib/queue'

import { broadcastQueue, type ReverseHint } from '@/background/rest-helpers'

/** Identifies one queue run to the tracker. Every verb carries the same three. */
export interface QueueRun {
  processId: string
  label: string
  tabId: number | undefined
}

/**
 * A frame for the phases either side of the task queue — resolving ids,
 * fetching targets, aborting early. `completed` is pinned at 0 because nothing
 * has been processed yet; `total` is whatever the tracker should show as the
 * denominator, and 0 when there is nothing to count.
 */
export function broadcastStatus(run: QueueRun, total: number, status: string): Promise<void> {
  return broadcastQueue(
    {
      total,
      completed: 0,
      paused: false,
      status,
      processId: run.processId,
      label: run.label,
    },
    run.tabId,
  )
}

/** The terminal frame every verb broadcasts once its queue drains. */
export function broadcastDone(run: QueueRun, reverse?: ReverseHint): Promise<void> {
  return broadcastQueue(
    {
      total: 0,
      completed: 0,
      paused: false,
      status: 'Done!',
      processId: run.processId,
      label: run.label,
      reverse,
    },
    run.tabId,
  )
}

/**
 * Run a task queue, broadcasting a progress frame on every state change.
 *
 * `frame` supplies only what differs between verbs — the status wording, plus
 * an optional fixed `total`/`completed` for multi-step runs whose displayed
 * progress is not the queue's own counter. Returns the last observed state so
 * callers can build an Undo hint from what actually succeeded; emitting the
 * `Done!` frame is left to `broadcastDone`, because that hint has to be
 * computed first.
 */
export async function runQueueWithProgress(
  tasks: QueueTask[],
  run: QueueRun,
  frame: (state: QueueState) => { status: string; total?: number; completed?: number },
): Promise<QueueState> {
  let last: QueueState = { total: tasks.length, completed: 0, paused: false }

  await processQueue(
    tasks,
    async (state) => {
      last = state
      const { status, total, completed } = frame(state)
      await broadcastQueue(
        {
          total: total ?? state.total,
          completed: completed ?? state.completed,
          paused: state.paused,
          retryAfter: state.retryAfter,
          status,
          detail: state.detail,
          processId: run.processId,
          label: run.label,
          failedItems: state.failedItems,
        },
        run.tabId,
      )
    },
    run.processId,
  )

  return last
}
