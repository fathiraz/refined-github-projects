import React from 'react'

export const LazyBulkEditWizard = React.lazy(() =>
  import('./bulk-edit-modal').then((m) => ({ default: m.BulkEditWizard })),
)

export const LazyBulkDuplicateModal = React.lazy(() =>
  import('./bulk-duplicate-modal').then((m) => ({ default: m.BulkDuplicateModal })),
)

export const LazyBulkRenameModal = React.lazy(() =>
  import('./bulk-rename-modal').then((m) => ({ default: m.BulkRenameModal })),
)

export const LazyBulkMoveModal = React.lazy(() =>
  import('./bulk-move-modal').then((m) => ({ default: m.BulkMoveModal })),
)

export const LazyBulkRandomAssignModal = React.lazy(() =>
  import('./bulk-random-assign-modal').then((m) => ({ default: m.BulkRandomAssignModal })),
)
