import { describe, it, expect } from 'vitest'
import { DRIVER_CSS_OVERRIDES } from '../driver-overrides'

describe('driver-overrides', () => {
  it('exports CSS override string', () => {
    expect(typeof DRIVER_CSS_OVERRIDES).toBe('string')
    expect(DRIVER_CSS_OVERRIDES).toContain('.rgp-tour-popover')
  })
})
