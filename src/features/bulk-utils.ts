import { selectionStore } from '@/lib/selection-store'
import { INJECTED_ATTR } from '@/lib/project-table-dom'

export function exportSelectedToCSV(): void {
  const ids = selectionStore.getAll()
  if (ids.length === 0) return

  // Column headers — skip col 0 (injected checkbox cell has no header text)
  const headerEls = document.querySelectorAll<HTMLElement>('[role="columnheader"]')
  const headers = [...headerEls].slice(1).map((el) => el.textContent?.trim() ?? '')

  // For each selected ID, scrape its row's gridcells
  const rows: string[][] = []
  for (const id of ids) {
    const row = document.querySelector<HTMLElement>(
      `[role="row"][${INJECTED_ATTR}="${CSS.escape(id)}"]`,
    )
    if (!row) continue
    const cells = [...row.querySelectorAll<HTMLElement>('[role="gridcell"]')]
      .slice(1) // skip injected checkbox cell
      .map((el) => el.textContent?.trim().replace(/\n+/g, ' ') ?? '')
    rows.push(cells)
  }

  // Build CSV — double-quote every field, escape internal quotes
  function csvCell(v: string) {
    return `"${v.replace(/"/g, '""')}"`
  }
  const lines = [
    headers.map(csvCell).join(','),
    ...rows.map((cells) => cells.map(csvCell).join(',')),
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

export function flyToTracker(startRect: DOMRect): void {
  const orb = document.createElement('div')
  const size = 22
  const startX = startRect.left + startRect.width / 2 - size / 2
  const startY = startRect.top + startRect.height / 2 - size / 2
  // Target: center of QueueTracker card (right: 20, bottom: 96, width: 320px)
  const targetX = window.innerWidth - 20 - 160 - size / 2
  const targetY = window.innerHeight - 96 - 44 - size / 2

  orb.style.cssText = `
    position: fixed;
    left: ${startX}px; top: ${startY}px;
    width: ${size}px; height: ${size}px;
    border-radius: 50%;
    background: var(--color-accent-emphasis, #0969da);
    z-index: 999999;
    pointer-events: none;
    box-shadow: 0 2px 8px rgba(9,105,218,0.45);
  `
  document.body.appendChild(orb)

  const dx = targetX - startX
  const dy = targetY - startY

  orb.animate(
    [
      { transform: 'translate(0,0) scale(1)', opacity: 1, offset: 0 },
      {
        transform: `translate(${dx * 0.6}px,${dy * 0.25}px) scale(0.75)`,
        opacity: 0.9,
        offset: 0.45,
      },
      { transform: `translate(${dx}px,${dy}px) scale(0.3)`, opacity: 0, offset: 1 },
    ],
    { duration: 520, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' },
  ).onfinish = () => orb.remove()
}
