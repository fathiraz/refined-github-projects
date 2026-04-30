import { describe, it, expect } from 'vitest'
import { Equal } from 'effect'

import {
  GithubGraphQLError,
  GithubNetworkError,
  GithubAuthError,
  GithubRateLimitError,
  GithubServerError,
  GithubClientError,
  GithubDecodeError,
  classifyHttpError,
  renderPatError,
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

  it('Equal.equals returns true for identical payloads', () => {
    const a = new GithubRateLimitError({ status: 429, message: 'Too Many', retryAfter: 30 })
    const b = new GithubRateLimitError({ status: 429, message: 'Too Many', retryAfter: 30 })

    expect(Equal.equals(a, b)).toBe(true)
    expect(a).toEqualValue(b)
  })

  it('Equal.equals returns false when message differs', () => {
    // `message` is part of the TaggedError payload contract, so differing
    // messages must make the errors unequal. The class constructor redefines
    // `message` as an enumerable own property specifically so that it
    // participates in structural equality.
    const a = new GithubRateLimitError({ status: 403, message: 'Forbidden', retryAfter: 0 })
    const b = new GithubRateLimitError({ status: 403, message: 'Blocked', retryAfter: 0 })

    expect(Equal.equals(a, b)).toBe(false)
    expect(a.message).not.toBe(b.message)
  })

  it('Equal.equals returns false when retryAfter differs', () => {
    const a = new GithubRateLimitError({ status: 429, message: 'x', retryAfter: 30 })
    const b = new GithubRateLimitError({ status: 429, message: 'x', retryAfter: 60 })

    expect(Equal.equals(a, b)).toBe(false)
  })
})

describe('GithubGraphQLError', () => {
  it('carries tag and message', () => {
    const err = new GithubGraphQLError({ message: 'Field not found' })

    expect(err._tag).toBe('GithubGraphQLError')
    expect(err.message).toBe('Field not found')
    expect(err).toBeInstanceOf(Error)
  })

  it('Equal.equals returns true for identical message', () => {
    const a = new GithubGraphQLError({ message: 'boom' })
    const b = new GithubGraphQLError({ message: 'boom' })

    expect(Equal.equals(a, b)).toBe(true)
  })

  it('Equal.equals returns false when message differs', () => {
    const a = new GithubGraphQLError({ message: 'one' })
    const b = new GithubGraphQLError({ message: 'two' })

    expect(Equal.equals(a, b)).toBe(false)
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

  it('Equal.equals returns true when causes are the same reference', () => {
    const cause = new Error('x')
    const a = new GithubNetworkError({ cause })
    const b = new GithubNetworkError({ cause })

    expect(Equal.equals(a, b)).toBe(true)
  })
})

describe('cross-tag equality', () => {
  it('different tag classes are never Equal.equals', () => {
    const http = new GithubServerError({ status: 500, message: 'x' })
    const gql = new GithubGraphQLError({ message: 'x' })

    expect(Equal.equals(http, gql)).toBe(false)
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

  it('403 → GithubRateLimitError (treated as secondary rate limit)', () => {
    const err = classifyHttpError({
      status: 403,
      message: 'forbidden',
      retryAfter: 0,
      rateLimitRemaining: 0,
    })
    expect(err._tag).toBe('GithubRateLimitError')
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

describe('renderPatError', () => {
  it('expired_or_invalid yields actionable guidance', () => {
    const out = renderPatError('expired_or_invalid', 'token gone')
    expect(out.type).toBe('expired_or_invalid')
    expect(out.actionHref).toMatch(/github\.com/)
    expect(out.message).toContain('token gone')
  })

  it('rate_limit fills default copy when message missing', () => {
    const out = renderPatError('rate_limit', undefined)
    expect(out.type).toBe('rate_limit')
    expect(out.message).toMatch(/minute/)
  })

  it('exhaustively maps every PatErrorType', () => {
    const types = [
      'expired_or_invalid',
      'missing_scopes',
      'rate_limit',
      'network',
      'unknown',
    ] as const
    for (const t of types) {
      const out = renderPatError(t, undefined)
      expect(out.type).toBe(t)
      expect(out.title.length).toBeGreaterThan(0)
      expect(out.message.length).toBeGreaterThan(0)
    }
  })
})
