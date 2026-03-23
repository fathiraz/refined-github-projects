import React from 'react'
import { Box, Button, Heading, Text } from '@primer/react'
import { XIcon } from '../ui/primitives'
import { Z_MODAL } from '../../lib/z-index'

interface Props {
  count: number
  onClose: () => void
  onConfirm: () => void
}

export function BulkPinModal({ count, onClose, onConfirm }: Props) {
  return (
    <Box sx={{ position: 'fixed', inset: 0, bg: 'rgba(27,31,36,0.5)', zIndex: Z_MODAL, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Box sx={{ bg: 'canvas.overlay', border: '1px solid', borderColor: 'border.default', borderRadius: 2, width: '100%', maxWidth: 480, overflow: 'hidden' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 4, py: 3, borderBottom: '1px solid', borderColor: 'border.default' }}>
          <Heading as="h2" sx={{ fontSize: 3, fontWeight: 'bold', m: 0 }}>Pin Issues</Heading>
          <Button variant="invisible" size="small" onClick={onClose} aria-label="Close" sx={{ p: '4px', minWidth: 'unset', color: 'fg.muted' }}>
            <XIcon size={16} />
          </Button>
        </Box>

        <Box sx={{ px: 4, py: 3 }}>
          <Text as="p" sx={{ m: 0, fontSize: 1, color: 'fg.default' }}>
            Pin {count} issue{count !== 1 ? 's' : ''} to their repository?
          </Text>
          <Text as="p" sx={{ m: 0, mt: 2, fontSize: 1, color: 'fg.muted' }}>
            GitHub allows a maximum of 3 pinned issues per repository.
          </Text>
        </Box>

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
            Pin Issue{count !== 1 ? 's' : ''} →
          </Button>
        </Box>
      </Box>
    </Box>
  )
}
