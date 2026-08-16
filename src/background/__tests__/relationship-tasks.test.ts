// Characterization test for buildBulkRelationshipTasks.
//
// The blocked-by and blocking branches are the same sixty lines twice, and
// they differ only in which side of the pair owns the REST endpoint. These
// tests pin the exact request sequence each branch emits — method, path and
// body — so the collapse into one builder is provably equivalent. Written
// against the pre-refactor source.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const hoisted = vi.hoisted(() => ({
  rest: vi.fn(),
  listed: new Map<string, unknown[]>(),
}))

vi.mock('@/lib/debug-logger', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), verbose: vi.fn() },
}))

vi.mock('@/lib/queue', () => ({ sleep: vi.fn().mockResolvedValue(undefined) }))

vi.mock('@/background/rest-helpers', () => ({
  githubRest: (path: string, init?: RequestInit) => hoisted.rest(path, init),
  withRateLimitRetry: <T>(fn: () => Promise<T>) => fn(),
  parseRepoFromUrl: () => null,
}))

import { buildBulkRelationshipTasks } from '@/background/relationship-helpers'
import type { BulkEditRelationshipsUpdate, IssueRelationshipData } from '@/lib/messages'
import type { ResolvedItem } from '@/background/types'

/** `owner/repo#number` with a databaseId, the shape both branches consume. */
function issue(n: number, databaseId: number, repo = 'app'): IssueRelationshipData {
  return { databaseId, number: n, title: `#${n}`, repoOwner: 'acme', repoName: repo }
}

const item = {
  domId: 'issue:900',
  issueNodeId: 'I_900',
  projectItemId: 'PVTI_900',
  repoOwner: 'acme',
  repoName: 'app',
  issueDatabaseId: 900,
  issueNumber: 9,
  typename: 'Issue',
} as unknown as ResolvedItem

function relationships(patch: Partial<BulkEditRelationshipsUpdate>): BulkEditRelationshipsUpdate {
  return {
    parent: { clear: false },
    blockedBy: { add: [], remove: [], clear: false },
    blocking: { add: [], remove: [], clear: false },
    ...patch,
  }
}

/** Run every built task and return the REST calls they made, in order. */
async function calls(rels: BulkEditRelationshipsUpdate): Promise<string[]> {
  const tasks = buildBulkRelationshipTasks(item, rels)
  for (const task of tasks) await task.run()
  return hoisted.rest.mock.calls.map(([path, init]) => {
    const method = (init as RequestInit | undefined)?.method ?? 'GET'
    const body = (init as RequestInit | undefined)?.body
    return body ? `${method} ${path} ${body}` : `${method} ${path}`
  })
}

beforeEach(() => {
  hoisted.rest.mockReset()
  // every dependency listing starts empty unless a test says otherwise
  hoisted.rest.mockResolvedValue([])
})

describe('buildBulkRelationshipTasks — task selection', () => {
  it('builds nothing when there is no relationship payload', () => {
    expect(buildBulkRelationshipTasks(item, undefined)).toEqual([])
  })

  it('builds nothing for a pull request', () => {
    const pr = { ...item, typename: 'PullRequest' } as ResolvedItem
    expect(buildBulkRelationshipTasks(pr, relationships({ parent: { clear: true } }))).toEqual([])
  })

  it('names one task per touched relationship kind', () => {
    const tasks = buildBulkRelationshipTasks(
      item,
      relationships({
        parent: { set: issue(1, 101), clear: false },
        blockedBy: { add: [issue(2, 102)], remove: [], clear: false },
        blocking: { add: [issue(3, 103)], remove: [], clear: false },
      }),
    )
    expect(tasks.map((t) => t.id)).toEqual([
      'bulk-rel-parent-issue:900',
      'bulk-rel-blocked-by-issue:900',
      'bulk-rel-blocking-issue:900',
    ])
    expect(tasks.map((t) => t.detail)).toEqual([
      'Parent → acme/app#1',
      'Blocked by relationships',
      'Blocking relationships',
    ])
  })

  it('skips a kind that has no add, remove or clear', () => {
    const tasks = buildBulkRelationshipTasks(
      item,
      relationships({ blockedBy: { add: [issue(2, 102)], remove: [], clear: false } }),
    )
    expect(tasks.map((t) => t.id)).toEqual(['bulk-rel-blocked-by-issue:900'])
  })
})

describe('buildBulkRelationshipTasks — blocked_by wire calls', () => {
  it('adds against the item own repo, targeting the other issue id', async () => {
    expect(
      await calls(relationships({ blockedBy: { add: [issue(2, 102)], remove: [], clear: false } })),
    ).toEqual([
      'GET /repos/acme/app/issues/9/dependencies/blocked_by?per_page=100&page=1',
      'POST /repos/acme/app/issues/9/dependencies/blocked_by {"issue_id":102}',
    ])
  })

  it('clears by deleting every currently listed dependency', async () => {
    hoisted.rest.mockResolvedValueOnce([
      {
        issue: { id: 102, node_id: 'I_102', number: 2, title: '#2', repository_url: '' },
        repository: { full_name: 'acme/app' },
      },
    ])
    hoisted.rest.mockResolvedValue(undefined)

    expect(await calls(relationships({ blockedBy: { add: [], remove: [], clear: true } }))).toEqual(
      [
        'GET /repos/acme/app/issues/9/dependencies/blocked_by?per_page=100&page=1',
        'DELETE /repos/acme/app/issues/9/dependencies/blocked_by/102',
      ],
    )
  })

  it('ignores itself as a blocker', async () => {
    expect(
      await calls(relationships({ blockedBy: { add: [issue(9, 900)], remove: [], clear: false } })),
    ).toEqual(['GET /repos/acme/app/issues/9/dependencies/blocked_by?per_page=100&page=1'])
  })
})

describe('buildBulkRelationshipTasks — blocking wire calls', () => {
  it('adds against the OTHER issue repo, targeting the item id', async () => {
    expect(
      await calls(
        relationships({ blocking: { add: [issue(2, 102, 'other')], remove: [], clear: false } }),
      ),
    ).toEqual([
      'GET /repos/acme/app/issues/9/dependencies/blocking?per_page=100&page=1',
      'POST /repos/acme/other/issues/2/dependencies/blocked_by {"issue_id":900}',
    ])
  })

  it('clears by deleting the item from every issue it blocks', async () => {
    hoisted.rest.mockResolvedValueOnce([
      {
        issue: { id: 102, node_id: 'I_102', number: 2, title: '#2', repository_url: '' },
        repository: { full_name: 'acme/other' },
      },
    ])
    hoisted.rest.mockResolvedValue(undefined)

    expect(await calls(relationships({ blocking: { add: [], remove: [], clear: true } }))).toEqual([
      'GET /repos/acme/app/issues/9/dependencies/blocking?per_page=100&page=1',
      'DELETE /repos/acme/other/issues/2/dependencies/blocked_by/900',
    ])
  })

  it('ignores itself as a blocked issue', async () => {
    expect(
      await calls(relationships({ blocking: { add: [issue(9, 900)], remove: [], clear: false } })),
    ).toEqual(['GET /repos/acme/app/issues/9/dependencies/blocking?per_page=100&page=1'])
  })
})

describe('buildBulkRelationshipTasks — parent wire calls', () => {
  it('sets a parent by adding the item as a sub-issue of the parent', async () => {
    expect(
      await calls(relationships({ parent: { set: issue(1, 101, 'parentrepo'), clear: false } })),
    ).toEqual([
      'POST /repos/acme/parentrepo/issues/1/sub_issues {"sub_issue_id":900,"replace_parent":true}',
    ])
  })

  it('clears a known parent by removing the sub-issue link', async () => {
    const withParent = { ...item, currentParent: issue(1, 101, 'parentrepo') } as ResolvedItem
    const tasks = buildBulkRelationshipTasks(withParent, relationships({ parent: { clear: true } }))
    for (const task of tasks) await task.run()

    expect(hoisted.rest.mock.calls.map(([p, i]) => `${(i as RequestInit).method} ${p}`)).toEqual([
      'DELETE /repos/acme/parentrepo/issues/1/sub_issue',
    ])
  })
})
