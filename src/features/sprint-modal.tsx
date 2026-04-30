import React, { useCallback, useEffect, useState } from 'react'
import Tippy from '@/ui/tooltip'
import { ensureTippyCss } from '@/lib/tippy-utils'
import { Box, Button, Flash, Heading, Label, Spinner, Text } from '@primer/react'
import { Z_MODAL, Z_TOOLTIP } from '@/lib/z-index'
import { GearIcon, SlidersIcon, SprintIcon, XIcon } from '@/ui/icons'
import { ModalStepHeader } from '@/ui/modal-step-header'
import { sendMessage } from '@/lib/messages'
import type { SprintInfo } from '@/lib/messages'
import type { SprintSettings } from '@/lib/storage'
import { fmt, SPRINT_FILTER } from '@/lib/sprint-utils'
import type { ProjectData } from '@/lib/github-project'
import { sprintConfirmEndStore } from '@/lib/sprint-store'
import { SprintProgressView } from '@/features/sprint-progress-view'
import { SettingsView } from '@/features/sprint-settings-view'
import { EndSprintView } from '@/features/sprint-end-view'

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

export function SprintPanel({
  projectId,
  owner,
  isOrg,
  number,
  getFields,
  visible,
  onClose,
}: Props) {
  ensureTippyCss()

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
      if (!result.hasSettings) setState('not-configured')
      else if (result.activeSprint) setState('active')
      else if (result.acknowledgedSprint) setState('acknowledged')
      else setState('no-active')
    } catch (e) {
      console.error('[rgp:sprint] fetchStatus error:', e)
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
    return () => {
      unsub()
    }
  }, [state, showSettings])

  if (!visible) return null

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
        inset: 0,
        bg: 'rgba(27,31,36,0.5)',
        zIndex: Z_MODAL,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <Box
        sx={{
          bg: 'canvas.overlay',
          border: '1px solid',
          borderColor: 'border.default',
          borderRadius: 2,
          overflow: 'hidden',
          width: '100%',
          maxWidth: 480,
          animation: 'fadeSlideIn 200ms cubic-bezier(0.4, 0, 0.2, 1)',
          '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
        }}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        onKeyDown={(e: React.KeyboardEvent) => {
          e.stopPropagation()
          if (e.key === 'Escape') onClose()
        }}
        onKeyUp={(e: React.KeyboardEvent) => e.stopPropagation()}
      >
        {/* header — switches between ModalStepHeader (sub-views) and custom (main) */}
        {showSettings ? (
          <ModalStepHeader
            title="Sprint Settings"
            icon={<GearIcon size={16} />}
            onBack={() => setShowSettings(false)}
            onClose={onClose}
          />
        ) : confirmingEnd && status?.activeSprint ? (
          <ModalStepHeader
            title="End Sprint"
            icon={<SprintIcon size={16} />}
            subtitle={`${status.activeSprint.title} · ${fmt(status.activeSprint.startDate)} – ${fmt(status.activeSprint.endDate)}`}
            onBack={() => setConfirmingEnd(false)}
            onClose={onClose}
          />
        ) : (
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
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <SprintIcon size={16} color="var(--fgColor-accent)" />
              <Heading as="h2" sx={{ fontSize: 3, fontWeight: 'bold', m: 0 }}>
                Sprint
              </Heading>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Tippy
                content="Sprint settings"
                placement="bottom-end"
                delay={[400, 0]}
                zIndex={Z_TOOLTIP}
              >
                <Button
                  variant="invisible"
                  size="small"
                  onClick={() => setShowSettings((v) => !v)}
                  aria-label="Sprint settings"
                  sx={{
                    p: '4px',
                    color: 'fg.muted',
                    boxShadow: 'none',
                    transition: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
                    '&:hover:not(:disabled)': { transform: 'translateY(-1px)' },
                    '&:active': { transform: 'translateY(0)', transition: '100ms' },
                    '@media (prefers-reduced-motion: reduce)': {
                      transition: 'none',
                      '&:hover:not(:disabled)': { transform: 'none' },
                    },
                  }}
                >
                  <SlidersIcon size={16} />
                </Button>
              </Tippy>
              <Tippy
                content="Close sprint panel"
                placement="bottom-end"
                delay={[400, 0]}
                zIndex={Z_TOOLTIP}
              >
                <Button
                  variant="invisible"
                  size="small"
                  onClick={onClose}
                  aria-label="Close sprint panel"
                  sx={{
                    p: '4px',
                    color: 'fg.muted',
                    boxShadow: 'none',
                    transition: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
                    '&:hover:not(:disabled)': { transform: 'translateY(-1px)' },
                    '&:active': { transform: 'translateY(0)', transition: '100ms' },
                    '@media (prefers-reduced-motion: reduce)': {
                      transition: 'none',
                      '&:hover:not(:disabled)': { transform: 'none' },
                    },
                  }}
                >
                  <XIcon size={16} />
                </Button>
              </Tippy>
            </Box>
          </Box>
        )}

        {/* body */}
        <Box sx={{ px: 4, py: 3, minHeight: 160 }}>
          {showSettings ? (
            <SettingsView
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
            />
          ) : confirmingEnd && status?.activeSprint && status?.settings ? (
            <EndSprintView
              projectId={projectId}
              owner={owner}
              isOrg={isOrg}
              number={number}
              activeSprint={status.activeSprint}
              settings={status.settings}
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
                <Flash variant="danger" sx={{ fontSize: 0 }}>
                  {error ?? 'Failed to load sprint status.'}
                </Flash>
              )}

              {state === 'not-configured' && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Text sx={{ fontSize: 1, color: 'fg.muted' }}>
                    Sprint tracking isn't set up for this project yet.
                  </Text>
                  <Text sx={{ fontSize: 0, color: 'fg.subtle' }}>
                    Each GitHub project has its own sprint configuration.
                  </Text>
                  <Tippy
                    content="Configure sprint tracking for this project"
                    placement="top"
                    delay={[400, 0]}
                    zIndex={Z_TOOLTIP}
                  >
                    <Button
                      variant="primary"
                      size="small"
                      onClick={() => setShowSettings(true)}
                      sx={{
                        boxShadow: 'none',
                        transition: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
                        '&:hover:not(:disabled)': { transform: 'translateY(-1px)' },
                        '&:active': { transform: 'translateY(0)', transition: '100ms' },
                        '@media (prefers-reduced-motion: reduce)': {
                          transition: 'none',
                          '&:hover:not(:disabled)': { transform: 'none' },
                        },
                      }}
                    >
                      Set Up Sprint
                    </Button>
                  </Tippy>
                </Box>
              )}

              {state === 'no-active' && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Text sx={{ fontSize: 1, fontWeight: 'semibold', color: 'fg.muted' }}>
                    {status?.settings?.sprintFieldName ?? 'Sprint'}
                  </Text>
                  <Text sx={{ fontSize: 1, color: 'fg.muted' }}>No active sprint</Text>
                  {status?.nearestUpcoming && (
                    <>
                      <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
                        Next: {status.nearestUpcoming.title} — starts{' '}
                        {fmt(status.nearestUpcoming.startDate)}
                      </Text>
                      <Tippy
                        content="Start tracking the upcoming sprint"
                        placement="top"
                        delay={[400, 0]}
                        zIndex={Z_TOOLTIP}
                      >
                        <Button
                          variant="primary"
                          size="small"
                          disabled={acknowledging}
                          onClick={handleAcknowledge}
                          sx={{
                            boxShadow: 'none',
                            transition: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
                            '&:hover:not(:disabled)': { transform: 'translateY(-1px)' },
                            '&:active': { transform: 'translateY(0)', transition: '100ms' },
                            '@media (prefers-reduced-motion: reduce)': {
                              transition: 'none',
                              '&:hover:not(:disabled)': { transform: 'none' },
                            },
                          }}
                        >
                          {acknowledging ? <Spinner size="small" /> : 'Track Sprint'}
                        </Button>
                      </Tippy>
                    </>
                  )}
                </Box>
              )}

              {state === 'acknowledged' && currentSprint && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Box
                    sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                  >
                    <Text sx={{ fontSize: 1, fontWeight: 'semibold', color: 'fg.default' }}>
                      {currentSprint.title}
                    </Text>
                    <Label variant="attention">Upcoming</Label>
                  </Box>
                  <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
                    {fmt(currentSprint.startDate)} – {fmt(currentSprint.endDate)}
                  </Text>
                  <Text sx={{ fontSize: 0, color: 'fg.subtle' }}>
                    Filter{' '}
                    <Text as="code" sx={{ fontFamily: 'mono', fontSize: 0 }}>
                      {SPRINT_FILTER}
                    </Text>{' '}
                    is applied automatically on save.
                  </Text>
                  <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
                    <Tippy
                      content="Stop tracking this sprint"
                      placement="top"
                      delay={[400, 0]}
                      zIndex={Z_TOOLTIP}
                    >
                      <Button
                        variant="default"
                        size="small"
                        onClick={handleStopTracking}
                        sx={{
                          boxShadow: 'none',
                          transition: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
                          '&:hover:not(:disabled)': { transform: 'translateY(-1px)' },
                          '&:active': { transform: 'translateY(0)', transition: '100ms' },
                          '@media (prefers-reduced-motion: reduce)': {
                            transition: 'none',
                            '&:hover:not(:disabled)': { transform: 'none' },
                          },
                        }}
                      >
                        Stop tracking
                      </Button>
                    </Tippy>
                  </Box>
                </Box>
              )}

              {state === 'active' && status?.activeSprint && status?.settings && (
                <SprintProgressView
                  activeSprint={status.activeSprint}
                  settings={status.settings}
                  projectId={projectId}
                  owner={owner}
                  number={number}
                  isOrg={isOrg}
                  onEndSprint={() => setConfirmingEnd(true)}
                  onOpenSettings={() => setShowSettings(true)}
                />
              )}
            </>
          )}
        </Box>
      </Box>
    </Box>
  )
}
