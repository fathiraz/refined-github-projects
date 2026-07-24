import { defineExtensionMessaging } from '@webext-core/messaging'
import type { ProtocolMapFromSchemas } from '@/lib/schemas-messages'

export interface IssueRelationshipData {
  nodeId?: string
  databaseId?: number
  number: number
  title: string
  repoOwner: string
  repoName: string
}

export interface DuplicateItemPlan {
  title: {
    enabled: boolean
    value: string
  }
  body: {
    enabled: boolean
    value: string
  }
  assignees: {
    enabled: boolean
    ids: string[]
  }
  labels: {
    enabled: boolean
    ids: string[]
  }
  issueType: {
    enabled: boolean
    id?: string
    name?: string
  }
  fieldValues: {
    fieldId: string
    enabled: boolean
    value: Record<string, unknown>
  }[]
  relationships: {
    parent: {
      enabled: boolean
      issue?: IssueRelationshipData
    }
    blockedBy: {
      enabled: boolean
      issues: IssueRelationshipData[]
    }
    blocking: {
      enabled: boolean
      issues: IssueRelationshipData[]
    }
  }
}

export interface IssueSearchResultData extends IssueRelationshipData {
  state?: 'OPEN' | 'CLOSED'
}

export interface BulkEditRelationshipListUpdate {
  add: IssueRelationshipData[]
  remove: IssueRelationshipData[]
  clear: boolean
}

export interface BulkEditRelationshipsUpdate {
  parent: {
    set?: IssueRelationshipData
    clear: boolean
  }
  blockedBy: BulkEditRelationshipListUpdate
  blocking: BulkEditRelationshipListUpdate
}

export interface BulkRelationshipValidationResult {
  errors: string[]
}

/** Immediate accept/reject from the bulkUpdate message handler (work continues in background when ok). */
export type BulkUpdateDispatchResult = { ok: true } | { ok: false; reason: 'concurrent' }

/** Shared shape for the `bulkUpdate` message payload — used by both the
 * content-script sender and the background handler so the contract cannot
 * drift between the two sides. */
export interface BulkUpdateMessageData {
  itemIds: string[]
  projectId: string
  updates: { fieldId: string; value: unknown }[]
  relationships?: BulkEditRelationshipsUpdate
  fieldMeta?: Record<
    string,
    {
      name: string
      options?: { id: string; name: string }[]
      iterations?: { id: string; title: string; startDate: string; duration: number }[]
    }
  >
}

/** Payload for `createIssueWithFields` — RGP creates the issue itself (native
 * Create button intercepted), then attaches it to the project and applies
 * staged custom-field values, reading ids straight from the API responses. */
export interface CreateIssueWithFieldsMessageData {
  projectId: string
  repoOwner: string
  repoName: string
  title: string
  body: string
  createMore: boolean
  updates: { fieldId: string; value: unknown }[]
  fieldMeta?: BulkUpdateMessageData['fieldMeta']
  assignees?: string[]
  labels?: string[]
}

export interface ItemPreviewData {
  resolvedItemId: string
  issueNumber: number
  title: string
  body: string
  state: 'OPEN' | 'CLOSED'
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
  relationships: {
    parent?: IssueRelationshipData
    blockedBy: IssueRelationshipData[]
    blocking: IssueRelationshipData[]
  }
}

export interface SprintInfo {
  id: string
  title: string
  startDate: string
  duration: number
  endDate: string
}

export interface SprintProgressData {
  totalIssues: number
  doneIssues: number
  totalPoints: number
  donePoints: number
  hasPointsField: boolean
  pointsFieldName: string
  scopeAddedIssues: number
  scopeAddedPoints: number
  recentlyAdded: Array<{
    id: string
    title: string
    points: number
    assignees: Array<{ login: string; avatarUrl: string }>
  }>
}

export interface SubIssueData {
  number: number
  title: string
  repoOwner: string
  repoName: string
  state: 'OPEN' | 'CLOSED'
}

export interface HierarchyData {
  resolvedItemId: string
  issueNumber: number
  repoOwner: string
  repoName: string
  parent?: IssueRelationshipData
  subIssues: SubIssueData[]
  totalSubIssues: number
  completedSubIssues: number
  blockedBy: IssueRelationshipData[]
  blocking: IssueRelationshipData[]
}

export interface BulkRandomAssignData {
  itemIds: string[]
  projectId: string
  assignments: Array<{ itemId: string; assigneeIds: string[] }>
  strategy: 'balanced' | 'random' | 'round-robin'
}

const _messaging = defineExtensionMessaging<ProtocolMapFromSchemas>()
export const onMessage = _messaging.onMessage

// wrap sendMessage with SW reconnect retry logic
// when the SW is idle, Chrome terminates it. Waking it takes ~100-300ms.
// this wrapper catches "Could not establish connection" errors and retries once.
export const sendMessage: typeof _messaging.sendMessage = async (
  type: any,
  data: any,
  tabId?: number,
): Promise<any> => {
  const doSend = () =>
    tabId != null ? _messaging.sendMessage(type, data, tabId) : _messaging.sendMessage(type, data)
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
