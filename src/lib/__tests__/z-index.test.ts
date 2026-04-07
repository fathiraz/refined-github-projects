import { describe, it, expect } from 'vitest'

import { Z_BASE, Z_OVERLAY, Z_MODAL, Z_MODAL_PORTAL, Z_TOOLTIP } from '../z-index'

describe('z-index constants', () => {
  it('all constants are numbers', () => {
    expect(typeof Z_BASE).toBe('number')
    expect(typeof Z_OVERLAY).toBe('number')
    expect(typeof Z_MODAL).toBe('number')
    expect(typeof Z_MODAL_PORTAL).toBe('number')
    expect(typeof Z_TOOLTIP).toBe('number')
  })

  it('constants are ordered from lowest to highest', () => {
    expect(Z_BASE).toBeLessThan(Z_OVERLAY)
    expect(Z_OVERLAY).toBeLessThan(Z_MODAL)
    expect(Z_MODAL).toBeLessThan(Z_MODAL_PORTAL)
    expect(Z_MODAL_PORTAL).toBeLessThan(Z_TOOLTIP)
  })

  it('Z_BASE is 1000', () => {
    expect(Z_BASE).toBe(1000)
  })

  it('Z_TOOLTIP is the highest tier', () => {
    expect(Z_TOOLTIP).toBeGreaterThan(Z_MODAL_PORTAL)
  })
})
