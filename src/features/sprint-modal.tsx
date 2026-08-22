import React, { useEffect, useState } from 'react'
import Tippy from '@/ui/tooltip'
import { ensureTippyCss } from '@/lib/tippy-utils'
import { Box, Button, Flash, Heading, Label, Spinner, Text } from '@primer/react'
import { ModalShell } from '@/ui/modal-shell'
import { Z_TOOLTIP } from '@/lib/z-index'
import { GearIcon, SlidersIcon, SprintIcon, XIcon } from '@/ui/icons'
import { ModalStepHeader } from '@/ui/modal-step-header'
import { sendMessage } from '@/lib/messages'
import { useSprintStatus } from '@/lib/use-sprint-status'
import { fmt, fmtRange, SPRINT_FILTER } from '@/lib/sprint-utils'
import { sprintConfirmEndStore } from '@/lib/sprint-store'
import { SprintProgressView } from '@/features/sprint-progress-view'
import { SettingsView } from '@/features/sprint-settings-view'
import { EndSprintView } from '@/features/sprint-end-view'
import { primerCss } from '@/lib/primer-css-helper'

interface Props {
  projectId: string
  owner: string
  isOrg: boolean
  number: number
  visible: boolean
  onClose: () => void
}

export function SprintPanel({ projectId, owner, isOrg, number, visible, onClose }: Props) {
  ensureTippyCss()

  const {
    state,
    status,
    error,
    acknowledging,
    refresh: fetchStatus,
    acknowledge: handleAcknowledge,
  } = useSprintStatus({ projectId, owner, isOrg, number })
  const [showSettings, setShowSettings] = useState(false)
  const [confirmingEnd, setConfirmingEnd] = useState(false)

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

  const handleStopTracking = async () => {
    if (!status?.settings) return
    await sendMessage('saveSprintSettings', {
      projectId,
      settings: { ...status.settings, acknowledgedSprintId: undefined },
    })
    await fetchStatus()
  }

  const currentSprint = status?.activeSprint ?? status?.acknowledgedSprint ?? null

  const sprintHeader = showSettings ? (
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
      subtitle={`${status.activeSprint.title} · ${fmtRange(status.activeSprint.startDate, status.activeSprint.endDate)}`}
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
        <Tippy content="Sprint settings" placement="bottom-end" delay={[400, 0]} zIndex={Z_TOOLTIP}>
          <Button
            variant="invisible"
            size="small"
            onClick={() => setShowSettings((v) => !v)}
            aria-label="Sprint settings"
            sx={{
              p: '4px',
              color: 'fg.muted',
              ...primerCss.buttonMotion(),
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
              ...primerCss.buttonMotion(),
            }}
          >
            <XIcon size={16} />
          </Button>
        </Tippy>
      </Box>
    </Box>
  )

  return (
    <ModalShell
      ariaLabel="Sprint"
      onClose={onClose}
      header={sprintHeader}
      panelSx={{ minHeight: 0 }}
    >
      <Box sx={{ minHeight: 160 }}>
        {showSettings ? (
          <SettingsView
            projectId={projectId}
            owner={owner}
            isOrg={isOrg}
            number={number}
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
                      ...primerCss.buttonMotion(),
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
                          ...primerCss.buttonMotion(),
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
                  {fmtRange(currentSprint.startDate, currentSprint.endDate)}
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
                        ...primerCss.buttonMotion(),
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
    </ModalShell>
  )
}
