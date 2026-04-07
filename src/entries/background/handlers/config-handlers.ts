import { onMessage } from '@/lib/messages'
import { patStorage, usernameStorage } from '@/lib/storage'
import { cancelQueue } from '@/lib/queue'
import { VALIDATE_TOKEN } from '@/lib/graphql/queries'

export function registerConfigHandlers(): void {
  onMessage('openOptions', () => {
    browser.runtime.openOptionsPage()
  })

  onMessage('getPatStatus', async () => {
    const pat = await patStorage.getValue()
    return { hasPat: Boolean(pat?.trim()) }
  })

  onMessage('validatePat', async ({ data }) => {
    try {
      const res = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${data.token}`,
          'Content-Type': 'application/json',
          'GitHub-Feature-Request': 'ProjectV2',
        },
        body: JSON.stringify({ query: VALIDATE_TOKEN, variables: {} }),
      })

      if (!res.ok) return { valid: false }

      const json = await res.json()
      if (json.errors?.length) return { valid: false }

      const login = json.data?.viewer?.login
      if (login) {
        await usernameStorage.setValue(login)
      }
      return { valid: true, user: login }
    } catch {
      return { valid: false }
    }
  })

  onMessage('cancelProcess', ({ data }) => {
    cancelQueue(data.processId)
  })
}
