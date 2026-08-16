import React from 'react'
import type { ContentScriptContext } from 'wxt/utils/content-script-context'
import { Box } from '@primer/react'
import { ProjectContextCard } from '@/features/project-context-card'
import { createLightDomUi, type FeatureUi } from '@/lib/shadow-ui-factory'
import { INJECTED_ATTR, queryFirst } from '@/lib/project-table-dom'
import type { ProjectContext } from '@/lib/github-project'
import { logger } from '@/lib/debug-logger'

/** Set by createLightDomUi on its host, and how we detect an existing mount. */
const HOST_ATTR = 'data-rgp-light-dom'
const UI_NAME = 'project-context'

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
  // last-resort: find any issue link outside table rows, then walk up to a pane container
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

const findPanel = (): Element | null => queryFirst(document, PANEL_SELECTORS) ?? findPanelBroad()

const findSidebar = (panel: Element): Element | null => queryFirst(panel, SIDEBAR_SELECTORS)

function extractItemIdFromPanel(panel: Element): string | null {
  // try to read a data-rgp-cb attr from the currently-active table row
  const activeRow = document.querySelector<HTMLElement>(
    `[role="row"][${INJECTED_ATTR}][data-rgp-active]`,
  )
  if (activeRow) {
    const id = activeRow.getAttribute(INJECTED_ATTR)
    if (id && id !== '1') return id
  }

  // fallback: find any issue link inside the panel to extract an item ID
  const issueLink = panel.querySelector<HTMLAnchorElement>('a[href*="/issues/"]')
  if (issueLink) {
    const m = issueLink.href.match(/\/issues\/(\d+)/)
    if (m) return `issue-${m[1]}`
  }

  return null
}

let currentPanel: Element | null = null
let currentUi: FeatureUi | null = null

function mountCard(
  ctx: ContentScriptContext,
  panel: Element,
  projectContext: ProjectContext,
): void {
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

  // avoid double-mounting
  if (sidebar.querySelector(`[${HOST_ATTR}="${UI_NAME}"]`)) return

  // light DOM, not shadow: the card sits inside GitHub's own sidebar and
  // inherits its layout. createLightDomUi brings the StyleSheetManager,
  // ThemeProvider and ErrorBoundary this used to assemble by hand.
  currentUi = createLightDomUi(ctx, {
    name: UI_NAME,
    anchor: sidebar,
    append: 'first',
    component: (
      <Box sx={{ mb: 3 }}>
        <ProjectContextCard itemId={itemId} projectContext={projectContext} />
      </Box>
    ),
  })
  currentUi.mount()
  logger.log('[rgp:cs] issue-detail: mounted ProjectContextCard for', itemId)
}

function unmountCard(): void {
  currentUi?.destroy()
  currentUi = null
  currentPanel = null
}

export function setupIssueDetailInjector(
  ctx: ContentScriptContext,
  projectContext: ProjectContext,
): () => void {
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
      // new panel appeared
      unmountCard()
      currentPanel = panel
      mountCard(ctx, panel, projectContext)
    } else if (!panel && currentPanel) {
      // panel closed
      unmountCard()
    }
  }

  // watch for DOM additions/removals AND attribute changes (GitHub may show/hide pane via class toggle)
  const observer = new MutationObserver(scheduleCheck)
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'class', 'hidden', 'aria-hidden', 'open'],
  })

  // watch for GitHub's client-side URL changes (?pane=issue indicates a pane is open)
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

  // handle click on table rows to capture which item was activated
  const handleRowClick = (e: Event) => {
    const row = (e.target as Element).closest<HTMLElement>(`[role="row"][${INJECTED_ATTR}]`)
    if (!row) return
    document
      .querySelectorAll(`[role="row"][data-rgp-active]`)
      .forEach((r) => r.removeAttribute('data-rgp-active'))
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
