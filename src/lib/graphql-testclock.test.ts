import { describe, expect, it, vi } from 'vitest'
import { Effect, Layer, Schema, TestClock, TestContext } from 'effect'

vi.mock('@/lib/storage', () => ({
  patStorage: { getValue: vi.fn().mockResolvedValue('') },
  usernameStorage: { getValue: vi.fn().mockResolvedValue('') },
  debugStorage: { getValue: vi.fn().mockResolvedValue(false), watch: vi.fn() },
}))

import { GithubGraphQL, GithubGraphQLLive } from '@/lib/graphql-service'

import { makeRecordedHttpLayer, makeTestStorageLayer } from '@/lib/effect-test-helpers'

const VIEWER_QUERY = 'query Viewer { viewer { login } }'

const ViewerSchema = Schema.Struct({
  viewer: Schema.Struct({ login: Schema.String }),
})

describe('GithubGraphQL service — TestClock-driven retry behavior', () => {
  it('retries on 429 and succeeds on the second attempt', async () => {
    let calls = 0
    const [httpLayer] = makeRecordedHttpLayer(() => {
      calls++
      if (calls === 1) {
        return new Response(JSON.stringify({}), {
          status: 429,
          headers: { 'retry-after': '1', 'x-ratelimit-remaining': '0' },
        })
      }
      return new Response(JSON.stringify({ data: { viewer: { login: 'test-user' } } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })

    const storageLayer = makeTestStorageLayer({ pat: 'fake-pat' })
    const services = GithubGraphQLLive.pipe(Layer.provide(Layer.mergeAll(httpLayer, storageLayer)))

    const program = Effect.gen(function* () {
      const gql = yield* GithubGraphQL
      // Fork the request so we can advance the test clock to satisfy the
      // exponential-jittered retry schedule before awaiting completion.
      const fiber = yield* Effect.fork(gql.request(ViewerSchema, VIEWER_QUERY, {}))
      // Advance enough for any reasonable jittered exponential backoff with
      // base 1s and 2 retries.
      yield* TestClock.adjust('30 seconds')
      const result = yield* fiber
      return result
    })

    const result = await Effect.runPromise(
      program.pipe(Effect.provide(services), Effect.provide(TestContext.TestContext)),
    )

    expect(result).toEqualValue({ viewer: { login: 'test-user' } })
    expect(calls).toBe(2)
  })

  it('exhausts retries on persistent 429 and surfaces GithubRateLimitError', async () => {
    let calls = 0
    const [httpLayer] = makeRecordedHttpLayer(() => {
      calls++
      return new Response(JSON.stringify({}), {
        status: 429,
        headers: { 'retry-after': '1', 'x-ratelimit-remaining': '0' },
      })
    })

    const storageLayer = makeTestStorageLayer({ pat: 'fake-pat' })
    const services = GithubGraphQLLive.pipe(Layer.provide(Layer.mergeAll(httpLayer, storageLayer)))

    const program = Effect.gen(function* () {
      const gql = yield* GithubGraphQL
      const fiber = yield* Effect.fork(
        gql.request(ViewerSchema, VIEWER_QUERY, {}).pipe(Effect.either),
      )
      yield* TestClock.adjust('60 seconds')
      const exit = yield* fiber
      return exit
    })

    const result = await Effect.runPromise(
      program.pipe(Effect.provide(services), Effect.provide(TestContext.TestContext)),
    )

    // Either.left -> GithubRateLimitError after 3 attempts (1 initial + 2 retries)
    expect(result._tag).toBe('Left')
    if (result._tag === 'Left') {
      expect((result.left as { _tag: string })._tag).toBe('GithubRateLimitError')
    }
    expect(calls).toBe(3)
  })
})
