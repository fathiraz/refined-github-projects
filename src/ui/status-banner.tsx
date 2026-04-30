import React from 'react'
import { Box, Flash, Text } from '@primer/react'

import { GhostAction } from '@/ui/actions'
import { AlertIcon, CheckIcon, InfoIcon, XIcon } from '@/ui/icons'

interface StatusBannerProps {
  variant: 'success' | 'warning' | 'error' | 'info'
  title?: string
  children: React.ReactNode
  onDismiss?: () => void
}

const statusIcons = {
  success: CheckIcon,
  warning: AlertIcon,
  error: XIcon,
  info: InfoIcon,
}

const statusFlashVariants = {
  success: 'success' as const,
  warning: 'warning' as const,
  error: 'danger' as const,
  info: 'default' as const,
}

const statusColors = {
  success: 'success.fg',
  warning: 'attention.fg',
  error: 'danger.fg',
  info: 'accent.fg',
} as const

export function StatusBanner({ variant, title, children, onDismiss }: StatusBannerProps) {
  const Icon = statusIcons[variant]

  return (
    <Flash
      variant={statusFlashVariants[variant]}
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
      <Box sx={{ mt: '2px', flexShrink: 0, color: statusColors[variant] }}>
        <Icon size={16} />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {title && (
          <Text as="p" sx={{ fontWeight: 'semibold', m: 0, mb: 1 }}>
            {title}
          </Text>
        )}
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
