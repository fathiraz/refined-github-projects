// Stub for @primer/live-region-element to prevent customElements errors in content scripts
// Content scripts run in isolated world where customElements is null

export function announce(message: string, options?: { politeness?: 'polite' | 'assertive' }): void {
  void message
  void options
}

export function announceFromElement(element: Element, options?: { delayMs?: number; politeness?: 'polite' | 'assertive' }): void {
  void element
  void options
}

export default {
  announce,
  announceFromElement,
}
