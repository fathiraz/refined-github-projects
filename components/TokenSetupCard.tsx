import React from 'react'
import { Box, FormControl, Heading, Link, Spinner, Text, TextInput } from '@primer/react'
import { useTokenSetup } from '../lib/useTokenSetup'
import {
  CheckIcon,
  GearIcon,
  PanelCard,
  PrimaryAction,
  SecondaryAction,
  SectionHeader,
  StatusBanner,
} from './ui/primitives'

type Mode = 'compact' | 'full'

interface TokenSetupCardProps {
  mode?: Mode
  onOpenOptions?: () => void
}

const requiredScopes = ['project', 'read:org', 'repo']

export function TokenSetupCard({ mode = 'full', onOpenOptions }: TokenSetupCardProps) {
  const { token, setToken, loading, validating, error, setError, saved, savedLogin, hasToken, saveToken } = useTokenSetup()

  if (loading) {
    return (
      <PanelCard variant="elevated" padding="large">
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: mode === 'compact' ? 3 : 5 }}>
          <Spinner size="small" />
        </Box>
      </PanelCard>
    )
  }

  return (
    <PanelCard variant="elevated" padding={mode === 'compact' ? 'medium' : 'large'}>
      <SectionHeader
        title={mode === 'compact' ? 'GitHub access' : 'Connect your GitHub token'}
        subtitle={
          mode === 'compact'
            ? 'Validated once, works across the popup, options, and in-page toolbar.'
            : 'Save once and all features — bulk edits, deep duplicate, field search — share the same token.'
        }
        icon={<GearIcon size={18} />}
      />

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {saved && (
          <StatusBanner variant="success" title="Token saved">
            {savedLogin ? `Authenticated as @${savedLogin}.` : 'Your token is ready to use.'}
          </StatusBanner>
        )}

        {error && (
          <StatusBanner variant="error" title="Could not save token" onDismiss={() => setError(null)}>
            {error}
          </StatusBanner>
        )}

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: mode === 'compact' ? '1fr' : ['1fr', null, '1.4fr 1fr'],
            gap: 3,
          }}
        >
          <FormControl>
            <FormControl.Label>Personal access token</FormControl.Label>
            <TextInput
              type="password"
              block
              value={token}
              onChange={(event) => {
                setToken(event.target.value)
                setError(null)
              }}
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
              aria-describedby="rgp-scopes-list"
              sx={{
                bg: 'canvas.default',
                borderColor: error ? 'danger.emphasis' : 'border.default',
                boxShadow: 'none',
                '&:focus-within': {
                  boxShadow: 'none',
                  borderColor: error ? 'danger.emphasis' : 'accent.emphasis',
                },
              }}
            />
            <FormControl.Caption>
              Stored in your browser only. Never sent to any server.
            </FormControl.Caption>
          </FormControl>

          <PanelCard variant="inset" padding="medium">
            <Heading id="rgp-scopes-list" sx={{ fontSize: 1, mb: 2 }}>
              Required scopes
            </Heading>
            <Box as="ul" sx={{ listStyle: 'none', pl: 0, m: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {requiredScopes.map((scope) => (
                <Box as="li" key={scope} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <CheckIcon size={14} color="currentColor" />
                  <Text sx={{ fontSize: 1, color: 'fg.muted' }}>{scope}</Text>
                </Box>
              ))}
            </Box>
          </PanelCard>
        </Box>

        <Box sx={{ display: 'flex', flexDirection: mode === 'compact' ? 'column' : 'row', gap: 2, alignItems: mode === 'compact' ? 'stretch' : 'center' }}>
          <PrimaryAction onClick={saveToken} disabled={!hasToken || validating} loading={validating}>
            {hasToken ? 'Validate and save token' : 'Add a token to continue'}
          </PrimaryAction>
          {onOpenOptions && (
            <SecondaryAction onClick={onOpenOptions}>Open full setup</SecondaryAction>
          )}
        </Box>

        <Text sx={{ fontSize: 1, color: 'fg.muted' }}>
          Need one?{' '}
          <Link
            href="https://github.com/settings/tokens/new?scopes=project,read:org,repo&description=Refined+GitHub+Projects"
            target="_blank"
            rel="noreferrer"
          >
            Generate a PAT with the right scopes
          </Link>
          .
        </Text>
      </Box>
    </PanelCard>
  )
}
