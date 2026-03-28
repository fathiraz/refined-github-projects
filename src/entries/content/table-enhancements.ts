import { draggable, dropTargetForElements, monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import { attachClosestEdge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge'
import { extractItemId, getStoredItemId, INJECTED_ATTR } from '../../lib/project-table-dom'
import { checkboxPortalStore } from '../../lib/checkbox-portal-store'
import { selectionStore } from '../../lib/selection-store'
import { sendMessage } from '../../lib/messages'
import { logger } from '../../lib/debug-logger'
import { Z_TOOLTIP } from '../../lib/z-index'

const GROUP_CB_ATTR = 'data-rgp-gcb'
const COLHDR_ATTR = 'data-rgp-sall'
const HANDLE_ATTR = 'data-rgp-dnd'
const TABLE_ENHANCEMENT_STYLE_ID = 'rgp-table-enhancements-css'

const cleanupMap = new Map<HTMLElement, () => void>()

let groupKeyCounter = 0
let dropLine: HTMLDivElement | null = null
let activeDropRowId: string | null = null
let hideLineTimer: ReturnType<typeof setTimeout> | null = null
let monitorCleanup: (() => void) | null = null

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
  const allGroupHeaders = Array.from(document.querySelectorAll<HTMLElement>('[role="row"]')).filter(isGroupHeaderRow)
  const index = allGroupHeaders.indexOf(groupHeaderElement as HTMLElement)
  const nextHeader = allGroupHeaders[index + 1] ?? null

  return Array.from(document.querySelectorAll<HTMLElement>(`[role="row"][${INJECTED_ATTR}]`))
    .filter((row) => {
      const afterThis = !!(groupHeaderElement.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING)
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

function getOrCreateDropLine(): HTMLDivElement {
  if (dropLine) return dropLine

  dropLine = document.createElement('div')
  Object.assign(dropLine.style, {
    position: 'fixed',
    height: '2px',
    background: '#0969da',
    pointerEvents: 'none',
    zIndex: '10000',
    borderRadius: '1px',
    display: 'none',
    boxShadow: '0 0 0 1px rgba(9,105,218,0.3)',
    transition: 'top 60ms ease',
  })
  document.body.appendChild(dropLine)
  return dropLine
}

function getAllSortedRows(): Element[] {
  return Array.from(document.querySelectorAll('[data-rgp-cb]'))
}

function injectDragHandles() {
  const rows = document.querySelectorAll<HTMLElement>(`[role="row"][${INJECTED_ATTR}]:not([${HANDLE_ATTR}])`)

  for (const row of rows) {
    const domId = row.getAttribute(INJECTED_ATTR)
    if (!domId) continue

    const checkboxCell = row.querySelector<HTMLElement>('.rgp-cb-cell')
    if (!checkboxCell) continue

    const handle = document.createElement('div')
    handle.className = 'rgp-dnd-handle'
    handle.setAttribute('aria-label', 'Drag to reorder')
    handle.setAttribute('data-tooltip', 'Drag to reorder')
    handle.title = 'Drag to reorder'
    handle.innerHTML = `<svg width="12" height="16" viewBox="0 0 12 16" fill="none" style="display:block">
      <circle cx="4" cy="4" r="1.2" fill="currentColor"/>
      <circle cx="4" cy="8" r="1.2" fill="currentColor"/>
      <circle cx="4" cy="12" r="1.2" fill="currentColor"/>
      <circle cx="8" cy="4" r="1.2" fill="currentColor"/>
      <circle cx="8" cy="8" r="1.2" fill="currentColor"/>
      <circle cx="8" cy="12" r="1.2" fill="currentColor"/>
    </svg>`
    Object.assign(handle.style, {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '16px',
      height: '18px',
      cursor: 'grab',
      color: 'var(--fgColor-muted, var(--color-fg-muted, #57606a))',
      flexShrink: '0',
    })
    checkboxCell.insertBefore(handle, checkboxCell.firstChild)

    const cleanupDraggable = draggable({
      element: checkboxCell,
      dragHandle: handle,
      getInitialData: () => {
        const selectedIds = selectionStore.getAll()
        return {
          domId,
          selectedIds: selectionStore.isSelected(domId) ? selectedIds : [],
        }
      },
      onDragStart() {
        const selectedIds = selectionStore.getAll()
        const isMulti = selectedIds.includes(domId) && selectedIds.length > 1
        if (!isMulti) return

        for (const selectedId of selectedIds) {
          if (selectedId === domId) continue
          const selectedRow = document.querySelector<HTMLElement>(`[${INJECTED_ATTR}="${selectedId}"]`)
          if (selectedRow) selectedRow.style.opacity = '0.35'
        }
      },
      onDrop() {
        for (const element of document.querySelectorAll<HTMLElement>(`[${INJECTED_ATTR}]`)) {
          element.style.opacity = ''
        }
        getOrCreateDropLine().style.display = 'none'
      },
      onGenerateDragPreview({ nativeSetDragImage }) {
        const count = selectionStore.isSelected(domId) ? selectionStore.count() : 1
        const pill = document.createElement('div')
        pill.textContent = `Moving ${count} item${count !== 1 ? 's' : ''}`
        Object.assign(pill.style, {
          background: '#0969da',
          color: '#fff',
          fontSize: '12px',
          fontWeight: '600',
          padding: '4px 10px',
          borderRadius: '20px',
          whiteSpace: 'nowrap',
          position: 'fixed',
          top: '-200px',
          left: '-200px',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        })
        document.body.appendChild(pill)
        nativeSetDragImage?.(pill, -8, pill.offsetHeight / 2)
        requestAnimationFrame(() => document.body.removeChild(pill))
      },
    })

    const gridcells = Array.from(row.querySelectorAll<HTMLElement>('[role="gridcell"]'))
    const dropTargets = [checkboxCell, ...gridcells]

    const cleanupDrops = dropTargets.map((dropTarget) =>
      dropTargetForElements({
        element: dropTarget,
        getData({ input, element }) {
          return attachClosestEdge({ domId }, { input, element, allowedEdges: ['top', 'bottom'] })
        },
        onDrag({ self }) {
          if (hideLineTimer) {
            clearTimeout(hideLineTimer)
            hideLineTimer = null
          }
          activeDropRowId = domId

          const edge = extractClosestEdge(self.data)
          const firstCell = dropTargets[0]
          const rect = firstCell.getBoundingClientRect()
          const container = row.closest<HTMLElement>('[role="grid"], [role="rowgroup"]')
          const containerRect = container?.getBoundingClientRect()
          const line = getOrCreateDropLine()
          const top = edge === 'top' ? rect.top : rect.bottom
          Object.assign(line.style, {
            display: 'block',
            top: `${top - 1}px`,
            left: `${containerRect?.left ?? rect.left}px`,
            width: `${containerRect?.width ?? rect.width}px`,
          })
        },
        onDragLeave() {
          hideLineTimer = setTimeout(() => {
            if (activeDropRowId !== domId) return
            activeDropRowId = null
            getOrCreateDropLine().style.display = 'none'
          }, 50)
        },
      }),
    )

    row.setAttribute(HANDLE_ATTR, '1')
    cleanupMap.set(row, () => {
      cleanupDraggable()
      cleanupDrops.forEach((cleanup) => cleanup())
      handle.remove()
      row.removeAttribute(HANDLE_ATTR)
    })
  }
}

export function initDragAndDrop(
  projectId: string,
  owner: string,
  number: number,
  isOrg: boolean,
) {
  if (monitorCleanup) monitorCleanup()

  monitorCleanup = monitorForElements({
    onDrop({ source, location }) {
      getOrCreateDropLine().style.display = 'none'

      const target = location.current.dropTargets[0]
      if (!target) return

      const draggedDomId = source.data.domId as string | undefined
      const targetDomId = target.data.domId as string | undefined
      const edge = extractClosestEdge(target.data)
      if (!draggedDomId || !targetDomId) return

      const snapshotIds = (source.data.selectedIds as string[] | undefined) ?? []
      const selectedDomIds = snapshotIds.length > 1 ? snapshotIds : [draggedDomId]
      if (selectedDomIds.length === 1 && draggedDomId === targetDomId) return

      const allRows = getAllSortedRows()
      const targetIndex = allRows.findIndex((row) => row.getAttribute(INJECTED_ATTR) === targetDomId)
      let insertAfterDomId = targetDomId

      if (edge === 'top') {
        if (targetIndex === 0) {
          insertAfterDomId = ''
        } else {
          const aboveRow = allRows[targetIndex - 1]
          insertAfterDomId = aboveRow?.getAttribute(INJECTED_ATTR) ?? ''
        }
      }

      if (selectedDomIds.length === 1 && selectedDomIds.includes(insertAfterDomId)) return

      const allDomIds = getAllSortedRows()
        .map((row) => row.getAttribute(INJECTED_ATTR) ?? '')
        .filter(Boolean)

      sendMessage('bulkReorderByPosition', {
        selectedDomIds,
        insertAfterDomId,
        allDomIds,
        projectId,
        owner,
        number,
        isOrg,
        label: `Move · ${selectedDomIds.length} item${selectedDomIds.length !== 1 ? 's' : ''}`,
      })
    },
  })
}

export function cleanupDragHandles() {
  for (const cleanup of cleanupMap.values()) {
    cleanup()
  }
  cleanupMap.clear()

  monitorCleanup?.()
  monitorCleanup = null
  dropLine?.remove()
  dropLine = null
  activeDropRowId = null

  if (hideLineTimer) {
    clearTimeout(hideLineTimer)
    hideLineTimer = null
  }
}
