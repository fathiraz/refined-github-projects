import React from 'react'
import { Box, Button, FormControl, Heading, Text, TextInput } from '@primer/react'
import { sendMessage } from '../../lib/messages'
import { useTokenSetup } from '../../lib/useTokenSetup'
import { usernameStorage } from '../../lib/storage'
import { AppShell, EyeIcon, EyeOffIcon, KeyboardHint, PanelCard, StatusBanner } from '../../components/ui/primitives'
import { DebugSettingsCard } from '../../components/DebugSettingsCard'

export default function App() {
  const { token, setToken, loading, validating, error, setError, saved, savedLogin, hasToken, saveToken } = useTokenSetup()
  const [showPat, setShowPat] = React.useState(false)
  const [storedUsername, setStoredUsername] = React.useState('')

  React.useEffect(() => {
    usernameStorage.getValue().then((v: string) => { if (v) setStoredUsername(v) })
  }, [saved])

  const version = browser.runtime.getManifest().version
  const connectedUser = savedLogin || storedUsername

  return (
    <AppShell>
      <Box sx={{ width: 320, minHeight: 400, bg: 'canvas.default', p: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {/* Header */}
        <Box sx={{ pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 2 }}>
            <Heading as="h2" sx={{ fontSize: 4, fontWeight: 'bold', m: 0, letterSpacing: '-0.02em' }}>
              Refined GitHub Projects
            </Heading>
            {version && (
              <Text sx={{ fontSize: 0, color: 'fg.muted', flexShrink: 0 }}>v{version}</Text>
            )}
          </Box>
          <Text as="p" sx={{ fontSize: 1, color: 'fg.muted', m: 0, mt: 1 }}>
            Bulk power tools for GitHub Projects.
          </Text>
        </Box>

        {/* Token form */}
        <PanelCard variant="elevated" padding="medium">
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {connectedUser && !error && (
              <StatusBanner variant="success">
                Connected as @{connectedUser}
              </StatusBanner>
            )}

            {saved && !connectedUser && (
              <StatusBanner variant="success">
                {savedLogin ? `Authenticated as @${savedLogin}.` : 'Token saved.'}
              </StatusBanner>
            )}

            {error && (
              <StatusBanner variant="error" onDismiss={() => setError(null)}>
                {error}
              </StatusBanner>
            )}

            <FormControl>
              <FormControl.Label sx={{ fontWeight: 'bold', fontSize: 1 }}>
                Personal access token
              </FormControl.Label>
              <TextInput
                type={showPat ? 'text' : 'password'}
                value={token}
                onChange={(e) => {
                  setToken(e.target.value)
                  setError(null)
                }}
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                block
                trailingAction={
                  <TextInput.Action
                    onClick={() => setShowPat(v => !v)}
                    aria-label={showPat ? 'Hide token' : 'Show token'}
                    icon={showPat ? EyeOffIcon : EyeIcon}
                  />
                }
                sx={{
                  bg: 'canvas.default',
                  borderColor: error ? 'danger.emphasis' : 'border.default',
                  boxShadow: 'none',
                  '&:focus-within': { boxShadow: 'none', borderColor: error ? 'danger.emphasis' : 'accent.emphasis' },
                }}
              />
              <FormControl.Caption>
                Stored in your browser only. Never sent to any server.
              </FormControl.Caption>
            </FormControl>

            {loading && (
              <Text sx={{ fontSize: 0, color: 'fg.muted' }}>Loading saved token…</Text>
            )}

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Button
                variant="primary"
                onClick={saveToken}
                disabled={!hasToken || validating || loading}
                sx={{ justifyContent: 'center', boxShadow: 'none' }}
              >
                {validating ? 'Validating…' : 'Validate and save'}
              </Button>
              <Button
                variant="default"
                onClick={() => sendMessage('openOptions', {})}
                sx={{ justifyContent: 'center', boxShadow: 'none' }}
              >
                Open full setup
              </Button>
            </Box>
          </Box>
        </PanelCard>

        {/* Debug settings */}
        <DebugSettingsCard />

        {/* Footer */}
        <PanelCard variant="inset" padding="small">
          <Text as="p" sx={{ fontSize: 0, color: 'fg.muted', m: 0, mb: 2, lineHeight: 1.5 }}>
            Open a GitHub Projects table to start.
          </Text>
          <KeyboardHint shortcuts={[
            { key: '⌘A', label: 'select all' },
            { key: 'Esc', label: 'clear' },
          ]} />
        </PanelCard>
      </Box>
    </AppShell>
  )
}
