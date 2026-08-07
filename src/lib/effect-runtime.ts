import { Cause, Effect, Layer, ManagedRuntime } from 'effect'

import { RgpLoggerLive } from '@/lib/debug-logger'
import { HttpClientLive } from '@/lib/http-service'
import { StorageLive } from '@/lib/storage-service'
import { GithubGraphQLLive } from '@/lib/graphql-service'

// aggregate Layer for the application runtime. Additional service Layers
// (Concurrency, stores, background services, ...) are merged in here as
// later migration phases land them.
const GithubLayer = GithubGraphQLLive.pipe(
  Layer.provide(Layer.mergeAll(HttpClientLive, StorageLive)),
)

const AppLayer = Layer.mergeAll(RgpLoggerLive, HttpClientLive, StorageLive, GithubLayer)

// single ManagedRuntime per execution context (background SW, content script,
// popup, options page). Each module that imports this shares the same instance
// within its context — module evaluation is per-context in WXT.
const AppRuntime = ManagedRuntime.make(AppLayer)

export const runPromise: typeof AppRuntime.runPromise = (effect, options) =>
  AppRuntime.runPromise(effect, options)

export const runFork: typeof AppRuntime.runFork = (effect, options) =>
  AppRuntime.runFork(effect, options)

export const runSync: typeof AppRuntime.runSync = (effect) => AppRuntime.runSync(effect)

/**
 * Adapter for `onMessage` handlers — converts an Effect program into a
 * `Promise<A>`. Pretty-prints any defect/failure cause through the logger so
 * they surface in DevTools instead of being silently swallowed by the
 * messaging library, while still rejecting the promise so the sender sees
 * the failure.
 */
export const runHandler = <A, E>(label: string, effect: Effect.Effect<A, E, never>): Promise<A> =>
  AppRuntime.runPromise(
    effect.pipe(
      Effect.tapErrorCause((cause) =>
        Effect.logError(`[runHandler:${label}] failed`, Cause.pretty(cause)),
      ),
    ),
  )
