import React, { useEffect, useRef, useState } from 'react'
import { Box, Button, Heading, Text } from '@primer/react'
import { driver } from 'driver.js'
import driverCss from 'driver.js/dist/driver.css?inline'
import { sendMessage } from '../lib/messages'
import { selectionStore } from '../lib/selection-store'
import { onboardingDismissedStorage } from '../lib/storage'
import { getAllInjectedItemIds } from '../lib/dom-utils'
import { KeyboardHint, PanelCard, PrimaryAction, StatusBanner, XIcon } from './ui/primitives'

const rgpDriverOverrides = `
  .rgp-tour-popover.driver-popover {
    background: var(--color-canvas-overlay, #fff);
    border: 1px solid var(--color-border-default, #d0d7de);
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.16);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    padding: 20px;
    max-width: 320px;
  }
  .rgp-tour-popover .driver-popover-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--color-fg-default, #1f2328);
    margin-bottom: 6px;
  }
  .rgp-tour-popover .driver-popover-description {
    font-size: 13px;
    color: var(--color-fg-muted, #656d76);
    line-height: 1.6;
  }
  .rgp-tour-popover .driver-popover-description kbd {
    font-size: 11px;
    padding: 1px 5px;
    border-radius: 4px;
    background: var(--color-canvas-inset, #f6f8fa);
    border: 1px solid var(--color-border-default, #d0d7de);
  }
  .rgp-tour-popover .driver-popover-footer button {
    font-size: 12px;
    font-weight: 500;
    border-radius: 6px;
    padding: 5px 12px;
    cursor: pointer;
    border: 1px solid var(--color-border-default, #d0d7de);
    background: var(--color-canvas-default, #fff);
    color: var(--color-fg-default, #1f2328);
  }
  .rgp-tour-popover .driver-popover-next-btn {
    background: var(--color-accent-emphasis, #0969da) !important;
    color: #fff !important;
    border-color: transparent !important;
  }
  .rgp-tour-popover .driver-popover-progress-text {
    font-size: 11px;
    color: var(--color-fg-muted, #656d76);
  }
  .driver-popover-close-btn {
    display: none !important;
  }
`

export function OnboardingCoach() {
  const [hasToken, setHasToken] = useState<boolean | null>(null)
  const [count, setCount] = useState(() => selectionStore.count())
  const [dismissed, setDismissed] = useState<boolean | null>(null) // null = loading
  const [statusError, setStatusError] = useState<string | null>(null)
  const [tourRunning, setTourRunning] = useState(false)
  const driverRef = useRef<ReturnType<typeof driver> | null>(null)

  useEffect(() => {
    onboardingDismissedStorage.getValue().then(val => setDismissed(val))

    sendMessage('getPatStatus', {})
      .then((result) => {
        setHasToken(result.hasPat)
        setStatusError(null)
      })
      .catch(() => setStatusError('Could not verify GitHub access'))

    return selectionStore.subscribe(() => setCount(selectionStore.count()))
  }, [])

  function dismiss() {
    onboardingDismissedStorage.setValue(true)
    setDismissed(true)
  }

  function startTour() {
    if (!document.getElementById('rgp-driver-css')) {
      const style = document.createElement('style')
      style.id = 'rgp-driver-css'
      style.textContent = driverCss + rgpDriverOverrides
      document.head.appendChild(style)
    }

    function blockEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopImmediatePropagation()
      }
    }
    document.addEventListener('keydown', blockEscape, true)

    setTourRunning(true)

    const driverObj = driver({
      showProgress: true,
      allowClose: false,
      allowKeyboardControl: false,
      overlayColor: 'rgba(0,0,0,0.55)',
      stagePadding: 8,
      popoverClass: 'rgp-tour-popover',
      onDestroyed: () => {
        document.removeEventListener('keydown', blockEscape, true)
        document.getElementById('rgp-bulk-sentinel')?.remove()
        dismiss()
      },
      steps: [
        {
          popover: {
            title: 'Welcome to Refined GitHub Projects',
            description: 'This quick tour covers the two main features: bulk row actions and sprint tracking.',
            nextBtnText: 'Show me →',
          },
        },
        {
          element: () => document.querySelector<HTMLElement>('.rgp-cb-cell:not(.rgp-cb-cell--header)') ?? document.body,
          popover: {
            title: 'Select rows',
            description: 'Click a checkbox to select an item. Use <kbd>⌘A</kbd> to select all, <kbd>Esc</kbd> to clear.',
            side: 'bottom',
            align: 'start',
            onNextClick: () => {
              selectionStore.selectBatch(getAllInjectedItemIds())
              const s = document.createElement('div')
              s.id = 'rgp-bulk-sentinel'
              s.style.cssText = 'position:fixed;bottom:32px;left:50%;transform:translateX(-50%);width:min(760px,calc(100vw - 32px));height:56px;pointer-events:none;z-index:-1'
              document.body.appendChild(s)
              setTimeout(() => driverRef.current?.moveNext(), 150)
            },
          },
        },
        {
          element: () => document.querySelector<HTMLElement>('#rgp-bulk-sentinel') ?? document.body,
          popover: {
            title: 'Bulk Actions Bar',
            description: 'Select any items and this bar appears. Edit fields, close/reopen issues, export CSV, duplicate, and more — all with keyboard shortcuts.',
            side: 'top',
            align: 'start',
            onNextClick: () => {
              selectionStore.clear()
              document.getElementById('rgp-bulk-sentinel')?.remove()
              setTimeout(() => driverRef.current?.moveNext(), 100)
            },
          },
        },
        {
          element: () => document.querySelector<HTMLElement>('[data-rgp-sprint-btn]') ?? document.body,
          popover: {
            title: 'Sprint Panel',
            description: 'Track active sprints, configure your sprint field, and manage iteration handoffs — all without leaving the project view.',
            side: 'bottom',
            align: 'start',
            doneBtnText: 'Got it!',
          },
        },
      ],
    })

    driverRef.current = driverObj
    driverObj.drive()
  }

  if (dismissed === null || dismissed || count > 0 || tourRunning) return null

  return (
    <Box sx={{ position: 'fixed', bottom: 4, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, width: 'min(560px, calc(100vw - 32px))' }}>
      <Box sx={{ position: 'relative' }}>
        <PanelCard variant="elevated" padding="large">

          <Box sx={{ position: 'absolute', top: 3, right: 3 }}>
            <Button
              variant="invisible"
              size="small"
              onClick={dismiss}
              aria-label="Dismiss"
              sx={{ p: '2px', minWidth: 'unset', color: 'fg.muted' }}
            >
              <XIcon size={14} />
            </Button>
          </Box>

          {statusError && (
            <StatusBanner variant="error" onDismiss={() => setStatusError(null)}>
              {statusError}
            </StatusBanner>
          )}

          <Heading as="h2" sx={{ fontSize: 3, fontWeight: 'bold', m: 0, mb: 1, pr: 5 }}>
            Refined GitHub Projects
          </Heading>
          <Text as="p" sx={{ m: 0, mb: 3, color: 'fg.muted', fontSize: 1, lineHeight: 1.6 }}>
            Bulk edit, close, duplicate, and export items directly from the Projects table.
          </Text>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
            <Button variant="primary" size="small" onClick={startTour}>
              Take a quick tour
            </Button>
            <Button variant="invisible" size="small" onClick={dismiss} sx={{ color: 'fg.muted', boxShadow: 'none' }}>
              Skip
            </Button>
          </Box>

          <KeyboardHint shortcuts={[
            { key: '⌘A', label: 'select all' },
            { key: 'Esc', label: 'clear' },
          ]} />

          {hasToken === false && (
            <Box sx={{ mt: 3 }}>
              <PrimaryAction icon={null} onClick={() => sendMessage('openOptions', {})}>
                Set up GitHub Token
              </PrimaryAction>
            </Box>
          )}

          {hasToken && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 2 }}>
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bg: 'success.fg', flexShrink: 0 }} />
              <Text sx={{ fontSize: 1, color: 'fg.muted' }}>Token ready — select items to start.</Text>
            </Box>
          )}

        </PanelCard>
      </Box>
    </Box>
  )
}
