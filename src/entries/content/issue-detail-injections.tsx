import React from 'react'
import ReactDOM from 'react-dom/client'
import { StyleSheetManager } from 'styled-components'
import isPropValid from '@emotion/is-prop-valid'
import { ShadowThemeProvider } from '../../components/ui/shadow-theme-provider'
import { ProjectContextCard } from '../../components/hierarchy/project-context-card'
import { INJECTED_ATTR } from '../../lib/project-table-dom'
import type { ProjectContext } from '../../lib/github-project'
import { logger } from '../../lib/debug-logger'

const HOST_ID = 'rgp-project-context-host'

/** Selectors tried in order to find the issue detail slide-out panel */
const PANEL_SELECTORS = [
  '[data-testid="bento-sidebar-overlay"]',
  '[data-testid="issue-detail-container"]',
  '[data-testid="memex-item-detail"]',
  '[data-component="pane"]',
  'dialog[open]:has(a[href*="/issues/"])',
  '[role="dialog"]:has(a[href*="/issues/"])',
  'div[class*="Pane"]:has(aside)',
  '[class*="IssueDetail"]',
  '[id*="issue-detail"]',
]

/** Selectors tried in order to find the sidebar within the panel */
const SIDEBAR_SELECTORS = [
  'aside',
  '[data-testid="issue-sidebar"]',
  '[class*="sidebar"]',
  '[class*="Sidebar"]',
]

function findPanelBroad(): Element | null {
  // Last-resort: find any issue link outside table rows, then walk up to a pane container
  try {
    const link = document.querySelector<HTMLAnchorElement>(
      'a[href*="/issues/"]:not([role="row"] *):not(header *):not(nav *)',
    )
    if (!link) return null
    const container = link.closest(
      '[role="dialog"], [data-testid*="pane"], [data-testid*="overlay"], [data-testid*="sidebar"], [data-testid*="detail"]',
    )
    return container ?? null
  } catch {
    return null
  }
}

function findPanel(): Element | null {
  for (const sel of PANEL_SELECTORS) {
    try {
      const el = document.querySelector(sel)
      if (el) return el
    } catch {
      // Selector may not be valid in this browser; skip
    }
  }
  return findPanelBroad()
}

function findSidebar(panel: Element): Element | null {
  for (const sel of SIDEBAR_SELECTORS) {
    try {
      const el = panel.querySelector(sel)
      if (el) return el
    } catch {
      // skip
    }
  }
  return null
}

function extractItemIdFromPanel(panel: Element): string | null {
  // Try to read a data-rgp-cb attr from the currently-active table row
  const activeRow = document.querySelector<HTMLElement>(`[role="row"][${INJECTED_ATTR}][data-rgp-active]`)
  if (activeRow) {
    const id = activeRow.getAttribute(INJECTED_ATTR)
    if (id && id !== '1') return id
  }

  // Fallback: find any issue link inside the panel to extract an item ID
  const issueLink = panel.querySelector<HTMLAnchorElement>('a[href*="/issues/"]')
  if (issueLink) {
    const m = issueLink.href.match(/\/issues\/(\d+)/)
    if (m) return `issue-${m[1]}`
  }

  return null
}

let currentPanel: Element | null = null
let currentRoot: ReturnType<typeof ReactDOM.createRoot> | null = null

function mountCard(panel: Element, projectContext: ProjectContext): void {
  const itemId = extractItemIdFromPanel(panel)
  if (!itemId) {
    logger.log('[rgp:cs] issue-detail: could not extract item ID from panel')
    return
  }

  const sidebar = findSidebar(panel)
  if (!sidebar) {
    logger.log('[rgp:cs] issue-detail: sidebar not found in panel')
    return
  }

  // Avoid double-mounting
  if (sidebar.querySelector(`#${HOST_ID}`)) return

  const host = document.createElement('div')
  host.id = HOST_ID
  host.style.cssText = 'margin-bottom: 16px;'
  sidebar.prepend(host)

  currentRoot = ReactDOM.createRoot(host)
  currentRoot.render(
    <StyleSheetManager shouldForwardProp={isPropValid}>
      <ShadowThemeProvider>
        <ProjectContextCard itemId={itemId} projectContext={projectContext} />
      </ShadowThemeProvider>
    </StyleSheetManager>,
  )
  logger.log('[rgp:cs] issue-detail: mounted ProjectContextCard for', itemId)
}

function unmountCard(): void {
  if (currentRoot) {
    currentRoot.unmount()
    currentRoot = null
  }
  document.getElementById(HOST_ID)?.remove()
  currentPanel = null
}

export function setupIssueDetailInjector(projectContext: ProjectContext): () => void {
  let rafId: number | null = null

  const scheduleCheck = () => {
    if (rafId !== null) return
    rafId = requestAnimationFrame(() => {
      rafId = null
      check()
    })
  }

  const check = () => {
    const panel = findPanel()

    if (panel && panel !== currentPanel) {
      // New panel appeared
      unmountCard()
      currentPanel = panel
      mountCard(panel, projectContext)
    } else if (!panel && currentPanel) {
      // Panel closed
      unmountCard()
    }
  }

  // Watch for DOM additions/removals AND attribute changes (GitHub may show/hide pane via class toggle)
  const observer = new MutationObserver(scheduleCheck)
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'class', 'hidden', 'aria-hidden', 'open'],
  })

  // Watch for GitHub's client-side URL changes (?pane=issue indicates a pane is open)
  window.addEventListener('popstate', scheduleCheck)
  const origPush = history.pushState.bind(history)
  const origReplace = history.replaceState.bind(history)
  history.pushState = (...args: Parameters<typeof history.pushState>) => {
    origPush(...args)
    scheduleCheck()
  }
  history.replaceState = (...args: Parameters<typeof history.replaceState>) => {
    origReplace(...args)
    scheduleCheck()
  }

  // Handle click on table rows to capture which item was activated
  const handleRowClick = (e: Event) => {
    const row = (e.target as Element).closest<HTMLElement>(`[role="row"][${INJECTED_ATTR}]`)
    if (!row) return
    document.querySelectorAll(`[role="row"][data-rgp-active]`).forEach((r) => r.removeAttribute('data-rgp-active'))
    row.setAttribute('data-rgp-active', '1')
  }

  document.addEventListener('click', handleRowClick, true)

  scheduleCheck()

  return () => {
    observer.disconnect()
    window.removeEventListener('popstate', scheduleCheck)
    history.pushState = origPush
    history.replaceState = origReplace
    document.removeEventListener('click', handleRowClick, true)
    if (rafId !== null) window.cancelAnimationFrame(rafId)
    unmountCard()
  }
}
