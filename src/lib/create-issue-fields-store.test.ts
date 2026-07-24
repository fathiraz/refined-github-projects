import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createIssueFieldsStore } from '@/lib/create-issue-fields-store'
import type { ProjectField } from '@/features/bulk-edit-utils'

const textField: ProjectField = { id: 'f1', name: 'Priority', dataType: 'TEXT' }
const numberField: ProjectField = { id: 'f2', name: 'Points', dataType: 'NUMBER' }

beforeEach(() => {
  createIssueFieldsStore.clearAll()
})

describe('createIssueFieldsStore', () => {
  it('set stages a field value', () => {
    createIssueFieldsStore.set(textField, { kind: 'text', text: 'hi' })
    expect(createIssueFieldsStore.count()).toBe(1)
    expect(createIssueFieldsStore.snapshot().get('f1')).toEqual({
      field: textField,
      value: { kind: 'text', text: 'hi' },
    })
  })

  it('set overwrites an existing value for the same field', () => {
    createIssueFieldsStore.set(textField, { kind: 'text', text: 'a' })
    createIssueFieldsStore.set(textField, { kind: 'text', text: 'b' })
    expect(createIssueFieldsStore.count()).toBe(1)
    expect(createIssueFieldsStore.snapshot().get('f1')?.value).toEqual({ kind: 'text', text: 'b' })
  })

  it('remove clears a single staged field', () => {
    createIssueFieldsStore.set(textField, { kind: 'text', text: 'a' })
    createIssueFieldsStore.set(numberField, { kind: 'number', number: 3 })
    createIssueFieldsStore.remove('f1')
    expect(createIssueFieldsStore.count()).toBe(1)
    expect(createIssueFieldsStore.snapshot().has('f1')).toBe(false)
  })

  it('clearAll removes every staged field', () => {
    createIssueFieldsStore.set(textField, { kind: 'text', text: 'a' })
    createIssueFieldsStore.set(numberField, { kind: 'number', number: 3 })
    createIssueFieldsStore.clearAll()
    expect(createIssueFieldsStore.count()).toBe(0)
  })

  it('subscribe fires on set/remove/clearAll and not after unsubscribe', () => {
    const listener = vi.fn()
    const unsub = createIssueFieldsStore.subscribe(listener)

    createIssueFieldsStore.set(textField, { kind: 'text', text: 'a' })
    expect(listener).toHaveBeenCalledTimes(1)

    createIssueFieldsStore.remove('f1')
    expect(listener).toHaveBeenCalledTimes(2)

    createIssueFieldsStore.set(textField, { kind: 'text', text: 'a' })
    createIssueFieldsStore.clearAll()
    expect(listener).toHaveBeenCalledTimes(4)

    unsub()
    createIssueFieldsStore.set(numberField, { kind: 'number', number: 1 })
    expect(listener).toHaveBeenCalledTimes(4)
  })

  it('remove on a missing field is a no-op (no notification)', () => {
    const listener = vi.fn()
    createIssueFieldsStore.subscribe(listener)
    createIssueFieldsStore.remove('does-not-exist')
    expect(listener).not.toHaveBeenCalled()
  })
})
