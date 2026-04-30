import React from 'react'
import { Box, Text } from '@primer/react'

import { PanelCard } from '@/ui/panel-card'

interface ProgressStateProps {
  progress: number
  status?: 'idle' | 'running' | 'paused' | 'complete' | 'error'
  label?: string
  sublabel?: string
}

export function ProgressState({ progress, status = 'idle', label, sublabel }: ProgressStateProps) {
  const isComplete = status === 'complete'
  const isError = status === 'error'
  const isPaused = status === 'paused'

  const progressColor = isError
    ? 'danger.emphasis'
    : isComplete
      ? 'success.emphasis'
      : isPaused
        ? 'attention.emphasis'
        : 'accent.emphasis'

  const title =
    label || (isComplete ? 'Complete' : isError ? 'Error' : isPaused ? 'Paused' : 'In progress')

  return (
    <PanelCard variant="elevated" padding="medium">
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Box
          sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 3 }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                bg: progressColor,
                animation:
                  status === 'running'
                    ? 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
                    : undefined,
                '@keyframes pulse': {
                  '0%, 100%': { opacity: 1, transform: 'scale(1)' },
                  '50%': { opacity: 0.6, transform: 'scale(1.1)' },
                },
              }}
            />
            <Text sx={{ fontWeight: 'semibold', fontSize: 2 }}>{title}</Text>
          </Box>
          <Text sx={{ fontWeight: 'semibold', color: 'fg.muted', fontSize: 2 }}>
            {Math.round(progress)}%
          </Text>
        </Box>

        <Box sx={{ height: 8, borderRadius: 2, bg: 'canvas.subtle', overflow: 'hidden' }}>
          <Box
            sx={{
              height: '100%',
              width: `${progress}%`,
              bg: progressColor,
              borderRadius: 2,
              transition: 'width 300ms cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          />
        </Box>

        {sublabel && <Text sx={{ fontSize: 1, color: 'fg.muted', m: 0 }}>{sublabel}</Text>}
      </Box>
    </PanelCard>
  )
}
