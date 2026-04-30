import { Layer } from 'effect'

import { CacheServicesLive } from '@/background/cache-service'
import { ProjectServiceLive } from '@/background/project-service'

/**
 * Aggregated background-only services Layer. Merged into the runtime by
 * `src/entries/background/index.ts` after the base AppLayer is constructed
 * so that content / popup / options bundles do not get these.
 */
export const BackgroundServicesLive = Layer.mergeAll(ProjectServiceLive, CacheServicesLive)

export { ProjectService } from '@/background/project-service'
export { PreviewCache, HierarchyCache } from '@/background/cache-service'
