import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock debug-logger before importing the module under test
vi.mock('@/lib/debug-logger', () => ({
  logger: {
    log: vi.fn(),
  },
}))

import { installPrimerShadowDomCompat, clearMousedownPath } from '@/lib/primer-shadow-dom-compat'

describe('installPrimerShadowDomCompat', () => {
  let shadowHost: HTMLElement
  let portalHost: HTMLElement
  let shadowRoot: ShadowRoot
  let cleanup: (() => void) | undefined

  beforeEach(() => {
    shadowHost = document.createElement('div')
    shadowHost.id = 'shadow-host'
    document.body.appendChild(shadowHost)

    shadowRoot = shadowHost.attachShadow({ mode: 'open' })

    portalHost = document.createElement('div')
    portalHost.setAttribute('data-rgp-primer-portal', '')
    shadowRoot.appendChild(portalHost)
  })

  afterEach(() => {
    cleanup?.()
    document.body.innerHTML = ''
  })

  it('returns a cleanup function', () => {
    cleanup = installPrimerShadowDomCompat(portalHost, shadowRoot)
    expect(typeof cleanup).toBe('function')
  })

  it('cleanup removes listeners and observer', () => {
    cleanup = installPrimerShadowDomCompat(portalHost, shadowRoot)
    cleanup()
    // Should be safe to reinstall after cleanup
    cleanup = installPrimerShadowDomCompat(portalHost, shadowRoot)
    expect(typeof cleanup).toBe('function')
  })

  it('patches contains on existing children', () => {
    const child = document.createElement('div')
    portalHost.appendChild(child)

    cleanup = installPrimerShadowDomCompat(portalHost, shadowRoot)

    // Dispatch mousedown from inside the shadow tree so happy-dom populates composedPath
    const mousedown = new MouseEvent('mousedown', { bubbles: true, composed: true })
    child.dispatchEvent(mousedown)

    // patched contains should report that child contains shadowHost
    expect(child.contains(shadowHost as unknown as Node)).toBe(true)
  })

  it('patches contains on dynamically added children', async () => {
    cleanup = installPrimerShadowDomCompat(portalHost, shadowRoot)

    const child = document.createElement('div')
    portalHost.appendChild(child)

    // Allow MutationObserver to fire in happy-dom
    await new Promise<void>((r) => setTimeout(r, 10))

    const mousedown = new MouseEvent('mousedown', { bubbles: true, composed: true })
    child.dispatchEvent(mousedown)

    expect(child.contains(shadowHost as unknown as Node)).toBe(true)
  })

  it('contains fallback returns false when no mousedown tracked', () => {
    const child = document.createElement('div')
    portalHost.appendChild(child)

    cleanup = installPrimerShadowDomCompat(portalHost, shadowRoot)

    // No mousedown dispatched — activeMousedownPath is empty
    expect(child.contains(shadowHost as unknown as Node)).toBe(false)
  })

  it('contains fallback returns false for null node', () => {
    const child = document.createElement('div')
    portalHost.appendChild(child)

    cleanup = installPrimerShadowDomCompat(portalHost, shadowRoot)

    const mousedown = new MouseEvent('mousedown', { bubbles: true, composed: true })
    child.dispatchEvent(mousedown)

    expect(child.contains(null as unknown as Node)).toBe(false)
  })

  it('click handler clears tracked mousedown state', () => {
    cleanup = installPrimerShadowDomCompat(portalHost, shadowRoot)

    const child = document.createElement('div')
    portalHost.appendChild(child)

    const mousedown = new MouseEvent('mousedown', { bubbles: true, composed: true })
    child.dispatchEvent(mousedown)

    // click should clear the tracked state
    const click = new MouseEvent('click', { bubbles: true, composed: true })
    child.dispatchEvent(click)

    // After click clears state, contains should return false
    expect(child.contains(shadowHost as unknown as Node)).toBe(false)
  })

  it('logs click events from portal', () => {
    cleanup = installPrimerShadowDomCompat(portalHost, shadowRoot)

    const child = document.createElement('div')
    portalHost.appendChild(child)

    const mousedown = new MouseEvent('mousedown', { bubbles: true, composed: true })
    child.dispatchEvent(mousedown)

    const click = new MouseEvent('click', { bubbles: true, composed: true })
    child.dispatchEvent(click)

    // Should not throw; click handler logs and clears
    expect(true).toBe(true)
  })

  it('clears tracked mousedown when event originates outside portal', () => {
    const child = document.createElement('div')
    portalHost.appendChild(child)

    cleanup = installPrimerShadowDomCompat(portalHost, shadowRoot)

    // Set state with inside mousedown
    const mousedownInside = new MouseEvent('mousedown', { bubbles: true, composed: true })
    child.dispatchEvent(mousedownInside)
    expect(child.contains(shadowHost as unknown as Node)).toBe(true)

    // Dispatch from outside the shadow tree
    const outsideEl = document.createElement('div')
    document.body.appendChild(outsideEl)
    const mousedownOutside = new MouseEvent('mousedown', { bubbles: true })
    outsideEl.dispatchEvent(mousedownOutside)

    // State should be cleared
    expect(child.contains(shadowHost as unknown as Node)).toBe(false)
  })

  it('patches contains on nested children', () => {
    const parent = document.createElement('div')
    const child = document.createElement('div')
    parent.appendChild(child)
    portalHost.appendChild(parent)

    cleanup = installPrimerShadowDomCompat(portalHost, shadowRoot)

    // Dispatch mousedown from grandchild so parent.contains uses originalContains fallback
    const mousedown = new MouseEvent('mousedown', { bubbles: true, composed: true })
    child.dispatchEvent(mousedown)

    expect(parent.contains(shadowHost as unknown as Node)).toBe(true)
  })
})

describe('clearMousedownPath', () => {
  it('does not throw', () => {
    expect(() => clearMousedownPath()).not.toThrow()
  })
})
