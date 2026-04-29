import { Effect } from 'effect'

import { onMessage } from '@/lib/messages'
import { patStorage, usernameStorage } from '@/lib/storage'
import { cancelQueue } from '@/lib/queue'
import { VALIDATE_TOKEN } from '@/lib/graphql/queries'
import type { PatErrorType } from '@/lib/errors'
import { logger } from '@/lib/debug-logger'
import { runHandler } from '@/lib/effect/runtime'

export function registerConfigHandlers(): void {
  onMessage('openOptions', () => {
    browser.tabs.create({ url: browser.runtime.getURL('/options.html') })
  })

  onMessage('getPatStatus', () =>
    runHandler(
      'getPatStatus',
      Effect.tryPromise({
        try: async () => {
          const pat = await patStorage.getValue()
          return { hasPat: Boolean(pat?.trim()) }
        },
        catch: (err) => err as unknown,
      }).pipe(Effect.orDie),
    ),
  )

  onMessage('validatePat', ({ data }) =>
    runHandler(
      'validatePat',
      Effect.tryPromise({
        try: () => validatePatAsync(data.token),
        catch: (err) => err as unknown,
      }).pipe(Effect.orDie),
    ),
  )

  onMessage('cancelProcess', ({ data }) => {
    cancelQueue(data.processId)
  })
}

async function validatePatAsync(
  token: string,
): Promise<
  { valid: true; user: string } | { valid: false; errorType?: PatErrorType; errorMessage?: string }
> {
  const tokenHint = `***${token.slice(-4)}`
  logger.verbose('[rgp:config] validatePat → network request', { token: tokenHint })

  let res: Response
  try {
    res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'GitHub-Feature-Request': 'ProjectV2',
      },
      body: JSON.stringify({ query: VALIDATE_TOKEN, variables: {} }),
    })
  } catch (err) {
    logger.error('[rgp:config] validatePat network error', err)
    return { valid: false as const, errorType: 'network' as PatErrorType }
  }

  logger.verbose('[rgp:config] validatePat ← response', { status: res.status })

  if (res.status === 401) {
    const body = (await res.json().catch(() => ({}))) as { message?: string }
    logger.warn('[rgp:config] validatePat 401 — expired or invalid token', {
      message: body.message,
    })
    return {
      valid: false as const,
      errorType: 'expired_or_invalid' as PatErrorType,
      errorMessage: body.message,
    }
  }

  if (!res.ok) {
    const rateLimitRemaining = res.headers.get('X-RateLimit-Remaining')
    const isRateLimit = res.status === 429 || (res.status === 403 && rateLimitRemaining === '0')
    logger.warn('[rgp:config] validatePat non-ok response', {
      status: res.status,
      statusText: res.statusText,
      rateLimitRemaining,
      isRateLimit,
    })
    return {
      valid: false as const,
      errorType: (isRateLimit ? 'rate_limit' : 'unknown') as PatErrorType,
      errorMessage: res.statusText,
    }
  }

  const json = (await res.json().catch(() => null)) as {
    data?: { viewer?: { login?: string } }
    errors?: { message?: string }[]
  } | null
  if (!json) {
    logger.warn('[rgp:config] validatePat invalid JSON response')
    return {
      valid: false as const,
      errorType: 'unknown' as PatErrorType,
      errorMessage: 'Invalid response payload',
    }
  }
  if (json.errors?.length) {
    const errMsg: string = json.errors[0].message ?? ''
    const lower = errMsg.toLowerCase()
    const isScope = lower.includes('scope') || lower.includes('permission')
    const isRateLimit = lower.includes('rate limit') || lower.includes('abuse')
    logger.warn('[rgp:config] validatePat GraphQL error', {
      errMsg,
      isScope,
      isRateLimit,
    })
    const errorType: PatErrorType = isScope
      ? 'missing_scopes'
      : isRateLimit
        ? 'rate_limit'
        : 'unknown'
    return {
      valid: false as const,
      errorType,
      errorMessage: errMsg,
    }
  }

  const login = json.data?.viewer?.login
  if (!login) {
    logger.warn('[rgp:config] validatePat missing viewer login in response')
    return {
      valid: false as const,
      errorType: 'unknown' as PatErrorType,
      errorMessage: 'Missing viewer login in response',
    }
  }
  await usernameStorage.setValue(login)
  logger.verbose('[rgp:config] validatePat success', { login })
  return { valid: true as const, user: login }
}
