import { sendMessage } from '../../lib/messages'
import { injectCheckboxes, injectGroupCheckboxes, injectSelectAllCheckbox } from './checkboxes'
import { logger } from '../../lib/debugLogger'

export interface GHField {
  id: string
  name: string
  dataType: string
  options?: { id: string; name: string; color?: string }[]
  configuration?: {
    iterations: { id: string; title: string; startDate: string; duration: number }[]
  }
}

export interface ProjectData {
  id: string
  title: string
  fields: GHField[]
}

export function extractProjectContext(): { owner: string; number: number; isOrg: boolean; projectId: string } | null {
  // Try /orgs/OWNER/projects/NUMBER
  const orgMatch = window.location.pathname.match(/\/orgs\/([^\/]+)\/projects\/(\d+)/)
  if (orgMatch) {
    return { owner: orgMatch[1], number: parseInt(orgMatch[2], 10), isOrg: true, projectId: `org-project-${orgMatch[2]}` }
  }

  // Try /users/OWNER/projects/NUMBER (GitHub Projects V2 user namespace)
  const userNamespaceMatch = window.location.pathname.match(/\/users\/([^\/]+)\/projects\/(\d+)/)
  if (userNamespaceMatch) {
    return { owner: userNamespaceMatch[1], number: parseInt(userNamespaceMatch[2], 10), isOrg: false, projectId: `user-project-${userNamespaceMatch[2]}` }
  }

  // Try /OWNER/projects/NUMBER (legacy classic user projects)
  const userMatch = window.location.pathname.match(/^\/([^\/]+)\/projects\/(\d+)/)
  if (userMatch) {
    return { owner: userMatch[1], number: parseInt(userMatch[2], 10), isOrg: false, projectId: `user-project-${userMatch[2]}` }
  }

  return null
}

export async function fetchProjectFields(context: { owner: string; number: number; isOrg: boolean }): Promise<ProjectData> {
  try {
    return await sendMessage('getProjectFields', context)
  } catch (err) {
    console.error('[rgp:cs] failed to fetch project fields', err)
    return { id: '', title: 'Project', fields: [] }
  }
}

export function setupObservers(extras: Array<() => void> = []) {
  observeRows(extras)
  // observeDropdowns — temporarily disabled; see index.tsx for context
}

function observeRows(extras: Array<() => void> = []) {
  let rafId: number | null = null
  const observer = new MutationObserver(() => {
    if (rafId !== null) return          // coalesce rapid mutations
    rafId = requestAnimationFrame(() => {
      rafId = null
      injectCheckboxes()
      injectGroupCheckboxes()
      injectSelectAllCheckbox()
      extras.forEach(fn => fn())
    })
  })
  observer.observe(document.body, { childList: true, subtree: true })
  logger.log('[rgp:cs] MutationObserver started for rows')
  requestAnimationFrame(() => {
    injectCheckboxes()
    injectGroupCheckboxes()
    injectSelectAllCheckbox()
    extras.forEach(fn => fn())
  })
}
