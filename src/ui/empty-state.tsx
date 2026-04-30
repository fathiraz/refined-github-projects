import React from 'react'
import { Box, Heading, Text } from '@primer/react'

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        py: 6,
        px: 4,
        gap: 3,
      }}
    >
      {icon && (
        <Box
          sx={{
            width: 48,
            height: 48,
            borderRadius: 2,
            bg: 'canvas.subtle',
            color: 'fg.muted',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {icon}
        </Box>
      )}
      <Box>
        <Heading sx={{ fontSize: 4, fontWeight: 'bold', m: 0, mb: description ? 2 : 0 }}>
          {title}
        </Heading>
        {description && (
          <Text as="p" sx={{ color: 'fg.muted', m: 0, maxWidth: 420 }}>
            {description}
          </Text>
        )}
      </Box>
      {action && <Box>{action}</Box>}
    </Box>
  )
}
