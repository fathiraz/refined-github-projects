import React from 'react'
import { Box, Text } from '@primer/react'

/** Keycap chrome. Four hand-copied versions of this used to drift by a pixel. */
const KBD_SX = {
  fontSize: 0,
  fontFamily: 'inherit',
  fontWeight: 500,
  px: '5px',
  py: '1px',
  borderRadius: 1,
  bg: 'canvas.inset',
  border: '1px solid',
  borderColor: 'border.default',
  color: 'fg.muted',
  cursor: 'default',
  lineHeight: 1.6,
  letterSpacing: '0.02em',
} as const

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <Box as="kbd" sx={KBD_SX}>
      {children}
    </Box>
  )
}

interface KeyboardHintProps {
  shortcuts: Array<{ key: string; label?: string }>
}

export function KeyboardHint({ shortcuts }: KeyboardHintProps) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
      {shortcuts.map(({ key, label }) => (
        <Box key={key} sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
          <Kbd>{key}</Kbd>
          {label && <Text sx={{ fontSize: 0, color: 'fg.muted' }}>{label}</Text>}
        </Box>
      ))}
    </Box>
  )
}
