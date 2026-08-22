import { describe, it, expect } from 'vitest'

import {
  decodeIssueDatabaseId,
  decodeIssueNodeId,
  decodeIssueNumber,
  decodeProjectItemDomId,
  decodeProjectItemId,
  decodeRepoName,
  decodeRepoOwner,
} from '@/lib/schemas-decode'

// The brand decoders come in two flavours and the difference is load-bearing:
// the string ones are hot-path (DOM extraction, message receipt) and are
// documented as unable to fail, so callers do not wrap them; the integer ones
// DO validate and callers must be prepared for a throw.

describe('string brand decoders (total — never throw)', () => {
  const cases = [
    ['decodeProjectItemId', decodeProjectItemId],
    ['decodeProjectItemDomId', decodeProjectItemDomId],
    ['decodeIssueNodeId', decodeIssueNodeId],
    ['decodeRepoOwner', decodeRepoOwner],
    ['decodeRepoName', decodeRepoName],
  ] as const

  for (const [name, decode] of cases) {
    it(`${name} returns the value unchanged`, () => {
      expect(decode('PVT_kwHOA')).toBe('PVT_kwHOA')
    })

    it(`${name} accepts the empty string without throwing`, () => {
      // project-helpers passes `content.repository?.owner?.login || ''`, so an
      // empty string reaches these decoders on incomplete GraphQL payloads.
      expect(() => decode('')).not.toThrow()
    })
  }

  it('decodeProjectItemDomId round-trips the DOM id format', () => {
    expect(decodeProjectItemDomId('issue:3960969873')).toBe('issue:3960969873')
    expect(decodeProjectItemDomId('issue-3960969873')).toBe('issue-3960969873')
  })
})

describe('integer brand decoders (partial — throw on non-integers)', () => {
  it('decodeIssueNumber passes integers through', () => {
    expect(decodeIssueNumber(42)).toBe(42)
    expect(decodeIssueNumber(0)).toBe(0)
  })

  it('decodeIssueDatabaseId passes integers through', () => {
    expect(decodeIssueDatabaseId(3960969873)).toBe(3960969873)
  })

  it.each([
    ['NaN', NaN],
    ['a fraction', 1.5],
    ['Infinity', Infinity],
  ])('decodeIssueNumber throws on %s', (_label, value) => {
    expect(() => decodeIssueNumber(value)).toThrow()
  })

  it.each([
    ['NaN', NaN],
    ['a fraction', 1.5],
    ['Infinity', Infinity],
  ])('decodeIssueDatabaseId throws on %s', (_label, value) => {
    expect(() => decodeIssueDatabaseId(value)).toThrow()
  })
})
