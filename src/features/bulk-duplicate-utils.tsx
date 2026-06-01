// types, constants, and pure helpers for the bulk-duplicate modal.

import React from 'react'
import type { IssueRelationshipData, ItemPreviewData } from '@/lib/messages'
import { primerCss } from '@/lib/primer-css-helper'
import {
  AlertIcon,
  CalendarIcon,
  CopyIcon,
  HashIcon,
  OptionsSelectIcon,
  PersonIcon,
  ProjectBoardIcon,
  SyncIcon,
  TextLineIcon,
} from '@/ui/icons'
import { formatIssueReference } from '@/lib/relationship-utils'

/**
 * §11.2 — three-stage state machine collapsed to two:
 *   - `SELECT` picks sections,
 *   - `REVIEW` renders each selected section with its inline editor + a diff
 *     badge so the user edits and confirms in the same step.
 *
 * The legacy `VALUES` / `SUMMARY` constants are retained as aliases so existing
 * snapshot/log strings keep matching during the transition; they will resolve
 * to `REVIEW` in practice.
 */
export type Step = 'LOADING' | 'SELECT' | 'REVIEW' | 'ERROR'
export type EditableField = ItemPreviewData['fields'][number]
export type SectionGroup = 'CONTENT' | 'METADATA' | 'PROJECT_FIELDS' | 'RELATIONSHIPS'
export type SectionId =
  | 'TITLE'
  | 'BODY'
  | 'ASSIGNEES'
  | 'LABELS'
  | 'ISSUE_TYPE'
  | 'REL_PARENT'
  | 'REL_BLOCKED_BY'
  | 'REL_BLOCKING'
  | `FIELD:${string}`

export interface DuplicateSection {
  id: SectionId
  label: string
  group: SectionGroup
  icon: React.ReactNode
  badge?: string
  helperText?: string
}

export interface ReviewRow {
  id: SectionId
  label: string
  value: string
}

export const TITLE_SECTION_ID = 'TITLE' as const
export const BODY_SECTION_ID = 'BODY' as const
export const ASSIGNEES_SECTION_ID = 'ASSIGNEES' as const
export const LABELS_SECTION_ID = 'LABELS' as const
export const ISSUE_TYPE_SECTION_ID = 'ISSUE_TYPE' as const
export const PARENT_SECTION_ID = 'REL_PARENT' as const
export const BLOCKED_BY_SECTION_ID = 'REL_BLOCKED_BY' as const
export const BLOCKING_SECTION_ID = 'REL_BLOCKING' as const

export const sectionLabel = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 2,
  fontSize: 0 as const,
  fontWeight: 'bold' as const,
  textTransform: 'uppercase' as const,
  color: 'fg.muted' as const,
  letterSpacing: '0.05em',
}

export const prefixLabelIcon = {
  color: 'fg.muted' as const,
  display: 'flex' as const,
  alignItems: 'center' as const,
  flexShrink: 0 as const,
}

export const buttonMotionSx = primerCss.buttonMotion()

export const sectionGroupMeta: Record<SectionGroup, { label: string; icon: React.ReactNode }> = {
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

export const sectionGroupOrder: SectionGroup[] = [
  'CONTENT',
  'METADATA',
  'PROJECT_FIELDS',
  'RELATIONSHIPS',
]
export const bulkDuplicateHeaderIcon = <CopyIcon size={16} />

export function fieldSectionId(fieldId: string): SectionId {
  return `FIELD:${fieldId}`
}

export function getFieldIcon(dataType: EditableField['dataType']): React.ReactNode {
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

export function duplicateValueTooltip(fieldName: string): string {
  return `Value applied to the duplicated item for ${fieldName}.`
}

export function formatIssueSummary(issue: IssueRelationshipData): string {
  return `${formatIssueReference(issue)} — ${issue.title}`
}

export function summarizeText(value: string, fallback = 'Empty'): string {
  const trimmed = value.trim()
  if (!trimmed) return fallback
  return trimmed.length > 80 ? `${trimmed.slice(0, 77)}…` : trimmed
}

export function summarizeIssueList(issues: IssueRelationshipData[]): string {
  if (issues.length === 0) return 'Skipped'
  const preview = issues.slice(0, 2).map(formatIssueSummary).join('; ')
  return issues.length > 2 ? `${preview} +${issues.length - 2} more` : preview
}

export function summarizeFieldValue(field: EditableField): string {
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
    return field.number === undefined || field.number === null
      ? 'None / Cleared'
      : String(field.number)
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

/**
 * §11.6 — Diff predicate per section. Compares the user-edited value against
 * the source preview value and returns `true` when they differ. The REVIEW
 * step uses this to badge each row as `· edited` (changed) or
 * `· same as source` (untouched).
 */
export function isAssigneesEdited(
  current: ReadonlyArray<{ id: string }>,
  source: ReadonlyArray<{ id: string }>,
): boolean {
  if (current.length !== source.length) return true
  const sourceIds = new Set(source.map((a) => a.id))
  return current.some((a) => !sourceIds.has(a.id))
}

export function isLabelsEdited(
  current: ReadonlyArray<{ id: string }>,
  source: ReadonlyArray<{ id: string }>,
): boolean {
  if (current.length !== source.length) return true
  const sourceIds = new Set(source.map((l) => l.id))
  return current.some((l) => !sourceIds.has(l.id))
}

export function isRelationshipsEdited<T>(
  current: ReadonlyArray<T>,
  source: ReadonlyArray<T>,
  key: (t: T) => string,
): boolean {
  if (current.length !== source.length) return true
  const sourceKeys = new Set(source.map(key))
  return current.some((c) => !sourceKeys.has(key(c)))
}

export function isFieldEdited(current: EditableField, source: EditableField): boolean {
  if (current.dataType !== source.dataType) return true
  switch (current.dataType) {
    case 'TEXT':
      return (current.text ?? '') !== (source.text ?? '')
    case 'SINGLE_SELECT':
      return (current.optionId ?? '') !== (source.optionId ?? '')
    case 'ITERATION':
      return (current.iterationId ?? '') !== (source.iterationId ?? '')
    case 'NUMBER':
      return (current.number ?? null) !== (source.number ?? null)
    case 'DATE':
      return (current.date ?? '') !== (source.date ?? '')
    default:
      return false
  }
}

export function buildFieldValue(field: EditableField): Record<string, unknown> {
  if (field.dataType === 'TEXT') return { text: field.text ?? '' }
  if (field.dataType === 'SINGLE_SELECT')
    return field.optionId ? { singleSelectOptionId: field.optionId } : {}
  if (field.dataType === 'ITERATION')
    return field.iterationId ? { iterationId: field.iterationId } : {}
  if (field.dataType === 'NUMBER')
    return field.number === undefined || field.number === null ? {} : { number: field.number }
  if (field.dataType === 'DATE') return field.date ? { date: field.date } : {}
  return {}
}
