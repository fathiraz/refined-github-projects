import React from 'react'
import { Box } from '@primer/react'

interface StepIndicatorProps {
  current: number // 1-based
  total: number
}

export function StepIndicator({ current, total }: StepIndicatorProps) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      {Array.from({ length: total }, (_, i) => (
        <Box
          key={i}
          sx={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            bg: i < current ? 'accent.emphasis' : 'border.default',
            transition: 'background-color 200ms cubic-bezier(0.4, 0, 0.2, 1)',
            '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
          }}
        />
      ))}
    </Box>
  )
}
