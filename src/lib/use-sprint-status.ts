import { useCallback, useEffect, useState } from 'react'
import { sendMessage } from '@/lib/messages'
import type { SprintStatus } from '@/lib/messages'

/** The states both sprint surfaces render from. */
export type SprintState =
  | 'loading'
  | 'not-configured'
  | 'no-active'
  | 'acknowledged'
  | 'active'
  | 'error'

interface ProjectRef {
  projectId: string
  owner: string
  isOrg: boolean
  number: number
}

/**
 * Loads the sprint status and derives the state the sprint panel and the
 * group-header widget both switch on, plus the acknowledge round trip they
 * both ran. Shared because the two surfaces are shown together and must not
 * disagree about which sprint is active.
 */
export function useSprintStatus({ projectId, owner, isOrg, number }: ProjectRef) {
  const [state, setState] = useState<SprintState>('loading')
  const [status, setStatus] = useState<SprintStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [acknowledging, setAcknowledging] = useState(false)

  const refresh = useCallback(async () => {
    setState('loading')
    setError(null)
    try {
      const result = await sendMessage('getSprintStatus', { projectId, owner, number, isOrg })
      setStatus(result)
      if (!result.hasSettings) setState('not-configured')
      else if (result.activeSprint) setState('active')
      else if (result.acknowledgedSprint) setState('acknowledged')
      else setState('no-active')
    } catch (e) {
      console.error('[rgp:sprint] fetchStatus error:', e)
      setError(String(e))
      setState('error')
    }
  }, [projectId, owner, number, isOrg])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load sprint status when project context changes
    void refresh()
  }, [refresh])

  const acknowledge = async () => {
    if (!status?.nearestUpcoming) return
    setAcknowledging(true)
    try {
      await sendMessage('acknowledgeUpcomingSprint', {
        projectId,
        iterationId: status.nearestUpcoming.id,
      })
      await refresh()
    } finally {
      setAcknowledging(false)
    }
  }

  return { state, status, error, acknowledging, refresh, acknowledge }
}
