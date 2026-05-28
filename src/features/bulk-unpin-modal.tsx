import React from 'react'
import { Text } from '@primer/react'
import { UnpinIcon } from '@/ui/icons'
import { createModal } from '@/lib/modal-factory'

export const BulkUnpinModal = createModal<{ count: number; onConfirm: () => void }>({
  name: 'Unpin Issues',
  icon: <UnpinIcon size={16} />,
  renderContent: ({ count }) => (
    <Text as="p" sx={{ m: 0, fontSize: 1, color: 'fg.default' }}>
      Unpin {count} issue{count !== 1 ? 's' : ''} from their repository?
    </Text>
  ),
  onSubmit: async ({ onConfirm }) => {
    onConfirm()
  },
  confirmLabel: 'Unpin Issues',
})
