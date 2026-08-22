import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Box, Button, Flash, FormControl, Text, TextInput } from '@primer/react'
import {
  sendMessage,
  type DuplicateItemPlan,
  type IssueRelationshipData,
  type ItemPreviewData,
} from '@/lib/messages'
import { queueStore } from '@/lib/queue-store'
import { flyToTracker } from '@/features/bulk-utils'
import { RepoMetadataSelectPanel, type RepoMetadataItem } from '@/ui/repo-metadata-select-panel'
import { MarkdownTextarea } from '@/ui/markdown-textarea'
import {
  AlertIcon,
  ArrowRightIcon,
  CheckIcon,
  PersonIcon,
  ProjectBoardIcon,
  ShieldIcon,
  TagIcon,
  TextLineIcon,
} from '@/ui/icons'
import { ModalStepHeader } from '@/ui/modal-step-header'
import { primerCss } from '@/lib/primer-css-helper'
import { ensureTippyCss } from '@/lib/tippy-utils'
import { formatIssueReference, relationshipKey } from '@/lib/relationship-utils'
import {
  ASSIGNEES_SECTION_ID,
  BLOCKED_BY_SECTION_ID,
  BLOCKING_SECTION_ID,
  BODY_SECTION_ID,
  buildFieldValue,
  bulkDuplicateHeaderIcon,
  buttonMotionSx,
  drainPendingDuplicates,
  fieldSectionId,
  getFieldIcon,
  ISSUE_TYPE_SECTION_ID,
  isAssigneesEdited,
  isFieldEdited,
  isLabelsEdited,
  isRelationshipsEdited,
  LABELS_SECTION_ID,
  MAX_CONCURRENT_DUPLICATES,
  PARENT_SECTION_ID,
  TITLE_SECTION_ID,
  type DuplicateSection,
  type EditableField,
  type SectionId,
  type Step,
} from '@/features/bulk-duplicate-utils'
import { IssueRefRow, RelationshipListEditor } from '@/features/bulk-duplicate-relationship-list'
import {
  OptionChip,
  SectionLabel,
  sectionColumnSx,
  shimmerSx,
} from '@/features/bulk-duplicate-section-ui'

import { ReviewStep, SelectSectionsStep } from '@/features/bulk-duplicate-steps'
import { plural } from '@/lib/format'

const getFieldOptionTooltip = (fieldName: string, optionName: string) =>
  `Set ${fieldName} to ${optionName}.`

/**
 * Text, number and date fields render the same TextInput and differ only in
 * its `type` and how the value round-trips through `EditableField`.
 */
const SCALAR_FIELD_INPUTS = {
  TEXT: {
    type: undefined,
    read: (field: EditableField) => field.text ?? '',
    write: (raw: string): Partial<EditableField> => ({ text: raw }),
  },
  NUMBER: {
    type: 'number',
    read: (field: EditableField) => String(field.number ?? ''),
    write: (raw: string): Partial<EditableField> => {
      const parsed = parseFloat(raw)
      return { number: Number.isFinite(parsed) ? parsed : undefined }
    },
  },
  DATE: {
    type: 'date',
    read: (field: EditableField) => field.date ?? '',
    write: (raw: string): Partial<EditableField> => ({ date: raw }),
  },
} as const

/** Placeholder row shapes for the LOADING skeleton. */
const SKELETON_GROUPS: { labelWidth: number; rows: number[] }[] = [
  { labelWidth: 60, rows: [80, 65] },
  { labelWidth: 70, rows: [75, 55] },
  { labelWidth: 90, rows: [70] },
]

interface Props {
  itemId: string
  projectId: string
  owner: string
  isOrg: boolean
  projectNumber: number
  onClose: () => void
}

/**
 * §11.2/§11.6 — combined REVIEW step. Renders each selected section's inline
 * editor (via `renderSection`) with a `· edited` / `· same as source` diff
 * badge in the row label. Footer hosts Back + Duplicate so the user confirms
 * in the same screen they edit in.
 */

export function BulkDuplicateModal({
  itemId,
  projectId,
  owner,
  isOrg,
  projectNumber,
  onClose,
}: Props) {
  const [step, setStep] = useState<Step>('LOADING')
  const [preview, setPreview] = useState<ItemPreviewData | null>(null)
  const [error, setError] = useState('')
  const [concurrentError, setConcurrentError] = useState(false)
  const [createMore, setCreateMore] = useState(false)
  // Lock the single-copy submit path while a non-Create-more request awaits
  // its verdict, so repeated clicks can't queue extra copies in a mode that's
  // meant to create exactly one and close (§cubic-dev-ai PR #50).
  const [submitting, setSubmitting] = useState(false)
  const duplicateBtnRef = useRef<HTMLButtonElement | null>(null)
  // Race-window guard (§cubic-dev-ai): `queueStore.getActiveCount()` only
  // reflects a fired duplicate once the BG's `queueStateUpdate` broadcast
  // lands, one round-trip after the fire. Rapid "Create more" clicks can fire
  // ahead of that broadcast, so track just-fired-but-not-yet-reflected
  // duplicates locally and drain the tally as the real count catches up.
  const pendingDuplicatesRef = useRef(0)
  const prevActiveCountRef = useRef(0)

  const [selectedSections, setSelectedSections] = useState<SectionId[]>([])
  const [editedTitle, setEditedTitle] = useState('')
  const [editedBody, setEditedBody] = useState('')
  const [editedAssignees, setEditedAssignees] = useState<RepoMetadataItem[]>([])
  const [editedLabels, setEditedLabels] = useState<RepoMetadataItem[]>([])
  const [editedFields, setEditedFields] = useState<EditableField[]>([])
  const [blockedByRelationships, setBlockedByRelationships] = useState<IssueRelationshipData[]>([])
  const [blockingRelationships, setBlockingRelationships] = useState<IssueRelationshipData[]>([])

  useEffect(() => {
    ensureTippyCss()
  }, [])

  // Drain the pending-duplicates tally as `queueStore` catches up. `subscribe`
  // pushes the current snapshot immediately, so `prevActiveCountRef`
  // bootstraps to the real global count even if other duplicates are already
  // active when this modal opens.
  useEffect(() => {
    return queueStore.subscribe(() => {
      const nowActive = queueStore.getActiveCount()
      pendingDuplicatesRef.current = drainPendingDuplicates(
        prevActiveCountRef.current,
        nowActive,
        pendingDuplicatesRef.current,
      )
      prevActiveCountRef.current = nowActive
    })
  }, [])

  // Reset edit state to the source item's defaults. Shared by the initial
  // preview load and the "Create more" re-arm (both revert to source defaults).
  const applyPreviewDefaults = useCallback((data: ItemPreviewData) => {
    // §11.5 — default duplicated title is `<original> (copy)` editable inline.
    setEditedTitle(`${data.title} (copy)`)
    setEditedBody(data.body)
    setEditedAssignees(
      data.assignees.map((assignee) => ({
        id: assignee.id,
        name: assignee.login,
        avatarUrl: assignee.avatarUrl,
      })),
    )
    setEditedLabels(data.labels)
    setEditedFields(data.fields)
    setBlockedByRelationships(data.relationships.blockedBy)
    setBlockingRelationships(data.relationships.blocking)
    // §11.4 — default Content (Title, Body) + Metadata (Assignees, Labels,
    // Issue Type) + every Project Field; Relationships (Parent, Blocked-by,
    // Blocking) unchecked by default — user opts in explicitly.
    setSelectedSections([
      TITLE_SECTION_ID,
      BODY_SECTION_ID,
      ASSIGNEES_SECTION_ID,
      LABELS_SECTION_ID,
      ...(data.issueTypeName ? [ISSUE_TYPE_SECTION_ID] : []),
      ...data.fields.map((field) => fieldSectionId(field.fieldId)),
    ])
  }, [])

  useEffect(() => {
    sendMessage('getItemPreview', { itemId, owner, number: projectNumber, isOrg })
      .then((data) => {
        setPreview(data)
        applyPreviewDefaults(data)
        setStep('SELECT')
      })
      .catch((cause: Error) => {
        console.error('[rgp] getItemPreview failed', cause)
        setError(cause.message || 'Failed to load item details')
        setStep('ERROR')
      })
  }, [isOrg, itemId, owner, projectNumber, applyPreviewDefaults])

  const availableSections = useMemo<DuplicateSection[]>(() => {
    if (!preview) return []

    return [
      {
        id: TITLE_SECTION_ID,
        label: 'Title',
        group: 'CONTENT',
        icon: <TextLineIcon size={14} />,
        helperText: 'Falls back to the original title when skipped.',
      },
      {
        id: BODY_SECTION_ID,
        label: 'Description',
        group: 'CONTENT',
        icon: <TextLineIcon size={14} />,
        helperText: 'Markdown description for the duplicated issue.',
      },
      {
        id: ASSIGNEES_SECTION_ID,
        label: 'Assignees',
        group: 'METADATA',
        icon: <PersonIcon size={14} />,
        badge: `${preview.assignees.length}`,
      },
      {
        id: LABELS_SECTION_ID,
        label: 'Labels',
        group: 'METADATA',
        icon: <TagIcon size={14} />,
        badge: `${preview.labels.length}`,
      },
      ...(preview.issueTypeName
        ? [
            {
              id: ISSUE_TYPE_SECTION_ID,
              label: 'Issue Type',
              group: 'METADATA',
              icon: <ShieldIcon size={14} />,
              badge: preview.issueTypeName,
            } satisfies DuplicateSection,
          ]
        : []),
      ...preview.fields.map((field) => ({
        id: fieldSectionId(field.fieldId),
        label: field.fieldName,
        group: 'PROJECT_FIELDS' as const,
        icon: getFieldIcon(field.dataType) ?? <ProjectBoardIcon size={14} />,
        badge: field.dataType.toLowerCase(),
      })),
      ...(preview.relationships.parent
        ? [
            {
              id: PARENT_SECTION_ID,
              label: 'Parent',
              group: 'RELATIONSHIPS',
              icon: <ProjectBoardIcon size={14} />,
              badge: formatIssueReference(preview.relationships.parent),
            } satisfies DuplicateSection,
          ]
        : []),
      ...(preview.relationships.blockedBy.length > 0
        ? [
            {
              id: BLOCKED_BY_SECTION_ID,
              label: 'Blocked by',
              group: 'RELATIONSHIPS',
              icon: <AlertIcon size={14} />,
              badge: `${plural(preview.relationships.blockedBy.length, 'issue')}`,
            } satisfies DuplicateSection,
          ]
        : []),
      ...(preview.relationships.blocking.length > 0
        ? [
            {
              id: BLOCKING_SECTION_ID,
              label: 'Blocking',
              group: 'RELATIONSHIPS',
              icon: <ArrowRightIcon size={14} />,
              badge: `${plural(preview.relationships.blocking.length, 'issue')}`,
            } satisfies DuplicateSection,
          ]
        : []),
    ]
  }, [preview])

  const selectedSectionsInOrder = availableSections.filter((section) =>
    selectedSections.includes(section.id),
  )
  const repoOwner = preview?.repoOwner || owner
  const repoName = preview?.repoName || ''

  function isSectionSelected(sectionId: SectionId): boolean {
    return selectedSections.includes(sectionId)
  }

  function updateField(fieldId: string, patch: Partial<EditableField>) {
    setEditedFields((previous) =>
      previous.map((field) => (field.fieldId === fieldId ? { ...field, ...patch } : field)),
    )
  }

  function restoreSection(sectionId: SectionId) {
    if (!preview) return

    if (sectionId === BLOCKED_BY_SECTION_ID) {
      setBlockedByRelationships(preview.relationships.blockedBy)
    }

    if (sectionId === BLOCKING_SECTION_ID) {
      setBlockingRelationships(preview.relationships.blocking)
    }
  }

  function toggleSection(sectionId: SectionId) {
    if (isSectionSelected(sectionId)) {
      setSelectedSections((previous) => previous.filter((id) => id !== sectionId))
      return
    }

    restoreSection(sectionId)
    setSelectedSections((previous) => [...previous, sectionId])
  }

  function dismissSection(sectionId: SectionId) {
    setSelectedSections((previous) => previous.filter((id) => id !== sectionId))
  }

  function selectAllSections() {
    availableSections.forEach((section) => {
      if (!selectedSections.includes(section.id)) {
        restoreSection(section.id)
      }
    })
    setSelectedSections(availableSections.map((section) => section.id))
  }

  function removeRelationship(kind: 'blockedBy' | 'blocking', issue: IssueRelationshipData) {
    if (kind === 'blockedBy') {
      const next = blockedByRelationships.filter(
        (candidate) => relationshipKey(candidate) !== relationshipKey(issue),
      )
      setBlockedByRelationships(next)
      if (next.length === 0) dismissSection(BLOCKED_BY_SECTION_ID)
      return
    }

    const next = blockingRelationships.filter(
      (candidate) => relationshipKey(candidate) !== relationshipKey(issue),
    )
    setBlockingRelationships(next)
    if (next.length === 0) dismissSection(BLOCKING_SECTION_ID)
  }

  function buildDuplicatePlan(): DuplicateItemPlan {
    return {
      title: {
        enabled: isSectionSelected(TITLE_SECTION_ID),
        value: editedTitle,
      },
      body: {
        enabled: isSectionSelected(BODY_SECTION_ID),
        value: editedBody,
      },
      assignees: {
        enabled: isSectionSelected(ASSIGNEES_SECTION_ID),
        ids: editedAssignees.map((assignee) => assignee.id),
      },
      labels: {
        enabled: isSectionSelected(LABELS_SECTION_ID),
        ids: editedLabels.map((label) => label.id),
      },
      issueType: {
        enabled: isSectionSelected(ISSUE_TYPE_SECTION_ID),
        id: preview?.issueTypeId,
        name: preview?.issueTypeName,
      },
      fieldValues: editedFields.map((field) => ({
        fieldId: field.fieldId,
        enabled: isSectionSelected(fieldSectionId(field.fieldId)),
        value: buildFieldValue(field),
      })),
      relationships: {
        parent: {
          enabled: isSectionSelected(PARENT_SECTION_ID),
          issue: preview?.relationships.parent,
        },
        blockedBy: {
          enabled: isSectionSelected(BLOCKED_BY_SECTION_ID) && blockedByRelationships.length > 0,
          issues: blockedByRelationships,
        },
        blocking: {
          enabled: isSectionSelected(BLOCKING_SECTION_ID) && blockingRelationships.length > 0,
          issues: blockingRelationships,
        },
      },
    }
  }

  /**
   * §11.6 — Diff status for a section: `edited` when the current value differs
   * from the original preview, `same` otherwise. The default title includes a
   * `(copy)` suffix so it is `edited` by default; relationships are unchecked
   * by default per §11.4 so they only appear under REVIEW when the user opts
   * in (the badge then reflects whether they've also removed any rows).
   */
  function diffStatus(sectionId: SectionId): 'edited' | 'same' {
    if (!preview) return 'same'
    if (sectionId === TITLE_SECTION_ID) return editedTitle === preview.title ? 'same' : 'edited'
    if (sectionId === BODY_SECTION_ID) return editedBody === preview.body ? 'same' : 'edited'
    if (sectionId === ASSIGNEES_SECTION_ID) {
      const sourceIds = preview.assignees.map((a) => ({ id: a.id }))
      return isAssigneesEdited(editedAssignees, sourceIds) ? 'edited' : 'same'
    }
    if (sectionId === LABELS_SECTION_ID) {
      return isLabelsEdited(editedLabels, preview.labels) ? 'edited' : 'same'
    }
    if (sectionId === ISSUE_TYPE_SECTION_ID) return 'same'
    if (sectionId === PARENT_SECTION_ID) return 'same'
    if (sectionId === BLOCKED_BY_SECTION_ID) {
      return isRelationshipsEdited(blockedByRelationships, preview.relationships.blockedBy, (r) =>
        relationshipKey(r),
      )
        ? 'edited'
        : 'same'
    }
    if (sectionId === BLOCKING_SECTION_ID) {
      return isRelationshipsEdited(blockingRelationships, preview.relationships.blocking, (r) =>
        relationshipKey(r),
      )
        ? 'edited'
        : 'same'
    }
    const field = editedFields.find((f) => fieldSectionId(f.fieldId) === sectionId)
    const sourceField = preview.fields.find((f) => fieldSectionId(f.fieldId) === sectionId)
    if (!field || !sourceField) return 'same'
    return isFieldEdited(field, sourceField) ? 'edited' : 'same'
  }

  function handleDuplicate() {
    if (!preview) return
    if (submitting) return
    if (queueStore.getActiveCount() + pendingDuplicatesRef.current >= MAX_CONCURRENT_DUPLICATES) {
      setConcurrentError(true)
      return
    }

    setConcurrentError(false)
    pendingDuplicatesRef.current += 1
    if (!createMore) setSubmitting(true)
    const rect = duplicateBtnRef.current?.getBoundingClientRect()
    if (rect) flyToTracker(rect)

    // Fire-and-forget: the duplication runs to completion in the background SW
    // regardless of the modal's lifecycle; errors surface via the queue tracker.
    // The background handler still returns an immediate accept/reject verdict
    // (rejected when its concurrency gate is saturated, e.g. by another tab)
    // so we can roll back the optimistic tally above instead of leaking it.
    void sendMessage('duplicateItem', {
      itemId: preview.resolvedItemId || itemId,
      projectId: preview.projectId || projectId,
      plan: buildDuplicatePlan(),
    })
      .then((result) => {
        if (!result?.accepted) {
          pendingDuplicatesRef.current = Math.max(0, pendingDuplicatesRef.current - 1)
          setConcurrentError(true)
          setSubmitting(false)
          return
        }
        // Accepted: re-arm for another (Create more) or hand off and close.
        if (createMore) {
          applyPreviewDefaults(preview)
        } else {
          onClose()
        }
      })
      .catch((cause: Error) => {
        pendingDuplicatesRef.current = Math.max(0, pendingDuplicatesRef.current - 1)
        setConcurrentError(true)
        setSubmitting(false)
        console.error('[rgp] duplicateItem failed', cause)
      })
  }

  function renderValueSection(section: DuplicateSection): React.ReactNode {
    if (!preview) return null

    if (section.id === TITLE_SECTION_ID) {
      return (
        <FormControl key={section.id} sx={{ width: '100%' }}>
          <SectionLabel
            as="label"
            icon={<TextLineIcon size={14} />}
            label="Title"
            tooltipFor="title"
          />
          <TextInput
            block
            value={editedTitle}
            onChange={(event) => setEditedTitle(event.target.value)}
          />
        </FormControl>
      )
    }

    if (section.id === BODY_SECTION_ID) {
      return (
        <FormControl key={section.id} sx={{ width: '100%' }}>
          <SectionLabel
            as="label"
            icon={<TextLineIcon size={14} />}
            label="Description"
            tooltipFor="description"
          />
          <Box sx={{ width: '100%' }}>
            <MarkdownTextarea
              value={editedBody}
              onChange={setEditedBody}
              placeholder="Enter description (supports markdown)..."
              rows={6}
            />
          </Box>
        </FormControl>
      )
    }

    if (section.id === ASSIGNEES_SECTION_ID || section.id === LABELS_SECTION_ID) {
      const isAssignees = section.id === ASSIGNEES_SECTION_ID
      return (
        <Box key={section.id} sx={{ ...sectionColumnSx, gap: 1 }}>
          <SectionLabel
            icon={isAssignees ? <PersonIcon size={14} /> : <TagIcon size={14} />}
            label={isAssignees ? 'Assignees' : 'Labels'}
            tooltipFor={isAssignees ? 'assignees' : 'labels'}
          />
          <Box sx={{ width: '100%' }}>
            <RepoMetadataSelectPanel
              type={isAssignees ? 'ASSIGNEES' : 'LABELS'}
              owner={repoOwner}
              repoName={repoName}
              value={isAssignees ? editedAssignees : editedLabels}
              onChange={isAssignees ? setEditedAssignees : setEditedLabels}
              placeholder={isAssignees ? 'Select assignees' : 'Select labels'}
            />
          </Box>
        </Box>
      )
    }

    if (section.id === ISSUE_TYPE_SECTION_ID) {
      return (
        <Box key={section.id} sx={{ ...sectionColumnSx, gap: 1 }}>
          <SectionLabel
            icon={<ShieldIcon size={14} />}
            label="Issue Type"
            tooltipFor="issue type"
          />
          <Text sx={{ fontSize: 1, color: 'fg.default' }}>{preview.issueTypeName}</Text>
        </Box>
      )
    }

    if (section.id === PARENT_SECTION_ID && preview.relationships.parent) {
      return (
        <Box key={section.id} sx={{ ...sectionColumnSx, gap: 2 }}>
          <SectionLabel
            icon={<ProjectBoardIcon size={14} />}
            label="Parent"
            tooltipFor="parent relationship"
          />
          <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
            The duplicate will be linked as a sub-issue of this parent.
          </Text>
          <IssueRefRow
            issue={preview.relationships.parent}
            removeLabel="Remove parent relationship"
            onRemove={() => dismissSection(PARENT_SECTION_ID)}
          />
        </Box>
      )
    }

    if (section.id === BLOCKED_BY_SECTION_ID || section.id === BLOCKING_SECTION_ID) {
      const isBlockedBy = section.id === BLOCKED_BY_SECTION_ID
      return (
        <RelationshipListEditor
          key={section.id}
          label={isBlockedBy ? 'Blocked by' : 'Blocking'}
          icon={isBlockedBy ? <AlertIcon size={14} /> : <ArrowRightIcon size={14} />}
          description={
            isBlockedBy
              ? 'These issues will continue to block the duplicate. Remove any relationship you do not want to copy.'
              : 'These issues will continue to be blocked by the duplicate. Remove any relationship you do not want to copy.'
          }
          issues={isBlockedBy ? blockedByRelationships : blockingRelationships}
          onRemoveIssue={(issue) =>
            removeRelationship(isBlockedBy ? 'blockedBy' : 'blocking', issue)
          }
          tooltipLabel={isBlockedBy ? 'blocked by relationships' : 'blocking relationships'}
        />
      )
    }

    const field = editedFields.find((candidate) => fieldSectionId(candidate.fieldId) === section.id)
    if (!field) return null

    const fieldLabel = (
      <SectionLabel
        icon={getFieldIcon(field.dataType)}
        label={field.fieldName}
        tooltipFor={field.fieldName}
      />
    )

    const scalar = SCALAR_FIELD_INPUTS[field.dataType as keyof typeof SCALAR_FIELD_INPUTS]
    if (scalar) {
      return (
        <FormControl key={section.id} sx={{ width: '100%' }}>
          <SectionLabel
            as="label"
            icon={getFieldIcon(field.dataType)}
            label={field.fieldName}
            tooltipFor={field.fieldName}
          />
          <TextInput
            {...(scalar.type ? { type: scalar.type } : {})}
            block
            value={scalar.read(field)}
            onChange={(event) => updateField(field.fieldId, scalar.write(event.target.value))}
          />
        </FormControl>
      )
    }

    if (field.dataType === 'SINGLE_SELECT' && field.options) {
      return (
        <Box key={section.id} sx={{ ...sectionColumnSx, gap: 2 }}>
          {fieldLabel}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
            {field.options.map((option) => (
              <OptionChip
                key={option.id}
                selected={field.optionId === option.id}
                tooltip={getFieldOptionTooltip(field.fieldName, option.name)}
                onSelect={() =>
                  updateField(field.fieldId, {
                    optionId: option.id,
                    optionName: option.name,
                    optionColor: option.color,
                  })
                }
              >
                <Box as="span" sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Box
                    sx={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      flexShrink: 0,
                      bg: option.color ? undefined : 'border.default',
                    }}
                    style={option.color ? { backgroundColor: option.color } : undefined}
                  />
                  <Text sx={{ fontSize: 1, fontWeight: 500, color: 'fg.default' }}>
                    {option.name}
                  </Text>
                </Box>
              </OptionChip>
            ))}
          </Box>
        </Box>
      )
    }

    if (field.dataType === 'ITERATION' && field.iterations) {
      return (
        <Box key={section.id} sx={{ ...sectionColumnSx, gap: 2 }}>
          {fieldLabel}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {field.iterations.map((iteration) => (
              <OptionChip
                key={iteration.id}
                layout="row"
                selected={field.iterationId === iteration.id}
                tooltip={getFieldOptionTooltip(field.fieldName, iteration.title)}
                onSelect={() =>
                  updateField(field.fieldId, {
                    iterationId: iteration.id,
                    iterationTitle: iteration.title,
                    iterationStartDate: iteration.startDate,
                  })
                }
              >
                <Box
                  as="span"
                  sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}
                >
                  <Text sx={{ fontSize: 1, fontWeight: 'bold', color: 'fg.default' }}>
                    {iteration.title}
                  </Text>
                  <Text sx={{ fontSize: 0, color: 'fg.muted', mt: '2px' }}>
                    {iteration.startDate}
                  </Text>
                </Box>
                {field.iterationId === iteration.id && (
                  <Box sx={{ color: 'accent.fg' }}>
                    <CheckIcon size={14} />
                  </Box>
                )}
              </OptionChip>
            ))}
          </Box>
        </Box>
      )
    }

    return null
  }

  return (
    <Box
      sx={primerCss.modalOverlay()}
      onKeyDown={(event: React.KeyboardEvent) => {
        event.stopPropagation()
        if (event.key === 'Escape') onClose()
      }}
      onKeyUp={(event: React.KeyboardEvent) => event.stopPropagation()}
    >
      {/* Not ModalShell: each step renders its own header and padded body, so
          the shell's header slot + padded scroll container would double up. */}
      <Box
        sx={primerCss.modalPanel({
          width: 'min(680px, 92vw)',
          maxWidth: 'unset',
          maxHeight: '80vh',
          animation: 'fadeSlideIn 200ms cubic-bezier(0.4, 0, 0.2, 1)',
          '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
        })}
      >
        {step === 'LOADING' && (
          <>
            <ModalStepHeader
              title="Deep Duplicate"
              icon={bulkDuplicateHeaderIcon}
              subtitle="Loading item details…"
              onClose={onClose}
            />
            <Box sx={{ px: 4, py: 3, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {SKELETON_GROUPS.map((group, gi) => (
                <Box key={gi} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Box
                    sx={{ height: 10, width: group.labelWidth, borderRadius: 1, ...shimmerSx }}
                  />
                  {group.rows.map((labelPct, ri) => (
                    <Box
                      key={ri}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 3,
                        px: 3,
                        py: 2,
                        borderRadius: 2,
                        bg: 'canvas.subtle',
                      }}
                    >
                      <Box
                        sx={{ width: 16, height: 16, borderRadius: 1, flexShrink: 0, ...shimmerSx }}
                      />
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1 }}>
                        <Box
                          sx={{ height: 12, width: `${labelPct}%`, borderRadius: 1, ...shimmerSx }}
                        />
                        <Box sx={{ height: 10, width: '45%', borderRadius: 1, ...shimmerSx }} />
                      </Box>
                    </Box>
                  ))}
                </Box>
              ))}
            </Box>
          </>
        )}

        {step === 'ERROR' && (
          <>
            <ModalStepHeader
              title="Deep Duplicate"
              icon={bulkDuplicateHeaderIcon}
              subtitle="Something went wrong while loading the item."
              onClose={onClose}
            />
            <Box
              sx={{
                px: 4,
                py: 5,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <Flash variant="danger" sx={{ width: '100%' }}>
                {error || 'An error occurred.'}
              </Flash>
              <Button variant="default" onClick={onClose} sx={buttonMotionSx}>
                Close
              </Button>
            </Box>
          </>
        )}

        {step === 'SELECT' && preview && (
          <SelectSectionsStep
            sections={availableSections}
            selectedSections={selectedSections}
            onToggleSection={toggleSection}
            onSelectAll={selectAllSections}
            onDeselectAll={() => setSelectedSections([])}
            onClose={onClose}
            onNext={() => setStep('REVIEW')}
          />
        )}

        {step === 'REVIEW' && preview && (
          <ReviewStep
            sections={selectedSectionsInOrder}
            diffStatus={diffStatus}
            concurrentError={concurrentError}
            duplicateBtnRef={duplicateBtnRef}
            submitting={submitting}
            createMore={createMore}
            onToggleCreateMore={() => setCreateMore((value) => !value)}
            onClose={onClose}
            onBack={() => setStep('SELECT')}
            onDuplicate={handleDuplicate}
            renderSection={renderValueSection}
          />
        )}
      </Box>
    </Box>
  )
}
