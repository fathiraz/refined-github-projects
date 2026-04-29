import { Layer } from 'effect'

import { CacheServicesLive } from './cache-service'
import { ProjectServiceLive } from './project-service'

/**
 * Aggregated background-only services Layer. Merged into the runtime by
 * `src/entries/background/index.ts` after the base AppLayer is constructed
 * so that content / popup / options bundles do not get these.
 */
export const BackgroundServicesLive = Layer.mergeAll(ProjectServiceLive, CacheServicesLive)

export { ProjectService } from './project-service'
export { PreviewCache, HierarchyCache } from './cache-service'
