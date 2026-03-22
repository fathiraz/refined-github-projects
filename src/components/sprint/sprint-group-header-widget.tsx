import React, { useCallback, useEffect, useState } from 'react'
import Tippy from '@tippyjs/react'
import { ensureTippyCss } from '../../lib/tippy-utils'
import { Box, Button, Spinner, Text } from '@primer/react'
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

  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
        {state === 'loading' && <Spinner size="small" />}

        {state === 'error' && (
          <Text sx={{ fontSize: 0, color: 'danger.fg' }}>{error ?? 'Sprint error'}</Text>
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
                    transition: 'background-color 120ms ease',
                    '&:hover:not([disabled])': { bg: 'accent.subtle' },
                    '&:active:not([disabled])': { bg: 'canvas.inset' },
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
                  transition: 'color 150ms ease, background-color 150ms ease',
                  '&:hover:not([disabled])': { color: 'fg.default', bg: 'canvas.subtle' },
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
                  transition: 'background-color 120ms ease',
                  '&:hover:not([disabled])': { bg: 'accent.subtle' },
                  '&:active:not([disabled])': { bg: 'canvas.inset' },
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
                  transition: 'color 150ms ease, background-color 150ms ease',
                  '&:hover:not([disabled])': { color: 'fg.default', bg: 'canvas.subtle' },
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
