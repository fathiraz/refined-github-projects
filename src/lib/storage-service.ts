import { Context, Effect, Layer } from 'effect'

import { patStorage, usernameStorage, debugStorage } from '@/lib/storage'

/**
 * Read-side wrapper for `wxt`'s `storage.defineItem` items. Other Effect
 * code consumes Pat / username / debug-flag through this service so that
 * tests can substitute the layer with `Layer.succeed(Storage, { ... })`.
 *
 * Writes intentionally stay on the imperative `storage` API for now —
 * existing handlers (`saveSprintSettings`, etc.) call them directly. We can
 * widen this service in a later phase if needed.
 */
export interface StorageService {
  readonly getPat: Effect.Effect<string>
  readonly getUsername: Effect.Effect<string>
  readonly getDebug: Effect.Effect<boolean>
}

export class Storage extends Context.Tag('rgp/Storage')<Storage, StorageService>() {}

export const StorageLive: Layer.Layer<Storage> = Layer.succeed(
  Storage,
  Storage.of({
    getPat: Effect.promise(() => patStorage.getValue()),
    getUsername: Effect.promise(() => usernameStorage.getValue()),
    getDebug: Effect.promise(() => debugStorage.getValue()),
  }),
)
