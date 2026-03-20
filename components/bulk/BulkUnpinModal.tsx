import React from 'react'
import { Box, Button, Heading, Text } from '@primer/react'
import { XIcon } from '../ui/primitives'

interface Props {
  count: number
  onClose: () => void
  onConfirm: () => void
}

export function BulkUnpinModal({ count, onClose, onConfirm }: Props) {
  return (
    <Box sx={{ position: 'fixed', inset: 0, bg: 'rgba(27,31,36,0.5)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Box sx={{ bg: 'canvas.overlay', border: '1px solid', borderColor: 'border.default', borderRadius: 2, width: '100%', maxWidth: 480, overflow: 'hidden' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 4, py: 3, borderBottom: '1px solid', borderColor: 'border.default' }}>
          <Heading as="h2" sx={{ fontSize: 3, fontWeight: 'bold', m: 0 }}>Unpin Issues</Heading>
          <Button variant="invisible" size="small" onClick={onClose} aria-label="Close" sx={{ p: '4px', minWidth: 'unset', color: 'fg.muted' }}>
            <XIcon size={16} />
          </Button>
        </Box>

        <Box sx={{ px: 4, py: 3 }}>
          <Text as="p" sx={{ m: 0, fontSize: 1, color: 'fg.default' }}>
            Unpin {count} issue{count !== 1 ? 's' : ''} from their repository?
          </Text>
        </Box>

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, px: 4, pb: 3 }}>
          <Button variant="default" onClick={onClose} sx={{ boxShadow: 'none' }}>Cancel</Button>
          <Button variant="primary" onClick={onConfirm} sx={{ boxShadow: 'none' }}>
            Unpin Issue{count !== 1 ? 's' : ''} →
          </Button>
        </Box>
      </Box>
    </Box>
  )
}
