import React from 'react'
import { Box, Flash, Text } from '@primer/react'

import { GhostAction } from '@/ui/actions'
import { CheckIcon, XIcon } from '@/ui/icons'

const STATUS = {
  success: { icon: CheckIcon, flash: 'success', color: 'success.fg' },
  error: { icon: XIcon, flash: 'danger', color: 'danger.fg' },
} as const

interface StatusBannerProps {
  variant: keyof typeof STATUS
  children: React.ReactNode
  onDismiss?: () => void
}

export function StatusBanner({ variant, children, onDismiss }: StatusBannerProps) {
  const { icon: Icon, flash, color } = STATUS[variant]

  return (
    <Flash
      variant={flash}
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 3,
        p: 3,
        borderRadius: 2,
        animation: 'fadeSlideIn 200ms cubic-bezier(0.4, 0, 0.2, 1)',
        '@keyframes fadeSlideIn': {
          from: { opacity: 0, transform: 'translateY(-8px)' },
          to: { opacity: 1, transform: 'translateY(0)' },
        },
      }}
    >
      <Box sx={{ mt: '2px', flexShrink: 0, color }}>
        <Icon size={16} />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Text as="p" sx={{ m: 0, fontSize: 1 }}>
          {children}
        </Text>
      </Box>
      {onDismiss && (
        <GhostAction onClick={onDismiss} icon={<XIcon size={14} />} aria-label="Dismiss" />
      )}
    </Flash>
  )
}
