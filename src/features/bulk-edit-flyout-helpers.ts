// Pure helpers extracted from `bulk-edit-flyout.tsx` so they remain testable
// without pulling in the WXT message-pipe runtime. See §5 of the
// `bulk-actions-flyouts` change.

import type { ProjectField } from '@/features/bulk-edit-utils'
import { sendMessage } from '@/lib/messages'
import { queueStore } from '@/lib/queue-store'

export const BULK_EDIT_CONCURRENT_MESSAGE =
  '3 processes are already running. Wait for one to finish before starting another.'
export const BULK_EDIT_DISPATCH_FAILED_MESSAGE = 'Could not start the bulk update. Try again.'

export type SubmitBulkFieldUpdateResult = { ok: true } | { ok: false; message: string }

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
      return value.number !== null && Number.isFinite(value.number)
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

export async function submitBulkFieldUpdate(args: {
  activeField: ProjectField
  value: FieldValue
  itemIds: readonly string[]
  projectId: string
}): Promise<SubmitBulkFieldUpdateResult> {
  const payload = serializeValue(args.value)
  if (payload === null) {
    return { ok: false, message: BULK_EDIT_DISPATCH_FAILED_MESSAGE }
  }

  if (queueStore.getActiveCount() >= 3) {
    return { ok: false, message: BULK_EDIT_CONCURRENT_MESSAGE }
  }

  try {
    const result = await sendMessage('bulkUpdate', {
      itemIds: [...args.itemIds],
      projectId: args.projectId,
      updates: [
        {
          fieldId: args.activeField.id,
          value: { ...payload, dataType: args.activeField.dataType },
        },
      ],
      fieldMeta: {
        [args.activeField.id]: {
          name: args.activeField.name,
          options: args.activeField.options,
          iterations: args.activeField.configuration?.iterations,
        },
      },
    })

    if (!result.ok) {
      return {
        ok: false,
        message:
          result.reason === 'concurrent'
            ? BULK_EDIT_CONCURRENT_MESSAGE
            : BULK_EDIT_DISPATCH_FAILED_MESSAGE,
      }
    }

    return { ok: true }
  } catch {
    return { ok: false, message: BULK_EDIT_DISPATCH_FAILED_MESSAGE }
  }
}
