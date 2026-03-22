// Stub for @primer/live-region-element to prevent customElements errors in content scripts
// Content scripts run in isolated world where customElements is null

// No-op announce function that silently fails in content script context
export function announce(message: string, options?: { politeness?: 'polite' | 'assertive' }): void {
  // Live regions don't work in content scripts due to customElements being null
  // This is a known limitation of browser extension content scripts
}

// No-op announceFromElement function
export function announceFromElement(element: Element, options?: { delayMs?: number; politeness?: 'polite' | 'assertive' }): void {
  // Live regions don't work in content scripts due to customElements being null
}

// Default export for any direct imports
export default {
  announce,
  announceFromElement,
}
