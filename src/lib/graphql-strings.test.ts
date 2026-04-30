import { describe, it, expect } from 'vitest'
import * as mutations from '@/lib/graphql-mutations'
import * as queries from '@/lib/graphql-queries'

describe('graphql exports', () => {
  it('mutations are non-empty strings', () => {
    expect(typeof mutations.CLONE_ISSUE).toBe('string')
    expect(mutations.CLONE_ISSUE.length).toBeGreaterThan(0)
    expect(typeof mutations.ATTACH_TO_PROJECT).toBe('string')
    expect(mutations.ATTACH_TO_PROJECT.length).toBeGreaterThan(0)
  })

  it('queries are non-empty strings', () => {
    expect(typeof queries.VALIDATE_TOKEN).toBe('string')
    expect(queries.VALIDATE_TOKEN.length).toBeGreaterThan(0)
    expect(typeof queries.GET_PROJECT_FIELDS).toBe('string')
    expect(queries.GET_PROJECT_FIELDS.length).toBeGreaterThan(0)
  })
})
