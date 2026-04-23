import { describe, it, expect } from 'vitest'
import { Equal } from 'effect'

import { GithubHttpError, GithubGraphQLError, GithubNetworkError } from '../errors'

describe('GithubHttpError', () => {
  it('exposes tagged fields', () => {
    const err = new GithubHttpError({ status: 429, message: 'Too Many', retryAfter: 30 })

    expect(err._tag).toBe('GithubHttpError')
    expect(err.status).toBe(429)
    expect(err.message).toBe('Too Many')
    expect(err.retryAfter).toBe(30)
    expect(err).toBeInstanceOf(Error)
  })

  it('Equal.equals returns true for identical payloads', () => {
    const a = new GithubHttpError({ status: 429, message: 'Too Many', retryAfter: 30 })
    const b = new GithubHttpError({ status: 429, message: 'Too Many', retryAfter: 30 })

    expect(Equal.equals(a, b)).toBe(true)
    expect(a).toEqualValue(b)
  })

  it('Equal.equals returns false when status differs', () => {
    const a = new GithubHttpError({ status: 429, message: 'x', retryAfter: 0 })
    const b = new GithubHttpError({ status: 500, message: 'x', retryAfter: 0 })

    expect(Equal.equals(a, b)).toBe(false)
  })

  it('Equal.equals returns false when message differs', () => {
    // `message` is part of the TaggedError payload contract, so differing
    // messages must make the errors unequal. The class constructor redefines
    // `message` as an enumerable own property specifically so that it
    // participates in structural equality.
    const a = new GithubHttpError({ status: 403, message: 'Forbidden', retryAfter: 0 })
    const b = new GithubHttpError({ status: 403, message: 'Blocked', retryAfter: 0 })

    expect(Equal.equals(a, b)).toBe(false)
    expect(a.message).not.toBe(b.message)
  })

  it('Equal.equals returns false when retryAfter differs', () => {
    const a = new GithubHttpError({ status: 429, message: 'x', retryAfter: 30 })
    const b = new GithubHttpError({ status: 429, message: 'x', retryAfter: 60 })

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
    const http = new GithubHttpError({ status: 500, message: 'x', retryAfter: 0 })
    const gql = new GithubGraphQLError({ message: 'x' })

    expect(Equal.equals(http, gql)).toBe(false)
  })
})
