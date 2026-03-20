import React, { useEffect, useState } from 'react'
import { Box, Spinner, Text } from '@primer/react'
import { PrimaryAction, SecondaryAction } from '../ui/primitives'
import { sendMessage } from '../../lib/messages'
import type { SprintSettings } from '../../lib/storage'
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

  const canSave =
    sprintFieldId &&
    doneFieldId &&
    (selectedDoneField?.dataType === 'TEXT' ? doneTextValue.trim() : doneOptionId)

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
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }} onKeyDown={(e: React.KeyboardEvent) => { e.stopPropagation(); if (e.key === 'Escape') onCancel() }} onKeyUp={(e: React.KeyboardEvent) => e.stopPropagation()}>
        <Spinner size="small" />
      </Box>
    )
  }

  if (iterationFields.length === 0) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }} onKeyDown={(e: React.KeyboardEvent) => { e.stopPropagation(); if (e.key === 'Escape') onCancel() }} onKeyUp={(e: React.KeyboardEvent) => e.stopPropagation()}>
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
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }} onKeyDown={(e: React.KeyboardEvent) => { e.stopPropagation(); if (e.key === 'Escape') onCancel() }} onKeyUp={(e: React.KeyboardEvent) => e.stopPropagation()}>
      {error && (
        <Text sx={{ fontSize: 0, color: 'danger.fg' }}>{error}</Text>
      )}

      {/* Sprint field selector */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Text as="label" sx={{ fontSize: 0, fontWeight: 'semibold', color: 'fg.muted' }}>
          Sprint field (Iteration)
        </Text>
        <select
          value={sprintFieldId}
          onChange={(e) => setSprintFieldId(e.target.value)}
          style={{ fontSize: 12, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--color-border-default)', background: 'var(--color-canvas-default)', color: 'var(--color-fg-default)' }}
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
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Text as="label" sx={{ fontSize: 0, fontWeight: 'semibold', color: 'fg.muted' }}>
          Done condition field
        </Text>
        <select
          value={doneFieldId}
          onChange={(e) => { setDoneFieldId(e.target.value); setDoneOptionId('') }}
          style={{ fontSize: 12, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--color-border-default)', background: 'var(--color-canvas-default)', color: 'var(--color-fg-default)' }}
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
            style={{ fontSize: 12, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--color-border-default)', background: 'var(--color-canvas-default)', color: 'var(--color-fg-default)' }}
          />
        )}
      </Box>

      <Box sx={{ display: 'flex', gap: 2 }}>
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
