import { onMessage } from '@/lib/messages'
import { patStorage, usernameStorage } from '@/lib/storage'
import { cancelQueue } from '@/lib/queue'
import { VALIDATE_TOKEN } from '@/lib/graphql/queries'
import type { PatErrorType } from '@/lib/errors'
import { logger } from '@/lib/debug-logger'

export function registerConfigHandlers(): void {
  onMessage('openOptions', () => {
    browser.runtime.openOptionsPage()
  })

  onMessage('getPatStatus', async () => {
    const pat = await patStorage.getValue()
    return { hasPat: Boolean(pat?.trim()) }
  })

  onMessage('validatePat', async ({ data }) => {
    const tokenHint = `***${data.token.slice(-4)}`
    logger.verbose('[rgp:config] validatePat → network request', { token: tokenHint })

    let res: Response
    try {
      res = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${data.token}`,
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
      logger.warn('[rgp:config] validatePat non-ok response', {
        status: res.status,
        statusText: res.statusText,
      })
      return {
        valid: false as const,
        errorType: 'unknown' as PatErrorType,
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
      const isScope =
        errMsg.toLowerCase().includes('scope') || errMsg.toLowerCase().includes('permission')
      logger.warn('[rgp:config] validatePat GraphQL error', { errMsg, isScope })
      return {
        valid: false as const,
        errorType: (isScope ? 'missing_scopes' : 'unknown') as PatErrorType,
        errorMessage: errMsg,
      }
    }

    const login = json.data?.viewer?.login
    if (login) await usernameStorage.setValue(login)
    logger.verbose('[rgp:config] validatePat success', { login })
    return { valid: true as const, user: login ?? '' }
  })

  onMessage('cancelProcess', ({ data }) => {
    cancelQueue(data.processId)
  })
}
