import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/debug-logger', () => ({
  logger: { log: () => {}, warn: () => {}, error: () => {}, info: () => {} },
  initDebugLogger: async () => {},
}))

import {
  distributeBalanced,
  distributeRandom,
  distributeRoundRobin,
} from '@/features/bulk-random-assign-utils'

describe('Random Assign distribution helpers (consumed by the flyout)', () => {
  it('balanced — equal load when items % assignees === 0', () => {
    const items = ['i1', 'i2', 'i3', 'i4', 'i5', 'i6']
    const assignees = ['a', 'b', 'c']
    const result = distributeBalanced(items, assignees)
    for (const a of assignees) {
      expect(result.get(a)!.length).toBe(2)
    }
  })

  it('balanced — off-by-at-most-1 when items % assignees !== 0', () => {
    const items = ['i1', 'i2', 'i3', 'i4', 'i5']
    const assignees = ['a', 'b', 'c']
    const result = distributeBalanced(items, assignees)
    const sizes = assignees.map((a) => result.get(a)!.length).sort()
    expect(sizes[2] - sizes[0]).toBeLessThanOrEqual(1)
    expect(sizes.reduce((s, x) => s + x, 0)).toBe(items.length)
  })

  it('round-robin — deterministic order', () => {
    const items = ['i1', 'i2', 'i3', 'i4']
    const assignees = ['a', 'b']
    const result = distributeRoundRobin(items, assignees)
    expect(result.get('a')).toEqual(['i1', 'i3'])
    expect(result.get('b')).toEqual(['i2', 'i4'])
  })

  it('random — every item gets assigned exactly once', () => {
    const items = ['i1', 'i2', 'i3', 'i4', 'i5']
    const assignees = ['a', 'b', 'c']
    const result = distributeRandom(items, assignees)
    const flat = assignees.flatMap((a) => result.get(a)!)
    expect(flat.sort()).toEqual([...items].sort())
  })

  it('empty assignees yields empty distribution', () => {
    const result = distributeBalanced(['i1'], [])
    expect(result.size).toBe(0)
  })

  it('empty items yields zero buckets', () => {
    const result = distributeBalanced([], ['a', 'b'])
    expect(result.get('a')).toEqual([])
    expect(result.get('b')).toEqual([])
  })
})
