import { beforeEach, describe, expect, it, vi } from 'vitest'

const hoisted = vi.hoisted(() => ({
  isBulkFull: vi.fn(() => false),
  acquireBulk: vi.fn(),
  releaseBulk: vi.fn(),
  handlers: new Map<
    string,
    (msg: { data: unknown; sender: { tab?: { id?: number } } }) => Promise<unknown>
  >(),
}))

vi.mock('@/lib/debug-logger', () => ({
  logger: { log: () => {}, warn: () => {}, error: () => {}, info: () => {} },
}))

vi.mock('@/background/concurrency', () => ({
  isBulkFull: hoisted.isBulkFull,
  acquireBulk: hoisted.acquireBulk,
  releaseBulk: hoisted.releaseBulk,
}))

vi.mock('@/lib/messages', () => ({
  onMessage: (type: string, handler: (typeof hoisted.handlers) extends Map<string, infer H> ? H : never) => {
    hoisted.handlers.set(type, handler)
  },
}))

vi.mock('@/background/cache', () => ({ takeCachedResolvedItems: vi.fn() }))
vi.mock('@/background/rest-helpers', () => ({ broadcastQueue: vi.fn(async () => {}) }))
vi.mock('@/background/relationship-helpers', () => ({ buildBulkRelationshipTasks: vi.fn(() => []) }))
vi.mock('@/background/project-helpers', () => ({ resolveProjectItemIds: vi.fn(async () => []) }))
vi.mock('@/lib/queue', () => ({ processQueue: vi.fn(async () => {}), sleep: vi.fn() }))
vi.mock('@/lib/graphql-client', () => ({ gql: vi.fn() }))

import { registerBulkUpdateHandler } from '@/background/bulk-update'

describe('bulkUpdate dispatch', () => {
  beforeEach(() => {
    hoisted.handlers.clear()
    hoisted.isBulkFull.mockReset()
    hoisted.acquireBulk.mockReset()
    hoisted.releaseBulk.mockReset()
    hoisted.isBulkFull.mockReturnValue(false)
    registerBulkUpdateHandler()
  })

  it('returns concurrent rejection without acquiring when bulk is full', async () => {
    hoisted.isBulkFull.mockReturnValue(true)
    const handler = hoisted.handlers.get('bulkUpdate')
    expect(handler).toBeDefined()

    const result = await handler!({
      data: { itemIds: ['a'], projectId: 'p', updates: [] },
      sender: { tab: { id: 1 } },
    })

    expect(result).toEqual({ ok: false, reason: 'concurrent' })
    expect(hoisted.acquireBulk).not.toHaveBeenCalled()
    expect(hoisted.releaseBulk).not.toHaveBeenCalled()
  })

  it('returns ok and releases bulk slot after background work', async () => {
    const handler = hoisted.handlers.get('bulkUpdate')!
    const result = await handler({
      data: { itemIds: ['a'], projectId: 'p', updates: [] },
      sender: { tab: { id: 2 } },
    })

    expect(result).toEqual({ ok: true })
    expect(hoisted.acquireBulk).toHaveBeenCalledTimes(1)

    await vi.waitFor(() => {
      expect(hoisted.releaseBulk).toHaveBeenCalledTimes(1)
    })
  })
})
