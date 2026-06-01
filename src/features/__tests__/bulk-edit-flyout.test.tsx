import { describe, expect, it } from 'vitest'

import { canApply, defaultValueFor, serializeValue } from '@/features/bulk-edit-flyout-helpers'
import type { ProjectField } from '@/features/bulk-edit-utils'

function field(over: Partial<ProjectField> = {}): ProjectField {
  return { id: 'f1', name: 'Status', dataType: 'SINGLE_SELECT', ...over }
}

describe('bulk-edit-flyout — defaultValueFor', () => {
  it('returns empty text for TEXT/TITLE/BODY', () => {
    expect(defaultValueFor(field({ dataType: 'TEXT' }))).toEqual({ kind: 'text', text: '' })
    expect(defaultValueFor(field({ dataType: 'TITLE' }))).toEqual({ kind: 'text', text: '' })
    expect(defaultValueFor(field({ dataType: 'BODY' }))).toEqual({ kind: 'text', text: '' })
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
