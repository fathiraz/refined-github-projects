import { describe, it, expect } from 'vitest'

import liveRegion, { announce, announceFromElement } from '../primer-live-region-stub'

describe('primer-live-region-stub', () => {
  it('announce does not throw', () => {
    expect(() => announce('hello')).not.toThrow()
    expect(() => announce('hello', { politeness: 'assertive' })).not.toThrow()
  })

  it('announceFromElement does not throw', () => {
    const el = document.createElement('div')
    expect(() => announceFromElement(el)).not.toThrow()
    expect(() => announceFromElement(el, { delayMs: 100, politeness: 'polite' })).not.toThrow()
  })

  it('default export has both methods', () => {
    expect(typeof liveRegion.announce).toBe('function')
    expect(typeof liveRegion.announceFromElement).toBe('function')
  })
})
