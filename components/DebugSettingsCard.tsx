import React from 'react'
import { Box, FormControl, Heading, Text } from '@primer/react'
import { debugStorage } from '../lib/storage'
import { setDebugMode } from '../lib/debugLogger'

export function DebugSettingsCard(): JSX.Element {
  const [debugEnabled, setDebugEnabled] = React.useState(false)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    debugStorage.getValue().then((value: boolean) => {
      setDebugEnabled(value)
      setLoading(false)
    })
  }, [])

  const handleToggle = async (checked: boolean) => {
    setDebugEnabled(checked)
    await setDebugMode(checked)
  }

  return (
    <Box
      sx={{
        border: '1px solid',
        borderColor: 'border.default',
        borderRadius: 2,
        bg: 'canvas.default',
        p: 4,
      }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Box>
          <Heading as="h2" sx={{ fontSize: 2, fontWeight: 'bold', m: 0 }}>
            Debug Settings
          </Heading>
          <Text as="p" sx={{ fontSize: 1, color: 'fg.muted', m: 0, mt: 1 }}>
            Development and troubleshooting options
          </Text>
        </Box>

        <FormControl>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box
              as="input"
              type="checkbox"
              checked={debugEnabled}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleToggle(e.target.checked)}
              disabled={loading}
              aria-label="Enable debug console"
              sx={{
                width: 16,
                height: 16,
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            />
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <FormControl.Label sx={{ fontWeight: 'bold', fontSize: 1 }}>
                Enable debug console
              </FormControl.Label>
              <FormControl.Caption sx={{ fontSize: 0 }}>
                When enabled, all debug logs will be printed to the browser console.
                Use this for troubleshooting or development purposes.
              </FormControl.Caption>
            </Box>
          </Box>
        </FormControl>
      </Box>
    </Box>
  )
}