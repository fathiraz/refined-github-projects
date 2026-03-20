import React, { useEffect, useState } from 'react'
import { Box, Button, Text } from '@primer/react'
import { toastStore, type ToastEntry } from '../lib/toastStore'
import { AlertIcon, CheckIcon, InfoIcon, XIcon } from './ui/primitives'

// CSS var accent colors per type
const ACCENT_VAR: Record<ToastEntry['type'], string> = {
  success: 'var(--color-success-emphasis, #1a7f37)',
  warning: 'var(--color-attention-emphasis, #9a6700)',
  error:   'var(--color-danger-emphasis, #cf222e)',
  info:    'var(--color-accent-emphasis, #0969da)',
}

function TypeIcon({ type }: { type: ToastEntry['type'] }) {
  const color = ACCENT_VAR[type]
  switch (type) {
    case 'success': return <CheckIcon size={14} color={color} />
    case 'warning': return <AlertIcon size={14} color={color} />
    case 'error':   return <XIcon size={14} color={color} />
    default:        return <InfoIcon size={14} color={color} />
  }
}

function ToastCard({ toast }: { toast: ToastEntry }) {
  const accent = ACCENT_VAR[toast.type]

  return (
    <Box sx={{
      display: 'flex', bg: 'canvas.overlay', border: '1px solid', borderColor: 'border.default',
      borderRadius: 2, overflow: 'hidden', position: 'relative',
    }}>
      <style>{`
        @keyframes rgp-toast-in {
          from { transform: translateX(-12px); opacity: 0; }
          to   { transform: translateX(0);     opacity: 1; }
        }
        @keyframes rgp-toast-bar {
          from { width: 100%; }
          to   { width: 0%; }
        }
        @media (prefers-reduced-motion: reduce) {
          .rgp-toast-card { animation: none !important; }
          .rgp-toast-bar  { animation: none !important; }
        }
      `}</style>

      {/* Left accent bar */}
      <Box sx={{ width: '4px', flexShrink: 0 }} style={{ background: accent }} />

      {/* Content */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, p: 2, flex: 1, minWidth: 0 }}>
        <Box sx={{ flexShrink: 0, mt: '2px' }}>
          <TypeIcon type={toast.type} />
        </Box>
        <Text sx={{
          flex: 1, fontSize: 1, lineHeight: 1.45, color: 'fg.default',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        } as object}>
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
      <Box sx={{ position: 'absolute', bottom: 0, left: '4px', right: 0, height: '2px', bg: 'canvas.subtle' }}>
        <Box
          className="rgp-toast-bar"
          sx={{ height: '100%' }}
          style={{ background: accent, animation: 'rgp-toast-bar 5s linear forwards' }}
        />
      </Box>
    </Box>
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
