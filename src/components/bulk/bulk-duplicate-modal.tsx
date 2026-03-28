import React, { useEffect, useMemo, useRef, useState } from 'react'
import Tippy from '../ui/tooltip'
import { Box, Button, Checkbox, Flash, FormControl, Text, TextInput } from '@primer/react'
import { sendMessage, type DuplicateItemPlan, type IssueRelationshipData, type ItemPreviewData } from '../../lib/messages'
import { queueStore } from '../../lib/queue-store'
import { flyToTracker } from './bulk-utils'
import { RepoMetadataSelectPanel, type RepoMetadataItem } from '../ui/repo-metadata-select-panel'
import { MarkdownTextarea } from '../ui/markdown-textarea'
import {
  AlertIcon,
  ArrowRightIcon,
  CalendarIcon,
  CheckIcon,
  CopyIcon,
  HashIcon,
  OptionsSelectIcon,
  PersonIcon,
  ProjectBoardIcon,
  ShieldIcon,
  SyncIcon,
  TagIcon,
  TextLineIcon,
  XIcon,
} from '../ui/primitives'
import { ModalStepHeader } from '../ui/modal-step-header'
import { Z_MODAL, Z_TOOLTIP } from '../../lib/z-index'
import { ensureTippyCss } from '../../lib/tippy-utils'

type Step = 'LOADING' | 'SELECT' | 'VALUES' | 'SUMMARY' | 'ERROR'
type EditableField = ItemPreviewData['fields'][number]
type SectionGroup = 'CONTENT' | 'METADATA' | 'PROJECT_FIELDS' | 'RELATIONSHIPS'
type SectionId =
  | 'TITLE'
  | 'BODY'
  | 'ASSIGNEES'
  | 'LABELS'
  | 'ISSUE_TYPE'
  | 'REL_PARENT'
  | 'REL_BLOCKED_BY'
  | 'REL_BLOCKING'
  | `FIELD:${string}`

interface Props {
  itemId: string
  projectId: string
  owner: string
  isOrg: boolean
  projectNumber: number
  onClose: () => void
}

interface DuplicateSection {
  id: SectionId
  label: string
  group: SectionGroup
  icon: React.ReactNode
  badge?: string
  helperText?: string
}

interface ReviewRow {
  id: SectionId
  label: string
  value: string
}

const TITLE_SECTION_ID = 'TITLE' as const
const BODY_SECTION_ID = 'BODY' as const
const ASSIGNEES_SECTION_ID = 'ASSIGNEES' as const
const LABELS_SECTION_ID = 'LABELS' as const
const ISSUE_TYPE_SECTION_ID = 'ISSUE_TYPE' as const
const PARENT_SECTION_ID = 'REL_PARENT' as const
const BLOCKED_BY_SECTION_ID = 'REL_BLOCKED_BY' as const
const BLOCKING_SECTION_ID = 'REL_BLOCKING' as const

const sectionLabel = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 2,
  fontSize: 0 as const,
  fontWeight: 'bold' as const,
  textTransform: 'uppercase' as const,
  color: 'fg.muted' as const,
  letterSpacing: '0.05em',
}

const prefixLabelIcon = {
  color: 'fg.muted' as const,
  display: 'flex' as const,
  alignItems: 'center' as const,
  flexShrink: 0 as const,
}

const buttonMotionSx = {
  boxShadow: 'none',
  transition: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
  '&:hover:not(:disabled)': { transform: 'translateY(-1px)' },
  '&:active': { transform: 'translateY(0)', transition: '100ms' },
  '@media (prefers-reduced-motion: reduce)': {
    transition: 'none',
    '&:hover:not(:disabled)': { transform: 'none' },
  },
}

const sectionGroupMeta: Record<SectionGroup, { label: string; icon: React.ReactNode }> = {
  CONTENT: {
    label: 'Content',
    icon: <TextLineIcon size={14} />,
  },
  METADATA: {
    label: 'Metadata',
    icon: <PersonIcon size={14} />,
  },
  PROJECT_FIELDS: {
    label: 'Project Fields',
    icon: <ProjectBoardIcon size={14} />,
  },
  RELATIONSHIPS: {
    label: 'Relationships',
    icon: <AlertIcon size={14} />,
  },
}

const sectionGroupOrder: SectionGroup[] = ['CONTENT', 'METADATA', 'PROJECT_FIELDS', 'RELATIONSHIPS']
const bulkDuplicateHeaderIcon = <CopyIcon size={16} />

function fieldSectionId(fieldId: string): SectionId {
  return `FIELD:${fieldId}`
}

function relationshipKey(issue: IssueRelationshipData): string {
  return issue.databaseId ? `db:${issue.databaseId}` : `${issue.repoOwner}/${issue.repoName}#${issue.number}`
}

function getFieldIcon(dataType: EditableField['dataType']): React.ReactNode {
  switch (dataType) {
    case 'TEXT':
      return <TextLineIcon size={14} />
    case 'NUMBER':
      return <HashIcon size={14} />
    case 'DATE':
      return <CalendarIcon size={14} />
    case 'SINGLE_SELECT':
      return <OptionsSelectIcon size={14} />
    case 'ITERATION':
      return <SyncIcon size={14} />
    default:
      return null
  }
}

function getFieldOptionTooltip(fieldName: string, optionName: string): string {
  return `Set ${fieldName} to ${optionName}.`
}

function duplicateValueTooltip(fieldName: string): string {
  return `Value applied to the duplicated item for ${fieldName}.`
}

function formatIssueReference(issue: IssueRelationshipData): string {
  return `${issue.repoOwner}/${issue.repoName}#${issue.number}`
}

function formatIssueSummary(issue: IssueRelationshipData): string {
  return `${formatIssueReference(issue)} — ${issue.title}`
}

function summarizeText(value: string, fallback = 'Empty'): string {
  const trimmed = value.trim()
  if (!trimmed) return fallback
  return trimmed.length > 80 ? `${trimmed.slice(0, 77)}…` : trimmed
}

function summarizeIssueList(issues: IssueRelationshipData[]): string {
  if (issues.length === 0) return 'Skipped'
  const preview = issues.slice(0, 2).map(formatIssueSummary).join('; ')
  return issues.length > 2 ? `${preview} +${issues.length - 2} more` : preview
}

function summarizeFieldValue(field: EditableField): string {
  if (field.dataType === 'TEXT') {
    return summarizeText(field.text ?? '', 'None / Cleared')
  }

  if (field.dataType === 'SINGLE_SELECT') {
    return field.optionName || 'None / Cleared'
  }

  if (field.dataType === 'ITERATION') {
    return field.iterationTitle || 'None / Cleared'
  }

  if (field.dataType === 'NUMBER') {
    return field.number === undefined || field.number === null ? 'None / Cleared' : String(field.number)
  }

  if (field.dataType === 'DATE') {
    if (!field.date) return 'None / Cleared'
    const parsed = new Date(`${field.date}T00:00:00`)
    return Number.isNaN(parsed.getTime())
      ? field.date
      : parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  }

  return 'None / Cleared'
}

function buildFieldValue(field: EditableField): Record<string, unknown> {
  if (field.dataType === 'TEXT') return { text: field.text ?? '' }
  if (field.dataType === 'SINGLE_SELECT') return field.optionId ? { singleSelectOptionId: field.optionId } : {}
  if (field.dataType === 'ITERATION') return field.iterationId ? { iterationId: field.iterationId } : {}
  if (field.dataType === 'NUMBER') return field.number === undefined || field.number === null ? {} : { number: field.number }
  if (field.dataType === 'DATE') return field.date ? { date: field.date } : {}
  return {}
}

function SelectSectionsStep({
  sections,
  selectedSections,
  onToggleSection,
  onSelectAll,
  onDeselectAll,
  onClose,
  onNext,
}: {
  sections: DuplicateSection[]
  selectedSections: SectionId[]
  onToggleSection: (sectionId: SectionId) => void
  onSelectAll: () => void
  onDeselectAll: () => void
  onClose: () => void
  onNext: () => void
}) {
  const allSelected = sections.length > 0 && sections.every(section => selectedSections.includes(section.id))

  return (
    <>
      <ModalStepHeader
        title="Select Sections"
        icon={bulkDuplicateHeaderIcon}
        subtitle="Choose which details to carry over to the duplicated item."
        step={1}
        totalSteps={3}
        onClose={onClose}
      />
      <Box sx={{ px: 4, pt: 2, pb: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 3 }}>
        <Button variant="invisible" size="small" onClick={allSelected ? onDeselectAll : onSelectAll} sx={{ p: 0, color: 'accent.fg', fontSize: 1, fontWeight: 'bold', ...buttonMotionSx }}>
          {allSelected ? 'Deselect all' : 'Select all'}
        </Button>
        <Text sx={{ fontSize: 0, color: 'fg.muted', textAlign: 'right' }}>
          If Title is skipped, the duplicate falls back to the original title.
        </Text>
      </Box>
      <Box sx={{ flex: 1, overflowY: 'auto', px: 4, py: 2, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {sectionGroupOrder.map(group => {
          const groupSections = sections.filter(section => section.group === group)
          if (groupSections.length === 0) return null

          return (
            <Box key={group} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Text sx={sectionLabel}>
                <Box as="span" sx={prefixLabelIcon}>{sectionGroupMeta[group].icon}</Box>
                {sectionGroupMeta[group].label}
              </Text>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {groupSections.map(section => {
                  const isSelected = selectedSections.includes(section.id)
                  return (
                    <Box
                      key={section.id}
                      as="button"
                      type="button"
                      onClick={() => onToggleSection(section.id)}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 3,
                        width: '100%',
                        textAlign: 'left',
                        border: 'none',
                        borderRadius: 2,
                        bg: isSelected ? 'accent.subtle' : 'transparent',
                        px: 3,
                        py: 2,
                        cursor: 'pointer',
                        transition: 'background-color 150ms ease',
                        ':hover': { bg: isSelected ? 'accent.subtle' : 'canvas.subtle' },
                        '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
                      }}
                    >
                      <Checkbox checked={isSelected} onChange={() => {}} sx={{ pointerEvents: 'none' }} />
                      <Box as="span" sx={{ display: 'flex', alignItems: 'center', gap: 3, flex: 1, minWidth: 0 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0, color: isSelected ? 'accent.fg' : 'fg.default' }}>
                          {section.icon}
                        </Box>
                        <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                          <Text sx={{ fontSize: 1, fontWeight: 'bold', color: isSelected ? 'accent.fg' : 'fg.default' }}>
                            {section.label}
                          </Text>
                          {section.helperText && (
                            <Text sx={{ fontSize: 0, color: 'fg.muted' }}>{section.helperText}</Text>
                          )}
                        </Box>
                      </Box>
                      {section.badge && (
                        <Text sx={{ fontSize: 0, px: 1, py: '2px', bg: 'neutral.muted', color: 'fg.muted', borderRadius: 2, flexShrink: 0 }}>
                          {section.badge}
                        </Text>
                      )}
                    </Box>
                  )
                })}
              </Box>
            </Box>
          )
        })}
      </Box>
      <Box sx={{ px: 4, py: 3, borderTop: '1px solid', borderColor: 'border.default', display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="primary" onClick={onNext} sx={buttonMotionSx}>
          Next: Edit Values →
        </Button>
      </Box>
    </>
  )
}

function RelationshipListEditor({
  label,
  icon,
  description,
  issues,
  onRemoveIssue,
  tooltipLabel,
}: {
  label: string
  icon: React.ReactNode
  description: string
  issues: IssueRelationshipData[]
  onRemoveIssue: (issue: IssueRelationshipData) => void
  tooltipLabel: string
}) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, width: '100%' }}>
      <Tippy content={duplicateValueTooltip(tooltipLabel)} delay={[400, 0]} placement="top" zIndex={Z_TOOLTIP}>
        <Text sx={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 1, fontWeight: 'bold', color: 'fg.default', width: 'fit-content', cursor: 'help' }}>
          <Box as="span" sx={prefixLabelIcon}>{icon}</Box>
          {label}
        </Text>
      </Tippy>
      <Text sx={{ fontSize: 0, color: 'fg.muted' }}>{description}</Text>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {issues.map(issue => (
          <Box
            key={relationshipKey(issue)}
            sx={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 3,
              px: 3,
              py: 2,
              border: '1px solid',
              borderColor: 'border.default',
              borderRadius: 2,
              bg: 'canvas.default',
            }}
          >
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, flex: 1 }}>
              <Text sx={{ fontSize: 1, fontWeight: 'bold', color: 'fg.default' }}>{issue.title}</Text>
              <Text sx={{ fontSize: 0, color: 'fg.muted' }}>{formatIssueReference(issue)}</Text>
            </Box>
            <Button
              variant="invisible"
              size="small"
              aria-label={`Remove ${formatIssueReference(issue)} from ${label}`}
              onClick={() => onRemoveIssue(issue)}
              sx={{ p: '4px', minWidth: 'unset', color: 'fg.muted', ...buttonMotionSx }}
            >
              <XIcon size={14} />
            </Button>
          </Box>
        ))}
      </Box>
    </Box>
  )
}

function ValuesStep({
  sections,
  onClose,
  onBack,
  onNext,
  renderSection,
}: {
  sections: DuplicateSection[]
  onClose: () => void
  onBack: () => void
  onNext: () => void
  renderSection: (section: DuplicateSection) => React.ReactNode
}) {
  return (
    <>
      <ModalStepHeader
        title="Edit Values"
        icon={bulkDuplicateHeaderIcon}
        subtitle="Adjust the sections that will be copied to the duplicated item."
        step={2}
        totalSteps={3}
        onBack={onBack}
        onClose={onClose}
      />
      <Box sx={{ flex: 1, overflowY: 'auto', px: 4, py: 3, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {sections.length === 0 ? (
          <Box sx={{ py: 6, textAlign: 'center', color: 'fg.muted', fontSize: 1 }}>
            No sections selected. The duplicate will use the original title only.
          </Box>
        ) : (
          sectionGroupOrder.map(group => {
            const groupSections = sections.filter(section => section.group === group)
            if (groupSections.length === 0) return null

            return (
              <Box key={group} sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <Text sx={sectionLabel}>
                  <Box as="span" sx={prefixLabelIcon}>{sectionGroupMeta[group].icon}</Box>
                  {sectionGroupMeta[group].label}
                </Text>
                {groupSections.map(renderSection)}
              </Box>
            )
          })
        )}
      </Box>
      <Box sx={{ px: 4, py: 3, borderTop: '1px solid', borderColor: 'border.default', display: 'flex', justifyContent: 'space-between' }}>
        <Button variant="default" onClick={onBack} sx={buttonMotionSx}>← Back</Button>
        <Button variant="primary" onClick={onNext} sx={buttonMotionSx}>Review Duplicate →</Button>
      </Box>
    </>
  )
}

function ReviewStep({
  rows,
  concurrentError,
  duplicateBtnRef,
  onClose,
  onBack,
  onDuplicate,
}: {
  rows: ReviewRow[]
  concurrentError: boolean
  duplicateBtnRef: React.RefObject<HTMLButtonElement | null>
  onClose: () => void
  onBack: () => void
  onDuplicate: () => void
}) {
  return (
    <>
      <ModalStepHeader
        title="Review & Duplicate"
        icon={bulkDuplicateHeaderIcon}
        subtitle="Confirm the sections below before creating the duplicate."
        step={3}
        totalSteps={3}
        onBack={onBack}
        onClose={onClose}
      />
      <Box sx={{ flex: 1, overflowY: 'auto', px: 4, py: 3 }}>
        <Box sx={{ bg: 'canvas.subtle', border: '1px solid', borderColor: 'border.default', borderRadius: 2, overflow: 'hidden' }}>
          {rows.map((row, index) => (
            <Box
              key={row.id}
              sx={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 3,
                px: 3,
                py: 3,
                borderBottom: index < rows.length - 1 ? '1px solid' : 'none',
                borderColor: 'border.default',
              }}
            >
              <Text sx={{ flex: 1, color: 'fg.muted', fontSize: 1, fontWeight: 500 }}>{row.label}</Text>
              <Text sx={{ flex: 1.5, color: 'fg.default', fontSize: 1, fontWeight: 'bold', textAlign: 'right', wordBreak: 'break-word' }}>
                {row.value}
              </Text>
            </Box>
          ))}
        </Box>
      </Box>
      <Box sx={{ px: 4, py: 3, borderTop: '1px solid', borderColor: 'border.default', display: 'flex', flexDirection: 'column', gap: 3 }}>
        {concurrentError && (
          <Flash variant="warning">
            3 duplications are already in progress. Wait for one to finish before starting another.
          </Flash>
        )}
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Button variant="default" onClick={onBack} sx={buttonMotionSx}>← Back</Button>
          <Button ref={duplicateBtnRef} variant="primary" onClick={onDuplicate} sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, ...buttonMotionSx }}>
            <CopyIcon size={14} />
            Duplicate Item →
          </Button>
        </Box>
      </Box>
    </>
  )
}

export function BulkDuplicateModal({ itemId, projectId, owner, isOrg, projectNumber, onClose }: Props) {
  const [step, setStep] = useState<Step>('LOADING')
  const [preview, setPreview] = useState<ItemPreviewData | null>(null)
  const [error, setError] = useState('')
  const [concurrentError, setConcurrentError] = useState(false)
  const duplicateBtnRef = useRef<HTMLButtonElement | null>(null)

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

  useEffect(() => {
    sendMessage('getItemPreview', { itemId, owner, number: projectNumber, isOrg })
      .then(data => {
        setPreview(data)
        setEditedTitle(data.title)
        setEditedBody(data.body)
        setEditedAssignees(data.assignees.map(assignee => ({ id: assignee.id, name: assignee.login, avatarUrl: assignee.avatarUrl })))
        setEditedLabels(data.labels)
        setEditedFields(data.fields)
        setBlockedByRelationships(data.relationships.blockedBy)
        setBlockingRelationships(data.relationships.blocking)
        setSelectedSections([
          TITLE_SECTION_ID,
          BODY_SECTION_ID,
          ASSIGNEES_SECTION_ID,
          LABELS_SECTION_ID,
          ...(data.issueTypeName ? [ISSUE_TYPE_SECTION_ID] : []),
          ...data.fields.map(field => fieldSectionId(field.fieldId)),
          ...(data.relationships.parent ? [PARENT_SECTION_ID] : []),
          ...(data.relationships.blockedBy.length > 0 ? [BLOCKED_BY_SECTION_ID] : []),
          ...(data.relationships.blocking.length > 0 ? [BLOCKING_SECTION_ID] : []),
        ])
        setStep('SELECT')
      })
      .catch((cause: Error) => {
        console.error('[rgp] getItemPreview failed', cause)
        setError(cause.message || 'Failed to load item details')
        setStep('ERROR')
      })
  }, [isOrg, itemId, owner, projectNumber])

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
        ? [{
            id: ISSUE_TYPE_SECTION_ID,
            label: 'Issue Type',
            group: 'METADATA',
            icon: <ShieldIcon size={14} />,
            badge: preview.issueTypeName,
          } satisfies DuplicateSection]
        : []),
      ...preview.fields.map(field => ({
        id: fieldSectionId(field.fieldId),
        label: field.fieldName,
        group: 'PROJECT_FIELDS' as const,
        icon: getFieldIcon(field.dataType) ?? <ProjectBoardIcon size={14} />,
        badge: field.dataType.toLowerCase(),
      })),
      ...(preview.relationships.parent
        ? [{
            id: PARENT_SECTION_ID,
            label: 'Parent',
            group: 'RELATIONSHIPS',
            icon: <ProjectBoardIcon size={14} />,
            badge: formatIssueReference(preview.relationships.parent),
          } satisfies DuplicateSection]
        : []),
      ...(preview.relationships.blockedBy.length > 0
        ? [{
            id: BLOCKED_BY_SECTION_ID,
            label: 'Blocked by',
            group: 'RELATIONSHIPS',
            icon: <AlertIcon size={14} />,
            badge: `${preview.relationships.blockedBy.length} issue${preview.relationships.blockedBy.length !== 1 ? 's' : ''}`,
          } satisfies DuplicateSection]
        : []),
      ...(preview.relationships.blocking.length > 0
        ? [{
            id: BLOCKING_SECTION_ID,
            label: 'Blocking',
            group: 'RELATIONSHIPS',
            icon: <ArrowRightIcon size={14} />,
            badge: `${preview.relationships.blocking.length} issue${preview.relationships.blocking.length !== 1 ? 's' : ''}`,
          } satisfies DuplicateSection]
        : []),
    ]
  }, [preview])

  const selectedSectionsInOrder = availableSections.filter(section => selectedSections.includes(section.id))
  const repoOwner = preview?.repoOwner || owner
  const repoName = preview?.repoName || ''

  function isSectionSelected(sectionId: SectionId): boolean {
    return selectedSections.includes(sectionId)
  }

  function updateField(fieldId: string, patch: Partial<EditableField>) {
    setEditedFields(previous => previous.map(field => field.fieldId === fieldId ? { ...field, ...patch } : field))
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
      setSelectedSections(previous => previous.filter(id => id !== sectionId))
      return
    }

    restoreSection(sectionId)
    setSelectedSections(previous => [...previous, sectionId])
  }

  function dismissSection(sectionId: SectionId) {
    setSelectedSections(previous => previous.filter(id => id !== sectionId))
  }

  function selectAllSections() {
    availableSections.forEach(section => {
      if (!selectedSections.includes(section.id)) {
        restoreSection(section.id)
      }
    })
    setSelectedSections(availableSections.map(section => section.id))
  }

  function removeRelationship(kind: 'blockedBy' | 'blocking', issue: IssueRelationshipData) {
    if (kind === 'blockedBy') {
      const next = blockedByRelationships.filter(candidate => relationshipKey(candidate) !== relationshipKey(issue))
      setBlockedByRelationships(next)
      if (next.length === 0) dismissSection(BLOCKED_BY_SECTION_ID)
      return
    }

    const next = blockingRelationships.filter(candidate => relationshipKey(candidate) !== relationshipKey(issue))
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
        ids: editedAssignees.map(assignee => assignee.id),
      },
      labels: {
        enabled: isSectionSelected(LABELS_SECTION_ID),
        ids: editedLabels.map(label => label.id),
      },
      issueType: {
        enabled: isSectionSelected(ISSUE_TYPE_SECTION_ID),
        id: preview?.issueTypeId,
        name: preview?.issueTypeName,
      },
      fieldValues: editedFields.map(field => ({
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

  function buildReviewRows(): ReviewRow[] {
    return availableSections.map(section => {
      if (section.id === TITLE_SECTION_ID) {
        return {
          id: section.id,
          label: section.label,
          value: isSectionSelected(section.id) ? summarizeText(editedTitle, 'Empty title') : 'Original title (fallback)',
        }
      }

      if (section.id === BODY_SECTION_ID) {
        return {
          id: section.id,
          label: section.label,
          value: isSectionSelected(section.id) ? summarizeText(editedBody, 'Empty') : 'Skipped',
        }
      }

      if (section.id === ASSIGNEES_SECTION_ID) {
        return {
          id: section.id,
          label: section.label,
          value: isSectionSelected(section.id)
            ? (editedAssignees.length > 0 ? editedAssignees.map(assignee => assignee.name).join(', ') : 'None / Cleared')
            : 'Skipped',
        }
      }

      if (section.id === LABELS_SECTION_ID) {
        return {
          id: section.id,
          label: section.label,
          value: isSectionSelected(section.id)
            ? (editedLabels.length > 0 ? editedLabels.map(label => label.name).join(', ') : 'None / Cleared')
            : 'Skipped',
        }
      }

      if (section.id === ISSUE_TYPE_SECTION_ID) {
        return {
          id: section.id,
          label: section.label,
          value: isSectionSelected(section.id) ? (preview?.issueTypeName || 'None / Cleared') : 'Skipped',
        }
      }

      if (section.id === PARENT_SECTION_ID) {
        return {
          id: section.id,
          label: 'Parent relationship',
          value: isSectionSelected(section.id) && preview?.relationships.parent
            ? formatIssueSummary(preview.relationships.parent)
            : 'Skipped',
        }
      }

      if (section.id === BLOCKED_BY_SECTION_ID) {
        return {
          id: section.id,
          label: section.label,
          value: isSectionSelected(section.id) ? summarizeIssueList(blockedByRelationships) : 'Skipped',
        }
      }

      if (section.id === BLOCKING_SECTION_ID) {
        return {
          id: section.id,
          label: section.label,
          value: isSectionSelected(section.id) ? summarizeIssueList(blockingRelationships) : 'Skipped',
        }
      }

      const field = editedFields.find(candidate => fieldSectionId(candidate.fieldId) === section.id)
      return {
        id: section.id,
        label: section.label,
        value: field && isSectionSelected(section.id) ? summarizeFieldValue(field) : 'Skipped',
      }
    })
  }

  async function handleDuplicate() {
    if (!preview) return
    if (queueStore.getActiveCount() >= 3) {
      setConcurrentError(true)
      return
    }

    setConcurrentError(false)
    const rect = duplicateBtnRef.current?.getBoundingClientRect()
    if (rect) flyToTracker(rect)

    await sendMessage('duplicateItem', {
      itemId: preview.resolvedItemId || itemId,
      projectId: preview.projectId || projectId,
      plan: buildDuplicatePlan(),
    })

    onClose()
  }

  function renderValueSection(section: DuplicateSection): React.ReactNode {
    if (!preview) return null

    if (section.id === TITLE_SECTION_ID) {
      return (
        <FormControl key={section.id} sx={{ width: '100%' }}>
          <FormControl.Label sx={{ display: 'flex', alignItems: 'center', gap: 2, fontWeight: 'bold', width: 'fit-content', cursor: 'help' }}>
            <Tippy content={duplicateValueTooltip('title')} delay={[400, 0]} placement="top" zIndex={Z_TOOLTIP}>
              <Box as="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                <Box sx={prefixLabelIcon}><TextLineIcon size={14} /></Box>
                Title
              </Box>
            </Tippy>
          </FormControl.Label>
          <TextInput block value={editedTitle} onChange={event => setEditedTitle(event.target.value)} />
        </FormControl>
      )
    }

    if (section.id === BODY_SECTION_ID) {
      return (
        <FormControl key={section.id} sx={{ width: '100%' }}>
          <FormControl.Label sx={{ display: 'flex', alignItems: 'center', gap: 2, fontWeight: 'bold', width: 'fit-content', cursor: 'help' }}>
            <Tippy content={duplicateValueTooltip('description')} delay={[400, 0]} placement="top" zIndex={Z_TOOLTIP}>
              <Box as="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                <Box sx={prefixLabelIcon}><TextLineIcon size={14} /></Box>
                Description
              </Box>
            </Tippy>
          </FormControl.Label>
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

    if (section.id === ASSIGNEES_SECTION_ID) {
      return (
        <Box key={section.id} sx={{ display: 'flex', flexDirection: 'column', gap: 1, width: '100%' }}>
          <Tippy content={duplicateValueTooltip('assignees')} delay={[400, 0]} placement="top" zIndex={Z_TOOLTIP}>
            <Text sx={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 1, fontWeight: 'bold', color: 'fg.default', width: 'fit-content', cursor: 'help' }}>
              <Box as="span" sx={prefixLabelIcon}><PersonIcon size={14} /></Box>
              Assignees
            </Text>
          </Tippy>
          <Box sx={{ width: '100%' }}>
            <RepoMetadataSelectPanel
              type="ASSIGNEES"
              owner={repoOwner}
              repoName={repoName}
              value={editedAssignees}
              onChange={setEditedAssignees}
              placeholder="Select assignees"
            />
          </Box>
        </Box>
      )
    }

    if (section.id === LABELS_SECTION_ID) {
      return (
        <Box key={section.id} sx={{ display: 'flex', flexDirection: 'column', gap: 1, width: '100%' }}>
          <Tippy content={duplicateValueTooltip('labels')} delay={[400, 0]} placement="top" zIndex={Z_TOOLTIP}>
            <Text sx={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 1, fontWeight: 'bold', color: 'fg.default', width: 'fit-content', cursor: 'help' }}>
              <Box as="span" sx={prefixLabelIcon}><TagIcon size={14} /></Box>
              Labels
            </Text>
          </Tippy>
          <Box sx={{ width: '100%' }}>
            <RepoMetadataSelectPanel
              type="LABELS"
              owner={repoOwner}
              repoName={repoName}
              value={editedLabels}
              onChange={setEditedLabels}
              placeholder="Select labels"
            />
          </Box>
        </Box>
      )
    }

    if (section.id === ISSUE_TYPE_SECTION_ID) {
      return (
        <Box key={section.id} sx={{ display: 'flex', flexDirection: 'column', gap: 1, width: '100%' }}>
          <Tippy content={duplicateValueTooltip('issue type')} delay={[400, 0]} placement="top" zIndex={Z_TOOLTIP}>
            <Text sx={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 1, fontWeight: 'bold', color: 'fg.default', width: 'fit-content', cursor: 'help' }}>
              <Box as="span" sx={prefixLabelIcon}><ShieldIcon size={14} /></Box>
              Issue Type
            </Text>
          </Tippy>
          <Text sx={{ fontSize: 1, color: 'fg.default' }}>{preview.issueTypeName}</Text>
        </Box>
      )
    }

    if (section.id === PARENT_SECTION_ID && preview.relationships.parent) {
      return (
        <Box key={section.id} sx={{ display: 'flex', flexDirection: 'column', gap: 2, width: '100%' }}>
          <Tippy content={duplicateValueTooltip('parent relationship')} delay={[400, 0]} placement="top" zIndex={Z_TOOLTIP}>
            <Text sx={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 1, fontWeight: 'bold', color: 'fg.default', width: 'fit-content', cursor: 'help' }}>
              <Box as="span" sx={prefixLabelIcon}><ProjectBoardIcon size={14} /></Box>
              Parent
            </Text>
          </Tippy>
          <Text sx={{ fontSize: 0, color: 'fg.muted' }}>The duplicate will be linked as a sub-issue of this parent.</Text>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 3, px: 3, py: 2, border: '1px solid', borderColor: 'border.default', borderRadius: 2, bg: 'canvas.default' }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, flex: 1 }}>
              <Text sx={{ fontSize: 1, fontWeight: 'bold', color: 'fg.default' }}>{preview.relationships.parent.title}</Text>
              <Text sx={{ fontSize: 0, color: 'fg.muted' }}>{formatIssueReference(preview.relationships.parent)}</Text>
            </Box>
            <Button
              variant="invisible"
              size="small"
              aria-label="Remove parent relationship"
              onClick={() => dismissSection(PARENT_SECTION_ID)}
              sx={{ p: '4px', minWidth: 'unset', color: 'fg.muted', ...buttonMotionSx }}
            >
              <XIcon size={14} />
            </Button>
          </Box>
        </Box>
      )
    }

    if (section.id === BLOCKED_BY_SECTION_ID) {
      return (
        <RelationshipListEditor
          key={section.id}
          label="Blocked by"
          icon={<AlertIcon size={14} />}
          description="These issues will continue to block the duplicate. Remove any relationship you do not want to copy."
          issues={blockedByRelationships}
          onRemoveIssue={issue => removeRelationship('blockedBy', issue)}
          tooltipLabel="blocked by relationships"
        />
      )
    }

    if (section.id === BLOCKING_SECTION_ID) {
      return (
        <RelationshipListEditor
          key={section.id}
          label="Blocking"
          icon={<ArrowRightIcon size={14} />}
          description="These issues will continue to be blocked by the duplicate. Remove any relationship you do not want to copy."
          issues={blockingRelationships}
          onRemoveIssue={issue => removeRelationship('blocking', issue)}
          tooltipLabel="blocking relationships"
        />
      )
    }

    const field = editedFields.find(candidate => fieldSectionId(candidate.fieldId) === section.id)
    if (!field) return null

    if (field.dataType === 'TEXT') {
      return (
        <FormControl key={section.id} sx={{ width: '100%' }}>
          <FormControl.Label sx={{ display: 'flex', alignItems: 'center', gap: 2, fontWeight: 'bold', width: 'fit-content', cursor: 'help' }}>
            <Tippy content={duplicateValueTooltip(field.fieldName)} delay={[400, 0]} placement="top" zIndex={Z_TOOLTIP}>
              <Box as="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                {getFieldIcon(field.dataType) && <Box sx={prefixLabelIcon}>{getFieldIcon(field.dataType)}</Box>}
                {field.fieldName}
              </Box>
            </Tippy>
          </FormControl.Label>
          <TextInput block value={field.text ?? ''} onChange={event => updateField(field.fieldId, { text: event.target.value })} />
        </FormControl>
      )
    }

    if (field.dataType === 'SINGLE_SELECT' && field.options) {
      return (
        <Box key={section.id} sx={{ display: 'flex', flexDirection: 'column', gap: 1, width: '100%' }}>
          <Tippy content={duplicateValueTooltip(field.fieldName)} delay={[400, 0]} placement="top" zIndex={Z_TOOLTIP}>
            <Text sx={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 1, fontWeight: 'bold', color: 'fg.default', width: 'fit-content', cursor: 'help' }}>
              {getFieldIcon(field.dataType) && <Box as="span" sx={prefixLabelIcon}>{getFieldIcon(field.dataType)}</Box>}
              {field.fieldName}
            </Text>
          </Tippy>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
            {field.options.map(option => {
              const isSelected = field.optionId === option.id
              return (
                <Tippy key={option.id} content={getFieldOptionTooltip(field.fieldName, option.name)} delay={[400, 0]} placement="top" zIndex={Z_TOOLTIP}>
                  <Box
                    as="button"
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => updateField(field.fieldId, { optionId: option.id, optionName: option.name, optionColor: option.color })}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 2,
                      px: 3,
                      py: 1,
                      border: '1px solid',
                      borderColor: isSelected ? 'accent.emphasis' : 'border.default',
                      borderRadius: 2,
                      bg: isSelected ? 'accent.subtle' : 'canvas.default',
                      cursor: 'pointer',
                      transition: 'all 150ms ease',
                      '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
                    }}
                  >
                    <Box as="span" sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Box sx={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, bg: option.color ? undefined : 'border.default' }} style={option.color ? { backgroundColor: option.color } : undefined} />
                      <Text sx={{ fontSize: 1, fontWeight: 500, color: 'fg.default' }}>{option.name}</Text>
                    </Box>
                  </Box>
                </Tippy>
              )
            })}
          </Box>
        </Box>
      )
    }

    if (field.dataType === 'NUMBER') {
      return (
        <FormControl key={section.id} sx={{ width: '100%' }}>
          <FormControl.Label sx={{ display: 'flex', alignItems: 'center', gap: 2, fontWeight: 'bold', width: 'fit-content', cursor: 'help' }}>
            <Tippy content={duplicateValueTooltip(field.fieldName)} delay={[400, 0]} placement="top" zIndex={Z_TOOLTIP}>
              <Box as="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                {getFieldIcon(field.dataType) && <Box sx={prefixLabelIcon}>{getFieldIcon(field.dataType)}</Box>}
                {field.fieldName}
              </Box>
            </Tippy>
          </FormControl.Label>
          <TextInput
            type="number"
            block
            value={String(field.number ?? '')}
            onChange={event => {
              const parsed = parseFloat(event.target.value)
              updateField(field.fieldId, { number: Number.isFinite(parsed) ? parsed : undefined })
            }}
          />
        </FormControl>
      )
    }

    if (field.dataType === 'DATE') {
      return (
        <FormControl key={section.id} sx={{ width: '100%' }}>
          <FormControl.Label sx={{ display: 'flex', alignItems: 'center', gap: 2, fontWeight: 'bold', width: 'fit-content', cursor: 'help' }}>
            <Tippy content={duplicateValueTooltip(field.fieldName)} delay={[400, 0]} placement="top" zIndex={Z_TOOLTIP}>
              <Box as="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                {getFieldIcon(field.dataType) && <Box sx={prefixLabelIcon}>{getFieldIcon(field.dataType)}</Box>}
                {field.fieldName}
              </Box>
            </Tippy>
          </FormControl.Label>
          <TextInput type="date" block value={field.date ?? ''} onChange={event => updateField(field.fieldId, { date: event.target.value })} />
        </FormControl>
      )
    }

    if (field.dataType === 'ITERATION' && field.iterations) {
      return (
        <Box key={section.id} sx={{ display: 'flex', flexDirection: 'column', gap: 1, width: '100%' }}>
          <Tippy content={duplicateValueTooltip(field.fieldName)} delay={[400, 0]} placement="top" zIndex={Z_TOOLTIP}>
            <Text sx={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 1, fontWeight: 'bold', color: 'fg.default', width: 'fit-content', cursor: 'help' }}>
              {getFieldIcon(field.dataType) && <Box as="span" sx={prefixLabelIcon}>{getFieldIcon(field.dataType)}</Box>}
              {field.fieldName}
            </Text>
          </Tippy>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {field.iterations.map(iteration => {
              const isSelected = field.iterationId === iteration.id
              return (
                <Tippy key={iteration.id} content={getFieldOptionTooltip(field.fieldName, iteration.title)} delay={[400, 0]} placement="top" zIndex={Z_TOOLTIP}>
                  <Box
                    as="button"
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => updateField(field.fieldId, { iterationId: iteration.id, iterationTitle: iteration.title, iterationStartDate: iteration.startDate })}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      px: 3,
                      py: 2,
                      border: '1px solid',
                      borderColor: isSelected ? 'accent.emphasis' : 'border.default',
                      borderRadius: 2,
                      bg: isSelected ? 'accent.subtle' : 'canvas.default',
                      cursor: 'pointer',
                      transition: 'all 150ms ease',
                      '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
                    }}
                  >
                    <Box as="span" sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                      <Text sx={{ fontSize: 1, fontWeight: 'bold', color: 'fg.default' }}>{iteration.title}</Text>
                      <Text sx={{ fontSize: 0, color: 'fg.muted', mt: '2px' }}>{iteration.startDate}</Text>
                    </Box>
                    {isSelected && (
                      <Box sx={{ color: 'accent.fg' }}>
                        <CheckIcon size={14} />
                      </Box>
                    )}
                  </Box>
                </Tippy>
              )
            })}
          </Box>
        </Box>
      )
    }

    return null
  }

  const reviewRows = buildReviewRows()

  return (
    <Box
      sx={{
        position: 'fixed',
        inset: 0,
        bg: 'rgba(27,31,36,0.5)',
        zIndex: Z_MODAL,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onKeyDown={(event: React.KeyboardEvent) => {
        event.stopPropagation()
        if (event.key === 'Escape') onClose()
      }}
      onKeyUp={(event: React.KeyboardEvent) => event.stopPropagation()}
    >
      <Box sx={{
        bg: 'canvas.overlay',
        border: '1px solid',
        borderColor: 'border.default',
        borderRadius: 2,
        width: 'min(680px, 92vw)',
        maxHeight: '80vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: 'none',
        animation: 'fadeSlideIn 200ms cubic-bezier(0.4, 0, 0.2, 1)',
        '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
      }}>
        {step === 'LOADING' && (
          <>
            <ModalStepHeader title="Deep Duplicate" icon={bulkDuplicateHeaderIcon} subtitle="Loading item details…" onClose={onClose} />
            <Box sx={{ px: 4, py: 3, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {([
                { labelWidth: 60, rows: [80, 65] },
                { labelWidth: 70, rows: [75, 55] },
                { labelWidth: 90, rows: [70] },
              ] as { labelWidth: number; rows: number[] }[]).map((group, gi) => (
                <Box key={gi} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Box sx={{
                    height: 10, width: group.labelWidth, borderRadius: 1,
                    ...(gi === 0 ? {
                      '@keyframes rgp-shimmer': {
                        '0%': { backgroundPosition: '-200px 0' },
                        '100%': { backgroundPosition: '200px 0' },
                      },
                    } : {}),
                    background: 'linear-gradient(90deg, var(--color-border-muted) 25%, var(--color-border-default) 50%, var(--color-border-muted) 75%)',
                    backgroundSize: '400px 100%',
                    animation: 'rgp-shimmer 1.4s ease infinite',
                    '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
                  }} />
                  {group.rows.map((labelPct, ri) => (
                    <Box key={ri} sx={{ display: 'flex', alignItems: 'center', gap: 3, px: 3, py: 2, borderRadius: 2, bg: 'canvas.subtle' }}>
                      <Box sx={{ width: 16, height: 16, borderRadius: 1, flexShrink: 0, background: 'linear-gradient(90deg, var(--color-border-muted) 25%, var(--color-border-default) 50%, var(--color-border-muted) 75%)', backgroundSize: '400px 100%', animation: 'rgp-shimmer 1.4s ease infinite', '@media (prefers-reduced-motion: reduce)': { animation: 'none' } }} />
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1 }}>
                        <Box sx={{ height: 12, width: `${labelPct}%`, borderRadius: 1, background: 'linear-gradient(90deg, var(--color-border-muted) 25%, var(--color-border-default) 50%, var(--color-border-muted) 75%)', backgroundSize: '400px 100%', animation: 'rgp-shimmer 1.4s ease infinite', '@media (prefers-reduced-motion: reduce)': { animation: 'none' } }} />
                        <Box sx={{ height: 10, width: '45%', borderRadius: 1, background: 'linear-gradient(90deg, var(--color-border-muted) 25%, var(--color-border-default) 50%, var(--color-border-muted) 75%)', backgroundSize: '400px 100%', animation: 'rgp-shimmer 1.4s ease infinite', '@media (prefers-reduced-motion: reduce)': { animation: 'none' } }} />
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
            <ModalStepHeader title="Deep Duplicate" icon={bulkDuplicateHeaderIcon} subtitle="Something went wrong while loading the item." onClose={onClose} />
            <Box sx={{ px: 4, py: 5, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <Flash variant="danger" sx={{ width: '100%' }}>
                {error || 'An error occurred.'}
              </Flash>
              <Button variant="default" onClick={onClose} sx={buttonMotionSx}>Close</Button>
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
            onNext={() => setStep('VALUES')}
          />
        )}

        {step === 'VALUES' && preview && (
          <ValuesStep
            sections={selectedSectionsInOrder}
            onClose={onClose}
            onBack={() => setStep('SELECT')}
            onNext={() => setStep('SUMMARY')}
            renderSection={renderValueSection}
          />
        )}

        {step === 'SUMMARY' && preview && (
          <ReviewStep
            rows={reviewRows}
            concurrentError={concurrentError}
            duplicateBtnRef={duplicateBtnRef}
            onClose={onClose}
            onBack={() => setStep('VALUES')}
            onDuplicate={handleDuplicate}
          />
        )}
      </Box>
    </Box>
  )
}
