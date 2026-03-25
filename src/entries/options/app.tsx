import React from 'react'
import { Box, Heading, Text } from '@primer/react'
import { TokenSetupCard } from '../../components/token-setup'
import { DebugSettingsCard } from '../../components/debug-settings-card'
import { AppShell, CheckIcon } from '../../components/ui/primitives'

const checklist = [
  'Bulk edit, close, and delete items from the project table',
  'Deep duplicate any item with all its fields intact',
  'Search labels, assignees, and issue types inline',
  '⌘A selects all items · Esc clears selection',
]

export default function App() {
  return (
    <AppShell>
      <Box
        sx={{
          minHeight: '100vh',
          bg: 'canvas.default',
          px: [3, 4, 5],
          py: [5, 6],
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <Box sx={{ width: '100%', maxWidth: 760, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {/* Hero — single column, bold */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Heading
              as="h2"
              sx={{
                fontSize: 6,
                fontWeight: 'bold',
                letterSpacing: '-0.03em',
                lineHeight: 1.05,
                m: 0,
              }}
            >
              Refined GitHub Projects
            </Heading>
            <Text as="p" sx={{ fontSize: 3, color: 'fg.muted', m: 0, lineHeight: 1.4 }}>
              Set up once. Then it just works.
            </Text>
            <Text as="p" sx={{ fontSize: 1, color: 'fg.muted', m: 0 }}>
              Your token stays in your browser. API calls go directly to GitHub — no proxy, no tracking.
            </Text>
            <Box
              as="ul"
              sx={{
                listStyle: 'none',
                p: 0,
                m: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                mt: 1,
              }}
            >
              {checklist.map((item) => (
                <Box as="li" key={item} sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                  <Box sx={{ color: 'success.fg', mt: '2px', flexShrink: 0 }}>
                    <CheckIcon size={14} />
                  </Box>
                  <Text sx={{ fontSize: 1, color: 'fg.muted' }}>{item}</Text>
                </Box>
              ))}
            </Box>
          </Box>

          {/* Token setup card */}
          <TokenSetupCard />

          {/* Debug settings */}
          <DebugSettingsCard />
        </Box>
      </Box>
    </AppShell>
  )
}
