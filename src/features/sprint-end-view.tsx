// end sprint flow: pick destination iteration, move open items.

import React, { useEffect, useState } from 'react'
import Tippy from '@/ui/tooltip'
import { Box, Button, Flash, FormControl, Select, Spinner, Text } from '@primer/react'
import { Z_TOOLTIP } from '@/lib/z-index'
import { IterationsIcon } from '@/ui/icons'
import { sendMessage } from '@/lib/messages'
import type { SprintInfo } from '@/lib/messages'
import type { SprintSettings } from '@/lib/storage'
import {
  fmt,
  iterationEndDate,
  nextAfter,
  type FieldNode,
  type Iteration,
} from '@/lib/sprint-utils'

const labelIconBoxSx = {
  color: 'fg.muted',
  display: 'flex',
  alignItems: 'center',
  flexShrink: 0,
} as const

interface EndSprintViewProps {
  projectId: string
  owner: string
  isOrg: boolean
  number: number
  activeSprint: SprintInfo
  settings: SprintSettings
  onComplete: () => void
}

export function EndSprintView({
  projectId,
  owner,
  isOrg,
  number,
  activeSprint,
  settings,
  onComplete,
}: EndSprintViewProps) {
  const [futureIterations, setFutureIterations] = useState<SprintInfo[]>([])
  const [selectedIterationId, setSelectedIterationId] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [ending, setEnding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    sendMessage('getProjectFields', { owner, number, isOrg })
      .then((result) => {
        const iterField = result.fields.find((field) => field.id === settings.sprintFieldId) as
          | FieldNode
          | undefined
        const iters: Iteration[] = iterField?.configuration?.iterations ?? []
        const future: SprintInfo[] = iters
          .filter((i) => i.startDate >= activeSprint.endDate)
          .sort((a, b) => a.startDate.localeCompare(b.startDate))
          .map((i) => ({
            id: i.id,
            title: i.title,
            startDate: i.startDate,
            duration: i.duration,
            endDate: iterationEndDate(i),
          }))
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
        notStartedOptionId: settings.notStartedOptionId,
        excludeConditions: settings.excludeConditions ?? [],
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
      {!loaded && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
          <Spinner size="small" />
        </Box>
      )}

      {error && (
        <Flash variant="danger" sx={{ fontSize: 0 }}>
          {error}
        </Flash>
      )}

      {hasNoFuture && (
        <Flash variant="warning" sx={{ fontSize: 0 }}>
          No upcoming sprint — create one in GitHub's iteration settings first.
        </Flash>
      )}

      {loaded && futureIterations.length > 0 && (
        <>
          <FormControl>
            <FormControl.Label
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                fontSize: 1,
                fontWeight: 'semibold',
                color: 'fg.muted',
              }}
            >
              <Box sx={labelIconBoxSx}>
                <IterationsIcon size={16} />
              </Box>
              Open items will be moved to
            </FormControl.Label>
            <Select
              value={selectedIterationId ?? ''}
              onChange={(e) => setSelectedIterationId(e.target.value)}
              disabled={ending}
              block
            >
              {futureIterations.map((iter) => (
                <Select.Option key={iter.id} value={iter.id}>
                  {iter.title} ({fmt(iter.startDate)} – {fmt(iter.endDate)})
                </Select.Option>
              ))}
            </Select>
          </FormControl>
          <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
            Done items remain in <strong>{activeSprint.title}</strong>.
          </Text>
        </>
      )}

      {/* footer */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'flex-end',
          pt: 2,
          borderTop: '1px solid',
          borderColor: 'border.default',
        }}
      >
        <Tippy
          content="Move open items to the next sprint"
          placement="top"
          delay={[400, 0]}
          zIndex={Z_TOOLTIP}
        >
          <Button
            variant="danger"
            disabled={!loaded || hasNoFuture || !selectedIterationId || ending}
            onClick={handleEnd}
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
            {ending ? 'Ending…' : 'End Sprint →'}
          </Button>
        </Tippy>
      </Box>
    </Box>
  )
}
