import React from 'react'
import { Text } from '@primer/react'
import { IssueReopenedIcon } from '@/ui/icons'
import { createModal } from '@/lib/modal-factory'

export const BulkOpenModal = createModal<{ count: number; onConfirm: () => void }>({
  name: 'Reopen Issues',
  icon: <IssueReopenedIcon size={16} />,
  renderContent: ({ count }) => (
    <>
      <Text as="p" sx={{ m: 0, fontSize: 1, color: 'fg.default' }}>
        Reopen {count} issue{count !== 1 ? 's' : ''}?
      </Text>
      <Text as="p" sx={{ m: 0, mt: 2, fontSize: 1, color: 'fg.muted' }}>
        Only closed issues will be affected. Open issues are left unchanged.
      </Text>
    </>
  ),
  onSubmit: async ({ onConfirm }) => {
    onConfirm()
  },
  confirmLabel: 'Reopen Issues',
})
