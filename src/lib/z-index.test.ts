import { describe, it, expect } from 'vitest'

import { Z_BASE, Z_OVERLAY, Z_MODAL, Z_MODAL_PORTAL, Z_TOOLTIP } from '@/lib/z-index'

describe('z-index constants', () => {
  it('are ordered from lowest to highest tier', () => {
    expect(Z_BASE).toBeLessThan(Z_OVERLAY)
    expect(Z_OVERLAY).toBeLessThan(Z_MODAL)
    expect(Z_MODAL).toBeLessThan(Z_MODAL_PORTAL)
    expect(Z_MODAL_PORTAL).toBeLessThan(Z_TOOLTIP)
  })
})
