// Portals modal-keeper bulk-action modals — close / reopen / delete / lock /
// pin / unpin / transfer / duplicate plus the keyboard help overlay. The
// retired modal verbs (edit fields, rename, reorder, random assign) now
// live in their respective anchored flyouts mounted by the bar.

import React, { Suspense } from 'react'
import { selectionStore } from '@/lib/selection-store'
import { BulkCloseModal } from '@/features/bulk-close-modal'
import { BulkDeleteModal } from '@/features/bulk-delete-modal'
import { BulkOpenModal } from '@/features/bulk-open-modal'
import { BulkTransferModal } from '@/features/bulk-transfer-modal'
import { BulkLockModal } from '@/features/bulk-lock-modal'
import { BulkPinModal } from '@/features/bulk-pin-modal'
import { BulkUnpinModal } from '@/features/bulk-unpin-modal'
import { KeyboardHelpOverlay } from '@/features/keyboard-help-overlay'
import { ModalLoadingFallback } from '@/features/bulk-actions-utils'

const LazyBulkDuplicateModal = React.lazy(() =>
  import('@/features/bulk-duplicate-modal').then((m) => ({ default: m.BulkDuplicateModal })),
)

interface Props {
  count: number
  projectIdResolved: string
  owner: string
  isOrg: boolean
  number: number
  firstRepoName: string

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
  deleteItemTitles?: string[]
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
  onConfirmTransfer: (
    targetRepoOwner: string,
    targetRepoName: string,
    eligibleItemIds?: readonly string[],
  ) => void

  // duplicate
  showDupModal: boolean
  onCloseDupModal: () => void

  // help
  showHelp: boolean
  onCloseHelp: () => void
}

export function BulkActionsModals(props: Props) {
  return (
    <>
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
          itemTitles={props.deleteItemTitles}
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
          itemIds={selectionStore.getAll()}
          projectId={props.projectIdResolved}
          onClose={props.onCloseTransferModal}
          onConfirm={props.onConfirmTransfer}
        />
      )}

      {props.showDupModal && (
        <Suspense fallback={<ModalLoadingFallback />}>
          <LazyBulkDuplicateModal
            itemId={selectionStore.getAll()[0]}
            projectId={props.projectIdResolved}
            owner={props.owner}
            isOrg={props.isOrg}
            projectNumber={props.number}
            onClose={props.onCloseDupModal}
          />
        </Suspense>
      )}

      {props.showHelp && <KeyboardHelpOverlay onClose={props.onCloseHelp} />}
    </>
  )
}
