import React from 'react'
import { Box, Button, Heading, Text } from '@primer/react'
import { XIcon } from '../ui/primitives'

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
  return (
    <Box sx={{ position: 'fixed', inset: 0, bg: 'rgba(27,31,36,0.5)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Box sx={{ bg: 'canvas.overlay', border: '1px solid', borderColor: 'border.default', borderRadius: 2, width: '100%', maxWidth: 480, overflow: 'hidden' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 4, py: 3, borderBottom: '1px solid', borderColor: 'border.default' }}>
          <Heading as="h2" sx={{ fontSize: 3, fontWeight: 'bold', m: 0 }}>Lock Conversations</Heading>
          <Button variant="invisible" size="small" onClick={onClose} aria-label="Close" sx={{ p: '4px', minWidth: 'unset', color: 'fg.muted' }}>
            <XIcon size={16} />
          </Button>
        </Box>

        <Box sx={{ px: 4, py: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Text as="p" sx={{ m: 0, mb: 1, fontSize: 1, color: 'fg.muted' }}>
            Lock conversations on {count} issue{count !== 1 ? 's' : ''}:
          </Text>
          {REASONS.map(({ id, label, sublabel }) => {
            const isSelected = lockReason === id
            return (
              <Box key={String(id)} as="button" type="button" onClick={() => onChangeReason(id)}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 3, width: '100%', p: 3,
                  border: '1px solid', borderColor: isSelected ? 'accent.emphasis' : 'border.default',
                  borderRadius: 2, bg: isSelected ? 'accent.subtle' : 'transparent',
                  cursor: 'pointer', textAlign: 'left', transition: 'all 150ms ease',
                  '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
                }}
              >
                <Box sx={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid', borderColor: isSelected ? 'accent.emphasis' : 'border.default', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {isSelected && <Box sx={{ width: 8, height: 8, borderRadius: '50%', bg: 'accent.emphasis' }} />}
                </Box>
                <Box>
                  <Text sx={{ fontSize: 1, fontWeight: 'bold', color: 'fg.default', display: 'block' }}>{label}</Text>
                  <Text sx={{ fontSize: 0, color: 'fg.muted', display: 'block', mt: '2px' }}>{sublabel}</Text>
                </Box>
              </Box>
            )
          })}
        </Box>

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, px: 4, pb: 3 }}>
          <Button variant="default" onClick={onClose} sx={{ boxShadow: 'none' }}>Cancel</Button>
          <Button variant="primary" onClick={onConfirm} sx={{ boxShadow: 'none' }}>
            Lock Conversation{count !== 1 ? 's' : ''} →
          </Button>
        </Box>
      </Box>
    </Box>
  )
}
