// Characterization tests for bulkReorder / bulkReorderByPosition.
//
// Two things here are easy to lose in a shared-runner refactor and are pinned
// deliberately:
//   1. Reorder tasks carry NO sleep(1000) — repositioning is not a
//      content-creating mutation, so the anti-abuse pacing does not apply.
//   2. The label is caller-overridable (`data.label ?? 'Move · N items'`).
// bulkReorderByPosition's ordering maths is also pinned, since it is the only
// non-trivial computation in the background layer.

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { QueueState, QueueTask } from '@/lib/queue'

const hoisted = vi.hoisted(() => ({
  isBulkFull: vi.fn(() => false),
  acquireBulk: vi.fn(),
  releaseBulk: vi.fn(),
  broadcastQueue: vi.fn(async (_state: Record<string, unknown>, _tabId?: number) => {}),
  withRateLimitRetry: vi.fn(async (fn: () => Promise<unknown>) => fn()),
  getProjectFieldsData: vi.fn(
    async (): Promise<{ project: { id: string } | null }> => ({ project: { id: 'PVT_project' } }),
  ),
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

vi.mock('@/background/rest-helpers', () => ({
  broadcastQueue: hoisted.broadcastQueue,
  withRateLimitRetry: hoisted.withRateLimitRetry,
}))
// Only the network call is stubbed; `createIssueRefIndex` stays real so the
// dom-id spelling assertions below still exercise the shipped resolver.
vi.mock('@/background/project-helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/background/project-helpers')>()),
  getProjectFieldsData: hoisted.getProjectFieldsData,
}))
vi.mock('@/lib/queue', () => ({ processQueue: hoisted.processQueue, sleep: hoisted.sleep }))
vi.mock('@/lib/graphql-client', () => ({ gql: hoisted.gql }))
vi.mock('@/lib/graphql-queries', () => ({
  GET_PROJECT_ITEMS_FOR_REORDER: 'Q_REORDER',
  UPDATE_PROJECT_ITEM_POSITION: 'MUT_POSITION',
}))

import { registerBulkPositionHandlers } from '@/background/bulk-position'

const PROJECT_ID = 'PVT_project'
const TAB_ID = 5

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

/** One page of project items, shaped as the reorder query returns them. */
function itemsPage(
  items: { id: string; databaseId: number; contentDbId: number; contentNumber?: number }[],
) {
  return {
    node: {
      items: {
        pageInfo: { hasNextPage: false, endCursor: null },
        nodes: items.map((i) => ({
          id: i.id,
          databaseId: i.databaseId,
          content: { databaseId: i.contentDbId, number: i.contentNumber },
        })),
      },
    },
  }
}

describe('bulk position verbs — characterization', () => {
  beforeEach(() => {
    hoisted.handlers.clear()
    vi.clearAllMocks()
    hoisted.isBulkFull.mockReturnValue(false)
    hoisted.withRateLimitRetry.mockImplementation(async (fn: () => Promise<unknown>) => fn())
    hoisted.getProjectFieldsData.mockResolvedValue({ project: { id: PROJECT_ID } })
    hoisted.processQueue.mockImplementation((async () => {}) as never)
    registerBulkPositionHandlers()
  })

  it('registers exactly the 2 position verbs', () => {
    expect([...hoisted.handlers.keys()].sort()).toEqual(['bulkReorder', 'bulkReorderByPosition'])
  })

  describe('bulkReorder', () => {
    const data = {
      projectId: PROJECT_ID,
      reorderOps: [
        { nodeId: 'PVTI_a', previousNodeId: null },
        { nodeId: 'PVTI_b', previousNodeId: 'PVTI_a' },
      ],
    }

    it('short-circuits when bulk is full', async () => {
      hoisted.isBulkFull.mockReturnValue(true)
      await runVerb('bulkReorder', data)

      expect(hoisted.acquireBulk).not.toHaveBeenCalled()
      expect(hoisted.broadcastQueue).not.toHaveBeenCalled()
    })

    it('opens with Moving items... sized by the op count', async () => {
      const { processId } = await runVerb('bulkReorder', data)

      expect(processId).toMatch(/^reorder-\d+-[a-z0-9]+$/)
      expect(frames()[0]).toEqual({
        total: 2,
        completed: 0,
        paused: false,
        status: 'Moving items...',
        processId,
        label: 'Move · 2 items',
      })
    })

    it('lets the caller override the label', async () => {
      await runVerb('bulkReorder', { ...data, label: 'Send to top · 2 items' })
      expect(frames()[0].label).toBe('Send to top · 2 items')
    })

    it('indexes task ids by position, not by dom id', async () => {
      const { tasks } = await runVerb('bulkReorder', data)
      expect(tasks.map((t) => t.id)).toEqual(['reorder-0', 'reorder-1'])
    })

    it('maps a null previousNodeId to an undefined afterId', async () => {
      const { tasks } = await runVerb('bulkReorder', data)

      await tasks[0].run()
      expect(hoisted.gql).toHaveBeenLastCalledWith('MUT_POSITION', {
        input: { projectId: PROJECT_ID, itemId: 'PVTI_a', afterId: undefined },
      })

      await tasks[1].run()
      expect(hoisted.gql).toHaveBeenLastCalledWith('MUT_POSITION', {
        input: { projectId: PROJECT_ID, itemId: 'PVTI_b', afterId: 'PVTI_a' },
      })
    })

    it('does NOT pace reorder mutations — repositioning creates no content', async () => {
      const { tasks } = await runVerb('bulkReorder', data)
      await tasks[0].run()

      expect(hoisted.sleep).not.toHaveBeenCalled()
    })

    it('renders Moving progress strings and the Done! frame', async () => {
      await runVerb('bulkReorder', data, [
        { total: 2, completed: 0, paused: false },
        { total: 2, completed: 2, paused: false },
      ])

      const statuses = frames().map((f) => f.status)
      expect(statuses).toContain('Moving item 1 of 2…')
      expect(statuses).toContain('Moving 2 items…')
      expect(statuses.at(-1)).toBe('Done!')
      expect(hoisted.releaseBulk).toHaveBeenCalledTimes(1)
    })
  })

  describe('bulkReorderByPosition', () => {
    const base = {
      owner: 'acme',
      number: 1,
      isOrg: false,
      selectedDomIds: ['issue:20'],
      allDomIds: ['issue:10', 'issue:20', 'issue:30'],
      insertAfterDomId: null as string | null,
    }

    // contentDbId and contentNumber are deliberately different values: a real
    // issue's databaseId is ~4 billion while its number is small, and the two
    // id spellings carry one each.
    const page = () =>
      itemsPage([
        { id: 'PVTI_10', databaseId: 110, contentDbId: 10, contentNumber: 1 },
        { id: 'PVTI_20', databaseId: 120, contentDbId: 20, contentNumber: 2 },
        { id: 'PVTI_30', databaseId: 130, contentDbId: 30, contentNumber: 3 },
      ])

    it('short-circuits when bulk is full', async () => {
      hoisted.isBulkFull.mockReturnValue(true)
      await runVerb('bulkReorderByPosition', base)

      expect(hoisted.acquireBulk).not.toHaveBeenCalled()
      expect(hoisted.gql).not.toHaveBeenCalled()
    })

    it('uses the reorder processId prefix and a Move label', async () => {
      hoisted.gql.mockResolvedValue(page())
      const { processId } = await runVerb('bulkReorderByPosition', base)

      expect(processId).toMatch(/^reorder-pos-\d+-[a-z0-9]+$/)
      expect(frames()[0]).toMatchObject({ status: 'Moving items...', label: 'Move · 1 item' })
    })

    it('moves the selection to the top when no insertion target is given', async () => {
      hoisted.gql.mockResolvedValue(page())
      const { tasks } = await runVerb('bulkReorderByPosition', base)

      // selected first, then the rest → issue:20 lands at the head (afterId undefined)
      expect(tasks).toHaveLength(1)
      await tasks[0].run()
      expect(hoisted.gql).toHaveBeenLastCalledWith('MUT_POSITION', {
        input: { projectId: PROJECT_ID, itemId: 'PVTI_20', afterId: undefined },
      })
    })

    it('inserts after the named target when one is given', async () => {
      hoisted.gql.mockResolvedValue(page())
      const { tasks } = await runVerb('bulkReorderByPosition', {
        ...base,
        selectedDomIds: ['issue:10'],
        insertAfterDomId: 'issue:30',
      })

      await tasks[0].run()
      expect(hoisted.gql).toHaveBeenLastCalledWith('MUT_POSITION', {
        input: { projectId: PROJECT_ID, itemId: 'PVTI_10', afterId: 'PVTI_30' },
      })
    })

    it('resolves the hyphen spelling by issue number', async () => {
      hoisted.gql.mockResolvedValue(page())
      // issue-2 is issue NUMBER 2, which is the item whose contentDbId is 20
      const { tasks } = await runVerb('bulkReorderByPosition', {
        ...base,
        selectedDomIds: ['issue-2'],
        allDomIds: ['issue-1', 'issue-2', 'issue-3'],
      })

      expect(tasks).toHaveLength(1)
      await tasks[0].run()
      expect(hoisted.gql).toHaveBeenLastCalledWith('MUT_POSITION', {
        input: { projectId: PROJECT_ID, itemId: 'PVTI_20', afterId: undefined },
      })
    })

    it('does not resolve a hyphen id against a content databaseId', async () => {
      hoisted.gql.mockResolvedValue(page())
      // no item has issue number 20 — the hyphen spelling must not fall back
      // to matching contentDbId 20, which is what produced wrong-item moves
      const { tasks } = await runVerb('bulkReorderByPosition', {
        ...base,
        selectedDomIds: ['issue-20'],
        allDomIds: ['issue-20'],
      })

      expect(tasks).toEqual([])
    })

    it('resolves a mixed batch of both spellings', async () => {
      hoisted.gql.mockResolvedValue(page())
      const { tasks } = await runVerb('bulkReorderByPosition', {
        ...base,
        selectedDomIds: ['issue:10', 'issue-3'],
        allDomIds: ['issue:10', 'issue:20', 'issue-3'],
      })

      expect(tasks).toHaveLength(2)
    })

    it('honours an insertion target given in the hyphen spelling', async () => {
      hoisted.gql.mockResolvedValue(page())
      const { tasks } = await runVerb('bulkReorderByPosition', {
        ...base,
        selectedDomIds: ['issue-1'],
        insertAfterDomId: 'issue-3',
      })

      await tasks[0].run()
      expect(hoisted.gql).toHaveBeenLastCalledWith('MUT_POSITION', {
        input: { projectId: PROJECT_ID, itemId: 'PVTI_10', afterId: 'PVTI_30' },
      })
    })

    it('throws through to the finally block when the project cannot be found', async () => {
      hoisted.getProjectFieldsData.mockResolvedValue({ project: null })
      await expect(runVerb('bulkReorderByPosition', base)).rejects.toThrow('Project not found')

      expect(hoisted.releaseBulk).toHaveBeenCalledTimes(1)
    })

    it('renders Moving / Moved progress strings', async () => {
      hoisted.gql.mockResolvedValue(page())
      await runVerb('bulkReorderByPosition', base, [
        { total: 1, completed: 0, paused: false },
        { total: 1, completed: 1, paused: false },
      ])

      const statuses = frames().map((f) => f.status)
      expect(statuses).toContain('Moving item 1 of 1…')
      expect(statuses).toContain('Moved 1 items')
      expect(statuses.at(-1)).toBe('Done!')
    })
  })
})
