import React from 'react'
import { Box, Heading, Text } from '@primer/react'
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

        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
          <input
            id="rgp-debug-toggle"
            type="checkbox"
            checked={debugEnabled}
            disabled={loading}
            onChange={(e) => handleToggle(e.target.checked)}
            style={{ marginTop: 3, cursor: loading ? 'not-allowed' : 'pointer', flexShrink: 0 }}
          />
          <Box>
            <label
              htmlFor="rgp-debug-toggle"
              style={{ fontWeight: 'bold', fontSize: 14, cursor: loading ? 'not-allowed' : 'pointer', display: 'block' }}
            >
              Enable debug console
            </label>
            <Text as="p" sx={{ fontSize: 0, color: 'fg.muted', m: 0, mt: 1, lineHeight: 1.5 }}>
              When enabled, all debug logs will be printed to the browser console.
              Use this for troubleshooting or development purposes.
            </Text>
          </Box>
        </Box>
      </Box>
    </Box>
  )
}