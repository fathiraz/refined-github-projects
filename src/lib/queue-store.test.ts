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

import { classifyErrorMessage, queueStore } from '@/lib/queue-store'

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
  for (const pid of ['p1', 'p2', 'bulk', 'hints-auto-1', 'hints-1', 'hints-2', 'hints-bg-1', 'hints-bg-2'])
    queueStore.dismiss(pid)
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

describe('queueStore phase derivation', () => {
  // use unique processIds to avoid module-level state leakage between tests
  it("derives phase 'in-flight' for an active process", () => {
    const pid = 'phase-1'
    const snapshots: any[][] = []
    const unsub = queueStore.subscribe((e) => snapshots.push([...e]))

    dispatch({ total: 4, completed: 1, paused: false, processId: pid, label: 'A' })

    const entry = snapshots[snapshots.length - 1].find((p: any) => p.processId === pid)
    expect(entry.phase.kind).toBe('in-flight')
    expect(entry.phase.progress).toEqualValue({ done: 1, total: 4 })
    queueStore.dismiss(pid)
    unsub()
  })

  it("derives phase 'success' when done with no failures", () => {
    const pid = 'phase-2'
    const snapshots: any[][] = []
    const unsub = queueStore.subscribe((e) => snapshots.push([...e]))

    dispatch({ total: 2, completed: 0, paused: false, processId: pid, label: 'A' })
    dispatch({ total: 0, completed: 0, paused: false, status: 'Done!', processId: pid })

    const entry = snapshots[snapshots.length - 1].find((p: any) => p.processId === pid)
    expect(entry.phase.kind).toBe('success')
    expect(entry.phase.undoableUntil).toBeUndefined()
    queueStore.dismiss(pid)
    unsub()
  })

  it("derives phase 'partial' when done with mixed failures and exposes failedItemIds", () => {
    const pid = 'phase-3'
    const snapshots: any[][] = []
    const unsub = queueStore.subscribe((e) => snapshots.push([...e]))

    // 1 of 3 failed → genuine partial (some succeeded, some didn't).
    dispatch({ total: 3, completed: 0, paused: false, processId: pid, label: 'A' })
    dispatch({
      total: 0,
      completed: 0,
      paused: false,
      status: 'Done!',
      processId: pid,
      failedItems: [{ id: 'i1', title: 't1', error: 'e1' }],
    })

    const entry = snapshots[snapshots.length - 1].find((p: any) => p.processId === pid)
    expect(entry.phase.kind).toBe('partial')
    expect(entry.phase.failedItemIds).toEqualValue(['i1'])
    queueStore.dismiss(pid)
    unsub()
  })

  // §2.10 — when every attempted item failed, derive `error` (not `partial`).
  // The result card uses this to render the dedicated `Copy details` action.
  it("derives phase 'error' when every attempted item failed", () => {
    const pid = 'phase-3b'
    const snapshots: any[][] = []
    const unsub = queueStore.subscribe((e) => snapshots.push([...e]))

    dispatch({ total: 2, completed: 0, paused: false, processId: pid, label: 'A' })
    dispatch({
      total: 0,
      completed: 0,
      paused: false,
      status: 'Done!',
      processId: pid,
      failedItems: [
        { id: 'i1', title: 't1', error: '403 Forbidden' },
        { id: 'i2', title: 't2', error: '403 Forbidden' },
      ],
    })

    const entry = snapshots[snapshots.length - 1].find((p: any) => p.processId === pid)
    expect(entry.phase.kind).toBe('error')
    expect(entry.phase.error.message).toContain('403 Forbidden')
    queueStore.dismiss(pid)
    unsub()
  })

  it("derives retry spec on 'partial' phase from retryContext", () => {
    const pid = 'phase-4'
    const snapshots: any[][] = []
    const unsub = queueStore.subscribe((e) => snapshots.push([...e]))

    dispatch({ total: 2, completed: 0, paused: false, processId: pid, label: 'A' })
    dispatch({
      total: 0,
      completed: 0,
      paused: false,
      status: 'Done!',
      processId: pid,
      failedItems: [{ id: 'i1', title: 't1', error: 'e1' }],
      retryContext: { messageType: 'bulkUpdate', data: { projectId: 'x' } },
    })

    const entry = snapshots[snapshots.length - 1].find((p: any) => p.processId === pid)
    expect(entry.phase.kind).toBe('partial')
    expect(entry.phase.retry).toEqualValue({
      messageType: 'bulkUpdate',
      data: { projectId: 'x', itemIds: ['i1'] },
    })
    queueStore.dismiss(pid)
    unsub()
  })
})

describe('queueStore.attachPhaseHints', () => {
  it("attaches reverse op so 'success' phase exposes undoableUntil", () => {
    const pid = 'hints-1'
    dispatch({ total: 1, completed: 0, paused: false, processId: pid, label: 'A' })
    queueStore.attachPhaseHints(pid, {
      reverse: {
        messageType: 'bulkUpdate',
        data: { reopen: true },
        affectedItemIds: ['i1'],
      },
    })
    dispatch({ total: 0, completed: 0, paused: false, status: 'Done!', processId: pid })

    const snapshots: any[][] = []
    const unsub = queueStore.subscribe((e) => snapshots.push([...e]))
    const entry = snapshots[snapshots.length - 1].find((p: any) => p.processId === pid)
    expect(entry.phase.kind).toBe('success')
    expect(entry.phase.reverse).toEqualValue({
      messageType: 'bulkUpdate',
      data: { reopen: true },
      affectedItemIds: ['i1'],
    })
    expect(typeof entry.phase.undoableUntil).toBe('number')
    queueStore.dismiss(pid)
    unsub()
  })

  it('clears hints when the process is dismissed', () => {
    const pid = 'hints-2'
    dispatch({ total: 1, completed: 0, paused: false, processId: pid, label: 'A' })
    queueStore.attachPhaseHints(pid, {
      reverse: {
        messageType: 'bulkUpdate',
        data: {},
        affectedItemIds: [],
      },
    })
    queueStore.dismiss(pid)
    expect(queueStore.getPhaseHints(pid)).toBeUndefined()
  })

  it('clears hints after auto-dismiss when undo window elapses', async () => {
    const pid = 'hints-auto-1'
    dispatch({ total: 1, completed: 0, paused: false, processId: pid, label: 'A' })
    queueStore.attachPhaseHints(pid, {
      reverse: {
        messageType: 'bulkUpdate',
        data: { reopen: true },
        affectedItemIds: ['i1'],
      },
    })
    dispatch({ total: 0, completed: 0, paused: false, status: 'Done!', processId: pid })

    await vi.advanceTimersByTimeAsync(10_500)

    expect(queueStore.getPhaseHints(pid)).toBeUndefined()

    dispatch({ total: 2, completed: 0, paused: false, processId: pid, label: 'Second run' })

    const snapshots: any[][] = []
    const unsub = queueStore.subscribe((e) => snapshots.push([...e]))
    const entry = snapshots[snapshots.length - 1].find((p: any) => p.processId === pid)
    expect(entry.phase.kind).toBe('in-flight')
    expect(entry.phase.reverse).toBeUndefined()
    expect(entry.phase.undoableUntil).toBeUndefined()
    unsub()
  })

  it('§4.9 — consumes reverse hint piggy-backed on Done broadcast and exposes Undo', () => {
    const pid = 'hints-bg-1'
    const snapshots: any[][] = []
    const unsub = queueStore.subscribe((e) => snapshots.push([...e]))

    dispatch({ total: 2, completed: 0, paused: false, processId: pid, label: 'Bulk close' })
    dispatch({
      total: 0,
      completed: 0,
      paused: false,
      status: 'Done!',
      processId: pid,
      reverse: {
        messageType: 'bulkOpen',
        data: { projectId: 'proj-1' },
        affectedItemIds: ['item-a', 'item-b'],
        label: 'Undo close (2)',
      },
    } as UpdatePayload & { reverse: unknown })

    const entry = snapshots[snapshots.length - 1].find((p: any) => p.processId === pid)
    expect(entry.phase.kind).toBe('success')
    expect(entry.phase.reverse).toMatchObject({
      messageType: 'bulkOpen',
      data: { projectId: 'proj-1', itemIds: ['item-a', 'item-b'] },
      affectedItemIds: ['item-a', 'item-b'],
      label: 'Undo close (2)',
    })
    expect(typeof entry.phase.undoableUntil).toBe('number')

    queueStore.dismiss(pid)
    unsub()
  })

  it('§4.9 — ignores reverse hint when the run finished with failedItems', () => {
    const pid = 'hints-bg-2'
    dispatch({ total: 2, completed: 0, paused: false, processId: pid, label: 'Bulk close' })
    dispatch({
      total: 0,
      completed: 0,
      paused: false,
      status: 'Done!',
      processId: pid,
      failedItems: [{ id: 'item-b', title: 'b', error: 'boom' }],
      reverse: {
        messageType: 'bulkOpen',
        data: { projectId: 'proj-1' },
        affectedItemIds: ['item-a'],
      },
    } as UpdatePayload & { reverse: unknown })

    const snapshots: any[][] = []
    const unsub = queueStore.subscribe((e) => snapshots.push([...e]))
    const entry = snapshots[snapshots.length - 1].find((p: any) => p.processId === pid)
    expect(entry.phase.kind).toBe('partial')
    queueStore.dismiss(pid)
    unsub()
  })
})

// §2.10 — classifier feeds the `Copy details` clipboard payload with a short
// category tag (auth/forbidden/rate-limit/network/server/not-found/unknown).
describe('classifyErrorMessage', () => {
  it('classifies 401 / Bad credentials as auth', () => {
    expect(classifyErrorMessage('401 Unauthorized')).toBe('auth')
    expect(classifyErrorMessage('Bad credentials')).toBe('auth')
  })
  it('classifies bare 403 / Forbidden as forbidden', () => {
    expect(classifyErrorMessage('403 Forbidden')).toBe('forbidden')
  })
  it('classifies abuse / secondary rate as rate-limit (precedence over forbidden)', () => {
    expect(classifyErrorMessage('Secondary rate limit / abuse')).toBe('rate-limit')
    expect(classifyErrorMessage('429 Too Many Requests — rate limit')).toBe('rate-limit')
  })
  it('classifies network failures', () => {
    expect(classifyErrorMessage('Failed to fetch')).toBe('network')
    expect(classifyErrorMessage('Network request failed')).toBe('network')
  })
  it('classifies 404 / not-found', () => {
    expect(classifyErrorMessage('404 Not Found')).toBe('not-found')
  })
  it('returns unknown for unmatched messages', () => {
    expect(classifyErrorMessage('Something exploded')).toBe('unknown')
  })
})
