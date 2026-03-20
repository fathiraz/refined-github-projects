import React, { useEffect, useState } from 'react'
import { Box, Button, Label, ProgressBar, Spinner, Text } from '@primer/react'
import { queueStore, type ProcessEntry } from '../lib/queueStore'
import { sendMessage } from '../lib/messages'
import { CheckIcon, ChevronDownIcon, XIcon } from './ui/primitives'

function ProcessCard({ entry, onDismiss }: { entry: ProcessEntry; onDismiss: (processId: string, isDone: boolean) => void }) {
  const [countdown, setCountdown] = useState(0)
  const [expanded, setExpanded] = useState(false)

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

  const isDone = entry.done
  const percent = entry.total === 0 ? 0 : Math.round((entry.completed / entry.total) * 100)

  return (
    <Box sx={{
      display: 'flex', alignItems: 'center', gap: 3, p: 3,
      bg: 'canvas.overlay', border: '1px solid', borderColor: 'border.default', borderRadius: 2,
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    }}>
      {/* Status icon */}
      <Box sx={{ flexShrink: 0 }}>
        {isDone ? (
          <Box sx={{ color: 'success.fg' }}>
            <CheckIcon size={20} />
          </Box>
        ) : entry.paused ? (
          <Box sx={{ color: 'attention.fg' }}>
            <Spinner size="small" sx={{ color: 'attention.fg' }} />
          </Box>
        ) : (
          <Spinner size="small" />
        )}
      </Box>

      {/* Content */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
          <Text sx={{ fontSize: 2, fontWeight: 'semibold', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: entry.paused ? 'attention.fg' : undefined }} title={entry.label}>
            {entry.label}
          </Text>
          <Text sx={{ fontSize: 1, color: 'fg.muted', flexShrink: 0 }}>
            {entry.completed}/{entry.total}
          </Text>
          <Button
            variant="invisible"
            size="small"
            onClick={() => setExpanded(v => !v)}
            aria-label={expanded ? 'Collapse details' : 'Expand details'}
            sx={{ p: '2px', minWidth: 'unset', color: 'fg.muted', flexShrink: 0 }}
          >
            <Box sx={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 150ms', display: 'flex' }}>
              <ChevronDownIcon size={16} />
            </Box>
          </Button>
        </Box>

        <ProgressBar progress={percent} sx={{ borderRadius: 2, height: '6px', bg: 'canvas.subtle', '& > span': { bg: entry.paused ? 'attention.emphasis' : isDone ? 'success.emphasis' : 'accent.emphasis', transition: 'width 300ms cubic-bezier(0.4, 0, 0.2, 1)', '@media (prefers-reduced-motion: reduce)': { transition: 'none' } } }} />

        {entry.paused && countdown > 0 && (
          <Text sx={{ fontSize: 1, color: 'attention.fg', mt: 1, display: 'block' }}>
            Rate limit hit. Retrying in {countdown}s…
          </Text>
        )}

        {expanded && (
          <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'border.muted', display: 'flex', flexDirection: 'column', gap: 1 }}>
            {entry.status && !isDone && (
              <Text sx={{ fontSize: 0, color: 'fg.muted', fontFamily: 'mono', display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ width: 6, height: 6, borderRadius: '50%', bg: entry.paused ? 'attention.emphasis' : 'accent.emphasis', flexShrink: 0 }} />
                {entry.status}
              </Text>
            )}
            <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
              {entry.completed} of {entry.total} tasks · {percent}%
            </Text>
          </Box>
        )}
      </Box>

      {/* Dismiss */}
      <Button
        variant="invisible"
        size="small"
        onClick={() => onDismiss(entry.processId, isDone)}
        aria-label="Dismiss"
        sx={{ p: '2px', minWidth: 'unset', color: 'fg.muted', flexShrink: 0 }}
      >
        <XIcon size={16} />
      </Button>
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
