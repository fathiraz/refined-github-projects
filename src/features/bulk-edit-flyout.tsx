// Drilldown flyout for editing a single project field across the current
// selection (§5 of bulk-actions-flyouts). Pane 1: four-section field list.
// Pane 2: per-`dataType` value picker or operation-first relationship editor.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActionList, Box, Flash, Text, TextInput } from '@primer/react'
import { ValuePicker } from '@/features/bulk-edit-value-picker'
import { FieldRow, SectionHeader } from '@/features/bulk-edit-field-row'
import { SearchIcon } from '@/ui/icons'
import { BulkFlyout, type BulkFlyoutPane, useDrilldownPane } from '@/ui/bulk-flyout'
import { sendMessage } from '@/lib/messages'
import {
  buildFieldCatalog,
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
  firstRepoNameFromDom,
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

  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- parent may close via Escape/selection without onClose
      resetFlyoutState()
    }
  }, [open, resetFlyoutState])

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
      } catch {
        setApplyError('Could not start the bulk update. Try again.')
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
                <Box
                  sx={{ p: 2, fontSize: 0, color: 'fg.muted' }}
                  data-testid="rgp-edit-fields-search-empty"
                >
                  {query.trim()
                    ? `No fields match "${query.trim()}". Try a different search.`
                    : 'No fields match.'}
                </Box>
              ) : (
                partition.matches.map((field) => (
                  <FieldRow key={field.id} field={field} onPick={pickField} />
                ))
              )}
            </ActionList>
          ) : (
            <>
              {partition.recent.length === 0 && (
                <Box
                  sx={{
                    px: 2,
                    py: 2,
                    fontSize: 0,
                    color: 'fg.subtle',
                    borderBottom: '1px solid',
                    borderColor: 'border.muted',
                  }}
                  data-testid="rgp-edit-fields-recent-empty"
                >
                  Fields you edit appear under Recent for quick access.
                </Box>
              )}
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
                  {partition.recent.length > 0 && <ActionList.Divider />}
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
                  {(partition.recent.length > 0 || partition.issueProperties.length > 0) && (
                    <ActionList.Divider />
                  )}
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
                  {(partition.recent.length > 0 ||
                    partition.issueProperties.length > 0 ||
                    partition.projectFields.length > 0) && <ActionList.Divider />}
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
