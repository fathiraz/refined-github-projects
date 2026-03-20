import React, { useEffect, useState } from 'react'
import { Box, Button, Spinner, Text } from '@primer/react'
import { SecondaryAction, StatusBanner } from '../ui/primitives'
import { sendMessage } from '../../lib/messages'
import type { SprintInfo } from '../../lib/messages'
import type { SprintSettings } from '../../lib/storage'
import { iterationEndDate, nextAfter } from '../../lib/sprintUtils'
import type { Iteration } from '../../lib/sprintUtils'

interface Props {
  projectId: string
  owner: string
  isOrg: boolean
  number: number
  activeSprint: SprintInfo
  settings: SprintSettings
  onClose: () => void
  onComplete: () => void
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

export function EndSprintConfirmModal({
  projectId,
  owner,
  isOrg,
  number,
  activeSprint,
  settings,
  onClose,
  onComplete,
}: Props) {
  const [futureIterations, setFutureIterations] = useState<SprintInfo[]>([])
  const [selectedIterationId, setSelectedIterationId] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [ending, setEnding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    sendMessage('getProjectFields', { owner, number, isOrg })
      .then((result) => {
        const iterField = result.fields.find(
          (f: any) => f.id === settings.sprintFieldId,
        ) as any
        const iters: Iteration[] = iterField?.configuration?.iterations ?? []
        const future: SprintInfo[] = iters
          .filter((i) => i.startDate >= activeSprint.endDate)
          .sort((a, b) => a.startDate.localeCompare(b.startDate))
          .map((i) => ({ id: i.id, title: i.title, startDate: i.startDate, duration: i.duration, endDate: iterationEndDate(i) }))

        setFutureIterations(future)
        const def = nextAfter(iters, activeSprint.endDate)
        setSelectedIterationId(def?.id ?? future[0]?.id ?? null)
        setLoaded(true)
      })
      .catch((e) => {
        setError(String(e))
        setLoaded(true)
      })
  }, [owner, number, isOrg, settings.sprintFieldId, activeSprint.endDate])

  const handleEnd = async () => {
    if (!selectedIterationId) return
    setEnding(true)
    setError(null)
    try {
      await sendMessage('endSprint', {
        projectId,
        owner,
        number,
        isOrg,
        sprintFieldId: settings.sprintFieldId,
        activeIterationId: activeSprint.id,
        nextIterationId: selectedIterationId,
        doneFieldId: settings.doneFieldId,
        doneFieldType: settings.doneFieldType,
        doneOptionId: settings.doneOptionId,
        doneOptionValue: settings.doneOptionName,
      })
      onComplete()
    } catch (e) {
      setError(String(e))
      setEnding(false)
    }
  }

  const hasNoFuture = loaded && futureIterations.length === 0

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Title + sprint date range */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <Text sx={{ fontSize: 1, fontWeight: 'semibold', color: 'fg.default' }}>
          End {activeSprint.title}?
        </Text>
        <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
          {formatDate(activeSprint.startDate)} – {formatDate(activeSprint.endDate)}
        </Text>
      </Box>

      {!loaded && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
          <Spinner size="small" />
        </Box>
      )}

      {error && <StatusBanner variant="error">{error}</StatusBanner>}

      {hasNoFuture && (
        <StatusBanner variant="warning">
          No upcoming sprint — create one in GitHub's iteration settings first.
        </StatusBanner>
      )}

      {loaded && futureIterations.length > 0 && (
        <>
          {/* Iteration selector */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Text
              as="label"
              sx={{ fontSize: 0, fontWeight: 'semibold', color: 'fg.muted' }}
            >
              Open items will be moved to
            </Text>
            <select
              value={selectedIterationId ?? ''}
              onChange={(e) => setSelectedIterationId(e.target.value)}
              disabled={ending}
              style={{
                fontSize: 12,
                padding: '4px 6px',
                borderRadius: 6,
                border: '1px solid var(--color-border-default)',
                background: 'var(--color-canvas-default)',
                color: 'var(--color-fg-default)',
                width: '100%',
              }}
            >
              {futureIterations.map((iter) => (
                <option key={iter.id} value={iter.id}>
                  {iter.title} ({formatDate(iter.startDate)} – {formatDate(iter.endDate)})
                </option>
              ))}
            </select>
          </Box>

          {/* Done items note */}
          <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
            Done items remain in <strong>{activeSprint.title}</strong>.
          </Text>
        </>
      )}

      <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
        <SecondaryAction size="small" onClick={onClose}>
          Cancel
        </SecondaryAction>
        <Button
          variant="danger"
          size="small"
          disabled={!loaded || hasNoFuture || !selectedIterationId || ending}
          onClick={handleEnd}
        >
          {ending ? 'Ending…' : 'End Sprint'}
        </Button>
      </Box>
    </Box>
  )
}
