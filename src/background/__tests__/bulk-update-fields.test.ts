// Per-dataType coverage for bulkUpdate's field table.
//
// This handler used to run two parallel nine-way switches on dataType — one
// building the progress detail, one building the mutation — with no test
// holding them together. These assert both halves of every row.

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { QueueState, QueueTask } from '@/lib/queue'

const hoisted = vi.hoisted(() => ({
  isBulkFull: vi.fn(() => false),
  acquireBulk: vi.fn(),
  releaseBulk: vi.fn(),
  broadcastQueue: vi.fn(async (_state: Record<string, unknown>, _tabId?: number) => {}),
  resolveProjectItemIds: vi.fn(async () => [] as unknown[]),
  takeCachedResolvedItems: vi.fn(() => undefined),
  buildBulkRelationshipTasks: vi.fn(() => [] as QueueTask[]),
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
vi.mock('@/background/cache', () => ({
  takeCachedResolvedItems: hoisted.takeCachedResolvedItems,
}))
vi.mock('@/background/relationship-helpers', () => ({
  buildBulkRelationshipTasks: hoisted.buildBulkRelationshipTasks,
}))
vi.mock('@/lib/queue', () => ({ processQueue: hoisted.processQueue, sleep: hoisted.sleep }))
vi.mock('@/lib/graphql-client', () => ({ gql: hoisted.gql }))
vi.mock('@/lib/graphql-mutations', () => ({
  ADD_ASSIGNEES: 'MUT_ADD_ASSIGNEES',
  ADD_LABELS: 'MUT_ADD_LABELS',
  UPDATE_ISSUE_MILESTONE: 'MUT_MILESTONE',
  UPDATE_ISSUE_TYPE: 'MUT_ISSUE_TYPE',
  UPDATE_ISSUE_TITLE: 'MUT_ISSUE_TITLE',
  UPDATE_PR_TITLE: 'MUT_PR_TITLE',
  UPDATE_ISSUE_BODY: 'MUT_ISSUE_BODY',
  UPDATE_PR_BODY: 'MUT_PR_BODY',
  ADD_COMMENT: 'MUT_COMMENT',
  UPDATE_PROJECT_FIELD: 'MUT_PROJECT_FIELD',
}))

import { registerBulkUpdateHandler } from '@/background/bulk-update'

const PROJECT_ID = 'PVT_project'
const ITEM = {
  domId: 'issue:1',
  issueNodeId: 'I_node1',
  projectItemId: 'PVTI_item1',
  repoOwner: 'acme',
  repoName: 'web',
}

/** Fire bulkUpdate with a single field update and return the queued task. */
async function taskFor(
  value: Record<string, unknown>,
  opts: { fieldMeta?: Record<string, unknown>; typename?: 'Issue' | 'PullRequest' } = {},
): Promise<QueueTask> {
  let tasks: QueueTask[] = []
  hoisted.processQueue.mockImplementation((async (
    queued: QueueTask[],
    onState?: (s: QueueState) => Promise<void> | void,
  ) => {
    tasks = queued
    await onState?.({ total: queued.length, completed: 0, paused: false })
  }) as never)
  hoisted.resolveProjectItemIds.mockResolvedValue([{ ...ITEM, typename: opts.typename }])

  await hoisted.handlers.get('bulkUpdate')!({
    data: {
      itemIds: ['issue:1'],
      projectId: PROJECT_ID,
      updates: [{ fieldId: 'F_field', value }],
      fieldMeta: opts.fieldMeta,
    } as never,
    sender: { tab: { id: 1 } },
  })
  await vi.waitFor(() => expect(tasks.length).toBeGreaterThan(0))
  return tasks[0]
}

describe('bulkUpdate field table', () => {
  beforeEach(() => {
    hoisted.handlers.clear()
    vi.clearAllMocks()
    hoisted.isBulkFull.mockReturnValue(false)
    hoisted.takeCachedResolvedItems.mockReturnValue(undefined)
    hoisted.buildBulkRelationshipTasks.mockReturnValue([])
    registerBulkUpdateHandler()
  })

  it('ids each task by item and field', async () => {
    const task = await taskFor({ dataType: 'BODY', text: 'x' })
    expect(task.id).toBe('bulk-issue:1-F_field')
  })

  describe('detail line', () => {
    it.each([
      [
        'lists assignee logins',
        {
          dataType: 'ASSIGNEES',
          array: [
            { id: 'U_a', login: 'ada' },
            { id: 'U_b', login: 'bob' },
          ],
        },
        'Adding assignees: @ada, @bob',
      ],
      ['falls back with no assignees', { dataType: 'ASSIGNEES', array: [] }, 'Adding assignees'],
      [
        'lists label names',
        { dataType: 'LABELS', array: [{ id: 'L_a', name: 'bug' }] },
        'Adding labels: bug',
      ],
      ['falls back with no labels', { dataType: 'LABELS', array: [] }, 'Adding labels'],
      [
        'names the milestone by title',
        { dataType: 'MILESTONE', array: [{ id: 'M_1', title: 'v2' }] },
        'Setting milestone → v2',
      ],
      [
        'names the milestone by name when title is absent',
        { dataType: 'MILESTONE', array: [{ id: 'M_1', name: 'v3' }] },
        'Setting milestone → v3',
      ],
      ['falls back with no milestone', { dataType: 'MILESTONE', array: [] }, 'Setting milestone'],
      [
        'names the issue type',
        { dataType: 'ISSUE_TYPE', array: [{ id: 'T_1', name: 'Bug' }] },
        'Setting issue type → Bug',
      ],
      [
        'quotes the new title',
        { dataType: 'TITLE', text: '  hello  ' },
        'Changing title → "hello"',
      ],
      ['falls back on a blank title', { dataType: 'TITLE', text: '   ' }, 'Updating title'],
      ['describes a body edit', { dataType: 'BODY', text: 'x' }, 'Updating body'],
      ['describes a comment', { dataType: 'COMMENT', text: 'x' }, 'Adding comment'],
    ])('%s', async (_name, value, expected) => {
      expect((await taskFor(value)).detail).toBe(expected)
    })

    it('truncates a long title at 40 characters', async () => {
      const task = await taskFor({ dataType: 'TITLE', text: 'a'.repeat(60) })
      expect(task.detail).toBe(`Changing title → "${'a'.repeat(40)}…"`)
    })

    it('names the chosen single-select option', async () => {
      const task = await taskFor(
        { dataType: 'SINGLE_SELECT', singleSelectOptionId: 'O_2' },
        { fieldMeta: { F_field: { name: 'Status', options: [{ id: 'O_2', name: 'Done' }] } } },
      )
      expect(task.detail).toBe('Status → Done')
    })

    it('falls back when the option is not in the metadata', async () => {
      const task = await taskFor(
        { dataType: 'SINGLE_SELECT', singleSelectOptionId: 'O_missing' },
        { fieldMeta: { F_field: { name: 'Status', options: [] } } },
      )
      expect(task.detail).toBe('Status → (option)')
    })

    it('names the chosen iteration', async () => {
      const task = await taskFor(
        { dataType: 'ITERATION', iterationId: 'IT_1' },
        { fieldMeta: { F_field: { name: 'Sprint', iterations: [{ id: 'IT_1', title: 'S1' }] } } },
      )
      expect(task.detail).toBe('Sprint → S1')
    })

    it.each([
      ['text', { text: 'hello' }, 'Notes → "hello"'],
      ['number', { number: 42 }, 'Notes → 42'],
      ['date', { date: '2026-03-04' }, 'Notes → Mar 4, 2026'],
      ['nothing at all', {}, 'Updating Notes'],
    ])('describes a plain %s field', async (_n, value, expected) => {
      const task = await taskFor(value, { fieldMeta: { F_field: { name: 'Notes' } } })
      expect(task.detail).toBe(expected)
    })

    it('truncates long text at 30 characters', async () => {
      const task = await taskFor(
        { text: 'b'.repeat(50) },
        { fieldMeta: { F_field: { name: 'Notes' } } },
      )
      expect(task.detail).toBe(`Notes → "${'b'.repeat(30)}…"`)
    })

    it('labels an unknown field "Field" when metadata is missing', async () => {
      expect((await taskFor({ text: 'x' })).detail).toBe('Field → "x"')
    })
  })

  describe('mutation', () => {
    it('adds assignees and paces at 1000ms', async () => {
      const task = await taskFor({ dataType: 'ASSIGNEES', array: [{ id: 'U_a', login: 'ada' }] })
      await task.run()

      expect(hoisted.gql).toHaveBeenCalledWith('MUT_ADD_ASSIGNEES', {
        assignableId: 'I_node1',
        assigneeIds: ['U_a'],
      })
      expect(hoisted.sleep).toHaveBeenCalledWith(1000)
    })

    it.each([
      ['ASSIGNEES', { dataType: 'ASSIGNEES', array: [] }],
      ['LABELS', { dataType: 'LABELS', array: [] }],
      ['MILESTONE', { dataType: 'MILESTONE', array: [] }],
      ['ISSUE_TYPE', { dataType: 'ISSUE_TYPE', array: [] }],
      ['TITLE', { dataType: 'TITLE', text: '  ' }],
      ['BODY', { dataType: 'BODY' }],
      ['COMMENT', { dataType: 'COMMENT', text: ' ' }],
    ])('issues nothing for an empty %s update', async (_n, value) => {
      await (await taskFor(value)).run()
      expect(hoisted.gql).not.toHaveBeenCalled()
    })

    it.each([
      ['LABELS', { dataType: 'LABELS', array: [{ id: 'L_a' }] }, 'MUT_ADD_LABELS'],
      ['MILESTONE', { dataType: 'MILESTONE', array: [{ id: 'M_1' }] }, 'MUT_MILESTONE'],
      ['ISSUE_TYPE', { dataType: 'ISSUE_TYPE', array: [{ id: 'T_1' }] }, 'MUT_ISSUE_TYPE'],
      ['COMMENT', { dataType: 'COMMENT', text: 'hi' }, 'MUT_COMMENT'],
    ])('routes %s to its mutation', async (_n, value, mutation) => {
      await (await taskFor(value)).run()
      expect(hoisted.gql).toHaveBeenCalledWith(mutation, expect.anything())
    })

    it.each([
      ['TITLE', { dataType: 'TITLE', text: 'new' }, 'MUT_ISSUE_TITLE', 'MUT_PR_TITLE'],
      ['BODY', { dataType: 'BODY', text: 'new' }, 'MUT_ISSUE_BODY', 'MUT_PR_BODY'],
    ])('routes %s by content typename', async (_n, value, issueMutation, prMutation) => {
      await (await taskFor(value, { typename: 'Issue' })).run()
      expect(hoisted.gql).toHaveBeenLastCalledWith(issueMutation, expect.anything())

      await (await taskFor(value, { typename: 'PullRequest' })).run()
      expect(hoisted.gql).toHaveBeenLastCalledWith(prMutation, expect.anything())
    })

    it('trims the title before sending it', async () => {
      await (await taskFor({ dataType: 'TITLE', text: '  spaced  ' })).run()
      expect(hoisted.gql).toHaveBeenCalledWith('MUT_ISSUE_TITLE', {
        issueId: 'I_node1',
        title: 'spaced',
      })
    })

    it('sends an empty body through rather than skipping it', async () => {
      await (await taskFor({ dataType: 'BODY', text: '' })).run()
      expect(hoisted.gql).toHaveBeenCalledWith('MUT_ISSUE_BODY', { issueId: 'I_node1', body: '' })
    })

    it.each([
      ['single-select', { singleSelectOptionId: 'O_1' }, { singleSelectOptionId: 'O_1' }],
      ['iteration', { iterationId: 'IT_1' }, { iterationId: 'IT_1' }],
      ['date', { date: '2026-03-04' }, { date: '2026-03-04' }],
      ['number', { number: 7 }, { number: 7 }],
      ['text', { text: 'note' }, { text: 'note' }],
      ['empty', {}, {}],
    ])('sets a %s project field', async (_n, value, expected) => {
      await (await taskFor(value)).run()
      expect(hoisted.gql).toHaveBeenCalledWith('MUT_PROJECT_FIELD', {
        projectId: PROJECT_ID,
        itemId: 'PVTI_item1',
        fieldId: 'F_field',
        value: expected,
      })
    })

    it('does not pace project-field writes — processQueue already spaces tasks', async () => {
      await (await taskFor({ text: 'note' })).run()
      expect(hoisted.sleep).not.toHaveBeenCalled()
    })
  })
})
