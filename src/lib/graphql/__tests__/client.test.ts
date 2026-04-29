import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../storage', () => ({
  patStorage: { getValue: vi.fn().mockResolvedValue('test-token') },
  usernameStorage: { getValue: vi.fn().mockResolvedValue('') },
  debugStorage: { getValue: vi.fn().mockResolvedValue(false), watch: vi.fn() },
}))

vi.mock('../../debug-logger', async () => {
  const { Logger } = await import('effect')
  return {
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), verbose: vi.fn() },
    initDebugLogger: vi.fn().mockResolvedValue(undefined),
    // Provide an inert layer so client.ts still has a Logger to provide.
    RgpLoggerLive: Logger.replace(
      Logger.defaultLogger,
      Logger.make(() => {}),
    ),
  }
})

import { GithubRateLimitError } from '../../errors'
import { gql } from '../client'

const mockFetch = vi.fn()

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  })
}

function errorResponse(status: number, init: { retryAfter?: string } = {}): Response {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (init.retryAfter !== undefined) headers['retry-after'] = init.retryAfter
  return new Response(JSON.stringify({}), { status, headers })
}

beforeEach(() => {
  mockFetch.mockReset()
  globalThis.fetch = mockFetch as unknown as typeof fetch
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('GithubRateLimitError (replaces legacy GqlError)', () => {
  it('has the correct tag, message, status, and retryAfter properties', () => {
    const error = new GithubRateLimitError({ message: 'Rate limited', status: 429, retryAfter: 60 })

    expect(error._tag).toBe('GithubRateLimitError')
    expect(error.message).toBe('Rate limited')
    expect(error.status).toBe(429)
    expect(error.retryAfter).toBe(60)
  })

  it('is an instanceof Error', () => {
    const error = new GithubRateLimitError({ message: 'Forbidden', status: 403, retryAfter: 30 })

    expect(error).toBeInstanceOf(Error)
  })
})

describe('gql', () => {
  it('returns data on a successful query', async () => {
    const expectedData = { viewer: { login: 'test' } }
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: expectedData }))

    const result = await gql<{ viewer: { login: string } }>(
      'query GetViewer { viewer { login } }',
      {},
    )

    expect(result).toEqualValue(expectedData)
  })

  it('throws GithubRateLimitError on 403 (after internal retries)', async () => {
    // GithubGraphQL retries rate-limit failures up to 2 extra times — return
    // 403 for every attempt so the call surfaces the failure.
    for (let i = 0; i < 3; i++) {
      mockFetch.mockResolvedValueOnce(errorResponse(403, { retryAfter: '30' }))
    }

    try {
      await gql('query GetViewer { viewer { login } }', {})
      throw new Error('should have thrown')
    } catch (error) {
      const e = error as { _tag: string; status?: number; retryAfter?: number }
      expect(e._tag).toBe('GithubRateLimitError')
      expect(e.status).toBe(403)
      expect(e.retryAfter).toBe(30)
    }
  }, 30000)

  it('throws GithubGraphQLError with message from first GraphQL error', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        errors: [{ message: 'Field "foo" not found' }, { message: 'Another error' }],
      }),
    )

    await expect(gql('query Bad { foo }', {})).rejects.toThrow('Field "foo" not found')

    mockFetch.mockResolvedValueOnce(
      jsonResponse({ errors: [{ message: 'Field "foo" not found' }] }),
    )
    try {
      await gql('query Bad { foo }', {})
      throw new Error('should have thrown')
    } catch (error) {
      const e = error as { _tag: string; message: string }
      expect(e._tag).toBe('GithubGraphQLError')
      expect(e.message).toBe('Field "foo" not found')
    }
  })

  it('sends the correct Authorization header with the PAT', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))

    await gql('query Test { test }', {})

    // @effect/platform's FetchHttpClient invokes fetch as `fetch(url, init)`.
    const [urlArg, initArg] = mockFetch.mock.calls[0] as [URL | string, RequestInit]
    expect(String(urlArg)).toBe('https://api.github.com/graphql')
    const headers = new Headers(initArg.headers)
    expect(headers.get('authorization')).toBe('Bearer test-token')
  })

  it('sends correct Content-Type and GitHub-Feature-Request headers', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))

    await gql('query Test { test }', {})

    const [, initArg] = mockFetch.mock.calls[0] as [URL | string, RequestInit]
    const headers = new Headers(initArg.headers)
    expect(headers.get('content-type')).toMatch(/application\/json/)
    expect(headers.get('github-feature-request')).toBe('ProjectV2')
  })

  it('silent option suppresses console.error for GraphQL errors', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    mockFetch.mockResolvedValueOnce(jsonResponse({ errors: [{ message: 'Silent error' }] }))

    await expect(gql('query Bad { foo }', {}, { silent: true })).rejects.toThrow('Silent error')

    expect(consoleErrorSpy).not.toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
  })

  it('propagates network error when fetch rejects', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network down'))

    try {
      await gql('query Test { test }', {})
      throw new Error('should have thrown')
    } catch (error) {
      const e = error as { _tag: string }
      expect(e._tag).toBe('GithubNetworkError')
    }
  })

  it('500 responses become GithubServerError', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(500))

    try {
      await gql('query Test { test }', {})
      throw new Error('should have thrown')
    } catch (error) {
      const e = error as { _tag: string; status?: number }
      expect(e._tag).toBe('GithubServerError')
      expect(e.status).toBe(500)
    }
  })

  it('two identical GithubRateLimitError instances are Equal.equals', async () => {
    const { Equal } = await import('effect')
    const a = new GithubRateLimitError({ status: 429, message: 'Rate', retryAfter: 30 })
    const b = new GithubRateLimitError({ status: 429, message: 'Rate', retryAfter: 30 })
    expect(Equal.equals(a, b)).toBe(true)
  })
})
