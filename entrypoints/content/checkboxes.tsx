import React from 'react'
import ReactDOM from 'react-dom/client'
import { extractItemId, getStoredItemId, getAllInjectedItemIds, INJECTED_ATTR } from '../../lib/domUtils'
import { portalStore } from '../../lib/portalStore'

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
    /* ── Checkbox cell — separate sibling between drag-handle and title ── */
    .rgp-cb-cell {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      width: 28px;
      min-width: 28px;
      max-width: 28px;
      height: var(--table-cell-height, 37px);
      flex-shrink: 0;
      vertical-align: top;
      padding: 0;
      opacity: 0;
      transition: opacity 150ms ease;
      border-bottom: var(--borderWidth-thin) solid var(--borderColor-muted);
    }

    .rgp-cb-cell--header {
      height: 34px;
      opacity: 1;
    }

    /* Show checkbox on row hover or when checked */
    [role="row"]:hover > .rgp-cb-cell,
    .rgp-cb-cell:has(.rgp-selection-control[data-state="checked"]) {
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
