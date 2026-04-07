import { sendMessage } from './messages'

export interface ProjectContext {
  projectId: string
  owner: string
  isOrg: boolean
  number: number
}

export interface ProjectFieldOption {
  id: string
  name: string
  color?: string
}

export interface ProjectIteration {
  id: string
  title: string
  startDate: string
  duration: number
}

export interface ProjectField {
  id: string
  name: string
  dataType: string
  options?: ProjectFieldOption[]
  configuration?: {
    iterations: ProjectIteration[]
  }
}

export interface ProjectData {
  id: string
  title: string
  fields: ProjectField[]
}

interface ProjectFieldRequest {
  owner: string
  number: number
  isOrg: boolean
}

const ORG_PROJECT_PATH_RE = /\/orgs\/([^/]+)\/projects\/(\d+)/
const USER_NAMESPACE_PROJECT_PATH_RE = /\/users\/([^/]+)\/projects\/(\d+)/
const USER_PROJECT_PATH_RE = /^\/([^/]+)\/projects\/(\d+)/

function createProjectContext(owner: string, rawNumber: string, isOrg: boolean): ProjectContext {
  return {
    owner,
    number: Number.parseInt(rawNumber, 10),
    isOrg,
    projectId: `${isOrg ? 'org' : 'user'}-project-${rawNumber}`,
  }
}

export function extractProjectContext(
  pathname: string = window.location.pathname,
): ProjectContext | null {
  const orgMatch = pathname.match(ORG_PROJECT_PATH_RE)
  if (orgMatch) return createProjectContext(orgMatch[1], orgMatch[2], true)

  const userNamespaceMatch = pathname.match(USER_NAMESPACE_PROJECT_PATH_RE)
  if (userNamespaceMatch)
    return createProjectContext(userNamespaceMatch[1], userNamespaceMatch[2], false)

  const userMatch = pathname.match(USER_PROJECT_PATH_RE)
  if (userMatch) return createProjectContext(userMatch[1], userMatch[2], false)

  return null
}

export async function fetchProjectFields(context: ProjectFieldRequest): Promise<ProjectData> {
  try {
    return await sendMessage('getProjectFields', context)
  } catch (error) {
    console.error('[rgp:cs] failed to fetch project fields', error)
    return { id: '', title: 'Project', fields: [] }
  }
}
