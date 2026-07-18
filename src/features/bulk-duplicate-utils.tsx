// types, constants, and pure helpers for the bulk-duplicate modal.

import React from 'react'
import type { ItemPreviewData } from '@/lib/messages'
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

/** Max duplicates the background SW runs at once (`MAX_CONCURRENT_DUPLICATES`
 *  in `src/background/concurrency.ts`) — kept in sync manually since the two
 *  files live in separate bundles (content script vs. background SW). */
export const MAX_CONCURRENT_DUPLICATES = 3

/**
 * `queueStore.getActiveCount()` only reflects a duplicate once the
 * background SW's `queueStateUpdate` broadcast lands, one round-trip after
 * the fire. Rapid "Create more" clicks fire ahead of that broadcast, so a
 * local pending tally covers the gap; this drains it as the real count
 * catches up (and clears any phantom once the queue is empty).
 */
export function drainPendingDuplicates(
  prevActive: number,
  nowActive: number,
  pending: number,
): number {
  // A drop to empty (not merely "still empty") means the queue just finished
  // — any leftover pending tally is a phantom (e.g. a fire the BG silently
  // dropped), so clear it. `prevActive === 0 && nowActive === 0` is the
  // ordinary lag window and must NOT be treated as a completion.
  if (nowActive === 0 && prevActive > 0) return 0
  const rise = Math.max(0, nowActive - prevActive)
  return Math.max(0, pending - rise)
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
