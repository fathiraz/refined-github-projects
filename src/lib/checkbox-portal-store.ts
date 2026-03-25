export type PortalEntry =
  | { type: 'row'; container: HTMLElement; itemId: string }
  | { type: 'group'; container: HTMLElement; getItemIds: () => string[] }
  | { type: 'selectall'; container: HTMLElement }

type Listener = (entries: readonly PortalEntry[]) => void

const listeners = new Set<Listener>()
let entries: readonly PortalEntry[] = []

function isConnected(entry: PortalEntry): boolean {
  return entry.container.isConnected
}

function cleanupEntries(): void {
  entries = entries.filter(isConnected)
}

function notify(): void {
  cleanupEntries()
  listeners.forEach(fn => fn(entries))
}

export const checkboxPortalStore = {
  addRow(container: HTMLElement, itemId: string): void {
    cleanupEntries()
    entries = [
      ...entries.filter(entry => entry.type !== 'row' || entry.itemId !== itemId),
      { type: 'row', container, itemId },
    ]
    notify()
  },

  addGroup(container: HTMLElement, getItemIds: () => string[]): void {
    cleanupEntries()
    entries = [
      ...entries.filter(entry => entry.type !== 'group' || entry.container !== container),
      { type: 'group', container, getItemIds },
    ]
    notify()
  },

  addSelectAll(container: HTMLElement): void {
    cleanupEntries()
    entries = [
      ...entries.filter(entry => entry.type !== 'selectall'),
      { type: 'selectall', container },
    ]
    notify()
  },

  subscribe(fn: Listener): () => void {
    cleanupEntries()
    listeners.add(fn)
    fn(entries)
    return () => listeners.delete(fn)
  },
}
