import { describe, expect, it } from 'vitest'

import { buildOps, computeNewOrder, type OrderedItem } from '@/features/bulk-move-utils'

function item(id: number, title = `t${id}`): OrderedItem {
  return { memexItemId: id, nodeId: `node-${id}`, title }
}

const all = [item(1), item(2), item(3), item(4), item(5)]

describe('bulk-reorder-flyout — Top / Bottom direct-fire (computeNewOrder)', () => {
  it('TOP moves selected to the front', () => {
    const sel = new Set([3, 5])
    const order = computeNewOrder(all, sel, 'TOP', null)
    expect(order.map((i) => i.memexItemId)).toEqual([3, 5, 1, 2, 4])
  })

  it('BOTTOM moves selected to the end', () => {
    const sel = new Set([1, 2])
    const order = computeNewOrder(all, sel, 'BOTTOM', null)
    expect(order.map((i) => i.memexItemId)).toEqual([3, 4, 5, 1, 2])
  })
})

describe('bulk-reorder-flyout — Custom Before / After (computeNewOrder + buildOps)', () => {
  it('BEFORE target inserts selection ahead of target', () => {
    const sel = new Set([4])
    const order = computeNewOrder(all, sel, 'BEFORE', 2)
    expect(order.map((i) => i.memexItemId)).toEqual([1, 4, 2, 3, 5])
  })

  it('AFTER target inserts selection following target', () => {
    const sel = new Set([1])
    const order = computeNewOrder(all, sel, 'AFTER', 4)
    expect(order.map((i) => i.memexItemId)).toEqual([2, 3, 4, 1, 5])
  })

  it('buildOps emits ops only for selected items with the correct previousNodeId', () => {
    const sel = new Set([3, 5])
    const order = computeNewOrder(all, sel, 'TOP', null)
    const ops = buildOps(order, sel)
    expect(ops).toEqual([
      { nodeId: 'node-3', previousNodeId: null },
      { nodeId: 'node-5', previousNodeId: 'node-3' },
    ])
  })
})

describe('bulk-reorder-flyout — recent targets cache pinning semantics', () => {
  // Mirrors the module-local pushRecent helper inside `bulk-reorder-flyout.tsx`.
  // Pure logic, so we don't need to import the flyout (which transitively
  // imports the WXT message pipe and would require browser-runtime mocks).
  it('most-recent-first ordering with dedupe and cap', () => {
    const recents: number[] = []
    const cap = 5
    function push(id: number) {
      const idx = recents.indexOf(id)
      if (idx !== -1) recents.splice(idx, 1)
      recents.unshift(id)
      if (recents.length > cap) recents.length = cap
    }

    push(1)
    push(2)
    push(3)
    push(1)
    expect(recents).toEqual([1, 3, 2])

    push(4)
    push(5)
    push(6)
    expect(recents.length).toBeLessThanOrEqual(cap)
    expect(recents[0]).toBe(6)
  })
})
