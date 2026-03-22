import React, { useEffect, useState } from 'react'
import { Box, Button, Flash, ProgressBar, Spinner, Text, Tooltip } from '@primer/react'
import { queueStore, type ProcessEntry } from '../lib/queueStore'
import { sendMessage } from '../lib/messages'
import { CheckIcon, XIcon } from './ui/primitives'

function ProcessCard({ entry, onDismiss }: { entry: ProcessEntry; onDismiss: (processId: string, isDone: boolean) => void }) {
  const [countdown, setCountdown] = useState(0)

  const isDone = entry.done
  const percent = entry.total === 0 ? 0 : Math.round((entry.completed / entry.total) * 100)

  useEffect(() => {
    if (!entry.paused || !entry.retryAfter) {
      setCountdown(0)
      return
    }
    setCountdown(entry.retryAfter)
    const interval = window.setInterval(() => {
      setCountdown(v => {
        if (v <= 1) { window.clearInterval(interval); return 0 }
        return v - 1
      })
    }, 1000)
    return () => window.clearInterval(interval)
  }, [entry.paused, entry.retryAfter])

  return (
    <Box sx={{
      display: 'flex', alignItems: 'flex-start', gap: 3, p: 3,
      bg: 'canvas.overlay', border: '1px solid', borderColor: 'border.default', borderRadius: 2,
      boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
    }}>
      {/* Status icon */}
      <Box sx={{ flexShrink: 0, pt: '2px' }}>
        {isDone ? (
          <Box sx={{ color: 'success.fg' }}>
            <CheckIcon size={20} />
          </Box>
        ) : entry.paused ? (
          <Spinner size="small" sx={{ color: 'attention.fg' }} />
        ) : (
          <Spinner size="small" />
        )}
      </Box>

      {/* Content */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {/* Header row: label + count */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
          <Text sx={{
            fontSize: 1, fontWeight: 'semibold', flex: 1, minWidth: 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            color: entry.paused ? 'attention.fg' : 'fg.default',
          }} title={entry.label}>
            {entry.label}
          </Text>
          {!isDone && (
            <Text sx={{ fontSize: 0, color: 'fg.muted', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
              {entry.completed}/{entry.total}
            </Text>
          )}
        </Box>

        {/* Progress bar + percentage */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <ProgressBar progress={percent} sx={{
            flex: 1, borderRadius: 2, height: '6px', bg: 'canvas.subtle',
            '& > span': {
              bg: entry.paused ? 'attention.emphasis' : isDone ? 'success.emphasis' : 'accent.emphasis',
              transition: 'width 300ms cubic-bezier(0.4, 0, 0.2, 1)',
              '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
            },
          }} />
          <Text sx={{ fontSize: 0, color: 'fg.muted', flexShrink: 0, minWidth: '28px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
            {percent}%
          </Text>
        </Box>

        {entry.paused && countdown > 0 && (
          <Flash variant="warning" sx={{ mt: 1, py: 1, px: 2, fontSize: 1 }}>
            Rate limited — retrying in {countdown}s
          </Flash>
        )}

        {/* Live section: pulsing accent bar + detail (hero) + status (supporting) */}
        {!isDone && (entry.status || entry.detail) && (
          <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'border.muted', display: 'flex', gap: 2, alignItems: 'flex-start' }}>
            {/* CSS-only pulsing accent bar */}
            <Box sx={{
              width: '2px', borderRadius: '2px', flexShrink: 0, alignSelf: 'stretch', minHeight: '16px',
              bg: entry.paused ? 'attention.emphasis' : 'accent.emphasis',
              animation: entry.paused ? 'none' : 'rgp-active-pulse 1.8s ease-in-out infinite',
              '@keyframes rgp-active-pulse': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.25 } },
              '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
            }} />

            <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '3px' }}>
              {/* HERO: current item being processed */}
              {/* SUPPORTING: operation phase */}
              {entry.status && (
                <Text sx={{ fontSize: 0, color: 'fg.muted', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {entry.status} {entry.detail ? `(${entry.detail})` : ''}
                </Text>
              )}
            </Box>
          </Box>
        )}
      </Box>

      {/* Dismiss / Cancel */}
      <Tooltip text={isDone ? 'Dismiss' : 'Cancel'} direction="w">
        <Button
          variant="invisible"
          size="small"
          onClick={() => onDismiss(entry.processId, isDone)}
          aria-label={isDone ? 'Dismiss' : 'Cancel'}
          sx={{ p: '2px', minWidth: 'unset', color: 'fg.muted', flexShrink: 0 }}
        >
          <XIcon size={16} />
        </Button>
      </Tooltip>
    </Box>
  )
}

export function QueueTracker() {
  const [processes, setProcesses] = useState<ProcessEntry[]>([])

  useEffect(() => {
    return queueStore.subscribe(setProcesses)
  }, [])

  function handleDismiss(processId: string, isDone: boolean) {
    if (isDone) {
      queueStore.dismiss(processId)
    } else {
      sendMessage('cancelProcess', { processId })
    }
  }

  if (processes.length === 0) return null

  return (
    <Box sx={{
      position: 'fixed', right: 3, bottom: 3, zIndex: 9999,
      width: 'min(380px, calc(100vw - 40px))',
      display: 'flex', flexDirection: 'column', gap: 2,
    }}>
      {processes.map(p => (
        <ProcessCard key={p.processId} entry={p} onDismiss={handleDismiss} />
      ))}
    </Box>
  )
}
