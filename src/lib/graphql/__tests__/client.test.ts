import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../storage', () => ({
  patStorage: { getValue: vi.fn().mockResolvedValue('test-token') },
}))

vi.mock('../../debug-logger', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), verbose: vi.fn() },
}))

import { GqlError, gql } from '../client'

const mockFetch = vi.fn()
globalThis.fetch = mockFetch

beforeEach(() => {
  mockFetch.mockReset()
  vi.restoreAllMocks()
  globalThis.fetch = mockFetch
})

describe('GqlError', () => {
  it('has the correct name, message, status, and retryAfter properties', () => {
    const error = new GqlError({ message: 'Rate limited', status: 429, retryAfter: 60 })

    expect(error.name).toBe('GithubHttpError')
    expect(error.message).toBe('Rate limited')
    expect(error.status).toBe(429)
    expect(error.retryAfter).toBe(60)
  })

  it('is an instanceof Error', () => {
    const error = new GqlError({ message: 'Forbidden', status: 403, retryAfter: 30 })

    expect(error).toBeInstanceOf(Error)
  })
})

describe('gql', () => {
  it('returns data on a successful query', async () => {
    const expectedData = { viewer: { login: 'test' } }
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: expectedData }),
      headers: { get: () => null },
    })

    const result = await gql<{ viewer: { login: string } }>(
      'query GetViewer { viewer { login } }',
      {},
    )

    expect(result).toEqualValue(expectedData)
  })

  it('throws GqlError with status and retryAfter on HTTP error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      headers: { get: (h: string) => (h === 'Retry-After' ? '30' : null) },
    })

    await expect(gql('query GetViewer { viewer { login } }', {})).rejects.toThrow(GqlError)

    try {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        headers: { get: (h: string) => (h === 'Retry-After' ? '30' : null) },
      })
      await gql('query GetViewer { viewer { login } }', {})
    } catch (error) {
      expect(error).toBeInstanceOf(GqlError)
      const gqlError = error as GqlError
      expect(gqlError.status).toBe(403)
      expect(gqlError.retryAfter).toBe(30)
      expect(gqlError.message).toBe('Forbidden')
    }
  })

  it('throws GqlError with message from first GraphQL error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          errors: [{ message: 'Field "foo" not found' }, { message: 'Another error' }],
        }),
      headers: { get: () => null },
    })

    await expect(gql('query Bad { foo }', {})).rejects.toThrow('Field "foo" not found')

    try {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            errors: [{ message: 'Field "foo" not found' }],
          }),
        headers: { get: () => null },
      })
      await gql('query Bad { foo }', {})
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toBe('Field "foo" not found')
    }
  })

  it('sends the correct Authorization header with the PAT', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: {} }),
      headers: { get: () => null },
    })

    await gql('query Test { test }', {})

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.github.com/graphql',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      }),
    )
  })

  it('sends correct Content-Type and GitHub-Feature-Request headers', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: {} }),
      headers: { get: () => null },
    })

    await gql('query Test { test }', {})

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.github.com/graphql',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'GitHub-Feature-Request': 'ProjectV2',
        }),
      }),
    )
  })

  it('silent option suppresses console.error for GraphQL errors', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          errors: [{ message: 'Silent error' }],
        }),
      headers: { get: () => null },
    })

    await expect(gql('query Bad { foo }', {}, { silent: true })).rejects.toThrow('Silent error')

    expect(consoleErrorSpy).not.toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
  })

  it('propagates network error when fetch rejects', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network down'))

    await expect(gql('query Test { test }', {})).rejects.toBeDefined()
  })

  it('defaults retryAfter to 0 when header is missing', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Server Error',
      headers: { get: () => null },
    })

    try {
      await gql('query Test { test }', {})
      throw new Error('should have thrown')
    } catch (error) {
      const gqlError = error as GqlError
      expect(gqlError).toBeInstanceOf(GqlError)
      expect(gqlError.status).toBe(500)
      expect(gqlError.retryAfter).toBe(0)
    }
  })

  it('two identical GqlError instances are Equal.equals', async () => {
    const { Equal } = await import('effect')
    const a = new GqlError({ status: 429, message: 'Rate', retryAfter: 30 })
    const b = new GqlError({ status: 429, message: 'Rate', retryAfter: 30 })
    expect(Equal.equals(a, b)).toBe(true)
  })
})
