import React from 'react'
import {
  Avatar,
  Box,
  Checkbox,
  Radio,
  RadioGroup,
  Spinner,
  Text,
  TextInput,
  Textarea,
} from '@primer/react'
import { SearchIcon } from '@/ui/icons'
import { type ProjectField } from '@/features/bulk-edit-utils'
import { type FieldValue } from '@/features/bulk-edit-flyout-helpers'

interface ValuePickerProps {
  field: ProjectField
  value: FieldValue | null
  onChange: (next: FieldValue) => void
  metaQuery: string
  setMetaQuery: (q: string) => void
  metaResults: Array<{ id: string; name: string; avatarUrl?: string }>
  metaLoading: boolean
}

export function ValuePicker({
  field,
  value,
  onChange,
  metaQuery,
  setMetaQuery,
  metaResults,
  metaLoading,
}: ValuePickerProps) {
  const dataType = field.dataType

  if (dataType === 'TEXT' || dataType === 'TITLE') {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Text as="label" sx={{ fontSize: 0, fontWeight: 'semibold', color: 'fg.muted' }}>
          {field.name}
        </Text>
        <TextInput
          value={value?.kind === 'text' ? value.text : ''}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            onChange({ kind: 'text', text: e.target.value })
          }
          aria-label={field.name}
          sx={{ width: '100%' }}
          data-testid="rgp-edit-value-text"
        />
      </Box>
    )
  }

  if (dataType === 'BODY' || dataType === 'COMMENT') {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Text as="label" sx={{ fontSize: 0, fontWeight: 'semibold', color: 'fg.muted' }}>
          {field.name}
        </Text>
        <Textarea
          value={value?.kind === 'text' ? value.text : ''}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
            onChange({ kind: 'text', text: e.target.value })
          }
          rows={6}
          aria-label={field.name}
          sx={{ width: '100%', fontFamily: dataType === 'BODY' ? 'mono' : 'inherit' }}
          data-testid={dataType === 'COMMENT' ? 'rgp-edit-value-comment' : 'rgp-edit-value-body'}
        />
      </Box>
    )
  }

  if (dataType === 'NUMBER') {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Text as="label" sx={{ fontSize: 0, fontWeight: 'semibold', color: 'fg.muted' }}>
          {field.name}
        </Text>
        <TextInput
          type="number"
          value={value?.kind === 'number' ? String(value.number ?? '') : ''}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            const raw = e.target.value
            onChange({
              kind: 'number',
              number: raw === '' ? null : Number(raw),
            })
          }}
          aria-label={field.name}
          sx={{ width: '100%' }}
          data-testid="rgp-edit-value-number"
        />
      </Box>
    )
  }

  if (dataType === 'DATE') {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Text as="label" sx={{ fontSize: 0, fontWeight: 'semibold', color: 'fg.muted' }}>
          {field.name}
        </Text>
        <TextInput
          type="date"
          value={value?.kind === 'date' ? value.date : ''}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            onChange({ kind: 'date', date: e.target.value })
          }
          aria-label={field.name}
          sx={{ width: '100%' }}
          data-testid="rgp-edit-value-date"
        />
      </Box>
    )
  }

  if (dataType === 'SINGLE_SELECT' && field.options) {
    return (
      <RadioGroup
        name={`rgp-edit-options-${field.id}`}
        onChange={(v) => {
          if (v) onChange({ kind: 'singleSelect', singleSelectOptionId: v })
        }}
        sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}
      >
        <RadioGroup.Label sx={{ fontSize: 0, fontWeight: 'semibold', color: 'fg.muted' }}>
          {field.name}
        </RadioGroup.Label>
        {field.options.map((opt) => {
          const selected = value?.kind === 'singleSelect' && value.singleSelectOptionId === opt.id
          return (
            <Box key={opt.id} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Radio
                value={opt.id}
                checked={selected}
                onChange={() => onChange({ kind: 'singleSelect', singleSelectOptionId: opt.id })}
                data-testid={`rgp-edit-option-${opt.id}`}
              />
              <Text sx={{ fontSize: 1 }}>{opt.name}</Text>
            </Box>
          )
        })}
      </RadioGroup>
    )
  }

  if (dataType === 'ITERATION' && field.configuration?.iterations) {
    return (
      <RadioGroup
        name={`rgp-edit-iter-${field.id}`}
        onChange={(v) => {
          if (v) onChange({ kind: 'iteration', iterationId: v })
        }}
        sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}
      >
        <RadioGroup.Label sx={{ fontSize: 0, fontWeight: 'semibold', color: 'fg.muted' }}>
          {field.name}
        </RadioGroup.Label>
        {field.configuration.iterations.map((it) => {
          const selected = value?.kind === 'iteration' && value.iterationId === it.id
          return (
            <Box key={it.id} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Radio
                value={it.id}
                checked={selected}
                onChange={() => onChange({ kind: 'iteration', iterationId: it.id })}
                data-testid={`rgp-edit-iteration-${it.id}`}
              />
              <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                <Text sx={{ fontSize: 1 }}>{it.title}</Text>
                <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
                  Starts {it.startDate} · {it.duration} days
                </Text>
              </Box>
            </Box>
          )
        })}
      </RadioGroup>
    )
  }

  if (dataType === 'ASSIGNEES' || dataType === 'LABELS' || dataType === 'ISSUE_TYPE') {
    const current = value?.kind === 'array' ? value.array : []
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Text as="label" sx={{ fontSize: 0, fontWeight: 'semibold', color: 'fg.muted' }}>
          {field.name}
        </Text>
        <TextInput
          leadingVisual={SearchIcon}
          value={metaQuery}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMetaQuery(e.target.value)}
          aria-label={`Search ${field.name}`}
          placeholder={`Search ${field.name.toLowerCase()}…`}
          sx={{ width: '100%' }}
        />
        <Box
          sx={{
            border: '1px solid',
            borderColor: 'border.default',
            borderRadius: 1,
            maxHeight: 200,
            overflowY: 'auto',
          }}
          data-testid="rgp-edit-meta-list"
        >
          {metaLoading && (
            <Box sx={{ p: 2, display: 'flex', justifyContent: 'center' }}>
              <Spinner size="small" />
            </Box>
          )}
          {!metaLoading && metaResults.length === 0 && (
            <Box sx={{ p: 2, fontSize: 0, color: 'fg.muted' }}>No matches.</Box>
          )}
          {metaResults.map((r) => {
            const checked = current.some((c) => c.id === r.id)
            return (
              <Box
                key={r.id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  px: 2,
                  py: 1,
                  fontSize: 1,
                  cursor: 'pointer',
                  ':hover': { bg: 'canvas.subtle' },
                }}
                onClick={() => {
                  const next = checked
                    ? current.filter((c) => c.id !== r.id)
                    : [...current, { id: r.id, name: r.name }]
                  onChange({ kind: 'array', array: next })
                }}
              >
                <Checkbox checked={checked} onChange={() => {}} aria-label={`Toggle ${r.name}`} />
                {dataType === 'ASSIGNEES' && r.avatarUrl && <Avatar src={r.avatarUrl} size={16} />}
                <Text>{r.name}</Text>
              </Box>
            )
          })}
        </Box>
      </Box>
    )
  }

  return (
    <Box sx={{ p: 2, fontSize: 0, color: 'fg.muted' }}>
      Field type "{dataType}" is not supported in the inline editor yet.
    </Box>
  )
}
