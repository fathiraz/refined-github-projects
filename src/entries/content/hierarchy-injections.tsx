import React from 'react'
import ReactDOM from 'react-dom/client'
import { StyleSheetManager } from 'styled-components'
import isPropValid from '@emotion/is-prop-valid'
import { ShadowThemeProvider } from '../../components/ui/shadow-theme-provider'
import { RowHoverCard } from '../../components/hierarchy/hierarchy-chip-tooltip'
import { INJECTED_ATTR } from '../../lib/project-table-dom'
import type { ProjectContext } from '../../lib/github-project'

const HIER_ATTR = 'data-rgp-hier'

/** Maps hostSpan → titleCell so the React component can use titleCell as the Tippy trigger target */
const titleCellMap = new WeakMap<HTMLElement, HTMLElement>()

export function createHierarchyChipInjector(projectContext: ProjectContext): () => void {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        const span = entry.target as HTMLElement
        const row = span.closest<HTMLElement>(`[${INJECTED_ATTR}]`)
        if (!row) continue
        const itemId = row.getAttribute(INJECTED_ATTR)
        if (!itemId || itemId === '1') continue

        // Mark as mounted so we don't re-mount on subsequent observer ticks
        if (span.getAttribute('data-rgp-hier-mounted')) continue
        span.setAttribute('data-rgp-hier-mounted', '1')

        const titleCell = titleCellMap.get(span)
        if (!titleCell) continue

        observer.unobserve(span)

        ReactDOM.createRoot(span).render(
          <StyleSheetManager shouldForwardProp={isPropValid}>
            <ShadowThemeProvider>
              <RowHoverCard
                itemId={itemId}
                projectContext={projectContext}
                titleCell={titleCell}
              />
            </ShadowThemeProvider>
          </StyleSheetManager>,
        )
      }
    },
    { threshold: 0.1 },
  )

  return () => {
    const rows = document.querySelectorAll<HTMLElement>(
      `[role="row"][${INJECTED_ATTR}]:not([${HIER_ATTR}])`,
    )

    for (const row of rows) {
      const itemId = row.getAttribute(INJECTED_ATTR)
      if (!itemId || itemId === '1') continue

      // GitHub Projects V2 uses role="rowheader" for the title cell; other columns use role="gridcell"
      const titleCell =
        row.querySelector<HTMLElement>(':scope > [role="rowheader"]') ??
        row.querySelector<HTMLElement>(':scope > [role="gridcell"]')
      if (!titleCell) continue

      row.setAttribute(HIER_ATTR, '1')

      const hostSpan = document.createElement('span')
      hostSpan.className = 'rgp-hier-host'
      titleCell.appendChild(hostSpan)

      // Store the titleCell reference so the IntersectionObserver callback can pass it as a prop
      titleCellMap.set(hostSpan, titleCell)

      // Defer React mount until row enters viewport via IntersectionObserver
      observer.observe(hostSpan)
    }
  }
}
