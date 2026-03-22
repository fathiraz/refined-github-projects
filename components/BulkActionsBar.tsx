import React, { useEffect, useState, useRef } from 'react'
import { Box, Button, Text, Tooltip } from '@primer/react'
import { selectionStore } from '../lib/selectionStore'
import { getAllInjectedItemIds, isEditableTarget } from '../lib/domUtils'
import { exportSelectedToCSV } from '../lib/csvExport'
import { sendMessage } from '../lib/messages'
import { queueStore } from '../lib/queueStore'
import { flyToTracker } from '../lib/flyAnimation'
import { DeepDuplicateModal } from './DeepDuplicateModal'
import { BulkEditWizard, type WizardStep, type ProjectField, type ProjectData } from './bulk/BulkEditWizard'
import { BulkCloseModal } from './bulk/BulkCloseModal'
import { BulkDeleteModal } from './bulk/BulkDeleteModal'
import { BulkOpenModal } from './bulk/BulkOpenModal'
import { BulkTransferModal } from './bulk/BulkTransferModal'
import { BulkLockModal } from './bulk/BulkLockModal'
import { BulkPinModal } from './bulk/BulkPinModal'
import { BulkUnpinModal } from './bulk/BulkUnpinModal'
import { BulkRenameModal } from './bulk/BulkRenameModal'
import { BulkMoveModal, type ReorderOp } from './bulk/BulkMoveModal'
import {
  ChevronDownIcon, CircleSlashIcon, TrashIcon, CopyIcon,
  ListCheckIcon, DownloadIcon, SyncIcon, LockIcon, PinIcon, UnpinIcon, ArrowRightIcon, XIcon, PencilIcon, MoveIcon,
} from './ui/primitives'

interface Props {
  projectId: string
  owner: string
  isOrg: boolean
  number: number
  getFields: () => Promise<ProjectData>
}

type ModalStep = 'CLOSED' | WizardStep

// ── Action menu item ────────────────────────────────────────

function MenuItem({ icon, iconBg, iconColor, label, badge, shortcutHint, onClick }: {
  icon: React.ReactNode
  iconBg: string
  iconColor: string
  label: string
  badge?: string
  shortcutHint?: string
  onClick: () => void
}) {
  return (
    <Box
      as="button"
      type="button"
      onClick={onClick}
      sx={{
        display: 'flex', alignItems: 'center', gap: '6px',
        width: '100%', px: 2, py: '4px',
        bg: 'transparent', border: 'none', cursor: 'pointer',
        fontSize: 0, fontWeight: 500, color: 'fg.default', textAlign: 'left',
        borderRadius: 1,
        transition: 'background-color 120ms ease, transform 80ms ease',
        ':hover': { bg: 'canvas.subtle' },
        ':active': { transform: 'scale(0.97)', bg: 'canvas.subtle' },
        '@media (prefers-reduced-motion: reduce)': { transition: 'none', ':active': { transform: 'none' } },
      }}
    >
      <Box sx={{
        width: 22, height: 22, borderRadius: 2,
        bg: iconBg, color: iconColor,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        {icon}
      </Box>
      <Text sx={{ flex: 1, fontSize: 0 }}>{label}</Text>
      {badge && (
        <Box sx={{ fontSize: 0, fontWeight: 'bold', px: 1, py: '1px', borderRadius: 2, bg: 'danger.subtle', color: 'danger.fg', flexShrink: 0 }}>
          {badge}
        </Box>
      )}
      {shortcutHint && (
        <Box as="kbd" sx={{
          fontSize: 0, fontFamily: 'inherit', fontWeight: 500,
          px: '5px', py: '1px', borderRadius: 1,
          bg: 'canvas.inset', border: '1px solid', borderColor: 'border.default',
          color: 'fg.muted', cursor: 'default', lineHeight: 1.6, flexShrink: 0,
          letterSpacing: '0.02em',
        }}>
          {shortcutHint}
        </Box>
      )}
    </Box>
  )
}

function GroupLabel({ label }: { label: string }) {
  return (
    <Text sx={{
      display: 'block', px: 2, pt: '6px', pb: '2px',
      fontSize: 0, fontWeight: 'semibold', color: 'fg.subtle',
      textTransform: 'uppercase', letterSpacing: '0.08em',
    }}>
      {label}
    </Text>
  )
}

// ── Platform detection ──────────────────────────────────────
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
/** Returns the display string for a Ctrl/Cmd+Shift+key shortcut */
function shortcut(key: string) { return isMac ? `⌘⇧${key}` : `⌃⇧${key}` }

// ── Main component ──────────────────────────────────────────

export function BulkActionsBar({ projectId, owner, isOrg, number, getFields }: Props) {
  const [count, setCount] = useState(() => selectionStore.count())
  const [projectData, setProjectData] = useState<ProjectData | null>(null)
  const [firstRepoName, setFirstRepoName] = useState('')
  const [tokenStatusError, setTokenStatusError] = useState<string | null>(null)

  const [step, setStep] = useState<ModalStep>('CLOSED')
  const [selectedFields, setSelectedFields] = useState<ProjectField[]>([])
  const [fieldValues, setFieldValues] = useState<Record<string, unknown>>({})
  const [concurrentError, setConcurrentError] = useState(false)
  const [showDupModal, setShowDupModal] = useState(false)
  const applyBtnRef = useRef<HTMLButtonElement | null>(null)
  const actionsButtonRef = useRef<HTMLButtonElement | null>(null)

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
  const menuRef = useRef<HTMLDivElement>(null)

  const anyModalOpen = showCloseModal || showOpenModal || showDeleteModal ||
    showLockModal || showPinModal || showTransferModal || showDupModal || showRenameModal || showMoveModal

  // Selection subscription
  useEffect(() => {
    return selectionStore.subscribe(() => {
      const newCount = selectionStore.count()
      setCount(newCount)
      if (newCount === 0) {
        setStep('CLOSED')
        setMenuOpen(false)
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
    const rect = applyBtnRef.current?.getBoundingClientRect()
    if (rect) flyToTracker(rect)
    const itemIds = selectionStore.getAll()
    const updates = selectedFields.map(field => ({
      fieldId: field.id,
      value: { ...(fieldValues[field.id] as Record<string, unknown> || {}), dataType: field.dataType },
    }))
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
    sendMessage('bulkUpdate', { itemIds, projectId: projectData?.id || projectId, updates, fieldMeta })
    setStep('CLOSED')
    selectionStore.clear()
    setSelectedFields([])
    setFieldValues({})
  }

  async function handleFieldSelectionOpen() {
    if (await checkToken()) {
      setStep('FIELDS')
      setSelectedFields([])
      setFieldValues({})
    }
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
          concurrentError={concurrentError}
          owner={owner}
          firstRepoName={firstRepoName}
          applyBtnRef={applyBtnRef}
          onClose={() => setStep('CLOSED')}
          onToggleField={f => setSelectedFields(prev =>
            prev.some(x => x.id === f.id) ? prev.filter(x => x.id !== f.id) : [...prev, f]
          )}
          onUpdateFieldValue={(id, v) => setFieldValues(prev => ({ ...prev, [id]: v }))}
          onSetSelectedFields={setSelectedFields}
          onGoToStep={s => setStep(s)}
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

      {/* Deep Duplicate modal */}
      {showDupModal && (
        <DeepDuplicateModal
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

      {/* ── Persistent bottom bar ── */}
      <Box sx={{
        position: 'fixed', left: '50%', bottom: 4,
        transform: 'translateX(-50%)',
        width: 'min(760px, calc(100vw - 32px))',
        zIndex: 9999,
        bg: 'canvas.overlay', border: '1px solid', borderColor: 'border.default',
        borderRadius: 2, px: 4, py: 3,
        boxShadow: 'shadow.large',
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
            {/* Accent pill */}
            <Box sx={{
              display: 'inline-flex', alignItems: 'center',
              px: 2, py: '3px', borderRadius: '20px',
              bg: 'accent.subtle', color: 'accent.fg',
              border: '1px solid', borderColor: 'accent.muted',
              fontWeight: 'bold', fontSize: 1, lineHeight: 1.4,
            }}>
              {count} {count === 1 ? 'item' : 'items'}
            </Box>
            <Text sx={{ fontSize: 0, color: 'fg.muted', flexShrink: 0 }}>selected</Text>
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
                transition: 'transform 80ms ease',
                ':active': { transform: 'scale(0.97)' },
                '@media (prefers-reduced-motion: reduce)': { transition: 'none', ':active': { transform: 'none' } },
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
              <Box
                sx={{
                  display: 'inline-flex', alignItems: 'center', ml: '2px',
                  transform: menuOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                  transition: 'transform 150ms ease',
                  '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
                }}
              >
                <ChevronDownIcon size={12} />
              </Box>
            </Button>

            {menuOpen && (
              <Box sx={{
                position: 'absolute', bottom: 'calc(100% + 6px)', left: 0,
                minWidth: 220, bg: 'canvas.overlay', border: '1px solid', borderColor: 'border.default',
                borderRadius: 2, zIndex: 9999, py: 1, px: 1, overflow: 'hidden',
                boxShadow: 'shadow.large',
              }}>
                <GroupLabel label="Fields" />
                <MenuItem
                  icon={<ListCheckIcon size={13} />}
                  iconBg="accent.subtle" iconColor="accent.fg"
                  label="Edit Fields"
                  shortcutHint={shortcut('E')}
                  onClick={() => { setMenuOpen(false); handleFieldSelectionOpen() }}
                />
                {count === 1 && (
                  <MenuItem
                    icon={<CopyIcon size={13} />}
                    iconBg="done.subtle" iconColor="done.fg"
                    label="Deep Duplicate"
                    shortcutHint={shortcut('D')}
                    onClick={() => { setMenuOpen(false); checkToken().then(ok => ok && setShowDupModal(true)) }}
                  />
                )}
                <GroupLabel label="Content" />
                <MenuItem
                  icon={<PencilIcon size={13} />}
                  iconBg="accent.subtle" iconColor="accent.fg"
                  label="Rename Titles"
                  shortcutHint={shortcut('R')}
                  onClick={handleBulkRename}
                />
                <MenuItem
                  icon={<MoveIcon size={13} />}
                  iconBg="accent.subtle" iconColor="accent.fg"
                  label="Reorder Items"
                  shortcutHint={shortcut('J')}
                  onClick={handleBulkReorder}
                />
                <GroupLabel label="Status" />
                <MenuItem
                  icon={<CircleSlashIcon size={13} />}
                  iconBg="attention.subtle" iconColor="attention.fg"
                  label="Close Issues"
                  shortcutHint={shortcut('X')}
                  onClick={handleBulkClose}
                />
                <MenuItem
                  icon={<SyncIcon size={13} />}
                  iconBg="success.subtle" iconColor="success.fg"
                  label="Reopen Issues"
                  shortcutHint={shortcut('O')}
                  onClick={handleBulkOpen}
                />
                <MenuItem
                  icon={<LockIcon size={13} />}
                  iconBg="attention.subtle" iconColor="attention.fg"
                  label="Lock Conversations"
                  shortcutHint={shortcut('L')}
                  onClick={handleLock}
                />
                <GroupLabel label="Visibility" />
                <MenuItem
                  icon={<PinIcon size={13} />}
                  iconBg="accent.subtle" iconColor="accent.fg"
                  label="Pin Issues"
                  shortcutHint={shortcut('F')}
                  onClick={handlePin}
                />
                <MenuItem
                  icon={<UnpinIcon size={13} />}
                  iconBg="accent.subtle" iconColor="accent.fg"
                  label="Unpin"
                  onClick={handleUnpin}
                />
                <GroupLabel label="Move" />
                <MenuItem
                  icon={<ArrowRightIcon size={13} />}
                  iconBg="done.subtle" iconColor="done.fg"
                  label="Transfer Issues"
                  shortcutHint={shortcut('M')}
                  onClick={handleTransfer}
                />
                <Box sx={{ height: '1px', bg: 'border.default', my: 1 }} />
                <MenuItem
                  icon={<DownloadIcon size={13} />}
                  iconBg="success.subtle" iconColor="success.fg"
                  label="Export CSV"
                  shortcutHint={shortcut('V')}
                  onClick={() => { setMenuOpen(false); exportSelectedToCSV() }}
                />
                <Box sx={{ height: '1px', bg: 'border.default', my: 1 }} />
                <MenuItem
                  icon={<TrashIcon size={13} />}
                  iconBg="danger.subtle" iconColor="danger.fg"
                  label="Delete"
                  badge="admin"
                  shortcutHint={isMac ? '⌘⇧⌫' : '⌃⇧⌫'}
                  onClick={handleBulkDelete}
                />
              </Box>
            )}
          </Box>

          {/* Spacer + clear */}
          <Box sx={{ flex: 1 }} />
          <Tooltip text="Clear selection (Esc)" direction="n">
            <Button
              variant="invisible"
              size="small"
              onClick={() => selectionStore.clear()}
              aria-label="Clear selection"
              sx={{
                color: 'fg.muted', boxShadow: 'none', p: '5px',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                transition: 'transform 80ms ease, color 120ms ease',
                ':hover': { color: 'fg.default', bg: 'canvas.subtle' },
                ':active': { transform: 'scale(0.88)', color: 'fg.default' },
                '@media (prefers-reduced-motion: reduce)': { transition: 'none', ':active': { transform: 'none' } },
              }}
            >
              <XIcon size={14} />
            </Button>
          </Tooltip>
        </Box>
      </Box>
    </>
  )
}
