// Characterization tests for the 7 bulk state-change verbs.
//
// These pin the exact `broadcastQueue` payload sequence each verb emits today —
// label wording, per-item progress strings, processId prefix, the mandatory
// sleep(1000) between mutations, the isBulkFull short-circuit, and bulkClose's
// Undo `reverse` hint. They exist so the shared-runner refactor can be proven
// behaviour-preserving rather than hoped to be.

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { QueueState, QueueTask } from '@/lib/queue'

const hoisted = vi.hoisted(() => ({
  isBulkFull: vi.fn(() => false),
  acquireBulk: vi.fn(),
  releaseBulk: vi.fn(),
  broadcastQueue: vi.fn(async (_state: Record<string, unknown>, _tabId?: number) => {}),
  resolveProjectItemIds: vi.fn(async () => [] as unknown[]),
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
}))
vi.mock('@/lib/queue', () => ({ processQueue: hoisted.processQueue, sleep: hoisted.sleep }))
vi.mock('@/lib/graphql-client', () => ({ gql: hoisted.gql }))

// sentinel mutation documents so each verb's GraphQL call is identifiable
vi.mock('@/lib/graphql-mutations', () => ({
  CLOSE_ISSUE: 'MUT_CLOSE',
  REOPEN_ISSUE: 'MUT_REOPEN',
  LOCK_ISSUE: 'MUT_LOCK',
  UNLOCK_ISSUE: 'MUT_UNLOCK',
  PIN_ISSUE: 'MUT_PIN',
  UNPIN_ISSUE: 'MUT_UNPIN',
  DELETE_PROJECT_ITEM: 'MUT_DELETE_ITEM',
}))

import { registerBulkStateHandlers } from '@/background/bulk-state'

const PROJECT_ID = 'PVT_project'
const TAB_ID = 7

function makeItems(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    domId: `issue:${i + 1}`,
    issueNodeId: `I_node${i + 1}`,
    projectItemId: `PVTI_item${i + 1}`,
    repoOwner: 'acme',
    repoName: 'web',
  }))
}

/** Drive a verb end-to-end, feeding `processQueue` the supplied progress states. */
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

  await hoisted.handlers.get(type)!({
    data: data as never,
    sender: { tab: { id: TAB_ID } },
  })
  return { tasks, processId }
}

/** Every `broadcastQueue` payload, in order. */
function frames(): Record<string, unknown>[] {
  return hoisted.broadcastQueue.mock.calls.map(
    (call) => (call as unknown as [Record<string, unknown>, number])[0],
  )
}

interface VerbCase {
  type: string
  idPrefix: string
  label: string
  /** progress verb, e.g. `Closing item 1 of 3…` */
  progress: string
  mutation: string
  /** GraphQL variables expected for the first fixture item */
  variables: Record<string, unknown>
  extraData?: Record<string, unknown>
}

const VERBS: VerbCase[] = [
  {
    type: 'bulkClose',
    idPrefix: 'close',
    label: 'Bulk close',
    progress: 'Closing',
    mutation: 'MUT_CLOSE',
    variables: { issueId: 'I_node1', stateReason: 'COMPLETED' },
    extraData: { reason: 'COMPLETED' },
  },
  {
    type: 'bulkOpen',
    idPrefix: 'open',
    label: 'Bulk open',
    progress: 'Reopening',
    mutation: 'MUT_REOPEN',
    variables: { issueId: 'I_node1' },
  },
  {
    type: 'bulkDelete',
    idPrefix: 'delete',
    label: 'Bulk delete',
    progress: 'Removing',
    mutation: 'MUT_DELETE_ITEM',
    variables: { projectId: PROJECT_ID, itemId: 'PVTI_item1' },
  },
  {
    type: 'bulkLock',
    idPrefix: 'lock',
    label: 'Lock',
    progress: 'Locking',
    mutation: 'MUT_LOCK',
    variables: { lockableId: 'I_node1' },
  },
  {
    type: 'bulkUnlock',
    idPrefix: 'unlock',
    label: 'Unlock',
    progress: 'Unlocking',
    mutation: 'MUT_UNLOCK',
    variables: { lockableId: 'I_node1' },
  },
  {
    type: 'bulkPin',
    idPrefix: 'pin',
    label: 'Pin',
    progress: 'Pinning',
    mutation: 'MUT_PIN',
    variables: { issueId: 'I_node1' },
  },
  {
    type: 'bulkUnpin',
    idPrefix: 'unpin',
    label: 'Unpin',
    progress: 'Unpinning',
    mutation: 'MUT_UNPIN',
    variables: { issueId: 'I_node1' },
  },
]

describe('bulk state verbs — characterization', () => {
  beforeEach(() => {
    hoisted.handlers.clear()
    vi.clearAllMocks()
    hoisted.isBulkFull.mockReturnValue(false)
    hoisted.resolveProjectItemIds.mockResolvedValue(makeItems(3))
    hoisted.processQueue.mockImplementation((async () => {}) as never)
    registerBulkStateHandlers()
  })

  it('registers exactly the 7 state verbs', () => {
    expect([...hoisted.handlers.keys()].sort()).toEqual(
      [
        'bulkClose',
        'bulkDelete',
        'bulkLock',
        'bulkOpen',
        'bulkPin',
        'bulkUnlock',
        'bulkUnpin',
      ].sort(),
    )
  })

  describe.each(VERBS)('$type', (verb) => {
    const data = () => ({
      itemIds: ['issue:1', 'issue:2', 'issue:3'],
      projectId: PROJECT_ID,
      ...verb.extraData,
    })

    it('short-circuits without acquiring a slot when bulk is full', async () => {
      hoisted.isBulkFull.mockReturnValue(true)
      await runVerb(verb.type, data())

      expect(hoisted.acquireBulk).not.toHaveBeenCalled()
      expect(hoisted.releaseBulk).not.toHaveBeenCalled()
      expect(hoisted.broadcastQueue).not.toHaveBeenCalled()
    })

    it('emits the Resolving frame with the exact label and processId prefix', async () => {
      const { processId } = await runVerb(verb.type, data())

      expect(processId).toMatch(new RegExp(`^${verb.idPrefix}-\\d+-[a-z0-9]+$`))
      expect(frames()[0]).toEqual({
        total: 3,
        completed: 0,
        paused: false,
        status: 'Resolving items...',
        processId,
        label: `${verb.label} · 3 items`,
      })
      expect(hoisted.broadcastQueue.mock.calls[0][1]).toBe(TAB_ID)
    })

    it('singularises the label for one item', async () => {
      hoisted.resolveProjectItemIds.mockResolvedValue(makeItems(1))
      await runVerb(verb.type, { ...data(), itemIds: ['issue:1'] })

      expect(frames()[0].label).toBe(`${verb.label} · 1 item`)
    })

    it('aborts after resolution when nothing resolves', async () => {
      hoisted.resolveProjectItemIds.mockResolvedValue([])
      await runVerb(verb.type, data())

      expect(hoisted.processQueue).not.toHaveBeenCalled()
      expect(frames()).toHaveLength(1)
      expect(hoisted.releaseBulk).toHaveBeenCalledTimes(1)
    })

    it('builds one task per resolved item, prefixed by verb', async () => {
      const { tasks } = await runVerb(verb.type, data())

      expect(tasks.map((t) => t.id)).toEqual([
        `${verb.idPrefix}-issue:1`,
        `${verb.idPrefix}-issue:2`,
        `${verb.idPrefix}-issue:3`,
      ])
    })

    it('issues the right mutation and sleeps 1000ms inside each task', async () => {
      const { tasks } = await runVerb(verb.type, data())
      await tasks[0].run()

      expect(hoisted.gql).toHaveBeenCalledTimes(1)
      expect(hoisted.gql).toHaveBeenCalledWith(verb.mutation, verb.variables)
      expect(hoisted.sleep).toHaveBeenCalledWith(1000)
    })

    it('renders in-progress and final progress strings', async () => {
      const { processId } = await runVerb(verb.type, data(), [
        { total: 3, completed: 0, paused: false },
        { total: 3, completed: 3, paused: false },
      ])

      expect(frames()[1]).toEqual({
        total: 3,
        completed: 0,
        paused: false,
        retryAfter: undefined,
        status: `${verb.progress} item 1 of 3…`,
        processId,
        label: `${verb.label} · 3 items`,
        failedItems: undefined,
      })
      expect(frames()[2].status).toBe(`${verb.progress} 3 items…`)
    })

    it('passes paused, retryAfter and failedItems straight through', async () => {
      const failedItems = [{ id: `${verb.idPrefix}-issue:2`, title: 't', error: 'boom' }]
      await runVerb(verb.type, data(), [
        { total: 3, completed: 1, paused: true, retryAfter: 42, failedItems },
      ])

      expect(frames()[1]).toMatchObject({ paused: true, retryAfter: 42, failedItems })
    })

    it('closes with the Done! frame and releases the slot', async () => {
      const { processId } = await runVerb(verb.type, data())
      const last = frames().at(-1)!

      expect(last).toMatchObject({
        total: 0,
        completed: 0,
        paused: false,
        status: 'Done!',
        processId,
        label: `${verb.label} · 3 items`,
      })
      expect(hoisted.releaseBulk).toHaveBeenCalledTimes(1)
    })
  })

  // ── verb-specific behaviour that the shared runner must keep ──────────────

  it('bulkLock omits lockReason when absent and forwards it when present', async () => {
    const base = { itemIds: ['issue:1'], projectId: PROJECT_ID }
    hoisted.resolveProjectItemIds.mockResolvedValue(makeItems(1))

    const withoutReason = await runVerb('bulkLock', base)
    await withoutReason.tasks[0].run()
    expect(hoisted.gql).toHaveBeenLastCalledWith('MUT_LOCK', { lockableId: 'I_node1' })

    const withReason = await runVerb('bulkLock', { ...base, lockReason: 'SPAM' })
    await withReason.tasks[0].run()
    expect(hoisted.gql).toHaveBeenLastCalledWith('MUT_LOCK', {
      lockableId: 'I_node1',
      lockReason: 'SPAM',
    })
  })

  describe('bulkClose Undo hint', () => {
    const data = {
      itemIds: ['issue:1', 'issue:2', 'issue:3'],
      projectId: PROJECT_ID,
      reason: 'COMPLETED',
    }

    it('offers every succeeded item when the run completes cleanly', async () => {
      await runVerb('bulkClose', data, [{ total: 3, completed: 3, paused: false }])

      expect(frames().at(-1)!.reverse).toEqual({
        messageType: 'bulkOpen',
        data: { projectId: PROJECT_ID },
        affectedItemIds: ['issue:1', 'issue:2', 'issue:3'],
        label: 'Undo close (3)',
      })
    })

    it('excludes failed items from the Undo target list', async () => {
      await runVerb('bulkClose', data, [
        {
          total: 3,
          completed: 3,
          paused: false,
          failedItems: [{ id: 'close-issue:2', title: 't', error: 'boom' }],
        },
      ])

      expect(frames().at(-1)!.reverse).toMatchObject({
        affectedItemIds: ['issue:1', 'issue:3'],
        label: 'Undo close (2)',
      })
    })

    it('excludes items never processed when the queue is cancelled mid-run', async () => {
      await runVerb('bulkClose', data, [{ total: 3, completed: 1, paused: false }])

      expect(frames().at(-1)!.reverse).toMatchObject({
        affectedItemIds: ['issue:1'],
        label: 'Undo close (1)',
      })
    })

    it('omits the Undo hint entirely when nothing succeeded', async () => {
      await runVerb('bulkClose', data, [{ total: 3, completed: 0, paused: false }])

      expect(frames().at(-1)!.reverse).toBeUndefined()
    })

    it('is the only verb that emits a reverse hint', async () => {
      for (const verb of VERBS.filter((v) => v.type !== 'bulkClose')) {
        vi.clearAllMocks()
        hoisted.resolveProjectItemIds.mockResolvedValue(makeItems(3))
        await runVerb(verb.type, { ...data, ...verb.extraData }, [
          { total: 3, completed: 3, paused: false },
        ])
        expect(frames().at(-1)!.reverse, verb.type).toBeUndefined()
      }
    })
  })
})
