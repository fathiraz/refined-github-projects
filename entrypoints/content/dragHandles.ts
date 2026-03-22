import { draggable, dropTargetForElements, monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import { attachClosestEdge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge'
import { selectionStore } from '../../lib/selectionStore'
import { sendMessage } from '../../lib/messages'

const HANDLE_ATTR = 'data-rgp-dnd'

// Registry of cleanup fns keyed by row element
const cleanupMap = new WeakMap<Element, () => void>()

// Drop indicator overlay (singleton, appended to document.body)
let dropLine: HTMLDivElement | null = null

// Debounce state for drop-line hide (prevents flicker on cross-cell transitions)
let activeDropRowId: string | null = null
let hideLineTimer: ReturnType<typeof setTimeout> | null = null

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
  const rows = document.querySelectorAll<HTMLElement>('[role="row"][data-rgp-cb]:not([data-rgp-dnd])')

  for (const row of rows) {
    const domId = row.getAttribute('data-rgp-cb')!
    const cbCell = row.querySelector<HTMLElement>('.rgp-cb-cell')
    if (!cbCell) continue

    // Inject handle icon into the cb cell
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
    cbCell.insertBefore(handle, cbCell.firstChild)

    // --- Draggable ---
    const cleanupDraggable = draggable({
      element: cbCell,
      dragHandle: handle,
      getInitialData: () => {
        const sel = selectionStore.getAll()
        return {
          domId,
          // Snapshot selection at drag-start so monitor.onDrop uses the same state
          selectedIds: selectionStore.isSelected(domId) ? sel : [],
        }
      },
      onDragStart() {
        const selected = selectionStore.getAll()
        const isMulti = selected.includes(domId) && selected.length > 1
        if (isMulti) {
          for (const selId of selected) {
            if (selId === domId) continue
            const el = document.querySelector<HTMLElement>(`[data-rgp-cb="${selId}"]`)
            if (el) el.style.opacity = '0.35'
          }
        }
      },
      onDrop() {
        for (const el of document.querySelectorAll<HTMLElement>('[data-rgp-cb]')) {
          el.style.opacity = ''
        }
        const line = getOrCreateDropLine()
        line.style.display = 'none'
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

    // --- Drop targets (all gridcells cover the full row width) ---
    // GitHub Projects rows use display:contents — no bounding rect on the row itself.
    // Register on ALL gridcells so the entire visible row width is droppable.
    const gridcells = Array.from(row.querySelectorAll<HTMLElement>('[role="gridcell"]'))
    const dropEls = [cbCell, ...gridcells]

    const cleanupDrops = dropEls.map(dropEl =>
      dropTargetForElements({
        element: dropEl,
        getData({ input, element }) {
          return attachClosestEdge({ domId }, { input, element, allowedEdges: ['top', 'bottom'] })
        },
        onDrag({ self }) {
          // Cancel any pending hide from a cross-cell transition within the same row
          if (hideLineTimer) { clearTimeout(hideLineTimer); hideLineTimer = null }
          activeDropRowId = domId

          const edge = extractClosestEdge(self.data)
          const firstCell = dropEls[0]
          const rect = firstCell.getBoundingClientRect()
          const container = row.closest<HTMLElement>('[role="grid"], [role="rowgroup"]')
          const lineWidth = container ? container.getBoundingClientRect().width : rect.width
          const line = getOrCreateDropLine()
          const top = edge === 'top' ? rect.top : rect.bottom
          Object.assign(line.style, {
            display: 'block',
            top: `${top - 1}px`,
            left: `${container?.getBoundingClientRect().left ?? rect.left}px`,
            width: `${lineWidth}px`,
          })
        },
        onDragLeave() {
          // Debounce: only hide if cursor truly left the row, not just crossed a cell boundary
          hideLineTimer = setTimeout(() => {
            if (activeDropRowId === domId) {
              activeDropRowId = null
              getOrCreateDropLine().style.display = 'none'
            }
          }, 50)
        },
      })
    )

    const cleanupDrop = () => cleanupDrops.forEach(fn => fn())

    row.setAttribute(HANDLE_ATTR, '1')
    cleanupMap.set(row, () => { cleanupDraggable(); cleanupDrop() })
  }
}

// Global drop monitor — fires when any drop completes on our drop targets
let monitorCleanup: (() => void) | null = null

export function initDragAndDrop(
  projectId: string,
  owner: string,
  number: number,
  isOrg: boolean,
) {
  if (monitorCleanup) monitorCleanup()

  monitorCleanup = monitorForElements({
    onDrop({ source, location }) {
      const line = getOrCreateDropLine()
      line.style.display = 'none'

      const target = location.current.dropTargets[0]
      if (!target) return

      const draggedDomId = source.data.domId as string
      const targetDomId = target.data.domId as string
      const edge = extractClosestEdge(target.data)

      if (!draggedDomId || !targetDomId) return

      const snapshotIds = (source.data.selectedIds as string[] | undefined) ?? []
      const selectedDomIds = snapshotIds.length > 1 ? snapshotIds : [draggedDomId]

      // For single-item drag only: skip if target is the dragged item itself (no visual movement)
      if (selectedDomIds.length === 1 && draggedDomId === targetDomId) return

      const allRows = getAllSortedRows()
      const targetIdx = allRows.findIndex(r => r.getAttribute('data-rgp-cb') === targetDomId)

      let insertAfterDomId: string
      if (edge === 'top') {
        if (targetIdx === 0) {
          insertAfterDomId = ''
        } else {
          const above = allRows[targetIdx - 1]
          insertAfterDomId = above.getAttribute('data-rgp-cb') ?? ''
        }
      } else {
        insertAfterDomId = targetDomId
      }

      // Skip true no-ops: single item dropped immediately after itself
      if (selectedDomIds.length === 1 && selectedDomIds.includes(insertAfterDomId)) return

      const count = selectedDomIds.length
      const allDomIds = getAllSortedRows()
        .map(r => r.getAttribute('data-rgp-cb') ?? '')
        .filter(Boolean)

      sendMessage('bulkReorderByPosition', {
        selectedDomIds,
        insertAfterDomId,
        allDomIds,
        projectId,
        owner,
        number,
        isOrg,
        label: `Move · ${count} item${count !== 1 ? 's' : ''}`,
      })
    },
  })
}

export function cleanupDragHandles() {
  monitorCleanup?.()
  monitorCleanup = null
  dropLine?.remove()
  dropLine = null
  activeDropRowId = null
  if (hideLineTimer) { clearTimeout(hideLineTimer); hideLineTimer = null }
}
