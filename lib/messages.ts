import { defineExtensionMessaging } from '@webext-core/messaging'
import type { SprintSettings } from './storage'

export interface ItemPreviewData {
  resolvedItemId: string
  title: string
  body: string
  repoOwner: string
  repoName: string
  assignees: { id: string; login: string; avatarUrl: string }[]
  labels: { id: string; name: string; color: string }[]
  projectId: string
  fields: {
    fieldId: string
    fieldName: string
    dataType: 'TEXT' | 'SINGLE_SELECT' | 'ITERATION' | 'NUMBER' | 'DATE'
    text?: string
    number?: number
    date?: string
    optionId?: string
    optionName?: string
    optionColor?: string
    iterationId?: string
    iterationTitle?: string
    iterationStartDate?: string
    options?: { id: string; name: string; color: string }[]
    iterations?: { id: string; title: string; startDate: string; duration: number }[]
  }[]
  issueTypeId?: string
  issueTypeName?: string
  parentIssue?: {
    id: string
    number: number
    title: string
    repoOwner: string
    repoName: string
  }
}

export interface SprintInfo {
  id: string
  title: string
  startDate: string
  duration: number
  endDate: string
}

interface ProtocolMap {
  duplicateItem(data: {
    itemId: string
    projectId: string
    overrides?: {
      title?: string
      body?: string
      assigneeIds?: string[]
      labelIds?: string[]
      fieldValues?: { fieldId: string; value: Record<string, unknown> }[]
    }
  }): void
  getItemPreview(data: { itemId: string; owner: string; number: number; isOrg: boolean }): ItemPreviewData
  openOptions(data: {}): void
  getPatStatus(data: {}): { hasPat: boolean }
  validatePat(data: { token: string }): { valid: boolean; user?: string }
  searchRepoMetadata(data: { owner: string; name: string; q: string; type: 'ASSIGNEES' | 'LABELS' | 'MILESTONES' | 'ISSUE_TYPES' }): { id: string; name: string; color?: string; avatarUrl?: string; description?: string }[]
  searchTransferTargets(data: {
    owner: string
    q: string
    firstItemId?: string
    projectId?: string
  }): { id: string; name: string; nameWithOwner: string; isPrivate: boolean; description: string | null }[]
  bulkUpdate(data: { itemIds: string[]; projectId: string; updates: { fieldId: string; value: unknown }[] }): void
  bulkClose(data: {
    itemIds: string[]
    projectId: string
    reason: 'COMPLETED' | 'NOT_PLANNED'
  }): void
  bulkOpen(data: {
    itemIds: string[]
    projectId: string
  }): void
  bulkTransfer(data: {
    itemIds: string[]
    projectId: string
    targetRepoOwner: string
    targetRepoName: string
  }): void
  bulkLock(data: {
    itemIds: string[]
    projectId: string
    lockReason: 'OFF_TOPIC' | 'TOO_HEATED' | 'RESOLVED' | 'SPAM' | null
  }): void
  bulkPin(data: {
    itemIds: string[]
    projectId: string
  }): void
  bulkUnpin(data: {
    itemIds: string[]
    projectId: string
  }): void
  bulkDelete(data: {
    itemIds: string[]
    projectId: string
  }): void
  getProjectFields(data: { owner: string; number: number; isOrg: boolean }): {
    id: string
    title: string
    fields: {
      id: string
      name: string
      dataType: string
      options?: { id: string; name: string; color?: string }[]
      configuration?: {
        iterations: { id: string; title: string; startDate: string; duration: number }[]
      }
    }[]
  }
  getSprintStatus(data: {
    projectId: string
    owner: string
    number: number
    isOrg: boolean
  }): {
    hasSettings: boolean
    activeSprint: SprintInfo | null
    nearestUpcoming: SprintInfo | null
    acknowledgedSprint: SprintInfo | null
    iterationFieldId: string | null
    settings: SprintSettings | null
  }
  saveSprintSettings(data: { projectId: string; settings: SprintSettings }): { ok: boolean }
  acknowledgeUpcomingSprint(data: { projectId: string; iterationId: string }): { ok: boolean }
  endSprint(data: {
    projectId: string
    owner: string
    number: number
    isOrg: boolean
    sprintFieldId: string
    activeIterationId: string
    nextIterationId: string
    doneFieldId: string
    doneFieldType: 'SINGLE_SELECT' | 'TEXT'
    doneOptionId: string
    doneOptionValue: string
  }): void
  getItemTitles(data: {
    itemIds: string[]
    projectId: string
  }): Array<{ domId: string; issueNodeId: string; title: string; typename: 'Issue' | 'PullRequest' }>
  bulkRename(data: {
    itemIds: string[]
    projectId: string
    renames: Array<{ domId: string; issueNodeId: string; newTitle: string; typename: 'Issue' | 'PullRequest' }>
  }): void
  getReorderContext(data: {
    itemIds: string[]
    projectId: string
    owner: string
    number: number
    isOrg: boolean
    allDomIds?: string[]
  }): {
    projectId: string
    /** All project items in current view order */
    allOrderedItems: Array<{ memexItemId: number; nodeId: string; title: string }>
    /** The selected items with their DOM IDs and resolved memex item IDs */
    selectedItems: Array<{ domId: string; memexItemId: number; nodeId: string; title: string }>
  }
  bulkReorder(data: {
    projectId: string
    reorderOps: Array<{
      nodeId: string
      previousNodeId: string | null
    }>
    label?: string
  }): void
  bulkReorderByPosition(data: {
    selectedDomIds: string[]
    insertAfterDomId: string
    projectId: string
    owner: string
    number: number
    isOrg: boolean
    label?: string
    allDomIds?: string[]
  }): void
  cancelProcess(data: { processId: string }): void
  queueStateUpdate(data: {
    total: number
    completed: number
    paused: boolean
    retryAfter?: number
    status?: string
    processId?: string
    label?: string
  }): void
}

const _messaging = defineExtensionMessaging<ProtocolMap>()
export const onMessage = _messaging.onMessage

// Wrap sendMessage with SW reconnect retry logic
// When the SW is idle, Chrome terminates it. Waking it takes ~100-300ms.
// This wrapper catches "Could not establish connection" errors and retries once.
export const sendMessage: typeof _messaging.sendMessage = async (
  type: any,
  data: any,
  tabId?: number,
): Promise<any> => {
  const doSend = () =>
    tabId != null
      ? _messaging.sendMessage(type, data, tabId)
      : _messaging.sendMessage(type, data)
  try {
    return await doSend()
  } catch (err: unknown) {
    const msg = (err as Error)?.message ?? ''
    if (
      msg.includes('Could not establish connection') ||
      msg.includes('Receiving end does not exist')
    ) {
      await new Promise<void>((r) => setTimeout(r, 300))
      return doSend()
    }
    throw err
  }
}

