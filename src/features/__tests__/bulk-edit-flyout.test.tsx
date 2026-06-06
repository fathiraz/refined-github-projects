import { beforeEach, describe, expect, it, vi } from 'vitest'

const hoisted = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  getActiveCount: vi.fn(() => 0),
}))

vi.mock('@/lib/messages', () => ({
  sendMessage: hoisted.sendMessage,
}))

vi.mock('@/lib/queue-store', () => ({
  queueStore: {
    getActiveCount: hoisted.getActiveCount,
  },
}))

import {
  BULK_EDIT_CONCURRENT_MESSAGE,
  BULK_EDIT_DISPATCH_FAILED_MESSAGE,
  canApply,
  defaultValueFor,
  serializeValue,
  submitBulkFieldUpdate,
} from '@/features/bulk-edit-flyout-helpers'
import {
  buildRelationshipFieldRows,
  partitionFieldList,
  relationshipFieldId,
  type ProjectField,
} from '@/features/bulk-edit-utils'
import { buildRelationshipsPayload } from '@/features/bulk-actions-utils'

function field(over: Partial<ProjectField> = {}): ProjectField {
  return { id: 'f1', name: 'Status', dataType: 'SINGLE_SELECT', ...over }
}

describe('bulk-edit-flyout — defaultValueFor', () => {
  it('returns empty text for TEXT/TITLE/BODY/COMMENT', () => {
    expect(defaultValueFor(field({ dataType: 'TEXT' }))).toEqual({ kind: 'text', text: '' })
    expect(defaultValueFor(field({ dataType: 'TITLE' }))).toEqual({ kind: 'text', text: '' })
    expect(defaultValueFor(field({ dataType: 'BODY' }))).toEqual({ kind: 'text', text: '' })
    expect(defaultValueFor(field({ dataType: 'COMMENT' }))).toEqual({ kind: 'text', text: '' })
  })

  it('returns null number for NUMBER', () => {
    expect(defaultValueFor(field({ dataType: 'NUMBER' }))).toEqual({ kind: 'number', number: null })
  })

  it('returns empty array for ASSIGNEES/LABELS/ISSUE_TYPE', () => {
    expect(defaultValueFor(field({ dataType: 'ASSIGNEES' }))).toEqual({ kind: 'array', array: [] })
    expect(defaultValueFor(field({ dataType: 'LABELS' }))).toEqual({ kind: 'array', array: [] })
    expect(defaultValueFor(field({ dataType: 'ISSUE_TYPE' }))).toEqual({ kind: 'array', array: [] })
  })

  it('returns null singleSelect for SINGLE_SELECT', () => {
    expect(defaultValueFor(field({ dataType: 'SINGLE_SELECT' }))).toEqual({
      kind: 'singleSelect',
      singleSelectOptionId: null,
    })
  })
})

describe('bulk-edit-flyout — canApply gating', () => {
  it('text requires non-empty', () => {
    expect(canApply({ kind: 'text', text: '' })).toBe(false)
    expect(canApply({ kind: 'text', text: 'x' })).toBe(true)
  })
  it('comment requires non-empty body', () => {
    expect(
      canApply(defaultValueFor(field({ id: '__comment__', name: 'Comment', dataType: 'COMMENT' }))),
    ).toBe(false)
    expect(canApply({ kind: 'text', text: 'Ship it' })).toBe(true)
  })
  it('number requires a non-null finite value', () => {
    expect(canApply({ kind: 'number', number: null })).toBe(false)
    expect(canApply({ kind: 'number', number: 7 })).toBe(true)
    expect(canApply({ kind: 'number', number: Number.NaN })).toBe(false)
  })
  it('date requires a string', () => {
    expect(canApply({ kind: 'date', date: '' })).toBe(false)
    expect(canApply({ kind: 'date', date: '2026-05-31' })).toBe(true)
  })
  it('singleSelect requires an optionId', () => {
    expect(canApply({ kind: 'singleSelect', singleSelectOptionId: null })).toBe(false)
    expect(canApply({ kind: 'singleSelect', singleSelectOptionId: 'opt-1' })).toBe(true)
  })
  it('array requires at least one entry', () => {
    expect(canApply({ kind: 'array', array: [] })).toBe(false)
    expect(canApply({ kind: 'array', array: [{ id: 'a', name: 'A' }] })).toBe(true)
  })
})

describe('bulk-edit-flyout — serializeValue shapes', () => {
  it('text → { text }', () => {
    expect(serializeValue({ kind: 'text', text: 'hi' })).toEqual({ text: 'hi' })
  })
  it('number → { number }', () => {
    expect(serializeValue({ kind: 'number', number: 5 })).toEqual({ number: 5 })
  })
  it('singleSelect → { singleSelectOptionId }', () => {
    expect(serializeValue({ kind: 'singleSelect', singleSelectOptionId: 'opt-3' })).toEqual({
      singleSelectOptionId: 'opt-3',
    })
  })
  it('iteration → { iterationId }', () => {
    expect(serializeValue({ kind: 'iteration', iterationId: 'iter-9' })).toEqual({
      iterationId: 'iter-9',
    })
  })
  it('array → { array }', () => {
    const arr = [{ id: 'l1', name: 'bug' }]
    expect(serializeValue({ kind: 'array', array: arr })).toEqual({ array: arr })
  })
})

describe('bulk-edit-flyout — submitBulkFieldUpdate dispatch', () => {
  const textField = field({ id: 'f-text', name: 'Note', dataType: 'TEXT' })

  beforeEach(() => {
    hoisted.sendMessage.mockReset()
    hoisted.getActiveCount.mockReset()
    hoisted.getActiveCount.mockReturnValue(0)
    hoisted.sendMessage.mockResolvedValue({ ok: true })
  })

  it('returns ok when bulkUpdate accepts dispatch', async () => {
    const result = await submitBulkFieldUpdate({
      activeField: textField,
      value: { kind: 'text', text: 'hello' },
      itemIds: ['item-1'],
      projectId: 'proj-1',
    })
    expect(result).toEqual({ ok: true })
    expect(hoisted.sendMessage).toHaveBeenCalledWith(
      'bulkUpdate',
      expect.objectContaining({ projectId: 'proj-1', itemIds: ['item-1'] }),
    )
  })

  it('returns concurrent message when queue is full', async () => {
    hoisted.getActiveCount.mockReturnValue(3)
    const result = await submitBulkFieldUpdate({
      activeField: textField,
      value: { kind: 'text', text: 'hello' },
      itemIds: ['item-1'],
      projectId: 'proj-1',
    })
    expect(result).toEqual({ ok: false, message: BULK_EDIT_CONCURRENT_MESSAGE })
    expect(hoisted.sendMessage).not.toHaveBeenCalled()
  })

  it('returns concurrent message when bulkUpdate rejects', async () => {
    hoisted.sendMessage.mockResolvedValue({ ok: false, reason: 'concurrent' })
    const result = await submitBulkFieldUpdate({
      activeField: textField,
      value: { kind: 'text', text: 'hello' },
      itemIds: ['item-1'],
      projectId: 'proj-1',
    })
    expect(result).toEqual({ ok: false, message: BULK_EDIT_CONCURRENT_MESSAGE })
  })

  it('returns dispatch failed message when sendMessage throws', async () => {
    hoisted.sendMessage.mockRejectedValue(new Error('Receiving end does not exist'))
    const result = await submitBulkFieldUpdate({
      activeField: textField,
      value: { kind: 'text', text: 'hello' },
      itemIds: ['item-1'],
      projectId: 'proj-1',
    })
    expect(result).toEqual({ ok: false, message: BULK_EDIT_DISPATCH_FAILED_MESSAGE })
  })
})

describe('bulk-edit — partitionFieldList', () => {
  const baseFields: ProjectField[] = [
    { id: 'f-status', name: 'Status', dataType: 'SINGLE_SELECT' },
    { id: 'f-zeta', name: 'Zeta', dataType: 'TEXT' },
    { id: 'f-alpha', name: 'Alpha', dataType: 'NUMBER' },
    { id: '__comment__', name: 'Comment', dataType: 'COMMENT' },
    { id: '__body__', name: 'Description', dataType: 'BODY' },
  ]

  it('browse mode sorts project fields A→Z and excludes recent from lower sections', () => {
    const partition = partitionFieldList({
      fields: baseFields,
      recentIds: ['f-status', relationshipFieldId('parent')],
      query: '',
    })
    expect(partition.mode).toBe('browse')
    if (partition.mode !== 'browse') return
    expect(partition.recent.map((f) => f.id)).toEqual(['f-status', relationshipFieldId('parent')])
    expect(partition.projectFields.map((f) => f.name)).toEqual(['Alpha', 'Zeta'])
    expect(partition.issueProperties.map((f) => f.name)).toEqual(['Comment', 'Description'])
    expect(partition.relationships.map((f) => f.name)).toEqual(['Blocked by', 'Blocking'])
  })

  it('search mode flattens matches without Recent section', () => {
    const partition = partitionFieldList({
      fields: baseFields,
      recentIds: ['f-status'],
      query: 'com',
    })
    expect(partition.mode).toBe('search')
    if (partition.mode !== 'search') return
    expect(partition.matches.map((f) => f.id)).toEqual(['__comment__'])
  })

  it('dedupes ids in search results', () => {
    const withRel = [...baseFields, ...buildRelationshipFieldRows()]
    const partition = partitionFieldList({
      fields: withRel,
      recentIds: [],
      query: 'parent',
    })
    expect(partition.mode).toBe('search')
    if (partition.mode !== 'search') return
    expect(partition.matches.filter((f) => f.id === relationshipFieldId('parent'))).toHaveLength(1)
  })
})

describe('bulk-edit — buildRelationshipsPayload', () => {
  it('builds parent clear payload', () => {
    expect(buildRelationshipsPayload('parent', 'clear', null, 'add', [])).toEqual({
      parent: { set: undefined, clear: true },
      blockedBy: { add: [], remove: [], clear: false },
      blocking: { add: [], remove: [], clear: false },
    })
  })

  it('builds blockedBy add payload', () => {
    const issue = {
      databaseId: 1,
      number: 42,
      title: 'Blocker',
      repoOwner: 'octo',
      repoName: 'repo',
      state: 'OPEN' as const,
    }
    const payload = buildRelationshipsPayload('blockedBy', 'set', null, 'add', [issue])
    expect(payload.blockedBy.add).toHaveLength(1)
    expect(payload.blockedBy.add[0]?.number).toBe(42)
  })
})
