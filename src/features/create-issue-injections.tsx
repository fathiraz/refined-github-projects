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
import { queryFirst } from '@/lib/project-table-dom'
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

// The dialog's metadata sidebar renders the currently-picked assignees/labels
// as tokens once selected via their own pickers. Best-effort read: if none of
// these match, we simply omit assignees/labels from the create payload rather
// than failing the create.
const ASSIGNEES_CONTAINER_SELECTORS = ['[data-testid="assignees-select-menu"]']
const LABELS_CONTAINER_SELECTORS = ['[data-testid="labels-select-menu"]']

// The board's native "+ Add item" omnibar row that (when typed into) spawns
// this dialog with its text as the initial title. Closing the dialog through
// our intercepted Create button skips GitHub's own handler, which normally
// clears this input — so we clear it ourselves.
const OMNIBAR_INPUT_SELECTORS = ['[class*="omnibarInput"]']

// After a "Create more" cycle, GitHub's dialog considers its form dirty and,
// on Close, shows this native confirmation instead of closing directly. RGP's
// own Close click doesn't know about it, so the dialog appears stuck.
const CONFIRM_DISCARD_DIALOG_SELECTOR = '[data-component="ConfirmationDialog"]'
const CONFIRM_DISCARD_BUTTON_SELECTOR = 'button[data-variant="danger"]'
const CONFIRM_DISCARD_TEXT_PATTERN = /discard/i

// The board re-renders once the new item lands (the background's
// create→attach→field-update chain, several seconds after dispatch), and that
// re-render restores the omnibar's original draft text. Re-clear it on every
// mutation `check()` sees for this long after a create, rather than guessing
// a fixed delay.
const OMNIBAR_WATCH_MS = 15000

// No repo-picker exists inside the dialog — the repo is fixed before it opens
// (via a `#repo` hashtag in the board's inline combobox) and only surfaces
// inside the dialog as static heading text: "Create new issue in owner/repo".
const REPO_HEADING_SELECTORS = ['h1']
const REPO_HEADING_PATTERN = /in\s+([^/\s]+)\/([^/\s]+)\s*$/i

const findDialog = (): Element | null => queryFirst(document, MODAL_SELECTORS)

const findFooter = (dialog: Element): Element | null => queryFirst(dialog, FOOTER_SELECTORS)

const readInput = (
  dialog: Element,
  selectors: string[],
): HTMLInputElement | HTMLTextAreaElement | null =>
  queryFirst<HTMLInputElement | HTMLTextAreaElement>(dialog, selectors)

function readTitle(dialog: Element): string {
  return readInput(dialog, TITLE_INPUT_SELECTORS)?.value.trim() ?? ''
}

function readBody(dialog: Element): string {
  return readInput(dialog, BODY_INPUT_SELECTORS)?.value ?? ''
}

function readCreateMore(dialog: Element): boolean {
  return dialog.querySelector<HTMLInputElement>(CREATE_MORE_SELECTOR)?.checked ?? false
}

function readAssignees(dialog: Element): string[] {
  for (const sel of ASSIGNEES_CONTAINER_SELECTORS) {
    const container = dialog.querySelector(sel)
    if (!container) continue
    const logins = Array.from(container.querySelectorAll<HTMLImageElement>('img[alt]'))
      .map((img) => img.alt.replace(/^@/, '').trim())
      .filter(Boolean)
    if (logins.length) return logins
  }
  return []
}

function readLabels(dialog: Element): string[] {
  for (const sel of LABELS_CONTAINER_SELECTORS) {
    const container = dialog.querySelector(sel)
    if (!container) continue
    const names = Array.from(container.querySelectorAll('[data-testid="label-token"]'))
      .map((el) => el.textContent?.trim() ?? '')
      .filter(Boolean)
    if (names.length) return names
  }
  return []
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

  const assignees = readAssignees(dialog)
  const labels = readLabels(dialog)

  return {
    projectId,
    repoOwner: repo.owner,
    repoName: repo.name,
    title,
    body: readBody(dialog),
    createMore: readCreateMore(dialog),
    updates,
    fieldMeta,
    ...(assignees.length ? { assignees } : {}),
    ...(labels.length ? { labels } : {}),
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
  let omnibarWatchUntil: number | null = null
  let omnibarSeedText: string | null = null

  function readOmnibarValue(): string {
    for (const sel of OMNIBAR_INPUT_SELECTORS) {
      const el = document.querySelector<HTMLInputElement>(sel)
      if (el) return el.value
    }
    return ''
  }

  function clearOmnibar(): void {
    for (const sel of OMNIBAR_INPUT_SELECTORS) {
      document.querySelectorAll<HTMLInputElement>(sel).forEach(clearInput)
    }
  }

  // Same as clearOmnibar, but only touches inputs whose value still matches
  // the draft text captured at dispatch time — a value the user has since
  // typed over is left alone instead of being wiped by the re-render watch.
  function clearOmnibarIfUnchanged(seed: string): void {
    for (const sel of OMNIBAR_INPUT_SELECTORS) {
      document.querySelectorAll<HTMLInputElement>(sel).forEach((el) => {
        if (el.value === seed) clearInput(el)
      })
    }
  }

  // GitHub's "Discard changes?" confirmation (if our Close click triggers one)
  // mounts asynchronously — it isn't in the DOM yet on the same tick as the
  // click. Poll a few animation frames instead of checking once.
  async function dismissDiscardConfirm(timeoutMs = 5000): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const dialog = document.querySelector<HTMLElement>(CONFIRM_DISCARD_DIALOG_SELECTOR)
      if (dialog && CONFIRM_DISCARD_TEXT_PATTERN.test(dialog.textContent ?? '')) {
        const btn = dialog.querySelector<HTMLButtonElement>(CONFIRM_DISCARD_BUTTON_SELECTOR)
        if (btn) {
          btn.click()
          return
        }
      }
      await new Promise((resolve) => requestAnimationFrame(resolve))
    }
  }

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

      // Clear title + body before closing (or before staging the next issue) so
      // GitHub's dirty-form guard never sees unsaved content and pops its own
      // "Discard changes?" confirmation on close.
      const titleEl = readInput(dialog, TITLE_INPUT_SELECTORS)
      const bodyEl = readInput(dialog, BODY_INPUT_SELECTORS)
      if (titleEl) clearInput(titleEl)
      if (bodyEl) clearInput(bodyEl)

      if (!payload.createMore) {
        createIssueFieldsStore.clearAll()
        omnibarSeedText = readOmnibarValue()
        dialog.querySelector<HTMLButtonElement>('[data-component="Dialog.CloseButton"]')?.click()
        // Fallback in case some other field still marks the form dirty.
        await dismissDiscardConfirm()
        clearOmnibar()
        // The board re-renders once the new item lands (async, seconds later),
        // and that re-render restores the omnibar's original draft text once.
        // check() re-clears it on every subsequent mutation until this expires,
        // but only if the user hasn't since typed a new draft into it.
        omnibarWatchUntil = Date.now() + OMNIBAR_WATCH_MS
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
    if (omnibarWatchUntil !== null) {
      if (Date.now() > omnibarWatchUntil) {
        omnibarWatchUntil = null
        omnibarSeedText = null
      } else if (omnibarSeedText !== null) {
        clearOmnibarIfUnchanged(omnibarSeedText)
      }
    }

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
