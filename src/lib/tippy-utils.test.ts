import { describe, it, expect, beforeEach } from 'vitest'
import { ensureTippyCss, ensureRgpCardTheme, getTippyDelayValue } from '@/lib/tippy-utils'

describe('ensureTippyCss', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
    document.body.innerHTML = ''
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

  it('injects into shadow root when target is in shadow DOM', () => {
    const host = document.createElement('div')
    const shadowRoot = host.attachShadow({ mode: 'open' })
    const target = document.createElement('div')
    shadowRoot.appendChild(target)
    document.body.appendChild(host)

    ensureTippyCss(target)

    expect(shadowRoot.querySelector('#rgp-tippy-css')).toBeInstanceOf(HTMLStyleElement)
    expect(document.head.querySelectorAll('#rgp-tippy-css').length).toBe(0)
  })
})

describe('ensureRgpCardTheme', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
    document.body.innerHTML = ''
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

  it('injects into shadow root when target is in shadow DOM', () => {
    const host = document.createElement('div')
    const shadowRoot = host.attachShadow({ mode: 'open' })
    const target = document.createElement('div')
    shadowRoot.appendChild(target)
    document.body.appendChild(host)

    ensureRgpCardTheme(target)

    expect(shadowRoot.querySelector('#rgp-tippy-card-theme')).toBeInstanceOf(HTMLStyleElement)
    expect(document.head.querySelectorAll('#rgp-tippy-card-theme').length).toBe(0)
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
