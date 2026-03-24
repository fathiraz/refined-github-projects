/** Z-index tier constants. Import these everywhere — never use magic numbers. */
export const Z_BASE    = 1000   // Injected toolbar, checkboxes, in-page widgets
export const Z_OVERLAY = 10000  // Floating panels (SprintPanel, QueueTracker, BulkActionsBar)
export const Z_MODAL        = 10001  // Primer Dialog backdrop and dialog itself
export const Z_MODAL_PORTAL = 10002  // Primer portaled overlays (e.g. SelectPanel) above modal chrome
export const Z_TOOLTIP      = 10003  // Tippy.js tooltips (above modals and nested Primer portals)
