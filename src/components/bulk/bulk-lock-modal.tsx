import React, { useEffect } from 'react'
import Tippy from '../ui/tooltip'
import { CheckCircleFillIcon, CircleIcon } from '@primer/octicons-react'
import { Box, Button, Text } from '@primer/react'
import { LockIcon } from '../ui/primitives'
import { ModalStepHeader } from '../ui/modal-step-header'
import { ensureTippyCss } from '../../lib/tippy-utils'
import { Z_MODAL, Z_TOOLTIP } from '../../lib/z-index'

type LockReason = 'OFF_TOPIC' | 'TOO_HEATED' | 'RESOLVED' | 'SPAM' | null

const REASONS: { id: LockReason; label: string; sublabel: string }[] = [
  { id: null, label: 'No reason', sublabel: 'Lock without specifying a reason' },
  { id: 'OFF_TOPIC', label: 'Off-topic', sublabel: 'Conversation went off-topic' },
  { id: 'TOO_HEATED', label: 'Too heated', sublabel: 'Discussion became too heated' },
  { id: 'RESOLVED', label: 'Resolved', sublabel: 'Conversation is resolved' },
  { id: 'SPAM', label: 'Spam', sublabel: 'Contains spam' },
]

interface Props {
  count: number
  lockReason: LockReason
  onChangeReason: (r: LockReason) => void
  onClose: () => void
  onConfirm: () => void
}

export function BulkLockModal({ count, lockReason, onChangeReason, onClose, onConfirm }: Props) {
  useEffect(() => {
    ensureTippyCss()
  }, [])

  return (
    <Box sx={{ position: 'fixed', inset: 0, bg: 'rgba(27,31,36,0.5)', zIndex: Z_MODAL, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Box sx={{ bg: 'canvas.overlay', border: '1px solid', borderColor: 'border.default', borderRadius: 2, width: '100%', maxWidth: 480, overflow: 'hidden' }}>
        <ModalStepHeader title="Lock Conversations" icon={<LockIcon size={16} />} onClose={onClose} />

        <Box sx={{ px: 4, py: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Text as="p" sx={{ m: 0, mb: 1, fontSize: 1, color: 'fg.muted' }}>
            Lock conversations on {count} issue{count !== 1 ? 's' : ''}:
          </Text>
          {REASONS.map(({ id, label, sublabel }) => {
            const isSelected = lockReason === id
            const SelectionIcon = isSelected ? CheckCircleFillIcon : CircleIcon
            return (
              <Tippy key={String(id)} content={`Choose "${label}" as the lock reason.`} delay={[400, 0]} placement="top" zIndex={Z_TOOLTIP}>
                <Box
                  as="button"
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => onChangeReason(id)}
                  sx={{
                    display: 'flex', alignItems: 'center', gap: 3, width: '100%', p: 3,
                    border: '1px solid', borderColor: isSelected ? 'accent.emphasis' : 'border.default',
                    borderRadius: 2, bg: isSelected ? 'accent.subtle' : 'transparent',
                    cursor: 'pointer', textAlign: 'left', transition: 'all 150ms ease',
                    '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: isSelected ? 'accent.fg' : 'fg.muted' }}>
                    <SelectionIcon size={16} fill="currentColor" />
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Text sx={{ fontSize: 1, fontWeight: 'bold', color: 'fg.default', display: 'block' }}>{label}</Text>
                    <Text sx={{ fontSize: 0, color: 'fg.muted', display: 'block', mt: '2px' }}>{sublabel}</Text>
                  </Box>
                </Box>
              </Tippy>
            )
          })}
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
            Lock Conversation{count !== 1 ? 's' : ''} →
          </Button>
        </Box>
      </Box>
    </Box>
  )
}
