import React, { useCallback, useEffect, useState } from 'react'
import { Box, Button, Spinner, Text, Tooltip } from '@primer/react'
import {
  GhostAction,
  SlidersIcon,
  XIcon,
  PrimaryAction,
  SecondaryAction,
  StatusBanner,
  SprintIcon,
} from '../ui/primitives'
import { sendMessage } from '../../lib/messages'
import type { SprintInfo } from '../../lib/messages'
import type { SprintSettings } from '../../lib/storage'
import { SprintSettingsDrawer } from './SprintSettingsDrawer'
import { EndSprintConfirmModal } from './EndSprintConfirmModal'
import type { ProjectData } from '../../entrypoints/content/observer'
import { sprintConfirmEndStore } from '../../lib/sprintConfirmEndStore'

interface Props {
  projectId: string
  owner: string
  isOrg: boolean
  number: number
  getFields: () => Promise<ProjectData>
  visible: boolean
  onClose: () => void
}

type PanelState = 'loading' | 'not-configured' | 'no-active' | 'acknowledged' | 'active' | 'error'

interface SprintStatus {
  hasSettings: boolean
  activeSprint: SprintInfo | null
  nearestUpcoming: SprintInfo | null
  acknowledgedSprint: SprintInfo | null
  iterationFieldId: string | null
  settings: SprintSettings | null
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function daysLeft(endDate: string): number {
  const today = new Date().toISOString().slice(0, 10)
  const diff =
    (new Date(endDate + 'T00:00:00Z').getTime() - new Date(today + 'T00:00:00Z').getTime()) /
    86_400_000
  return Math.max(0, Math.ceil(diff))
}

function sprintDuration(startDate: string, endDate: string): number {
  const diff =
    (new Date(endDate + 'T00:00:00Z').getTime() -
      new Date(startDate + 'T00:00:00Z').getTime()) /
    86_400_000
  return Math.max(1, Math.ceil(diff))
}

export function SprintPanel({ projectId, owner, isOrg, number, getFields, visible, onClose }: Props) {
  if (!visible) return null
  const [state, setState] = useState<PanelState>('loading')
  const [status, setStatus] = useState<SprintStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [confirmingEnd, setConfirmingEnd] = useState(false)
  const [acknowledging, setAcknowledging] = useState(false)

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

  useEffect(() => {
    const unsub = sprintConfirmEndStore.subscribe((pending) => {
      if (pending && state === 'active' && !showSettings) {
        setConfirmingEnd(true)
        sprintConfirmEndStore.set(false)
      }
    })
    return () => { unsub() }
  }, [state, showSettings])

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

  const handleStopTracking = async () => {
    if (!status?.settings) return
    await sendMessage('saveSprintSettings', {
      projectId,
      settings: { ...status.settings, acknowledgedSprintId: undefined },
    })
    await fetchStatus()
  }

  const currentSprint = status?.activeSprint ?? status?.acknowledgedSprint ?? null

  return (
    <Box
      sx={{
        position: 'fixed',
        top: '60px',
        right: '16px',
        zIndex: 9998,
        width: 260,
        bg: 'canvas.default',
        border: '1px solid',
        borderColor: 'border.default',
        borderRadius: 2,
        boxShadow: 'shadow.medium',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 3,
          py: 2,
          borderBottom: '1px solid',
          borderColor: 'border.default',
          bg: 'canvas.subtle',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <SprintIcon size={14} color="var(--fgColor-accent, #0969da)" />
          <Text sx={{ fontWeight: 'semibold', fontSize: 1, color: 'fg.default' }}>
            Sprint
          </Text>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Tooltip text="Sprint settings" direction="sw">
            <GhostAction
              onClick={() => setShowSettings((v) => !v)}
              icon={<SlidersIcon size={14} />}
              aria-label="Sprint settings"
              size="small"
            />
          </Tooltip>
          <Tooltip text="Close sprint panel" direction="sw">
            <GhostAction
              onClick={onClose}
              icon={<XIcon size={14} />}
              aria-label="Close sprint panel"
              size="small"
            />
          </Tooltip>
        </Box>
      </Box>

      {/* Body */}
      <Box sx={{ p: 3 }}>
        {showSettings ? (
          <SprintSettingsDrawer
            projectId={projectId}
            owner={owner}
            isOrg={isOrg}
            number={number}
            getFields={getFields}
            currentSettings={status?.settings ?? null}
            onSaved={async () => {
              setShowSettings(false)
              await fetchStatus()
            }}
            onCancel={() => setShowSettings(false)}
          />
        ) : confirmingEnd && status?.activeSprint && status?.settings ? (
          <EndSprintConfirmModal
            projectId={projectId}
            owner={owner}
            isOrg={isOrg}
            number={number}
            activeSprint={status.activeSprint}
            settings={status.settings}
            onClose={() => setConfirmingEnd(false)}
            onComplete={async () => {
              setConfirmingEnd(false)
              await fetchStatus()
            }}
          />
        ) : (
          <>
            {state === 'loading' && (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                <Spinner size="small" />
              </Box>
            )}

            {state === 'error' && (
              <StatusBanner variant="error">
                {error ?? 'Failed to load sprint status.'}
              </StatusBanner>
            )}

            {state === 'not-configured' && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Text sx={{ fontSize: 1, color: 'fg.muted' }}>
                  Sprint tracking isn't set up for this project yet.
                </Text>
                <Text sx={{ fontSize: 0, color: 'fg.subtle' }}>
                  Each GitHub project has its own sprint configuration.
                </Text>
                <PrimaryAction size="small" onClick={() => setShowSettings(true)}>
                  Set Up Sprint
                </PrimaryAction>
              </Box>
            )}

            {state === 'no-active' && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Text sx={{ fontSize: 1, color: 'fg.muted', fontWeight: 'semibold' }}>
                  {status?.settings?.sprintFieldName ?? 'Sprint'}
                </Text>
                <Text sx={{ fontSize: 1, color: 'fg.muted' }}>No active sprint</Text>
                {status?.nearestUpcoming && (
                  <>
                    <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
                      Next: {status.nearestUpcoming.title} — starts{' '}
                      {formatDate(status.nearestUpcoming.startDate)}
                    </Text>
                    <PrimaryAction
                      size="small"
                      loading={acknowledging}
                      onClick={handleAcknowledge}
                    >
                      Track Sprint
                    </PrimaryAction>
                  </>
                )}
              </Box>
            )}

            {state === 'acknowledged' && currentSprint && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text sx={{ fontSize: 1, fontWeight: 'semibold', color: 'fg.default' }}>
                    {currentSprint.title}
                  </Text>
                  <Box
                    sx={{
                      fontSize: 0,
                      color: 'fg.muted',
                      bg: 'canvas.subtle',
                      border: '1px solid',
                      borderColor: 'border.muted',
                      borderRadius: '2em',
                      px: 2,
                      py: '2px',
                      lineHeight: 1.5,
                    }}
                  >
                    Upcoming
                  </Box>
                </Box>
                <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
                  starts {formatDate(currentSprint.startDate)} · {formatDate(currentSprint.startDate)} – {formatDate(currentSprint.endDate)}
                </Text>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
                  <SecondaryAction size="small" onClick={handleStopTracking}>
                    Stop tracking
                  </SecondaryAction>
                </Box>
              </Box>
            )}

            {state === 'active' && currentSprint && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Text sx={{ fontSize: 1, fontWeight: 'semibold', color: 'fg.default' }}>
                  {currentSprint.title}
                </Text>
                <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
                  {formatDate(currentSprint.startDate)} – {formatDate(currentSprint.endDate)} ·{' '}
                  {daysLeft(currentSprint.endDate)} day{daysLeft(currentSprint.endDate) !== 1 ? 's' : ''} left
                </Text>
                {/* Progress bar */}
                <Box
                  sx={{
                    height: '4px',
                    borderRadius: '2px',
                    bg: 'neutral.muted',
                    overflow: 'hidden',
                    mt: 1,
                  }}
                >
                  <Box
                    sx={{
                      height: '100%',
                      borderRadius: '2px',
                      bg: 'accent.emphasis',
                      width: `${Math.min(
                        100,
                        Math.round(
                          ((sprintDuration(currentSprint.startDate, currentSprint.endDate) -
                            daysLeft(currentSprint.endDate)) /
                            sprintDuration(currentSprint.startDate, currentSprint.endDate)) *
                            100,
                        ),
                      )}%`,
                    }}
                  />
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
                  <Button
                    variant="danger"
                    size="small"
                    onClick={() => setConfirmingEnd(true)}
                  >
                    End Sprint
                  </Button>
                </Box>
              </Box>
            )}
          </>
        )}
      </Box>
    </Box>
  )
}
