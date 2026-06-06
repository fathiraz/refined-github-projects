import React, { useEffect, useRef, useState } from 'react'
import { Box, Button, CounterLabel, Text } from '@primer/react'
import { KebabHorizontalIcon } from '@primer/octicons-react'
import Tippy from '@/ui/tooltip'
import { ensureTippyCss } from '@/lib/tippy-utils'
import { selectionStore } from '@/lib/selection-store'
import { getAllInjectedItemIds, getTitlesForItemIds } from '@/lib/project-table-dom'
import { shortcutRegistry, type ShortcutDefinition } from '@/lib/keyboard'
import { useBarKeyboardChords, type BarChordMap } from '@/lib/use-bar-keyboard-chords'
import { sendMessage } from '@/lib/messages'
import { queueStore } from '@/lib/queue-store'
import { exportSelectedToCSV } from '@/features/bulk-utils'
import type { ProjectData, ProjectField } from '@/features/bulk-edit-utils'
import type { ReorderOp } from '@/features/bulk-move-utils'
import { ListCheckIcon, TagIcon, XIcon } from '@/ui/icons'
import { primerCss } from '@/lib/primer-css-helper'
import { Z_OVERLAY } from '@/lib/z-index'
import { BulkActionsMenu } from '@/features/bulk-actions-menu'
import { BulkActionsModals } from '@/features/bulk-actions-modals'
import { BulkMarkFlyout, type MarkVerb } from '@/features/bulk-mark-flyout'
import { BulkEditFlyout } from '@/features/bulk-edit-flyout'
import { BulkRenameFlyout, type RenameFlyoutConfirm } from '@/features/bulk-rename-flyout'
import { BulkReorderFlyout } from '@/features/bulk-reorder-flyout'
import { BulkRandomAssignFlyout } from '@/features/bulk-random-assign-flyout'
import type { DistributionStrategy } from '@/features/bulk-random-assign-utils'

export type { ReorderOp } from '@/features/bulk-move-utils'

const RECENT_FIELDS_CAP = 3

/** Shared chip styling for the three top-level inline actions on the bar. */
const chipSx = primerCss.chipButton()

interface Props {
  projectId: string
  owner: string
  isOrg: boolean
  number: number
  getFields: () => Promise<ProjectData>
}

export function BulkActionsBar({ projectId, owner, isOrg, number, getFields }: Props) {
  ensureTippyCss()
  const [count, setCount] = useState(() => selectionStore.count())
  const [projectData, setProjectData] = useState<ProjectData | null>(null)
  const [firstRepoName, setFirstRepoName] = useState('')
  const [tokenStatusError, setTokenStatusError] = useState<string | null>(null)

  const [showDupModal, setShowDupModal] = useState(false)
  const actionsButtonRef = useRef<HTMLButtonElement | null>(null)
  const editFieldsChipRef = useRef<HTMLButtonElement | null>(null)
  const markChipRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement | null>(null)
  const recentFieldIdsRef = useRef<string[]>([])

  const [menuOpen, setMenuOpen] = useState(false)
  const [markOpen, setMarkOpen] = useState(false)
  const [editFieldsOpen, setEditFieldsOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [reorderOpen, setReorderOpen] = useState(false)
  const [randomAssignOpen, setRandomAssignOpen] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteItemTitles, setDeleteItemTitles] = useState<string[]>([])
  const [showTransferModal, setShowTransferModal] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const anyModalOpen = showDeleteModal || showTransferModal || showDupModal || showHelp
  const anyFlyoutOpen = editFieldsOpen || renameOpen || reorderOpen || randomAssignOpen || markOpen

  const resolvedProjectId = projectData?.id || projectId

  // selection subscription
  useEffect(() => {
    return selectionStore.subscribe(() => {
      const newCount = selectionStore.count()
      setCount(newCount)
      if (newCount === 0) {
        setMenuOpen(false)
        setShowDupModal(false)
        setShowDeleteModal(false)
        setShowTransferModal(false)
        setShowHelp(false)
        setMarkOpen(false)
        setEditFieldsOpen(false)
        setRenameOpen(false)
        setReorderOpen(false)
        setRandomAssignOpen(false)
      }
    })
  }, [])

  // click-outside for action menu
  useEffect(() => {
    if (!menuOpen) return
    function handleClick(e: MouseEvent) {
      const path = e.composedPath ? e.composedPath() : [e.target as Node]
      if (menuRef.current && !path.includes(menuRef.current)) setMenuOpen(false)
    }
    window.addEventListener('mousedown', handleClick)
    return () => window.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  // focus request from keyboard shortcut
  useEffect(() => {
    return selectionStore.onFocusRequest(() => {
      if (selectionStore.count() > 0) {
        actionsButtonRef.current?.focus()
        setMenuOpen(true)
      }
    })
  }, [])

  // ── Centralized keyboard shortcuts ─────────────────────────
  useEffect(() => {
    const ids: string[] = []
    const reg = (def: ShortcutDefinition) => {
      shortcutRegistry.register(def)
      ids.push(def.id)
    }

    // escape — always available
    reg({
      id: 'escape',
      key: 'Escape',
      modifiers: {},
      context: 'Global',
      label: 'Close / Deselect',
      allowInEditable: true,
      action: () => {
        if (anyModalOpen || anyFlyoutOpen) {
          setShowDupModal(false)
          setShowDeleteModal(false)
          setShowTransferModal(false)
          setShowHelp(false)
          setEditFieldsOpen(false)
          setRenameOpen(false)
          setReorderOpen(false)
          setRandomAssignOpen(false)
          setMarkOpen(false)
        } else if (selectionStore.count() > 0) {
          selectionStore.clear()
        }
      },
    })

    if (!anyModalOpen && !anyFlyoutOpen) {
      // select all — works even with zero selection
      reg({
        id: 'select-all',
        key: 'a',
        modifiers: { meta: true },
        context: 'Global',
        label: 'Select All',
        action: () => {
          const allIds = getAllInjectedItemIds()
          if (allIds.length > 0) {
            selectionStore.selectBatch(allIds)
          }
        },
      })
    }

    if (count > 0 && !anyModalOpen && !anyFlyoutOpen) {
      reg({
        id: 'help',
        key: '?',
        modifiers: { shift: true },
        context: 'Global',
        label: 'Keyboard Shortcuts',
        action: () => setShowHelp(true),
      })

      reg({
        id: 'focus-actions',
        key: 'b',
        modifiers: { meta: true, shift: true },
        context: 'Global',
        label: 'Focus Actions Menu',
        action: () => {
          selectionStore.requestFocus()
        },
      })

      reg({
        id: 'edit-fields',
        key: 'e',
        modifiers: { meta: true, shift: true },
        context: 'Table Selection',
        label: 'Edit Fields',
        action: () => {
          setMenuOpen(false)
          handleEditFields()
        },
      })

      reg({
        id: 'random-assign',
        key: 'a',
        modifiers: { meta: true, shift: true },
        context: 'Table Selection',
        label: 'Random Assign',
        action: handleRandomAssign,
      })

      reg({
        id: 'close-issues',
        key: 'x',
        modifiers: { meta: true, shift: true },
        context: 'Table Selection',
        label: 'Close Issues',
        action: () => runMarkVerb('close'),
      })

      reg({
        id: 'reopen-issues',
        key: 'o',
        modifiers: { meta: true, shift: true },
        context: 'Table Selection',
        label: 'Reopen Issues',
        action: () => runMarkVerb('reopen'),
      })

      reg({
        id: 'lock-conversations',
        key: 'l',
        modifiers: { meta: true, shift: true },
        context: 'Table Selection',
        label: 'Lock Conversations',
        action: () => runMarkVerb('lock'),
      })

      reg({
        id: 'pin-issues',
        key: 'f',
        modifiers: { meta: true, shift: true },
        context: 'Table Selection',
        label: 'Pin Issues',
        action: () => runMarkVerb('pin'),
      })

      reg({
        id: 'transfer-issues',
        key: 'm',
        modifiers: { meta: true, shift: true },
        context: 'Table Selection',
        label: 'Transfer Issues',
        action: handleTransfer,
      })

      reg({
        id: 'export-csv',
        key: 'v',
        modifiers: { meta: true, shift: true },
        context: 'Table Selection',
        label: 'Export CSV',
        action: () => {
          setMenuOpen(false)
          exportSelectedToCSV()
        },
      })

      reg({
        id: 'rename-titles',
        key: 'r',
        modifiers: { meta: true, shift: true },
        context: 'Table Selection',
        label: 'Rename Titles',
        action: handleBulkRename,
      })

      reg({
        id: 'reorder-items',
        key: 'j',
        modifiers: { meta: true, shift: true },
        context: 'Table Selection',
        label: 'Reorder Items',
        action: handleBulkReorder,
      })

      reg({
        id: 'delete-items',
        key: 'Backspace',
        modifiers: { meta: true, shift: true },
        context: 'Table Selection',
        label: 'Delete Items',
        action: handleBulkDelete,
      })

      if (count === 1) {
        reg({
          id: 'deep-duplicate',
          key: 'd',
          modifiers: { meta: true, shift: true },
          context: 'Table Selection',
          label: 'Deep Duplicate',
          action: () => {
            setMenuOpen(false)
            checkToken().then((ok) => ok && setShowDupModal(true))
          },
        })
      }

      reg({
        id: 'quick-edit',
        key: 'e',
        modifiers: {},
        context: 'Table Selection',
        label: 'Quick Edit',
        action: () => {
          setMenuOpen(false)
          handleEditFields()
        },
      })

      if (count === 1) {
        reg({
          id: 'quick-duplicate',
          key: 'd',
          modifiers: {},
          context: 'Table Selection',
          label: 'Duplicate',
          action: () => {
            setMenuOpen(false)
            checkToken().then((ok) => ok && setShowDupModal(true))
          },
        })
      }

      reg({
        id: 'quick-delete',
        key: 'Delete',
        modifiers: {},
        context: 'Table Selection',
        label: 'Delete Items',
        action: handleBulkDelete,
      })
    }

    return () => ids.forEach((id) => shortcutRegistry.unregister(id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, anyModalOpen, anyFlyoutOpen])

  // extract first repo name from dom issue links
  useEffect(() => {
    if (firstRepoName) return
    const links = document.querySelectorAll<HTMLAnchorElement>(
      'a[href*="/issues/"], a[href*="/pull/"]',
    )
    for (const link of links) {
      const match = link.href.match(/github\.com\/([^/]+)\/([^/]+)\/(issues|pull)\/\d+/)
      if (match && match[1] === owner) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- derive repo from DOM when selection changes
        setFirstRepoName(match[2])
        break
      }
    }
  }, [count, owner, firstRepoName])

  // load project fields on first selection
  useEffect(() => {
    if (count > 0 && !projectData) {
      getFields()
        .then((data) => {
          const existingTypes = data.fields.map((f) => f.dataType)
          const defaultFields: ProjectField[] = []
          if (!existingTypes.includes('TITLE')) {
            defaultFields.unshift({ id: '__title__', name: 'Title', dataType: 'TITLE' })
          }
          defaultFields.unshift(
            { id: '__body__', name: 'Description', dataType: 'BODY' },
            { id: '__comment__', name: 'Comment', dataType: 'COMMENT' },
          )
          if (!existingTypes.includes('ASSIGNEES')) {
            defaultFields.push({ id: '__assignees__', name: 'Assignees', dataType: 'ASSIGNEES' })
          }
          if (!existingTypes.includes('LABELS')) {
            defaultFields.push({ id: '__labels__', name: 'Labels', dataType: 'LABELS' })
          }
          if (
            isOrg &&
            !data.fields.some((f) => f.dataType === 'ISSUE_TYPE' || f.name.toLowerCase() === 'type')
          ) {
            defaultFields.push({ id: '__issue_type__', name: 'Type', dataType: 'ISSUE_TYPE' })
          }

          setProjectData({ ...data, fields: [...defaultFields, ...data.fields] })
        })
        .catch(() => {})
    }
  }, [count, projectData, getFields, isOrg])

  async function checkToken(): Promise<boolean> {
    for (let i = 0; i < 3; i++) {
      try {
        const status = await sendMessage('getPatStatus', {})
        setTokenStatusError(null)
        if (status.hasPat) return true
        setTokenStatusError('No GitHub token configured. Open the extension popup to add one.')
        return false
      } catch {
        if (i < 2) await new Promise((r) => setTimeout(r, 800))
      }
    }
    setTokenStatusError(
      'Could not verify GitHub access right now. Reload the page or reopen the extension.',
    )
    return false
  }

  function pushRecentField(fieldId: string) {
    const cur = recentFieldIdsRef.current
    const idx = cur.indexOf(fieldId)
    if (idx !== -1) cur.splice(idx, 1)
    cur.unshift(fieldId)
    if (cur.length > RECENT_FIELDS_CAP) cur.length = RECENT_FIELDS_CAP
  }

  async function handleEditFields() {
    if (queueStore.getActiveCount() >= 3) return
    if (!(await checkToken())) return
    setEditFieldsOpen(true)
  }

  async function handleRandomAssign() {
    setMenuOpen(false)
    if (!(await checkToken())) return
    setRandomAssignOpen(true)
  }

  function handleConfirmRandomAssign(
    assignments: Map<string, string[]>,
    strategy: DistributionStrategy,
  ) {
    const itemIds = selectionStore.getAll()

    const itemToAssignees = new Map<string, string[]>()
    for (const [assigneeId, assignedItemIds] of assignments.entries()) {
      for (const itemId of assignedItemIds) {
        const existing = itemToAssignees.get(itemId) || []
        itemToAssignees.set(itemId, [...existing, assigneeId])
      }
    }

    const assignmentsArray: Array<{ itemId: string; assigneeIds: string[] }> = []
    for (const [itemId, assigneeIds] of itemToAssignees.entries()) {
      assignmentsArray.push({ itemId, assigneeIds })
    }

    sendMessage('bulkRandomAssign', {
      itemIds,
      projectId: resolvedProjectId,
      assignments: assignmentsArray,
      strategy,
    })
    // §3 selection policy — Random Assign preserves selection.
  }

  async function runMarkVerb(verb: MarkVerb) {
    setMenuOpen(false)
    if (!(await checkToken())) return
    handleMarkVerb(verb)
  }

  async function handleTransfer() {
    setMenuOpen(false)
    if (!(await checkToken())) return
    setShowTransferModal(true)
  }

  function handleConfirmTransfer(
    targetRepoOwner: string,
    targetRepoName: string,
    eligibleItemIds?: readonly string[],
  ) {
    // §10.7 — when pre-flight returned an eligible subset, dispatch the
    // bulkTransfer against that subset only. Otherwise fall back to the full
    // selection (pre-flight may have been skipped or failed).
    const itemIds =
      eligibleItemIds && eligibleItemIds.length > 0 ? [...eligibleItemIds] : selectionStore.getAll()
    setShowTransferModal(false)
    sendMessage('bulkTransfer', {
      itemIds,
      projectId: resolvedProjectId,
      targetRepoOwner,
      targetRepoName,
    })
    selectionStore.clear()
  }

  async function handleBulkDelete() {
    setMenuOpen(false)
    if (!(await checkToken())) return
    const ids = selectionStore.getAll()
    const titles = getTitlesForItemIds(ids).map((entry) => entry.title)
    setDeleteItemTitles(titles)
    setShowDeleteModal(true)
  }

  function handleConfirmDelete() {
    const itemIds = selectionStore.getAll()
    setShowDeleteModal(false)
    sendMessage('bulkDelete', { itemIds, projectId: resolvedProjectId })
    selectionStore.clear()
  }

  async function handleBulkRename() {
    setMenuOpen(false)
    if (!(await checkToken())) return
    setRenameOpen(true)
  }

  function handleConfirmRename(renames: RenameFlyoutConfirm[]) {
    setRenameOpen(false)
    sendMessage('bulkRename', {
      itemIds: selectionStore.getAll(),
      projectId: resolvedProjectId,
      renames,
    })
    // §3 selection policy — Rename preserves selection.
  }

  async function handleBulkReorder() {
    setMenuOpen(false)
    if (!(await checkToken())) return
    setReorderOpen(true)
  }

  function handleConfirmReorder(ops: ReorderOp[], reorderProjectId: string, label: string) {
    setReorderOpen(false)
    sendMessage('bulkReorder', { projectId: reorderProjectId, reorderOps: ops, label })
    // §3 selection policy — Reorder preserves selection.
  }

  function handleMarkVerb(verb: MarkVerb) {
    setMarkOpen(false)
    const itemIds = selectionStore.getAll()
    switch (verb) {
      case 'close':
        sendMessage('bulkClose', {
          itemIds,
          projectId: resolvedProjectId,
          reason: 'COMPLETED',
        })
        selectionStore.clear()
        return
      case 'reopen':
        sendMessage('bulkOpen', { itemIds, projectId: resolvedProjectId })
        return
      case 'pin':
        sendMessage('bulkPin', { itemIds, projectId: resolvedProjectId })
        return
      case 'unpin':
        sendMessage('bulkUnpin', { itemIds, projectId: resolvedProjectId })
        return
      case 'lock':
        sendMessage('bulkLock', { itemIds, projectId: resolvedProjectId, lockReason: null })
        selectionStore.clear()
        return
      case 'unlock':
        sendMessage('bulkUnlock', { itemIds, projectId: resolvedProjectId })
        return
    }
  }

  const barChords: BarChordMap = {
    E: { action: () => handleEditFields() },
    R: { action: () => handleBulkRename() },
    O: { action: () => handleBulkReorder() },
    A: { action: () => handleRandomAssign() },
    M: { action: () => setMarkOpen((open) => !open) },
    C: { action: () => runMarkVerb('close') },
    P: { action: () => runMarkVerb('pin') },
    L: { action: () => runMarkVerb('lock') },
    T: { action: () => handleTransfer() },
    D: {
      action: () => {
        if (count === 1) {
          checkToken().then((ok) => ok && setShowDupModal(true))
        } else {
          handleBulkDelete()
        }
      },
    },
    '?': { action: () => setShowHelp(true) },
  }
  useBarKeyboardChords(barRef, barChords)

  if (count === 0) return null

  return (
    <>
      <BulkActionsModals
        count={count}
        projectIdResolved={resolvedProjectId}
        owner={owner}
        isOrg={isOrg}
        number={number}
        showDeleteModal={showDeleteModal}
        deleteItemTitles={deleteItemTitles}
        onCloseDeleteModal={() => setShowDeleteModal(false)}
        onConfirmDelete={handleConfirmDelete}
        showTransferModal={showTransferModal}
        onCloseTransferModal={() => setShowTransferModal(false)}
        onConfirmTransfer={handleConfirmTransfer}
        showDupModal={showDupModal}
        onCloseDupModal={() => {
          // §11.8 — Duplicate preserves selection.
          setShowDupModal(false)
        }}
        showHelp={showHelp}
        onCloseHelp={() => setShowHelp(false)}
      />

      {/* ── persistent bottom bar ── */}
      <Box
        ref={barRef}
        role="toolbar"
        aria-label="Bulk actions"
        tabIndex={-1}
        sx={{
          position: 'fixed',
          left: '50%',
          bottom: 4,
          transform: 'translateX(-50%)',
          width: 'min(760px, calc(100vw - 32px))',
          zIndex: Z_OVERLAY,
          bg: 'canvas.overlay',
          border: '1px solid',
          borderColor: 'border.default',
          borderRadius: 2,
          px: 4,
          py: 3,
          display: 'flex',
          flexDirection: 'column',
          gap: tokenStatusError ? 2 : 0,
          '&:focus-visible': {
            outline: '2px solid',
            outlineColor: 'accent.emphasis',
            outlineOffset: '2px',
          },
        }}
      >
        {tokenStatusError && (
          <Box
            sx={{
              px: 2,
              py: 1,
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'danger.muted',
              bg: 'danger.subtle',
              color: 'danger.fg',
              fontSize: 0,
              fontWeight: 'bold',
            }}
          >
            {tokenStatusError}
          </Box>
        )}

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          {/* Selection count + keyboard hints */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
            <CounterLabel
              scheme="primary"
              sx={{ fontSize: 1, fontWeight: 'bold', px: 2, py: '3px' }}
            >
              {count}
            </CounterLabel>
            <Text sx={{ fontSize: 0, color: 'fg.muted', flexShrink: 0 }}>
              {count === 1 ? 'item' : 'items'} selected
            </Text>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {(['⌘A', 'Esc'] as const).map((key) => (
                <Box
                  key={key}
                  as="kbd"
                  sx={{
                    fontSize: 0,
                    fontFamily: 'inherit',
                    fontWeight: 500,
                    px: '5px',
                    py: '1px',
                    borderRadius: 1,
                    bg: 'canvas.inset',
                    border: '1px solid',
                    borderColor: 'border.default',
                    color: 'fg.muted',
                    cursor: 'default',
                    lineHeight: 1.6,
                  }}
                >
                  {key}
                </Box>
              ))}
            </Box>
          </Box>

          <Box sx={{ width: '1px', height: 20, bg: 'border.default', flexShrink: 0 }} />

          {/* Edit fields chip */}
          <Button
            ref={editFieldsChipRef}
            variant="default"
            size="small"
            onClick={() => handleEditFields()}
            aria-keyshortcuts="E"
            aria-haspopup="dialog"
            aria-expanded={editFieldsOpen}
            data-testid="rgp-bar-edit-fields-chip"
            sx={chipSx}
          >
            <ListCheckIcon size={14} />
            <Text sx={{ fontSize: 1, fontWeight: 'semibold', ml: '6px' }}>Edit fields</Text>
            <Text sx={{ ml: '4px', color: 'fg.muted' }}>▾</Text>
          </Button>

          {/* Mark chip */}
          <Button
            ref={markChipRef}
            variant="default"
            size="small"
            onClick={() => setMarkOpen((o) => !o)}
            aria-keyshortcuts="M"
            aria-haspopup="dialog"
            aria-expanded={markOpen}
            data-testid="rgp-bar-mark-chip"
            sx={chipSx}
          >
            <TagIcon size={14} />
            <Text sx={{ fontSize: 1, fontWeight: 'semibold', ml: '6px' }}>Mark</Text>
            <Text sx={{ ml: '4px', color: 'fg.muted' }}>▾</Text>
          </Button>

          {/* Overflow chip */}
          <Box ref={menuRef} sx={{ position: 'relative' }}>
            <Button
              ref={actionsButtonRef}
              variant="default"
              size="small"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="More actions"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              data-testid="rgp-bar-overflow-chip"
              sx={chipSx}
            >
              <KebabHorizontalIcon size={14} />
            </Button>
            {menuOpen && (
              <BulkActionsMenu
                count={count}
                onRandomAssign={handleRandomAssign}
                onDeepDuplicate={() => checkToken().then((ok) => ok && setShowDupModal(true))}
                onRename={handleBulkRename}
                onReorder={handleBulkReorder}
                onTransfer={handleTransfer}
                onDelete={handleBulkDelete}
              />
            )}
          </Box>

          <BulkMarkFlyout
            anchorRef={markChipRef}
            open={markOpen}
            onClose={() => setMarkOpen(false)}
            itemIds={selectionStore.getAll()}
            onSelectVerb={handleMarkVerb}
          />

          <BulkEditFlyout
            anchorRef={editFieldsChipRef}
            open={editFieldsOpen}
            onClose={() => setEditFieldsOpen(false)}
            owner={owner}
            isOrg={isOrg}
            projectId={resolvedProjectId}
            itemIds={selectionStore.getAll()}
            fields={projectData?.fields ?? []}
            repoName={firstRepoName || undefined}
            recentFieldIds={recentFieldIdsRef.current}
            onAppliedField={pushRecentField}
          />

          <BulkRenameFlyout
            anchorRef={actionsButtonRef}
            open={renameOpen}
            onClose={() => setRenameOpen(false)}
            projectId={resolvedProjectId}
            itemIds={selectionStore.getAll()}
            count={count}
            onConfirm={handleConfirmRename}
          />

          <BulkReorderFlyout
            anchorRef={actionsButtonRef}
            open={reorderOpen}
            onClose={() => setReorderOpen(false)}
            projectId={resolvedProjectId}
            itemIds={selectionStore.getAll()}
            count={count}
            owner={owner}
            number={number}
            isOrg={isOrg}
            onConfirm={handleConfirmReorder}
          />

          <BulkRandomAssignFlyout
            anchorRef={actionsButtonRef}
            open={randomAssignOpen}
            onClose={() => setRandomAssignOpen(false)}
            owner={owner}
            repoName={firstRepoName}
            projectNumber={number}
            isOrg={isOrg}
            itemIds={selectionStore.getAll()}
            count={count}
            onConfirm={handleConfirmRandomAssign}
          />

          {/* spacer + clear */}
          <Box sx={{ flex: 1 }} />
          <Tippy content="Clear selection (Esc)" placement="top" delay={[400, 0]}>
            <Button
              variant="invisible"
              size="small"
              onClick={() => selectionStore.clear()}
              aria-label="Clear selection"
              sx={{
                color: 'fg.muted',
                boxShadow: 'none',
                p: '5px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
                '&:hover:not(:disabled)': {
                  transform: 'translateY(-1px)',
                  color: 'fg.default',
                  bg: 'canvas.subtle',
                },
                '&:active': {
                  transform: 'translateY(0)',
                  transition: '100ms',
                  color: 'fg.default',
                },
                '@media (prefers-reduced-motion: reduce)': {
                  transition: 'none',
                  '&:hover:not(:disabled)': { transform: 'none' },
                },
              }}
            >
              <XIcon size={14} />
            </Button>
          </Tippy>
        </Box>
      </Box>
    </>
  )
}
