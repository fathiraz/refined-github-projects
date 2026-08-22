import React from 'react'
import { Box } from '@primer/react'

const PADDING = { small: 3, medium: 4, large: 5 } as const
const SURFACE = { elevated: 'canvas.overlay', inset: 'canvas.inset' } as const

interface PanelCardProps {
  children: React.ReactNode
  variant: keyof typeof SURFACE
  padding: keyof typeof PADDING
}

export function PanelCard({ children, variant, padding }: PanelCardProps) {
  return (
    <Box
      sx={{
        borderRadius: 2,
        p: PADDING[padding],
        bg: SURFACE[variant],
        border: '1px solid',
        borderColor: 'border.default',
        transition: 'all 180ms cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      {children}
    </Box>
  )
}
