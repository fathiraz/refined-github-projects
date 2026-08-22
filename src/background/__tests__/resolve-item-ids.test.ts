// Regression test for the two DOM id spellings.
//
// A project item can reach the background under either of two spellings, and
// the separator is what says which number it carries:
//
//   issue:4140984079  — colon, from `data-hovercard-subject-tag`  → databaseId
//   issue-58          — hyphen, scraped from an `/issues/58` href → issue NUMBER
//
// Both spellings describe the SAME issue. Treating the hyphen form's number as
// a databaseId can never match, which surfaced as
// "[runHandler:getHierarchyData] failed … Item issue-58 not found in project".

import { beforeEach, describe, expect, it, vi } from 'vitest'

const hoisted = vi.hoisted(() => ({ gql: vi.fn() }))

vi.mock('@/lib/debug-logger', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), verbose: vi.fn() },
}))
vi.mock('@/lib/queue', () => ({ sleep: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/graphql-client', () => ({ gql: hoisted.gql }))
vi.mock('@/background/rest-helpers', () => ({
  withRateLimitRetry: <T>(fn: () => Promise<T>) => fn(),
  broadcastQueue: vi.fn(),
}))
vi.mock('@/background/cache', () => ({
  fieldsCache: new Map(),
  FIELDS_CACHE_TTL_MS: 60_000,
  pruneExpiredCache: vi.fn(),
}))

import { resolveProjectItemIds } from '@/background/project-helpers'

/** The real board's shape: issue #58 whose content databaseId is 4140984079. */
const ONE_PAGE = {
  node: {
    items: {
      pageInfo: { hasNextPage: false, endCursor: null },
      nodes: [
        {
          id: 'PVTI_item58',
          content: {
            __typename: 'Issue',
            id: 'I_issue58',
            databaseId: 4140984079,
            number: 58,
            repository: { owner: { login: 'fathiraz' }, name: 'nistip' },
          },
        },
      ],
    },
  },
}

beforeEach(() => {
  hoisted.gql.mockReset()
  hoisted.gql.mockResolvedValue(ONE_PAGE)
})

describe('resolveProjectItemIds — DOM id spellings', () => {
  it('resolves the colon spelling by content databaseId', async () => {
    const resolved = await resolveProjectItemIds(['issue:4140984079'], 'PVT_1')

    expect(resolved).toHaveLength(1)
    expect(resolved[0].projectItemId).toBe('PVTI_item58')
    expect(resolved[0].domId).toBe('issue:4140984079')
  })

  it('resolves the hyphen spelling by content number', async () => {
    // 58 is the issue NUMBER here, not a databaseId — the whole point.
    const resolved = await resolveProjectItemIds(['issue-58'], 'PVT_1')

    expect(resolved).toHaveLength(1)
    expect(resolved[0].projectItemId).toBe('PVTI_item58')
    expect(resolved[0].domId).toBe('issue-58')
  })

  it('does not mistake an issue number for a databaseId', async () => {
    // there is no item whose databaseId is 58, so a naive lookup finds nothing
    const resolved = await resolveProjectItemIds(['issue:58'], 'PVT_1')

    expect(resolved).toEqual([])
  })

  it('resolves a mixed batch of both spellings to the same item once each', async () => {
    const resolved = await resolveProjectItemIds(['issue:4140984079', 'issue-58'], 'PVT_1')

    expect(resolved.map((r) => r.domId).sort()).toEqual(['issue-58', 'issue:4140984079'])
  })
})
