export const patStorage = storage.defineItem<string>('local:pat', {
  defaultValue: '',
})

export const usernameStorage = storage.defineItem<string>('local:username', {
  defaultValue: '',
})

export interface ExcludeCondition {
  fieldId: string
  fieldName: string
  fieldType: 'SINGLE_SELECT' | 'TEXT'
  optionId: string    // SINGLE_SELECT: option node ID; TEXT: empty string
  optionName: string  // SINGLE_SELECT: display label; TEXT: exact text value to match
}

export interface SprintSettings {
  sprintFieldId: string
  sprintFieldName: string
  doneFieldId: string
  doneFieldName: string
  doneFieldType: 'SINGLE_SELECT' | 'TEXT'
  doneOptionId: string
  doneOptionName: string
  acknowledgedSprintId?: string
  excludeConditions?: ExcludeCondition[]
}

export const allSprintSettingsStorage = storage.defineItem<Record<string, SprintSettings>>(
  'local:allSprintSettings',
  { defaultValue: {} },
)

export const onboardingDismissedStorage = storage.defineItem<boolean>(
  'local:rgp:onboarding:dismissed',
  { defaultValue: false },
)

export const debugStorage = storage.defineItem<boolean>(
  'local:rgp:debug',
  { defaultValue: false },
)
