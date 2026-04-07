import { describe, it, expect, vi, beforeEach } from 'vitest'

import { checkboxPortalStore, type PortalEntry } from '../checkbox-portal-store'

function makeContainer(connected = true): HTMLElement {
  const el = document.createElement('div')
  // happy-dom elements are connected when appended to document
  if (connected) document.body.appendChild(el)
  return el
}

// ---------------------------------------------------------------------------
// addRow
// ---------------------------------------------------------------------------

describe('checkboxPortalStore', () => {
  it('addRow adds a row entry and notifies subscribers', () => {
    const snapshots: PortalEntry[][] = []
    const unsub = checkboxPortalStore.subscribe((e) => snapshots.push([...e]))

    const container = makeContainer()
    checkboxPortalStore.addRow(container, 'item-1')

    const latest = snapshots[snapshots.length - 1]
    expect(latest.some((e) => e.type === 'row' && e.itemId === 'item-1')).toBe(true)
    unsub()
  })

  it('addRow replaces existing entry with same itemId', () => {
    const snapshots: PortalEntry[][] = []
    const unsub = checkboxPortalStore.subscribe((e) => snapshots.push([...e]))

    const c1 = makeContainer()
    const c2 = makeContainer()
    checkboxPortalStore.addRow(c1, 'dup')
    checkboxPortalStore.addRow(c2, 'dup')

    const latest = snapshots[snapshots.length - 1]
    const dupEntries = latest.filter((e) => e.type === 'row' && e.itemId === 'dup')
    expect(dupEntries).toHaveLength(1)
    unsub()
  })

  // ---------------------------------------------------------------------------
  // addGroup
  // ---------------------------------------------------------------------------

  it('addGroup adds a group entry', () => {
    const snapshots: PortalEntry[][] = []
    const unsub = checkboxPortalStore.subscribe((e) => snapshots.push([...e]))

    const container = makeContainer()
    checkboxPortalStore.addGroup(container, () => ['a', 'b'])

    const latest = snapshots[snapshots.length - 1]
    expect(latest.some((e) => e.type === 'group')).toBe(true)
    unsub()
  })

  // ---------------------------------------------------------------------------
  // addSelectAll
  // ---------------------------------------------------------------------------

  it('addSelectAll adds a selectall entry', () => {
    const snapshots: PortalEntry[][] = []
    const unsub = checkboxPortalStore.subscribe((e) => snapshots.push([...e]))

    const container = makeContainer()
    checkboxPortalStore.addSelectAll(container)

    const latest = snapshots[snapshots.length - 1]
    expect(latest.some((e) => e.type === 'selectall')).toBe(true)
    unsub()
  })

  // ---------------------------------------------------------------------------
  // subscribe
  // ---------------------------------------------------------------------------

  it('subscribe immediately pushes current entries', () => {
    const container = makeContainer()
    checkboxPortalStore.addRow(container, 'pre-existing')

    const received: PortalEntry[][] = []
    const unsub = checkboxPortalStore.subscribe((e) => received.push([...e]))

    expect(received.length).toBeGreaterThanOrEqual(1)
    unsub()
  })

  it('unsubscribe stops notifications', () => {
    const listener = vi.fn()
    const unsub = checkboxPortalStore.subscribe(listener)
    listener.mockClear()

    unsub()
    checkboxPortalStore.addRow(makeContainer(), 'after-unsub')
    expect(listener).not.toHaveBeenCalled()
  })
})
