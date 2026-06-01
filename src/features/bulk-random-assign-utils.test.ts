import { describe, it, expect } from 'vitest'

import {
  distributeBalanced,
  distributeRandom,
  distributeRoundRobin,
  distributionFromByItem,
  invertDistribution,
  mergePreserveExisting,
} from '@/features/bulk-random-assign-utils'

function collectAllValues(map: Map<string, string[]>): string[] {
  const all: string[] = []
  for (const items of map.values()) {
    all.push(...items)
  }
  return all
}

describe('invertDistribution / distributionFromByItem', () => {
  it('inverts assignee buckets to per-item assignee lists', () => {
    const distribution = new Map([
      ['a1', ['i1', 'i3']],
      ['a2', ['i2', 'i3']],
    ])

    const byItem = invertDistribution(distribution)

    expect(byItem.get('i1')).toEqual(['a1'])
    expect(byItem.get('i2')).toEqual(['a2'])
    expect(byItem.get('i3')).toEqual(['a1', 'a2'])
  })

  it('round-trips through distributionFromByItem', () => {
    const original = distributeRoundRobin(['i1', 'i2', 'i3', 'i4'], ['a', 'b'])
    const byItem = invertDistribution(original)
    const roundTrip = distributionFromByItem(byItem)

    expect(roundTrip.get('a')).toEqual(original.get('a'))
    expect(roundTrip.get('b')).toEqual(original.get('b'))
  })
})

describe('mergePreserveExisting', () => {
  it('unions existing and new assignees with dedupe', () => {
    const newByItem = new Map([['i1', ['a2']]])
    const existingByItem = new Map([['i1', ['a1', 'a2']]])

    const merged = mergePreserveExisting(newByItem, existingByItem)

    expect(merged.get('i1')).toEqual(['a1', 'a2'])
  })

  it('keeps existing-only assignees when new assigns a different person', () => {
    const newByItem = new Map([['i1', ['b']]])
    const existingByItem = new Map([['i1', ['a']]])

    expect(mergePreserveExisting(newByItem, existingByItem).get('i1')).toEqual(['a', 'b'])
  })

  it('uses only new assignees when item has no existing entry', () => {
    const newByItem = new Map([['i1', ['a']]])
    const existingByItem = new Map<string, string[]>()

    expect(mergePreserveExisting(newByItem, existingByItem).get('i1')).toEqual(['a'])
  })

  it('returns empty list when both maps omit an item', () => {
    const merged = mergePreserveExisting(new Map(), new Map())
    expect(merged.size).toBe(0)
  })
})

describe('distributeBalanced', () => {
  it('distributes 6 items evenly among 3 assignees', () => {
    const items = ['i1', 'i2', 'i3', 'i4', 'i5', 'i6']
    const assignees = ['a1', 'a2', 'a3']

    const result = distributeBalanced(items, assignees)

    for (const assignee of assignees) {
      expect(result.get(assignee)).toHaveLength(2)
    }
  })

  it('distributes 7 items among 3 assignees with max difference of 1', () => {
    const items = ['i1', 'i2', 'i3', 'i4', 'i5', 'i6', 'i7']
    const assignees = ['a1', 'a2', 'a3']

    const result = distributeBalanced(items, assignees)

    const counts = assignees.map((a) => result.get(a)!.length)
    const min = Math.min(...counts)
    const max = Math.max(...counts)
    expect(max - min).toBeLessThanOrEqual(1)
  })

  it('gives all items to a single assignee', () => {
    const items = ['i1', 'i2', 'i3']
    const assignees = ['solo']

    const result = distributeBalanced(items, assignees)

    expect(result.get('solo')).toHaveLength(3)
    expect(collectAllValues(result).sort()).toEqualValue(items.sort())
  })

  it('returns empty arrays for all assignees when items is empty', () => {
    const assignees = ['a1', 'a2', 'a3']

    const result = distributeBalanced([], assignees)

    for (const assignee of assignees) {
      expect(result.get(assignee)).toEqualValue([])
    }
  })

  it('returns an empty map when assignees is empty', () => {
    const result = distributeBalanced(['i1', 'i2'], [])

    expect(result.size).toBe(0)
  })

  it('distributes all items without losing any', () => {
    const items = ['i1', 'i2', 'i3', 'i4', 'i5', 'i6', 'i7', 'i8', 'i9', 'i10']
    const assignees = ['a1', 'a2', 'a3']

    const result = distributeBalanced(items, assignees)

    const allDistributed = collectAllValues(result)
    expect(allDistributed.sort()).toEqualValue([...items].sort())
  })
})

describe('distributeRandom', () => {
  it('distributes all items (total assigned equals total items)', () => {
    const items = ['i1', 'i2', 'i3', 'i4', 'i5', 'i6']
    const assignees = ['a1', 'a2', 'a3']

    const result = distributeRandom(items, assignees)

    const allDistributed = collectAllValues(result)
    expect(allDistributed.sort()).toEqualValue([...items].sort())
  })

  it('has an entry for each assignee in the result', () => {
    const items = ['i1', 'i2', 'i3']
    const assignees = ['a1', 'a2', 'a3']

    const result = distributeRandom(items, assignees)

    for (const assignee of assignees) {
      expect(result.has(assignee)).toBe(true)
    }
  })

  it('returns empty arrays for all assignees when items is empty', () => {
    const assignees = ['a1', 'a2']

    const result = distributeRandom([], assignees)

    for (const assignee of assignees) {
      expect(result.get(assignee)).toEqualValue([])
    }
  })

  it('returns an empty map when assignees is empty', () => {
    const result = distributeRandom(['i1', 'i2'], [])

    expect(result.size).toBe(0)
  })
})

describe('distributeRoundRobin', () => {
  it('distributes 6 items among 3 assignees in correct round-robin order', () => {
    const items = ['i1', 'i2', 'i3', 'i4', 'i5', 'i6']
    const assignees = ['a1', 'a2', 'a3']

    const result = distributeRoundRobin(items, assignees)

    expect(result.get('a1')).toEqualValue(['i1', 'i4'])
    expect(result.get('a2')).toEqualValue(['i2', 'i5'])
    expect(result.get('a3')).toEqualValue(['i3', 'i6'])
  })

  it('distributes 7 items among 3 assignees — first gets 3, others get 2', () => {
    const items = ['i1', 'i2', 'i3', 'i4', 'i5', 'i6', 'i7']
    const assignees = ['a1', 'a2', 'a3']

    const result = distributeRoundRobin(items, assignees)

    expect(result.get('a1')).toHaveLength(3)
    expect(result.get('a2')).toHaveLength(2)
    expect(result.get('a3')).toHaveLength(2)
  })

  it('gives all items to a single assignee', () => {
    const items = ['i1', 'i2', 'i3']
    const assignees = ['solo']

    const result = distributeRoundRobin(items, assignees)

    expect(result.get('solo')).toEqualValue(['i1', 'i2', 'i3'])
  })

  it('returns empty arrays when items is empty', () => {
    const assignees = ['a1', 'a2']

    const result = distributeRoundRobin([], assignees)

    for (const assignee of assignees) {
      expect(result.get(assignee)).toEqualValue([])
    }
  })

  it('maintains item order within each assignee list', () => {
    const items = ['i1', 'i2', 'i3', 'i4', 'i5', 'i6', 'i7', 'i8', 'i9']
    const assignees = ['a1', 'a2', 'a3']

    const result = distributeRoundRobin(items, assignees)

    // a1 gets items at indices 0, 3, 6 → i1, i4, i7
    expect(result.get('a1')).toEqualValue(['i1', 'i4', 'i7'])
    // a2 gets items at indices 1, 4, 7 → i2, i5, i8
    expect(result.get('a2')).toEqualValue(['i2', 'i5', 'i8'])
    // a3 gets items at indices 2, 5, 8 → i3, i6, i9
    expect(result.get('a3')).toEqualValue(['i3', 'i6', 'i9'])
  })
})
