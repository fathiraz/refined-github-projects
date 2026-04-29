/**
 * Test Layers for Effect-first services. Used by tests that exercise the
 * GraphQL client, Storage, etc. without hitting the real network or browser
 * APIs. Each Layer overrides a service Tag with a deterministic in-memory
 * implementation.
 */
import { Effect, Layer } from 'effect'
import { HttpClient, FetchHttpClient } from '@effect/platform'

import { Storage } from '@/lib/effect/services/storage'

/**
 * In-memory Storage layer. Pass initial values to seed; otherwise reads return
 * empty strings / `false`.
 */
export const makeTestStorageLayer = (initial?: {
  pat?: string
  username?: string
  debug?: boolean
}) =>
  Layer.succeed(
    Storage,
    Storage.of({
      getPat: Effect.succeed(initial?.pat ?? ''),
      getUsername: Effect.succeed(initial?.username ?? ''),
      getDebug: Effect.succeed(initial?.debug ?? false),
    }),
  )

/**
 * Records every call made through `HttpClient`. Returns a `[Layer, calls[]]`
 * pair so tests can assert against the exact request shape that the
 * underlying GraphQL service produced. Pass a `respond(req)` to vary the
 * response per call.
 */
export interface RecordedHttpCall {
  url: URL | string
  method: string
  body: unknown
  headers: Record<string, string>
}

export const makeRecordedHttpLayer = (respond: (call: RecordedHttpCall) => Response) => {
  const calls: RecordedHttpCall[] = []
  const fetchImpl: typeof globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input : input.url
    const method = (init?.method ?? 'GET').toUpperCase()
    const bodyRaw = init?.body
    let body: unknown = undefined
    if (typeof bodyRaw === 'string') {
      try {
        body = JSON.parse(bodyRaw)
      } catch {
        body = bodyRaw
      }
    }
    const headers: Record<string, string> = {}
    if (init?.headers) {
      const entries = init.headers instanceof Headers ? Array.from(init.headers.entries()) : []
      for (const [k, v] of entries) headers[k] = v
    }
    const call: RecordedHttpCall = { url, method, body, headers }
    calls.push(call)
    return respond(call)
  }
  const layer = FetchHttpClient.layer.pipe(
    Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetchImpl as typeof globalThis.fetch)),
  )
  return [layer, calls] as const
}

export type { Storage }
export { HttpClient }
