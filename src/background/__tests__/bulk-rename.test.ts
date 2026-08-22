// Characterization tests for bulkTransfer / bulkRename / bulkRandomAssign.
//
// These three deliberately differ from the uniform bulk-state shape:
//   - bulkTransfer resolves a target repository *before* resolving items
//   - bulkRename never calls resolveProjectItemIds — it trusts data.renames
//   - bulkRandomAssign emits a bespoke "No valid items found" frame and issues
//     two mutations (+ two sleeps) per task
// The shared-runner refactor has to accommodate all three, so pin them.

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { QueueState, QueueTask } from '@/lib/queue'

const hoisted = vi.hoisted(() => ({
  isBulkFull: vi.fn(() => false),
  acquireBulk: vi.fn(),
  releaseBulk: vi.fn(),
  broadcastQueue: vi.fn(async (_state: Record<string, unknown>, _tabId?: number) => {}),
  resolveProjectItemIds: vi.fn(async () => [] as unknown[]),
  getRepositoryId: vi.fn(async (_owner: string, _name: string) => 'R_target'),
  processQueue: vi.fn(async () => {}),
  gql: vi.fn(async (_doc: string, _vars?: Record<string, unknown>): Promise<unknown> => ({})),
  sleep: vi.fn(async (_ms: number) => {}),
  handlers: new Map<
    string,
    (msg: { data: never; sender: { tab?: { id?: number } } }) => Promise<unknown>
  >(),
}))

vi.mock('@/lib/debug-logger', () => ({
  logger: { log: () => {}, warn: () => {}, error: () => {}, info: () => {} },
}))

vi.mock('@/lib/messages', () => ({
  onMessage: (type: string, handler: never) => {
    hoisted.handlers.set(type, handler)
  },
}))

vi.mock('@/background/concurrency', () => ({
  isBulkFull: hoisted.isBulkFull,
  acquireBulk: hoisted.acquireBulk,
  releaseBulk: hoisted.releaseBulk,
}))

vi.mock('@/background/rest-helpers', () => ({ broadcastQueue: hoisted.broadcastQueue }))
vi.mock('@/background/project-helpers', () => ({
  resolveProjectItemIds: hoisted.resolveProjectItemIds,
  getRepositoryId: hoisted.getRepositoryId,
}))
vi.mock('@/lib/queue', () => ({ processQueue: hoisted.processQueue, sleep: hoisted.sleep }))
vi.mock('@/lib/graphql-client', () => ({ gql: hoisted.gql }))
vi.mock('@/lib/graphql-mutations', () => ({
  ADD_ASSIGNEES: 'MUT_ADD_ASSIGNEES',
  REMOVE_ASSIGNEES: 'MUT_REMOVE_ASSIGNEES',
  TRANSFER_ISSUE: 'MUT_TRANSFER',
  UPDATE_ISSUE_TITLE: 'MUT_ISSUE_TITLE',
  UPDATE_PR_TITLE: 'MUT_PR_TITLE',
}))
vi.mock('@/lib/graphql-queries', () => ({ GET_ISSUE_ASSIGNEES: 'Q_ASSIGNEES' }))

import { registerBulkRenameHandlers } from '@/background/bulk-rename'

const PROJECT_ID = 'PVT_project'
const TAB_ID = 3

function makeItems(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    domId: `issue:${i + 1}`,
    issueNodeId: `I_node${i + 1}`,
    projectItemId: `PVTI_item${i + 1}`,
    repoOwner: 'acme',
    repoName: 'web',
  }))
}

async function runVerb(
  type: string,
  data: Record<string, unknown>,
  states: QueueState[] = [],
): Promise<{ tasks: QueueTask[]; processId: string | undefined }> {
  let tasks: QueueTask[] = []
  let processId: string | undefined
  hoisted.processQueue.mockImplementation((async (
    queued: QueueTask[],
    onState?: (s: QueueState) => Promise<void> | void,
    id?: string,
  ) => {
    tasks = queued
    processId = id
    for (const state of states) await onState?.(state)
  }) as never)

  await hoisted.handlers.get(type)!({ data: data as never, sender: { tab: { id: TAB_ID } } })
  return { tasks, processId }
}

function frames(): Record<string, unknown>[] {
  return hoisted.broadcastQueue.mock.calls.map(
    (call) => (call as unknown as [Record<string, unknown>, number])[0],
  )
}

describe('bulkTransfer / bulkRename / bulkRandomAssign — characterization', () => {
  beforeEach(() => {
    hoisted.handlers.clear()
    vi.clearAllMocks()
    hoisted.isBulkFull.mockReturnValue(false)
    hoisted.resolveProjectItemIds.mockResolvedValue(makeItems(2))
    hoisted.getRepositoryId.mockResolvedValue('R_target')
    hoisted.processQueue.mockImplementation((async () => {}) as never)
    hoisted.gql.mockResolvedValue({})
    registerBulkRenameHandlers()
  })

  it('registers exactly the 3 verbs', () => {
    expect([...hoisted.handlers.keys()].sort()).toEqual([
      'bulkRandomAssign',
      'bulkRename',
      'bulkTransfer',
    ])
  })

  it.each(['bulkTransfer', 'bulkRename', 'bulkRandomAssign'])(
    '%s short-circuits when bulk is full',
    async (type) => {
      hoisted.isBulkFull.mockReturnValue(true)
      await runVerb(type, {
        itemIds: ['issue:1'],
        projectId: PROJECT_ID,
        renames: [],
        assignments: [],
      })

      expect(hoisted.acquireBulk).not.toHaveBeenCalled()
      expect(hoisted.broadcastQueue).not.toHaveBeenCalled()
    },
  )

  describe('bulkTransfer', () => {
    const data = {
      itemIds: ['issue:1', 'issue:2'],
      projectId: PROJECT_ID,
      targetRepoOwner: 'acme',
      targetRepoName: 'api',
    }

    it('narrates both preparation steps before resolving items', async () => {
      const { processId } = await runVerb('bulkTransfer', data)

      expect(processId).toMatch(/^transfer-\d+-[a-z0-9]+$/)
      expect(frames().slice(0, 2)).toEqual([
        {
          total: 2,
          completed: 0,
          paused: false,
          status: 'Resolving target repository...',
          processId,
          label: 'Transfer · 2 items',
        },
        {
          total: 2,
          completed: 0,
          paused: false,
          status: 'Resolving items...',
          processId,
          label: 'Transfer · 2 items',
        },
      ])
      expect(hoisted.getRepositoryId).toHaveBeenCalledWith('acme', 'api')
    })

    it('resolves the repository before it resolves items', async () => {
      const order: string[] = []
      hoisted.getRepositoryId.mockImplementation(async () => {
        order.push('repo')
        return 'R_target'
      })
      hoisted.resolveProjectItemIds.mockImplementation(async () => {
        order.push('items')
        return makeItems(2)
      })
      await runVerb('bulkTransfer', data)

      expect(order).toEqual(['repo', 'items'])
    })

    it('transfers each item to the resolved repository id and paces at 1000ms', async () => {
      const { tasks } = await runVerb('bulkTransfer', data)

      expect(tasks.map((t) => t.id)).toEqual(['transfer-issue:1', 'transfer-issue:2'])
      await tasks[0].run()
      expect(hoisted.gql).toHaveBeenCalledWith('MUT_TRANSFER', {
        issueId: 'I_node1',
        repositoryId: 'R_target',
      })
      expect(hoisted.sleep).toHaveBeenCalledWith(1000)
    })

    it('renders Transferring progress strings', async () => {
      await runVerb('bulkTransfer', data, [
        { total: 2, completed: 0, paused: false },
        { total: 2, completed: 2, paused: false },
      ])

      const statuses = frames().map((f) => f.status)
      expect(statuses).toContain('Transferring item 1 of 2…')
      expect(statuses).toContain('Transferring 2 items…')
      expect(statuses.at(-1)).toBe('Done!')
    })

    it('aborts when nothing resolves', async () => {
      hoisted.resolveProjectItemIds.mockResolvedValue([])
      await runVerb('bulkTransfer', data)

      expect(hoisted.processQueue).not.toHaveBeenCalled()
      expect(hoisted.releaseBulk).toHaveBeenCalledTimes(1)
    })
  })

  describe('bulkRename', () => {
    const data = {
      itemIds: ['issue:1', 'issue:2'],
      projectId: PROJECT_ID,
      renames: [
        { domId: 'issue:1', issueNodeId: 'I_node1', newTitle: 'first', typename: 'Issue' },
        { domId: 'issue:2', issueNodeId: 'I_node2', newTitle: 'second', typename: 'PullRequest' },
      ],
    }

    it('never resolves project item ids — it trusts the supplied renames', async () => {
      await runVerb('bulkRename', data)
      expect(hoisted.resolveProjectItemIds).not.toHaveBeenCalled()
    })

    it('labels and counts off data.renames, not data.itemIds', async () => {
      const { processId } = await runVerb('bulkRename', { ...data, itemIds: ['a', 'b', 'c', 'd'] })

      expect(processId).toMatch(/^rename-\d+-[a-z0-9]+$/)
      expect(frames()[0]).toMatchObject({
        total: 2,
        status: 'Renaming items...',
        label: 'Rename · 2 items',
      })
    })

    it('routes PullRequest titles to the PR mutation and issues to the issue mutation', async () => {
      const { tasks } = await runVerb('bulkRename', data)

      expect(tasks.map((t) => t.id)).toEqual(['rename-issue:1', 'rename-issue:2'])

      await tasks[0].run()
      expect(hoisted.gql).toHaveBeenLastCalledWith('MUT_ISSUE_TITLE', {
        issueId: 'I_node1',
        title: 'first',
      })

      await tasks[1].run()
      expect(hoisted.gql).toHaveBeenLastCalledWith('MUT_PR_TITLE', {
        prId: 'I_node2',
        title: 'second',
      })
      expect(hoisted.sleep).toHaveBeenCalledWith(1000)
    })

    it('renders Renaming progress strings', async () => {
      await runVerb('bulkRename', data, [
        { total: 2, completed: 0, paused: false },
        { total: 2, completed: 2, paused: false },
      ])

      const statuses = frames().map((f) => f.status)
      expect(statuses).toContain('Renaming item 1 of 2…')
      expect(statuses).toContain('Renaming 2 items…')
      expect(statuses.at(-1)).toBe('Done!')
    })
  })

  describe('bulkRandomAssign', () => {
    const data = {
      itemIds: ['issue:1', 'issue:2'],
      projectId: PROJECT_ID,
      strategy: 'balanced',
      assignments: [
        { itemId: 'issue:1', assigneeIds: ['U_a'] },
        { itemId: 'issue:2', assigneeIds: ['U_b'] },
      ],
    }

    it('emits a bespoke "No valid items found" frame instead of silently aborting', async () => {
      hoisted.resolveProjectItemIds.mockResolvedValue([])
      await runVerb('bulkRandomAssign', data)

      expect(frames().at(-1)).toEqual({
        total: 0,
        completed: 0,
        paused: false,
        status: 'No valid items found',
        processId: expect.stringMatching(/^assign-\d+-[a-z0-9]+$/),
        label: 'Random assign · 2 items',
      })
      expect(hoisted.processQueue).not.toHaveBeenCalled()
      expect(hoisted.releaseBulk).toHaveBeenCalledTimes(1)
    })

    it('skips assignments with no assignees and those with no resolved issue', async () => {
      hoisted.resolveProjectItemIds.mockResolvedValue(makeItems(1))
      const { tasks } = await runVerb('bulkRandomAssign', {
        ...data,
        assignments: [
          { itemId: 'issue:1', assigneeIds: ['U_a'] },
          { itemId: 'issue:2', assigneeIds: ['U_b'] }, // not resolved
          { itemId: 'issue:1', assigneeIds: [] }, // no assignees
        ],
      })

      expect(tasks.map((t) => t.id)).toEqual(['assign-issue:1'])
      expect(tasks[0].detail).toBe('Clearing and reassigning…')
    })

    it('clears existing assignees before adding, sleeping 1000ms after each mutation', async () => {
      hoisted.gql.mockResolvedValueOnce({ node: { assignees: { nodes: [{ id: 'U_old' }] } } })
      const { tasks } = await runVerb('bulkRandomAssign', data)
      await tasks[0].run()

      expect(hoisted.gql.mock.calls.map((c) => c[0])).toEqual([
        'Q_ASSIGNEES',
        'MUT_REMOVE_ASSIGNEES',
        'MUT_ADD_ASSIGNEES',
      ])
      expect(hoisted.gql).toHaveBeenCalledWith('MUT_REMOVE_ASSIGNEES', {
        assignableId: 'I_node1',
        assigneeIds: ['U_old'],
      })
      expect(hoisted.gql).toHaveBeenCalledWith('MUT_ADD_ASSIGNEES', {
        assignableId: 'I_node1',
        assigneeIds: ['U_a'],
      })
      expect(hoisted.sleep).toHaveBeenCalledTimes(2)
      expect(hoisted.sleep).toHaveBeenCalledWith(1000)
    })

    it('skips the remove mutation when the issue has no current assignees', async () => {
      hoisted.gql.mockResolvedValueOnce({ node: { assignees: { nodes: [] } } })
      const { tasks } = await runVerb('bulkRandomAssign', data)
      await tasks[0].run()

      expect(hoisted.gql.mock.calls.map((c) => c[0])).toEqual(['Q_ASSIGNEES', 'MUT_ADD_ASSIGNEES'])
      expect(hoisted.sleep).toHaveBeenCalledTimes(1)
    })

    it('renders Clearing and reassigning progress strings', async () => {
      await runVerb('bulkRandomAssign', data, [
        { total: 2, completed: 0, paused: false },
        { total: 2, completed: 2, paused: false },
      ])

      const statuses = frames().map((f) => f.status)
      expect(statuses).toContain('Clearing and reassigning item 1 of 2…')
      expect(statuses).toContain('Reassigned 2 items…')
      expect(statuses.at(-1)).toBe('Done!')
    })
  })
})
