import { INJECTED_ATTR } from '@/lib/project-table-dom'
import { registerHovercardTrigger } from '@/lib/hovercard-trigger-registry'
import type { ProjectContext } from '@/lib/github-project'

const HIER_ATTR = 'data-rgp-hier'

export function createHierarchyChipInjector(_projectContext: ProjectContext): () => void {
  const trackedRows = new Map<
    HTMLElement,
    { itemId: string; titleCell: HTMLElement; cleanup: () => void }
  >()

  return () => {
    const rows = document.querySelectorAll<HTMLElement>(`[role="row"][${INJECTED_ATTR}]`)
    const seenRows = new Set<HTMLElement>()

    const cleanupTrackedRow = (row: HTMLElement): void => {
      const tracked = trackedRows.get(row)
      if (!tracked) return
      tracked.cleanup()
      trackedRows.delete(row)
      row.removeAttribute(HIER_ATTR)
    }

    for (const row of rows) {
      const existing = trackedRows.get(row)
      const itemId = row.getAttribute(INJECTED_ATTR)
      if (!itemId || itemId === '1') {
        cleanupTrackedRow(row)
        continue
      }

      // GitHub Projects V2 uses role="rowheader" for the title cell; other columns use role="gridcell"
      const titleCell =
        row.querySelector<HTMLElement>(':scope > [role="rowheader"]') ??
        row.querySelector<HTMLElement>(':scope > [role="gridcell"]')
      if (!titleCell) {
        cleanupTrackedRow(row)
        continue
      }

      seenRows.add(row)
      if (existing && existing.itemId === itemId && existing.titleCell === titleCell) continue

      existing?.cleanup()
      trackedRows.set(row, {
        itemId,
        titleCell,
        cleanup: registerHovercardTrigger(itemId, titleCell),
      })
      row.setAttribute(HIER_ATTR, '1')
    }

    for (const [row, tracked] of trackedRows) {
      if (seenRows.has(row) && row.isConnected) continue
      tracked.cleanup()
      trackedRows.delete(row)
      row.removeAttribute(HIER_ATTR)
    }
  }
}
