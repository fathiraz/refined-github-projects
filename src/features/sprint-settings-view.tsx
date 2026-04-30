// sprint settings form: pick iteration field, done condition, exclusion rules.

import React, { useEffect, useState } from 'react'
import Tippy from '@/ui/tooltip'
import {
  Box,
  Button,
  Flash,
  FormControl,
  Radio,
  RadioGroup,
  Select,
  Spinner,
  Text,
  TextInput,
} from '@primer/react'
import { Z_TOOLTIP } from '@/lib/z-index'
import {
  FilterIcon,
  IssueClosedIcon,
  IterationsIcon,
  OptionsSelectIcon,
  PlusIcon,
  SlidersIcon,
  TextLineIcon,
  XIcon,
} from '@/ui/icons'
import { sendMessage } from '@/lib/messages'
import type { ExcludeCondition, SprintSettings } from '@/lib/storage'
import { injectSprintFilter, SPRINT_FILTER, type FieldNode } from '@/lib/sprint-utils'
import type { ProjectData } from '@/lib/github-project'

const labelIconBoxSx = {
  color: 'fg.muted',
  display: 'flex',
  alignItems: 'center',
  flexShrink: 0,
} as const

interface SettingsViewProps {
  projectId: string
  owner: string
  isOrg: boolean
  number: number
  getFields: () => Promise<ProjectData>
  currentSettings: SprintSettings | null
  onSaved: () => void
}

export function SettingsView({
  projectId,
  owner,
  isOrg,
  number,
  getFields: _getFields,
  currentSettings,
  onSaved,
}: SettingsViewProps) {
  const [fields, setFields] = useState<FieldNode[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [sprintFieldId, setSprintFieldId] = useState(currentSettings?.sprintFieldId ?? '')
  const [doneFieldId, setDoneFieldId] = useState(currentSettings?.doneFieldId ?? '')
  const [doneOptionId, setDoneOptionId] = useState(currentSettings?.doneOptionId ?? '')
  const [doneTextValue, setDoneTextValue] = useState(currentSettings?.doneOptionName ?? '')
  const [excludeConditions, setExcludeConditions] = useState<ExcludeCondition[]>(
    currentSettings?.excludeConditions ?? [],
  )
  const [pointsFieldId, setPointsFieldId] = useState(currentSettings?.pointsFieldId ?? '')
  const [notStartedOptionId, setNotStartedOptionId] = useState(
    currentSettings?.notStartedOptionId ?? '',
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
  const numberFields = fields.filter((f) => f.dataType === 'NUMBER')

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
      const selectedPointsField = numberFields.find((f) => f.id === pointsFieldId)
      const settings: SprintSettings = {
        sprintFieldId,
        sprintFieldName: sprintField.name,
        doneFieldId,
        doneFieldName: doneField.name,
        doneFieldType: isDoneText ? 'TEXT' : 'SINGLE_SELECT',
        doneOptionId: isDoneText ? '' : doneOptionId,
        doneOptionName: isDoneText ? doneTextValue.trim() : (selectedOption?.name ?? ''),
        acknowledgedSprintId: currentSettings?.acknowledgedSprintId,
        excludeConditions: excludeConditions.filter(
          (c) => c.fieldId && (c.optionId || c.optionName.trim()),
        ),
        pointsFieldId: selectedPointsField?.id,
        pointsFieldName: selectedPointsField?.name,
        notStartedOptionId: notStartedOptionId || undefined,
        notStartedOptionName: notStartedOptionId
          ? (selectedDoneField?.options?.find((o) => o.id === notStartedOptionId)?.name ??
            undefined)
          : undefined,
      }
      await sendMessage('saveSprintSettings', { projectId, settings })
      injectSprintFilter()
      onSaved()
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
        <Spinner size="small" />
      </Box>
    )
  }

  if (iterationFields.length === 0) {
    return (
      <Text sx={{ fontSize: 1, color: 'fg.muted' }}>This project has no iteration fields.</Text>
    )
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {error && (
        <Flash variant="danger" sx={{ fontSize: 0 }}>
          {error}
        </Flash>
      )}

      {/* sprint field */}
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
          Sprint field (Iteration)
        </FormControl.Label>
        <Select value={sprintFieldId} onChange={(e) => setSprintFieldId(e.target.value)} block>
          <Select.Option value="">Select a field…</Select.Option>
          {iterationFields.map((f) => (
            <Select.Option key={f.id} value={f.id}>
              {f.name}
            </Select.Option>
          ))}
        </Select>
        {selectedSprintField?.configuration && (
          <FormControl.Caption>
            {selectedSprintField.configuration.iterations.length} upcoming iteration
            {selectedSprintField.configuration.iterations.length !== 1 ? 's' : ''}
          </FormControl.Caption>
        )}
      </FormControl>

      {/* done condition field */}
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
            <IssueClosedIcon size={16} />
          </Box>
          Done condition field
        </FormControl.Label>
        <Select
          value={doneFieldId}
          onChange={(e) => {
            setDoneFieldId(e.target.value)
            setDoneOptionId('')
            setNotStartedOptionId('')
          }}
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

      {/* radio options for SINGLE_SELECT done field */}
      {selectedDoneField?.dataType === 'SINGLE_SELECT' && selectedDoneField.options && (
        <RadioGroup name="doneOption" onChange={(v) => setDoneOptionId(v ?? '')} sx={{ pl: 2 }}>
          <RadioGroup.Label
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
              <OptionsSelectIcon size={16} />
            </Box>
            Done option
          </RadioGroup.Label>
          {selectedDoneField.options.map((opt) => (
            <Tippy
              key={opt.id}
              content={`Items with "${opt.name}" on this field count as done for sprint workflows.`}
              placement="top"
              delay={[400, 0]}
              zIndex={Z_TOOLTIP}
            >
              <Box>
                <FormControl>
                  <Radio
                    value={opt.id}
                    checked={doneOptionId === opt.id}
                    onChange={() => setDoneOptionId(opt.id)}
                  />
                  <FormControl.Label sx={{ fontSize: 1 }}>{opt.name}</FormControl.Label>
                </FormControl>
              </Box>
            </Tippy>
          ))}
        </RadioGroup>
      )}

      {/* not started option — items in this state are excluded from "done" count */}
      {selectedDoneField?.dataType === 'SINGLE_SELECT' && selectedDoneField.options && (
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
              <OptionsSelectIcon size={16} />
            </Box>
            Not started option{' '}
            <Text sx={{ fontWeight: 'normal', color: 'fg.subtle' }}>(optional)</Text>
          </FormControl.Label>
          <Select
            value={notStartedOptionId}
            onChange={(e) => {
              const selected = e.target.value
              if (selected && selected === doneOptionId) {
                setError('Not started option cannot be the same as the done option')
                return
              }
              setError(null)
              setNotStartedOptionId(selected)
            }}
            block
          >
            <Select.Option value="">None (only count exact done option)</Select.Option>
            {selectedDoneField.options
              .filter((opt) => opt.id !== doneOptionId)
              .map((opt) => (
                <Select.Option key={opt.id} value={opt.id}>
                  {opt.name}
                </Select.Option>
              ))}
          </Select>
          <FormControl.Caption>
            When set, all statuses except this one count toward sprint progress — not just the done
            option.
          </FormControl.Caption>
        </FormControl>
      )}

      {/* text input for TEXT done field */}
      {selectedDoneField?.dataType === 'TEXT' && (
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
              <TextLineIcon size={16} />
            </Box>
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

      {/* exclude from migration */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box sx={labelIconBoxSx}>
            <FilterIcon size={16} />
          </Box>
          <Text sx={{ fontSize: 1, fontWeight: 'semibold', color: 'fg.muted' }}>
            Exclude from migration{' '}
            <Text sx={{ fontWeight: 'normal', color: 'fg.subtle' }}>(optional)</Text>
          </Text>
        </Box>
        {excludeConditions.map((cond, idx) => {
          const selectedField = excludableFields.find((f) => f.id === cond.fieldId)
          return (
            <Box
              key={idx}
              sx={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 2,
                flexWrap: 'wrap',
                width: '100%',
              }}
            >
              <Box sx={{ flex: '1 1 160px', minWidth: 0 }}>
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
                  block
                >
                  <Select.Option value="">Select field…</Select.Option>
                  {excludableFields.map((f) => (
                    <Select.Option key={f.id} value={f.id}>
                      {f.name} ({f.dataType === 'TEXT' ? 'Text' : 'Single select'})
                    </Select.Option>
                  ))}
                </Select>
              </Box>

              {selectedField?.dataType === 'SINGLE_SELECT' && selectedField.options && (
                <Box sx={{ flex: '1 1 160px', minWidth: 0 }}>
                  <Select
                    value={cond.optionId}
                    onChange={(e) => {
                      const opt = selectedField.options!.find((o) => o.id === e.target.value)
                      updateExcludeCondition(idx, {
                        optionId: e.target.value,
                        optionName: opt?.name ?? '',
                      })
                    }}
                    block
                  >
                    <Select.Option value="">Select option…</Select.Option>
                    {selectedField.options.map((opt) => (
                      <Select.Option key={opt.id} value={opt.id}>
                        {opt.name}
                      </Select.Option>
                    ))}
                  </Select>
                </Box>
              )}

              {selectedField?.dataType === 'TEXT' && (
                <Box sx={{ flex: '1 1 160px', minWidth: 0 }}>
                  <TextInput
                    block
                    placeholder="Exact text value"
                    value={cond.optionName}
                    onChange={(e) =>
                      updateExcludeCondition(idx, { optionName: e.target.value, optionId: '' })
                    }
                  />
                </Box>
              )}

              <Tippy
                content="Remove exclusion rule"
                placement="top"
                delay={[400, 0]}
                zIndex={Z_TOOLTIP}
              >
                <Button
                  variant="invisible"
                  size="small"
                  aria-label="Remove exclusion"
                  onClick={() => removeExcludeCondition(idx)}
                  sx={{
                    p: '5px',
                    color: 'fg.muted',
                    flexShrink: 0,
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
                  <XIcon size={12} />
                </Button>
              </Tippy>
            </Box>
          )
        })}
        <Tippy
          content="Add a field exclusion rule"
          placement="top"
          delay={[400, 0]}
          zIndex={Z_TOOLTIP}
        >
          <Button
            variant="invisible"
            size="small"
            onClick={addExcludeCondition}
            sx={{
              alignSelf: 'flex-start',
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
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
              <PlusIcon size={12} />
              <Text sx={{ fontSize: 0 }}>Add exclusion</Text>
            </Box>
          </Button>
        </Tippy>
      </Box>

      {/* story points field (optional) */}
      {numberFields.length > 0 && (
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
              <SlidersIcon size={16} />
            </Box>
            Story points field{' '}
            <Text sx={{ fontWeight: 'normal', color: 'fg.subtle' }}>(optional)</Text>
          </FormControl.Label>
          <Select value={pointsFieldId} onChange={(e) => setPointsFieldId(e.target.value)} block>
            <Select.Option value="">None</Select.Option>
            {numberFields.map((f) => (
              <Select.Option key={f.id} value={f.id}>
                {f.name}
              </Select.Option>
            ))}
          </Select>
          <FormControl.Caption>
            Used to display point totals in the sprint progress view.
          </FormControl.Caption>
        </FormControl>
      )}

      {/* footer */}
      <Box sx={{ pt: 2, borderTop: '1px solid', borderColor: 'border.default' }}>
        <Flash variant="warning" sx={{ fontSize: 0, mb: 3 }}>
          Saving will automatically add{' '}
          <Text as="code" sx={{ fontFamily: 'mono', fontSize: 0 }}>
            {SPRINT_FILTER}
          </Text>{' '}
          to the table filter if not already present.
        </Flash>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Tippy content="Save sprint settings" placement="top" delay={[400, 0]} zIndex={Z_TOOLTIP}>
            <Button
              variant="primary"
              disabled={!canSave || saving}
              onClick={handleSave}
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
              {saving ? <Spinner size="small" /> : 'Save Settings →'}
            </Button>
          </Tippy>
        </Box>
      </Box>
    </Box>
  )
}
