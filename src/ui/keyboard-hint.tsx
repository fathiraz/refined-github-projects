import React from 'react'
import { Box, Text } from '@primer/react'

interface KeyboardHintProps {
  shortcuts: Array<{ key: string; label?: string }>
}

export function KeyboardHint({ shortcuts }: KeyboardHintProps) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
      {shortcuts.map(({ key, label }) => (
        <Box key={key} sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
          <Box
            as="kbd"
            sx={{
              fontSize: 0,
              fontFamily: 'inherit',
              fontWeight: 500,
              px: 1,
              py: '1px',
              borderRadius: 1,
              bg: 'canvas.inset',
              border: '1px solid',
              borderColor: 'border.default',
              color: 'fg.muted',
              cursor: 'default',
              lineHeight: 1.6,
            }}
          >
            {key}
          </Box>
          {label && <Text sx={{ fontSize: 0, color: 'fg.muted' }}>{label}</Text>}
        </Box>
      ))}
    </Box>
  )
}
