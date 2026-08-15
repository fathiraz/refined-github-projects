// REST helpers + rate-limit retry + queue broadcast.

import { sendMessage } from '@/lib/messages'
import { sleep } from '@/lib/queue'
import { patStorage } from '@/lib/storage'
import { logger } from '@/lib/debug-logger'
import { classifyHttpError } from '@/lib/errors'

export function parseRepoFromUrl(url?: string): { repoOwner: string; repoName: string } | null {
  if (!url) return null

  const apiMatch = url.match(/\/repos\/([^/]+)\/([^/]+)$/)
  if (apiMatch) {
    return {
      repoOwner: decodeURIComponent(apiMatch[1]),
      repoName: decodeURIComponent(apiMatch[2]),
    }
  }

  const htmlMatch = url.match(/github\.com\/([^/]+)\/([^/]+)\/issues\/\d+$/)
  if (htmlMatch) {
    return {
      repoOwner: decodeURIComponent(htmlMatch[1]),
      repoName: decodeURIComponent(htmlMatch[2]),
    }
  }

  return null
}

export async function githubRest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const pat = await patStorage.getValue()
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/vnd.github+json')
  headers.set('Authorization', `Bearer ${pat ?? ''}`)
  headers.set('X-GitHub-Api-Version', '2022-11-28')
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers,
  })

  if (!res.ok) {
    const retryAfter = Number(res.headers.get('Retry-After') ?? 0)
    let message = res.statusText

    try {
      const json = (await res.json()) as { message?: string }
      if (json.message) {
        message = json.message
      }
    } catch {
      // ignore json parse failures and fall back to status text.
    }

    const rateLimitRemainingHeader = res.headers.get('X-RateLimit-Remaining')
    const rateLimitRemaining =
      rateLimitRemainingHeader === null ? undefined : Number(rateLimitRemainingHeader)
    throw classifyHttpError({
      message,
      status: res.status,
      retryAfter,
      rateLimitRemaining,
    })
  }

  if (res.status === 204) {
    return undefined as T
  }

  return (await res.json()) as T
}

/** Undo hint offered on the Done! frame. */
export interface ReverseHint {
  messageType: string
  data: Record<string, unknown>
  affectedItemIds: string[]
  label?: string
  undoWindowMs?: number
}

export async function broadcastQueue(
  state: {
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
    reverse?: ReverseHint
  },
  tabId?: number,
) {
  try {
    await sendMessage('queueStateUpdate', state, tabId)
  } catch (err) {
    // swallow — tab may have navigated away while job was running
    logger.warn('[rgp:bg] broadcastQueue failed (tab may be gone):', err)
  }
}

// `GithubGraphQL.request` (the service that backs `gql(...)`) now retries
// rate-limit failures internally via Schedule.exponential.jittered ⨯
// recurs(2). This helper stays as the place that pushes the "paused —
// retrying in N seconds" UI broadcast for any *remaining* rate-limit error
// that escapes the service's own retries. We keep one extra attempt so the
// UI gets to show the pause; if the call still fails we surface the error.
// ponytail: only ever wraps idempotent read queries (item resolution) — safe
// to retry. Do NOT wrap a mutation with this; blind retry would double-write.
export async function withRateLimitRetry<T>(fn: () => Promise<T>, tabId?: number): Promise<T> {
  const MAX_RATE_LIMIT_PAUSES = 2
  let rateLimitPauses = 0
  for (;;) {
    try {
      return await fn()
    } catch (err) {
      // accept either the new tagged `GithubRateLimitError` or the legacy
      // `{ status, retryAfter }` shape (still used by direct fetch callers
      // such as `validatePat`).
      const e = err as {
        _tag?: string
        status?: number
        retryAfter?: number
      }
      const isRateLimit = e._tag === 'GithubRateLimitError' || e.status === 403 || e.status === 429
      if (isRateLimit && rateLimitPauses < MAX_RATE_LIMIT_PAUSES) {
        rateLimitPauses++
        const retryAfter = e.retryAfter ?? 60
        logger.warn('[rgp:bg] rate limited, broadcasting pause', {
          retryAfter,
          attempt: rateLimitPauses,
          maxAttempts: MAX_RATE_LIMIT_PAUSES,
        })
        logger.verbose(
          `⏸ paused ${retryAfter}s — attempt ${rateLimitPauses}/${MAX_RATE_LIMIT_PAUSES}`,
        )
        await broadcastQueue({ total: 0, completed: 0, paused: true, retryAfter }, tabId)
        await sleep(retryAfter * 1000)
        await broadcastQueue({ total: 0, completed: 0, paused: false }, tabId)
        continue
      }
      logger.error('[rgp:bg] task failed permanently', err)
      throw err
    }
  }
}
