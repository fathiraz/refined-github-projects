// SPA-aware injector: mounts the "Fields ▾" chip into GitHub's native
// "Create new issue" modal and intercepts the native Create button — RGP
// creates the issue itself (createIssue → addProjectV2ItemById → per-field
// updateProjectV2ItemFieldValue), reading ids from the API responses instead
// of racing to find the new board row.
// Cloned from `issue-detail-injections.tsx`'s observer/history-patch pattern.

import React from 'react'
import type { ContentScriptContext } from 'wxt/utils/content-script-context'
import type { ProjectData } from '@/features/bulk-edit-utils'
import type { CreateIssueWithFieldsMessageData } from '@/lib/messages'
import { createFeatureUi, type FeatureUi } from '@/lib/shadow-ui-factory'
import { CreateIssueFieldsChip } from '@/features/create-issue-field-flyout'
import { createIssueFieldsStore } from '@/lib/create-issue-fields-store'
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

const MODAL_SELECTORS = [
  '[data-component="Dialog"][class*="CreateIssueDialogContainer"]',
  'div[role="dialog"]:has([data-testid="create-issue-button"])',
]

const FOOTER_SELECTORS = [
  '[class*="MetadataFooterContainer"]',
  '[data-testid="create-issue-footer"]',
]

const TITLE_INPUT_SELECTORS = [
  'input[name="issue_title"]',
  'input[name="issue[title]"]',
  '[data-testid="issue-title-input"]',
  'input[aria-label="Title"]',
  'input[aria-label="Add a title"]',
]

const BODY_INPUT_SELECTORS = ['textarea[aria-label="Markdown value"]']

// No repo-picker exists inside the dialog — the repo is fixed before it opens
// (via a `#repo` hashtag in the board's inline combobox) and only surfaces
// inside the dialog as static heading text: "Create new issue in owner/repo".
const REPO_HEADING_SELECTORS = ['h1']
const REPO_HEADING_PATTERN = /in\s+([^/\s]+)\/([^/\s]+)\s*$/i

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

function readInput(
  dialog: Element,
  selectors: string[],
): HTMLInputElement | HTMLTextAreaElement | null {
  for (const sel of selectors) {
    const el = dialog.querySelector<HTMLInputElement | HTMLTextAreaElement>(sel)
    if (el) return el
  }
  return null
}

function readTitle(dialog: Element): string {
  return readInput(dialog, TITLE_INPUT_SELECTORS)?.value.trim() ?? ''
}

function readBody(dialog: Element): string {
  return readInput(dialog, BODY_INPUT_SELECTORS)?.value ?? ''
}

function readCreateMore(dialog: Element): boolean {
  return dialog.querySelector<HTMLInputElement>(CREATE_MORE_SELECTOR)?.checked ?? false
}

function readRepo(dialog: Element): { owner: string; name: string } | null {
  for (const sel of REPO_HEADING_SELECTORS) {
    const el = dialog.querySelector(sel)
    const match = el?.textContent?.match(REPO_HEADING_PATTERN)
    if (match) return { owner: match[1], name: match[2] }
  }
  return null
}

// Sets the value via the native setter so React's change tracking sees the
// update, then dispatches an `input` event so controlled inputs re-render.
function clearInput(el: HTMLInputElement | HTMLTextAreaElement): void {
  const proto =
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  setter?.call(el, '')
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

function buildCreatePayload(
  dialog: Element,
  projectId: string,
): CreateIssueWithFieldsMessageData | null {
  const title = readTitle(dialog)
  if (!title) return null
  const repo = readRepo(dialog)
  if (!repo) {
    logger.warn('[rgp:cs] create-issue: could not read repo from dialog heading')
    return null
  }

  const updates: CreateIssueWithFieldsMessageData['updates'] = []
  const fieldMeta: NonNullable<CreateIssueWithFieldsMessageData['fieldMeta']> = {}
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

  return {
    projectId,
    repoOwner: repo.owner,
    repoName: repo.name,
    title,
    body: readBody(dialog),
    createMore: readCreateMore(dialog),
    updates,
    fieldMeta,
  }
}

export function setupCreateIssueFieldInjector(
  ctx: ContentScriptContext,
  getFields: () => Promise<ProjectData>,
): () => void {
  let currentDialog: Element | null = null
  let currentUi: FeatureUi | null = null
  let mounting = false
  let rafId: number | null = null
  let intercepting = false

  async function handleCreate(dialog: Element): Promise<void> {
    if (intercepting) return
    intercepting = true
    try {
      const project = await getFields()
      const payload = buildCreatePayload(dialog, project.id)
      if (!payload) {
        toastStore.show({ type: 'error', message: BULK_EDIT_DISPATCH_FAILED_MESSAGE })
        return
      }

      if (queueStore.getActiveCount() >= 3) {
        toastStore.show({ type: 'warning', message: BULK_EDIT_CONCURRENT_MESSAGE })
        return
      }

      logger.log('[rgp:cs] create-issue: dispatching createIssueWithFields', payload.title)
      const result = await sendMessage('createIssueWithFields', payload)
      if (!result.ok) {
        toastStore.show({ type: 'error', message: BULK_EDIT_DISPATCH_FAILED_MESSAGE })
        return
      }

      if (payload.createMore) {
        const titleEl = readInput(dialog, TITLE_INPUT_SELECTORS)
        const bodyEl = readInput(dialog, BODY_INPUT_SELECTORS)
        if (titleEl) clearInput(titleEl)
        if (bodyEl) clearInput(bodyEl)
      } else {
        createIssueFieldsStore.clearAll()
        dialog.querySelector<HTMLButtonElement>('[data-component="Dialog.CloseButton"]')?.click()
      }
    } catch {
      toastStore.show({ type: 'error', message: BULK_EDIT_DISPATCH_FAILED_MESSAGE })
    } finally {
      intercepting = false
    }
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

  // Unmount the chip on a dialog-node swap (GitHub re-rendering the modal
  // while it stays open). Staged fields must survive this — only a genuine
  // dialog close should wipe them.
  function unmountForSwap(): void {
    unmountChip()
    currentDialog = null
  }

  function teardownForDialog(): void {
    unmountForSwap()
    createIssueFieldsStore.clearAll()
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
      if (currentDialog) unmountForSwap()
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
    if (!readTitle(currentDialog)) return // let native validation handle empty title
    e.preventDefault()
    e.stopImmediatePropagation()
    void handleCreate(currentDialog)
  }

  const handleDialogKeydown = (e: KeyboardEvent) => {
    if (!currentDialog) return
    if (e.key !== 'Enter' || !(e.metaKey || e.ctrlKey)) return
    if (!currentDialog.contains(e.target as Node)) return
    if (!readTitle(currentDialog)) return
    e.preventDefault()
    e.stopImmediatePropagation()
    void handleCreate(currentDialog)
  }

  const observer = new MutationObserver(scheduleCheck)
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'class', 'hidden', 'open'],
  })

  document.addEventListener('click', handleDialogClick, true)
  document.addEventListener('keydown', handleDialogKeydown, true)
  scheduleCheck()

  return () => {
    observer.disconnect()
    document.removeEventListener('click', handleDialogClick, true)
    document.removeEventListener('keydown', handleDialogKeydown, true)
    if (rafId !== null) window.cancelAnimationFrame(rafId)
    teardownForDialog()
  }
}
