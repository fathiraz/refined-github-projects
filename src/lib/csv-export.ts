import { selectionStore } from './selection-store'
import { INJECTED_ATTR } from './dom-utils'

export function exportSelectedToCSV(): void {
  const ids = selectionStore.getAll()
  if (ids.length === 0) return

  // Column headers — skip col 0 (injected checkbox cell has no header text)
  const headerEls = document.querySelectorAll<HTMLElement>('[role="columnheader"]')
  const headers = [...headerEls].slice(1).map(el => el.textContent?.trim() ?? '')

  // For each selected ID, scrape its row's gridcells
  const rows: string[][] = []
  for (const id of ids) {
    const row = document.querySelector<HTMLElement>(
      `[role="row"][${INJECTED_ATTR}="${CSS.escape(id)}"]`
    )
    if (!row) continue
    const cells = [...row.querySelectorAll<HTMLElement>('[role="gridcell"]')]
      .slice(1) // skip injected checkbox cell
      .map(el => el.textContent?.trim().replace(/\n+/g, ' ') ?? '')
    rows.push(cells)
  }

  // Build CSV — double-quote every field, escape internal quotes
  function csvCell(v: string) { return `"${v.replace(/"/g, '""')}"` }
  const lines = [
    headers.map(csvCell).join(','),
    ...rows.map(cells => cells.map(csvCell).join(',')),
  ]
  const csv = lines.join('\r\n')

  // Trigger download
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `github-projects-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
