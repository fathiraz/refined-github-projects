import { logger } from './debugLogger'

type Listener = () => void

const listeners = new Set<Listener>()
const focusListeners = new Set<() => void>()
let selected = new Set<string>()

function notify() {
  listeners.forEach(fn => fn())
}

export const selectionStore = {
  toggle(id: string, on: boolean) {
    if (on) {
      selected.add(id)
    } else {
      selected.delete(id)
    }
    logger.log('[rgp:store] toggle', id, on ? '→ selected' : '→ deselected', `| total: ${selected.size}`)
    notify()
  },

  selectBatch(ids: string[]) {
    ids.forEach(id => selected.add(id))
    notify()
  },

  deselectBatch(ids: string[]) {
    ids.forEach(id => selected.delete(id))
    notify()
  },

  clear() {
    logger.log('[rgp:store] clear — was', selected.size, 'items')
    selected = new Set()
    notify()
  },

  getAll(): string[] {
    return [...selected]
  },

  isSelected(id: string): boolean {
    return selected.has(id)
  },

  count(): number {
    return selected.size
  },

  subscribe(fn: Listener): () => void {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },

  requestFocus() {
    focusListeners.forEach(fn => fn())
  },

  onFocusRequest(fn: () => void): () => void {
    focusListeners.add(fn)
    return () => focusListeners.delete(fn)
  },
}
