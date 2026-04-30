import { Effect } from 'effect'

import { HierarchyCache, PreviewCache } from '@/background/cache-service'
import { ProjectService } from '@/background/project-service'
import { BackgroundServicesLive } from '@/background/services'

/**
 * Service requirements that `BackgroundServicesLive` discharges. Listed
 * explicitly so `provideBackground` can narrow the resulting Effect's R to
 * `never` (or to whatever R remains after excluding the background services),
 * which is what `runHandler` requires.
 */
type BackgroundServices = ProjectService | PreviewCache | HierarchyCache

/**
 * Helper to compose a background-only Effect with the right service Layer
 * before passing to `runHandler`. After this call, the Effect no longer
 * references any of the background services.
 */
export const provideBackground = <A, E, R extends BackgroundServices>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, Exclude<R, BackgroundServices>> =>
  effect.pipe(Effect.provide(BackgroundServicesLive))
