// Pure helpers extracted from `bulk-edit-flyout.tsx` so they remain testable
// without pulling in the WXT message-pipe runtime. See §5 of the
// `bulk-actions-flyouts` change.

import type { ProjectField } from '@/features/bulk-edit-utils'

export type FieldValue =
  | { kind: 'cleared' }
  | { kind: 'text'; text: string }
  | { kind: 'number'; number: number | null }
  | { kind: 'date'; date: string }
  | { kind: 'singleSelect'; singleSelectOptionId: string | null }
  | { kind: 'iteration'; iterationId: string | null }
  | { kind: 'array'; array: Array<{ id: string; name: string }> }

export function defaultValueFor(field: ProjectField): FieldValue {
  switch (field.dataType) {
    case 'TEXT':
    case 'TITLE':
    case 'BODY':
      return { kind: 'text', text: '' }
    case 'NUMBER':
      return { kind: 'number', number: null }
    case 'DATE':
      return { kind: 'date', date: '' }
    case 'SINGLE_SELECT':
      return { kind: 'singleSelect', singleSelectOptionId: null }
    case 'ITERATION':
      return { kind: 'iteration', iterationId: null }
    case 'ASSIGNEES':
    case 'LABELS':
    case 'ISSUE_TYPE':
      return { kind: 'array', array: [] }
    default:
      return { kind: 'cleared' }
  }
}

export function canApply(value: FieldValue | null): boolean {
  if (!value) return false
  switch (value.kind) {
    case 'cleared':
      return true
    case 'text':
      return value.text.length > 0
    case 'number':
      return value.number !== null && !Number.isNaN(value.number)
    case 'date':
      return value.date.length > 0
    case 'singleSelect':
      return value.singleSelectOptionId !== null
    case 'iteration':
      return value.iterationId !== null
    case 'array':
      return value.array.length > 0
  }
}

export function serializeValue(value: FieldValue): Record<string, unknown> | null {
  switch (value.kind) {
    case 'cleared':
      return {}
    case 'text':
      return { text: value.text }
    case 'number':
      return value.number === null ? null : { number: value.number }
    case 'date':
      return value.date ? { date: value.date } : null
    case 'singleSelect':
      return value.singleSelectOptionId
        ? { singleSelectOptionId: value.singleSelectOptionId }
        : null
    case 'iteration':
      return value.iterationId ? { iterationId: value.iterationId } : null
    case 'array':
      return { array: value.array }
  }
}
