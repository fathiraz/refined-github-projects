// Modal-keeper bulk-action modals — delete / transfer / duplicate plus keyboard help.

import React, { Suspense } from 'react'
import { selectionStore } from '@/lib/selection-store'
import { BulkCloseModal } from '@/features/bulk-close-modal'
import { BulkDeleteModal } from '@/features/bulk-delete-modal'
import { BulkTransferModal } from '@/features/bulk-transfer-modal'
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

  showCloseModal: boolean
  closeReason: 'COMPLETED' | 'NOT_PLANNED'
  onChangeCloseReason: (r: 'COMPLETED' | 'NOT_PLANNED') => void
  onCloseCloseModal: () => void
  onConfirmClose: () => void

  showDeleteModal: boolean
  deleteItemTitles?: string[]
  onCloseDeleteModal: () => void
  onConfirmDelete: () => void

  showTransferModal: boolean
  onCloseTransferModal: () => void
  onConfirmTransfer: (
    targetRepoOwner: string,
    targetRepoName: string,
    eligibleItemIds?: readonly string[],
  ) => void

  showDupModal: boolean
  onCloseDupModal: () => void

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

      {props.showDeleteModal && (
        <BulkDeleteModal
          count={props.count}
          itemTitles={props.deleteItemTitles}
          onClose={props.onCloseDeleteModal}
          onConfirm={props.onConfirmDelete}
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
