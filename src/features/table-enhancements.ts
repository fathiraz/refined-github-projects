// inject styles + per-row checkboxes + group/select-all checkboxes; bootstrap
// the mutation observer that re-runs all injections on dom changes.

import { extractItemId, getStoredItemId, INJECTED_ATTR } from '@/lib/project-table-dom'
import { checkboxPortalStore } from '@/lib/checkbox-portal-store'
import { logger } from '@/lib/debug-logger'
import { Z_TOOLTIP } from '@/lib/z-index'
import { cleanupDragHandles, injectDragHandles } from '@/features/table-drag-drop'

export { initDragAndDrop } from '@/features/table-drag-drop'

const GROUP_CB_ATTR = 'data-rgp-gcb'
const COLHDR_ATTR = 'data-rgp-sall'
const TABLE_ENHANCEMENT_STYLE_ID = 'rgp-table-enhancements-css'

let groupKeyCounter = 0

export function injectTableEnhancementStyles() {
  if (document.getElementById(TABLE_ENHANCEMENT_STYLE_ID)) return

  const style = document.createElement('style')
  style.id = TABLE_ENHANCEMENT_STYLE_ID
  style.textContent = `
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
      border-right: var(--borderWidth-thin, 1px) solid var(--borderColor-muted);
    }
    .rgp-cb-cell::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: var(--borderWidth-thin, 1px);
      background: var(--borderColor-muted);
      pointer-events: none;
      z-index: 1;
    }

    .rgp-dnd-handle {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 18px;
      border-radius: 4px;
      flex-shrink: 0;
      cursor: grab;
      color: var(--fgColor-muted, var(--color-fg-muted));
      opacity: 0;
      transition: opacity 160ms ease, background-color 120ms ease, transform 150ms ease;
    }
    [role="row"]:hover > .rgp-cb-cell .rgp-dnd-handle,
    .rgp-cb-cell:has(.rgp-selection-control input:checked) .rgp-dnd-handle {
      opacity: 0.6;
    }
    [role="row"]:hover > .rgp-cb-cell .rgp-dnd-handle:hover,
    .rgp-cb-cell:has(.rgp-selection-control input:checked) .rgp-dnd-handle:hover {
      opacity: 1;
    }
    .rgp-dnd-handle:active {
      cursor: grabbing;
    }
    .rgp-dnd-handle:hover {
      background-color: var(--bgColor-neutral-muted, var(--color-neutral-subtle));
      opacity: 0.65 !important;
    }
    .rgp-dnd-handle:focus-visible {
      outline: 2px solid var(--color-accent-emphasis);
      outline-offset: 2px;
    }
    .rgp-dnd-handle::after {
      content: attr(data-tooltip);
      position: absolute;
      bottom: calc(100% + 6px);
      left: 50%;
      transform: translateX(-50%);
      background: var(--bgColor-emphasis);
      color: var(--fgColor-onEmphasis, var(--color-fg-on-emphasis));
      font-size: 11px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      white-space: nowrap;
      padding: 4px 8px;
      border-radius: 6px;
      pointer-events: none;
      opacity: 0;
      transition: opacity 120ms ease 500ms;
      z-index: ${Z_TOOLTIP};
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
      border-right: var(--borderWidth-thin, 1px) solid var(--borderColor-muted);
    }
    .rgp-cb-cell--header::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: var(--borderWidth-thin, 1px);
      background: var(--borderColor-muted);
      pointer-events: none;
      z-index: 1;
    }

    .rgp-cb-cell .rgp-selection-control {
      opacity: 0;
      transition: opacity 160ms ease;
    }
    [role="row"]:hover > .rgp-cb-cell .rgp-selection-control,
    .rgp-cb-cell:has(.rgp-selection-control input:checked) .rgp-selection-control,
    .rgp-cb-cell:has(.rgp-selection-control input:indeterminate) .rgp-selection-control {
      opacity: 1;
    }
    .rgp-cb-cell--header .rgp-selection-control {
      opacity: 1;
    }

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
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      border-radius: 4px;
      transition: transform 180ms cubic-bezier(0.4, 0, 0.2, 1);
    }

    .rgp-selection-control:focus-within {
      outline: 2px solid var(--color-accent-emphasis);
      outline-offset: 2px;
    }

    [role="row"]:has(.rgp-selection-control input:checked) {
      background-color: var(--color-accent-subtle, rgba(9, 105, 218, 0.06)) !important;
      box-shadow: inset 2px 0 0 var(--color-accent-emphasis);
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

    [data-hovercard-subject-tag] > div:has(> input[type="checkbox"]) {
      display: none;
    }
    [role="cell"] > div:has(> input[type="checkbox"]) {
      display: none;
    }

    @media (prefers-reduced-motion: reduce) {
      .rgp-selection-control {
        transition: none !important;
      }
    }

    .rgp-hier-host {
      position: absolute;
      width: 0;
      height: 0;
      overflow: hidden;
      pointer-events: none;
    }
  `
  document.head.appendChild(style)
}

export function setupTableEnhancements(extras: Array<() => void> = []) {
  const runInjections = () => {
    injectCheckboxes()
    injectGroupCheckboxes()
    injectSelectAllCheckbox()
    injectDragHandles()
    extras.forEach((fn) => fn())
  }

  let rafId: number | null = null
  const observer = new MutationObserver(() => {
    if (rafId !== null) return
    rafId = requestAnimationFrame(() => {
      rafId = null
      runInjections()
    })
  })

  observer.observe(document.body, { childList: true, subtree: true })
  logger.log('[rgp:cs] MutationObserver started for rows')
  requestAnimationFrame(runInjections)

  return () => {
    observer.disconnect()
    if (rafId !== null) window.cancelAnimationFrame(rafId)
    cleanupDragHandles()
  }
}

function injectCheckboxes() {
  for (const row of document.querySelectorAll<HTMLElement>('[role="row"]')) {
    if (row.getAttribute(INJECTED_ATTR)) continue
    const itemId = extractItemId(row)
    if (!itemId) continue

    const gridcells = row.querySelectorAll<HTMLElement>(':scope > [role="gridcell"]')
    if (gridcells.length < 2) continue
    const titleCell = gridcells[1]

    if (row.querySelector('.rgp-cb-cell')) {
      row.setAttribute(INJECTED_ATTR, itemId)
      continue
    }

    row.setAttribute(INJECTED_ATTR, itemId)

    const checkboxCell = document.createElement('div')
    checkboxCell.className = 'rgp-cb-cell'
    row.insertBefore(checkboxCell, titleCell)
    checkboxPortalStore.addRow(checkboxCell, itemId)
  }
}

function isGroupHeaderRow(element: Element): boolean {
  return (
    element.matches('[role="row"]') &&
    extractItemId(element) === null &&
    element.querySelector('[role="cell"], [role="rowheader"]') !== null &&
    element.querySelector('[role="columnheader"]') === null &&
    element.querySelector('input[role="combobox"]') === null
  )
}

function getGroupItemIds(groupHeaderElement: Element): string[] {
  const allGroupHeaders = Array.from(document.querySelectorAll<HTMLElement>('[role="row"]')).filter(
    isGroupHeaderRow,
  )
  const index = allGroupHeaders.indexOf(groupHeaderElement as HTMLElement)
  const nextHeader = allGroupHeaders[index + 1] ?? null

  return Array.from(document.querySelectorAll<HTMLElement>(`[role="row"][${INJECTED_ATTR}]`))
    .filter((row) => {
      const afterThis = !!(
        groupHeaderElement.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING
      )
      if (!afterThis) return false
      if (!nextHeader) return true
      return !!(nextHeader.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_PRECEDING)
    })
    .map((row) => getStoredItemId(row)!)
}

function injectGroupCheckboxes() {
  for (const row of document.querySelectorAll<HTMLElement>('[role="row"]')) {
    if (!isGroupHeaderRow(row)) continue
    if (row.getAttribute(GROUP_CB_ATTR)) continue

    row.setAttribute(GROUP_CB_ATTR, '1')

    const cell = row.querySelector<HTMLElement>('[role="cell"], [role="rowheader"]')
    if (!cell) continue

    const expandButton = cell.querySelector<HTMLElement>('button')
    const checkboxSpan = document.createElement('span')
    checkboxSpan.className = 'rgp-gcb-inline'
    checkboxSpan.dataset.rgpGcbKey = String(groupKeyCounter++)

    if (expandButton && expandButton.nextSibling) {
      cell.insertBefore(checkboxSpan, expandButton.nextSibling)
    } else {
      cell.insertBefore(checkboxSpan, cell.firstChild)
    }

    checkboxPortalStore.addGroup(checkboxSpan, () => getGroupItemIds(row))
  }
}

function injectSelectAllCheckbox() {
  for (const row of document.querySelectorAll<HTMLElement>('[role="row"]')) {
    if (row.getAttribute(COLHDR_ATTR)) continue
    const firstColumnHeader = row.querySelector<HTMLElement>('[role="columnheader"]')
    if (!firstColumnHeader) continue

    row.setAttribute(COLHDR_ATTR, '1')

    const checkboxCell = document.createElement('div')
    checkboxCell.className = 'rgp-cb-cell rgp-cb-cell--header'
    row.insertBefore(checkboxCell, firstColumnHeader)
    checkboxPortalStore.addSelectAll(checkboxCell)
    break
  }
}
