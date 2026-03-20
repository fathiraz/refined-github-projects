export interface ToastEntry {
  id: string
  message: string
  type: 'success' | 'info' | 'warning' | 'error'
  action?: { label: string; onClick: () => void }
}

const MAX_TOASTS = 3
const AUTO_DISMISS_MS = 5000

type Listener = (entries: ToastEntry[]) => void

const toasts: ToastEntry[] = []
const listeners = new Set<Listener>()
const dismissTimers = new Map<string, ReturnType<typeof setTimeout>>()

function notify() {
  const snapshot = [...toasts]
  listeners.forEach(fn => fn(snapshot))
}

function scheduleDismiss(id: string) {
  const existing = dismissTimers.get(id)
  if (existing) clearTimeout(existing)
  const timer = setTimeout(() => {
    toastStore.dismiss(id)
  }, AUTO_DISMISS_MS)
  dismissTimers.set(id, timer)
}

export const toastStore = {
  show(entry: Omit<ToastEntry, 'id'>): string {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    // Prepend newest on top; trim to max
    toasts.unshift({ id, ...entry })
    if (toasts.length > MAX_TOASTS) toasts.splice(MAX_TOASTS)
    notify()
    scheduleDismiss(id)
    return id
  },

  dismiss(id: string): void {
    const idx = toasts.findIndex(t => t.id === id)
    if (idx !== -1) toasts.splice(idx, 1)
    const timer = dismissTimers.get(id)
    if (timer) { clearTimeout(timer); dismissTimers.delete(id) }
    notify()
  },

  subscribe(fn: Listener): () => void {
    listeners.add(fn)
    fn([...toasts])
    return () => listeners.delete(fn)
  },
}
