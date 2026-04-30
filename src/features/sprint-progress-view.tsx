import React, { useEffect, useState } from 'react'
import { Avatar, Box, Button, Flash, Label, Spinner, Text } from '@primer/react'
import Tippy from '@/ui/tooltip'
import { Z_TOOLTIP } from '@/lib/z-index'
import { sendMessage, type SprintInfo, type SprintProgressData } from '@/lib/messages'
import type { SprintSettings } from '@/lib/storage'
import { iterationEndDate } from '@/lib/sprint-utils'

// ── Helpers ──────────────────────────────────────────────────

function fmt(iso: string): string {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

function daysLeft(endDate: string): number {
  const today = new Date().toISOString().slice(0, 10)
  return Math.max(
    0,
    Math.ceil(
      (new Date(endDate + 'T00:00:00Z').getTime() - new Date(today + 'T00:00:00Z').getTime()) /
        86_400_000,
    ),
  )
}

function pct(done: number, total: number): number {
  if (total === 0) return 0
  return Math.min(100, Math.round((done / total) * 100))
}

// ── Sub-components ───────────────────────────────────────────

interface MetricBarProps {
  label: string
  done: number
  total: number
  color?: string
}

function MetricBar({ label, done, total, color = 'accent.emphasis' }: MetricBarProps) {
  const percent = pct(done, total)
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text sx={{ fontSize: 1, fontWeight: 'semibold', color: 'fg.default' }}>{label}</Text>
        <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
          {done} of {total} ({percent}%)
        </Text>
      </Box>
      <Box sx={{ height: '6px', borderRadius: '3px', bg: 'neutral.muted', overflow: 'hidden' }}>
        <Box
          sx={{
            height: '100%',
            borderRadius: '3px',
            bg: color,
            width: `${percent}%`,
            transition: 'width 300ms cubic-bezier(0.4, 0, 0.2, 1)',
            '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
          }}
        />
      </Box>
    </Box>
  )
}

// ── Main component ───────────────────────────────────────────

interface SprintProgressViewProps {
  activeSprint: SprintInfo
  settings: SprintSettings
  projectId: string
  owner: string
  number: number
  isOrg: boolean
  onEndSprint: () => void
  onOpenSettings: () => void
}

type LoadState = 'loading' | 'loaded' | 'error'

export function SprintProgressView({
  activeSprint,
  settings,
  projectId,
  owner,
  number,
  isOrg,
  onEndSprint,
  onOpenSettings,
}: SprintProgressViewProps) {
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [progress, setProgress] = useState<SprintProgressData | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const endDate = iterationEndDate(activeSprint)
  const remaining = daysLeft(endDate)

  useEffect(() => {
    let cancelled = false
    setLoadState('loading')
    setErrorMsg(null)
    sendMessage('getSprintProgress', {
      projectId,
      owner,
      number,
      isOrg,
      iterationId: activeSprint.id,
      sprintStartDate: activeSprint.startDate,
      settings,
    })
      .then((data) => {
        if (cancelled) return
        setProgress(data)
        setLoadState('loaded')
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setErrorMsg(String(e))
        setLoadState('error')
      })
    return () => {
      cancelled = true
    }
  }, [projectId, owner, number, isOrg, activeSprint.id, activeSprint.startDate, settings])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Sprint header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Text sx={{ fontSize: 1, fontWeight: 'semibold', color: 'fg.default' }}>
            {activeSprint.title}
          </Text>
          <Text sx={{ fontSize: 0, color: 'fg.muted', display: 'block', mt: '2px' }}>
            {fmt(activeSprint.startDate)} – {fmt(endDate)}
          </Text>
        </Box>
        <Label variant={remaining <= 1 ? 'danger' : remaining <= 3 ? 'attention' : 'secondary'}>
          {remaining} day{remaining !== 1 ? 's' : ''} left
        </Label>
      </Box>

      {/* Progress metrics */}
      {loadState === 'loading' && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
          <Spinner size="small" />
        </Box>
      )}

      {loadState === 'error' && (
        <Flash variant="warning" sx={{ fontSize: 0 }}>
          {errorMsg ?? 'Could not load sprint progress.'}
        </Flash>
      )}

      {loadState === 'loaded' && progress && (
        <>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Text
              sx={{
                fontSize: 0,
                fontWeight: 'semibold',
                color: 'fg.muted',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              Sprint progress
            </Text>
            <MetricBar label="Issues" done={progress.doneIssues} total={progress.totalIssues} />
            {progress.hasPointsField && (
              <MetricBar
                label={progress.pointsFieldName || 'Points'}
                done={progress.donePoints}
                total={progress.totalPoints}
                color="success.emphasis"
              />
            )}
          </Box>

          {/* Scope change */}
          {(progress.scopeAddedIssues > 0 || progress.scopeAddedPoints > 0) && (
            <Box sx={{ borderTop: '1px solid', borderColor: 'border.default', pt: 2 }}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  mb: 2,
                }}
              >
                <Text
                  sx={{
                    fontSize: 0,
                    fontWeight: 'semibold',
                    color: 'fg.muted',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  Scope change
                </Text>
                <Text sx={{ fontSize: 0, color: 'attention.fg', fontWeight: 'semibold' }}>
                  +{progress.scopeAddedIssues} Issue{progress.scopeAddedIssues !== 1 ? 's' : ''}
                  {progress.hasPointsField && progress.scopeAddedPoints > 0
                    ? ` / +${progress.scopeAddedPoints} Pts`
                    : ''}
                </Text>
              </Box>

              {/* Recently added items list */}
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {progress.recentlyAdded.slice(0, 5).map((item) => (
                  <Box
                    key={item.id}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 2,
                      py: '4px',
                    }}
                  >
                    {/* Assignee avatars */}
                    <Box sx={{ display: 'flex', flexShrink: 0 }}>
                      {item.assignees.length > 0 ? (
                        item.assignees.slice(0, 2).map((a) => (
                          <Tippy
                            key={a.login}
                            content={a.login}
                            placement="top"
                            delay={[400, 0]}
                            zIndex={Z_TOOLTIP}
                          >
                            <Avatar
                              src={a.avatarUrl}
                              size={20}
                              sx={{
                                border: '2px solid',
                                borderColor: 'canvas.overlay',
                                ml: '-4px',
                                ':first-of-type': { ml: 0 },
                              }}
                            />
                          </Tippy>
                        ))
                      ) : (
                        <Box
                          sx={{
                            width: 20,
                            height: 20,
                            borderRadius: '50%',
                            bg: 'neutral.muted',
                            border: '1px solid',
                            borderColor: 'border.default',
                          }}
                        />
                      )}
                    </Box>

                    {/* Title */}
                    <Text
                      sx={{
                        fontSize: 0,
                        color: 'fg.default',
                        flex: 1,
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.title}
                    </Text>

                    {/* Points badge */}
                    {progress.hasPointsField && item.points > 0 && (
                      <Label variant="secondary" sx={{ flexShrink: 0, fontSize: 0 }}>
                        +{item.points}
                      </Label>
                    )}
                  </Box>
                ))}

                {progress.recentlyAdded.length > 5 && (
                  <Text sx={{ fontSize: 0, color: 'fg.subtle' }}>
                    +{progress.recentlyAdded.length - 5} more added
                  </Text>
                )}
              </Box>
            </Box>
          )}
        </>
      )}

      {/* Footer actions */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          pt: 2,
          borderTop: '1px solid',
          borderColor: 'border.default',
        }}
      >
        <Tippy content="Sprint settings" placement="top" delay={[400, 0]} zIndex={Z_TOOLTIP}>
          <Button
            variant="invisible"
            size="small"
            onClick={onOpenSettings}
            sx={{
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
            Settings
          </Button>
        </Tippy>
        <Tippy content="End the current sprint" placement="top" delay={[400, 0]} zIndex={Z_TOOLTIP}>
          <Button
            variant="danger"
            size="small"
            onClick={onEndSprint}
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
            End Sprint
          </Button>
        </Tippy>
      </Box>
    </Box>
  )
}
