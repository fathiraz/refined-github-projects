import { onMessage } from './messages'
import { toastStore } from './toastStore'

export interface ProcessEntry {
  processId: string
  label: string
  total: number
  completed: number
  paused: boolean
  retryAfter?: number
  status?: string
  done: boolean
}

type Listener = (entries: ProcessEntry[]) => void

const processes = new Map<string, ProcessEntry>()
const listeners = new Set<Listener>()
const dismissTimers = new Map<string, ReturnType<typeof setTimeout>>()

function notify() {
  const entries = Array.from(processes.values())
  listeners.forEach(fn => fn(entries))
}

function scheduleDismiss(processId: string) {
  const existing = dismissTimers.get(processId)
  if (existing) clearTimeout(existing)
  const timer = setTimeout(() => {
    processes.delete(processId)
    dismissTimers.delete(processId)
    notify()
  }, 3000)
  dismissTimers.set(processId, timer)
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
    const timer = dismissTimers.get(processId)
    if (timer) clearTimeout(timer)
    dismissTimers.delete(processId)
    processes.delete(processId)
    notify()
  },
}

// Single central listener for the whole CS context
onMessage('queueStateUpdate', ({ data }) => {
  // Use processId if provided, fall back to sentinel 'bulk' for legacy bulk-update path
  const key = data.processId ?? 'bulk'
  const isDone = data.total === 0 && data.status === 'Done!'

  if (isDone) {
    const existing = processes.get(key)
    if (existing) {
      processes.set(key, { ...existing, done: true, completed: existing.total, status: 'Done!' })
      notify()
      scheduleDismiss(key)
      // Fire completion toast when ALL processes are done
      const allDone = Array.from(processes.values()).every(e => e.done)
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
  processes.set(key, {
    processId: key,
    label: data.label ?? existing?.label ?? (key === 'bulk' ? 'Bulk update' : 'Duplicating…'),
    total: data.total,
    completed: data.completed,
    paused: data.paused,
    retryAfter: data.retryAfter,
    status: data.status,
    done: false,
  })
  notify()
})
