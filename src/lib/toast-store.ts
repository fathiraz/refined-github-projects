import { newProcessId } from '@/lib/format'

export interface ToastEntry {
  id: string
  message: string
  type: 'success' | 'info' | 'warning' | 'error'
  action?: { label: string; onClick: () => void }
}

const MAX_TOASTS = 3
const AUTO_DISMISS_MS = 5000

type Listener = (entries: ToastEntry[]) => void

let current: ToastEntry[] = []
const listeners = new Set<Listener>()

// tracks the eviction timer per toast id, so a manual dismiss cancels the
// pending auto-dismiss instead of letting it fire against a re-used id.
const dismissTimers = new Map<string, ReturnType<typeof setTimeout>>()

function setState(next: ToastEntry[]): void {
  current = next
  const snapshot = [...next]
  listeners.forEach((fn) => fn(snapshot))
}

function clearDismissTimer(id: string): void {
  const timer = dismissTimers.get(id)
  if (timer !== undefined) {
    clearTimeout(timer)
    dismissTimers.delete(id)
  }
}

function scheduleDismiss(id: string) {
  clearDismissTimer(id)
  dismissTimers.set(
    id,
    setTimeout(() => {
      dismissTimers.delete(id)
      toastStore.dismiss(id)
    }, AUTO_DISMISS_MS),
  )
}

export const toastStore = {
  show(entry: Omit<ToastEntry, 'id'>): string {
    const id = newProcessId('toast')
    // prepend newest on top; trim to max
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
