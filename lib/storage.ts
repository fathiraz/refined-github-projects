export const patStorage = storage.defineItem<string>('local:pat', {
  defaultValue: '',
})

export const usernameStorage = storage.defineItem<string>('local:username', {
  defaultValue: '',
})

export interface SprintSettings {
  sprintFieldId: string
  sprintFieldName: string
  doneFieldId: string
  doneFieldName: string
  doneFieldType: 'SINGLE_SELECT' | 'TEXT'
  doneOptionId: string
  doneOptionName: string
  acknowledgedSprintId?: string
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
