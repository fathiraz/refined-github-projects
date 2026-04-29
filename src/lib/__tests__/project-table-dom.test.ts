import { describe, it, expect, beforeEach } from 'vitest'

import {
  INJECTED_ATTR,
  extractItemId,
  getStoredItemId,
  getAllInjectedItemIds,
  isEditableTarget,
} from '../project-table-dom'

// ---------------------------------------------------------------------------
// extractItemId
// ---------------------------------------------------------------------------

describe('extractItemId', () => {
  it('returns null for null input', () => {
    expect(extractItemId(null)).toBeNull()
  })

  it('returns data-hovercard-subject-tag when present', () => {
    const row = document.createElement('div')
    row.setAttribute('data-hovercard-subject-tag', 'Issue:123')
    expect(extractItemId(row)).toBe('Issue:123')
  })

  it('extracts issue number from link href', () => {
    const row = document.createElement('div')
    const link = document.createElement('a')
    link.href = 'https://github.com/owner/repo/issues/42'
    row.appendChild(link)
    expect(extractItemId(row)).toBe('issue-42')
  })

  it('returns null when no identifiers found', () => {
    const row = document.createElement('div')
    expect(extractItemId(row)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// getStoredItemId
// ---------------------------------------------------------------------------

describe('getStoredItemId', () => {
  it('returns stored item id from INJECTED_ATTR', () => {
    const row = document.createElement('div')
    row.setAttribute(INJECTED_ATTR, 'item-abc')
    expect(getStoredItemId(row)).toBe('item-abc')
  })

  it('returns null when attribute value is "1" (legacy marker)', () => {
    const row = document.createElement('div')
    row.setAttribute(INJECTED_ATTR, '1')
    expect(getStoredItemId(row)).toBeNull()
  })

  it('returns null when attribute is missing', () => {
    const row = document.createElement('div')
    expect(getStoredItemId(row)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// getAllInjectedItemIds
// ---------------------------------------------------------------------------

describe('getAllInjectedItemIds', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('collects ids from injected rows', () => {
    const row1 = document.createElement('div')
    row1.setAttribute('role', 'row')
    row1.setAttribute(INJECTED_ATTR, 'id-1')
    document.body.appendChild(row1)

    const row2 = document.createElement('div')
    row2.setAttribute('role', 'row')
    row2.setAttribute(INJECTED_ATTR, 'id-2')
    document.body.appendChild(row2)

    const ids = getAllInjectedItemIds()
    // Branded primitives erase to plain strings at runtime, so deep-equal
    // comparison against the underlying string array remains valid.
    expect([...ids] as string[]).toEqualValue(['id-1', 'id-2'])
  })

  it('returns empty array when no injected rows', () => {
    expect(getAllInjectedItemIds()).toEqualValue([])
  })

  it('skips rows with value "1"', () => {
    const row = document.createElement('div')
    row.setAttribute('role', 'row')
    row.setAttribute(INJECTED_ATTR, '1')
    document.body.appendChild(row)

    expect(getAllInjectedItemIds()).toEqualValue([])
  })
})

// ---------------------------------------------------------------------------
// isEditableTarget
// ---------------------------------------------------------------------------

describe('isEditableTarget', () => {
  it('returns false for null', () => {
    expect(isEditableTarget(null)).toBe(false)
  })

  it('returns true for INPUT element', () => {
    expect(isEditableTarget(document.createElement('input'))).toBe(true)
  })

  it('returns true for TEXTAREA element', () => {
    expect(isEditableTarget(document.createElement('textarea'))).toBe(true)
  })

  it('returns true for SELECT element', () => {
    expect(isEditableTarget(document.createElement('select'))).toBe(true)
  })

  it('returns false for DIV element', () => {
    expect(isEditableTarget(document.createElement('div'))).toBe(false)
  })

  it('returns true for contenteditable element', () => {
    const div = document.createElement('div')
    div.contentEditable = 'true'
    expect(isEditableTarget(div)).toBe(true)
  })

  it('returns true for element with role="textbox"', () => {
    const div = document.createElement('div')
    div.setAttribute('role', 'textbox')
    document.body.appendChild(div)
    expect(isEditableTarget(div)).toBe(true)
    document.body.removeChild(div)
  })
})
