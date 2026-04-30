import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/messages', () => ({
  sendMessage: vi.fn(),
}))

import { extractProjectContext, fetchProjectFields } from '@/lib/github-project'

describe('extractProjectContext', () => {
  it('extracts org project context', () => {
    const ctx = extractProjectContext('/orgs/kitabisa/projects/58')
    expect(ctx).toEqual({
      owner: 'kitabisa',
      number: 58,
      isOrg: true,
      projectId: 'org-project-58',
    })
  })

  it('extracts user namespace project context', () => {
    const ctx = extractProjectContext('/users/octocat/projects/5')
    expect(ctx).toEqual({
      owner: 'octocat',
      number: 5,
      isOrg: false,
      projectId: 'user-project-5',
    })
  })

  it('extracts user project context', () => {
    const ctx = extractProjectContext('/octocat/projects/3')
    expect(ctx).toEqual({
      owner: 'octocat',
      number: 3,
      isOrg: false,
      projectId: 'user-project-3',
    })
  })

  it('returns null for non-project paths', () => {
    expect(extractProjectContext('/some/random/path')).toBeNull()
    expect(extractProjectContext('')).toBeNull()
  })
})

describe('fetchProjectFields', () => {
  it('fetches fields via sendMessage', async () => {
    const { sendMessage } = await import('@/lib/messages')
    vi.mocked(sendMessage as any).mockResolvedValue({ id: 'p1', title: 'Test', fields: [] })
    const result = await fetchProjectFields({ owner: 'o', number: 1, isOrg: true })
    expect(result.title).toBe('Test')
  })

  it('returns fallback on error', async () => {
    const { sendMessage } = await import('@/lib/messages')
    vi.mocked(sendMessage as any).mockRejectedValue(new Error('boom'))
    const result = await fetchProjectFields({ owner: 'o', number: 1, isOrg: true })
    expect(result).toEqual({ id: '', title: 'Project', fields: [] })
  })
})
