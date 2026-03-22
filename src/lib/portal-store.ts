export type PortalEntry =
  | { type: 'row'; container: HTMLElement; itemId: string }
  | { type: 'group'; container: HTMLElement; getItemIds: () => string[] }
  | { type: 'selectall'; container: HTMLElement }

type Listener = (entries: readonly PortalEntry[]) => void

const listeners = new Set<Listener>()
let entries: readonly PortalEntry[] = []

function notify() {
  listeners.forEach(fn => fn(entries))
}

export const portalStore = {
  addRow(container: HTMLElement, itemId: string): void {
    entries = [...entries, { type: 'row', container, itemId }]
    notify()
  },

  addGroup(container: HTMLElement, getItemIds: () => string[]): void {
    entries = [...entries, { type: 'group', container, getItemIds }]
    notify()
  },

  addSelectAll(container: HTMLElement): void {
    if (entries.some(e => e.type === 'selectall')) return
    entries = [...entries, { type: 'selectall', container }]
    notify()
  },

  subscribe(fn: Listener): () => void {
    listeners.add(fn)
    fn(entries)
    return () => listeners.delete(fn)
  },
}
