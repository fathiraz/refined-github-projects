// drag-and-drop reorder for project table rows.

import {
  draggable,
  dropTargetForElements,
  monitorForElements,
} from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import {
  attachClosestEdge,
  extractClosestEdge,
} from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge'
import { INJECTED_ATTR } from '@/lib/project-table-dom'
import { selectionStore } from '@/lib/selection-store'
import { sendMessage } from '@/lib/messages'

const HANDLE_ATTR = 'data-rgp-dnd'

const cleanupMap = new Map<HTMLElement, () => void>()

let dropLine: HTMLDivElement | null = null
let activeDropRowId: string | null = null
let hideLineTimer: ReturnType<typeof setTimeout> | null = null
let monitorCleanup: (() => void) | null = null

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

export function injectDragHandles() {
  const rows = document.querySelectorAll<HTMLElement>(
    `[role="row"][${INJECTED_ATTR}]:not([${HANDLE_ATTR}])`,
  )

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
          const selectedRow = document.querySelector<HTMLElement>(
            `[${INJECTED_ATTR}="${selectedId}"]`,
          )
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

export function initDragAndDrop(projectId: string, owner: string, number: number, isOrg: boolean) {
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
      const targetIndex = allRows.findIndex(
        (row) => row.getAttribute(INJECTED_ATTR) === targetDomId,
      )
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
