import React from 'react'
import { Box } from '@primer/react'

interface PanelCardProps {
  children: React.ReactNode
  variant?: 'default' | 'elevated' | 'inset'
  padding?: 'none' | 'small' | 'medium' | 'large'
  className?: string
}

export function PanelCard({
  children,
  variant = 'default',
  padding = 'medium',
  className,
}: PanelCardProps) {
  const paddingMap = { none: 0, small: 3, medium: 4, large: 5 }
  const variantStyles = {
    default: {
      bg: 'canvas.default',
      borderColor: 'border.default',
      borderWidth: 1,
      borderStyle: 'solid',
    },
    elevated: {
      bg: 'canvas.overlay',
      borderColor: 'border.default',
      borderWidth: 1,
      borderStyle: 'solid',
    },
    inset: {
      bg: 'canvas.inset',
      borderColor: 'border.default',
      borderWidth: 1,
      borderStyle: 'solid',
    },
  }

  return (
    <Box
      className={className}
      sx={{
        borderRadius: 2,
        p: paddingMap[padding],
        transition: 'all 180ms cubic-bezier(0.4, 0, 0.2, 1)',
        ...variantStyles[variant],
      }}
    >
      {children}
    </Box>
  )
}
