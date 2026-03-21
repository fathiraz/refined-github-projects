import React, { useEffect, useState } from 'react'
import { Box, Spinner, Text } from '@primer/react'
import { PrimaryAction, SecondaryAction } from '../ui/primitives'
import { sendMessage } from '../../lib/messages'
import type { ExcludeCondition, SprintSettings } from '../../lib/storage'
import type { ProjectData } from '../../entrypoints/content/observer'

interface Props {
  projectId: string
  owner: string
  isOrg: boolean
  number: number
  getFields: () => Promise<ProjectData>
  currentSettings: SprintSettings | null
  onSaved: () => void
  onCancel: () => void
}

type FieldNode = {
  id: string
  name: string
  dataType: string
  options?: { id: string; name: string; color: string }[]
  configuration?: { iterations: { id: string; title: string; startDate: string; duration: number }[] }
}

export function SprintSettingsDrawer({
  projectId,
  owner,
  isOrg,
  number,
  getFields,
  currentSettings,
  onSaved,
  onCancel,
}: Props) {
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

  // excludable fields = SINGLE_SELECT and TEXT, minus the chosen sprint iteration field
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

  const addExcludeCondition = () => {
    setExcludeConditions((prev) => [
      ...prev,
      { fieldId: '', fieldName: '', fieldType: 'SINGLE_SELECT', optionId: '', optionName: '' },
    ])
  }

  const updateExcludeCondition = (index: number, patch: Partial<ExcludeCondition>) => {
    setExcludeConditions((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)))
  }

  const removeExcludeCondition = (index: number) => {
    setExcludeConditions((prev) => prev.filter((_, i) => i !== index))
  }

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
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
        <Spinner size="small" />
      </Box>
    )
  }

  if (iterationFields.length === 0) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Text sx={{ fontSize: 1, color: 'fg.muted' }}>
          This project has no iteration fields.
        </Text>
        <SecondaryAction size="small" onClick={onCancel}>
          Cancel
        </SecondaryAction>
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {error && (
        <Text sx={{ fontSize: 0, color: 'danger.fg' }}>{error}</Text>
      )}

      {/* Sprint field selector */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Text as="label" sx={{ fontSize: 1, fontWeight: 'semibold', color: 'fg.muted' }}>
          Sprint field (Iteration)
        </Text>
        <select
          value={sprintFieldId}
          onChange={(e) => setSprintFieldId(e.target.value)}
          style={{ fontSize: 12, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--color-border-default)', background: 'var(--color-canvas-default)', color: 'var(--color-fg-default)', width: '100%' }}
        >
          <option value="">Select a field…</option>
          {iterationFields.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        {selectedSprintField?.configuration && (
          <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
            {selectedSprintField.configuration.iterations.length} upcoming iteration
            {selectedSprintField.configuration.iterations.length !== 1 ? 's' : ''}
          </Text>
        )}
      </Box>

      {/* Done condition */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Text as="label" sx={{ fontSize: 1, fontWeight: 'semibold', color: 'fg.muted' }}>
          Done condition field
        </Text>
        <select
          value={doneFieldId}
          onChange={(e) => { setDoneFieldId(e.target.value); setDoneOptionId('') }}
          style={{ fontSize: 12, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--color-border-default)', background: 'var(--color-canvas-default)', color: 'var(--color-fg-default)', width: '100%' }}
        >
          <option value="">Select a field…</option>
          {doneFields.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name} ({f.dataType === 'TEXT' ? 'Text' : 'Single select'})
            </option>
          ))}
        </select>

        {selectedDoneField?.dataType === 'SINGLE_SELECT' && selectedDoneField.options && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, pl: 2 }}>
            {selectedDoneField.options.map((opt) => (
              <label key={opt.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="doneOption"
                  value={opt.id}
                  checked={doneOptionId === opt.id}
                  onChange={() => setDoneOptionId(opt.id)}
                />
                {opt.name}
              </label>
            ))}
          </Box>
        )}

        {selectedDoneField?.dataType === 'TEXT' && (
          <input
            type="text"
            placeholder="Done value (e.g. Done)"
            value={doneTextValue}
            onChange={(e) => setDoneTextValue(e.target.value)}
            style={{ fontSize: 12, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--color-border-default)', background: 'var(--color-canvas-default)', color: 'var(--color-fg-default)', width: '100%' }}
          />
        )}
      </Box>

      {/* Exclude from migration */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Text as="label" sx={{ fontSize: 1, fontWeight: 'semibold', color: 'fg.muted' }}>
          Exclude from migration (optional)
        </Text>
        {excludeConditions.map((cond, idx) => {
          const selectedField = excludableFields.find((f) => f.id === cond.fieldId)
          return (
            <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
              <select
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
                style={{ fontSize: 13, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--color-border-default)', background: 'var(--color-canvas-default)', color: 'var(--color-fg-default)' }}
              >
                <option value="">Select field…</option>
                {excludableFields.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} ({f.dataType === 'TEXT' ? 'Text' : 'Single select'})
                  </option>
                ))}
              </select>

              {selectedField?.dataType === 'SINGLE_SELECT' && selectedField.options && (
                <select
                  value={cond.optionId}
                  onChange={(e) => {
                    const opt = selectedField.options!.find((o) => o.id === e.target.value)
                    updateExcludeCondition(idx, { optionId: e.target.value, optionName: opt?.name ?? '' })
                  }}
                  style={{ fontSize: 13, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--color-border-default)', background: 'var(--color-canvas-default)', color: 'var(--color-fg-default)' }}
                >
                  <option value="">Select option…</option>
                  {selectedField.options.map((opt) => (
                    <option key={opt.id} value={opt.id}>{opt.name}</option>
                  ))}
                </select>
              )}

              {selectedField?.dataType === 'TEXT' && (
                <input
                  type="text"
                  placeholder="Exact text value"
                  value={cond.optionName}
                  onChange={(e) => updateExcludeCondition(idx, { optionName: e.target.value, optionId: '' })}
                  style={{ fontSize: 13, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--color-border-default)', background: 'var(--color-canvas-default)', color: 'var(--color-fg-default)', width: 120 }}
                />
              )}

              <button
                onClick={() => removeExcludeCondition(idx)}
                style={{ fontSize: 13, padding: '2px 6px', borderRadius: 4, border: '1px solid var(--color-border-default)', background: 'transparent', color: 'var(--color-fg-muted)', cursor: 'pointer', lineHeight: 1 }}
                title="Remove"
              >
                ×
              </button>
            </Box>
          )
        })}
        <button
          onClick={addExcludeCondition}
          style={{ alignSelf: 'flex-start', fontSize: 13, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--color-border-default)', background: 'transparent', color: 'var(--color-fg-muted)', cursor: 'pointer' }}
        >
          + Add exclusion
        </button>
      </Box>

      <Box sx={{ display: 'flex', gap: 2, pt: 2, borderTop: '1px solid', borderColor: 'border.muted' }}>
        <PrimaryAction
          size="small"
          loading={saving}
          onClick={handleSave}
          disabled={!canSave}
        >
          Save
        </PrimaryAction>
        <SecondaryAction size="small" onClick={onCancel}>
          Cancel
        </SecondaryAction>
      </Box>
    </Box>
  )
}
