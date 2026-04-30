import { FetchHttpClient } from '@effect/platform'
import type { Layer } from 'effect'
import type { HttpClient } from '@effect/platform/HttpClient'

/**
 * Default HttpClient Layer for the extension. Backed by the fetch API; works
 * in Service Workers, content scripts, popup and options pages without any
 * additional permission. Tests can substitute a stub layer that provides a
 * `Fetch` mock via `Layer.succeed(FetchHttpClient.Fetch, mockFetch)`.
 */
export const HttpClientLive: Layer.Layer<HttpClient> = FetchHttpClient.layer
