/**
 * Shared DOM utilities for extracting data from GitHub Projects table rows.
 * Used by both the content script and React components (e.g. SelectAllCheckbox).
 */

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
export function extractItemId(row: Element | null): string | null {
  if (!row) return null
  const tag = row.getAttribute('data-hovercard-subject-tag')
  if (tag) return tag
  const issueLink = row.querySelector<HTMLAnchorElement>('a[href*="/issues/"]')
  if (issueLink) {
    const m = issueLink.href.match(/\/issues\/(\d+)/)
    if (m) return `issue-${m[1]}`
  }
  return null
}

/**
 * Read the item ID that was stored on the row at injection time.
 * This is always consistent with what RowCheckbox has in selectionStore.
 */
export function getStoredItemId(row: Element): string | null {
  const val = row.getAttribute(INJECTED_ATTR)
  return val && val !== '1' ? val : null
}

/**
 * Collect all item IDs from rows that have been checkbox-injected.
 * Reads the stored ID (not re-extracted) so it always matches selectionStore.
 */
export function getAllInjectedItemIds(): string[] {
  const rows = document.querySelectorAll<HTMLElement>(`[role="row"][${INJECTED_ATTR}]`)
  const ids: string[] = []
  for (const row of rows) {
    const id = getStoredItemId(row)
    if (id) ids.push(id)
  }
  return ids
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
  if ((el as Element).closest?.('[role="textbox"], [role="combobox"], [role="searchbox"]')) return true
  return false
}