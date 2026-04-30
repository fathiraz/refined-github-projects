import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { toastStore, type ToastEntry } from '@/lib/toast-store'

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

    // first call is initial snapshot, second is after show
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
    expect(latest.length).toBe(3)
  })

  it('does not trim when at exactly MAX_TOASTS', () => {
    const entries: ToastEntry[][] = []
    toastStore.subscribe((e) => entries.push([...e]))

    toastStore.show({ message: 'a', type: 'info' })
    toastStore.show({ message: 'b', type: 'info' })
    toastStore.show({ message: 'c', type: 'info' })

    const latest = entries[entries.length - 1]
    expect(latest.length).toBe(3)
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

  it('dismiss is a no-op for unknown id', () => {
    const entries: ToastEntry[][] = []
    toastStore.subscribe((e) => entries.push([...e]))

    const id = toastStore.show({ message: 'exists', type: 'info' })
    const countBefore = entries.length
    toastStore.dismiss('non-existent-id')

    const latest = entries[entries.length - 1]
    expect(latest.find((t) => t.id === id)).toBeDefined()
    // notify still fires even for no-op dismiss
    expect(entries.length).toBe(countBefore + 1)
  })

  it('resets dismiss timer when showing with duplicate id', async () => {
    const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(12345)
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5)

    const entries: ToastEntry[][] = []
    toastStore.subscribe((e) => entries.push([...e]))

    const id = toastStore.show({ message: 'dup', type: 'info' })
    toastStore.show({ message: 'dup', type: 'info' })

    // two toasts with same id exist
    expect(entries[entries.length - 1].filter((t) => t.id === id)).toHaveLength(2)

    // advance to auto-dismiss — only one timer should fire because line 24 cleared the first.
    // `Async` form is required because Effect.sleep yields through microtasks.
    await vi.advanceTimersByTimeAsync(6000)

    // only one dismiss occurred, so one toast with that id should remain
    expect(entries[entries.length - 1].filter((t) => t.id === id)).toHaveLength(1)

    dateSpy.mockRestore()
    randomSpy.mockRestore()
  })

  // ---------------------------------------------------------------------------
  // auto-dismiss
  // ---------------------------------------------------------------------------

  it('auto-dismisses after 5000ms', async () => {
    const entries: ToastEntry[][] = []
    toastStore.subscribe((e) => entries.push([...e]))

    const id = toastStore.show({ message: 'temp', type: 'info' })

    // before timeout — toast should exist
    const beforeDismiss = entries[entries.length - 1]
    expect(beforeDismiss.find((t) => t.id === id)).toBeDefined()

    // advance past auto-dismiss timeout (`Async` form is required because
    // Effect.sleep yields through microtasks).
    await vi.advanceTimersByTimeAsync(6000)

    const afterDismiss = entries[entries.length - 1]
    expect(afterDismiss.find((t) => t.id === id)).toBeUndefined()
  })

  it('dismiss after auto-dismiss is a no-op', async () => {
    const entries: ToastEntry[][] = []
    toastStore.subscribe((e) => entries.push([...e]))

    const id = toastStore.show({ message: 'temp', type: 'info' })
    await vi.advanceTimersByTimeAsync(6000)

    // toast already auto-dismissed
    const afterAutoDismiss = entries[entries.length - 1]
    expect(afterAutoDismiss.find((t) => t.id === id)).toBeUndefined()

    // manual dismiss should not bring the toast back
    toastStore.dismiss(id)
    const afterManualDismiss = entries[entries.length - 1]
    expect(afterManualDismiss.find((t) => t.id === id)).toBeUndefined()
  })

  // ---------------------------------------------------------------------------
  // subscribe
  // ---------------------------------------------------------------------------

  it('subscribe immediately pushes current snapshot', () => {
    toastStore.show({ message: 'existing', type: 'info' })

    const received: ToastEntry[][] = []
    toastStore.subscribe((e) => received.push([...e]))

    // first call should have the existing toast
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
