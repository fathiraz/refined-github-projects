import { describe, expect, it } from 'vitest'
import { Schema } from 'effect'

import { Messages } from '@/lib/schemas-messages'

/**
 * Schema-encoded snapshot tests. For every Protocol entry's input/output
 * Schema, encode a representative sample value and assert that the encoded
 * shape matches a stable JSON snapshot. Catches accidental schema drift
 * (e.g. a renamed field) at PR time.
 *
 * Only a few representative entries are sampled — adding more is cheap and
 * recommended whenever a new ProtocolMap entry lands.
 */
describe('MessageSchemas — round-trip encode snapshots', () => {
  it('encodes/decodes getPatStatus output', () => {
    const value = { hasPat: true }
    const encoded = Schema.encodeSync(Messages.getPatStatus.output)(value)
    expect(encoded).toEqualValue({ hasPat: true })
    const decoded = Schema.decodeSync(Messages.getPatStatus.output)(encoded)
    expect(decoded).toEqualValue(value)
  })

  it('encodes/decodes validatePat output (success variant)', () => {
    const value = { valid: true as const, user: 'octocat' }
    const encoded = Schema.encodeSync(Messages.validatePat.output)(value)
    expect(encoded).toEqualValue({ valid: true, user: 'octocat' })
  })

  it('encodes/decodes validatePat output (failure variant)', () => {
    const value = {
      valid: false as const,
      errorType: 'expired_or_invalid' as const,
      errorMessage: 'Bad credentials',
    }
    const encoded = Schema.encodeSync(Messages.validatePat.output)(value)
    expect(encoded).toEqualValue({
      valid: false,
      errorType: 'expired_or_invalid',
      errorMessage: 'Bad credentials',
    })
  })

  it('decodes valid getItemPreview input', () => {
    const value = { itemId: 'issue:42', owner: 'octocat', number: 1, isOrg: false }
    const decoded = Schema.decodeUnknownSync(Messages.getItemPreview.input)(value)
    expect(decoded).toEqualValue(value)
  })

  it('rejects invalid validatePat input (missing token)', () => {
    expect(() => Schema.decodeUnknownSync(Messages.validatePat.input)({})).toThrow()
  })
})
