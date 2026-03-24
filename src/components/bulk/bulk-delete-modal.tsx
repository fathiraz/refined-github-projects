import React from 'react'
import { Box, Button, Flash, Text } from '@primer/react'
import { TrashIcon } from '../ui/primitives'
import { ModalStepHeader } from '../ui/modal-step-header'
import { Z_MODAL } from '../../lib/z-index'

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
        bg: 'rgba(27,31,36,0.5)', zIndex: Z_MODAL,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <Box sx={{ bg: 'canvas.overlay', border: '1px solid', borderColor: 'border.default', borderRadius: 2, width: '100%', maxWidth: 480, overflow: 'hidden' }}>
        <ModalStepHeader title="Delete" icon={<TrashIcon size={16} />} onClose={onClose} />

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
          <Button variant="default" onClick={onClose} sx={{
              boxShadow: 'none',
              transition: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
              '&:hover:not(:disabled)': { transform: 'translateY(-1px)' },
              '&:active': { transform: 'translateY(0)', transition: '100ms' },
              '@media (prefers-reduced-motion: reduce)': {
                transition: 'none',
                '&:hover:not(:disabled)': { transform: 'none' },
              },
            }}>Cancel</Button>
          <Button variant="danger" onClick={onConfirm} sx={{
              boxShadow: 'none',
              transition: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
              '&:hover:not(:disabled)': { transform: 'translateY(-1px)' },
              '&:active': { transform: 'translateY(0)', transition: '100ms' },
              '@media (prefers-reduced-motion: reduce)': {
                transition: 'none',
                '&:hover:not(:disabled)': { transform: 'none' },
              },
            }}>
            Remove {count} Item{count !== 1 ? 's' : ''} →
          </Button>
        </Box>
      </Box>
    </Box>
  )
}
