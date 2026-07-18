// SPA-aware injector: mounts the "Fields ▾" chip into GitHub's native
// "Create new issue" modal and, on native Create, applies staged custom-field
// values to the newly created board item via the existing bulkUpdate pipeline.
// Cloned from `issue-detail-injections.tsx`'s observer/history-patch pattern.

import React from 'react'
import type { ContentScriptContext } from 'wxt/utils/content-script-context'
import type { ProjectContext } from '@/lib/github-project'
import type { ProjectData } from '@/features/bulk-edit-utils'
import type { BulkUpdateMessageData } from '@/lib/messages'
import { createFeatureUi, type FeatureUi } from '@/lib/shadow-ui-factory'
import { CreateIssueFieldsChip } from '@/features/create-issue-field-flyout'
import { createIssueFieldsStore } from '@/lib/create-issue-fields-store'
import { getAllInjectedItemIds, getTitlesForItemIds } from '@/lib/project-table-dom'
import {
  BULK_EDIT_CONCURRENT_MESSAGE,
  BULK_EDIT_DISPATCH_FAILED_MESSAGE,
  canApply,
  serializeValue,
} from '@/features/bulk-edit-flyout-helpers'
import { sendMessage } from '@/lib/messages'
import { queueStore } from '@/lib/queue-store'
import { toastStore } from '@/lib/toast-store'
import { logger } from '@/lib/debug-logger'

const CHIP_TESTID = 'rgp-create-issue-fields-chip'
const CREATE_BUTTON_SELECTOR = '[data-testid="create-issue-button"]'
const CREATE_MORE_SELECTOR = '[data-testid="create-more-check"]'
const WATCH_TIMEOUT_MS = 8000

/** Selectors tried in order to find the "Create new issue" dialog. */
const MODAL_SELECTORS = [
  '[data-component="Dialog"][class*="CreateIssueDialogContainer"]',
  'div[role="dialog"]:has([data-testid="create-issue-button"])',
]

/** Selectors tried in order to find the metadata footer row inside the dialog. */
const FOOTER_SELECTORS = [
  '[class*="MetadataFooterContainer"]',
  '[data-testid="create-issue-footer"]',
]

/** Selectors tried in order to find the issue title input inside the dialog. */
const TITLE_INPUT_SELECTORS = [
  'input[name="issue_title"]',
  'input[name="issue[title]"]',
  '[data-testid="issue-title-input"]',
  'input[aria-label="Title"]',
]

function findDialog(): Element | null {
  for (const sel of MODAL_SELECTORS) {
    try {
      const el = document.querySelector(sel)
      if (el) return el
    } catch {
      // selector may not be valid in this browser; skip
    }
  }
  return null
}

function findFooter(dialog: Element): Element | null {
  for (const sel of FOOTER_SELECTORS) {
    try {
      const el = dialog.querySelector(sel)
      if (el) return el
    } catch {
      // skip
    }
  }
  return null
}

function readTitle(dialog: Element): string {
  for (const sel of TITLE_INPUT_SELECTORS) {
    const el = dialog.querySelector<HTMLInputElement | HTMLTextAreaElement>(sel)
    if (el) return el.value.trim()
  }
  return ''
}

function readCreateMore(dialog: Element): boolean {
  return dialog.querySelector<HTMLInputElement>(CREATE_MORE_SELECTOR)?.checked ?? false
}

function buildBulkUpdatePayload(itemId: string, projectId: string): BulkUpdateMessageData | null {
  const updates: BulkUpdateMessageData['updates'] = []
  const fieldMeta: NonNullable<BulkUpdateMessageData['fieldMeta']> = {}

  for (const { field, value } of createIssueFieldsStore.snapshot().values()) {
    if (!canApply(value)) continue
    const payload = serializeValue(value)
    if (payload === null) continue
    updates.push({ fieldId: field.id, value: { ...payload, dataType: field.dataType } })
    fieldMeta[field.id] = {
      name: field.name,
      options: field.options,
      iterations: field.configuration?.iterations,
    }
  }

  if (updates.length === 0) return null
  return { itemIds: [itemId], projectId, updates, fieldMeta }
}

async function dispatchBulkUpdate(payload: BulkUpdateMessageData): Promise<void> {
  if (queueStore.getActiveCount() >= 3) {
    toastStore.show({ type: 'warning', message: BULK_EDIT_CONCURRENT_MESSAGE })
    return
  }
  try {
    const result = await sendMessage('bulkUpdate', payload)
    if (!result.ok) {
      toastStore.show({ type: 'error', message: BULK_EDIT_DISPATCH_FAILED_MESSAGE })
    }
  } catch {
    toastStore.show({ type: 'error', message: BULK_EDIT_DISPATCH_FAILED_MESSAGE })
  }
}

interface WatchState {
  beforeIds: Set<string>
  typedTitle: string
  createMore: boolean
  projectId: string
}

export function setupCreateIssueFieldInjector(
  ctx: ContentScriptContext,
  projectContext: ProjectContext,
  getFields: () => Promise<ProjectData>,
): () => void {
  let currentDialog: Element | null = null
  let currentUi: FeatureUi | null = null
  let mounting = false
  let rafId: number | null = null
  let watchState: WatchState | null = null
  let watchObserver: MutationObserver | null = null
  let watchTimeoutId: ReturnType<typeof setTimeout> | null = null

  function stopWatcher(): void {
    if (watchTimeoutId !== null) {
      clearTimeout(watchTimeoutId)
      watchTimeoutId = null
    }
    watchObserver?.disconnect()
    watchObserver = null
  }

  function finishWatch(matchedId: string | null): void {
    const state = watchState
    stopWatcher()
    watchState = null
    if (!state) return

    if (matchedId) {
      const payload = buildBulkUpdatePayload(matchedId, state.projectId)
      if (payload) void dispatchBulkUpdate(payload)
    } else {
      // ponytail: capture is view-dependent — a new item created outside the
      // current filtered/paginated board view never appears in the injected
      // rows we scan, so it can't be matched here. Upgrade path if this bites:
      // resolve the new item via an announcement→number→databaseId query
      // instead of diffing the DOM.
      toastStore.show({
        type: 'warning',
        message: "Issue created outside the current board view — custom fields weren't applied.",
      })
    }

    if (!state.createMore) createIssueFieldsStore.clearAll()
  }

  function checkForNewRow(): void {
    if (!watchState) return
    const currentIds = getAllInjectedItemIds()
    const newIds = currentIds.filter((id) => !watchState!.beforeIds.has(id))
    if (newIds.length === 0) return

    let matchedId: string | null = newIds[0] ?? null
    if (watchState.typedTitle) {
      const titled = getTitlesForItemIds(newIds)
      const match = titled.find((t) => t.title === watchState!.typedTitle)
      if (match) matchedId = match.id
    }

    finishWatch(matchedId)
  }

  function startWatch(dialog: Element): void {
    if (createIssueFieldsStore.count() === 0) return
    stopWatcher()

    watchState = {
      beforeIds: new Set(getAllInjectedItemIds()),
      typedTitle: readTitle(dialog),
      createMore: readCreateMore(dialog),
      projectId: projectContext.projectId,
    }

    watchObserver = new MutationObserver(checkForNewRow)
    watchObserver.observe(document.body, { childList: true, subtree: true })
    watchTimeoutId = setTimeout(() => finishWatch(null), WATCH_TIMEOUT_MS)
  }

  async function mountChip(dialog: Element): Promise<void> {
    if (mounting || currentUi) return
    const footer = findFooter(dialog)
    if (!footer) return
    if (footer.querySelector(`[data-testid="${CHIP_TESTID}"]`)) return

    mounting = true
    try {
      const ui = await createFeatureUi(ctx, {
        name: 'create-issue-fields',
        component: <CreateIssueFieldsChip getFields={getFields} />,
        anchor: footer,
        append: 'last',
        portalCompat: true,
      })
      ui.mount()
      currentUi = ui
    } finally {
      mounting = false
    }
  }

  function unmountChip(): void {
    currentUi?.destroy()
    currentUi = null
  }

  function teardownForDialog(): void {
    unmountChip()
    createIssueFieldsStore.clearAll()
    stopWatcher()
    watchState = null
    currentDialog = null
  }

  const scheduleCheck = () => {
    if (rafId !== null) return
    rafId = requestAnimationFrame(() => {
      rafId = null
      check()
    })
  }

  function check(): void {
    const dialog = findDialog()

    if (dialog && dialog !== currentDialog) {
      if (currentDialog) teardownForDialog()
      currentDialog = dialog
      void mountChip(dialog)
    } else if (!dialog && currentDialog) {
      teardownForDialog()
    } else if (dialog && !currentUi && !mounting) {
      // GitHub re-rendered the footer row without swapping the dialog itself
      void mountChip(dialog)
    }
  }

  const handleDialogClick = (e: Event) => {
    if (!currentDialog) return
    const target = e.target as Element
    if (!target.closest?.(CREATE_BUTTON_SELECTOR)) return
    logger.log('[rgp:cs] create-issue: Create clicked, starting capture watcher')
    startWatch(currentDialog)
  }

  const observer = new MutationObserver(scheduleCheck)
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'class', 'hidden', 'open'],
  })

  document.addEventListener('click', handleDialogClick, true)
  scheduleCheck()

  return () => {
    observer.disconnect()
    document.removeEventListener('click', handleDialogClick, true)
    if (rafId !== null) window.cancelAnimationFrame(rafId)
    teardownForDialog()
  }
}
