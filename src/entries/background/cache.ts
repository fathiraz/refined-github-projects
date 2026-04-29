import type { HierarchyData, ItemPreviewData, SprintProgressData } from '@/lib/messages'
import type { FieldsResultProject, ResolvedItem } from './types'
import { Duration, Effect, Fiber } from 'effect'

export const RESOLVED_ITEM_CACHE_TTL_MS = 15_000
export const resolvedItemCache = new Map<
  string,
  { resolvedItems: ResolvedItem[]; expiresAt: number }
>()

// ===== Effect-based hover tooltip caches (preview + hierarchy) =====
// cachedWithTTL wraps each fetch Effect and handles TTL automatically.
// No manual expiry checking or pruning needed.

const PREVIEW_TTL = Duration.minutes(1)
const HIERARCHY_TTL = Duration.minutes(1)
const MAX_SETUP_ENTRIES = 500

// Stores Promise<CachedEffect> per item key.
// Set synchronously before first await to prevent concurrent-request races.
// Entries are evicted after their TTL expires and capped at MAX_SETUP_ENTRIES
// (FIFO) to prevent unbounded memory growth for distinct keys. Each entry has
// an associated eviction fiber tracked in the sibling fiber Map so that
// re-insertions (after a cap-eviction or failure-invalidation) interrupt the
// stale fiber and never accidentally delete a newer entry for the same key.
//
// Using `Effect.sleep` + `Fiber.interrupt` instead of `setTimeout`/`clearTimeout`
// keeps eviction on the Effect runtime (TestClock-friendly) and gives us
// structured cancellation semantics.
const _previewSetup = new Map<string, Promise<Effect.Effect<ItemPreviewData>>>()
const _hierarchySetup = new Map<string, Promise<Effect.Effect<HierarchyData>>>()
const _previewTimers = new Map<string, Fiber.RuntimeFiber<void>>()
const _hierarchyTimers = new Map<string, Fiber.RuntimeFiber<void>>()

function clearSetupTimer(timers: Map<string, Fiber.RuntimeFiber<void>>, key: string): void {
  const fiber = timers.get(key)
  if (fiber !== undefined) {
    Effect.runFork(Fiber.interrupt(fiber))
    timers.delete(key)
  }
}

function scheduleSetupEviction<V>(
  map: Map<string, V>,
  timers: Map<string, Fiber.RuntimeFiber<void>>,
  key: string,
  ttl: Duration.Duration,
): void {
  clearSetupTimer(timers, key)
  const fiber = Effect.runFork(
    Effect.sleep(ttl).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          // Only evict if this fiber is still the active timer for the key —
          // a re-insertion since scheduling will have replaced the entry.
          if (timers.get(key) === fiber) {
            timers.delete(key)
            map.delete(key)
          }
        }),
      ),
    ),
  )
  timers.set(key, fiber)
}

function capSetupMap<V>(
  map: Map<string, V>,
  timers: Map<string, Fiber.RuntimeFiber<void>>,
  max: number,
): void {
  while (map.size >= max) {
    const oldest = map.keys().next().value
    if (oldest === undefined) break
    map.delete(oldest)
    clearSetupTimer(timers, oldest)
  }
}

function invalidateSetupEntry<V>(
  map: Map<string, V>,
  timers: Map<string, Fiber.RuntimeFiber<void>>,
  key: string,
): void {
  map.delete(key)
  clearSetupTimer(timers, key)
}

export async function getOrCachePreview(
  key: string,
  fetchFn: () => Promise<ItemPreviewData>,
): Promise<ItemPreviewData> {
  if (!_previewSetup.has(key)) {
    capSetupMap(_previewSetup, _previewTimers, MAX_SETUP_ENTRIES)
    _previewSetup.set(
      key,
      Effect.runPromise(Effect.cachedWithTTL(Effect.promise(fetchFn), PREVIEW_TTL)),
    )
    scheduleSetupEviction(_previewSetup, _previewTimers, key, PREVIEW_TTL)
  }
  try {
    return await Effect.runPromise(await _previewSetup.get(key)!)
  } catch (err) {
    // Never cache transient fetch failures — invalidate so subsequent callers retry.
    invalidateSetupEntry(_previewSetup, _previewTimers, key)
    throw err
  }
}

export async function getOrCacheHierarchy(
  key: string,
  fetchFn: () => Promise<HierarchyData>,
): Promise<HierarchyData> {
  if (!_hierarchySetup.has(key)) {
    capSetupMap(_hierarchySetup, _hierarchyTimers, MAX_SETUP_ENTRIES)
    _hierarchySetup.set(
      key,
      Effect.runPromise(Effect.cachedWithTTL(Effect.promise(fetchFn), HIERARCHY_TTL)),
    )
    scheduleSetupEviction(_hierarchySetup, _hierarchyTimers, key, HIERARCHY_TTL)
  }
  try {
    return await Effect.runPromise(await _hierarchySetup.get(key)!)
  } catch (err) {
    invalidateSetupEntry(_hierarchySetup, _hierarchyTimers, key)
    throw err
  }
}

export const FIELDS_CACHE_TTL_MS = 60_000
export const fieldsCache = new Map<string, { data: FieldsResultProject; expiresAt: number }>()

export const SPRINT_PROGRESS_CACHE_TTL_MS = 2 * 60_000
export const sprintProgressCache = new Map<
  string,
  { data: SprintProgressData; expiresAt: number }
>()

export function pruneExpiredCache<T>(cache: Map<string, { data: T; expiresAt: number }>): void {
  const now = Date.now()
  for (const [key, entry] of cache.entries()) {
    if (entry.expiresAt <= now) cache.delete(key)
  }
}

export function createResolvedItemCacheKey(projectId: string, itemIds: string[]): string {
  return `${projectId}::${[...new Set(itemIds)].sort().join('|')}`
}

export function pruneResolvedItemCache(now = Date.now()): void {
  for (const [key, entry] of resolvedItemCache.entries()) {
    if (entry.expiresAt <= now) {
      resolvedItemCache.delete(key)
    }
  }
}

export function cacheResolvedItems(
  projectId: string,
  itemIds: string[],
  resolvedItems: ResolvedItem[],
): void {
  pruneResolvedItemCache()
  resolvedItemCache.set(createResolvedItemCacheKey(projectId, itemIds), {
    resolvedItems,
    expiresAt: Date.now() + RESOLVED_ITEM_CACHE_TTL_MS,
  })
}

export function takeCachedResolvedItems(
  projectId: string,
  itemIds: string[],
): ResolvedItem[] | undefined {
  pruneResolvedItemCache()

  const key = createResolvedItemCacheKey(projectId, itemIds)
  const entry = resolvedItemCache.get(key)
  if (!entry) {
    return undefined
  }

  resolvedItemCache.delete(key)
  return entry.resolvedItems
}
