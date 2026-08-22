import type { HierarchyData, ItemPreviewData, SprintProgressData } from '@/lib/messages'
import type { FieldsResultProject, ResolvedItem } from '@/background/types'

const RESOLVED_ITEM_CACHE_TTL_MS = 15_000
const resolvedItemCache = new Map<string, { resolvedItems: ResolvedItem[]; expiresAt: number }>()

// ===== Hover tooltip caches (preview + hierarchy) =====
//
// The in-flight promise is stored synchronously, before the first await, so
// concurrent hovers on the same row share one request. Expiry is checked on
// read rather than scheduled, which is why there are no timers to cancel: a
// stale entry is simply replaced by the next reader. Entries are capped
// oldest-first so a long session over many distinct rows stays bounded.

const HOVER_TTL_MS = 60_000
const MAX_HOVER_ENTRIES = 500

interface HoverEntry<T> {
  value: Promise<T>
  expiresAt: number
}

function getOrCacheHover<T>(
  cache: Map<string, HoverEntry<T>>,
  key: string,
  fetchFn: () => Promise<T>,
): Promise<T> {
  const existing = cache.get(key)
  if (existing && existing.expiresAt > Date.now()) return existing.value

  while (cache.size >= MAX_HOVER_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }

  // stored synchronously so a caller arriving mid-flight joins this request
  const value = fetchFn().catch((err: unknown) => {
    // never cache a transient failure — drop it so the next caller retries,
    // unless a newer entry has already replaced this one
    if (cache.get(key)?.value === value) cache.delete(key)
    throw err
  })
  cache.set(key, { value, expiresAt: Date.now() + HOVER_TTL_MS })
  return value
}

const previewCache = new Map<string, HoverEntry<ItemPreviewData>>()
const hierarchyCache = new Map<string, HoverEntry<HierarchyData>>()

export function getOrCachePreview(
  key: string,
  fetchFn: () => Promise<ItemPreviewData>,
): Promise<ItemPreviewData> {
  return getOrCacheHover(previewCache, key, fetchFn)
}

export function getOrCacheHierarchy(
  key: string,
  fetchFn: () => Promise<HierarchyData>,
): Promise<HierarchyData> {
  return getOrCacheHover(hierarchyCache, key, fetchFn)
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

function createResolvedItemCacheKey(projectId: string, itemIds: string[]): string {
  return `${projectId}::${[...new Set(itemIds)].sort().join('|')}`
}

function pruneResolvedItemCache(now = Date.now()): void {
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
