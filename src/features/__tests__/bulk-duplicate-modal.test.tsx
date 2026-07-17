import { describe, expect, it } from 'vitest'

import {
  drainPendingDuplicates,
  isAssigneesEdited,
  isFieldEdited,
  isLabelsEdited,
  isRelationshipsEdited,
  type EditableField,
} from '@/features/bulk-duplicate-utils'

// §11.9 — these tests cover the diff helpers and the inputs the §11.2/§11.6
// REVIEW step relies on for its `· edited` / `· same as source` badges + the
// §11.4 default section selection.

describe('isAssigneesEdited', () => {
  it('treats equal id sets as same', () => {
    expect(isAssigneesEdited([{ id: 'a' }, { id: 'b' }], [{ id: 'a' }, { id: 'b' }])).toBe(false)
  })

  it('is order-insensitive', () => {
    expect(isAssigneesEdited([{ id: 'b' }, { id: 'a' }], [{ id: 'a' }, { id: 'b' }])).toBe(false)
  })

  it('detects an added assignee', () => {
    expect(isAssigneesEdited([{ id: 'a' }, { id: 'b' }], [{ id: 'a' }])).toBe(true)
  })

  it('detects a removed assignee', () => {
    expect(isAssigneesEdited([{ id: 'a' }], [{ id: 'a' }, { id: 'b' }])).toBe(true)
  })
})

describe('isLabelsEdited', () => {
  it('treats equal id sets as same', () => {
    expect(isLabelsEdited([{ id: 'bug' }, { id: 'docs' }], [{ id: 'docs' }, { id: 'bug' }])).toBe(
      false,
    )
  })

  it('detects a label swap', () => {
    expect(isLabelsEdited([{ id: 'bug' }], [{ id: 'docs' }])).toBe(true)
  })
})

describe('isRelationshipsEdited', () => {
  const key = (issue: { repoOwner: string; repoName: string; number: number }) =>
    `${issue.repoOwner}/${issue.repoName}#${issue.number}`
  const issueA = { repoOwner: 'acme', repoName: 'web', number: 1, title: 'A' }
  const issueB = { repoOwner: 'acme', repoName: 'web', number: 2, title: 'B' }

  it('same set in any order → not edited', () => {
    expect(isRelationshipsEdited([issueA, issueB], [issueB, issueA], key)).toBe(false)
  })

  it('removed row → edited', () => {
    expect(isRelationshipsEdited([issueA], [issueA, issueB], key)).toBe(true)
  })

  it('added row → edited', () => {
    expect(isRelationshipsEdited([issueA, issueB], [issueA], key)).toBe(true)
  })
})

describe('isFieldEdited', () => {
  const baseSelect: EditableField = {
    fieldId: 'PVTSF_1',
    fieldName: 'Status',
    dataType: 'SINGLE_SELECT',
    optionId: 'opt-todo',
    optionName: 'Todo',
  }
  const baseText: EditableField = {
    fieldId: 'PVTF_1',
    fieldName: 'Notes',
    dataType: 'TEXT',
    text: 'hello',
  }
  const baseNumber: EditableField = {
    fieldId: 'PVTF_2',
    fieldName: 'Estimate',
    dataType: 'NUMBER',
    number: 5,
  }
  const baseDate: EditableField = {
    fieldId: 'PVTF_3',
    fieldName: 'Due',
    dataType: 'DATE',
    date: '2026-06-01',
  }
  const baseIteration: EditableField = {
    fieldId: 'PVTIF_1',
    fieldName: 'Sprint',
    dataType: 'ITERATION',
    iterationId: 'iter-1',
    iterationTitle: 'Sprint 1',
    iterationStartDate: '2026-06-01',
  }

  it('SINGLE_SELECT: same optionId → not edited', () => {
    expect(isFieldEdited(baseSelect, baseSelect)).toBe(false)
  })

  it('SINGLE_SELECT: different optionId → edited', () => {
    expect(isFieldEdited({ ...baseSelect, optionId: 'opt-doing' }, baseSelect)).toBe(true)
  })

  it('TEXT: trailing whitespace differs → edited (literal compare)', () => {
    expect(isFieldEdited({ ...baseText, text: 'hello ' }, baseText)).toBe(true)
  })

  it('NUMBER: same value → not edited', () => {
    expect(isFieldEdited(baseNumber, baseNumber)).toBe(false)
  })

  it('NUMBER: null vs 0 → edited (treated as distinct)', () => {
    expect(isFieldEdited({ ...baseNumber, number: 0 }, { ...baseNumber, number: undefined })).toBe(
      true,
    )
  })

  it('DATE: same iso → not edited', () => {
    expect(isFieldEdited(baseDate, baseDate)).toBe(false)
  })

  it('DATE: different iso → edited', () => {
    expect(isFieldEdited({ ...baseDate, date: '2026-06-02' }, baseDate)).toBe(true)
  })

  it('ITERATION: same iterationId → not edited', () => {
    expect(isFieldEdited(baseIteration, baseIteration)).toBe(false)
  })

  it('ITERATION: cleared → edited', () => {
    expect(isFieldEdited({ ...baseIteration, iterationId: undefined }, baseIteration)).toBe(true)
  })
})

// §11.9 — race-window guard: `getActiveCount()` only reflects a duplicate
// once the BG's `queueStateUpdate` broadcast lands, one round-trip after the
// fire. `drainPendingDuplicates` tracks fires not yet reflected so rapid
// "Create more" clicks can't slip past the concurrency cap.
describe('drainPendingDuplicates', () => {
  it('holds pending steady while the queue count has not moved (still in the lag window)', () => {
    expect(drainPendingDuplicates(0, 0, 2)).toBe(2)
  })

  it('drains pending by the full rise once the queue catches up', () => {
    expect(drainPendingDuplicates(0, 2, 2)).toBe(0)
  })

  it('drains only by the observed rise on a partial catch-up', () => {
    expect(drainPendingDuplicates(1, 2, 2)).toBe(1)
  })

  it('never drains below zero when the rise exceeds pending', () => {
    expect(drainPendingDuplicates(0, 5, 1)).toBe(0)
  })

  it('ignores a drop in active count (no negative rise)', () => {
    expect(drainPendingDuplicates(2, 1, 2)).toBe(2)
  })

  it('clears any phantom once the queue is fully empty', () => {
    expect(drainPendingDuplicates(3, 0, 2)).toBe(0)
  })
})
