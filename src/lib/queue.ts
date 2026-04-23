import { Duration, Effect, Either, Fiber, Queue } from 'effect'

import { logger } from './debug-logger'

export interface QueueTask {
  id: string
  detail?: string
  run: () => Promise<void>
}

export interface FailedItem {
  id: string
  title: string
  error: string
}

export interface QueueState {
  total: number
  completed: number
  paused: boolean
  retryAfter?: number
  status?: string
  detail?: string
  failedItems?: FailedItem[]
}

type StateListener = (state: QueueState) => void

const stateListeners = new Set<StateListener>()
const activeFibers = new Map<string, Fiber.RuntimeFiber<void, never>>()
const cancelledProcesses = new Set<string>()

let currentState: QueueState = { total: 0, completed: 0, paused: false }

function setState(update: Partial<QueueState>) {
  currentState = { ...currentState, ...update }
  stateListeners.forEach((fn) => fn(currentState))
}

export function subscribeQueueState(fn: StateListener): () => void {
  stateListeners.add(fn)
  return () => stateListeners.delete(fn)
}

export function getQueueState(): QueueState {
  return currentState
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function cancelQueue(processId: string): void {
  cancelledProcesses.add(processId)
  const fiber = activeFibers.get(processId)
  if (fiber) {
    // Interrupt fiber immediately — works for long rate-limit sleeps
    Effect.runFork(Fiber.interrupt(fiber))
    activeFibers.delete(processId)
  }
}

export async function processQueue(
  tasks: QueueTask[],
  onStateChange?: (state: QueueState) => void,
  processId?: string,
): Promise<void> {
  logger.log('[rgp:queue] starting', tasks.length, 'tasks')

  // Local state per invocation — fully independent from concurrent calls
  let localCompleted = 0
  let localPaused = false
  let localRetryAfter: number | undefined
  let localDetail: string | undefined
  const localFailedItems: FailedItem[] = []

  const notify = () => {
    onStateChange?.({
      total: tasks.length,
      completed: localCompleted,
      paused: localPaused,
      retryAfter: localRetryAfter,
      detail: localDetail,
      failedItems: localFailedItems.length > 0 ? [...localFailedItems] : undefined,
    })
  }

  notify() // initial broadcast (completed = 0)

  if (tasks.length === 0) return

  const program = Effect.gen(function* () {
    const q = yield* Queue.unbounded<QueueTask>()
    yield* Queue.offerAll(q, tasks)

    for (let i = 0; i < tasks.length; i++) {
      // Flag check: fast-path cancellation, guaranteed even if fiber interrupt races
      if (processId && cancelledProcesses.has(processId)) {
        cancelledProcesses.delete(processId)
        break
      }
      const task = yield* Queue.take(q)
      logger.log('[rgp:queue] task start', task.id, `(${i + 1}/${tasks.length})`)

      let attempts = 0
      const MAX_ATTEMPTS = 3
      let taskDone = false

      while (attempts < MAX_ATTEMPTS && !taskDone) {
        localDetail = task.detail
        notify()

        const result = yield* Effect.tryPromise({
          try: () => task.run(),
          catch: (err) => err as unknown,
        }).pipe(Effect.either)

        if (Either.isRight(result)) {
          localCompleted++
          localDetail = undefined
          notify()
          logger.log('[rgp:queue] task done', task.id)
          if (i < tasks.length - 1) {
            logger.log('[rgp:queue] sleeping 1s before next task')
            yield* Effect.sleep(Duration.millis(1000))
          }
          taskDone = true
        } else {
          const err = result.left as { status?: number; retryAfter?: number }
          if ((err.status === 403 || err.status === 429) && attempts < MAX_ATTEMPTS - 1) {
            const retryAfter = err.retryAfter ?? 60
            console.warn('[rgp:queue] rate limited — sleeping', retryAfter, 's')
            localPaused = true
            localRetryAfter = retryAfter
            notify()
            yield* Effect.sleep(Duration.millis(retryAfter * 1000))
            logger.log('[rgp:queue] resuming after rate limit')
            localPaused = false
            localRetryAfter = undefined
            notify()
            attempts++
          } else {
            // Non-rate-limit error OR max retries exhausted: skip task
            const errVal = result.left
            const errorMsg = errVal instanceof Error ? errVal.message : String(errVal)
            console.error('[rgp:queue] task error (skipping)', task.id, errVal)
            localFailedItems.push({ id: task.id, title: task.detail ?? task.id, error: errorMsg })
            localCompleted++
            localDetail = undefined
            notify()
            taskDone = true
          }
        }
      }
    }

    logger.log('[rgp:queue] all tasks done')
  })

  const fiber = Effect.runFork(program)
  if (processId) activeFibers.set(processId, fiber)

  try {
    // Fiber.await never rejects — returns Exit<E,A> — so interrupted queues return cleanly
    await Effect.runPromise(Fiber.await(fiber))
  } finally {
    if (processId) activeFibers.delete(processId)
  }
}
