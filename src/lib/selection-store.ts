import { Effect, Stream, SubscriptionRef } from 'effect'

import { logger } from '@/lib/debug-logger'

type Listener = () => void

// Internal SubscriptionRef holds the canonical state. A synchronous mirror
// (`current`) is kept so that getters / isSelected / count / getAll stay
// synchronous and zero-cost. Mutations always go through `setState` which
// updates the ref AND the mirror in one shot before firing legacy listeners
// — meaning `selectionChanges` Stream subscribers see the same sequence of
// values as legacy callback subscribers.
const _ref = Effect.runSync(SubscriptionRef.make<ReadonlySet<string>>(new Set<string>()))
let current: ReadonlySet<string> = new Set<string>()

const listeners = new Set<Listener>()
const focusListeners = new Set<() => void>()

function setState(next: ReadonlySet<string>): void {
  current = next
  Effect.runSync(SubscriptionRef.set(_ref, next))
  listeners.forEach((fn) => fn())
}

export const selectionStore = {
  toggle(id: string, on: boolean) {
    const next = new Set(current)
    if (on) next.add(id)
    else next.delete(id)
    logger.log(
      '[rgp:store] toggle',
      id,
      on ? '→ selected' : '→ deselected',
      `| total: ${next.size}`,
    )
    setState(next)
  },

  selectBatch(ids: string[]) {
    const next = new Set(current)
    ids.forEach((id) => next.add(id))
    setState(next)
  },

  deselectBatch(ids: string[]) {
    const next = new Set(current)
    ids.forEach((id) => next.delete(id))
    setState(next)
  },

  clear() {
    logger.log('[rgp:store] clear — was', current.size, 'items')
    setState(new Set<string>())
  },

  getAll(): string[] {
    return [...current]
  },

  isSelected(id: string): boolean {
    return current.has(id)
  },

  count(): number {
    return current.size
  },

  subscribe(fn: Listener): () => void {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },

  requestFocus() {
    focusListeners.forEach((fn) => fn())
  },

  onFocusRequest(fn: () => void): () => void {
    focusListeners.add(fn)
    return () => focusListeners.delete(fn)
  },
}

/**
 * Stream of selection-set changes. Subscribers receive the current value
 * immediately (SubscriptionRef semantics), then every subsequent update.
 * Useful from Effect-first callsites and from `useSubscriptionRef` consumers.
 */
export const selectionChanges: Stream.Stream<ReadonlySet<string>> = _ref.changes

/**
 * Synchronous snapshot accessor matching `useSyncExternalStore` semantics.
 */
export const getSelectionSnapshot = (): ReadonlySet<string> => current
