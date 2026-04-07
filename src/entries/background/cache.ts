import type { HierarchyData, ItemPreviewData, SprintProgressData } from '@/lib/messages'
import type { FieldsResultProject, ResolvedItem } from './types'

export const RESOLVED_ITEM_CACHE_TTL_MS = 15_000
export const resolvedItemCache = new Map<
  string,
  { resolvedItems: ResolvedItem[]; expiresAt: number }
>()

export const HIERARCHY_CACHE_TTL_MS = 30_000
export const hierarchyCache = new Map<string, { data: HierarchyData; expiresAt: number }>()

export const PREVIEW_CACHE_TTL_MS = 30_000
export const previewCache = new Map<string, { data: ItemPreviewData; expiresAt: number }>()

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
