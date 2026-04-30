import React from 'react'

export const LazyBulkEditWizard = React.lazy(() =>
  import('@/features/bulk-edit-modal').then((m) => ({ default: m.BulkEditWizard })),
)

export const LazyBulkDuplicateModal = React.lazy(() =>
  import('@/features/bulk-duplicate-modal').then((m) => ({ default: m.BulkDuplicateModal })),
)

export const LazyBulkRenameModal = React.lazy(() =>
  import('@/features/bulk-rename-modal').then((m) => ({ default: m.BulkRenameModal })),
)

export const LazyBulkMoveModal = React.lazy(() =>
  import('@/features/bulk-move-modal').then((m) => ({ default: m.BulkMoveModal })),
)

export const LazyBulkRandomAssignModal = React.lazy(() =>
  import('@/features/bulk-random-assign-modal').then((m) => ({ default: m.BulkRandomAssignModal })),
)
