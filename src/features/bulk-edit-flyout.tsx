// Drilldown flyout for editing a single project field across the current
// selection (§5 of bulk-actions-flyouts). Pane 1: four-section field list.
// Pane 2: per-`dataType` value picker or operation-first relationship editor.

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
import {
  buildFieldCatalog,
  getFieldIcon,
  isRelationshipFieldId,
  partitionFieldList,
  relationshipKeyFromFieldId,
  type ProjectField,
} from '@/features/bulk-edit-utils'
import {
  canApply,
  defaultValueFor,
  submitBulkFieldUpdate,
  type FieldValue,
} from '@/features/bulk-edit-flyout-helpers'
import {
  BulkEditRelationshipPane,
  type BulkEditRelationshipPaneHandle,
} from '@/features/bulk-edit-relationship-pane'

export interface BulkEditFlyoutProps {
  anchorRef: React.RefObject<HTMLElement | null>
  open: boolean
  onClose: () => void
  owner: string
  isOrg: boolean
  projectId: string
  itemIds: readonly string[]
  fields: readonly ProjectField[]
  repoName?: string
  /** Pinned field IDs (last three edited). Read-only; the bar manages persistence. */
  recentFieldIds: readonly string[]
  onAppliedField: (fieldId: string) => void
}

export function BulkEditFlyout({
  anchorRef,
  open,
  onClose,
  owner,
  isOrg: _isOrg,
  projectId,
  itemIds,
  fields,
  repoName,
  recentFieldIds,
  onAppliedField,
}: BulkEditFlyoutProps) {
  const [activeFieldId, setActiveFieldId] = useState<string | null>(null)
  const [value, setValue] = useState<FieldValue | null>(null)
  const [query, setQuery] = useState('')
  const { currentPaneId, setCurrentPaneId } = useDrilldownPane('list', open)
  const [metaQuery, setMetaQuery] = useState('')
  const [metaResults, setMetaResults] = useState<
    Array<{ id: string; name: string; avatarUrl?: string }>
  >([])
  const [metaLoading, setMetaLoading] = useState(false)
  const [applyError, setApplyError] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)
  const [relationshipCanApply, setRelationshipCanApply] = useState(false)
  const latestMetaReq = useRef(0)
  const relationshipPaneRef = useRef<BulkEditRelationshipPaneHandle>(null)

  const resetFlyoutState = useCallback(() => {
    setActiveFieldId(null)
    setValue(null)
    setQuery('')
    setMetaQuery('')
    setMetaResults([])
    setApplyError(null)
    setApplying(false)
    setRelationshipCanApply(false)
  }, [])

  const handleFlyoutClose = useCallback(() => {
    resetFlyoutState()
    onClose()
  }, [onClose, resetFlyoutState])

  const catalog = useMemo(() => buildFieldCatalog(fields), [fields])

  const activeField = useMemo(
    () => (activeFieldId ? (catalog.find((f) => f.id === activeFieldId) ?? null) : null),
    [activeFieldId, catalog],
  )

  const activeRelationshipKey = useMemo(
    () => (activeFieldId ? relationshipKeyFromFieldId(activeFieldId) : null),
    [activeFieldId],
  )

  const partition = useMemo(
    () => partitionFieldList({ fields, recentIds: recentFieldIds, query }),
    [fields, recentFieldIds, query],
  )

  const pickField = useCallback(
    (field: ProjectField) => {
      setActiveFieldId(field.id)
      setApplyError(null)
      if (isRelationshipFieldId(field.id)) {
        setCurrentPaneId('relationship')
        return
      }
      setValue(defaultValueFor(field))
      setCurrentPaneId('value')
    },
    [setCurrentPaneId],
  )

  const handleApply = useCallback(async () => {
    if (applying) return

    if (currentPaneId === 'relationship' && activeFieldId && activeRelationshipKey) {
      setApplying(true)
      setApplyError(null)
      try {
        const result = await relationshipPaneRef.current?.apply()
        if (!result?.ok) {
          setApplyError(result?.message ?? 'Could not start the bulk update. Try again.')
          return
        }
        onAppliedField(activeFieldId)
        handleFlyoutClose()
      } finally {
        setApplying(false)
      }
      return
    }

    if (!activeField || !value) return

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
    handleFlyoutClose()
  }, [
    applying,
    currentPaneId,
    activeFieldId,
    activeRelationshipKey,
    activeField,
    value,
    itemIds,
    projectId,
    onAppliedField,
    handleFlyoutClose,
  ])

  const resolvedRepoName = repoName ?? firstRepoNameFromDom(owner)

  useEffect(() => {
    if (!activeField) return
    const requiresMeta =
      activeField.dataType === 'ASSIGNEES' ||
      activeField.dataType === 'LABELS' ||
      activeField.dataType === 'ISSUE_TYPE'
    if (!requiresMeta) return
    if (!resolvedRepoName) return
    const requestId = latestMetaReq.current + 1
    latestMetaReq.current = requestId
    const protocolType: 'ASSIGNEES' | 'LABELS' | 'ISSUE_TYPES' =
      activeField.dataType === 'ISSUE_TYPE'
        ? 'ISSUE_TYPES'
        : (activeField.dataType as 'ASSIGNEES' | 'LABELS')
    const timer = setTimeout(
      () => {
        setMetaLoading(true)
        sendMessage('searchRepoMetadata', {
          owner,
          name: resolvedRepoName,
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
  }, [activeField, owner, metaQuery, resolvedRepoName])

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
          {partition.mode === 'search' ? (
            <ActionList>
              {partition.matches.length === 0 ? (
                <Box sx={{ p: 2, fontSize: 0, color: 'fg.muted' }}>No fields match.</Box>
              ) : (
                partition.matches.map((field) => (
                  <FieldRow key={field.id} field={field} onPick={pickField} />
                ))
              )}
            </ActionList>
          ) : (
            <>
              {partition.recent.length > 0 && (
                <Box data-testid="rgp-edit-fields-recent">
                  <SectionHeader>Recent</SectionHeader>
                  <ActionList>
                    {partition.recent.map((field) => (
                      <FieldRow key={`recent-${field.id}`} field={field} onPick={pickField} />
                    ))}
                  </ActionList>
                </Box>
              )}
              {partition.issueProperties.length > 0 && (
                <Box>
                  <SectionHeader>Issue properties</SectionHeader>
                  <ActionList>
                    {partition.issueProperties.map((field) => (
                      <FieldRow key={field.id} field={field} onPick={pickField} />
                    ))}
                  </ActionList>
                </Box>
              )}
              {partition.projectFields.length > 0 && (
                <Box>
                  <SectionHeader>Project fields</SectionHeader>
                  <ActionList>
                    {partition.projectFields.map((field) => (
                      <FieldRow key={field.id} field={field} onPick={pickField} />
                    ))}
                  </ActionList>
                </Box>
              )}
              {partition.relationships.length > 0 && (
                <Box>
                  <SectionHeader>Relationships</SectionHeader>
                  <ActionList>
                    {partition.relationships.map((field) => (
                      <FieldRow key={field.id} field={field} onPick={pickField} />
                    ))}
                  </ActionList>
                </Box>
              )}
            </>
          )}
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

  const relationshipPane: BulkFlyoutPane = {
    id: 'relationship',
    title: activeField?.name ?? 'Relationships',
    content:
      activeRelationshipKey && activeField ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {applyError && (
            <Flash variant="warning" data-testid="rgp-edit-apply-error">
              {applyError}
            </Flash>
          )}
          <BulkEditRelationshipPane
            ref={relationshipPaneRef}
            relationshipKey={activeRelationshipKey}
            itemIds={itemIds}
            projectId={projectId}
            owner={owner}
            repoName={resolvedRepoName ?? undefined}
            onCanApplyChange={setRelationshipCanApply}
          />
        </Box>
      ) : (
        <Text sx={{ fontSize: 0, color: 'fg.muted' }}>No relationship picked.</Text>
      ),
  }

  const footerPane = currentPaneId === 'relationship' ? 'relationship' : currentPaneId

  return (
    <BulkFlyout
      mode="drilldown"
      anchorRef={anchorRef as React.RefObject<HTMLElement>}
      open={open}
      onClose={handleFlyoutClose}
      title="Edit fields"
      ariaLabel="Edit fields"
      width={400}
      maxHeight={560}
      panes={[listPane, valuePane, relationshipPane]}
      currentPaneId={currentPaneId}
      onPaneChange={setCurrentPaneId}
      rootPaneId="list"
      footer={footerPane === 'value' || footerPane === 'relationship' ? 'apply-cancel' : null}
      applyDisabled={
        footerPane === 'relationship'
          ? !relationshipCanApply || applying
          : !canApply(value) || applying
      }
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
