import React, { useEffect, useRef, useState } from 'react'
import { ActionList, Box, Button, CounterLabel, Text } from '@primer/react'
import Tippy from '../ui/tooltip'
import { ensureTippyCss } from '../../lib/tippy-utils'
import { selectionStore } from '../../lib/selection-store'
import { getAllInjectedItemIds, isEditableTarget } from '../../lib/project-table-dom'
import { sendMessage, type BulkEditRelationshipsUpdate } from '../../lib/messages'
import { queueStore } from '../../lib/queue-store'
import { exportSelectedToCSV, flyToTracker } from './bulk-utils'
import { BulkDuplicateModal } from './bulk-duplicate-modal'
import { BulkEditWizard, type ProjectData, type ProjectField, type RelationshipSelectionState, type WizardStep } from './bulk-edit-modal'
import { BulkCloseModal } from './bulk-close-modal'
import { BulkDeleteModal } from './bulk-delete-modal'
import { BulkOpenModal } from './bulk-open-modal'
import { BulkTransferModal } from './bulk-transfer-modal'
import { BulkLockModal } from './bulk-lock-modal'
import { BulkPinModal } from './bulk-pin-modal'
import { BulkUnpinModal } from './bulk-unpin-modal'
import { BulkRenameModal } from './bulk-rename-modal'
import { BulkMoveModal, type ReorderOp } from './bulk-move-modal'
import { BulkRandomAssignModal } from './bulk-random-assign-modal'
import {
  ArrowRightIcon,
  CircleSlashIcon,
  CopyIcon,
  DownloadIcon,
  ListCheckIcon,
  LockIcon,
  MoveIcon,
  PencilIcon,
  PersonIcon,
  PinIcon,
  SyncIcon,
  TrashIcon,
  UnpinIcon,
  XIcon,
} from '../ui/primitives'
import { Z_OVERLAY } from '../../lib/z-index'

interface Props {
  projectId: string
  owner: string
  isOrg: boolean
  number: number
  getFields: () => Promise<ProjectData>
}

type ModalStep = 'CLOSED' | WizardStep

function createEmptyRelationshipUpdates(): BulkEditRelationshipsUpdate {
  return {
    parent: {
      set: undefined,
      clear: false,
    },
    blockedBy: {
      add: [],
      remove: [],
      clear: false,
    },
    blocking: {
      add: [],
      remove: [],
      clear: false,
    },
  }
}

function createEmptyRelationshipSelection(): RelationshipSelectionState {
  return {
    parent: false,
    blockedBy: false,
    blocking: false,
  }
}

function hasRelationshipOperations(relationships: BulkEditRelationshipsUpdate): boolean {
  return Boolean(
    relationships.parent.clear ||
    relationships.parent.set ||
    relationships.blockedBy.clear ||
    relationships.blockedBy.add.length > 0 ||
    relationships.blockedBy.remove.length > 0 ||
    relationships.blocking.clear ||
    relationships.blocking.add.length > 0 ||
    relationships.blocking.remove.length > 0,
  )
}

// ── Platform detection ──────────────────────────────────────
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
/** Returns the display string for a Ctrl/Cmd+Shift+key shortcut */
function shortcut(key: string) { return isMac ? `⌘⇧${key}` : `⌃⇧${key}` }

// ── Main component ──────────────────────────────────────────

export function BulkActionsBar({ projectId, owner, isOrg, number, getFields }: Props) {
  ensureTippyCss()
  const [count, setCount] = useState(() => selectionStore.count())
  const [projectData, setProjectData] = useState<ProjectData | null>(null)
  const [firstRepoName, setFirstRepoName] = useState('')
  const [tokenStatusError, setTokenStatusError] = useState<string | null>(null)

  const [step, setStep] = useState<ModalStep>('CLOSED')
  const [selectedFields, setSelectedFields] = useState<ProjectField[]>([])
  const [fieldValues, setFieldValues] = useState<Record<string, unknown>>({})
  const [relationshipUpdates, setRelationshipUpdates] = useState<BulkEditRelationshipsUpdate>(createEmptyRelationshipUpdates())
  const [relationshipSelection, setRelationshipSelection] = useState<RelationshipSelectionState>(createEmptyRelationshipSelection())
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
  const [lockReason, setLockReason] = useState<'OFF_TOPIC' | 'TOO_HEATED' | 'RESOLVED' | 'SPAM' | null>(null)
  const [showPinModal, setShowPinModal] = useState(false)
  const [showUnpinModal, setShowUnpinModal] = useState(false)
  const [showTransferModal, setShowTransferModal] = useState(false)
  const [showRenameModal, setShowRenameModal] = useState(false)
  const [showMoveModal, setShowMoveModal] = useState(false)
  const [showRandomAssignModal, setShowRandomAssignModal] = useState(false)
  const anyModalOpen = showCloseModal || showOpenModal || showDeleteModal ||
    showLockModal || showPinModal || showUnpinModal || showTransferModal || showDupModal || showRenameModal || showMoveModal || showRandomAssignModal

  // Selection subscription
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
      }
    })
  }, [])

  // Click-outside for action menu
  useEffect(() => {
    if (!menuOpen) return
    function handleClick(e: MouseEvent) {
      const path = e.composedPath ? e.composedPath() : [e.target as Node]
      if (menuRef.current && !path.includes(menuRef.current)) setMenuOpen(false)
    }
    window.addEventListener('mousedown', handleClick)
    return () => window.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  // ⌘A / Ctrl+A — select all
  useEffect(() => {
    function handle(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'a' && step === 'CLOSED' && !isEditableTarget(e.target as Element)) {
        const ids = getAllInjectedItemIds()
        if (ids.length > 0) { e.preventDefault(); selectionStore.selectBatch(ids) }
      }
    }
    document.addEventListener('keydown', handle)
    return () => document.removeEventListener('keydown', handle)
  }, [step])

  // Escape — close modal (if open) or clear selection
  useEffect(() => {
    function handle(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
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
      } else if (step === 'CLOSED' && selectionStore.count() > 0) {
        selectionStore.clear()
      }
    }
    document.addEventListener('keydown', handle)
    return () => document.removeEventListener('keydown', handle)
  }, [step, anyModalOpen])

  // ⌘⇧B — focus Actions menu
  useEffect(() => {
    function handle(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'b' && step === 'CLOSED') {
        if (selectionStore.count() > 0) { e.preventDefault(); selectionStore.requestFocus() }
      }
    }
    document.addEventListener('keydown', handle)
    return () => document.removeEventListener('keydown', handle)
  }, [step])

  // Focus request from keyboard shortcut
  useEffect(() => {
    return selectionStore.onFocusRequest(() => {
      if (selectionStore.count() > 0) {
        actionsButtonRef.current?.focus()
        setMenuOpen(true)
      }
    })
  }, [])

  // ── Bulk action shortcuts (⌘⇧Letter) ─────────────────────────
  const bulkShortcutsRef = useRef<Record<string, (() => void) | undefined>>({})
  bulkShortcutsRef.current = {
    'Shift+KeyE': () => { setMenuOpen(false); handleFieldSelectionOpen() },
    'Shift+KeyA': handleRandomAssign,
    'Shift+KeyX': handleBulkClose,
    'Shift+KeyO': handleBulkOpen,
    'Shift+KeyL': handleLock,
    'Shift+KeyF': handlePin,
    'Shift+KeyM': handleTransfer,
    'Shift+KeyV': () => { setMenuOpen(false); exportSelectedToCSV() },
    'Shift+KeyR': handleBulkRename,
    'Shift+KeyJ': handleBulkReorder,
    'Shift+Backspace': handleBulkDelete,
    ...(count === 1 ? { 'Shift+KeyD': () => { setMenuOpen(false); checkToken().then(ok => ok && setShowDupModal(true)) } } : {}),
  }

  useEffect(() => {
    function handle(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || !e.shiftKey) return
      if (count === 0 || step !== 'CLOSED' || anyModalOpen) return
      if (isEditableTarget(e.target)) return
      const fn = bulkShortcutsRef.current[`Shift+${e.code}`]
      if (fn) { e.preventDefault(); fn() }
    }
    document.addEventListener('keydown', handle)
    return () => document.removeEventListener('keydown', handle)
  }, [count, step, anyModalOpen])

  // Extract first repo name from DOM issue links
  useEffect(() => {
    if (firstRepoName) return
    const links = document.querySelectorAll<HTMLAnchorElement>('a[href*="/issues/"], a[href*="/pull/"]')
    for (const link of links) {
      const match = link.href.match(/github\.com\/([^/]+)\/([^/]+)\/(issues|pull)\/\d+/)
      if (match && match[1] === owner) { setFirstRepoName(match[2]); break }
    }
  }, [count, owner, firstRepoName])

  // Load project fields on first selection
  useEffect(() => {
    if (count > 0 && !projectData) {
      getFields().then(data => {
        const existingTypes = data.fields.map(f => f.dataType)
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
        if (isOrg && !data.fields.some(f => f.dataType === 'ISSUE_TYPE' || f.name.toLowerCase() === 'type')) {
          defaultFields.push({ id: '__issue_type__', name: 'Type', dataType: 'ISSUE_TYPE' })
        }
        
        setProjectData({ ...data, fields: [...defaultFields, ...data.fields] })
      }).catch(() => {})
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
        if (i < 2) await new Promise(r => setTimeout(r, 800))
      }
    }
    setTokenStatusError('Could not verify GitHub access right now. Reload the page or reopen the extension.')
    return false
  }

  async function handleBulkUpdate() {
    if (queueStore.getActiveCount() >= 3) { setConcurrentError(true); return }
    setConcurrentError(false)
    setBulkUpdateValidationErrors([])
    const itemIds = selectionStore.getAll()
    const updates = selectedFields.map(field => ({
      fieldId: field.id,
      value: { ...(fieldValues[field.id] as Record<string, unknown> || {}), dataType: field.dataType },
    }))
    const relationships = hasRelationshipOperations(relationshipUpdates) ? relationshipUpdates : undefined
    const fieldMeta = Object.fromEntries(
      selectedFields.map(field => [
        field.id,
        {
          name: field.name,
          options: field.options,
          iterations: field.configuration?.iterations,
        },
      ])
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
    if (!await checkToken()) return
    setShowRandomAssignModal(true)
  }

  async function handleConfirmRandomAssign(assignments: Map<string, string[]>, strategy: import('./bulk-random-assign-utils').DistributionStrategy) {
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
    if (!await checkToken()) return
    setShowCloseModal(true)
  }

  async function handleConfirmClose() {
    const itemIds = selectionStore.getAll()
    setShowCloseModal(false)
    sendMessage('bulkClose', { itemIds, projectId: projectData?.id || projectId, reason: closeReason })
    selectionStore.clear()
  }

  async function handleBulkOpen() {
    setMenuOpen(false)
    if (!await checkToken()) return
    setShowOpenModal(true)
  }

  async function handleConfirmOpen() {
    const itemIds = selectionStore.getAll()
    setShowOpenModal(false)
    sendMessage('bulkOpen', { itemIds, projectId: projectData?.id || projectId })
    selectionStore.clear()
  }

  async function handleLock() { setMenuOpen(false); if (!await checkToken()) return; setShowLockModal(true) }
  async function handleConfirmLock() {
    const itemIds = selectionStore.getAll()
    setShowLockModal(false)
    sendMessage('bulkLock', { itemIds, projectId: projectData?.id || projectId, lockReason })
    selectionStore.clear()
  }

  async function handlePin() { setMenuOpen(false); if (!await checkToken()) return; setShowPinModal(true) }
  async function handleConfirmPin() {
    const itemIds = selectionStore.getAll()
    setShowPinModal(false)
    sendMessage('bulkPin', { itemIds, projectId: projectData?.id || projectId })
    selectionStore.clear()
  }

  async function handleUnpin() { setMenuOpen(false); if (!await checkToken()) return; setShowUnpinModal(true) }
  async function handleConfirmUnpin() {
    const itemIds = selectionStore.getAll()
    setShowUnpinModal(false)
    sendMessage('bulkUnpin', { itemIds, projectId: projectData?.id || projectId })
    selectionStore.clear()
  }

  async function handleTransfer() { setMenuOpen(false); if (!await checkToken()) return; setShowTransferModal(true) }
  async function handleConfirmTransfer(targetRepoOwner: string, targetRepoName: string) {
    const itemIds = selectionStore.getAll()
    setShowTransferModal(false)
    sendMessage('bulkTransfer', { itemIds, projectId: projectData?.id || projectId, targetRepoOwner, targetRepoName })
    selectionStore.clear()
  }

  async function handleBulkDelete() {
    setMenuOpen(false)
    if (!await checkToken()) return
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
    if (!await checkToken()) return
    setShowRenameModal(true)
  }

  function handleConfirmRename(renames: Array<{ domId: string; issueNodeId: string; newTitle: string; typename: 'Issue' | 'PullRequest' }>) {
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
    if (!await checkToken()) return
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
    setRelationshipUpdates(prev => ({
      parent: selection.parent ? prev.parent : { set: undefined, clear: false },
      blockedBy: selection.blockedBy ? prev.blockedBy : { add: [], remove: [], clear: false },
      blocking: selection.blocking ? prev.blocking : { add: [], remove: [], clear: false },
    }))
  }

  const hasChanges = selectedFields.length > 0 || hasRelationshipOperations(relationshipUpdates)

  if (count === 0) return null

  return (
    <>
      {/* Wizard overlay (FIELDS / VALUES / SUMMARY / TOKEN_WARNING) */}
      {step !== 'CLOSED' && (
        <BulkEditWizard
          count={count}
          step={step as WizardStep}
          projectData={projectData}
          selectedFields={selectedFields}
          fieldValues={fieldValues}
          relationships={relationshipUpdates}
          relationshipSelection={relationshipSelection}
          hasChanges={hasChanges}
          validationErrors={bulkUpdateValidationErrors}
          concurrentError={concurrentError}
          owner={owner}
          firstRepoName={firstRepoName}
          applyBtnRef={applyBtnRef}
          onClose={() => setStep('CLOSED')}
          onToggleField={f => {
            setBulkUpdateValidationErrors([])
            setSelectedFields(prev =>
              prev.some(x => x.id === f.id) ? prev.filter(x => x.id !== f.id) : [...prev, f]
            )
          }}
          onUpdateFieldValue={(id, v) => {
            setBulkUpdateValidationErrors([])
            setFieldValues(prev => ({ ...prev, [id]: v }))
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
          onGoToStep={s => {
            if (s !== 'SUMMARY') {
              setBulkUpdateValidationErrors([])
            }
            setStep(s)
          }}
          onApply={handleBulkUpdate}
          onOpenOptions={() => { sendMessage('openOptions', {}); setStep('CLOSED') }}
        />
      )}

      {/* Close modal */}
      {showCloseModal && (
        <BulkCloseModal
          count={count}
          closeReason={closeReason}
          onChangeReason={setCloseReason}
          onClose={() => setShowCloseModal(false)}
          onConfirm={handleConfirmClose}
        />
      )}

      {/* Open modal */}
      {showOpenModal && (
        <BulkOpenModal
          count={count}
          onClose={() => setShowOpenModal(false)}
          onConfirm={handleConfirmOpen}
        />
      )}

      {/* Delete modal */}
      {showDeleteModal && (
        <BulkDeleteModal
          count={count}
          onClose={() => setShowDeleteModal(false)}
          onConfirm={handleConfirmDelete}
        />
      )}

      {/* Lock modal */}
      {showLockModal && (
        <BulkLockModal count={count} lockReason={lockReason} onChangeReason={setLockReason}
          onClose={() => setShowLockModal(false)} onConfirm={handleConfirmLock} />
      )}

      {/* Pin modal */}
      {showPinModal && (
        <BulkPinModal count={count} onClose={() => setShowPinModal(false)} onConfirm={handleConfirmPin} />
      )}

      {/* Unpin modal */}
      {showUnpinModal && (
        <BulkUnpinModal count={count} onClose={() => setShowUnpinModal(false)} onConfirm={handleConfirmUnpin} />
      )}

      {/* Transfer modal */}
      {showTransferModal && (
        <BulkTransferModal
          count={count}
          owner={owner}
          firstItemId={selectionStore.getAll()[0]}
          projectId={projectData?.id || projectId}
          onClose={() => setShowTransferModal(false)}
          onConfirm={handleConfirmTransfer}
        />
      )}

      {/* Bulk Duplicate modal */}
      {showDupModal && (
        <BulkDuplicateModal
          itemId={selectionStore.getAll()[0]}
          projectId={projectData?.id || projectId}
          owner={owner}
          isOrg={isOrg}
          projectNumber={number}
          onClose={() => { selectionStore.clear(); setShowDupModal(false) }}
        />
      )}

      {/* Rename modal */}
      {showRenameModal && (
        <BulkRenameModal
          count={count}
          projectId={projectData?.id || projectId}
          itemIds={selectionStore.getAll()}
          onClose={() => setShowRenameModal(false)}
          onConfirm={handleConfirmRename}
        />
      )}

      {/* Move / Reorder modal */}
      {showMoveModal && (
        <BulkMoveModal
          count={count}
          projectId={projectData?.id || projectId}
          itemIds={selectionStore.getAll()}
          owner={owner}
          number={number}
          isOrg={isOrg}
          onClose={() => setShowMoveModal(false)}
          onConfirm={handleConfirmReorder}
        />
      )}

      {/* Random Assign modal */}
      {showRandomAssignModal && (
        <BulkRandomAssignModal
          count={count}
          projectId={projectData?.id || projectId}
          owner={owner}
          repoName={firstRepoName}
          itemIds={selectionStore.getAll()}
          onClose={() => setShowRandomAssignModal(false)}
          onConfirm={handleConfirmRandomAssign}
        />
      )}

      {/* ── Persistent bottom bar ── */}
      <Box sx={{
        position: 'fixed', left: '50%', bottom: 4,
        transform: 'translateX(-50%)',
        width: 'min(760px, calc(100vw - 32px))',
        zIndex: Z_OVERLAY,
        bg: 'canvas.overlay', border: '1px solid', borderColor: 'border.default',
        borderRadius: 2, px: 4, py: 3,
        display: 'flex', flexDirection: 'column',
        gap: tokenStatusError ? 2 : 0,
      }}>
        {tokenStatusError && (
          <Box sx={{
            px: 2, py: 1, borderRadius: 2, border: '1px solid',
            borderColor: 'danger.muted', bg: 'danger.subtle', color: 'danger.fg',
            fontSize: 0, fontWeight: 'bold',
          }}>
            {tokenStatusError}
          </Box>
        )}

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          {/* Selection count + keyboard hints */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
            <CounterLabel scheme="primary" sx={{ fontSize: 1, fontWeight: 'bold', px: 2, py: '3px' }}>{count}</CounterLabel>
            <Text sx={{ fontSize: 0, color: 'fg.muted', flexShrink: 0 }}>{count === 1 ? 'item' : 'items'} selected</Text>
            {/* ⌘A / Esc hints */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {(['⌘A', 'Esc'] as const).map(key => (
                <Box key={key} as="kbd" sx={{
                  fontSize: 0, fontFamily: 'inherit', fontWeight: 500,
                  px: '5px', py: '1px', borderRadius: 1,
                  bg: 'canvas.inset', border: '1px solid', borderColor: 'border.default',
                  color: 'fg.muted', cursor: 'default', lineHeight: 1.6,
                }}>{key}</Box>
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
              onClick={() => setMenuOpen(o => !o)}
              sx={{
                boxShadow: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px',
                transition: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
                '&:hover:not(:disabled)': { transform: 'translateY(-1px)' },
                '&:active': { transform: 'translateY(0)', transition: '100ms' },
                '@media (prefers-reduced-motion: reduce)': { transition: 'none', '&:hover:not(:disabled)': { transform: 'none' } },
              }}
            >
              <ListCheckIcon size={14} />
              <Text sx={{ fontSize: 1, fontWeight: 'semibold' }}> Actions </Text>
              <Box as="kbd" sx={{
                fontSize: 0, fontFamily: 'inherit', fontWeight: 500,
                px: '4px', py: '1px', borderRadius: 1,
                bg: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.28)',
                color: 'inherit', cursor: 'default', lineHeight: 1.5, opacity: 0.9,
              }}>
                {isMac ? ' ⌘⇧B ' : ' ⌃⇧B '}
              </Box>
            </Button>
            {menuOpen && (
              <Box sx={{
                position: 'absolute', bottom: 'calc(100% + 6px)', right: 0,
                width: 256, zIndex: 100,
                bg: 'canvas.overlay', border: '1px solid', borderColor: 'border.default',
                borderRadius: 2,
                overflow: 'hidden',
              }}>
              <ActionList>
                <ActionList.Group>
                  <ActionList.GroupHeading as="h3">Fields</ActionList.GroupHeading>
                  <ActionList.Item onSelect={() => handleFieldSelectionOpen()}>
                    <ActionList.LeadingVisual>
                      <Box sx={{ width: 22, height: 22, borderRadius: 2, bg: 'accent.subtle', color: 'accent.fg', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <ListCheckIcon size={13} />
                      </Box>
                    </ActionList.LeadingVisual>
                    Edit Fields
                    <ActionList.TrailingVisual>
                      <Box as="kbd" sx={{ fontSize: 0, fontFamily: 'inherit', fontWeight: 500, px: '5px', py: '1px', borderRadius: 1, bg: 'canvas.inset', border: '1px solid', borderColor: 'border.default', color: 'fg.muted', cursor: 'default', lineHeight: 1.6, letterSpacing: '0.02em' }}>
                        {shortcut('E')}
                      </Box>
                    </ActionList.TrailingVisual>
                  </ActionList.Item>
                  <ActionList.Item onSelect={handleRandomAssign}>
                    <ActionList.LeadingVisual>
                      <Box sx={{ width: 22, height: 22, borderRadius: 2, bg: 'accent.subtle', color: 'accent.fg', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <PersonIcon size={13} />
                      </Box>
                    </ActionList.LeadingVisual>
                    Random Assign (beta)
                    <ActionList.TrailingVisual>
                      <Box as="kbd" sx={{ fontSize: 0, fontFamily: 'inherit', fontWeight: 500, px: '5px', py: '1px', borderRadius: 1, bg: 'canvas.inset', border: '1px solid', borderColor: 'border.default', color: 'fg.muted', cursor: 'default', lineHeight: 1.6, letterSpacing: '0.02em' }}>
                        {shortcut('A')}
                      </Box>
                    </ActionList.TrailingVisual>
                  </ActionList.Item>
                  {count === 1 && (
                    <ActionList.Item onSelect={() => checkToken().then(ok => ok && setShowDupModal(true))}>
                      <ActionList.LeadingVisual>
                        <Box sx={{ width: 22, height: 22, borderRadius: 2, bg: 'done.subtle', color: 'done.fg', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <CopyIcon size={13} />
                        </Box>
                      </ActionList.LeadingVisual>
                      Deep Duplicate
                      <ActionList.TrailingVisual>
                        <Box as="kbd" sx={{ fontSize: 0, fontFamily: 'inherit', fontWeight: 500, px: '5px', py: '1px', borderRadius: 1, bg: 'canvas.inset', border: '1px solid', borderColor: 'border.default', color: 'fg.muted', cursor: 'default', lineHeight: 1.6, letterSpacing: '0.02em' }}>
                          {shortcut('D')}
                        </Box>
                      </ActionList.TrailingVisual>
                    </ActionList.Item>
                  )}
                </ActionList.Group>
                <ActionList.Group>
                  <ActionList.GroupHeading as="h3">Content</ActionList.GroupHeading>
                  <ActionList.Item onSelect={handleBulkRename}>
                    <ActionList.LeadingVisual>
                      <Box sx={{ width: 22, height: 22, borderRadius: 2, bg: 'accent.subtle', color: 'accent.fg', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <PencilIcon size={13} />
                      </Box>
                    </ActionList.LeadingVisual>
                    Rename Titles
                    <ActionList.TrailingVisual>
                      <Box as="kbd" sx={{ fontSize: 0, fontFamily: 'inherit', fontWeight: 500, px: '5px', py: '1px', borderRadius: 1, bg: 'canvas.inset', border: '1px solid', borderColor: 'border.default', color: 'fg.muted', cursor: 'default', lineHeight: 1.6, letterSpacing: '0.02em' }}>
                        {shortcut('R')}
                      </Box>
                    </ActionList.TrailingVisual>
                  </ActionList.Item>
                  <ActionList.Item onSelect={handleBulkReorder}>
                    <ActionList.LeadingVisual>
                      <Box sx={{ width: 22, height: 22, borderRadius: 2, bg: 'accent.subtle', color: 'accent.fg', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <MoveIcon size={13} />
                      </Box>
                    </ActionList.LeadingVisual>
                    Reorder Items
                    <ActionList.TrailingVisual>
                      <Box as="kbd" sx={{ fontSize: 0, fontFamily: 'inherit', fontWeight: 500, px: '5px', py: '1px', borderRadius: 1, bg: 'canvas.inset', border: '1px solid', borderColor: 'border.default', color: 'fg.muted', cursor: 'default', lineHeight: 1.6, letterSpacing: '0.02em' }}>
                        {shortcut('J')}
                      </Box>
                    </ActionList.TrailingVisual>
                  </ActionList.Item>
                </ActionList.Group>
                <ActionList.Group>
                  <ActionList.GroupHeading as="h3">Status</ActionList.GroupHeading>
                  <ActionList.Item onSelect={handleBulkClose}>
                    <ActionList.LeadingVisual>
                      <Box sx={{ width: 22, height: 22, borderRadius: 2, bg: 'attention.subtle', color: 'attention.fg', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <CircleSlashIcon size={13} />
                      </Box>
                    </ActionList.LeadingVisual>
                    Close Issues
                    <ActionList.TrailingVisual>
                      <Box as="kbd" sx={{ fontSize: 0, fontFamily: 'inherit', fontWeight: 500, px: '5px', py: '1px', borderRadius: 1, bg: 'canvas.inset', border: '1px solid', borderColor: 'border.default', color: 'fg.muted', cursor: 'default', lineHeight: 1.6, letterSpacing: '0.02em' }}>
                        {shortcut('X')}
                      </Box>
                    </ActionList.TrailingVisual>
                  </ActionList.Item>
                  <ActionList.Item onSelect={handleBulkOpen}>
                    <ActionList.LeadingVisual>
                      <Box sx={{ width: 22, height: 22, borderRadius: 2, bg: 'success.subtle', color: 'success.fg', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <SyncIcon size={13} />
                      </Box>
                    </ActionList.LeadingVisual>
                    Reopen Issues
                    <ActionList.TrailingVisual>
                      <Box as="kbd" sx={{ fontSize: 0, fontFamily: 'inherit', fontWeight: 500, px: '5px', py: '1px', borderRadius: 1, bg: 'canvas.inset', border: '1px solid', borderColor: 'border.default', color: 'fg.muted', cursor: 'default', lineHeight: 1.6, letterSpacing: '0.02em' }}>
                        {shortcut('O')}
                      </Box>
                    </ActionList.TrailingVisual>
                  </ActionList.Item>
                  <ActionList.Item onSelect={handleLock}>
                    <ActionList.LeadingVisual>
                      <Box sx={{ width: 22, height: 22, borderRadius: 2, bg: 'attention.subtle', color: 'attention.fg', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <LockIcon size={13} />
                      </Box>
                    </ActionList.LeadingVisual>
                    Lock Conversations
                    <ActionList.TrailingVisual>
                      <Box as="kbd" sx={{ fontSize: 0, fontFamily: 'inherit', fontWeight: 500, px: '5px', py: '1px', borderRadius: 1, bg: 'canvas.inset', border: '1px solid', borderColor: 'border.default', color: 'fg.muted', cursor: 'default', lineHeight: 1.6, letterSpacing: '0.02em' }}>
                        {shortcut('L')}
                      </Box>
                    </ActionList.TrailingVisual>
                  </ActionList.Item>
                </ActionList.Group>
                <ActionList.Group>
                  <ActionList.GroupHeading as="h3">Visibility</ActionList.GroupHeading>
                  <ActionList.Item onSelect={handlePin}>
                    <ActionList.LeadingVisual>
                      <Box sx={{ width: 22, height: 22, borderRadius: 2, bg: 'accent.subtle', color: 'accent.fg', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <PinIcon size={13} />
                      </Box>
                    </ActionList.LeadingVisual>
                    Pin Issues
                    <ActionList.TrailingVisual>
                      <Box as="kbd" sx={{ fontSize: 0, fontFamily: 'inherit', fontWeight: 500, px: '5px', py: '1px', borderRadius: 1, bg: 'canvas.inset', border: '1px solid', borderColor: 'border.default', color: 'fg.muted', cursor: 'default', lineHeight: 1.6, letterSpacing: '0.02em' }}>
                        {shortcut('F')}
                      </Box>
                    </ActionList.TrailingVisual>
                  </ActionList.Item>
                  <ActionList.Item onSelect={handleUnpin}>
                    <ActionList.LeadingVisual>
                      <Box sx={{ width: 22, height: 22, borderRadius: 2, bg: 'accent.subtle', color: 'accent.fg', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <UnpinIcon size={13} />
                      </Box>
                    </ActionList.LeadingVisual>
                    Unpin
                  </ActionList.Item>
                </ActionList.Group>
                <ActionList.Group>
                  <ActionList.GroupHeading as="h3">Move</ActionList.GroupHeading>
                  <ActionList.Item onSelect={handleTransfer}>
                    <ActionList.LeadingVisual>
                      <Box sx={{ width: 22, height: 22, borderRadius: 2, bg: 'done.subtle', color: 'done.fg', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <ArrowRightIcon size={13} />
                      </Box>
                    </ActionList.LeadingVisual>
                    Transfer Issues
                    <ActionList.TrailingVisual>
                      <Box as="kbd" sx={{ fontSize: 0, fontFamily: 'inherit', fontWeight: 500, px: '5px', py: '1px', borderRadius: 1, bg: 'canvas.inset', border: '1px solid', borderColor: 'border.default', color: 'fg.muted', cursor: 'default', lineHeight: 1.6, letterSpacing: '0.02em' }}>
                        {shortcut('M')}
                      </Box>
                    </ActionList.TrailingVisual>
                  </ActionList.Item>
                </ActionList.Group>
                <ActionList.Divider />
                <ActionList.Item onSelect={() => exportSelectedToCSV()}>
                  <ActionList.LeadingVisual>
                    <Box sx={{ width: 22, height: 22, borderRadius: 2, bg: 'success.subtle', color: 'success.fg', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <DownloadIcon size={13} />
                    </Box>
                  </ActionList.LeadingVisual>
                  Export CSV
                  <ActionList.TrailingVisual>
                    <Box as="kbd" sx={{ fontSize: 0, fontFamily: 'inherit', fontWeight: 500, px: '5px', py: '1px', borderRadius: 1, bg: 'canvas.inset', border: '1px solid', borderColor: 'border.default', color: 'fg.muted', cursor: 'default', lineHeight: 1.6, letterSpacing: '0.02em' }}>
                      {shortcut('V')}
                    </Box>
                  </ActionList.TrailingVisual>
                </ActionList.Item>
                <ActionList.Divider />
                <ActionList.Item variant="danger" onSelect={handleBulkDelete}>
                  <ActionList.LeadingVisual>
                    <Box sx={{ width: 22, height: 22, borderRadius: 2, bg: 'danger.subtle', color: 'danger.fg', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <TrashIcon size={13} />
                    </Box>
                  </ActionList.LeadingVisual>
                  Delete
                  <ActionList.TrailingVisual>
                    <Box sx={{ fontSize: 0, fontWeight: 'bold', px: 1, py: '1px', borderRadius: 2, bg: 'danger.subtle', color: 'danger.fg', mr: 1 }}>
                      admin
                    </Box>
                    <Box as="kbd" sx={{ fontSize: 0, fontFamily: 'inherit', fontWeight: 500, px: '5px', py: '1px', borderRadius: 1, bg: 'canvas.inset', border: '1px solid', borderColor: 'border.default', color: 'fg.muted', cursor: 'default', lineHeight: 1.6, letterSpacing: '0.02em' }}>
                      {isMac ? '⌘⇧⌫' : '⌃⇧⌫'}
                    </Box>
                  </ActionList.TrailingVisual>
                </ActionList.Item>
              </ActionList>
            </Box>
            )}
          </Box>

          {/* Spacer + clear */}
          <Box sx={{ flex: 1 }} />
          <Tippy content="Clear selection (Esc)" placement="top" delay={[400, 0]}>
            <Button
              variant="invisible"
              size="small"
              onClick={() => selectionStore.clear()}
              aria-label="Clear selection"
              sx={{
                color: 'fg.muted', boxShadow: 'none', p: '5px',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                transition: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
                '&:hover:not(:disabled)': { transform: 'translateY(-1px)', color: 'fg.default', bg: 'canvas.subtle' },
                '&:active': { transform: 'translateY(0)', transition: '100ms', color: 'fg.default' },
                '@media (prefers-reduced-motion: reduce)': { transition: 'none', '&:hover:not(:disabled)': { transform: 'none' } },
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
