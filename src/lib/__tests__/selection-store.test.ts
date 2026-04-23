import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../debug-logger', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), info: vi.fn() },
}))

import { selectionStore } from '../selection-store'

beforeEach(() => {
  selectionStore.clear()
})

// ---------------------------------------------------------------------------
// toggle
// ---------------------------------------------------------------------------

describe('selectionStore', () => {
  it('toggle(id, true) selects an item', () => {
    selectionStore.toggle('item-1', true)
    expect(selectionStore.isSelected('item-1')).toBe(true)
    expect(selectionStore.count()).toBe(1)
  })

  it('toggle(id, false) deselects an item', () => {
    selectionStore.toggle('item-1', true)
    selectionStore.toggle('item-1', false)
    expect(selectionStore.isSelected('item-1')).toBe(false)
    expect(selectionStore.count()).toBe(0)
  })

  // ---------------------------------------------------------------------------
  // selectBatch / deselectBatch
  // ---------------------------------------------------------------------------

  it('selectBatch adds multiple items', () => {
    selectionStore.selectBatch(['a', 'b', 'c'])
    expect(selectionStore.count()).toBe(3)
    expect(selectionStore.getAll()).toEqual(expect.arrayContaining(['a', 'b', 'c']))
  })

  it('deselectBatch removes specific items', () => {
    selectionStore.selectBatch(['a', 'b', 'c'])
    selectionStore.deselectBatch(['a', 'c'])
    expect(selectionStore.count()).toBe(1)
    expect(selectionStore.isSelected('b')).toBe(true)
  })

  // ---------------------------------------------------------------------------
  // clear
  // ---------------------------------------------------------------------------

  it('clear removes all items', () => {
    selectionStore.selectBatch(['x', 'y'])
    selectionStore.clear()
    expect(selectionStore.count()).toBe(0)
    expect(selectionStore.getAll()).toEqualValue([])
  })

  // ---------------------------------------------------------------------------
  // getAll / isSelected / count
  // ---------------------------------------------------------------------------

  it('getAll returns all selected ids', () => {
    selectionStore.toggle('a', true)
    selectionStore.toggle('b', true)
    const all = selectionStore.getAll()
    expect(all).toHaveLength(2)
    expect(all).toContain('a')
    expect(all).toContain('b')
  })

  it('isSelected returns false for unselected id', () => {
    expect(selectionStore.isSelected('nope')).toBe(false)
  })

  // ---------------------------------------------------------------------------
  // subscribe
  // ---------------------------------------------------------------------------

  it('subscribe fires on changes', () => {
    const listener = vi.fn()
    const unsub = selectionStore.subscribe(listener)

    selectionStore.toggle('x', true)
    expect(listener).toHaveBeenCalledTimes(1)

    selectionStore.toggle('x', false)
    expect(listener).toHaveBeenCalledTimes(2)

    unsub()
    selectionStore.toggle('y', true)
    expect(listener).toHaveBeenCalledTimes(2) // not called after unsub
  })

  it('subscribe fires on clear', () => {
    const listener = vi.fn()
    selectionStore.subscribe(listener)
    selectionStore.selectBatch(['a', 'b'])
    listener.mockClear()

    selectionStore.clear()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  // ---------------------------------------------------------------------------
  // requestFocus / onFocusRequest
  // ---------------------------------------------------------------------------

  it('requestFocus calls focus listeners', () => {
    const focusFn = vi.fn()
    const unsub = selectionStore.onFocusRequest(focusFn)

    selectionStore.requestFocus()
    expect(focusFn).toHaveBeenCalledTimes(1)

    unsub()
    selectionStore.requestFocus()
    expect(focusFn).toHaveBeenCalledTimes(1) // not called after unsub
  })
})
