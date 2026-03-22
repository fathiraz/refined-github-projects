import React, { useEffect, useState } from 'react'
import { Box, Button, Flash, Text } from '@primer/react'
import { toastStore, type ToastEntry } from '../lib/toastStore'
import { AlertIcon, CheckIcon, InfoIcon, XIcon } from './ui/primitives'

const FLASH_VARIANT: Record<ToastEntry['type'], 'success' | 'warning' | 'danger' | 'default'> = {
  success: 'success',
  warning: 'warning',
  error:   'danger',
  info:    'default',
}

// Used only for the auto-dismiss countdown bar fill color
const ACCENT_CSS: Record<ToastEntry['type'], string> = {
  success: 'var(--color-success-emphasis)',
  warning: 'var(--color-attention-emphasis)',
  error:   'var(--color-danger-emphasis)',
  info:    'var(--color-accent-emphasis)',
}

function TypeIcon({ type }: { type: ToastEntry['type'] }) {
  switch (type) {
    case 'success': return <CheckIcon size={14} />
    case 'warning': return <AlertIcon size={14} />
    case 'error':   return <XIcon size={14} />
    default:        return <InfoIcon size={14} />
  }
}

function ToastCard({ toast }: { toast: ToastEntry }) {
  return (
    <Flash
      variant={FLASH_VARIANT[toast.type]}
      sx={{
        position: 'relative', overflow: 'hidden', p: 2,
        animation: 'rgp-toast-in 200ms cubic-bezier(0.4, 0, 0.2, 1)',
        '@keyframes rgp-toast-in': {
          from: { transform: 'translateX(-12px)', opacity: 0 },
          to:   { transform: 'translateX(0)',     opacity: 1 },
        },
        '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
        <Box sx={{ flexShrink: 0, mt: '2px' }}>
          <TypeIcon type={toast.type} />
        </Box>
        <Text sx={{
          flex: 1, fontSize: 1, lineHeight: 1.45, color: 'fg.default',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
          overflow: 'hidden',
        }}>
          {toast.message}
        </Text>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
          {toast.action && (
            <Button
              variant="invisible"
              size="small"
              onClick={toast.action.onClick}
              sx={{ px: 1, py: '2px', fontSize: 0, fontWeight: 'bold', color: 'accent.fg', boxShadow: 'none' }}
            >
              {toast.action.label}
            </Button>
          )}
          <Button
            variant="invisible"
            size="small"
            onClick={() => toastStore.dismiss(toast.id)}
            aria-label="Dismiss"
            sx={{ p: '2px', minWidth: 'unset', color: 'fg.muted', boxShadow: 'none' }}
          >
            <XIcon size={13} />
          </Button>
        </Box>
      </Box>

      {/* Auto-dismiss progress bar (drains over 5s) */}
      <Box sx={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '2px', bg: 'canvas.subtle' }}>
        <Box
          sx={{
            height: '100%',
            animation: 'rgp-toast-bar 5s linear forwards',
            '@keyframes rgp-toast-bar': {
              from: { width: '100%' },
              to:   { width: '0%' },
            },
            '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
          }}
          style={{ background: ACCENT_CSS[toast.type] }}
        />
      </Box>
    </Flash>
  )
}

export function ToastList() {
  const [toasts, setToasts] = useState<ToastEntry[]>([])

  useEffect(() => toastStore.subscribe(setToasts), [])

  if (toasts.length === 0) return null

  return (
    <Box sx={{
      position: 'fixed', left: 3, bottom: 3, zIndex: 9999,
      width: 'min(340px, calc(100vw - 40px))',
      display: 'flex', flexDirection: 'column', gap: 1,
    }}>
      {toasts.map(t => <ToastCard key={t.id} toast={t} />)}
    </Box>
  )
}
