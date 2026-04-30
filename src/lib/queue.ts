import {
  Cause,
  Chunk,
  Duration,
  Effect,
  Either,
  Exit,
  Fiber,
  FiberMap,
  Option,
  Queue,
  Scope,
} from 'effect'

import { logger } from '@/lib/debug-logger'

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

// FiberMap, scoped to a module-level Scope that lives for the whole
// execution context (background SW / content script). Replacing the prior
// `activeFibers: Map + cancelledProcesses: Set` pair with a FiberMap gives:
//   - Atomic remove + interrupt via `FiberMap.remove(map, processId)`.
//   - Auto-cleanup when a fiber completes (no manual delete on success path).
//   - Scope-based mass cancellation if the SW ever needs a graceful teardown.
const _queueScope = Effect.runSync(Scope.make())
const _activeFibers = Effect.runSync(
  Effect.provideService(FiberMap.make<string>(), Scope.Scope, _queueScope),
)

// Synchronous fast-path flag set to track cancelled process IDs.
// FiberMap.remove ultimately interrupts the fiber, but interrupt propagation
// can race with fake-timer-driven sleeps and with cancellations that originate
// from inside a task's own run() callback. Checking this set explicitly between
// tasks gives a deterministic guarantee that no further work will be done once
// `cancelQueue` returns.
const _cancelledProcesses = new Set<string>()

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function cancelQueue(processId: string): void {
  _cancelledProcesses.add(processId)
  // FiberMap.remove atomically interrupts + removes the entry.
  Effect.runFork(FiberMap.remove(_activeFibers, processId))
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

  const isCancelled = () => processId !== undefined && _cancelledProcesses.has(processId)

  const program = Effect.gen(function* () {
    const q = yield* Queue.unbounded<QueueTask>()
    yield* Queue.offerAll(q, tasks)

    for (let i = 0; i < tasks.length; i++) {
      // Bail out if the queue was cancelled between tasks (e.g. from inside
      // the previous task's run callback or from another fiber).
      if (isCancelled()) return
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
            // Sleep is interruptible — cancellation lands here.
            yield* Effect.sleep(Duration.millis(1000))
          }
          taskDone = true
        } else {
          const err = result.left as { _tag?: string; status?: number; retryAfter?: number }
          const isRateLimit =
            err._tag === 'GithubRateLimitError' || err.status === 403 || err.status === 429
          if (isRateLimit && attempts < MAX_ATTEMPTS - 1) {
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

  // Fork the program; if a processId is given, register the fiber so that
  // `cancelQueue(id)` can interrupt it. FiberMap.run automatically removes
  // the entry when the fiber completes.
  const fiber = processId
    ? Effect.runSync(FiberMap.run(_activeFibers, processId, program))
    : Effect.runFork(program)

  try {
    // Fiber.await never rejects — returns Exit<E, A>. We inspect it so that
    // unexpected defects (e.g. thrown errors from notify() / onStateChange)
    // surface to the caller instead of being silently swallowed. Interrupts
    // are expected (e.g. cancelQueue) and must still return cleanly.
    const exit = await Effect.runPromise(Fiber.await(fiber))
    if (Exit.isFailure(exit)) {
      const cause = exit.cause
      if (!Cause.isInterruptedOnly(cause)) {
        const firstDefect = Chunk.head(Cause.defects(cause))
        if (Option.isSome(firstDefect)) {
          const d = firstDefect.value
          throw d instanceof Error ? d : new Error(String(d))
        }
        const firstFailure = Chunk.head(Cause.failures(cause))
        if (Option.isSome(firstFailure)) {
          const f: unknown = firstFailure.value
          throw f instanceof Error ? f : new Error(String(f))
        }
      }
    }
  } finally {
    // Clear the cancellation flag so a subsequent processQueue call with the
    // same processId starts with a clean slate.
    if (processId) _cancelledProcesses.delete(processId)
  }
}
