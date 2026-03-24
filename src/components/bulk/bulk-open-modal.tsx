import React from 'react'
import { Box, Button, Text } from '@primer/react'
import { IssueReopenedIcon } from '../ui/primitives'
import { ModalStepHeader } from '../ui/modal-step-header'
import { Z_MODAL } from '../../lib/z-index'

interface Props {
  count: number
  onClose: () => void
  onConfirm: () => void
}

export function BulkOpenModal({ count, onClose, onConfirm }: Props) {
  return (
    <Box sx={{ position: 'fixed', inset: 0, bg: 'rgba(27,31,36,0.5)', zIndex: Z_MODAL, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Box sx={{ bg: 'canvas.overlay', border: '1px solid', borderColor: 'border.default', borderRadius: 2, width: '100%', maxWidth: 480, overflow: 'hidden' }}>
        <ModalStepHeader title="Reopen Issues" icon={<IssueReopenedIcon size={16} />} onClose={onClose} />

        {/* Body */}
        <Box sx={{ px: 4, py: 3 }}>
          <Text as="p" sx={{ m: 0, fontSize: 1, color: 'fg.default' }}>
            Reopen {count} issue{count !== 1 ? 's' : ''}?
          </Text>
          <Text as="p" sx={{ m: 0, mt: 2, fontSize: 1, color: 'fg.muted' }}>
            Only closed issues will be affected. Open issues are left unchanged.
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
          <Button variant="primary" onClick={onConfirm} sx={{
            boxShadow: 'none',
            transition: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
            '&:hover:not(:disabled)': { transform: 'translateY(-1px)' },
            '&:active': { transform: 'translateY(0)', transition: '100ms' },
            '@media (prefers-reduced-motion: reduce)': {
              transition: 'none',
              '&:hover:not(:disabled)': { transform: 'none' },
            },
          }}>
            Reopen Issue{count !== 1 ? 's' : ''} →
          </Button>
        </Box>
      </Box>
    </Box>
  )
}
