import React from 'react'
import { Box, Button, type ButtonProps, Spinner } from '@primer/react'

interface ActionButtonProps extends Omit<ButtonProps, 'variant' | 'icon'> {
  loading?: boolean
  icon?: React.ReactNode
}

function buttonSx(extra?: ButtonProps['sx']) {
  return {
    boxShadow: 'none',
    transition: 'all 180ms cubic-bezier(0.4, 0, 0.2, 1)',
    '&:hover:not([disabled])': { transform: 'translateY(-1px)' },
    '&:active:not([disabled])': { transform: 'translateY(0)' },
    ...(extra || {}),
  }
}

export function PrimaryAction({ children, loading, icon, ...props }: ActionButtonProps) {
  return (
    <Button variant="primary" {...props} sx={buttonSx(props.sx)}>
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
    <Button variant="default" {...props} sx={buttonSx(props.sx)}>
      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
        {icon}
        {children}
      </Box>
    </Button>
  )
}

export function GhostAction({ children, icon, ...props }: ActionButtonProps) {
  return (
    <Button variant="invisible" {...props} sx={buttonSx(props.sx)}>
      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
        {icon}
        {children}
      </Box>
    </Button>
  )
}
