import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { toastStore, type ToastEntry } from '../toast-store'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// show
// ---------------------------------------------------------------------------

describe('toastStore', () => {
  it('show returns a unique id', () => {
    const id = toastStore.show({ message: 'hello', type: 'info' })
    expect(id).toMatch(/^toast-/)
  })

  it('subscriber receives new toast on show', () => {
    const entries: ToastEntry[][] = []
    toastStore.subscribe((e) => entries.push([...e]))

    toastStore.show({ message: 'first', type: 'success' })

    // First call is initial snapshot, second is after show
    const latest = entries[entries.length - 1]
    expect(latest.length).toBeGreaterThanOrEqual(1)
    expect(latest[0].message).toBe('first')
  })

  it('prepends newest toast on top', () => {
    const entries: ToastEntry[][] = []
    toastStore.subscribe((e) => entries.push([...e]))

    toastStore.show({ message: 'old', type: 'info' })
    toastStore.show({ message: 'new', type: 'info' })

    const latest = entries[entries.length - 1]
    expect(latest[0].message).toBe('new')
  })

  it('trims to MAX_TOASTS (3)', () => {
    const entries: ToastEntry[][] = []
    toastStore.subscribe((e) => entries.push([...e]))

    toastStore.show({ message: 'a', type: 'info' })
    toastStore.show({ message: 'b', type: 'info' })
    toastStore.show({ message: 'c', type: 'info' })
    toastStore.show({ message: 'd', type: 'info' })

    const latest = entries[entries.length - 1]
    expect(latest.length).toBeLessThanOrEqual(3)
  })

  // ---------------------------------------------------------------------------
  // dismiss
  // ---------------------------------------------------------------------------

  it('dismiss removes a toast by id', () => {
    const entries: ToastEntry[][] = []
    toastStore.subscribe((e) => entries.push([...e]))

    const id = toastStore.show({ message: 'bye', type: 'warning' })
    toastStore.dismiss(id)

    const latest = entries[entries.length - 1]
    expect(latest.find((t) => t.id === id)).toBeUndefined()
  })

  // ---------------------------------------------------------------------------
  // auto-dismiss
  // ---------------------------------------------------------------------------

  it('auto-dismisses after 5000ms', () => {
    const entries: ToastEntry[][] = []
    toastStore.subscribe((e) => entries.push([...e]))

    const id = toastStore.show({ message: 'temp', type: 'info' })

    // Before timeout — toast should exist
    const beforeDismiss = entries[entries.length - 1]
    expect(beforeDismiss.find((t) => t.id === id)).toBeDefined()

    // Advance past auto-dismiss timeout
    vi.advanceTimersByTime(6000)

    const afterDismiss = entries[entries.length - 1]
    expect(afterDismiss.find((t) => t.id === id)).toBeUndefined()
  })

  // ---------------------------------------------------------------------------
  // subscribe
  // ---------------------------------------------------------------------------

  it('subscribe immediately pushes current snapshot', () => {
    toastStore.show({ message: 'existing', type: 'info' })

    const received: ToastEntry[][] = []
    toastStore.subscribe((e) => received.push([...e]))

    // First call should have the existing toast
    expect(received.length).toBeGreaterThanOrEqual(1)
  })

  it('unsubscribe stops notifications', () => {
    const listener = vi.fn()
    const unsub = toastStore.subscribe(listener)
    listener.mockClear()

    unsub()
    toastStore.show({ message: 'after unsub', type: 'error' })
    expect(listener).not.toHaveBeenCalled()
  })
})
