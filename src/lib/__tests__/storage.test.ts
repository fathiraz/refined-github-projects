import { describe, it, expect, vi, beforeEach } from 'vitest'

const defineItemMock = vi.fn((key: string, options?: unknown) => ({ key, options }))

vi.stubGlobal('storage', { defineItem: defineItemMock })

describe('storage items', () => {
  beforeEach(() => {
    defineItemMock.mockClear()
    vi.resetModules()
  })

  it('defines patStorage with local:pat and empty default', async () => {
    await import('../storage')
    expect(defineItemMock).toHaveBeenCalledWith('local:pat', { defaultValue: '' })
  })

  it('defines usernameStorage with local:username and empty default', async () => {
    await import('../storage')
    expect(defineItemMock).toHaveBeenCalledWith('local:username', { defaultValue: '' })
  })

  it('defines allSprintSettingsStorage with local:allSprintSettings and empty object default', async () => {
    await import('../storage')
    expect(defineItemMock).toHaveBeenCalledWith('local:allSprintSettings', { defaultValue: {} })
  })

  it('defines onboardingDismissedStorage with local:rgp:onboarding:dismissed and false default', async () => {
    await import('../storage')
    expect(defineItemMock).toHaveBeenCalledWith('local:rgp:onboarding:dismissed', {
      defaultValue: false,
    })
  })

  it('defines debugStorage with local:rgp:debug and false default', async () => {
    await import('../storage')
    expect(defineItemMock).toHaveBeenCalledWith('local:rgp:debug', { defaultValue: false })
  })
})
