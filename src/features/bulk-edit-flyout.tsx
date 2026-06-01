// Drilldown flyout for editing a single project field across the current
// selection (§5 of bulk-actions-flyouts). Pane 1: field list with Recent /
// All. Pane 2: per-`dataType` value picker. Apply dispatches the existing
// `bulkUpdate` message with a single field update.
//
// Multi-field editing and the relationships sub-form (parent / blockedBy /
// blocking) live in the legacy modal; both are out of scope for this pass
// per the proposal. The flyout sticks to the GitHub-native "edit one
// property at a time" idiom.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActionList,
  Avatar,
  Box,
  Checkbox,
  Flash,
  Radio,
  RadioGroup,
  Spinner,
  Text,
  TextInput,
  Textarea,
} from '@primer/react'
import { SearchIcon } from '@/ui/icons'
import { BulkFlyout, type BulkFlyoutPane, useDrilldownPane } from '@/ui/bulk-flyout'
import { sendMessage } from '@/lib/messages'
import { getFieldIcon, type ProjectField } from '@/features/bulk-edit-utils'
import {
  canApply,
  defaultValueFor,
  submitBulkFieldUpdate,
  type FieldValue,
} from '@/features/bulk-edit-flyout-helpers'

export interface BulkEditFlyoutProps {
  anchorRef: React.RefObject<HTMLElement | null>
  open: boolean
  onClose: () => void
  owner: string
  isOrg: boolean
  projectId: string
  itemIds: readonly string[]
  fields: readonly ProjectField[]
  /** Pinned field IDs (last three edited). Read-only; the bar manages persistence. */
  recentFieldIds: readonly string[]
  onAppliedField: (fieldId: string) => void
}

const FALLBACK_DATATYPES = new Set([
  'TEXT',
  'NUMBER',
  'DATE',
  'SINGLE_SELECT',
  'ITERATION',
  'ASSIGNEES',
  'LABELS',
  'ISSUE_TYPE',
  'TITLE',
  'BODY',
])

export function BulkEditFlyout({
  anchorRef,
  open,
  onClose,
  owner,
  isOrg,
  projectId,
  itemIds,
  fields,
  recentFieldIds,
  onAppliedField,
}: BulkEditFlyoutProps) {
  const [activeFieldId, setActiveFieldId] = useState<string | null>(null)
  const [value, setValue] = useState<FieldValue | null>(null)
  const [query, setQuery] = useState('')
  const { currentPaneId, setCurrentPaneId } = useDrilldownPane('list', open)
  // Track metadata search state when the picked field is ASSIGNEES/LABELS/ISSUE_TYPE.
  const [metaQuery, setMetaQuery] = useState('')
  const [metaResults, setMetaResults] = useState<
    Array<{ id: string; name: string; avatarUrl?: string }>
  >([])
  const [metaLoading, setMetaLoading] = useState(false)
  const [applyError, setApplyError] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)
  const latestMetaReq = useRef(0)

  useEffect(() => {
    if (!open) {
      setActiveFieldId(null)
      setValue(null)
      setQuery('')
      setMetaQuery('')
      setMetaResults([])
      setApplyError(null)
      setApplying(false)
    }
  }, [open])

  const activeField = useMemo(
    () => (activeFieldId ? (fields.find((f) => f.id === activeFieldId) ?? null) : null),
    [activeFieldId, fields],
  )

  function pickField(field: ProjectField) {
    setActiveFieldId(field.id)
    setValue(defaultValueFor(field))
    setApplyError(null)
    setCurrentPaneId('value')
  }

  async function handleApply() {
    if (!activeField || !value || applying) return

    setApplying(true)
    setApplyError(null)

    try {
      const result = await submitBulkFieldUpdate({
        activeField,
        value,
        itemIds,
        projectId,
      })
      if (!result.ok) {
        setApplyError(result.message)
        return
      }
    } finally {
      setApplying(false)
    }

    onAppliedField(activeField.id)
    onClose()
  }

  // Metadata search (ASSIGNEES / LABELS / ISSUE_TYPE)
  useEffect(() => {
    if (!activeField) return
    const requiresMeta =
      activeField.dataType === 'ASSIGNEES' ||
      activeField.dataType === 'LABELS' ||
      activeField.dataType === 'ISSUE_TYPE'
    if (!requiresMeta) return
    const repoName = firstRepoNameFromDom(owner)
    if (!repoName) return
    const requestId = latestMetaReq.current + 1
    latestMetaReq.current = requestId
    setMetaLoading(true)
    const protocolType: 'ASSIGNEES' | 'LABELS' | 'ISSUE_TYPES' =
      activeField.dataType === 'ISSUE_TYPE'
        ? 'ISSUE_TYPES'
        : (activeField.dataType as 'ASSIGNEES' | 'LABELS')
    const timer = setTimeout(
      () => {
        sendMessage('searchRepoMetadata', {
          owner,
          name: repoName,
          q: metaQuery,
          type: protocolType,
        })
          .then((results) => {
            if (requestId !== latestMetaReq.current) return
            setMetaResults(results.map((r) => ({ id: r.id, name: r.name, avatarUrl: r.avatarUrl })))
          })
          .catch(() => {
            if (requestId !== latestMetaReq.current) return
            setMetaResults([])
          })
          .finally(() => {
            if (requestId === latestMetaReq.current) setMetaLoading(false)
          })
      },
      metaQuery ? 250 : 0,
    )
    return () => clearTimeout(timer)
  }, [activeField, owner, metaQuery])

  const recentFields = useMemo(() => {
    const idxed = new Map(fields.map((f) => [f.id, f]))
    return recentFieldIds
      .map((id) => idxed.get(id))
      .filter((f): f is ProjectField => f !== undefined)
  }, [fields, recentFieldIds])

  const filteredFields = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return fields.filter((f) => FALLBACK_DATATYPES.has(f.dataType))
    return fields
      .filter((f) => FALLBACK_DATATYPES.has(f.dataType))
      .filter((f) => f.name.toLowerCase().includes(q))
  }, [fields, query])

  const listPane: BulkFlyoutPane = {
    id: 'list',
    title: 'Edit field',
    content: (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <TextInput
          leadingVisual={SearchIcon}
          value={query}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
          aria-label="Filter fields"
          placeholder="Filter fields…"
          sx={{ width: '100%' }}
        />
        <Box
          sx={{
            border: '1px solid',
            borderColor: 'border.default',
            borderRadius: 1,
            maxHeight: 320,
            overflowY: 'auto',
          }}
          data-testid="rgp-edit-field-list"
        >
          {!query && recentFields.length > 0 && (
            <Box>
              <SectionHeader>Recent</SectionHeader>
              <ActionList>
                {recentFields.map((field) => (
                  <FieldRow key={`recent-${field.id}`} field={field} onPick={pickField} />
                ))}
              </ActionList>
              <SectionHeader>All fields</SectionHeader>
            </Box>
          )}
          <ActionList>
            {filteredFields.length === 0 ? (
              <Box sx={{ p: 2, fontSize: 0, color: 'fg.muted' }}>No fields match.</Box>
            ) : (
              filteredFields.map((field) => (
                <FieldRow key={field.id} field={field} onPick={pickField} />
              ))
            )}
          </ActionList>
        </Box>
      </Box>
    ),
  }

  const valuePane: BulkFlyoutPane = {
    id: 'value',
    title: activeField?.name ?? 'Edit value',
    content: activeField ? (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {applyError && (
          <Flash variant="warning" data-testid="rgp-edit-apply-error">
            {applyError}
          </Flash>
        )}
        <ValuePicker
          field={activeField}
          value={value}
          onChange={setValue}
          metaQuery={metaQuery}
          setMetaQuery={setMetaQuery}
          metaResults={metaResults}
          metaLoading={metaLoading}
        />
      </Box>
    ) : (
      <Text sx={{ fontSize: 0, color: 'fg.muted' }}>No field picked.</Text>
    ),
  }

  return (
    <BulkFlyout
      mode="drilldown"
      anchorRef={anchorRef as React.RefObject<HTMLElement>}
      open={open}
      onClose={onClose}
      title="Edit fields"
      ariaLabel="Edit fields"
      width={400}
      maxHeight={560}
      panes={[listPane, valuePane]}
      currentPaneId={currentPaneId}
      onPaneChange={setCurrentPaneId}
      rootPaneId="list"
      footer={currentPaneId === 'value' ? 'apply-cancel' : null}
      applyDisabled={!canApply(value) || applying}
      onApply={handleApply}
      applyLabel="Apply"
    />
  )
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <Box
      sx={{
        px: 2,
        py: 1,
        fontSize: 0,
        fontWeight: 'semibold',
        color: 'fg.muted',
        bg: 'canvas.subtle',
        borderBottom: '1px solid',
        borderColor: 'border.muted',
      }}
    >
      {children}
    </Box>
  )
}

interface FieldRowProps {
  field: ProjectField
  onPick: (field: ProjectField) => void
}

function FieldRow({ field, onPick }: FieldRowProps) {
  return (
    <ActionList.Item onSelect={() => onPick(field)} data-testid={`rgp-edit-field-${field.id}`}>
      <ActionList.LeadingVisual>
        <Box sx={{ color: 'fg.muted' }}>{getFieldIcon(field.dataType)}</Box>
      </ActionList.LeadingVisual>
      {field.name}
      <ActionList.Description>
        {field.dataType.toLowerCase().replace(/_/g, ' ')}
      </ActionList.Description>
    </ActionList.Item>
  )
}

interface ValuePickerProps {
  field: ProjectField
  value: FieldValue | null
  onChange: (next: FieldValue) => void
  metaQuery: string
  setMetaQuery: (q: string) => void
  metaResults: Array<{ id: string; name: string; avatarUrl?: string }>
  metaLoading: boolean
}

function ValuePicker({
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

  if (dataType === 'BODY') {
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
          sx={{ width: '100%', fontFamily: 'mono' }}
          data-testid="rgp-edit-value-body"
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

function firstRepoNameFromDom(owner: string): string | null {
  if (typeof document === 'undefined') return null
  const links = document.querySelectorAll<HTMLAnchorElement>(
    'a[href*="/issues/"], a[href*="/pull/"]',
  )
  for (const link of Array.from(links)) {
    const match = link.href.match(/github\.com\/([^/]+)\/([^/]+)\/(issues|pull)\/\d+/)
    if (match && match[1] === owner) return match[2]
  }
  return null
}
