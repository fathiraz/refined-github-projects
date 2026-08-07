import { Context, Effect, Layer } from 'effect'

import { patStorage } from '@/lib/storage'

/**
 * Read-side wrapper for the PAT stored via `wxt`'s `storage.defineItem`.
 * Effect code reads it through this service so tests can substitute the layer
 * with `Layer.succeed(Storage, { ... })`. Writes stay on the imperative
 * `storage` API — handlers call those directly.
 */
interface StorageService {
  readonly getPat: Effect.Effect<string>
}

export class Storage extends Context.Tag('rgp/Storage')<Storage, StorageService>() {}

export const StorageLive: Layer.Layer<Storage> = Layer.succeed(
  Storage,
  Storage.of({ getPat: Effect.promise(() => patStorage.getValue()) }),
)
