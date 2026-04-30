import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// vi.mock is hoisted above imports, so we use vi.hoisted to share state
// between the mock factory and the test body.
const hoisted = vi.hoisted(() => {
  const state = {
    handler: undefined as
      | ((msg: { data: Record<string, unknown>; sender?: unknown }) => void)
      | undefined,
    toastShow: (_args: unknown) => {},
  }
  return state
})

vi.mock('@/lib/messages', () => ({
  onMessage: (_type: string, handler: (msg: { data: Record<string, unknown> }) => void) => {
    hoisted.handler = handler
    return () => {}
  },
}))

const toastShow = vi.fn()
hoisted.toastShow = toastShow

vi.mock('@/lib/toast-store', () => ({
  toastStore: {
    show: (args: unknown) => hoisted.toastShow(args),
  },
}))

import { queueStore } from '@/lib/queue-store'

type UpdatePayload = {
  total: number
  completed: number
  paused: boolean
  retryAfter?: number
  status?: string
  detail?: string
  processId?: string
  label?: string
  failedItems?: Array<{ id: string; title: string; error: string }>
  retryContext?: { messageType: string; data: Record<string, unknown> }
}

function dispatch(data: UpdatePayload) {
  hoisted.handler!({ data: data as unknown as Record<string, unknown> })
}

beforeEach(() => {
  vi.useFakeTimers()
  toastShow.mockReset()
  // clear any leftover processes between tests
  for (const pid of ['p1', 'p2', 'bulk']) queueStore.dismiss(pid)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('queueStore.subscribe', () => {
  it('pushes initial empty snapshot immediately', () => {
    const snapshots: unknown[] = []
    const unsub = queueStore.subscribe((e) => snapshots.push([...e]))

    expect(snapshots.length).toBe(1)
    expect(snapshots[0]).toEqualValue([])
    unsub()
  })

  it('notifies on new process insertion', () => {
    const snapshots: unknown[][] = []
    const unsub = queueStore.subscribe((e) => snapshots.push([...e]))

    dispatch({ total: 2, completed: 0, paused: false, processId: 'p1', label: 'Work' })

    const latest = snapshots[snapshots.length - 1]
    expect(latest).toHaveLength(1)
    expect(latest[0]).toMatchObject({
      processId: 'p1',
      total: 2,
      completed: 0,
      paused: false,
      done: false,
      label: 'Work',
    })
    unsub()
  })
})

describe('queueStore active counters', () => {
  it('getActiveCount / hasActive reflect non-done entries', () => {
    dispatch({ total: 1, completed: 0, paused: false, processId: 'p1', label: 'A' })
    dispatch({ total: 1, completed: 0, paused: false, processId: 'p2', label: 'B' })

    expect(queueStore.getActiveCount()).toBe(2)
    expect(queueStore.hasActive()).toBe(true)
  })

  it('done processes no longer count as active', () => {
    dispatch({ total: 1, completed: 0, paused: false, processId: 'p1', label: 'A' })
    // completion sentinel: total=0 + status='Done!'
    dispatch({ total: 0, completed: 0, paused: false, status: 'Done!', processId: 'p1' })

    expect(queueStore.getActiveCount()).toBe(0)
    expect(queueStore.hasActive()).toBe(false)
  })
})

describe('queueStore auto-dismiss', () => {
  it('auto-dismisses a done process after 3s when no failures', async () => {
    const snapshots: unknown[][] = []
    const unsub = queueStore.subscribe((e) => snapshots.push([...e]))

    dispatch({ total: 1, completed: 0, paused: false, processId: 'p1', label: 'A' })
    dispatch({ total: 0, completed: 0, paused: false, status: 'Done!', processId: 'p1' })

    // still present right after done
    const immediatelyAfterDone = snapshots[snapshots.length - 1]
    expect(immediatelyAfterDone).toHaveLength(1)

    // `Async` form is required because Effect.sleep yields through microtasks.
    await vi.advanceTimersByTimeAsync(3500)

    const afterDismiss = snapshots[snapshots.length - 1]
    expect(afterDismiss).toEqualValue([])
    unsub()
  })

  it('does not auto-dismiss when there are failedItems', async () => {
    const snapshots: unknown[][] = []
    const unsub = queueStore.subscribe((e) => snapshots.push([...e]))

    dispatch({ total: 1, completed: 0, paused: false, processId: 'p1', label: 'A' })
    dispatch({
      total: 0,
      completed: 0,
      paused: false,
      status: 'Done!',
      processId: 'p1',
      failedItems: [{ id: 'x', title: 'x', error: 'boom' }],
    })

    await vi.advanceTimersByTimeAsync(5000)

    const latest = snapshots[snapshots.length - 1]
    expect(latest).toHaveLength(1)
    expect((latest[0] as { failedItems: unknown[] }).failedItems).toEqualValue([
      { id: 'x', title: 'x', error: 'boom' },
    ])
    unsub()
  })

  it('fires completion toast when all processes are done', () => {
    dispatch({ total: 1, completed: 0, paused: false, processId: 'p1', label: 'A' })
    dispatch({ total: 0, completed: 0, paused: false, status: 'Done!', processId: 'p1' })

    expect(toastShow).toHaveBeenCalledTimes(1)
    const call = toastShow.mock.calls[0][0] as { type: string; message: string }
    expect(call.type).toBe('success')
    expect(call.message).toContain('All tasks complete')
  })

  it('merges retryContext on completion', () => {
    dispatch({ total: 1, completed: 0, paused: false, processId: 'p1', label: 'A' })
    dispatch({
      total: 0,
      completed: 0,
      paused: false,
      status: 'Done!',
      processId: 'p1',
      retryContext: { messageType: 'bulkUpdate', data: { x: 1 } },
    })

    const snapshots: unknown[][] = []
    const unsub = queueStore.subscribe((e) => snapshots.push([...e]))
    const latest = snapshots[snapshots.length - 1] as { retryContext: unknown }[]
    expect(latest[0].retryContext).toEqualValue({ messageType: 'bulkUpdate', data: { x: 1 } })
    unsub()
  })

  it('merges failedItems from existing on completion when not provided', () => {
    dispatch({
      total: 1,
      completed: 0,
      paused: false,
      processId: 'p1',
      label: 'A',
      failedItems: [{ id: 'f1', title: 't1', error: 'e1' }],
    })
    dispatch({
      total: 0,
      completed: 0,
      paused: false,
      status: 'Done!',
      processId: 'p1',
    })

    const snapshots: unknown[][] = []
    const unsub = queueStore.subscribe((e) => snapshots.push([...e]))
    const latest = snapshots[snapshots.length - 1] as { failedItems: unknown[] }[]
    expect(latest[0].failedItems).toEqualValue([{ id: 'f1', title: 't1', error: 'e1' }])
    unsub()
  })

  it('uses legacy label "Bulk update" for missing label on bulk key', () => {
    dispatch({ total: 2, completed: 0, paused: false })

    const snapshots: unknown[][] = []
    const unsub = queueStore.subscribe((e) => snapshots.push([...e]))
    const latest = snapshots[snapshots.length - 1] as { label: string }[]
    expect(latest[0].label).toBe('Bulk update')
    unsub()
  })

  it('uses "Duplicating…" fallback for non-bulk key without label', () => {
    dispatch({ total: 2, completed: 0, paused: false, processId: 'dup-1' })

    const snapshots: unknown[][] = []
    const unsub = queueStore.subscribe((e) => snapshots.push([...e]))
    const latest = snapshots[snapshots.length - 1] as { label: string }[]
    expect(latest[0].label).toBe('Duplicating…')
    unsub()
  })
})
describe('queueStore.dismiss', () => {
  it('removes process immediately and notifies listeners', () => {
    const snapshots: unknown[][] = []
    const unsub = queueStore.subscribe((e) => snapshots.push([...e]))

    dispatch({ total: 1, completed: 0, paused: false, processId: 'p1', label: 'A' })
    queueStore.dismiss('p1')

    const latest = snapshots[snapshots.length - 1]
    expect(latest.some((p: any) => p.processId === 'p1')).toBe(false)
    unsub()
  })
})
