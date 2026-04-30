import React, { useEffect, useRef, useState } from 'react'
import { Box, Button, CounterLabel, Text } from '@primer/react'
import Tippy from '@/ui/tooltip'
import { ensureTippyCss } from '@/lib/tippy-utils'
import { selectionStore } from '@/lib/selection-store'
import { getAllInjectedItemIds } from '@/lib/project-table-dom'
import { shortcutRegistry, isMac, type ShortcutDefinition } from '@/lib/keyboard'
import { sendMessage, type BulkEditRelationshipsUpdate } from '@/lib/messages'
import { queueStore } from '@/lib/queue-store'
import { exportSelectedToCSV, flyToTracker } from '@/features/bulk-utils'
import type {
  ProjectData,
  ProjectField,
  RelationshipSelectionState,
  WizardStep,
} from '@/features/bulk-edit-modal'
import type { ReorderOp } from '@/features/bulk-move-modal'
import { ListCheckIcon, XIcon } from '@/ui/icons'
import { Z_OVERLAY } from '@/lib/z-index'
import {
  createEmptyRelationshipSelection,
  createEmptyRelationshipUpdates,
  hasRelationshipOperations,
} from '@/features/bulk-actions-utils'
import { BulkActionsMenu } from '@/features/bulk-actions-menu'
import { BulkActionsModals } from '@/features/bulk-actions-modals'

export type { ReorderOp } from '@/features/bulk-move-modal'

interface Props {
  projectId: string
  owner: string
  isOrg: boolean
  number: number
  getFields: () => Promise<ProjectData>
}

type ModalStep = 'CLOSED' | WizardStep

export function BulkActionsBar({ projectId, owner, isOrg, number, getFields }: Props) {
  ensureTippyCss()
  const [count, setCount] = useState(() => selectionStore.count())
  const [projectData, setProjectData] = useState<ProjectData | null>(null)
  const [firstRepoName, setFirstRepoName] = useState('')
  const [tokenStatusError, setTokenStatusError] = useState<string | null>(null)

  const [step, setStep] = useState<ModalStep>('CLOSED')
  const [selectedFields, setSelectedFields] = useState<ProjectField[]>([])
  const [fieldValues, setFieldValues] = useState<Record<string, unknown>>({})
  const [relationshipUpdates, setRelationshipUpdates] = useState<BulkEditRelationshipsUpdate>(
    createEmptyRelationshipUpdates(),
  )
  const [relationshipSelection, setRelationshipSelection] = useState<RelationshipSelectionState>(
    createEmptyRelationshipSelection(),
  )
  const [bulkUpdateValidationErrors, setBulkUpdateValidationErrors] = useState<string[]>([])
  const [concurrentError, setConcurrentError] = useState(false)
  const [showDupModal, setShowDupModal] = useState(false)
  const applyBtnRef = useRef<HTMLButtonElement | null>(null)
  const actionsButtonRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const [menuOpen, setMenuOpen] = useState(false)
  const [showCloseModal, setShowCloseModal] = useState(false)
  const [closeReason, setCloseReason] = useState<'COMPLETED' | 'NOT_PLANNED'>('COMPLETED')
  const [showOpenModal, setShowOpenModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showLockModal, setShowLockModal] = useState(false)
  const [lockReason, setLockReason] = useState<
    'OFF_TOPIC' | 'TOO_HEATED' | 'RESOLVED' | 'SPAM' | null
  >(null)
  const [showPinModal, setShowPinModal] = useState(false)
  const [showUnpinModal, setShowUnpinModal] = useState(false)
  const [showTransferModal, setShowTransferModal] = useState(false)
  const [showRenameModal, setShowRenameModal] = useState(false)
  const [showMoveModal, setShowMoveModal] = useState(false)
  const [showRandomAssignModal, setShowRandomAssignModal] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const anyModalOpen =
    showCloseModal ||
    showOpenModal ||
    showDeleteModal ||
    showLockModal ||
    showPinModal ||
    showUnpinModal ||
    showTransferModal ||
    showDupModal ||
    showRenameModal ||
    showMoveModal ||
    showRandomAssignModal ||
    showHelp

  // selection subscription
  useEffect(() => {
    return selectionStore.subscribe(() => {
      const newCount = selectionStore.count()
      setCount(newCount)
      if (newCount === 0) {
        setStep('CLOSED')
        setMenuOpen(false)
        setSelectedFields([])
        setFieldValues({})
        setRelationshipUpdates(createEmptyRelationshipUpdates())
        setRelationshipSelection(createEmptyRelationshipSelection())
        setBulkUpdateValidationErrors([])
        setShowDupModal(false)
        setShowCloseModal(false)
        setShowOpenModal(false)
        setShowDeleteModal(false)
        setShowLockModal(false)
        setShowPinModal(false)
        setShowUnpinModal(false)
        setShowTransferModal(false)
        setShowRenameModal(false)
        setShowMoveModal(false)
        setShowRandomAssignModal(false)
        setShowHelp(false)
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
        if (anyModalOpen) {
          setShowDupModal(false)
          setShowCloseModal(false)
          setShowOpenModal(false)
          setShowDeleteModal(false)
          setShowLockModal(false)
          setShowPinModal(false)
          setShowUnpinModal(false)
          setShowTransferModal(false)
          setShowRenameModal(false)
          setShowMoveModal(false)
          setShowRandomAssignModal(false)
          setShowHelp(false)
        } else if (step === 'CLOSED' && selectionStore.count() > 0) {
          selectionStore.clear()
        }
      },
    })

    if (step === 'CLOSED' && !anyModalOpen) {
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

    if (count > 0 && step === 'CLOSED' && !anyModalOpen) {
      // help
      reg({
        id: 'help',
        key: '?',
        modifiers: { shift: true },
        context: 'Global',
        label: 'Keyboard Shortcuts',
        action: () => setShowHelp(true),
      })

      // focus actions menu
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

      // ── Cmd+Shift shortcuts (existing) ──

      reg({
        id: 'edit-fields',
        key: 'e',
        modifiers: { meta: true, shift: true },
        context: 'Table Selection',
        label: 'Edit Fields',
        action: () => {
          setMenuOpen(false)
          handleFieldSelectionOpen()
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
        action: handleBulkClose,
      })

      reg({
        id: 'reopen-issues',
        key: 'o',
        modifiers: { meta: true, shift: true },
        context: 'Table Selection',
        label: 'Reopen Issues',
        action: handleBulkOpen,
      })

      reg({
        id: 'lock-conversations',
        key: 'l',
        modifiers: { meta: true, shift: true },
        context: 'Table Selection',
        label: 'Lock Conversations',
        action: handleLock,
      })

      reg({
        id: 'pin-issues',
        key: 'f',
        modifiers: { meta: true, shift: true },
        context: 'Table Selection',
        label: 'Pin Issues',
        action: handlePin,
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

      // ── NEW bare-key shortcuts ──

      reg({
        id: 'quick-edit',
        key: 'e',
        modifiers: {},
        context: 'Table Selection',
        label: 'Quick Edit',
        action: () => {
          setMenuOpen(false)
          handleFieldSelectionOpen()
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
  }, [count, step, anyModalOpen])

  // extract first repo name from dom issue links
  useEffect(() => {
    if (firstRepoName) return
    const links = document.querySelectorAll<HTMLAnchorElement>(
      'a[href*="/issues/"], a[href*="/pull/"]',
    )
    for (const link of links) {
      const match = link.href.match(/github\.com\/([^/]+)\/([^/]+)\/(issues|pull)\/\d+/)
      if (match && match[1] === owner) {
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
            { id: '__comment__', name: 'Add Comment', dataType: 'COMMENT' },
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
        setStep('TOKEN_WARNING')
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

  async function handleBulkUpdate() {
    if (queueStore.getActiveCount() >= 3) {
      setConcurrentError(true)
      return
    }
    setConcurrentError(false)
    setBulkUpdateValidationErrors([])
    const itemIds = selectionStore.getAll()
    const updates = selectedFields.map((field) => ({
      fieldId: field.id,
      value: {
        ...((fieldValues[field.id] as Record<string, unknown>) || {}),
        dataType: field.dataType,
      },
    }))
    const relationships = hasRelationshipOperations(relationshipUpdates)
      ? relationshipUpdates
      : undefined
    const fieldMeta = Object.fromEntries(
      selectedFields.map((field) => [
        field.id,
        {
          name: field.name,
          options: field.options,
          iterations: field.configuration?.iterations,
        },
      ]),
    )

    if (relationships) {
      const validation = await sendMessage('validateBulkRelationshipUpdates', {
        itemIds,
        projectId: projectData?.id || projectId,
        relationships,
      })

      if (validation.errors.length > 0) {
        setBulkUpdateValidationErrors(validation.errors)
        return
      }
    }

    const rect = applyBtnRef.current?.getBoundingClientRect()
    if (rect) flyToTracker(rect)
    sendMessage('bulkUpdate', {
      itemIds,
      projectId: projectData?.id || projectId,
      updates,
      relationships,
      fieldMeta,
    })
    setStep('CLOSED')
    selectionStore.clear()
    setSelectedFields([])
    setFieldValues({})
    setRelationshipUpdates(createEmptyRelationshipUpdates())
    setRelationshipSelection(createEmptyRelationshipSelection())
    setBulkUpdateValidationErrors([])
  }

  async function handleFieldSelectionOpen() {
    if (await checkToken()) {
      setStep('FIELDS')
      setSelectedFields([])
      setFieldValues({})
      setRelationshipUpdates(createEmptyRelationshipUpdates())
      setRelationshipSelection(createEmptyRelationshipSelection())
      setBulkUpdateValidationErrors([])
    }
  }

  async function handleRandomAssign() {
    setMenuOpen(false)
    if (!(await checkToken())) return
    setShowRandomAssignModal(true)
  }

  async function handleConfirmRandomAssign(
    assignments: Map<string, string[]>,
    strategy: import('@/features/bulk-random-assign-utils').DistributionStrategy,
  ) {
    const itemIds = selectionStore.getAll()
    setShowRandomAssignModal(false)

    const assignmentsArray: Array<{ itemId: string; assigneeIds: string[] }> = []
    const itemToAssignees = new Map<string, string[]>()

    for (const [assigneeId, assignedItemIds] of assignments.entries()) {
      for (const itemId of assignedItemIds) {
        const existing = itemToAssignees.get(itemId) || []
        itemToAssignees.set(itemId, [...existing, assigneeId])
      }
    }

    for (const [itemId, assigneeIds] of itemToAssignees.entries()) {
      assignmentsArray.push({ itemId, assigneeIds })
    }

    sendMessage('bulkRandomAssign', {
      itemIds,
      projectId: projectData?.id || projectId,
      assignments: assignmentsArray,
      strategy,
    })

    selectionStore.clear()
  }

  async function handleBulkClose() {
    setMenuOpen(false)
    if (!(await checkToken())) return
    setShowCloseModal(true)
  }

  async function handleConfirmClose() {
    const itemIds = selectionStore.getAll()
    setShowCloseModal(false)
    sendMessage('bulkClose', {
      itemIds,
      projectId: projectData?.id || projectId,
      reason: closeReason,
    })
    selectionStore.clear()
  }

  async function handleBulkOpen() {
    setMenuOpen(false)
    if (!(await checkToken())) return
    setShowOpenModal(true)
  }

  async function handleConfirmOpen() {
    const itemIds = selectionStore.getAll()
    setShowOpenModal(false)
    sendMessage('bulkOpen', { itemIds, projectId: projectData?.id || projectId })
    selectionStore.clear()
  }

  async function handleLock() {
    setMenuOpen(false)
    if (!(await checkToken())) return
    setShowLockModal(true)
  }
  async function handleConfirmLock() {
    const itemIds = selectionStore.getAll()
    setShowLockModal(false)
    sendMessage('bulkLock', { itemIds, projectId: projectData?.id || projectId, lockReason })
    selectionStore.clear()
  }

  async function handlePin() {
    setMenuOpen(false)
    if (!(await checkToken())) return
    setShowPinModal(true)
  }
  async function handleConfirmPin() {
    const itemIds = selectionStore.getAll()
    setShowPinModal(false)
    sendMessage('bulkPin', { itemIds, projectId: projectData?.id || projectId })
    selectionStore.clear()
  }

  async function handleUnpin() {
    setMenuOpen(false)
    if (!(await checkToken())) return
    setShowUnpinModal(true)
  }
  async function handleConfirmUnpin() {
    const itemIds = selectionStore.getAll()
    setShowUnpinModal(false)
    sendMessage('bulkUnpin', { itemIds, projectId: projectData?.id || projectId })
    selectionStore.clear()
  }

  async function handleTransfer() {
    setMenuOpen(false)
    if (!(await checkToken())) return
    setShowTransferModal(true)
  }
  async function handleConfirmTransfer(targetRepoOwner: string, targetRepoName: string) {
    const itemIds = selectionStore.getAll()
    setShowTransferModal(false)
    sendMessage('bulkTransfer', {
      itemIds,
      projectId: projectData?.id || projectId,
      targetRepoOwner,
      targetRepoName,
    })
    selectionStore.clear()
  }

  async function handleBulkDelete() {
    setMenuOpen(false)
    if (!(await checkToken())) return
    setShowDeleteModal(true)
  }

  async function handleConfirmDelete() {
    const itemIds = selectionStore.getAll()
    setShowDeleteModal(false)
    sendMessage('bulkDelete', { itemIds, projectId: projectData?.id || projectId })
    selectionStore.clear()
  }

  async function handleBulkRename() {
    setMenuOpen(false)
    if (!(await checkToken())) return
    setShowRenameModal(true)
  }

  function handleConfirmRename(
    renames: Array<{
      domId: string
      issueNodeId: string
      newTitle: string
      typename: 'Issue' | 'PullRequest'
    }>,
  ) {
    setShowRenameModal(false)
    sendMessage('bulkRename', {
      itemIds: selectionStore.getAll(),
      projectId: projectData?.id || projectId,
      renames,
    })
    selectionStore.clear()
  }

  async function handleBulkReorder() {
    setMenuOpen(false)
    if (!(await checkToken())) return
    setShowMoveModal(true)
  }

  function handleConfirmReorder(ops: ReorderOp[], resolvedProjectId: string, label: string) {
    setShowMoveModal(false)
    sendMessage('bulkReorder', { projectId: resolvedProjectId, reorderOps: ops, label })
    selectionStore.clear()
  }

  function handleUpdateRelationshipSelection(selection: RelationshipSelectionState) {
    setBulkUpdateValidationErrors([])
    setRelationshipSelection(selection)
    setRelationshipUpdates((prev) => ({
      parent: selection.parent ? prev.parent : { set: undefined, clear: false },
      blockedBy: selection.blockedBy ? prev.blockedBy : { add: [], remove: [], clear: false },
      blocking: selection.blocking ? prev.blocking : { add: [], remove: [], clear: false },
    }))
  }

  const hasChanges = selectedFields.length > 0 || hasRelationshipOperations(relationshipUpdates)

  if (count === 0) return null

  return (
    <>
      <BulkActionsModals
        step={step}
        count={count}
        projectData={projectData}
        selectedFields={selectedFields}
        fieldValues={fieldValues}
        relationshipUpdates={relationshipUpdates}
        relationshipSelection={relationshipSelection}
        hasChanges={hasChanges}
        bulkUpdateValidationErrors={bulkUpdateValidationErrors}
        concurrentError={concurrentError}
        owner={owner}
        isOrg={isOrg}
        number={number}
        projectId={projectId}
        firstRepoName={firstRepoName}
        applyBtnRef={applyBtnRef}
        onWizardClose={() => setStep('CLOSED')}
        onToggleField={(f) => {
          setBulkUpdateValidationErrors([])
          setSelectedFields((prev) =>
            prev.some((x) => x.id === f.id) ? prev.filter((x) => x.id !== f.id) : [...prev, f],
          )
        }}
        onUpdateFieldValue={(id, v) => {
          setBulkUpdateValidationErrors([])
          setFieldValues((prev) => ({ ...prev, [id]: v }))
        }}
        onUpdateRelationships={(relationships) => {
          setBulkUpdateValidationErrors([])
          setRelationshipUpdates(relationships)
        }}
        onUpdateRelationshipSelection={handleUpdateRelationshipSelection}
        onSetSelectedFields={(fields) => {
          setBulkUpdateValidationErrors([])
          setSelectedFields(fields)
        }}
        onGoToStep={(s) => {
          if (s !== 'SUMMARY') setBulkUpdateValidationErrors([])
          setStep(s)
        }}
        onApply={handleBulkUpdate}
        onOpenOptions={() => {
          sendMessage('openOptions', {})
          setStep('CLOSED')
        }}
        showCloseModal={showCloseModal}
        closeReason={closeReason}
        onChangeCloseReason={setCloseReason}
        onCloseCloseModal={() => setShowCloseModal(false)}
        onConfirmClose={handleConfirmClose}
        showOpenModal={showOpenModal}
        onCloseOpenModal={() => setShowOpenModal(false)}
        onConfirmOpen={handleConfirmOpen}
        showDeleteModal={showDeleteModal}
        onCloseDeleteModal={() => setShowDeleteModal(false)}
        onConfirmDelete={handleConfirmDelete}
        showLockModal={showLockModal}
        lockReason={lockReason}
        onChangeLockReason={setLockReason}
        onCloseLockModal={() => setShowLockModal(false)}
        onConfirmLock={handleConfirmLock}
        showPinModal={showPinModal}
        onClosePinModal={() => setShowPinModal(false)}
        onConfirmPin={handleConfirmPin}
        showUnpinModal={showUnpinModal}
        onCloseUnpinModal={() => setShowUnpinModal(false)}
        onConfirmUnpin={handleConfirmUnpin}
        showTransferModal={showTransferModal}
        onCloseTransferModal={() => setShowTransferModal(false)}
        onConfirmTransfer={handleConfirmTransfer}
        showDupModal={showDupModal}
        onCloseDupModal={() => {
          selectionStore.clear()
          setShowDupModal(false)
        }}
        showRenameModal={showRenameModal}
        onCloseRenameModal={() => setShowRenameModal(false)}
        onConfirmRename={handleConfirmRename}
        showMoveModal={showMoveModal}
        onCloseMoveModal={() => setShowMoveModal(false)}
        onConfirmReorder={handleConfirmReorder}
        showRandomAssignModal={showRandomAssignModal}
        onCloseRandomAssignModal={() => setShowRandomAssignModal(false)}
        onConfirmRandomAssign={handleConfirmRandomAssign}
        showHelp={showHelp}
        onCloseHelp={() => setShowHelp(false)}
      />

      {/* ── persistent bottom bar ── */}
      <Box
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
            {/* ⌘A / Esc hints */}
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

          {/* Divider */}
          <Box sx={{ width: '1px', height: 20, bg: 'border.default', flexShrink: 0 }} />

          {/* Actions dropdown */}
          <Box ref={menuRef} sx={{ position: 'relative' }}>
            <Button
              ref={actionsButtonRef}
              variant="primary"
              size="small"
              onClick={() => setMenuOpen((o) => !o)}
              sx={{
                boxShadow: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                transition: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
                '&:hover:not(:disabled)': { transform: 'translateY(-1px)' },
                '&:active': { transform: 'translateY(0)', transition: '100ms' },
                '@media (prefers-reduced-motion: reduce)': {
                  transition: 'none',
                  '&:hover:not(:disabled)': { transform: 'none' },
                },
              }}
            >
              <ListCheckIcon size={14} />
              <Text sx={{ fontSize: 1, fontWeight: 'semibold' }}> Actions </Text>
              <Box
                as="kbd"
                sx={{
                  fontSize: 0,
                  fontFamily: 'inherit',
                  fontWeight: 500,
                  px: '4px',
                  py: '1px',
                  borderRadius: 1,
                  bg: 'rgba(255,255,255,0.18)',
                  border: '1px solid rgba(255,255,255,0.28)',
                  color: 'inherit',
                  cursor: 'default',
                  lineHeight: 1.5,
                  opacity: 0.9,
                }}
              >
                {isMac ? ' ⌘⇧B ' : ' ⌃⇧B '}
              </Box>
            </Button>
            {menuOpen && (
              <BulkActionsMenu
                count={count}
                onEditFields={() => handleFieldSelectionOpen()}
                onRandomAssign={handleRandomAssign}
                onDeepDuplicate={() =>
                  checkToken().then((ok) => ok && setShowDupModal(true))
                }
                onRename={handleBulkRename}
                onReorder={handleBulkReorder}
                onClose={handleBulkClose}
                onOpen={handleBulkOpen}
                onLock={handleLock}
                onPin={handlePin}
                onUnpin={handleUnpin}
                onTransfer={handleTransfer}
                onDelete={handleBulkDelete}
              />
            )}
          </Box>

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
