import { Duration, Effect, Fiber, Stream, SubscriptionRef } from 'effect'

import { onMessage } from './messages'
import { toastStore } from './toast-store'

export interface ProcessEntry {
  processId: string
  label: string
  total: number
  completed: number
  paused: boolean
  retryAfter?: number
  status?: string
  detail?: string
  done: boolean
  failedItems?: Array<{ id: string; title: string; error: string }>
  retryContext?: { messageType: string; data: Record<string, unknown> }
}

type Listener = (entries: ProcessEntry[]) => void

const DISMISS_DELAY = Duration.millis(3000)

const _ref = Effect.runSync(SubscriptionRef.make<ReadonlyMap<string, ProcessEntry>>(new Map()))
let processes: Map<string, ProcessEntry> = new Map()
const listeners = new Set<Listener>()
const dismissTimers = new Map<string, Fiber.RuntimeFiber<void>>()

function setState(next: Map<string, ProcessEntry>): void {
  processes = next
  Effect.runSync(SubscriptionRef.set(_ref, next))
  const entries = Array.from(next.values())
  listeners.forEach((fn) => fn(entries))
}

function clearDismissTimer(id: string): void {
  const fiber = dismissTimers.get(id)
  if (fiber !== undefined) {
    Effect.runFork(Fiber.interrupt(fiber))
    dismissTimers.delete(id)
  }
}

function scheduleDismiss(processId: string) {
  clearDismissTimer(processId)
  const fiber = Effect.runFork(
    Effect.sleep(DISMISS_DELAY).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          if (dismissTimers.get(processId) !== fiber) return
          dismissTimers.delete(processId)
          if (!processes.has(processId)) return
          const next = new Map(processes)
          next.delete(processId)
          setState(next)
        }),
      ),
    ),
  )
  dismissTimers.set(processId, fiber)
}

export const queueStore = {
  subscribe(fn: Listener): () => void {
    listeners.add(fn)
    fn(Array.from(processes.values())) // Push initial state immediately
    return () => listeners.delete(fn)
  },
  getActiveCount(): number {
    let count = 0
    for (const entry of processes.values()) {
      if (!entry.done) count++
    }
    return count
  },
  hasActive(): boolean {
    return queueStore.getActiveCount() > 0
  },
  dismiss(processId: string) {
    clearDismissTimer(processId)
    if (!processes.has(processId)) {
      // Still notify so callers observing 'after dismiss' state get a tick.
      setState(new Map(processes))
      return
    }
    const next = new Map(processes)
    next.delete(processId)
    setState(next)
  },
}

export const queueChanges: Stream.Stream<ReadonlyMap<string, ProcessEntry>> = _ref.changes

export const getQueueSnapshot = (): ReadonlyMap<string, ProcessEntry> => processes

// Single central listener for the whole CS context
onMessage('queueStateUpdate', ({ data }) => {
  // Use processId if provided, fall back to sentinel 'bulk' for legacy bulk-update path
  const key = data.processId ?? 'bulk'
  const isDone = data.total === 0 && data.status === 'Done!'

  if (isDone) {
    const existing = processes.get(key)
    if (existing) {
      const mergedFailedItems = data.failedItems ?? existing.failedItems
      const next = new Map(processes)
      next.set(key, {
        ...existing,
        done: true,
        completed: existing.total,
        status: 'Done!',
        failedItems: mergedFailedItems,
        retryContext: data.retryContext ?? existing.retryContext,
      })
      setState(next)
      // Don't auto-dismiss when there are failures so the user can review them
      if (!mergedFailedItems || mergedFailedItems.length === 0) {
        scheduleDismiss(key)
      }
      // Fire completion toast when ALL processes are done
      const allDone = Array.from(processes.values()).every((e) => e.done)
      if (allDone && processes.size > 0) {
        toastStore.show({
          message: 'All tasks complete — reload to see your changes.',
          type: 'success',
          action: { label: 'Reload', onClick: () => window.location.reload() },
        })
      }
    }
    return
  }

  const existing = processes.get(key)
  const next = new Map(processes)
  next.set(key, {
    processId: key,
    label: data.label ?? existing?.label ?? (key === 'bulk' ? 'Bulk update' : 'Duplicating…'),
    total: data.total,
    completed: data.completed,
    paused: data.paused,
    retryAfter: data.retryAfter,
    status: data.status,
    detail: data.detail,
    done: false,
    failedItems: data.failedItems ?? (existing?.done ? undefined : existing?.failedItems),
    retryContext: data.retryContext ?? (existing?.done ? undefined : existing?.retryContext),
  })
  setState(next)
})
