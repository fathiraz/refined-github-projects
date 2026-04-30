import React from 'react'
import { BaseStyles, Box, ThemeProvider } from '@primer/react'

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider colorMode="auto">
      <BaseStyles>
        <Box
          sx={{
            color: 'fg.default',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            lineHeight: 1.5,
          }}
        >
          {children}
        </Box>
      </BaseStyles>
    </ThemeProvider>
  )
}
