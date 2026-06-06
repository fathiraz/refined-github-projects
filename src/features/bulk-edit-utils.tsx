// shared types, constants, and helpers for the bulk-edit wizard.

import React from 'react'
import {
  CalendarIcon,
  HashIcon,
  ArrowRightIcon,
  ListCheckIcon,
  OptionsSelectIcon,
  PencilIcon,
  PersonIcon,
  ShieldIcon,
  SyncIcon,
  TagIcon,
  TextLineIcon,
} from '@/ui/icons'
import type { BulkEditRelationshipsUpdate, IssueRelationshipData } from '@/lib/messages'
import { formatIssueReference } from '@/lib/relationship-utils'

export interface ProjectField {
  id: string
  name: string
  dataType: string
  options?: { id: string; name: string; color?: string }[]
  configuration?: {
    iterations: { id: string; title: string; startDate: string; duration: number }[]
  }
}

export interface ProjectData {
  id: string
  title: string
  fields: ProjectField[]
}

export interface RelationshipSelectionState {
  parent: boolean
  blockedBy: boolean
  blocking: boolean
}

export type WizardStep = 'TOKEN_WARNING' | 'FIELDS' | 'VALUES' | 'SUMMARY'

export type RelationshipKey = keyof RelationshipSelectionState

export type RelationshipSummaryRow = {
  label: string
  value: string
}

/** Project V2 field types editable via the field picker (not issue properties). */
export const EDITABLE_PROJECT_FIELD_DATATYPES = new Set([
  'TEXT',
  'NUMBER',
  'DATE',
  'SINGLE_SELECT',
  'ITERATION',
])

/** Issue-level attributes injected as synthetic rows in the field catalog. */
export const ISSUE_PROPERTY_DATATYPES = new Set([
  'TITLE',
  'BODY',
  'COMMENT',
  'ASSIGNEES',
  'LABELS',
  'ISSUE_TYPE',
])

/** All datatypes shown in the Edit fields picker (excludes RELATIONSHIP). */
export const BULK_EDIT_FALLBACK_DATATYPES = new Set([
  ...EDITABLE_PROJECT_FIELD_DATATYPES,
  ...ISSUE_PROPERTY_DATATYPES,
])

export const RELATIONSHIP_OPTIONS: Array<{
  key: RelationshipKey
  label: string
  description: string
}> = [
  {
    key: 'parent',
    label: 'Parent',
    description: 'Set or clear a parent issue for the selected issues.',
  },
  {
    key: 'blockedBy',
    label: 'Blocked by',
    description: 'Add, remove, or clear issues that block the selected issues.',
  },
  {
    key: 'blocking',
    label: 'Blocking',
    description: 'Add, remove, or clear issues that the selected issues block.',
  },
]

export function relationshipFieldId(key: RelationshipKey): string {
  return `__rel_${key}__`
}

export function isRelationshipFieldId(id: string): boolean {
  return /^__rel_\w+__$/.test(id)
}

export function relationshipKeyFromFieldId(id: string): RelationshipKey | null {
  const match = id.match(/^__rel_(\w+)__$/)
  if (!match) return null
  const key = match[1] as RelationshipKey
  return RELATIONSHIP_OPTIONS.some((opt) => opt.key === key) ? key : null
}

export function isSyntheticIssuePropertyId(id: string): boolean {
  return id.startsWith('__') && !isRelationshipFieldId(id)
}

export function buildRelationshipFieldRows(): ProjectField[] {
  return RELATIONSHIP_OPTIONS.map((opt) => ({
    id: relationshipFieldId(opt.key),
    name: opt.label,
    dataType: 'RELATIONSHIP',
  }))
}

function sortFieldsByName(fields: ProjectField[]): ProjectField[] {
  return [...fields].sort((a, b) => a.name.localeCompare(b.name))
}

/** Merge API/synthetic fields with relationship verb rows (deduped by id). */
export function buildFieldCatalog(fields: readonly ProjectField[]): ProjectField[] {
  const byId = new Map<string, ProjectField>()
  for (const field of fields) byId.set(field.id, field)
  for (const row of buildRelationshipFieldRows()) byId.set(row.id, row)
  return [...byId.values()]
}

export type FieldListBrowsePartition = {
  mode: 'browse'
  recent: ProjectField[]
  issueProperties: ProjectField[]
  projectFields: ProjectField[]
  relationships: ProjectField[]
}

export type FieldListSearchPartition = {
  mode: 'search'
  matches: ProjectField[]
}

export type FieldListPartition = FieldListBrowsePartition | FieldListSearchPartition

export function partitionFieldList(args: {
  fields: readonly ProjectField[]
  recentIds: readonly string[]
  query: string
}): FieldListPartition {
  const catalog = buildFieldCatalog(args.fields)
  const indexed = new Map(catalog.map((f) => [f.id, f]))
  const recentSet = new Set(args.recentIds)
  const q = args.query.trim().toLowerCase()

  const issueProperties = catalog.filter(
    (f) =>
      !isRelationshipFieldId(f.id) &&
      (ISSUE_PROPERTY_DATATYPES.has(f.dataType) || isSyntheticIssuePropertyId(f.id)),
  )
  const projectFields = catalog.filter(
    (f) => !isSyntheticIssuePropertyId(f.id) && EDITABLE_PROJECT_FIELD_DATATYPES.has(f.dataType),
  )
  const relationships = catalog.filter((f) => isRelationshipFieldId(f.id))

  if (q) {
    const matches = catalog
      .filter((f) => BULK_EDIT_FALLBACK_DATATYPES.has(f.dataType) || f.dataType === 'RELATIONSHIP')
      .filter((f) => f.name.toLowerCase().includes(q))
    return { mode: 'search', matches: sortFieldsByName(matches) }
  }

  const recent = args.recentIds
    .map((id) => indexed.get(id))
    .filter((f): f is ProjectField => f !== undefined)

  const excludeRecent = (list: ProjectField[]) => list.filter((f) => !recentSet.has(f.id))

  return {
    mode: 'browse',
    recent,
    issueProperties: sortFieldsByName(excludeRecent(issueProperties)),
    projectFields: sortFieldsByName(excludeRecent(projectFields)),
    relationships: sortFieldsByName(excludeRecent(relationships)),
  }
}

export function getFieldIcon(dataType: string): React.ReactNode {
  switch (dataType) {
    case 'ASSIGNEES':
      return <PersonIcon />
    case 'LABELS':
      return <TagIcon />
    case 'ISSUE_TYPE':
      return <ShieldIcon />
    case 'SINGLE_SELECT':
      return <OptionsSelectIcon />
    case 'ITERATION':
      return <SyncIcon />
    case 'NUMBER':
      return <HashIcon />
    case 'DATE':
      return <CalendarIcon />
    case 'TEXT':
      return <TextLineIcon />
    case 'TITLE':
      return <PencilIcon />
    case 'BODY':
      return <TextLineIcon />
    case 'COMMENT':
      return <TextLineIcon />
    case 'RELATIONSHIP':
      return <ArrowRightIcon />
    default:
      return null
  }
}

export function getFieldSelectionTooltip(field: ProjectField): string {
  return `Select ${field.name} to set the same value across all selected items.`
}

export function getFieldValueStepTooltip(field: ProjectField, itemCount: number): string {
  return `Set ${field.name} for all ${itemCount} selected item${itemCount !== 1 ? 's' : ''}.`
}

export function getRelationshipSelectionTooltip(label: string): string {
  return `Enable ${label.toLowerCase()} relationship changes for this bulk edit.`
}

export function issueTitle(issue: IssueRelationshipData): string {
  return issue.title.trim() || formatIssueReference(issue)
}

export function getRelationshipSelectionCount(selection: RelationshipSelectionState): number {
  return Object.values(selection).filter(Boolean).length
}

export function buildRelationshipSummaryRows(
  relationships: BulkEditRelationshipsUpdate,
): RelationshipSummaryRow[] {
  const rows: RelationshipSummaryRow[] = []

  if (relationships.parent.clear) {
    rows.push({ label: 'Parent', value: 'Clear existing parent relationship' })
  }
  if (relationships.parent.set) {
    rows.push({
      label: 'Parent',
      value: `Set to ${formatIssueReference(relationships.parent.set)}`,
    })
  }

  if (relationships.blockedBy.clear) {
    rows.push({ label: 'Blocked by', value: 'Clear all current blockers' })
  }
  if (relationships.blockedBy.add.length > 0) {
    rows.push({
      label: 'Blocked by',
      value: `Add ${relationships.blockedBy.add.map(formatIssueReference).join(', ')}`,
    })
  }
  if (relationships.blockedBy.remove.length > 0) {
    rows.push({
      label: 'Blocked by',
      value: `Remove ${relationships.blockedBy.remove.map(formatIssueReference).join(', ')}`,
    })
  }

  if (relationships.blocking.clear) {
    rows.push({ label: 'Blocking', value: 'Clear all currently blocked issues' })
  }
  if (relationships.blocking.add.length > 0) {
    rows.push({
      label: 'Blocking',
      value: `Add ${relationships.blocking.add.map(formatIssueReference).join(', ')}`,
    })
  }
  if (relationships.blocking.remove.length > 0) {
    rows.push({
      label: 'Blocking',
      value: `Remove ${relationships.blocking.remove.map(formatIssueReference).join(', ')}`,
    })
  }

  return rows
}

export function describeFieldValue(
  field: ProjectField,
  fieldValues: Record<string, unknown>,
): string {
  const valueObj = (fieldValues[field.id] || {}) as Record<string, unknown>
  let displayValue = 'None / Cleared'

  const arr = valueObj.array as { name: string }[] | undefined
  if (arr && arr.length > 0) {
    displayValue = arr.map((v) => v.name).join(', ')
  } else if (valueObj.date) {
    displayValue = new Date((valueObj.date as string) + 'T00:00:00').toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } else if (valueObj.number !== undefined && valueObj.number !== null) {
    displayValue = String(valueObj.number)
  } else if (valueObj.text) {
    displayValue = valueObj.text as string
  } else if (valueObj.singleSelectOptionId && field.options) {
    const opt = field.options.find((option) => option.id === valueObj.singleSelectOptionId)
    if (opt) displayValue = opt.name
  } else if (valueObj.iterationId && field.configuration?.iterations) {
    const iter = field.configuration.iterations.find((option) => option.id === valueObj.iterationId)
    if (iter) displayValue = iter.title
  }

  return displayValue
}

export const bulkEditHeaderIcon = <ListCheckIcon size={16} />
