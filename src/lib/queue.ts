import { logger } from '@/lib/debug-logger'

export interface QueueTask {
  id: string
  detail?: string
  run: () => Promise<void>
}

interface FailedItem {
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

// One controller per in-flight run, keyed by processId. Aborting it is what
// lets `cancelQueue` cut a 60s rate-limit wait short rather than making the
// user sit through it.
const _controllers = new Map<string, AbortController>()

// Synchronous companion to the controllers. Abort delivery is asynchronous,
// and a cancellation can originate from inside a task's own run() callback,
// so this set gives a deterministic guarantee that no further task starts
// once `cancelQueue` has returned.
const _cancelledProcesses = new Set<string>()

/**
 * Resolve after `ms`, or as soon as `signal` aborts — whichever comes first.
 * Aborting resolves rather than rejects: callers treat a cut-short wait the
 * same way they treat one that elapsed, and check cancellation separately.
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve()
    // `done` closes over `timer`, but only ever runs after it is assigned —
    // either from the timeout itself or from the abort listener below.
    const done = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', done)
      resolve()
    }
    const timer = setTimeout(done, ms)
    signal?.addEventListener('abort', done, { once: true })
  })
}

export function cancelQueue(processId: string): void {
  _cancelledProcesses.add(processId)
  _controllers.get(processId)?.abort()
}

export async function processQueue(
  tasks: QueueTask[],
  onStateChange?: (state: QueueState) => void,
  processId?: string,
): Promise<void> {
  logger.log('[rgp:queue] starting', tasks.length, 'tasks')

  // local state per invocation — fully independent from concurrent calls
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

  const controller = new AbortController()
  if (processId) _controllers.set(processId, controller)

  const isCancelled = () =>
    controller.signal.aborted || (processId !== undefined && _cancelledProcesses.has(processId))

  try {
    for (let i = 0; i < tasks.length; i++) {
      // bail out if the queue was cancelled between tasks (e.g. from inside
      // the previous task's run callback or from another context).
      if (isCancelled()) return
      const task = tasks[i]
      logger.log('[rgp:queue] task start', task.id, `(${i + 1}/${tasks.length})`)

      let attempts = 0
      const MAX_ATTEMPTS = 3
      let taskDone = false

      while (attempts < MAX_ATTEMPTS && !taskDone) {
        localDetail = task.detail
        notify()

        try {
          await task.run()

          localCompleted++
          localDetail = undefined
          notify()
          logger.log('[rgp:queue] task done', task.id)
          if (i < tasks.length - 1) {
            logger.log('[rgp:queue] sleeping 1s before next task')
            // Mandatory anti-abuse spacing between content-creating mutations.
            // Cancellation lands here.
            await sleep(1000, controller.signal)
          }
          taskDone = true
        } catch (caught) {
          const err = caught as { _tag?: string; status?: number; retryAfter?: number }
          const isRateLimit =
            err._tag === 'GithubRateLimitError' || err.status === 403 || err.status === 429
          if (isRateLimit && attempts < MAX_ATTEMPTS - 1) {
            const retryAfter = err.retryAfter ?? 60
            console.warn('[rgp:queue] rate limited — sleeping', retryAfter, 's')
            localPaused = true
            localRetryAfter = retryAfter
            notify()
            await sleep(retryAfter * 1000, controller.signal)
            if (isCancelled()) return
            logger.log('[rgp:queue] resuming after rate limit')
            localPaused = false
            localRetryAfter = undefined
            notify()
            attempts++
          } else {
            // non-rate-limit error OR max retries exhausted: skip task
            const errorMsg = caught instanceof Error ? caught.message : String(caught)
            console.error('[rgp:queue] task error (skipping)', task.id, caught)
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
  } finally {
    // clear the cancellation state so a subsequent processQueue call with the
    // same processId starts with a clean slate.
    if (processId) {
      _controllers.delete(processId)
      _cancelledProcesses.delete(processId)
    }
  }
}
