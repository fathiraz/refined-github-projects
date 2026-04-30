import { Effect, Fiber, Stream, type SubscriptionRef } from 'effect'
import { useSyncExternalStore } from 'react'

import { runFork } from '@/lib/effect-runtime'

/**
 * React hook that subscribes to an Effect `SubscriptionRef` and returns the
 * current value, kept up-to-date across changes. Uses `useSyncExternalStore`
 * for tearing-free concurrent rendering compatibility.
 *
 * @param ref       The SubscriptionRef to observe.
 * @param snapshot  Synchronous accessor returning the current value. Required
 *                  because `useSyncExternalStore` needs a sync getter; the
 *                  caller is expected to maintain a mirror in sync with the
 *                  ref (this is what every store in `src/lib/*-store.ts` does).
 */
export function useSubscriptionRef<A>(
  ref: SubscriptionRef.SubscriptionRef<A>,
  snapshot: () => A,
): A {
  return useSyncExternalStore(
    (onStoreChange) => {
      // skip the very first emission (it equals the current snapshot) so
      // we only react to actual changes — this avoids a redundant render
      // on mount.
      let first = true
      const fiber = runFork(
        Stream.runForEach(ref.changes, () =>
          Effect.sync(() => {
            if (first) {
              first = false
              return
            }
            onStoreChange()
          }),
        ),
      )
      return () => {
        runFork(Fiber.interrupt(fiber))
      }
    },
    snapshot,
    snapshot,
  )
}

/**
 * Convenience hook for stores that don't expose their `SubscriptionRef`
 * directly but provide a Stream of changes plus a snapshot accessor (this is
 * the shape used by `selection-store.ts`, `toast-store.ts`, etc).
 */
export function useStoreChanges<A>(changes: Stream.Stream<A>, snapshot: () => A): A {
  return useSyncExternalStore(
    (onStoreChange) => {
      let first = true
      const fiber = runFork(
        Stream.runForEach(changes, () =>
          Effect.sync(() => {
            if (first) {
              first = false
              return
            }
            onStoreChange()
          }),
        ),
      )
      return () => {
        runFork(Fiber.interrupt(fiber))
      }
    },
    snapshot,
    snapshot,
  )
}
