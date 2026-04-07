import React, { useEffect, useState } from 'react'
import { Box, Button, Heading, Text } from '@primer/react'
import { XIcon } from '@primer/octicons-react'
import { shortcutRegistry, formatShortcut, type ShortcutDefinition } from '../lib/keyboard'
import { Z_MODAL } from '../lib/z-index'

interface KeyboardHelpOverlayProps {
  onClose: () => void
}

export function KeyboardHelpOverlay({ onClose }: KeyboardHelpOverlayProps) {
  const [grouped, setGrouped] = useState<Map<string, ShortcutDefinition[]>>(() =>
    shortcutRegistry.getGrouped(),
  )

  useEffect(() => shortcutRegistry.subscribe(() => setGrouped(shortcutRegistry.getGrouped())), [])

  useEffect(() => {
    function handle(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', handle, true)
    return () => document.removeEventListener('keydown', handle, true)
  }, [onClose])

  const contextOrder = ['Global', 'Table Selection', 'Modal Navigation']

  return (
    <Box
      sx={{
        position: 'fixed',
        inset: 0,
        bg: 'rgba(27,31,36,0.5)',
        zIndex: Z_MODAL,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Box
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard Shortcuts"
        sx={{
          bg: 'canvas.overlay',
          border: '1px solid',
          borderColor: 'border.default',
          borderRadius: 2,
          width: 'min(520px, 90vw)',
          maxHeight: '80vh',
          overflow: 'auto',
          boxShadow: 'none',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 4,
            py: 3,
            borderBottom: '1px solid',
            borderColor: 'border.default',
          }}
        >
          <Heading as="h2" sx={{ m: 0, fontSize: 3, fontWeight: 'bold' }}>
            Keyboard Shortcuts
          </Heading>
          <Button
            variant="invisible"
            size="small"
            onClick={onClose}
            aria-label="Close"
            sx={{ p: '4px', minWidth: 'unset', color: 'fg.muted', boxShadow: 'none' }}
          >
            <XIcon size={16} />
          </Button>
        </Box>

        <Box sx={{ px: 4, py: 3 }}>
          {contextOrder.map((context) => {
            const shortcuts = grouped.get(context)
            if (!shortcuts || shortcuts.length === 0) return null
            return (
              <Box key={context} sx={{ mb: 4, '&:last-child': { mb: 0 } }}>
                <Text
                  sx={{
                    fontSize: 0,
                    fontWeight: 'bold',
                    color: 'fg.muted',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    mb: 2,
                    display: 'block',
                  }}
                >
                  {context}
                </Text>
                {shortcuts.map((s) => (
                  <Box
                    key={s.id}
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      py: '6px',
                    }}
                  >
                    <Text sx={{ fontSize: 1 }}>{s.label}</Text>
                    <Box
                      as="kbd"
                      sx={{
                        fontSize: 0,
                        fontFamily: 'inherit',
                        fontWeight: 500,
                        px: '6px',
                        py: '2px',
                        borderRadius: 1,
                        bg: 'canvas.inset',
                        border: '1px solid',
                        borderColor: 'border.default',
                        color: 'fg.muted',
                        lineHeight: 1.6,
                      }}
                    >
                      {formatShortcut(s)}
                    </Box>
                  </Box>
                ))}
              </Box>
            )
          })}
        </Box>
      </Box>
    </Box>
  )
}
