import { Schema } from 'effect'
import { ExcludeCondition, SprintSettings } from './storage'
import { PatErrorType } from './errors'

/**
 * Schemas for every entry in `ProtocolMap` (src/lib/messages.ts).
 *
 * The plain TypeScript `interface` declarations in messages.ts remain the
 * authoritative wire types so we don't have to rewrite all call sites at
 * once; these schemas mirror them and are used by background message
 * handlers to:
 *   - decode untrusted incoming payloads (`Schema.decodeUnknown(input)`),
 *   - encode handler return values (`Schema.encode(output)`).
 *
 * Where a payload contains a value already validated upstream (e.g. `value:
 * Record<string, unknown>` for arbitrary field updates), `Schema.Unknown`
 * is used here and stricter validation lives at the call-site.
 */

// ─── Shared building blocks ─────────────────────────────────────────────────

export const IssueRelationshipData = Schema.Struct({
  nodeId: Schema.optional(Schema.String),
  databaseId: Schema.optional(Schema.Number),
  number: Schema.Number,
  title: Schema.String,
  repoOwner: Schema.String,
  repoName: Schema.String,
})
export type IssueRelationshipData = Schema.Schema.Type<typeof IssueRelationshipData>

export const IssueSearchResultData = Schema.extend(
  IssueRelationshipData,
  Schema.Struct({ state: Schema.optional(Schema.Literal('OPEN', 'CLOSED')) }),
)
export type IssueSearchResultData = Schema.Schema.Type<typeof IssueSearchResultData>

const BulkEditRelationshipListUpdate = Schema.Struct({
  add: Schema.Array(IssueRelationshipData),
  remove: Schema.Array(IssueRelationshipData),
  clear: Schema.Boolean,
})

const BulkEditRelationshipsUpdate = Schema.Struct({
  parent: Schema.Struct({
    set: Schema.optional(IssueRelationshipData),
    clear: Schema.Boolean,
  }),
  blockedBy: BulkEditRelationshipListUpdate,
  blocking: BulkEditRelationshipListUpdate,
})

const SubIssueData = Schema.Struct({
  number: Schema.Number,
  title: Schema.String,
  repoOwner: Schema.String,
  repoName: Schema.String,
  state: Schema.Literal('OPEN', 'CLOSED'),
})

const PreviewFieldEntry = Schema.Struct({
  fieldId: Schema.String,
  fieldName: Schema.String,
  dataType: Schema.Literal('TEXT', 'SINGLE_SELECT', 'ITERATION', 'NUMBER', 'DATE'),
  text: Schema.optional(Schema.String),
  number: Schema.optional(Schema.Number),
  date: Schema.optional(Schema.String),
  optionId: Schema.optional(Schema.String),
  optionName: Schema.optional(Schema.String),
  optionColor: Schema.optional(Schema.String),
  iterationId: Schema.optional(Schema.String),
  iterationTitle: Schema.optional(Schema.String),
  iterationStartDate: Schema.optional(Schema.String),
  options: Schema.optional(
    Schema.Array(Schema.Struct({ id: Schema.String, name: Schema.String, color: Schema.String })),
  ),
  iterations: Schema.optional(
    Schema.Array(
      Schema.Struct({
        id: Schema.String,
        title: Schema.String,
        startDate: Schema.String,
        duration: Schema.Number,
      }),
    ),
  ),
})

export const ItemPreviewData = Schema.Struct({
  resolvedItemId: Schema.String,
  issueNumber: Schema.Number,
  title: Schema.String,
  body: Schema.String,
  repoOwner: Schema.String,
  repoName: Schema.String,
  assignees: Schema.Array(
    Schema.Struct({ id: Schema.String, login: Schema.String, avatarUrl: Schema.String }),
  ),
  labels: Schema.Array(
    Schema.Struct({ id: Schema.String, name: Schema.String, color: Schema.String }),
  ),
  projectId: Schema.String,
  fields: Schema.Array(PreviewFieldEntry),
  issueTypeId: Schema.optional(Schema.String),
  issueTypeName: Schema.optional(Schema.String),
  relationships: Schema.Struct({
    parent: Schema.optional(IssueRelationshipData),
    blockedBy: Schema.Array(IssueRelationshipData),
    blocking: Schema.Array(IssueRelationshipData),
  }),
})

const SprintInfo = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  startDate: Schema.String,
  duration: Schema.Number,
  endDate: Schema.String,
})

export const SprintProgressData = Schema.Struct({
  totalIssues: Schema.Number,
  doneIssues: Schema.Number,
  totalPoints: Schema.Number,
  donePoints: Schema.Number,
  hasPointsField: Schema.Boolean,
  pointsFieldName: Schema.String,
  scopeAddedIssues: Schema.Number,
  scopeAddedPoints: Schema.Number,
  recentlyAdded: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      title: Schema.String,
      points: Schema.Number,
      assignees: Schema.Array(Schema.Struct({ login: Schema.String, avatarUrl: Schema.String })),
    }),
  ),
})

export const HierarchyData = Schema.Struct({
  resolvedItemId: Schema.String,
  issueNumber: Schema.Number,
  repoOwner: Schema.String,
  repoName: Schema.String,
  parent: Schema.optional(IssueRelationshipData),
  subIssues: Schema.Array(SubIssueData),
  totalSubIssues: Schema.Number,
  completedSubIssues: Schema.Number,
  blockedBy: Schema.Array(IssueRelationshipData),
  blocking: Schema.Array(IssueRelationshipData),
})

const FailedItem = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  error: Schema.String,
})

const RetryContext = Schema.Struct({
  messageType: Schema.String,
  data: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
})

const Empty = Schema.Struct({})

// ─── Per-message schema definitions ─────────────────────────────────────────

/**
 * `Messages` is a record keyed by ProtocolMap key. Each entry has:
 *   - `input`  — Schema for `data` argument supplied by `sendMessage(type, data)`
 *   - `output` — Schema for the value returned to the sender
 *
 * For void-returning messages the output schema is `Schema.Void`.
 */
export const Messages = {
  duplicateItem: {
    input: Schema.Struct({
      itemId: Schema.String,
      projectId: Schema.String,
      plan: Schema.optional(Schema.Unknown),
    }),
    output: Schema.Void,
  },
  getItemPreview: {
    input: Schema.Struct({
      itemId: Schema.String,
      owner: Schema.String,
      number: Schema.Number,
      isOrg: Schema.Boolean,
    }),
    output: ItemPreviewData,
  },
  openOptions: { input: Empty, output: Schema.Void },
  getPatStatus: { input: Empty, output: Schema.Struct({ hasPat: Schema.Boolean }) },
  validatePat: {
    input: Schema.Struct({ token: Schema.String }),
    output: Schema.Union(
      Schema.Struct({ valid: Schema.Literal(true), user: Schema.String }),
      Schema.Struct({
        valid: Schema.Literal(false),
        errorType: Schema.optional(PatErrorType),
        errorMessage: Schema.optional(Schema.String),
      }),
    ),
  },
  searchRepoMetadata: {
    input: Schema.Struct({
      owner: Schema.String,
      name: Schema.String,
      q: Schema.String,
      type: Schema.Literal('ASSIGNEES', 'LABELS', 'MILESTONES', 'ISSUE_TYPES'),
    }),
    output: Schema.Array(
      Schema.Struct({
        id: Schema.String,
        name: Schema.String,
        color: Schema.optional(Schema.String),
        avatarUrl: Schema.optional(Schema.String),
        description: Schema.optional(Schema.String),
      }),
    ),
  },
  searchRelationshipIssues: {
    input: Schema.Struct({
      q: Schema.String,
      owner: Schema.optional(Schema.String),
      repoName: Schema.optional(Schema.String),
    }),
    output: Schema.Array(IssueSearchResultData),
  },
  validateBulkRelationshipUpdates: {
    input: Schema.Struct({
      itemIds: Schema.Array(Schema.String),
      projectId: Schema.String,
      relationships: BulkEditRelationshipsUpdate,
    }),
    output: Schema.Struct({ errors: Schema.Array(Schema.String) }),
  },
  searchTransferTargets: {
    input: Schema.Struct({
      owner: Schema.String,
      q: Schema.String,
      firstItemId: Schema.optional(Schema.String),
      projectId: Schema.optional(Schema.String),
    }),
    output: Schema.Array(
      Schema.Struct({
        id: Schema.String,
        name: Schema.String,
        nameWithOwner: Schema.String,
        isPrivate: Schema.Boolean,
        description: Schema.NullOr(Schema.String),
      }),
    ),
  },
  bulkUpdate: {
    input: Schema.Struct({
      itemIds: Schema.Array(Schema.String),
      projectId: Schema.String,
      updates: Schema.Array(Schema.Struct({ fieldId: Schema.String, value: Schema.Unknown })),
      relationships: Schema.optional(BulkEditRelationshipsUpdate),
      fieldMeta: Schema.optional(
        Schema.Record({
          key: Schema.String,
          value: Schema.Struct({
            name: Schema.String,
            options: Schema.optional(
              Schema.Array(Schema.Struct({ id: Schema.String, name: Schema.String })),
            ),
            iterations: Schema.optional(
              Schema.Array(
                Schema.Struct({
                  id: Schema.String,
                  title: Schema.String,
                  startDate: Schema.String,
                  duration: Schema.Number,
                }),
              ),
            ),
          }),
        }),
      ),
    }),
    output: Schema.Void,
  },
  bulkClose: {
    input: Schema.Struct({
      itemIds: Schema.Array(Schema.String),
      projectId: Schema.String,
      reason: Schema.Literal('COMPLETED', 'NOT_PLANNED'),
    }),
    output: Schema.Void,
  },
  bulkRandomAssign: {
    input: Schema.Struct({
      itemIds: Schema.Array(Schema.String),
      projectId: Schema.String,
      assignments: Schema.Array(
        Schema.Struct({ itemId: Schema.String, assigneeIds: Schema.Array(Schema.String) }),
      ),
      strategy: Schema.Literal('balanced', 'random', 'round-robin'),
    }),
    output: Schema.Void,
  },
  bulkOpen: {
    input: Schema.Struct({
      itemIds: Schema.Array(Schema.String),
      projectId: Schema.String,
    }),
    output: Schema.Void,
  },
  bulkTransfer: {
    input: Schema.Struct({
      itemIds: Schema.Array(Schema.String),
      projectId: Schema.String,
      targetRepoOwner: Schema.String,
      targetRepoName: Schema.String,
    }),
    output: Schema.Void,
  },
  bulkLock: {
    input: Schema.Struct({
      itemIds: Schema.Array(Schema.String),
      projectId: Schema.String,
      lockReason: Schema.NullOr(Schema.Literal('OFF_TOPIC', 'TOO_HEATED', 'RESOLVED', 'SPAM')),
    }),
    output: Schema.Void,
  },
  bulkPin: {
    input: Schema.Struct({
      itemIds: Schema.Array(Schema.String),
      projectId: Schema.String,
    }),
    output: Schema.Void,
  },
  bulkUnpin: {
    input: Schema.Struct({
      itemIds: Schema.Array(Schema.String),
      projectId: Schema.String,
    }),
    output: Schema.Void,
  },
  bulkDelete: {
    input: Schema.Struct({
      itemIds: Schema.Array(Schema.String),
      projectId: Schema.String,
    }),
    output: Schema.Void,
  },
  getProjectFields: {
    input: Schema.Struct({
      owner: Schema.String,
      number: Schema.Number,
      isOrg: Schema.Boolean,
    }),
    output: Schema.Struct({
      id: Schema.String,
      title: Schema.String,
      fields: Schema.Array(
        Schema.Struct({
          id: Schema.String,
          name: Schema.String,
          dataType: Schema.String,
          options: Schema.optional(
            Schema.Array(
              Schema.Struct({
                id: Schema.String,
                name: Schema.String,
                color: Schema.optional(Schema.String),
              }),
            ),
          ),
          configuration: Schema.optional(
            Schema.Struct({
              iterations: Schema.Array(
                Schema.Struct({
                  id: Schema.String,
                  title: Schema.String,
                  startDate: Schema.String,
                  duration: Schema.Number,
                }),
              ),
            }),
          ),
        }),
      ),
    }),
  },
  getSprintStatus: {
    input: Schema.Struct({
      projectId: Schema.String,
      owner: Schema.String,
      number: Schema.Number,
      isOrg: Schema.Boolean,
    }),
    output: Schema.Struct({
      hasSettings: Schema.Boolean,
      activeSprint: Schema.NullOr(SprintInfo),
      nearestUpcoming: Schema.NullOr(SprintInfo),
      acknowledgedSprint: Schema.NullOr(SprintInfo),
      iterationFieldId: Schema.NullOr(Schema.String),
      settings: Schema.NullOr(SprintSettings),
    }),
  },
  saveSprintSettings: {
    input: Schema.Struct({ projectId: Schema.String, settings: SprintSettings }),
    output: Schema.Struct({ ok: Schema.Boolean }),
  },
  acknowledgeUpcomingSprint: {
    input: Schema.Struct({ projectId: Schema.String, iterationId: Schema.String }),
    output: Schema.Struct({ ok: Schema.Boolean }),
  },
  getSprintProgress: {
    input: Schema.Struct({
      projectId: Schema.String,
      owner: Schema.String,
      number: Schema.Number,
      isOrg: Schema.Boolean,
      iterationId: Schema.String,
      sprintStartDate: Schema.String,
      settings: SprintSettings,
    }),
    output: SprintProgressData,
  },
  endSprint: {
    input: Schema.Struct({
      projectId: Schema.String,
      owner: Schema.String,
      number: Schema.Number,
      isOrg: Schema.Boolean,
      sprintFieldId: Schema.String,
      activeIterationId: Schema.String,
      nextIterationId: Schema.String,
      doneFieldId: Schema.String,
      doneFieldType: Schema.Literal('SINGLE_SELECT', 'TEXT'),
      doneOptionId: Schema.String,
      doneOptionValue: Schema.String,
      notStartedOptionId: Schema.optional(Schema.String),
      excludeConditions: Schema.Array(ExcludeCondition),
    }),
    output: Schema.Union(Schema.Void, Schema.Struct({ error: Schema.String })),
  },
  getItemTitles: {
    input: Schema.Struct({
      itemIds: Schema.Array(Schema.String),
      projectId: Schema.String,
    }),
    output: Schema.Array(
      Schema.Struct({
        domId: Schema.String,
        issueNodeId: Schema.String,
        title: Schema.String,
        typename: Schema.Literal('Issue', 'PullRequest'),
      }),
    ),
  },
  bulkRename: {
    input: Schema.Struct({
      itemIds: Schema.Array(Schema.String),
      projectId: Schema.String,
      renames: Schema.Array(
        Schema.Struct({
          domId: Schema.String,
          issueNodeId: Schema.String,
          newTitle: Schema.String,
          typename: Schema.Literal('Issue', 'PullRequest'),
        }),
      ),
    }),
    output: Schema.Void,
  },
  getReorderContext: {
    input: Schema.Struct({
      itemIds: Schema.Array(Schema.String),
      projectId: Schema.String,
      owner: Schema.String,
      number: Schema.Number,
      isOrg: Schema.Boolean,
      allDomIds: Schema.optional(Schema.Array(Schema.String)),
    }),
    output: Schema.Struct({
      projectId: Schema.String,
      allOrderedItems: Schema.Array(
        Schema.Struct({
          memexItemId: Schema.Number,
          nodeId: Schema.String,
          title: Schema.String,
        }),
      ),
      selectedItems: Schema.Array(
        Schema.Struct({
          domId: Schema.String,
          memexItemId: Schema.Number,
          nodeId: Schema.String,
          title: Schema.String,
        }),
      ),
    }),
  },
  bulkReorder: {
    input: Schema.Struct({
      projectId: Schema.String,
      reorderOps: Schema.Array(
        Schema.Struct({
          nodeId: Schema.String,
          previousNodeId: Schema.NullOr(Schema.String),
        }),
      ),
      label: Schema.optional(Schema.String),
    }),
    output: Schema.Void,
  },
  bulkReorderByPosition: {
    input: Schema.Struct({
      selectedDomIds: Schema.Array(Schema.String),
      insertAfterDomId: Schema.String,
      projectId: Schema.String,
      owner: Schema.String,
      number: Schema.Number,
      isOrg: Schema.Boolean,
      label: Schema.optional(Schema.String),
      allDomIds: Schema.optional(Schema.Array(Schema.String)),
    }),
    output: Schema.Void,
  },
  getHierarchyData: {
    input: Schema.Struct({
      itemId: Schema.String,
      owner: Schema.String,
      number: Schema.Number,
      isOrg: Schema.Boolean,
    }),
    output: HierarchyData,
  },
  cancelProcess: {
    input: Schema.Struct({ processId: Schema.String }),
    output: Schema.Void,
  },
  queueStateUpdate: {
    input: Schema.Struct({
      total: Schema.Number,
      completed: Schema.Number,
      paused: Schema.Boolean,
      retryAfter: Schema.optional(Schema.Number),
      status: Schema.optional(Schema.String),
      detail: Schema.optional(Schema.String),
      processId: Schema.optional(Schema.String),
      label: Schema.optional(Schema.String),
      failedItems: Schema.optional(Schema.Array(FailedItem)),
      retryContext: Schema.optional(RetryContext),
    }),
    output: Schema.Void,
  },
} as const

export type MessageKey = keyof typeof Messages
