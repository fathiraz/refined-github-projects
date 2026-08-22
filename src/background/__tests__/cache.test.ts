// Characterization tests for the hovercard preview/hierarchy caches and the
// resolved-item handoff cache.
//
// cache.ts currently implements the preview/hierarchy TTL with Effect fibers,
// justified in a code comment as "TestClock-friendly" — a justification no test
// ever cashed in. These pin the four properties that actually matter, so the
// mechanism underneath can be swapped for the plain Map + timestamp pattern the
// same file already uses twice:
//   1. a hit inside the TTL does not re-fetch
//   2. concurrent callers share one in-flight fetch (no thundering herd)
//   3. a rejected fetch is never cached
//   4. the map is capped, evicting oldest-first

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  cacheResolvedItems,
  getOrCacheHierarchy,
  getOrCachePreview,
  pruneExpiredCache,
  takeCachedResolvedItems,
} from '@/background/cache'

const PREVIEW_TTL_MS = 60_000
const MAX_SETUP_ENTRIES = 500

function previewFor(title: string) {
  return { title } as unknown as Awaited<ReturnType<typeof getOrCachePreview>>
}

function hierarchyFor(id: string) {
  return { id } as unknown as Awaited<ReturnType<typeof getOrCacheHierarchy>>
}

/** Unique key per test so module-level cache state can't leak between them. */
let keySeq = 0
const nextKey = () => `key-${Date.now()}-${keySeq++}`

describe('hovercard caches — characterization', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  describe.each([
    { name: 'preview', getOrCache: getOrCachePreview, value: previewFor },
    { name: 'hierarchy', getOrCache: getOrCacheHierarchy, value: hierarchyFor },
  ] as const)('$name cache', ({ getOrCache, value }) => {
    it('fetches once and serves the cached value on subsequent hits', async () => {
      const key = nextKey()
      const fetchFn = vi.fn(async () => value('first'))

      const a = await (getOrCache as (k: string, f: () => Promise<unknown>) => Promise<unknown>)(
        key,
        fetchFn,
      )
      const b = await (getOrCache as (k: string, f: () => Promise<unknown>) => Promise<unknown>)(
        key,
        fetchFn,
      )

      expect(fetchFn).toHaveBeenCalledTimes(1)
      expect(a).toEqual(b)
    })

    it('shares one in-flight fetch between concurrent callers', async () => {
      const key = nextKey()
      let resolveFetch: (v: unknown) => void = () => {}
      // fetchFn is not invoked at registration time — only once the cached
      // program is actually run — so wait for the call before resolving it.
      const fetchFn = vi.fn(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve
          }),
      )

      const call = getOrCache as (k: string, f: () => Promise<never>) => Promise<unknown>
      const pending = [call(key, fetchFn as never), call(key, fetchFn as never)]
      await vi.waitFor(() => expect(fetchFn).toHaveBeenCalled())
      resolveFetch(value('shared'))
      const [a, b] = await Promise.all(pending)

      expect(fetchFn).toHaveBeenCalledTimes(1)
      expect(a).toEqual(b)
    })

    it('never caches a rejected fetch — the next caller retries', async () => {
      const key = nextKey()
      const fetchFn = vi
        .fn<() => Promise<unknown>>()
        .mockRejectedValueOnce(new Error('network down'))
        .mockResolvedValueOnce(value('recovered'))

      const call = getOrCache as (k: string, f: () => Promise<never>) => Promise<unknown>
      await expect(call(key, fetchFn as never)).rejects.toThrow('network down')

      await expect(call(key, fetchFn as never)).resolves.toEqual(value('recovered'))
      expect(fetchFn).toHaveBeenCalledTimes(2)
    })

    it('re-fetches once the TTL has elapsed', async () => {
      vi.useFakeTimers()
      const key = nextKey()
      const fetchFn = vi.fn(async () => value('v'))
      const call = getOrCache as (k: string, f: () => Promise<never>) => Promise<unknown>

      await call(key, fetchFn as never)
      expect(fetchFn).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(PREVIEW_TTL_MS + 1_000)
      await call(key, fetchFn as never)

      expect(fetchFn).toHaveBeenCalledTimes(2)
    })
  })

  it('caps the preview cache and evicts oldest-first', async () => {
    const stamp = nextKey()
    const fetchFn = vi.fn(async () => previewFor('v'))
    const firstKey = `${stamp}-0`

    for (let i = 0; i < MAX_SETUP_ENTRIES + 1; i++) {
      await getOrCachePreview(`${stamp}-${i}`, fetchFn)
    }
    const callsAfterFill = fetchFn.mock.calls.length

    // the oldest key must have been evicted, so re-requesting it re-fetches
    await getOrCachePreview(firstKey, fetchFn)
    expect(fetchFn.mock.calls.length).toBe(callsAfterFill + 1)
  })
})

describe('resolved-item handoff cache — characterization', () => {
  const PROJECT = 'PVT_project'
  const items = [{ domId: 'issue:1' }] as never

  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('is a single-use handoff — reading consumes the entry', () => {
    cacheResolvedItems(PROJECT, ['issue:1'], items)

    expect(takeCachedResolvedItems(PROJECT, ['issue:1'])).toEqual(items)
    expect(takeCachedResolvedItems(PROJECT, ['issue:1'])).toBeUndefined()
  })

  it('keys on the item-id set regardless of order or duplicates', () => {
    cacheResolvedItems(PROJECT, ['b', 'a', 'a'], items)

    expect(takeCachedResolvedItems(PROJECT, ['a', 'b'])).toEqual(items)
  })

  it('does not leak across projects', () => {
    cacheResolvedItems(PROJECT, ['issue:1'], items)

    expect(takeCachedResolvedItems('PVT_other', ['issue:1'])).toBeUndefined()
  })

  it('expires after 15s', () => {
    cacheResolvedItems(PROJECT, ['issue:1'], items)
    vi.advanceTimersByTime(15_001)

    expect(takeCachedResolvedItems(PROJECT, ['issue:1'])).toBeUndefined()
  })
})

describe('pruneExpiredCache', () => {
  it('drops only entries whose expiry has passed', () => {
    const now = Date.now()
    const cache = new Map([
      ['stale', { data: 1, expiresAt: now - 1 }],
      ['due', { data: 2, expiresAt: now }],
      ['fresh', { data: 3, expiresAt: now + 60_000 }],
    ])

    pruneExpiredCache(cache)

    expect([...cache.keys()]).toEqual(['fresh'])
  })
})
