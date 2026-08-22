import { describe, it, expect } from 'vitest'

import {
  GithubGraphQLError,
  GithubNetworkError,
  GithubAuthError,
  GithubRateLimitError,
  GithubServerError,
  GithubClientError,
  GithubDecodeError,
  classifyHttpError,
} from '@/lib/errors'

describe('GithubRateLimitError (canonical 429 variant)', () => {
  it('exposes tagged fields', () => {
    const err = new GithubRateLimitError({ status: 429, message: 'Too Many', retryAfter: 30 })

    expect(err._tag).toBe('GithubRateLimitError')
    expect(err.status).toBe(429)
    expect(err.message).toBe('Too Many')
    expect(err.retryAfter).toBe(30)
    expect(err).toBeInstanceOf(Error)
  })

  it('structural equality holds for identical payloads', () => {
    const a = new GithubRateLimitError({ status: 429, message: 'Too Many', retryAfter: 30 })
    const b = new GithubRateLimitError({ status: 429, message: 'Too Many', retryAfter: 30 })

    expect(a).toEqual(b)
    expect(a).toEqual(b)
  })

  it('structural equality fails when message differs', () => {
    // `message` is part of the payload contract, so differing messages must
    // make the errors unequal.
    const a = new GithubRateLimitError({ status: 403, message: 'Forbidden', retryAfter: 0 })
    const b = new GithubRateLimitError({ status: 403, message: 'Blocked', retryAfter: 0 })

    expect(a).not.toEqual(b)
    expect(a.message).not.toBe(b.message)
  })

  it('structural equality fails when retryAfter differs', () => {
    const a = new GithubRateLimitError({ status: 429, message: 'x', retryAfter: 30 })
    const b = new GithubRateLimitError({ status: 429, message: 'x', retryAfter: 60 })

    expect(a).not.toEqual(b)
  })
})

describe('GithubGraphQLError', () => {
  it('carries tag and message', () => {
    const err = new GithubGraphQLError({ message: 'Field not found' })

    expect(err._tag).toBe('GithubGraphQLError')
    expect(err.message).toBe('Field not found')
    expect(err).toBeInstanceOf(Error)
  })

  it('structural equality holds for identical message', () => {
    const a = new GithubGraphQLError({ message: 'boom' })
    const b = new GithubGraphQLError({ message: 'boom' })

    expect(a).toEqual(b)
  })

  it('structural equality fails when message differs', () => {
    const a = new GithubGraphQLError({ message: 'one' })
    const b = new GithubGraphQLError({ message: 'two' })

    expect(a).not.toEqual(b)
  })
})

describe('GithubNetworkError', () => {
  it('wraps cause and keeps tag', () => {
    const cause = new Error('fetch failed')
    const err = new GithubNetworkError({ cause })

    expect(err._tag).toBe('GithubNetworkError')
    expect(err.cause).toBe(cause)
    expect(err).toBeInstanceOf(Error)
  })

  it('structural equality holds when causes are the same reference', () => {
    const cause = new Error('x')
    const a = new GithubNetworkError({ cause })
    const b = new GithubNetworkError({ cause })

    expect(a).toEqual(b)
  })
})

describe('cross-tag equality', () => {
  it('different tag classes are never structurally equal', () => {
    const http = new GithubServerError({ status: 500, message: 'x' })
    const gql = new GithubGraphQLError({ message: 'x' })

    expect(http).not.toEqual(gql)
  })
})

describe('GithubError variants', () => {
  it('GithubAuthError, GithubServerError, GithubClientError, GithubDecodeError carry tag', () => {
    expect(new GithubAuthError({ message: 'x' })._tag).toBe('GithubAuthError')
    expect(new GithubServerError({ status: 500, message: 'x' })._tag).toBe('GithubServerError')
    expect(new GithubClientError({ status: 422, message: 'x' })._tag).toBe('GithubClientError')
    expect(new GithubDecodeError({ message: 'parse failed' })._tag).toBe('GithubDecodeError')
  })

  it('GithubRateLimitError preserves status + retryAfter', () => {
    const err = new GithubRateLimitError({ status: 429, message: 'x', retryAfter: 30 })
    expect(err._tag).toBe('GithubRateLimitError')
    expect(err.status).toBe(429)
    expect(err.retryAfter).toBe(30)
  })
})

describe('classifyHttpError', () => {
  it('401 → GithubAuthError', () => {
    const err = classifyHttpError({ status: 401, message: 'Unauthorized', retryAfter: 0 })
    expect(err._tag).toBe('GithubAuthError')
  })

  it('429 → GithubRateLimitError with retryAfter preserved', () => {
    const err = classifyHttpError({ status: 429, message: 'rate', retryAfter: 60 })
    expect(err._tag).toBe('GithubRateLimitError')
    if (err._tag === 'GithubRateLimitError') expect(err.retryAfter).toBe(60)
  })

  it('403 with x-ratelimit-remaining=0 → GithubRateLimitError (secondary rate limit)', () => {
    const err = classifyHttpError({
      status: 403,
      message: 'forbidden',
      retryAfter: 0,
      rateLimitRemaining: 0,
    })
    expect(err._tag).toBe('GithubRateLimitError')
  })

  it('403 with x-ratelimit-remaining > 0 → GithubClientError (permission failure)', () => {
    const err = classifyHttpError({
      status: 403,
      message: 'permission denied',
      retryAfter: 0,
      rateLimitRemaining: 4998,
    })
    expect(err._tag).toBe('GithubClientError')
    if (err._tag === 'GithubClientError') {
      expect(err.status).toBe(403)
      expect(err.message).toBe('permission denied')
    }
  })

  it('403 with x-ratelimit-remaining missing → GithubClientError (defaults to permission)', () => {
    const err = classifyHttpError({ status: 403, message: 'forbidden', retryAfter: 0 })
    expect(err._tag).toBe('GithubClientError')
  })

  it('500 → GithubServerError', () => {
    const err = classifyHttpError({ status: 500, message: 'down', retryAfter: 0 })
    expect(err._tag).toBe('GithubServerError')
  })

  it('422 → GithubClientError', () => {
    const err = classifyHttpError({ status: 422, message: 'bad', retryAfter: 0 })
    expect(err._tag).toBe('GithubClientError')
  })
})
