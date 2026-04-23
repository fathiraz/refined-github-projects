import type { HierarchyData, ItemPreviewData, SprintProgressData } from '@/lib/messages'
import type { FieldsResultProject, ResolvedItem } from './types'
import { Duration, Effect } from 'effect'

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
const PREVIEW_TTL_MS = Duration.toMillis(PREVIEW_TTL)
const HIERARCHY_TTL_MS = Duration.toMillis(HIERARCHY_TTL)
const MAX_SETUP_ENTRIES = 500

// Stores Promise<CachedEffect> per item key.
// Set synchronously before first await to prevent concurrent-request races.
// Entries are evicted after their TTL expires and capped at MAX_SETUP_ENTRIES
// (FIFO) to prevent unbounded memory growth for distinct keys.
const _previewSetup = new Map<string, Promise<Effect.Effect<ItemPreviewData>>>()
const _hierarchySetup = new Map<string, Promise<Effect.Effect<HierarchyData>>>()

function scheduleSetupEviction<V>(map: Map<string, V>, key: string, ttlMs: number): void {
  const t = setTimeout(() => {
    map.delete(key)
  }, ttlMs)
  ;(t as unknown as { unref?: () => void }).unref?.()
}

function capSetupMap<V>(map: Map<string, V>, max: number): void {
  while (map.size >= max) {
    const oldest = map.keys().next().value
    if (oldest === undefined) break
    map.delete(oldest)
  }
}

export async function getOrCachePreview(
  key: string,
  fetchFn: () => Promise<ItemPreviewData>,
): Promise<ItemPreviewData> {
  if (!_previewSetup.has(key)) {
    capSetupMap(_previewSetup, MAX_SETUP_ENTRIES)
    _previewSetup.set(
      key,
      Effect.runPromise(Effect.cachedWithTTL(Effect.promise(fetchFn), PREVIEW_TTL)),
    )
    scheduleSetupEviction(_previewSetup, key, PREVIEW_TTL_MS)
  }
  return Effect.runPromise(await _previewSetup.get(key)!)
}

export async function getOrCacheHierarchy(
  key: string,
  fetchFn: () => Promise<HierarchyData>,
): Promise<HierarchyData> {
  if (!_hierarchySetup.has(key)) {
    capSetupMap(_hierarchySetup, MAX_SETUP_ENTRIES)
    _hierarchySetup.set(
      key,
      Effect.runPromise(Effect.cachedWithTTL(Effect.promise(fetchFn), HIERARCHY_TTL)),
    )
    scheduleSetupEviction(_hierarchySetup, key, HIERARCHY_TTL_MS)
  }
  return Effect.runPromise(await _hierarchySetup.get(key)!)
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
