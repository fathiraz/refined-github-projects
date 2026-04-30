import React, { useEffect, useMemo, useState } from 'react'
import {
  Box,
  Button,
  Flash,
  FormControl,
  Heading,
  Link,
  Spinner,
  Text,
  TextInput,
} from '@primer/react'
import { sendMessage } from '@/lib/messages'
import type { PatError, PatErrorType } from '@/lib/errors'
import { patStorage } from '@/lib/storage'
import { CheckIcon, GearIcon, XIcon } from '@/ui/icons'

const PAT_URL =
  'https://github.com/settings/tokens/new?scopes=project,read:org,repo&description=Refined+GitHub+Projects'

function buildPatError(type?: PatErrorType, message?: string): PatError {
  const isExpired =
    type === 'expired_or_invalid' && (message ?? '').toLowerCase().includes('expired')
  switch (type) {
    case 'expired_or_invalid':
      return {
        type,
        title: isExpired ? 'Token expired' : 'Invalid token',
        message: isExpired
          ? 'Your GitHub PAT has expired. Generate a new one to continue.'
          : 'Token is invalid. Check it and make sure it has the right scopes.',
        actionLabel: 'Generate new token',
        actionHref: PAT_URL,
      }
    case 'missing_scopes':
      return {
        type,
        title: 'Missing permissions',
        message: 'Token needs project, read:org, and repo scopes.',
        actionLabel: 'Generate token with correct scopes',
        actionHref: PAT_URL,
      }
    case 'rate_limit':
      return {
        type,
        title: 'Rate limited',
        message: 'GitHub API rate limit hit. Wait a moment and try again.',
      }
    case 'network':
      return {
        type,
        title: 'Connection error',
        message: 'Unable to reach GitHub. Check your internet connection.',
      }
    default:
      return {
        type: 'unknown',
        title: 'Validation failed',
        message: message ?? 'Please try again.',
      }
  }
}

export function useTokenSetup() {
  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(true)
  const [validating, setValidating] = useState(false)
  const [error, setError] = useState<PatError | null>(null)
  const [savedLogin, setSavedLogin] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let mounted = true

    patStorage.getValue().then((value) => {
      if (!mounted) return
      if (value) setToken(value)
      setLoading(false)
    })

    return () => {
      mounted = false
    }
  }, [])

  const hasToken = useMemo(() => token.trim().length > 0, [token])

  async function saveToken() {
    const value = token.trim()
    if (!value) return false

    setValidating(true)
    setError(null)
    setSaved(false)

    try {
      const result = await sendMessage('validatePat', { token: value })
      if (!result.valid) {
        setError(buildPatError(result.errorType, result.errorMessage))
        return false
      }

      await patStorage.setValue(value)
      setSavedLogin(result.user || null)
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2500)
      return true
    } catch {
      setError(buildPatError())
      return false
    } finally {
      setValidating(false)
    }
  }

  return {
    token,
    setToken,
    loading,
    validating,
    error,
    setError,
    saved,
    savedLogin,
    hasToken,
    saveToken,
  }
}

export type TokenSetupMode = 'compact' | 'full'

export interface TokenSetupCardProps {
  mode?: TokenSetupMode
  onOpenOptions?: () => void
}

const requiredScopes = ['project', 'read:org', 'repo'] as const

const cardSx = {
  border: '1px solid',
  borderColor: 'border.default',
  borderRadius: 2,
  bg: 'canvas.overlay',
  boxShadow: 'none',
} as const

const actionButtonSx = {
  boxShadow: 'none',
  transition: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
  '&:hover:not(:disabled)': { transform: 'translateY(-1px)' },
  '&:active': { transform: 'translateY(0)', transition: '100ms' },
  '@media (prefers-reduced-motion: reduce)': {
    transition: 'none',
    '&:hover:not(:disabled)': { transform: 'none' },
  },
} as const

export function TokenSetupCard({ mode = 'full', onOpenOptions }: TokenSetupCardProps) {
  const {
    token,
    setToken,
    loading,
    validating,
    error,
    setError,
    saved,
    savedLogin,
    hasToken,
    saveToken,
  } = useTokenSetup()

  if (loading) {
    return (
      <Box sx={cardSx}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            py: mode === 'compact' ? 3 : 5,
          }}
        >
          <Spinner size="small" />
        </Box>
      </Box>
    )
  }

  return (
    <Box sx={cardSx}>
      <Box
        sx={{
          px: mode === 'compact' ? 3 : 4,
          py: 3,
          borderBottom: '1px solid',
          borderColor: 'border.default',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 2,
        }}
      >
        <Box sx={{ color: 'fg.muted', mt: '2px', flexShrink: 0 }}>
          <GearIcon size={16} />
        </Box>
        <Box>
          <Heading as="h2" sx={{ fontSize: 2, fontWeight: 'semibold', m: 0, color: 'fg.default' }}>
            {mode === 'compact' ? 'GitHub access' : 'Connect your GitHub token'}
          </Heading>
          <Text as="p" sx={{ m: 0, mt: '2px', color: 'fg.muted', fontSize: 1 }}>
            {mode === 'compact'
              ? 'Validated once, works across the popup, options, and in-page toolbar.'
              : 'Save once and all features — bulk edits, deep duplicate, field search — share the same token.'}
          </Text>
        </Box>
      </Box>

      <Box sx={{ p: mode === 'compact' ? 3 : 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {saved && (
          <Flash variant="success">
            <Text as="p" sx={{ fontWeight: 'semibold', m: 0, mb: '2px' }}>
              Token saved
            </Text>
            <Text as="p" sx={{ m: 0, fontSize: 1 }}>
              {savedLogin ? `Authenticated as @${savedLogin}.` : 'Your token is ready to use.'}
            </Text>
          </Flash>
        )}

        {error && (
          <Flash variant="danger" sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
            <Box sx={{ flex: 1 }}>
              <Text as="p" sx={{ fontWeight: 'semibold', m: 0, mb: '2px' }}>
                {error.title}
              </Text>
              <Text as="p" sx={{ m: 0, fontSize: 1 }}>
                {error.message}
              </Text>
              {error.actionLabel && error.actionHref && (
                <Link
                  href={error.actionHref}
                  target="_blank"
                  rel="noreferrer"
                  sx={{ fontSize: 1, mt: 1, display: 'inline-block' }}
                >
                  {error.actionLabel} →
                </Link>
              )}
            </Box>
            <Button
              variant="invisible"
              aria-label="Dismiss"
              onClick={() => setError(null)}
              sx={{ ...actionButtonSx, color: 'fg.muted', p: 1, flexShrink: 0 }}
            >
              <XIcon size={14} />
            </Button>
          </Flash>
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

          <Box
            sx={{
              bg: 'canvas.inset',
              border: '1px solid',
              borderColor: 'border.default',
              borderRadius: 2,
              p: 3,
            }}
          >
            <Heading id="rgp-scopes-list" sx={{ fontSize: 1, mb: 2 }}>
              Required scopes
            </Heading>
            <Box
              as="ul"
              sx={{
                listStyle: 'none',
                pl: 0,
                m: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
              }}
            >
              {requiredScopes.map((scope) => (
                <Box as="li" key={scope} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <CheckIcon size={14} color="currentColor" />
                  <Text sx={{ fontSize: 1, color: 'fg.muted' }}>{scope}</Text>
                </Box>
              ))}
            </Box>
          </Box>
        </Box>

        <Box
          sx={{
            display: 'flex',
            flexDirection: mode === 'compact' ? 'column' : 'row',
            gap: 2,
            alignItems: mode === 'compact' ? 'stretch' : 'center',
          }}
        >
          <Button
            variant="primary"
            onClick={saveToken}
            disabled={!hasToken || validating}
            loading={validating}
            sx={actionButtonSx}
          >
            {hasToken ? 'Validate and save token' : 'Add a token to continue'}
          </Button>
          {onOpenOptions && (
            <Button variant="default" onClick={onOpenOptions} sx={actionButtonSx}>
              Open full setup
            </Button>
          )}
        </Box>

        <Text sx={{ fontSize: 1, color: 'fg.muted' }}>
          Need one?{' '}
          <Link href={PAT_URL} target="_blank" rel="noreferrer">
            Generate a PAT with the right scopes
          </Link>
          .
        </Text>
      </Box>
    </Box>
  )
}
