import React from 'react'
import { Box, Button, type ButtonProps, Spinner } from '@primer/react'
import { primerCss } from '@/lib/primer-css-helper'

interface ActionButtonProps extends Omit<ButtonProps, 'variant' | 'icon'> {
  loading?: boolean
  icon?: React.ReactNode
}

export function PrimaryAction({ children, loading, icon, ...props }: ActionButtonProps) {
  return (
    <Button variant="primary" {...props} sx={primerCss.buttonMotion(props.sx)}>
      {loading ? (
        <Spinner size="small" />
      ) : (
        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
          {icon}
          {children}
        </Box>
      )}
    </Button>
  )
}

export function SecondaryAction({ children, icon, ...props }: ActionButtonProps) {
  return (
    <Button variant="default" {...props} sx={primerCss.buttonMotion(props.sx)}>
      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
        {icon}
        {children}
      </Box>
    </Button>
  )
}

export function GhostAction({ children, icon, ...props }: ActionButtonProps) {
  return (
    <Button variant="invisible" {...props} sx={primerCss.buttonMotion(props.sx)}>
      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
        {icon}
        {children}
      </Box>
    </Button>
  )
}
