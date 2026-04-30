import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { processQueue, cancelQueue, type QueueState, type QueueTask } from '@/lib/queue'

// mock debug-logger so queue.ts doesn't hit WXT storage APIs
vi.mock('@/lib/debug-logger', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), info: vi.fn() },
}))

// ---------------------------------------------------------------------------
// timer setup — lets sleep() resolve instantly via fake timers
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

/**
 * Run processQueue and flush all pending timers until the returned promise
 * settles. We alternate between advancing timers and yielding micro-ticks so
 * that both `setTimeout` (from sleep) and chained `await`s resolve.
 */
async function runToCompletion(promise: Promise<void>): Promise<void> {
  let settled = false
  const done = promise.then(() => {
    settled = true
  })

  while (!settled) {
    await vi.advanceTimersByTimeAsync(2000)
  }

  return done
}

// ---------------------------------------------------------------------------
// tests
// ---------------------------------------------------------------------------

describe('processQueue', () => {
  it('processes all tasks in order', async () => {
    const order: string[] = []

    const tasks: QueueTask[] = [
      {
        id: 'a',
        run: async () => {
          order.push('a')
        },
      },
      {
        id: 'b',
        run: async () => {
          order.push('b')
        },
      },
      {
        id: 'c',
        run: async () => {
          order.push('c')
        },
      },
    ]

    await runToCompletion(processQueue(tasks))

    expect(order).toEqualValue(['a', 'b', 'c'])
  })

  it('calls onStateChange with correct total and completed counts', async () => {
    const states: QueueState[] = []

    const tasks: QueueTask[] = [
      { id: 'x', run: async () => {} },
      { id: 'y', run: async () => {} },
    ]

    await runToCompletion(processQueue(tasks, (s) => states.push({ ...s })))

    // first call: initial broadcast (completed 0)
    expect(states[0]).toMatchObject({ total: 2, completed: 0 })

    // final call should show all completed
    const last = states[states.length - 1]
    expect(last).toMatchObject({ total: 2, completed: 2 })
  })

  it('skips task on non-rate-limit error and increments completed', async () => {
    const order: string[] = []

    const tasks: QueueTask[] = [
      {
        id: 'fail',
        run: async () => {
          throw new Error('boom')
        },
      },
      {
        id: 'ok',
        run: async () => {
          order.push('ok')
        },
      },
    ]

    const states: QueueState[] = []
    await runToCompletion(processQueue(tasks, (s) => states.push({ ...s })))

    // the failing task is skipped but counted as completed
    expect(order).toEqualValue(['ok'])
    const last = states[states.length - 1]
    expect(last).toMatchObject({ total: 2, completed: 2 })
  })

  it('cancellation stops processing remaining tasks', async () => {
    const order: string[] = []
    const processId = 'cancel-test'

    const tasks: QueueTask[] = [
      {
        id: 'first',
        run: async () => {
          order.push('first')
          // cancel after the first task runs
          cancelQueue(processId)
        },
      },
      {
        id: 'second',
        run: async () => {
          order.push('second')
        },
      },
      {
        id: 'third',
        run: async () => {
          order.push('third')
        },
      },
    ]

    await runToCompletion(processQueue(tasks, undefined, processId))

    // only the first task should have run; cancellation is checked before
    // each subsequent task.
    expect(order).toEqualValue(['first'])
  })

  it('completes immediately with an empty task array', async () => {
    const states: QueueState[] = []

    await runToCompletion(processQueue([], (s) => states.push({ ...s })))

    // should still broadcast the initial state
    expect(states.length).toBeGreaterThanOrEqual(1)
    expect(states[0]).toMatchObject({ total: 0, completed: 0 })
  })

  it('retries on rate-limit error (403) then succeeds', async () => {
    let attempt = 0
    const tasks: QueueTask[] = [
      {
        id: 'rate-limited',
        run: async () => {
          attempt++
          if (attempt === 1) {
            const err: Error & { status?: number; retryAfter?: number } = new Error('rate limited')
            err.status = 403
            err.retryAfter = 1
            throw err
          }
        },
      },
    ]

    const states: QueueState[] = []
    await runToCompletion(processQueue(tasks, (s) => states.push({ ...s })))

    // should have paused at some point
    expect(states.some((s) => s.paused)).toBe(true)
    // should have completed after retry
    const last = states[states.length - 1]
    expect(last).toMatchObject({ total: 1, completed: 1, paused: false })
  })

  it('retries on 429 and reads retryAfter header', async () => {
    let attempt = 0
    const tasks: QueueTask[] = [
      {
        id: 'throttled',
        run: async () => {
          attempt++
          if (attempt === 1) {
            const err: Error & { status?: number; retryAfter?: number } = new Error('too many')
            err.status = 429
            err.retryAfter = 2
            throw err
          }
        },
      },
    ]

    const states: QueueState[] = []
    await runToCompletion(processQueue(tasks, (s) => states.push({ ...s })))

    // should see retryAfter in paused state
    const pausedState = states.find((s) => s.paused)
    expect(pausedState).toBeDefined()
    expect(pausedState!.retryAfter).toBe(2)
  })

  it('broadcasts task detail during execution', async () => {
    const tasks: QueueTask[] = [
      { id: 'detailed', detail: 'Setting field → done', run: async () => {} },
    ]

    const states: QueueState[] = []
    await runToCompletion(processQueue(tasks, (s) => states.push({ ...s })))

    expect(states.some((s) => s.detail === 'Setting field → done')).toBe(true)
  })

  it('collects failed items on error', async () => {
    const tasks: QueueTask[] = [
      {
        id: 'will-fail',
        detail: 'Failing task',
        run: async () => {
          throw new Error('something broke')
        },
      },
    ]

    const states: QueueState[] = []
    await runToCompletion(processQueue(tasks, (s) => states.push({ ...s })))

    const last = states[states.length - 1]
    expect(last.failedItems).toBeDefined()
    expect(last.failedItems).toHaveLength(1)
    expect(last.failedItems![0]).toMatchObject({
      id: 'will-fail',
      title: 'Failing task',
      error: 'something broke',
    })
  })
})
