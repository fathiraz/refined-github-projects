import { describe, it, expect, beforeEach } from 'vitest'
import { ensureTippyCss, ensureRgpCardTheme, getTippyDelayValue } from '../tippy-utils'

describe('ensureTippyCss', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
  })

  it('injects tippy css style element', () => {
    ensureTippyCss()
    const el = document.getElementById('rgp-tippy-css')
    expect(el).toBeInstanceOf(HTMLStyleElement)
    expect(el?.textContent).toContain('.tippy-box')
  })

  it('is idempotent', () => {
    ensureTippyCss()
    ensureTippyCss()
    const els = document.querySelectorAll('#rgp-tippy-css')
    expect(els.length).toBe(1)
  })
})

describe('ensureRgpCardTheme', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
  })

  it('injects card theme style element', () => {
    ensureRgpCardTheme()
    const el = document.getElementById('rgp-tippy-card-theme')
    expect(el).toBeInstanceOf(HTMLStyleElement)
    expect(el?.textContent).toContain('rgp-card')
  })

  it('is idempotent', () => {
    ensureRgpCardTheme()
    ensureRgpCardTheme()
    const els = document.querySelectorAll('#rgp-tippy-card-theme')
    expect(els.length).toBe(1)
  })
})

describe('getTippyDelayValue', () => {
  it('returns 0 for null', () => {
    expect(getTippyDelayValue(null, 0)).toBe(0)
  })

  it('returns 0 for undefined', () => {
    expect(getTippyDelayValue(undefined, 0)).toBe(0)
  })

  it('returns positive number as-is', () => {
    expect(getTippyDelayValue(150, 0)).toBe(150)
  })

  it('clamps negative number to 0', () => {
    expect(getTippyDelayValue(-50, 0)).toBe(0)
  })

  it('returns value at array index 0', () => {
    expect(getTippyDelayValue([100, 200], 0)).toBe(100)
  })

  it('returns value at array index 1', () => {
    expect(getTippyDelayValue([100, 200], 1)).toBe(200)
  })

  it('falls back to 0 when array index is undefined', () => {
    expect(getTippyDelayValue([100, undefined], 1)).toBe(0)
  })

  it('falls back to 0 when array entry is null', () => {
    expect(getTippyDelayValue([null, 200], 0)).toBe(0)
  })
})
