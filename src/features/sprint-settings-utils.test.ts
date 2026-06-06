import { describe, it, expect } from 'vitest'

import { formatAdvancedSettingsHint, hasAdvancedSettings } from '@/features/sprint-settings-utils'
import type { SprintSettings } from '@/lib/storage'

function settings(over: Partial<SprintSettings> = {}): SprintSettings {
  return {
    sprintFieldId: 'sf',
    sprintFieldName: 'Sprint',
    doneFieldId: 'df',
    doneFieldName: 'Status',
    doneFieldType: 'SINGLE_SELECT',
    doneOptionId: 'opt-done',
    doneOptionName: 'Done',
    ...over,
  }
}

describe('hasAdvancedSettings', () => {
  it('returns false for null', () => {
    expect(hasAdvancedSettings(null)).toBe(false)
  })

  it('returns false when only required fields are set', () => {
    expect(hasAdvancedSettings(settings())).toBe(false)
  })

  it('returns true when a not-started option is set', () => {
    expect(hasAdvancedSettings(settings({ notStartedOptionId: 'opt-todo' }))).toBe(true)
  })

  it('returns true when exclusion conditions exist', () => {
    expect(
      hasAdvancedSettings(
        settings({
          excludeConditions: [
            {
              fieldId: 'f1',
              fieldName: 'F1',
              fieldType: 'SINGLE_SELECT',
              optionId: 'o1',
              optionName: 'O1',
            },
          ],
        }),
      ),
    ).toBe(true)
  })

  it('returns true when a points field is set', () => {
    expect(hasAdvancedSettings(settings({ pointsFieldId: 'pf' }))).toBe(true)
  })

  it('returns false for an empty exclusion array', () => {
    expect(hasAdvancedSettings(settings({ excludeConditions: [] }))).toBe(false)
  })
})

describe('formatAdvancedSettingsHint', () => {
  it('returns null when nothing is configured', () => {
    expect(formatAdvancedSettingsHint({ excludeCount: 0 })).toBeNull()
  })

  it('formats a single not-started option', () => {
    expect(formatAdvancedSettingsHint({ notStartedOptionName: 'Todo', excludeCount: 0 })).toBe(
      'Not started: Todo',
    )
  })

  it('singularizes one exclusion', () => {
    expect(formatAdvancedSettingsHint({ excludeCount: 1 })).toBe('1 exclusion')
  })

  it('pluralizes multiple exclusions', () => {
    expect(formatAdvancedSettingsHint({ excludeCount: 3 })).toBe('3 exclusions')
  })

  it('joins all configured parts with a middot', () => {
    expect(
      formatAdvancedSettingsHint({
        notStartedOptionName: 'Todo',
        excludeCount: 2,
        pointsFieldName: 'Estimate',
      }),
    ).toBe('Not started: Todo · 2 exclusions · Estimate')
  })
})
