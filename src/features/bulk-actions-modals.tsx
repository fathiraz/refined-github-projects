// portals all bulk-action modals (lazy + direct) keyed off boolean flags.

import React, { Suspense } from 'react'
import { selectionStore } from '@/lib/selection-store'
import type { BulkEditRelationshipsUpdate } from '@/lib/messages'
import type {
  ProjectData,
  ProjectField,
  RelationshipSelectionState,
  WizardStep,
} from '@/features/bulk-edit-modal'
import type { ReorderOp } from '@/features/bulk-move-modal'
import { BulkCloseModal } from '@/features/bulk-close-modal'
import { BulkDeleteModal } from '@/features/bulk-delete-modal'
import { BulkOpenModal } from '@/features/bulk-open-modal'
import { BulkTransferModal } from '@/features/bulk-transfer-modal'
import { BulkLockModal } from '@/features/bulk-lock-modal'
import { BulkPinModal } from '@/features/bulk-pin-modal'
import { BulkUnpinModal } from '@/features/bulk-unpin-modal'
import { KeyboardHelpOverlay } from '@/features/keyboard-help-overlay'
import { ModalLoadingFallback } from '@/features/bulk-actions-utils'

const LazyBulkEditWizard = React.lazy(() =>
  import('@/features/bulk-edit-modal').then((m) => ({ default: m.BulkEditWizard })),
)
const LazyBulkDuplicateModal = React.lazy(() =>
  import('@/features/bulk-duplicate-modal').then((m) => ({ default: m.BulkDuplicateModal })),
)
const LazyBulkRenameModal = React.lazy(() =>
  import('@/features/bulk-rename-modal').then((m) => ({ default: m.BulkRenameModal })),
)
const LazyBulkMoveModal = React.lazy(() =>
  import('@/features/bulk-move-modal').then((m) => ({ default: m.BulkMoveModal })),
)
const LazyBulkRandomAssignModal = React.lazy(() =>
  import('@/features/bulk-random-assign-modal').then((m) => ({ default: m.BulkRandomAssignModal })),
)

type ModalStep = 'CLOSED' | WizardStep

interface Props {
  // wizard
  step: ModalStep
  count: number
  projectData: ProjectData | null
  selectedFields: ProjectField[]
  fieldValues: Record<string, unknown>
  relationshipUpdates: BulkEditRelationshipsUpdate
  relationshipSelection: RelationshipSelectionState
  hasChanges: boolean
  bulkUpdateValidationErrors: string[]
  concurrentError: boolean
  owner: string
  isOrg: boolean
  number: number
  projectId: string
  firstRepoName: string
  applyBtnRef: React.MutableRefObject<HTMLButtonElement | null>
  onWizardClose: () => void
  onToggleField: (f: ProjectField) => void
  onUpdateFieldValue: (id: string, v: unknown) => void
  onUpdateRelationships: (r: BulkEditRelationshipsUpdate) => void
  onUpdateRelationshipSelection: (s: RelationshipSelectionState) => void
  onSetSelectedFields: (fields: ProjectField[]) => void
  onGoToStep: (s: WizardStep) => void
  onApply: () => void
  onOpenOptions: () => void

  // close
  showCloseModal: boolean
  closeReason: 'COMPLETED' | 'NOT_PLANNED'
  onChangeCloseReason: (r: 'COMPLETED' | 'NOT_PLANNED') => void
  onCloseCloseModal: () => void
  onConfirmClose: () => void

  // open / delete
  showOpenModal: boolean
  onCloseOpenModal: () => void
  onConfirmOpen: () => void
  showDeleteModal: boolean
  onCloseDeleteModal: () => void
  onConfirmDelete: () => void

  // lock
  showLockModal: boolean
  lockReason: 'OFF_TOPIC' | 'TOO_HEATED' | 'RESOLVED' | 'SPAM' | null
  onChangeLockReason: (r: 'OFF_TOPIC' | 'TOO_HEATED' | 'RESOLVED' | 'SPAM' | null) => void
  onCloseLockModal: () => void
  onConfirmLock: () => void

  // pin
  showPinModal: boolean
  onClosePinModal: () => void
  onConfirmPin: () => void
  showUnpinModal: boolean
  onCloseUnpinModal: () => void
  onConfirmUnpin: () => void

  // transfer
  showTransferModal: boolean
  onCloseTransferModal: () => void
  onConfirmTransfer: (targetRepoOwner: string, targetRepoName: string) => void

  // duplicate
  showDupModal: boolean
  onCloseDupModal: () => void

  // rename
  showRenameModal: boolean
  onCloseRenameModal: () => void
  onConfirmRename: (
    renames: Array<{
      domId: string
      issueNodeId: string
      newTitle: string
      typename: 'Issue' | 'PullRequest'
    }>,
  ) => void

  // move
  showMoveModal: boolean
  onCloseMoveModal: () => void
  onConfirmReorder: (ops: ReorderOp[], resolvedProjectId: string, label: string) => void

  // random assign
  showRandomAssignModal: boolean
  onCloseRandomAssignModal: () => void
  onConfirmRandomAssign: (
    assignments: Map<string, string[]>,
    strategy: import('@/features/bulk-random-assign-utils').DistributionStrategy,
  ) => void

  // help
  showHelp: boolean
  onCloseHelp: () => void
}

export function BulkActionsModals(props: Props) {
  return (
    <>
      {props.step !== 'CLOSED' && (
        <Suspense fallback={<ModalLoadingFallback />}>
          <LazyBulkEditWizard
            count={props.count}
            step={props.step as WizardStep}
            projectData={props.projectData}
            selectedFields={props.selectedFields}
            fieldValues={props.fieldValues}
            relationships={props.relationshipUpdates}
            relationshipSelection={props.relationshipSelection}
            hasChanges={props.hasChanges}
            validationErrors={props.bulkUpdateValidationErrors}
            concurrentError={props.concurrentError}
            owner={props.owner}
            firstRepoName={props.firstRepoName}
            applyBtnRef={props.applyBtnRef}
            onClose={props.onWizardClose}
            onToggleField={props.onToggleField}
            onUpdateFieldValue={props.onUpdateFieldValue}
            onUpdateRelationships={props.onUpdateRelationships}
            onUpdateRelationshipSelection={props.onUpdateRelationshipSelection}
            onSetSelectedFields={props.onSetSelectedFields}
            onGoToStep={props.onGoToStep}
            onApply={props.onApply}
            onOpenOptions={props.onOpenOptions}
          />
        </Suspense>
      )}

      {props.showCloseModal && (
        <BulkCloseModal
          count={props.count}
          closeReason={props.closeReason}
          onChangeReason={props.onChangeCloseReason}
          onClose={props.onCloseCloseModal}
          onConfirm={props.onConfirmClose}
        />
      )}

      {props.showOpenModal && (
        <BulkOpenModal
          count={props.count}
          onClose={props.onCloseOpenModal}
          onConfirm={props.onConfirmOpen}
        />
      )}

      {props.showDeleteModal && (
        <BulkDeleteModal
          count={props.count}
          onClose={props.onCloseDeleteModal}
          onConfirm={props.onConfirmDelete}
        />
      )}

      {props.showLockModal && (
        <BulkLockModal
          count={props.count}
          lockReason={props.lockReason}
          onChangeReason={props.onChangeLockReason}
          onClose={props.onCloseLockModal}
          onConfirm={props.onConfirmLock}
        />
      )}

      {props.showPinModal && (
        <BulkPinModal
          count={props.count}
          onClose={props.onClosePinModal}
          onConfirm={props.onConfirmPin}
        />
      )}

      {props.showUnpinModal && (
        <BulkUnpinModal
          count={props.count}
          onClose={props.onCloseUnpinModal}
          onConfirm={props.onConfirmUnpin}
        />
      )}

      {props.showTransferModal && (
        <BulkTransferModal
          count={props.count}
          owner={props.owner}
          firstItemId={selectionStore.getAll()[0]}
          projectId={props.projectData?.id || props.projectId}
          onClose={props.onCloseTransferModal}
          onConfirm={props.onConfirmTransfer}
        />
      )}

      {props.showDupModal && (
        <Suspense fallback={<ModalLoadingFallback />}>
          <LazyBulkDuplicateModal
            itemId={selectionStore.getAll()[0]}
            projectId={props.projectData?.id || props.projectId}
            owner={props.owner}
            isOrg={props.isOrg}
            projectNumber={props.number}
            onClose={props.onCloseDupModal}
          />
        </Suspense>
      )}

      {props.showRenameModal && (
        <Suspense fallback={<ModalLoadingFallback />}>
          <LazyBulkRenameModal
            count={props.count}
            projectId={props.projectData?.id || props.projectId}
            itemIds={selectionStore.getAll()}
            onClose={props.onCloseRenameModal}
            onConfirm={props.onConfirmRename}
          />
        </Suspense>
      )}

      {props.showMoveModal && (
        <Suspense fallback={<ModalLoadingFallback />}>
          <LazyBulkMoveModal
            count={props.count}
            projectId={props.projectData?.id || props.projectId}
            itemIds={selectionStore.getAll()}
            owner={props.owner}
            number={props.number}
            isOrg={props.isOrg}
            onClose={props.onCloseMoveModal}
            onConfirm={props.onConfirmReorder}
          />
        </Suspense>
      )}

      {props.showHelp && <KeyboardHelpOverlay onClose={props.onCloseHelp} />}

      {props.showRandomAssignModal && (
        <Suspense fallback={<ModalLoadingFallback />}>
          <LazyBulkRandomAssignModal
            count={props.count}
            projectId={props.projectData?.id || props.projectId}
            owner={props.owner}
            repoName={props.firstRepoName}
            itemIds={selectionStore.getAll()}
            onClose={props.onCloseRandomAssignModal}
            onConfirm={props.onConfirmRandomAssign}
          />
        </Suspense>
      )}
    </>
  )
}
