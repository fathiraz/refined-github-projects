// Override: strips non-conformant shadows and border-radius from driver.js
// All colors use Primer CSS custom properties; ShadowThemeProvider guarantees resolution.
export const DRIVER_CSS_OVERRIDES = `
  .rgp-tour-popover.driver-popover {
    background: var(--color-canvas-overlay, #fff);
    border: 1px solid var(--color-border-default, #d0d7de);
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.16);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    padding: 20px;
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
    background: var(--color-canvas-default, #fff);
    color: var(--color-fg-default, #1f2328);
  }
  .rgp-tour-popover .driver-popover-next-btn {
    background: var(--color-accent-emphasis, #0969da) !important;
    color: #fff !important;
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
