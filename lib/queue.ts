import { logger } from './debugLogger'

export interface QueueTask {
  id: string
  detail?: string
  run: () => Promise<void>
}

export interface QueueState {
  total: number
  completed: number
  paused: boolean
  retryAfter?: number
  status?: string
  detail?: string
}

type StateListener = (state: QueueState) => void

const stateListeners = new Set<StateListener>()
const cancelledProcesses = new Set<string>()

export function cancelQueue(processId: string): void {
  cancelledProcesses.add(processId)
}
let currentState: QueueState = { total: 0, completed: 0, paused: false }

function setState(update: Partial<QueueState>) {
  currentState = { ...currentState, ...update }
  stateListeners.forEach(fn => fn(currentState))
}

export function subscribeQueueState(fn: StateListener): () => void {
  stateListeners.add(fn)
  return () => stateListeners.delete(fn)
}

export function getQueueState(): QueueState {
  return currentState
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
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

  const notify = () => {
    onStateChange?.({
      total: tasks.length,
      completed: localCompleted,
      paused: localPaused,
      retryAfter: localRetryAfter,
      detail: localDetail,
    })
  }

  notify() // initial broadcast (completed = 0)

  try {
    for (let i = 0; i < tasks.length; i++) {
      if (processId && cancelledProcesses.has(processId)) {
        cancelledProcesses.delete(processId)
        break
      }
      const task = tasks[i]
      logger.log('[rgp:queue] task start', task.id, `(${i + 1}/${tasks.length})`)
      let attempts = 0
      const MAX_ATTEMPTS = 3

      while (attempts < MAX_ATTEMPTS) {
        try {
          localDetail = task.detail
          notify()
          await task.run()
          localCompleted++
          localDetail = undefined
          notify()
          logger.log('[rgp:queue] task done', task.id)
          if (i < tasks.length - 1) {
            logger.log('[rgp:queue] sleeping 1s before next task')
          }
          await sleep(1000)
          break
        } catch (err: unknown) {
          const e = err as { status?: number; retryAfter?: number }
          if (e.status === 403 || e.status === 429) {
            const retryAfter = e.retryAfter ?? 60
            console.warn('[rgp:queue] rate limited — sleeping', retryAfter, 's')
            localPaused = true
            localRetryAfter = retryAfter
            notify()
            await sleep(retryAfter * 1000)
            logger.log('[rgp:queue] resuming after rate limit')
            localPaused = false
            localRetryAfter = undefined
            notify()
            attempts++
          } else {
            // Non-rate-limit error: skip task
            console.error('[rgp:queue] task error (skipping)', task.id, err)
            localCompleted++
            notify()
            break
          }
        }
      }
    }
  } finally {
    logger.log('[rgp:queue] all tasks done')
    // Final Done! broadcast is handled by background.ts after processQueue returns
  }
}
