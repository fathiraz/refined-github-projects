import React from 'react'
import { Text } from '@primer/react'
import { PinIcon } from '@/ui/icons'
import { createModal } from '@/lib/modal-factory'

export const BulkPinModal = createModal<{ count: number; onConfirm: () => void }>({
  name: 'Pin Issues',
  icon: <PinIcon size={16} />,
  renderContent: ({ count }) => (
    <>
      <Text as="p" sx={{ m: 0, fontSize: 1, color: 'fg.default' }}>
        Pin {count} issue{count !== 1 ? 's' : ''} to their repository?
      </Text>
      <Text as="p" sx={{ m: 0, mt: 2, fontSize: 1, color: 'fg.muted' }}>
        GitHub allows a maximum of 3 pinned issues per repository.
      </Text>
    </>
  ),
  onSubmit: async ({ onConfirm }) => {
    onConfirm()
  },
  confirmLabel: 'Pin Issues',
})
