import { Schema } from 'effect'

/**
 * Runtime schemas for GitHub GraphQL/REST shapes consumed by the background
 * worker. Used to decode raw responses inside `GithubGraphQL.request` so that
 * a malformed payload fails fast with `GithubDecodeError` instead of leaking
 * `as unknown as T` casts deeper into the codebase.
 *
 * Schemas intentionally accept loose primitives (Schema.String / Number) for
 * IDs at this boundary — branding happens at higher-level domain mappers.
 */

// ─── Common building blocks ─────────────────────────────────────────────────

const RepoOwner = Schema.Struct({ login: Schema.String })
const Repository = Schema.Struct({
  id: Schema.optional(Schema.String),
  owner: RepoOwner,
  name: Schema.String,
})

const Assignee = Schema.Struct({
  id: Schema.String,
  login: Schema.String,
  name: Schema.optional(Schema.NullOr(Schema.String)),
  avatarUrl: Schema.String,
})

const Label = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  color: Schema.String,
})

const IssueType = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
})

const ParentIssueRef = Schema.Struct({
  id: Schema.String,
  databaseId: Schema.Number,
  number: Schema.Number,
  title: Schema.String,
  repository: Schema.Struct({
    owner: RepoOwner,
    name: Schema.String,
  }),
})

// ─── Field values (tagged union by `field.dataType`) ────────────────────────

const FieldRef = Schema.Struct({
  field: Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    dataType: Schema.String,
  }),
})

export const TextFieldValue = Schema.extend(FieldRef, Schema.Struct({ text: Schema.String }))
export const SingleSelectFieldValue = Schema.extend(
  FieldRef,
  Schema.Struct({ optionId: Schema.String }),
)
export const IterationFieldValue = Schema.extend(
  FieldRef,
  Schema.Struct({ iterationId: Schema.String }),
)
export const NumberFieldValue = Schema.extend(FieldRef, Schema.Struct({ number: Schema.Number }))
export const DateFieldValue = Schema.extend(FieldRef, Schema.Struct({ date: Schema.String }))

export const FieldValue = Schema.Union(
  TextFieldValue,
  SingleSelectFieldValue,
  IterationFieldValue,
  NumberFieldValue,
  DateFieldValue,
)
export type FieldValue = Schema.Schema.Type<typeof FieldValue>

// ─── ProjectItemDetails (GET_PROJECT_ITEM_DETAILS) ──────────────────────────

export const ProjectItemDetails = Schema.Struct({
  node: Schema.Struct({
    id: Schema.String,
    project: Schema.Struct({ id: Schema.String }),
    content: Schema.Struct({
      id: Schema.String,
      databaseId: Schema.Number,
      number: Schema.Number,
      title: Schema.String,
      body: Schema.String,
      repository: Repository,
      assignees: Schema.Struct({ nodes: Schema.Array(Assignee) }),
      labels: Schema.Struct({ nodes: Schema.Array(Label) }),
      issueType: Schema.optional(Schema.NullOr(IssueType)),
      parent: Schema.optional(Schema.NullOr(ParentIssueRef)),
    }),
    fieldValues: Schema.Struct({
      // Loose array — entries that don't match a known FieldValue variant are
      // filtered downstream (kept here as `Unknown` so unrelated field kinds
      // such as Milestone don't cause whole-payload decode failure).
      nodes: Schema.Array(Schema.Unknown),
    }),
  }),
})
export type ProjectItemDetails = Schema.Schema.Type<typeof ProjectItemDetails>

// ─── FieldsResultProject (GET_PROJECT_FIELDS) ───────────────────────────────

const FieldOption = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  color: Schema.String,
})

const Iteration = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  startDate: Schema.String,
  duration: Schema.Number,
})

const FieldNode = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  dataType: Schema.String,
  options: Schema.optional(Schema.Array(FieldOption)),
  configuration: Schema.optional(
    Schema.Struct({
      iterations: Schema.Array(Iteration),
      completedIterations: Schema.optional(Schema.Array(Iteration)),
    }),
  ),
})

export const FieldsResultProject = Schema.Struct({
  id: Schema.String,
  databaseId: Schema.Number,
  title: Schema.String,
  fields: Schema.Struct({ nodes: Schema.Array(FieldNode) }),
})
export type FieldsResultProject = Schema.Schema.Type<typeof FieldsResultProject>

// ─── RelationshipSearchResult (search) ──────────────────────────────────────

const RelationshipSearchIssueNode = Schema.Struct({
  id: Schema.String,
  databaseId: Schema.Number,
  number: Schema.Number,
  title: Schema.String,
  state: Schema.Literal('OPEN', 'CLOSED'),
  repository: Schema.Struct({
    owner: RepoOwner,
    name: Schema.String,
  }),
})

export const RelationshipSearchResult = Schema.Struct({
  repository: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        issue: Schema.optional(Schema.NullOr(RelationshipSearchIssueNode)),
        issues: Schema.optional(
          Schema.Struct({ nodes: Schema.Array(RelationshipSearchIssueNode) }),
        ),
      }),
    ),
  ),
  search: Schema.optional(
    Schema.Struct({ nodes: Schema.Array(Schema.NullOr(RelationshipSearchIssueNode)) }),
  ),
})
export type RelationshipSearchResult = Schema.Schema.Type<typeof RelationshipSearchResult>

// ─── REST: sub-issue + dependency entries ───────────────────────────────────

const RestIssuePayload = Schema.Struct({
  id: Schema.optional(Schema.Number),
  node_id: Schema.optional(Schema.String),
  number: Schema.optional(Schema.Number),
  title: Schema.optional(Schema.String),
  repository_url: Schema.optional(Schema.String),
  html_url: Schema.optional(Schema.String),
})

export const RestIssueDependencyEntry = Schema.extend(
  RestIssuePayload,
  Schema.Struct({
    repository: Schema.optional(Schema.Struct({ full_name: Schema.optional(Schema.String) })),
    issue: Schema.optional(RestIssuePayload),
    blocking_issue: Schema.optional(RestIssuePayload),
    blocked_issue: Schema.optional(RestIssuePayload),
  }),
)
export type RestIssueDependencyEntry = Schema.Schema.Type<typeof RestIssueDependencyEntry>

export const RestIssueDependencyResponse = Schema.Union(
  Schema.Array(RestIssueDependencyEntry),
  Schema.Struct({
    dependencies: Schema.optional(Schema.Array(RestIssueDependencyEntry)),
    blocking_issues: Schema.optional(Schema.Array(RestIssueDependencyEntry)),
  }),
)
export type RestIssueDependencyResponse = Schema.Schema.Type<typeof RestIssueDependencyResponse>

export const RestSubIssue = Schema.Struct({
  number: Schema.Number,
  title: Schema.String,
  state: Schema.String,
  repository: Schema.optional(
    Schema.Struct({
      full_name: Schema.optional(Schema.String),
      owner: Schema.optional(Schema.Struct({ login: Schema.optional(Schema.String) })),
      name: Schema.optional(Schema.String),
    }),
  ),
})
export type RestSubIssue = Schema.Schema.Type<typeof RestSubIssue>
