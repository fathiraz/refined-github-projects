import React from 'react'
import { Box, Button, Flash, Heading, Text } from '@primer/react'
import { XIcon } from '../ui/primitives'

interface Props {
  count: number
  onClose: () => void
  onConfirm: () => void
}

export function BulkDeleteModal({ count, onClose, onConfirm }: Props) {
  return (
    <Box
      sx={{
        position: 'fixed', inset: 0,
        bg: 'rgba(27,31,36,0.5)', zIndex: 10000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <Box sx={{ bg: 'canvas.overlay', border: '1px solid', borderColor: 'border.default', borderRadius: 2, width: '100%', maxWidth: 480, overflow: 'hidden' }}>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 4, py: 3, borderBottom: '1px solid', borderColor: 'border.default' }}>
          <Heading as="h2" sx={{ fontSize: 3, fontWeight: 'bold', m: 0 }}>Delete</Heading>
          <Button variant="invisible" size="small" onClick={onClose} aria-label="Close" sx={{ p: '4px', minWidth: 'unset', color: 'fg.muted' }}>
            <XIcon size={16} />
          </Button>
        </Box>

        {/* Body */}
        <Box sx={{ px: 4, py: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Flash variant="warning">
            Removes {count} item{count !== 1 ? 's' : ''} from the project board. Underlying issues are not deleted.
          </Flash>
          <Text as="p" sx={{ m: 0, fontSize: 0, color: 'fg.muted' }}>
            Requires project admin access.
          </Text>
        </Box>

        {/* Footer */}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, px: 4, pb: 3 }}>
          <Button variant="default" onClick={onClose} sx={{ boxShadow: 'none' }}>Cancel</Button>
          <Button variant="danger" onClick={onConfirm} sx={{ boxShadow: 'none' }}>
            Remove {count} Item{count !== 1 ? 's' : ''} →
          </Button>
        </Box>
      </Box>
    </Box>
  )
}
