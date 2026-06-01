import { Duration, Effect, Fiber, Stream, SubscriptionRef } from 'effect'

import { onMessage } from '@/lib/messages'
import { toastStore } from '@/lib/toast-store'

/** Reverse mutation specification — verb handlers attach this so result cards can offer Undo. */
export interface ReverseOp {
  messageType: string
  data: Record<string, unknown>
  /** Item IDs successfully affected by the original op (subset on partial success). */
  affectedItemIds: string[]
  /** Optional human label shown in the Undo confirmation, e.g. "Reopen 3 issues". */
  label?: string
}

/** Retry specification — describes how to re-run the failed subset of a partial-success queue entry. */
export interface RetrySpec {
  messageType: string
  data: Record<string, unknown>
}

export type ProcessPhase =
  | { kind: 'in-flight'; progress: { done: number; total: number } }
  | { kind: 'success'; undoableUntil?: number; reverse?: ReverseOp }
  | {
      kind: 'partial'
      failedItemIds: string[]
      retry?: RetrySpec
      failedItems: Array<{ id: string; title: string; error: string }>
    }
  | { kind: 'error'; error: { message: string } }

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
  /** Discriminated phase derived from the entry's lifecycle state. */
  phase: ProcessPhase
}

/** Per-process phase hints attached by verb handlers via `queueStore.attachPhaseHints`. */
interface PhaseHints {
  reverse?: ReverseOp
  retry?: RetrySpec
  undoWindowMs?: number
}

type Listener = (entries: ProcessEntry[]) => void

const DISMISS_DELAY = Duration.millis(3000)
const DEFAULT_UNDO_WINDOW_MS = 10_000

const _ref = Effect.runSync(SubscriptionRef.make<ReadonlyMap<string, ProcessEntry>>(new Map()))
let processes: Map<string, ProcessEntry> = new Map()
const listeners = new Set<Listener>()
const dismissTimers = new Map<string, Fiber.RuntimeFiber<void>>()
const phaseHintsMap = new Map<string, PhaseHints>()

function derivePhase(
  base: Omit<ProcessEntry, 'phase'>,
  hints: PhaseHints | undefined,
): ProcessPhase {
  if (!base.done) {
    return { kind: 'in-flight', progress: { done: base.completed, total: base.total } }
  }
  if (base.failedItems && base.failedItems.length > 0) {
    // §2.10 — when every attempted item failed, surface as `error` so the result
    // card can offer a fuller `Copy details` dump (label + classification +
    // per-item errors). Mixed failure stays `partial` (offers Retry + per-item Copy).
    if (base.total > 0 && base.failedItems.length >= base.total) {
      return {
        kind: 'error',
        error: { message: synthesizeErrorMessage(base.failedItems) },
      }
    }
    return {
      kind: 'partial',
      failedItemIds: base.failedItems.map((f) => f.id),
      failedItems: base.failedItems,
      retry: hints?.retry ?? buildRetryFromContext(base),
    }
  }
  const undoableUntil =
    hints?.reverse !== undefined
      ? Date.now() + (hints.undoWindowMs ?? DEFAULT_UNDO_WINDOW_MS)
      : undefined
  return { kind: 'success', undoableUntil, reverse: hints?.reverse }
}

function synthesizeErrorMessage(failed: ReadonlyArray<{ error: string }>): string {
  if (failed.length === 0) return 'Unknown error'
  // When every failed-item error is the same, surface it once; otherwise show
  // the first error plus a count of additional failures.
  const first = failed[0].error
  const allSame = failed.every((f) => f.error === first)
  return allSame ? first : `${first} (+${failed.length - 1} more)`
}

/**
 * Classify a failure message into a short category label. Used by the result
 * card's `Copy details` action so the clipboard payload includes both the raw
 * error and a tag the user can paste into a bug report or support thread.
 */
export function classifyErrorMessage(message: string): string {
  const m = message.toLowerCase()
  // Order matters: a 'secondary rate limit / abuse' message contains both
  // 'abuse' and 'rate limit', and GitHub serves them under the rate-limit
  // umbrella (Retry-After + transient), so rate-limit takes precedence.
  if (
    m.includes('429') ||
    m.includes('rate limit') ||
    m.includes('secondary rate') ||
    m.includes('abuse')
  )
    return 'rate-limit'
  if (m.includes('401') || m.includes('unauthorized') || m.includes('bad credentials'))
    return 'auth'
  if (m.includes('403') || m.includes('forbidden')) return 'forbidden'
  if (m.includes('500') || m.includes('502') || m.includes('503')) return 'server'
  if (m.includes('network') || m.includes('failed to fetch') || m.includes('econnreset'))
    return 'network'
  if (m.includes('not found') || m.includes('404')) return 'not-found'
  return 'unknown'
}

function buildRetryFromContext(base: Omit<ProcessEntry, 'phase'>): RetrySpec | undefined {
  if (!base.retryContext || !base.failedItems || base.failedItems.length === 0) return undefined
  return {
    messageType: base.retryContext.messageType,
    data: { ...base.retryContext.data, itemIds: base.failedItems.map((f) => f.id) },
  }
}

function withPhase(entry: Omit<ProcessEntry, 'phase'>): ProcessEntry {
  return { ...entry, phase: derivePhase(entry, phaseHintsMap.get(entry.processId)) }
}

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

/** Remove process entry and attached phase hints (manual dismiss + auto-dismiss). */
function removeProcess(processId: string, opts?: { skipClearTimer?: boolean }): void {
  if (!opts?.skipClearTimer) clearDismissTimer(processId)
  phaseHintsMap.delete(processId)
  if (!processes.has(processId)) return
  const next = new Map(processes)
  next.delete(processId)
  setState(next)
}

function scheduleDismiss(processId: string, delay: Duration.Duration = DISMISS_DELAY) {
  clearDismissTimer(processId)
  const fiber = Effect.runFork(
    Effect.sleep(delay).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          if (dismissTimers.get(processId) !== fiber) return
          dismissTimers.delete(processId)
          removeProcess(processId, { skipClearTimer: true })
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
    const existed = processes.has(processId)
    removeProcess(processId)
    if (!existed) {
      // still notify so callers observing 'after dismiss' state get a tick.
      setState(new Map(processes))
    }
  },
  /**
   * Attach reverse / retry hints to a process. Verb handlers call this before
   * (or during) the bulk operation so the result card can render Undo / Retry
   * actions once the process completes.
   */
  attachPhaseHints(processId: string, hints: PhaseHints): void {
    const merged = { ...(phaseHintsMap.get(processId) ?? {}), ...hints }
    phaseHintsMap.set(processId, merged)
    const existing = processes.get(processId)
    if (existing) {
      const next = new Map(processes)
      next.set(processId, withPhase(existing))
      setState(next)
    }
  },
  /** Read attached hints — useful for tests and Undo click handlers. */
  getPhaseHints(processId: string): PhaseHints | undefined {
    return phaseHintsMap.get(processId)
  },
}

export const queueChanges: Stream.Stream<ReadonlyMap<string, ProcessEntry>> = _ref.changes

// return a defensive copy so external consumers cannot mutate the live ref
// and bypass setState's notify/SubscriptionRef updates.
export const getQueueSnapshot = (): ReadonlyMap<string, ProcessEntry> => new Map(processes)

// single central listener for the whole CS context
onMessage('queueStateUpdate', ({ data }) => {
  // use processId if provided, fall back to sentinel 'bulk' for legacy bulk-update path
  const key = data.processId ?? 'bulk'
  const isDone = data.total === 0 && data.status === 'Done!'

  if (isDone) {
    const existing = processes.get(key)
    if (existing) {
      const mergedFailedItems = data.failedItems ?? existing.failedItems
      const hasFailures = (mergedFailedItems?.length ?? 0) > 0
      // BG-attached reverse hints arrive on the Done! broadcast. Only consume
      // them when the run is a clean success — partial outcomes shouldn't
      // offer Undo because the reverse spec was built against the original
      // (incomplete) item set.
      if (data.reverse && !hasFailures) {
        const reverseData = { ...data.reverse.data, itemIds: [...data.reverse.affectedItemIds] }
        phaseHintsMap.set(key, {
          ...(phaseHintsMap.get(key) ?? {}),
          reverse: {
            messageType: data.reverse.messageType,
            data: reverseData,
            affectedItemIds: [...data.reverse.affectedItemIds],
            label: data.reverse.label,
          },
          undoWindowMs: data.reverse.undoWindowMs,
        })
      }
      const next = new Map(processes)
      next.set(
        key,
        withPhase({
          ...existing,
          done: true,
          completed: existing.total,
          status: 'Done!',
          failedItems: mergedFailedItems,
          retryContext: data.retryContext ?? existing.retryContext,
        }),
      )
      setState(next)
      // don't auto-dismiss when there are failures so the user can review them
      if (!mergedFailedItems || mergedFailedItems.length === 0) {
        // §2.11 — when a reverse hint is attached, hold the card until the
        // Undo window elapses; otherwise fall back to the legacy 3 s dismiss.
        const hintNow = phaseHintsMap.get(key)
        const dismissMs =
          hintNow?.reverse !== undefined
            ? (hintNow.undoWindowMs ?? DEFAULT_UNDO_WINDOW_MS)
            : undefined
        scheduleDismiss(key, dismissMs !== undefined ? Duration.millis(dismissMs) : DISMISS_DELAY)
      }
      // fire completion toast when ALL processes are done
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
  next.set(
    key,
    withPhase({
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
    }),
  )
  setState(next)
})
