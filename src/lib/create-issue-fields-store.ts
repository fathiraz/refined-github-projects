import type { ProjectField } from '@/features/bulk-edit-utils'
import type { FieldValue } from '@/features/bulk-edit-flyout-helpers'

type Listener = () => void

interface StagedField {
  field: ProjectField
  value: FieldValue
}

let current: ReadonlyMap<string, StagedField> = new Map()

const listeners = new Set<Listener>()

function setState(next: ReadonlyMap<string, StagedField>): void {
  current = next
  listeners.forEach((fn) => fn())
}

export const createIssueFieldsStore = {
  set(field: ProjectField, value: FieldValue): void {
    const next = new Map(current)
    next.set(field.id, { field, value })
    setState(next)
  },

  remove(fieldId: string): void {
    if (!current.has(fieldId)) return
    const next = new Map(current)
    next.delete(fieldId)
    setState(next)
  },

  clearAll(): void {
    if (current.size === 0) return
    setState(new Map())
  },

  snapshot(): ReadonlyMap<string, StagedField> {
    return current
  },

  count(): number {
    return current.size
  },

  subscribe(fn: Listener): () => void {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
}
