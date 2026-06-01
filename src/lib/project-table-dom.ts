/**
 * Shared DOM utilities for extracting data from GitHub Projects table rows.
 * Used by both the content script and React components (e.g. SelectAllCheckbox).
 */
import type { ProjectItemDomId } from '@/lib/schemas-branded'
import { decodeProjectItemDomId } from '@/lib/schemas-decode'

/** Attribute set on rows that have been injected with a checkbox.
 *  The VALUE is the item ID stored at injection time, guaranteeing
 *  consistency between what RowCheckbox uses and what group/selectAll read.
 */
export const INJECTED_ATTR = 'data-rgp-cb'

/**
 * Extract a unique item identifier from a GitHub Projects table row.
 *
 * Strategies (in order):
 *  1. `data-hovercard-subject-tag` attribute on the row itself (board view).
 *  2. Scrape the issue number from an `<a href="…/issues/NNN">` link inside the row.
 */
export function extractItemId(row: Element | null): ProjectItemDomId | null {
  if (!row) return null
  const tag = row.getAttribute('data-hovercard-subject-tag')
  if (tag) return decodeProjectItemDomId(tag)
  const issueLink = row.querySelector<HTMLAnchorElement>('a[href*="/issues/"]')
  if (issueLink) {
    const m = issueLink.href.match(/\/issues\/(\d+)/)
    if (m) return decodeProjectItemDomId(`issue-${m[1]}`)
  }
  return null
}

/**
 * Read the item ID that was stored on the row at injection time.
 * This is always consistent with what RowCheckbox has in selectionStore.
 */
export function getStoredItemId(row: Element): ProjectItemDomId | null {
  const val = row.getAttribute(INJECTED_ATTR)
  return val && val !== '1' ? decodeProjectItemDomId(val) : null
}

/**
 * Collect all item IDs from rows that have been checkbox-injected.
 * Reads the stored ID (not re-extracted) so it always matches selectionStore.
 */
export function getAllInjectedItemIds(): ProjectItemDomId[] {
  const rows = document.querySelectorAll<HTMLElement>(`[role="row"][${INJECTED_ATTR}]`)
  const ids: ProjectItemDomId[] = []
  for (const row of rows) {
    const id = getStoredItemId(row)
    if (id) ids.push(id)
  }
  return ids
}

/**
 * Read the displayed title for a given row. Falls back to the row's primary
 * link text. Returns `null` if neither can be located.
 */
export function extractItemTitle(row: Element): string | null {
  const link = row.querySelector<HTMLAnchorElement>(
    'a[href*="/issues/"], a[href*="/pull/"], a[data-testid="issue-title-link"]',
  )
  const text = link?.textContent?.trim()
  return text && text.length > 0 ? text : null
}

/**
 * Resolve `{ id, title }` pairs for a set of selected item IDs by scanning
 * injected rows currently in the DOM. Missing rows are skipped (they may be
 * off-screen or virtualized).
 */
export function getTitlesForItemIds(
  itemIds: readonly string[],
): Array<{ id: string; title: string }> {
  if (itemIds.length === 0) return []
  const wanted = new Set(itemIds)
  const rows = document.querySelectorAll<HTMLElement>(`[role="row"][${INJECTED_ATTR}]`)
  const out: Array<{ id: string; title: string }> = []
  for (const row of rows) {
    const id = getStoredItemId(row)
    if (!id || !wanted.has(id)) continue
    const title = extractItemTitle(row)
    if (title) out.push({ id, title })
  }
  return out
}

/**
 * Per-item state read from the DOM at menu-open time. Best-effort: GitHub
 * Projects rows do not consistently expose pin/lock state, so anything we
 * cannot prove is reported as `unknown`. The `Mark ▾` flyout falls back to
 * showing both paired verbs (no count) when `unknownCount > 0` per design D6.
 */
export interface ItemStateSnapshot {
  openCount: number
  closedCount: number
  pinnedCount: number
  unpinnedCount: number
  lockedCount: number
  unlockedCount: number
  unknownCount: number
  /** Total number of IDs we attempted to resolve — sum of category counts is `<= total`. */
  total: number
}

/**
 * Scrape per-item state from injected rows. State icons emitted by GitHub
 * use `octicon-issue-{opened,closed,closed-completed}` / `octicon-git-pull-request*`
 * classes inside the status cell. Pin / lock state is not exposed reliably
 * in the row markup, so we report it as `unknown` (D6 fallback applies).
 */
export function getItemStateSnapshot(itemIds: readonly string[]): ItemStateSnapshot {
  const total = itemIds.length
  const snapshot: ItemStateSnapshot = {
    openCount: 0,
    closedCount: 0,
    pinnedCount: 0,
    unpinnedCount: 0,
    lockedCount: 0,
    unlockedCount: 0,
    unknownCount: 0,
    total,
  }
  if (total === 0) return snapshot

  const wanted = new Set(itemIds)
  const rows = document.querySelectorAll<HTMLElement>(`[role="row"][${INJECTED_ATTR}]`)
  const seen = new Set<string>()

  for (const row of rows) {
    const id = getStoredItemId(row)
    if (!id || !wanted.has(id) || seen.has(id)) continue
    seen.add(id)

    const status = readStatusFromRow(row)
    if (status === 'open') snapshot.openCount += 1
    else if (status === 'closed') snapshot.closedCount += 1
    else snapshot.unknownCount += 1

    // pin/lock are not surfaced in the row DOM — count as unknown for those
    // categories so the flyout shows both paired verbs.
    snapshot.unknownCount += 0
  }

  // any item id we could not locate in the current DOM is unknown
  snapshot.unknownCount += total - seen.size

  return snapshot
}

function readStatusFromRow(row: Element): 'open' | 'closed' | 'unknown' {
  const closedIcon = row.querySelector(
    '.octicon-issue-closed, .octicon-issue-closed-completed, .octicon-skip, .octicon-git-merge, .octicon-issue-completed',
  )
  if (closedIcon) return 'closed'
  const openIcon = row.querySelector(
    '.octicon-issue-opened, .octicon-git-pull-request, .octicon-git-pull-request-draft',
  )
  if (openIcon) return 'open'
  return 'unknown'
}

/**
 * Returns true if the event target is a focusable text-input element.
 * Used to suppress keyboard shortcuts while the user is typing.
 * Checks e.target (not document.activeElement) to handle Shadow DOM.
 */
export function isEditableTarget(el: EventTarget | null): boolean {
  if (!el || !(el instanceof Element)) return false
  const tag = (el as Element).tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if ((el as HTMLElement).isContentEditable) return true
  if ((el as Element).closest?.('[role="textbox"], [role="combobox"], [role="searchbox"]'))
    return true
  return false
}
