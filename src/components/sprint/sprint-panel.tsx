import React, { useCallback, useEffect, useState } from 'react'
import Tippy from '@tippyjs/react'
import { ensureTippyCss } from '../../lib/tippy-utils'
import {
  Box, Button, Flash, FormControl, Radio, RadioGroup,
  Select, Spinner, Text, TextInput,
} from '@primer/react'
import { SlidersIcon, XIcon, PlusIcon, SprintIcon } from '../ui/primitives'
import { sendMessage } from '../../lib/messages'
import type { SprintInfo } from '../../lib/messages'
import type { ExcludeCondition, SprintSettings } from '../../lib/storage'
import { iterationEndDate, nextAfter } from '../../lib/sprint-utils'
import type { Iteration } from '../../lib/sprint-utils'
import type { ProjectData } from '../../entries/content/observer'
import { sprintConfirmEndStore } from '../../lib/sprint-confirm-end-store'

// ── Shared helpers ───────────────────────────────────────────

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

type FieldNode = {
  id: string
  name: string
  dataType: string
  options?: { id: string; name: string; color: string }[]
  configuration?: { iterations: { id: string; title: string; startDate: string; duration: number }[] }
}

function fmt(iso: string): string {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function daysLeft(endDate: string): number {
  const today = new Date().toISOString().slice(0, 10)
  return Math.max(0, Math.ceil(
    (new Date(endDate + 'T00:00:00Z').getTime() - new Date(today + 'T00:00:00Z').getTime()) / 86_400_000
  ))
}

function sprintProgress(startDate: string, endDate: string): number {
  const total = Math.max(1, Math.ceil(
    (new Date(endDate + 'T00:00:00Z').getTime() - new Date(startDate + 'T00:00:00Z').getTime()) / 86_400_000
  ))
  return Math.min(100, Math.round(((total - daysLeft(endDate)) / total) * 100))
}

// ── Settings view (inline, formerly SprintSettingsDrawer) ────

interface SettingsViewProps {
  projectId: string
  owner: string
  isOrg: boolean
  number: number
  getFields: () => Promise<ProjectData>
  currentSettings: SprintSettings | null
  onSaved: () => void
  onCancel: () => void
}

function SettingsView({ projectId, owner, isOrg, number, getFields, currentSettings, onSaved, onCancel }: SettingsViewProps) {
  const [fields, setFields] = useState<FieldNode[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [sprintFieldId, setSprintFieldId] = useState(currentSettings?.sprintFieldId ?? '')
  const [doneFieldId, setDoneFieldId] = useState(currentSettings?.doneFieldId ?? '')
  const [doneOptionId, setDoneOptionId] = useState(currentSettings?.doneOptionId ?? '')
  const [doneTextValue, setDoneTextValue] = useState(currentSettings?.doneOptionName ?? '')
  const [excludeConditions, setExcludeConditions] = useState<ExcludeCondition[]>(
    currentSettings?.excludeConditions ?? []
  )

  useEffect(() => {
    sendMessage('getProjectFields', { owner, number, isOrg })
      .then((result) => setFields(result.fields as FieldNode[]))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [owner, number, isOrg])

  const iterationFields = fields.filter((f) => f.dataType === 'ITERATION')
  const doneFields = fields.filter((f) => f.dataType === 'SINGLE_SELECT' || f.dataType === 'TEXT')
  const selectedSprintField = iterationFields.find((f) => f.id === sprintFieldId)
  const selectedDoneField = doneFields.find((f) => f.id === doneFieldId)
  const excludableFields = doneFields.filter((f) => f.id !== sprintFieldId)

  const hasIncompleteExclude = excludeConditions.some((c) => {
    if (!c.fieldId) return true
    const f = excludableFields.find((ef) => ef.id === c.fieldId)
    if (!f) return true
    return f.dataType === 'SINGLE_SELECT' ? !c.optionId : !c.optionName.trim()
  })

  const canSave =
    sprintFieldId &&
    doneFieldId &&
    (selectedDoneField?.dataType === 'TEXT' ? doneTextValue.trim() : doneOptionId) &&
    !hasIncompleteExclude

  const addExcludeCondition = () =>
    setExcludeConditions((prev) => [
      ...prev,
      { fieldId: '', fieldName: '', fieldType: 'SINGLE_SELECT', optionId: '', optionName: '' },
    ])

  const updateExcludeCondition = (index: number, patch: Partial<ExcludeCondition>) =>
    setExcludeConditions((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)))

  const removeExcludeCondition = (index: number) =>
    setExcludeConditions((prev) => prev.filter((_, i) => i !== index))

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      const sprintField = iterationFields.find((f) => f.id === sprintFieldId)!
      const doneField = doneFields.find((f) => f.id === doneFieldId)!
      const isDoneText = doneField.dataType === 'TEXT'
      const selectedOption = doneField.options?.find((o) => o.id === doneOptionId)
      const settings: SprintSettings = {
        sprintFieldId,
        sprintFieldName: sprintField.name,
        doneFieldId,
        doneFieldName: doneField.name,
        doneFieldType: isDoneText ? 'TEXT' : 'SINGLE_SELECT',
        doneOptionId: isDoneText ? '' : doneOptionId,
        doneOptionName: isDoneText ? doneTextValue.trim() : (selectedOption?.name ?? ''),
        acknowledgedSprintId: currentSettings?.acknowledgedSprintId,
        excludeConditions: excludeConditions.filter((c) => c.fieldId && (c.optionId || c.optionName.trim())),
      }
      await sendMessage('saveSprintSettings', { projectId, settings })
      onSaved()
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><Spinner size="small" /></Box>
  }

  if (iterationFields.length === 0) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Text sx={{ fontSize: 1, color: 'fg.muted' }}>This project has no iteration fields.</Text>
        <Tippy content="Discard changes" placement="top" delay={[400, 0]} zIndex={10002}>
          <Button variant="default" size="small" onClick={onCancel}>Cancel</Button>
        </Tippy>
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {error && <Flash variant="danger" sx={{ fontSize: 0 }}>{error}</Flash>}

      {/* Sprint field */}
      <FormControl>
        <FormControl.Label sx={{ fontSize: 1, fontWeight: 'semibold', color: 'fg.muted' }}>
          Sprint field (Iteration)
        </FormControl.Label>
        <Select value={sprintFieldId} onChange={(e) => setSprintFieldId(e.target.value)} block>
          <Select.Option value="">Select a field…</Select.Option>
          {iterationFields.map((f) => (
            <Select.Option key={f.id} value={f.id}>{f.name}</Select.Option>
          ))}
        </Select>
        {selectedSprintField?.configuration && (
          <FormControl.Caption>
            {selectedSprintField.configuration.iterations.length} upcoming iteration
            {selectedSprintField.configuration.iterations.length !== 1 ? 's' : ''}
          </FormControl.Caption>
        )}
      </FormControl>

      {/* Done condition field */}
      <FormControl>
        <FormControl.Label sx={{ fontSize: 1, fontWeight: 'semibold', color: 'fg.muted' }}>
          Done condition field
        </FormControl.Label>
        <Select
          value={doneFieldId}
          onChange={(e) => { setDoneFieldId(e.target.value); setDoneOptionId('') }}
          block
        >
          <Select.Option value="">Select a field…</Select.Option>
          {doneFields.map((f) => (
            <Select.Option key={f.id} value={f.id}>
              {f.name} ({f.dataType === 'TEXT' ? 'Text' : 'Single select'})
            </Select.Option>
          ))}
        </Select>
      </FormControl>

      {/* Radio options for SINGLE_SELECT done field */}
      {selectedDoneField?.dataType === 'SINGLE_SELECT' && selectedDoneField.options && (
        <RadioGroup name="doneOption" onChange={(v) => setDoneOptionId(v ?? '')} sx={{ pl: 2 }}>
          <RadioGroup.Label sx={{ fontSize: 1, fontWeight: 'semibold', color: 'fg.muted' }}>
            Done option
          </RadioGroup.Label>
          {selectedDoneField.options.map((opt) => (
            <FormControl key={opt.id}>
              <Radio value={opt.id} checked={doneOptionId === opt.id} onChange={() => setDoneOptionId(opt.id)} />
              <FormControl.Label sx={{ fontSize: 1 }}>{opt.name}</FormControl.Label>
            </FormControl>
          ))}
        </RadioGroup>
      )}

      {/* Text input for TEXT done field */}
      {selectedDoneField?.dataType === 'TEXT' && (
        <FormControl>
          <FormControl.Label sx={{ fontSize: 1, fontWeight: 'semibold', color: 'fg.muted' }}>
            Done value
          </FormControl.Label>
          <TextInput
            block
            placeholder="e.g. Done"
            value={doneTextValue}
            onChange={(e) => setDoneTextValue(e.target.value)}
          />
        </FormControl>
      )}

      {/* Exclude from migration */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Text sx={{ fontSize: 1, fontWeight: 'semibold', color: 'fg.muted' }}>
          Exclude from migration <Text sx={{ fontWeight: 'normal', color: 'fg.subtle' }}>(optional)</Text>
        </Text>
        {excludeConditions.map((cond, idx) => {
          const selectedField = excludableFields.find((f) => f.id === cond.fieldId)
          return (
            <Box key={idx} sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap' }}>
              <Select
                value={cond.fieldId}
                onChange={(e) => {
                  const f = excludableFields.find((ef) => ef.id === e.target.value)
                  updateExcludeCondition(idx, {
                    fieldId: e.target.value,
                    fieldName: f?.name ?? '',
                    fieldType: f?.dataType === 'TEXT' ? 'TEXT' : 'SINGLE_SELECT',
                    optionId: '',
                    optionName: '',
                  })
                }}
                sx={{ flex: 1, minWidth: 100 }}
              >
                <Select.Option value="">Select field…</Select.Option>
                {excludableFields.map((f) => (
                  <Select.Option key={f.id} value={f.id}>
                    {f.name} ({f.dataType === 'TEXT' ? 'Text' : 'Single select'})
                  </Select.Option>
                ))}
              </Select>

              {selectedField?.dataType === 'SINGLE_SELECT' && selectedField.options && (
                <Select
                  value={cond.optionId}
                  onChange={(e) => {
                    const opt = selectedField.options!.find((o) => o.id === e.target.value)
                    updateExcludeCondition(idx, { optionId: e.target.value, optionName: opt?.name ?? '' })
                  }}
                  sx={{ flex: 1, minWidth: 100 }}
                >
                  <Select.Option value="">Select option…</Select.Option>
                  {selectedField.options.map((opt) => (
                    <Select.Option key={opt.id} value={opt.id}>{opt.name}</Select.Option>
                  ))}
                </Select>
              )}

              {selectedField?.dataType === 'TEXT' && (
                <TextInput
                  placeholder="Exact text value"
                  value={cond.optionName}
                  onChange={(e) => updateExcludeCondition(idx, { optionName: e.target.value, optionId: '' })}
                  sx={{ width: 130 }}
                />
              )}

              <Tippy content="Remove exclusion rule" placement="top" delay={[400, 0]} zIndex={10002}>
                <Button
                  variant="invisible"
                  size="small"
                  aria-label="Remove exclusion"
                  onClick={() => removeExcludeCondition(idx)}
                  sx={{ p: '5px', color: 'fg.muted', flexShrink: 0 }}
                >
                  <XIcon size={12} />
                </Button>
              </Tippy>
            </Box>
          )
        })}
        <Tippy content="Add a field exclusion rule" placement="top" delay={[400, 0]} zIndex={10002}>
          <Button
            variant="invisible"
            size="small"
            onClick={addExcludeCondition}
            sx={{ alignSelf: 'flex-start', color: 'fg.muted' }}
          >
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
              <PlusIcon size={12} />
              <Text sx={{ fontSize: 0 }}>Add exclusion</Text>
            </Box>
          </Button>
        </Tippy>
      </Box>

      {/* Actions */}
      <Box sx={{ display: 'flex', gap: 2, pt: 2, borderTop: '1px solid', borderColor: 'border.muted' }}>
        <Tippy content="Save sprint settings" placement="top" delay={[400, 0]} zIndex={10002}>
          <Button variant="primary" size="small" disabled={!canSave || saving} onClick={handleSave}>
            {saving ? <Spinner size="small" /> : 'Save'}
          </Button>
        </Tippy>
        <Tippy content="Discard changes" placement="top" delay={[400, 0]} zIndex={10002}>
          <Button variant="default" size="small" onClick={onCancel}>Cancel</Button>
        </Tippy>
      </Box>
    </Box>
  )
}

// ── End sprint view (inline, formerly EndSprintConfirmModal) ─

interface EndSprintViewProps {
  projectId: string
  owner: string
  isOrg: boolean
  number: number
  activeSprint: SprintInfo
  settings: SprintSettings
  onClose: () => void
  onComplete: () => void
}

function EndSprintView({ projectId, owner, isOrg, number, activeSprint, settings, onClose, onComplete }: EndSprintViewProps) {
  const [futureIterations, setFutureIterations] = useState<SprintInfo[]>([])
  const [selectedIterationId, setSelectedIterationId] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [ending, setEnding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    sendMessage('getProjectFields', { owner, number, isOrg })
      .then((result) => {
        const iterField = result.fields.find((f: any) => f.id === settings.sprintFieldId) as any
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
      .catch((e) => { setError(String(e)); setLoaded(true) })
  }, [owner, number, isOrg, settings.sprintFieldId, activeSprint.endDate])

  const handleEnd = async () => {
    if (!selectedIterationId) return
    setEnding(true)
    setError(null)
    try {
      await sendMessage('endSprint', {
        projectId, owner, number, isOrg,
        sprintFieldId: settings.sprintFieldId,
        activeIterationId: activeSprint.id,
        nextIterationId: selectedIterationId,
        doneFieldId: settings.doneFieldId,
        doneFieldType: settings.doneFieldType,
        doneOptionId: settings.doneOptionId,
        doneOptionValue: settings.doneOptionName,
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
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <Text sx={{ fontSize: 1, fontWeight: 'semibold', color: 'fg.default' }}>
          End {activeSprint.title}?
        </Text>
        <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
          {fmt(activeSprint.startDate)} – {fmt(activeSprint.endDate)}
        </Text>
      </Box>

      {!loaded && <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}><Spinner size="small" /></Box>}

      {error && <Flash variant="danger" sx={{ fontSize: 0 }}>{error}</Flash>}

      {hasNoFuture && (
        <Flash variant="warning" sx={{ fontSize: 0 }}>
          No upcoming sprint — create one in GitHub's iteration settings first.
        </Flash>
      )}

      {loaded && futureIterations.length > 0 && (
        <>
          <FormControl>
            <FormControl.Label sx={{ fontSize: 1, fontWeight: 'semibold', color: 'fg.muted' }}>
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

      <Box sx={{ display: 'flex', gap: 2, pt: 2, borderTop: '1px solid', borderColor: 'border.muted' }}>
        <Tippy content="Go back" placement="top" delay={[400, 0]} zIndex={10002}>
          <Button variant="default" size="small" onClick={onClose}>Cancel</Button>
        </Tippy>
        <Tippy content="Move open items to the next sprint" placement="top" delay={[400, 0]} zIndex={10002}>
          <Button
            variant="danger"
            size="small"
            disabled={!loaded || hasNoFuture || !selectedIterationId || ending}
            onClick={handleEnd}
          >
            {ending ? 'Ending…' : 'End Sprint'}
          </Button>
        </Tippy>
      </Box>
    </Box>
  )
}

// ── Main panel ───────────────────────────────────────────────

export function SprintPanel({ projectId, owner, isOrg, number, getFields, visible, onClose }: Props) {
  ensureTippyCss()
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
      if (!result.hasSettings) setState('not-configured')
      else if (result.activeSprint) setState('active')
      else if (result.acknowledgedSprint) setState('acknowledged')
      else setState('no-active')
    } catch (e) {
      setError(String(e))
      setState('error')
    }
  }, [projectId, owner, number, isOrg])

  useEffect(() => { fetchStatus() }, [fetchStatus])

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
      await sendMessage('acknowledgeUpcomingSprint', { projectId, iterationId: status.nearestUpcoming.id })
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
      sx={{ position: 'fixed', inset: 0, bg: 'rgba(27,31,36,0.5)', zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <Box
        sx={{ bg: 'canvas.default', border: '1px solid', borderColor: 'border.default', borderRadius: 2, overflow: 'hidden', width: '100%', maxWidth: 480 }}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        onKeyDown={(e: React.KeyboardEvent) => { e.stopPropagation(); if (e.key === 'Escape') onClose() }}
        onKeyUp={(e: React.KeyboardEvent) => e.stopPropagation()}
      >
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 3, py: 2, borderBottom: '1px solid', borderColor: 'border.default', bg: 'canvas.subtle' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <SprintIcon size={16} color="var(--fgColor-accent, #0969da)" />
            <Text sx={{ fontWeight: 'semibold', fontSize: 1, color: 'fg.default' }}>Sprint</Text>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Tippy content="Sprint settings" placement="bottom-end" delay={[400, 0]} zIndex={10002}>
              <Button variant="invisible" size="small" onClick={() => setShowSettings((v) => !v)} aria-label="Sprint settings" sx={{ p: '5px', color: 'fg.muted', boxShadow: 'none' }}>
                <SlidersIcon size={14} />
              </Button>
            </Tippy>
            <Tippy content="Close sprint panel" placement="bottom-end" delay={[400, 0]} zIndex={10002}>
              <Button variant="invisible" size="small" onClick={onClose} aria-label="Close sprint panel" sx={{ p: '5px', color: 'fg.muted', boxShadow: 'none' }}>
                <XIcon size={14} />
              </Button>
            </Tippy>
          </Box>
        </Box>

        {/* Body */}
        <Box sx={{ px: 4, py: 3, minHeight: 160 }}>
          {showSettings ? (
            <SettingsView
              projectId={projectId}
              owner={owner}
              isOrg={isOrg}
              number={number}
              getFields={getFields}
              currentSettings={status?.settings ?? null}
              onSaved={async () => { setShowSettings(false); await fetchStatus() }}
              onCancel={() => setShowSettings(false)}
            />
          ) : confirmingEnd && status?.activeSprint && status?.settings ? (
            <EndSprintView
              projectId={projectId}
              owner={owner}
              isOrg={isOrg}
              number={number}
              activeSprint={status.activeSprint}
              settings={status.settings}
              onClose={() => setConfirmingEnd(false)}
              onComplete={async () => { setConfirmingEnd(false); await fetchStatus() }}
            />
          ) : (
            <>
              {state === 'loading' && (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><Spinner size="small" /></Box>
              )}

              {state === 'error' && (
                <Flash variant="danger" sx={{ fontSize: 0 }}>{error ?? 'Failed to load sprint status.'}</Flash>
              )}

              {state === 'not-configured' && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Text sx={{ fontSize: 1, color: 'fg.muted' }}>Sprint tracking isn't set up for this project yet.</Text>
                  <Text sx={{ fontSize: 0, color: 'fg.subtle' }}>Each GitHub project has its own sprint configuration.</Text>
                  <Tippy content="Configure sprint tracking for this project" placement="top" delay={[400, 0]} zIndex={10002}>
                    <Button variant="primary" size="small" onClick={() => setShowSettings(true)}>Set Up Sprint</Button>
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
                        Next: {status.nearestUpcoming.title} — starts {fmt(status.nearestUpcoming.startDate)}
                      </Text>
                      <Tippy content="Start tracking the upcoming sprint" placement="top" delay={[400, 0]} zIndex={10002}>
                        <Button variant="primary" size="small" disabled={acknowledging} onClick={handleAcknowledge}>
                          {acknowledging ? <Spinner size="small" /> : 'Track Sprint'}
                        </Button>
                      </Tippy>
                    </>
                  )}
                </Box>
              )}

              {state === 'acknowledged' && currentSprint && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text sx={{ fontSize: 1, fontWeight: 'semibold', color: 'fg.default' }}>{currentSprint.title}</Text>
                    <Text sx={{ fontSize: 0, color: 'fg.muted', bg: 'canvas.subtle', border: '1px solid', borderColor: 'border.muted', borderRadius: '2em', px: 2, py: '2px', lineHeight: 1.5 }}>
                      Upcoming
                    </Text>
                  </Box>
                  <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
                    {fmt(currentSprint.startDate)} – {fmt(currentSprint.endDate)}
                  </Text>
                  <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
                    <Tippy content="Stop tracking this sprint" placement="top" delay={[400, 0]} zIndex={10002}>
                      <Button variant="default" size="small" onClick={handleStopTracking}>Stop tracking</Button>
                    </Tippy>
                  </Box>
                </Box>
              )}

              {state === 'active' && currentSprint && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Text sx={{ fontSize: 1, fontWeight: 'semibold', color: 'fg.default' }}>{currentSprint.title}</Text>
                  <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
                    {fmt(currentSprint.startDate)} – {fmt(currentSprint.endDate)} · {daysLeft(currentSprint.endDate)} day{daysLeft(currentSprint.endDate) !== 1 ? 's' : ''} left
                  </Text>
                  <Box sx={{ height: '6px', borderRadius: '3px', bg: 'neutral.muted', overflow: 'hidden', mt: 1 }}>
                    <Box sx={{ height: '100%', borderRadius: '3px', bg: 'accent.emphasis', width: `${sprintProgress(currentSprint.startDate, currentSprint.endDate)}%` }} />
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
                    <Tippy content="End the current sprint" placement="top" delay={[400, 0]} zIndex={10002}>
                      <Button variant="danger" size="small" onClick={() => setConfirmingEnd(true)}>End Sprint</Button>
                    </Tippy>
                  </Box>
                </Box>
              )}
            </>
          )}
        </Box>
      </Box>
    </Box>
  )
}
