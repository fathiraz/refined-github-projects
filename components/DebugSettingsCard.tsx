import React from 'react'
import { Box, FormControl, Heading, Text, ToggleSwitch } from '@primer/react'
import { debugStorage } from '../lib/storage'

export function DebugSettingsCard(): React.JSX.Element {
  const [debugEnabled, setDebugEnabled] = React.useState(false)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let mounted = true
    async function load() {
      try {
        const value = await debugStorage.getValue()
        if (mounted) setDebugEnabled(value)
      } catch {
        if (mounted) setDebugEnabled(false)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    const unwatch = debugStorage.watch((newValue) => {
      if (mounted) setDebugEnabled(newValue ?? false)
    })
    return () => {
      mounted = false
      unwatch()
    }
  }, [])

  const handleToggle = async (checked: boolean) => {
    setDebugEnabled(checked)
    await debugStorage.setValue(checked)
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
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 3 }}>
            <Box>
              <FormControl.Label id="rgp-debug-label" sx={{ fontWeight: 'bold', fontSize: 1, mb: 0, cursor: 'default' }}>
                Enable debug console
              </FormControl.Label>
              <FormControl.Caption>
                When enabled, all debug logs will be printed to the browser console.
                Use this for troubleshooting or development purposes.
              </FormControl.Caption>
            </Box>
            <ToggleSwitch
              checked={debugEnabled}
              onClick={() => handleToggle(!debugEnabled)}
              disabled={loading}
              aria-labelledby="rgp-debug-label"
              size="small"
              sx={{ flexShrink: 0 }}
            />
          </Box>
        </FormControl>
      </Box>
    </Box>
  )
}