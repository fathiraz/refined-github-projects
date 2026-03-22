import React from 'react'
import ReactDOM from 'react-dom/client'
import { extractItemId, getStoredItemId, getAllInjectedItemIds, INJECTED_ATTR } from '../../lib/dom-utils'
import { portalStore } from '../../lib/portal-store'

/** Attribute for group-header / select-all checkboxes. */
export const GROUP_CB_ATTR = 'data-rgp-gcb'
export const COLHDR_ATTR = 'data-rgp-sall'

let groupKeyCounter = 0

/**
 * Inject per-row checkboxes as a SEPARATE inline-block sibling element
 * placed AFTER the drag-handle cell and BEFORE the Title cell.
 */
export function injectCheckboxes() {
  for (const row of document.querySelectorAll<HTMLElement>('[role="row"]')) {
    if (row.getAttribute(INJECTED_ATTR)) continue
    const itemId = extractItemId(row)
    if (!itemId) continue

    const gridcells = row.querySelectorAll<HTMLElement>(':scope > [role="gridcell"]')
    if (gridcells.length < 2) continue
    const titleCell = gridcells[1]

    // Guard: skip if our checkbox cell is already present (double-injection safety)
    if (row.querySelector('.rgp-cb-cell')) {
      row.setAttribute(INJECTED_ATTR, itemId)
      continue
    }

    row.setAttribute(INJECTED_ATTR, itemId)

    const cbDiv = document.createElement('div')
    cbDiv.className = 'rgp-cb-cell'
    row.insertBefore(cbDiv, titleCell)
    portalStore.addRow(cbDiv, itemId)
  }
}

export function isGroupHeaderRow(el: Element): boolean {
  return (
    el.matches('[role="row"]') &&
    extractItemId(el) === null &&
    el.querySelector('[role="cell"], [role="rowheader"]') !== null &&
    el.querySelector('[role="columnheader"]') === null &&
    el.querySelector('input[role="combobox"]') === null
  )
}

export function getGroupItemIds(groupHeaderEl: Element): string[] {
  const allGroupHeaders = Array.from(
    document.querySelectorAll<HTMLElement>('[role="row"]'),
  ).filter(isGroupHeaderRow)

  const idx = allGroupHeaders.indexOf(groupHeaderEl as HTMLElement)
  const nextHeader = allGroupHeaders[idx + 1] ?? null

  return Array.from(
    document.querySelectorAll<HTMLElement>(`[role="row"][${INJECTED_ATTR}]`),
  )
    .filter(row => {
      const afterThis = !!(
        groupHeaderEl.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING
      )
      if (!afterThis) return false
      if (!nextHeader) return true
      return !!(nextHeader.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_PRECEDING)
    })
    .map(row => getStoredItemId(row)!)
}

export function injectGroupCheckboxes() {
  const rows = document.querySelectorAll<HTMLElement>('[role="row"]')
  for (const row of rows) {
    if (!isGroupHeaderRow(row)) continue
    if (row.getAttribute(GROUP_CB_ATTR)) continue

    row.setAttribute(GROUP_CB_ATTR, '1')

    const cell = row.querySelector<HTMLElement>('[role="cell"]')
    if (!cell) continue

    const expandBtn = cell.querySelector<HTMLElement>('button')

    const cbSpan = document.createElement('span')
    cbSpan.className = 'rgp-gcb-inline'
    cbSpan.dataset.rgpGcbKey = String(groupKeyCounter++)

    if (expandBtn && expandBtn.nextSibling) {
      cell.insertBefore(cbSpan, expandBtn.nextSibling)
    } else {
      cell.insertBefore(cbSpan, cell.firstChild)
    }
    portalStore.addGroup(cbSpan, () => getGroupItemIds(row))
  }
}

export function injectSelectAllCheckbox() {
  const headerRows = document.querySelectorAll<HTMLElement>('[role="row"]')
  for (const row of headerRows) {
    if (row.getAttribute(COLHDR_ATTR)) continue
    const firstColHeader = row.querySelector<HTMLElement>('[role="columnheader"]')
    if (!firstColHeader) continue

    row.setAttribute(COLHDR_ATTR, '1')

    const cbDiv = document.createElement('div')
    cbDiv.className = 'rgp-cb-cell rgp-cb-cell--header'
    row.insertBefore(cbDiv, firstColHeader)
    portalStore.addSelectAll(cbDiv)
    break // Only one table header
  }
}

export function injectCheckboxStyles() {
  const style = document.createElement('style')
  style.textContent = `
    /* ── Checkbox cell — centered, compact, minimal ── */
    .rgp-cb-cell {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 2px;
      box-sizing: border-box;
      position: relative;
      overflow: visible;
      width: 44px;
      min-width: 44px;
      max-width: 44px;
      height: var(--table-cell-height, 37px);
      flex-shrink: 0;
      vertical-align: top;
      padding: 2px;
      opacity: 1;
      border-right: var(--borderWidth-thin, 1px) solid var(--borderColor-muted, #d0d7de);
    }
    /* Persistent bottom divider — always visible regardless of hover */
    .rgp-cb-cell::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: var(--borderWidth-thin, 1px);
      background: var(--borderColor-muted, #d0d7de);
      pointer-events: none;
      z-index: 1;
    }

    /* ── Drag handle — minimal, centered ── */
    .rgp-dnd-handle {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 18px;
      border-radius: 4px;
      flex-shrink: 0;
      cursor: grab;
      color: var(--fgColor-muted, var(--color-fg-muted, #57606a));
      opacity: 0;
      transition: opacity 160ms ease, background-color 120ms ease, transform 150ms ease;
    }
    /* Show drag handle on row hover or when row is checked */
    [role="row"]:hover > .rgp-cb-cell .rgp-dnd-handle,
    .rgp-cb-cell:has(.rgp-selection-control[data-state="checked"]) .rgp-dnd-handle {
      opacity: 0.6;
    }
    [role="row"]:hover > .rgp-cb-cell .rgp-dnd-handle:hover,
    .rgp-cb-cell:has(.rgp-selection-control[data-state="checked"]) .rgp-dnd-handle:hover {
      opacity: 1;
    }
    .rgp-dnd-handle:active {
      cursor: grabbing;
    }
    .rgp-dnd-handle:hover {
      background-color: var(--bgColor-neutral-muted, var(--color-neutral-subtle, rgba(175,184,193,0.2)));
      opacity: 0.65 !important;
    }
    .rgp-dnd-handle:focus-visible {
      outline: 2px solid var(--color-accent-emphasis, #0969da);
      outline-offset: 2px;
    }
    .rgp-dnd-handle::after {
      content: attr(data-tooltip);
      position: absolute;
      bottom: calc(100% + 6px);
      left: 50%;
      transform: translateX(-50%);
      background: var(--bgColor-emphasis, #24292f);
      color: var(--fgColor-onEmphasis, var(--color-fg-on-emphasis, #fff));
      font-size: 11px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      white-space: nowrap;
      padding: 4px 8px;
      border-radius: 6px;
      pointer-events: none;
      opacity: 0;
      transition: opacity 120ms ease 500ms;
      z-index: 10001;
    }
    .rgp-dnd-handle:hover::after {
      opacity: 1;
    }

    .rgp-cb-cell--header {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      min-width: 44px;
      max-width: 44px;
      height: 34px;
      padding: 2px;
      opacity: 1;
      border-right: var(--borderWidth-thin, 1px) solid var(--borderColor-muted, #d0d7de);
    }
    /* Persistent bottom divider for header — always visible */
    .rgp-cb-cell--header::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: var(--borderWidth-thin, 1px);
      background: var(--borderColor-muted, #d0d7de);
      pointer-events: none;
      z-index: 1;
    }

    /* Show checkbox control on row hover or when checked */
    .rgp-cb-cell .rgp-selection-control {
      opacity: 0;
      transition: opacity 160ms ease;
    }
    [role="row"]:hover > .rgp-cb-cell .rgp-selection-control,
    .rgp-cb-cell:has(.rgp-selection-control[data-state="checked"]) .rgp-selection-control {
      opacity: 1;
    }
    .rgp-cb-cell--header .rgp-selection-control {
      opacity: 1;
    }

    /* ── Group-header inline checkbox ── */
    .rgp-gcb-inline {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      vertical-align: middle;
      margin-right: 4px;
    }

    .rgp-gcb-wrap {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      width: 20px;
      height: 20px;
      vertical-align: middle;
      border-radius: 4px;
      transition: background 120ms ease;
      cursor: pointer;
    }

    .rgp-selection-control {
      appearance: none;
      -webkit-appearance: none;
      border: none;
      background: transparent;
      padding: 0;
      margin: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      cursor: pointer;
      border-radius: 4px;
      transition: transform 180ms cubic-bezier(0.4, 0, 0.2, 1), background-color 180ms cubic-bezier(0.4, 0, 0.2, 1);
    }

    .rgp-selection-control:hover {
      background: var(--color-accent-subtle, rgba(9, 105, 218, 0.08));
      transform: translateY(-1px);
    }

    .rgp-selection-control:focus-visible {
      outline: 2px solid var(--color-accent-emphasis, #0969da);
      outline-offset: 2px;
    }

    .rgp-selection-control__box {
      width: 16px;
      height: 16px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 3px;
      border: 1.5px solid var(--color-border-default, #d0d7de);
      background: var(--color-canvas-default, #ffffff);
      color: transparent;
      transition: all 180ms cubic-bezier(0.4, 0, 0.2, 1);
    }
    html[data-color-mode="dark"] .rgp-selection-control__box {
      background: var(--color-canvas-overlay, #161b22);
      border-color: var(--color-border-default, #30363d);
    }
    @media (prefers-color-scheme: dark) {
      html[data-color-mode="auto"] .rgp-selection-control__box {
        background: var(--color-canvas-overlay, #161b22);
        border-color: var(--color-border-default, #30363d);
      }
    }

    .rgp-selection-control[data-state="checked"] .rgp-selection-control__box,
    .rgp-selection-control[data-state="indeterminate"] .rgp-selection-control__box {
      background: var(--color-accent-emphasis, #0969da);
      border-color: var(--color-accent-emphasis, #0969da);
      color: var(--color-fg-on-emphasis, #ffffff);
      transform: scale(1.02);
    }

    .rgp-selection-control__dash {
      width: 8px;
      height: 2px;
      border-radius: 999px;
      background: currentColor;
    }

    [role="row"]:has(.rgp-selection-control[data-state="checked"]) {
      background-color: var(--color-accent-subtle, rgba(9, 105, 218, 0.06)) !important;
      box-shadow: inset 2px 0 0 var(--color-accent-emphasis, #0969da);
    }

    .rgp-deep-dup-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 6px 8px;
      background: transparent;
      border: none;
      color: inherit;
      font: inherit;
      font-size: 14px;
      cursor: pointer;
      text-align: left;
      border-radius: 6px;
    }

    .rgp-deep-dup-btn:hover {
      background: var(--color-action-list-item-default-hover-bg, rgba(139, 148, 158, 0.1));
    }

    /* Hide GitHub's native project-row selection checkbox (we replace it) */
    [data-hovercard-subject-tag] > div:has(> input[type="checkbox"]) {
      display: none;
    }
    /* Hide GitHub's native group-header selection checkbox */
    [role="cell"] > div:has(> input[type="checkbox"]) {
      display: none;
    }

    @media (prefers-reduced-motion: reduce) {
      .rgp-selection-control, .rgp-selection-control__box { transition: none !important; }
    }
  `
  document.head.appendChild(style)
}
