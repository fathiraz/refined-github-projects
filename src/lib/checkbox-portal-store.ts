import { Effect, Stream, SubscriptionRef } from 'effect'

export type PortalEntry =
  | { type: 'row'; container: HTMLElement; itemId: string }
  | { type: 'group'; container: HTMLElement; getItemIds: () => string[] }
  | { type: 'selectall'; container: HTMLElement }

type Listener = (entries: readonly PortalEntry[]) => void

const _ref = Effect.runSync(
  SubscriptionRef.make<readonly PortalEntry[]>([] as readonly PortalEntry[]),
)
let current: readonly PortalEntry[] = []

const listeners = new Set<Listener>()

function isConnected(entry: PortalEntry): boolean {
  return entry.container.isConnected
}

function setState(next: readonly PortalEntry[]): void {
  current = next
  Effect.runSync(SubscriptionRef.set(_ref, next))
  listeners.forEach((fn) => fn(current))
}

function applyCleanup(): readonly PortalEntry[] {
  const next = current.filter(isConnected)
  return next.length === current.length ? current : next
}

export const checkboxPortalStore = {
  addRow(container: HTMLElement, itemId: string): void {
    const cleaned = applyCleanup()
    const next: readonly PortalEntry[] = [
      ...cleaned.filter((entry) => entry.type !== 'row' || entry.itemId !== itemId),
      { type: 'row', container, itemId },
    ]
    setState(next)
  },

  addGroup(container: HTMLElement, getItemIds: () => string[]): void {
    const cleaned = applyCleanup()
    const next: readonly PortalEntry[] = [
      ...cleaned.filter((entry) => entry.type !== 'group' || entry.container !== container),
      { type: 'group', container, getItemIds },
    ]
    setState(next)
  },

  addSelectAll(container: HTMLElement): void {
    const cleaned = applyCleanup()
    const next: readonly PortalEntry[] = [
      ...cleaned.filter((entry) => entry.type !== 'selectall'),
      { type: 'selectall', container },
    ]
    setState(next)
  },

  subscribe(fn: Listener): () => void {
    const cleaned = applyCleanup()
    if (cleaned !== current) setState(cleaned)
    listeners.add(fn)
    fn(current)
    return () => listeners.delete(fn)
  },
}

export const checkboxPortalChanges: Stream.Stream<readonly PortalEntry[]> = _ref.changes

export const getCheckboxPortalSnapshot = (): readonly PortalEntry[] => current
