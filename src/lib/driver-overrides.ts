// Override: strips non-conformant shadows and border-radius from driver.js
// NOTE: This CSS is injected into document.head (not the shadow DOM). ShadowThemeProvider
// does NOT cover this scope, so hex fallbacks are required for all CSS custom properties.
export const DRIVER_CSS_OVERRIDES = `
  .rgp-tour-popover.driver-popover {
    background: var(--color-canvas-overlay, #ffffff) !important;
    border: 1px solid var(--color-border-default, #d0d7de) !important;
    border-radius: 6px !important;
    box-shadow: none !important;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    padding: 16px;
    max-width: 320px;
  }
  .rgp-tour-popover .driver-popover-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--color-fg-default, #1f2328);
    margin-bottom: 6px;
  }
  .rgp-tour-popover .driver-popover-description {
    font-size: 13px;
    color: var(--color-fg-muted, #656d76);
    line-height: 1.6;
  }
  .rgp-tour-popover .driver-popover-description kbd {
    font-size: 11px;
    padding: 1px 5px;
    border-radius: 4px;
    background: var(--color-canvas-inset, #f6f8fa);
    border: 1px solid var(--color-border-default, #d0d7de);
  }
  .rgp-tour-popover .driver-popover-footer button {
    font-size: 12px;
    font-weight: 500;
    border-radius: 6px;
    padding: 5px 12px;
    cursor: pointer;
    border: 1px solid var(--color-border-default, #d0d7de);
    background: var(--color-canvas-default, #ffffff);
    color: var(--color-fg-default, #1f2328);
    box-shadow: none !important;
    transition: transform 150ms cubic-bezier(0.4, 0, 0.2, 1);
  }
  @media (prefers-reduced-motion: reduce) {
    .rgp-tour-popover .driver-popover-footer button {
      transition: none;
    }
  }
  .rgp-tour-popover .driver-popover-next-btn {
    background: var(--color-accent-emphasis, #0969da) !important;
    color: var(--color-fg-on-emphasis, #ffffff) !important;
    border-color: transparent !important;
  }
  .rgp-tour-popover .driver-popover-progress-text {
    font-size: 11px;
    color: var(--color-fg-muted, #656d76);
  }
  .driver-popover-close-btn {
    display: none !important;
  }
`
