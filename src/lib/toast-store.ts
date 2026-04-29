import { Duration, Effect, Fiber, Stream, SubscriptionRef } from 'effect'

export interface ToastEntry {
  id: string
  message: string
  type: 'success' | 'info' | 'warning' | 'error'
  action?: { label: string; onClick: () => void }
}

const MAX_TOASTS = 3
const AUTO_DISMISS = Duration.millis(5000)

type Listener = (entries: ToastEntry[]) => void

const _ref = Effect.runSync(SubscriptionRef.make<ToastEntry[]>([]))
let current: ToastEntry[] = []
const listeners = new Set<Listener>()

// Tracks the eviction fiber per toast id. Effect.sleep + Fiber.interrupt keeps
// dismissal on the Effect runtime (TestClock-friendly) and integrates with
// structured cancellation.
const dismissTimers = new Map<string, Fiber.RuntimeFiber<void>>()

function setState(next: ToastEntry[]): void {
  current = next
  Effect.runSync(SubscriptionRef.set(_ref, next))
  const snapshot = [...next]
  listeners.forEach((fn) => fn(snapshot))
}

function clearDismissTimer(id: string): void {
  const fiber = dismissTimers.get(id)
  if (fiber !== undefined) {
    Effect.runFork(Fiber.interrupt(fiber))
    dismissTimers.delete(id)
  }
}

function scheduleDismiss(id: string) {
  clearDismissTimer(id)
  const fiber = Effect.runFork(
    Effect.sleep(AUTO_DISMISS).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          // Only dismiss if this fiber is still the active one for the id —
          // a manual dismiss before TTL elapses will have already cleared it.
          if (dismissTimers.get(id) === fiber) {
            toastStore.dismiss(id)
          }
        }),
      ),
    ),
  )
  dismissTimers.set(id, fiber)
}

export const toastStore = {
  show(entry: Omit<ToastEntry, 'id'>): string {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    // Prepend newest on top; trim to max
    const next = [{ id, ...entry }, ...current]
    if (next.length > MAX_TOASTS) next.splice(MAX_TOASTS)
    setState(next)
    scheduleDismiss(id)
    return id
  },

  dismiss(id: string): void {
    const idx = current.findIndex((t) => t.id === id)
    const next = idx === -1 ? [...current] : current.filter((_, i) => i !== idx)
    clearDismissTimer(id)
    setState(next)
  },

  subscribe(fn: Listener): () => void {
    listeners.add(fn)
    fn([...current])
    return () => listeners.delete(fn)
  },
}

export const toastChanges: Stream.Stream<ToastEntry[]> = _ref.changes

export const getToastSnapshot = (): ToastEntry[] => current
