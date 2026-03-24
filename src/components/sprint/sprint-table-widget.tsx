import React, { useCallback, useEffect, useState } from 'react'
import Tippy from '../ui/tooltip'
import { ensureTippyCss } from '../../lib/tippy-utils'
import { Box, Button, Label, Spinner, Text } from '@primer/react'
import { SlidersIcon } from '../ui/primitives'
import { sendMessage } from '../../lib/messages'
import type { SprintInfo } from '../../lib/messages'
import type { SprintSettings } from '../../lib/storage'
import type { ProjectData } from '../../entries/content/observer'
import { sprintPanelStore } from '../../lib/sprint-panel-store'
import { sprintConfirmEndStore } from '../../lib/sprint-confirm-end-store'

interface Props {
  projectId: string
  owner: string
  isOrg: boolean
  number: number
  getFields: () => Promise<ProjectData>
}

type WidgetState = 'loading' | 'not-configured' | 'no-active' | 'acknowledged' | 'active' | 'error'

interface SprintStatus {
  hasSettings: boolean
  activeSprint: SprintInfo | null
  nearestUpcoming: SprintInfo | null
  acknowledgedSprint: SprintInfo | null
  iterationFieldId: string | null
  settings: SprintSettings | null
}


export function SprintGroupHeaderWidget({ projectId, owner, isOrg, number, getFields }: Props) {
  ensureTippyCss()
  const [state, setState] = useState<WidgetState>('loading')
  const [status, setStatus] = useState<SprintStatus | null>(null)
  const [acknowledging, setAcknowledging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    setState('loading')
    setError(null)
    try {
      const result = await sendMessage('getSprintStatus', { projectId, owner, number, isOrg })
      setStatus(result)
      if (!result.hasSettings) {
        setState('not-configured')
      } else if (result.activeSprint) {
        setState('active')
      } else if (result.acknowledgedSprint) {
        setState('acknowledged')
      } else {
        setState('no-active')
      }
    } catch (e) {
      setError(String(e))
      setState('error')
    }
  }, [projectId, owner, number, isOrg])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  const handleAcknowledge = async () => {
    if (!status?.nearestUpcoming) return
    setAcknowledging(true)
    try {
      await sendMessage('acknowledgeUpcomingSprint', {
        projectId,
        iterationId: status.nearestUpcoming.id,
      })
      await fetchStatus()
    } finally {
      setAcknowledging(false)
    }
  }

  const normalizedError = (error ?? 'Unable to load sprint status').replace(/^Error:\s*/, '').trim()
  const displayError =
    normalizedError.length > 72 ? `${normalizedError.slice(0, 69).trimEnd()}...` : normalizedError

  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
      {state === 'loading' && (
        <Box
          role="status"
          aria-live="polite"
          sx={{ display: 'inline-flex', alignItems: 'center', gap: 2, minHeight: '24px', boxShadow: 'none' }}
        >
          <Spinner size="small" srText="" aria-hidden="true" />
          <Text sx={{ fontSize: 0, lineHeight: 1.5, color: 'fg.muted' }}>Checking sprint...</Text>
        </Box>
      )}

      {state === 'error' && (
        <Box
          role="alert"
          aria-live="assertive"
          sx={{ display: 'inline-flex', alignItems: 'center', gap: 2, minHeight: '24px', maxWidth: '240px', boxShadow: 'none' }}
        >
          <Label variant="danger" sx={{ fontSize: 0 }}>
            Issue
          </Label>
          <Text
            sx={{ fontSize: 0, lineHeight: 1.5, color: 'danger.fg', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            title={normalizedError}
            aria-label={normalizedError}
          >
            {displayError}
          </Text>
        </Box>
      )}

      {state === 'no-active' && (
        <>
          {status?.nearestUpcoming && (
            <Tippy content="Activate the next upcoming sprint" placement="top" delay={[400, 0]}>
              <Button
                variant="invisible"
                onClick={handleAcknowledge}
                disabled={acknowledging}
                sx={{
                  color: 'accent.fg',
                  fontWeight: 500,
                  fontSize: 0,
                  px: '8px',
                  py: '3px',
                  height: 'auto',
                  lineHeight: 1.5,
                  border: 'none',
                  borderRadius: 2,
                  boxShadow: 'none',
                  transition: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
                  '&:hover:not(:disabled)': { transform: 'translateY(-1px)', bg: 'accent.subtle' },
                  '&:active': { transform: 'translateY(0)', transition: '100ms' },
                  '@media (prefers-reduced-motion: reduce)': { transition: 'none', '&:hover:not(:disabled)': { transform: 'none' } },
                }}
              >
                {acknowledging ? <Spinner size="small" /> : 'Start Sprint'}
              </Button>
            </Tippy>
          )}
          <Tippy content="Sprint settings" placement="top" delay={[400, 0]}>
            <Button
              variant="invisible"
              aria-label="Sprint settings"
              onClick={() => sprintPanelStore.set(true)}
              sx={{
                color: 'fg.muted',
                p: '3px',
                height: 'auto',
                minWidth: 0,
                lineHeight: 1,
                border: 'none',
                borderRadius: 1,
                boxShadow: 'none',
                transition: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
                '&:hover:not(:disabled)': { transform: 'translateY(-1px)', color: 'fg.default', bg: 'canvas.subtle' },
                '&:active': { transform: 'translateY(0)', transition: '100ms' },
                '@media (prefers-reduced-motion: reduce)': { transition: 'none', '&:hover:not(:disabled)': { transform: 'none' } },
              }}
            >
              <SlidersIcon size={14} />
            </Button>
          </Tippy>
        </>
      )}

      {(state === 'acknowledged' || state === 'active') && (
        <>
          <Tippy content="End the current sprint" placement="top" delay={[400, 0]}>
            <Button
              variant="invisible"
              onClick={() => {
                sprintPanelStore.set(true)
                sprintConfirmEndStore.set(true)
              }}
              sx={{
                color: 'accent.fg',
                fontWeight: 600,
                fontSize: 0,
                px: '8px',
                py: '3px',
                height: 'auto',
                lineHeight: 1.5,
                border: 'none',
                borderRadius: 2,
                boxShadow: 'none',
                transition: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
                '&:hover:not(:disabled)': { transform: 'translateY(-1px)', bg: 'accent.subtle' },
                '&:active': { transform: 'translateY(0)', transition: '100ms' },
                '@media (prefers-reduced-motion: reduce)': { transition: 'none', '&:hover:not(:disabled)': { transform: 'none' } },
              }}
            >
              End Sprint
            </Button>
          </Tippy>
          <Tippy content="Sprint settings" placement="top" delay={[400, 0]}>
            <Button
              variant="invisible"
              aria-label="Sprint settings"
              onClick={() => sprintPanelStore.set(true)}
              sx={{
                color: 'fg.muted',
                p: '3px',
                height: 'auto',
                minWidth: 0,
                lineHeight: 1,
                border: 'none',
                borderRadius: 1,
                boxShadow: 'none',
                transition: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
                '&:hover:not(:disabled)': { transform: 'translateY(-1px)', color: 'fg.default', bg: 'canvas.subtle' },
                '&:active': { transform: 'translateY(0)', transition: '100ms' },
                '@media (prefers-reduced-motion: reduce)': { transition: 'none', '&:hover:not(:disabled)': { transform: 'none' } },
              }}
            >
              <SlidersIcon size={14} />
            </Button>
          </Tippy>
        </>
      )}
    </Box>
  )
}
