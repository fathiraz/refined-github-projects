import React from 'react'
import { Box, Heading, Text } from '@primer/react'

interface SectionHeaderProps {
  title: string
  subtitle?: string
  action?: React.ReactNode
  icon?: React.ReactNode
}

export function SectionHeader({ title, subtitle, action, icon }: SectionHeaderProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 3,
        mb: 4,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 3, minWidth: 0 }}>
        {icon && (
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: 2,
              bg: 'accent.subtle',
              color: 'accent.fg',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {icon}
          </Box>
        )}
        <Box sx={{ minWidth: 0 }}>
          <Heading as="h2" sx={{ fontSize: 4, fontWeight: 'bold', m: 0 }}>
            {title}
          </Heading>
          {subtitle && (
            <Text as="p" sx={{ m: 0, mt: 1, color: 'fg.muted', fontSize: 1 }}>
              {subtitle}
            </Text>
          )}
        </Box>
      </Box>
      {action && <Box sx={{ flexShrink: 0 }}>{action}</Box>}
    </Box>
  )
}
