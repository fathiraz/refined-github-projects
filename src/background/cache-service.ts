import { Context, Effect, Layer } from 'effect'

import type { HierarchyData, ItemPreviewData } from '@/lib/messages'

import { getOrCacheHierarchy, getOrCachePreview } from '@/background/cache'

interface KeyedCache<T> {
  /**
   * Memoized fetch keyed by `key`. Concurrent callers share the in-flight
   * promise; failed fetches invalidate the entry so subsequent callers
   * retry; successful fetches are TTL-evicted (1 minute).
   */
  readonly get: (key: string, fetcher: () => Promise<T>) => Effect.Effect<T>
}

export class PreviewCache extends Context.Tag('@rgp/PreviewCache')<
  PreviewCache,
  KeyedCache<ItemPreviewData>
>() {}

export class HierarchyCache extends Context.Tag('@rgp/HierarchyCache')<
  HierarchyCache,
  KeyedCache<HierarchyData>
>() {}

/**
 * Live layers wrap the existing `getOrCachePreview` / `getOrCacheHierarchy`
 * functions in `Effect.tryPromise`. Internally those functions already use
 * `Effect.cachedWithTTL` to memoize fetchers per key with a 1-minute TTL,
 * Effect-runtime `Effect.sleep` + `Fiber.interrupt` for eviction, and
 * synchronous-set semantics that prevent concurrent-request races. Wrapping
 * them as a service provides a clean Effect-first API for new callsites
 * without breaking the existing async helpers.
 */
export const PreviewCacheLive = Layer.succeed(PreviewCache, {
  get: (key, fetcher) =>
    Effect.tryPromise({
      try: () => getOrCachePreview(key, fetcher),
      catch: (err) => err as unknown,
    }).pipe(Effect.orDie),
})

export const HierarchyCacheLive = Layer.succeed(HierarchyCache, {
  get: (key, fetcher) =>
    Effect.tryPromise({
      try: () => getOrCacheHierarchy(key, fetcher),
      catch: (err) => err as unknown,
    }).pipe(Effect.orDie),
})

export const CacheServicesLive = Layer.mergeAll(PreviewCacheLive, HierarchyCacheLive)
