import type { IssueRelationshipData } from '@/lib/messages'
import type {
  IssueDatabaseId,
  IssueNodeId,
  IssueNumber,
  ProjectItemDomId,
  ProjectItemId,
  RepoName,
  RepoOwner,
} from '@/lib/effect/schemas/branded'

export interface IssueTypeNode {
  id: string
  name: string
  isEnabled: boolean
  description: string | null
  color: string | null
}
export interface IssueTypesResult {
  repository: {
    issueTypes: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null }
      edges: { node: IssueTypeNode }[]
    }
  } | null
}

export interface RelationshipSearchIssueNode {
  id: string
  databaseId: number
  number: number
  title: string
  state: 'OPEN' | 'CLOSED'
  repository: {
    owner: { login: string }
    name: string
  }
}

export interface RelationshipSearchResult {
  repository?: {
    issue?: RelationshipSearchIssueNode | null
    issues?: {
      nodes: RelationshipSearchIssueNode[]
    }
  } | null
  search?: {
    nodes: Array<RelationshipSearchIssueNode | null>
  }
}

export type FieldsResultProject = {
  id: string
  databaseId: number
  title: string
  fields: {
    nodes: {
      id: string
      name: string
      dataType: string
      options?: { id: string; name: string; color: string }[]
      configuration?: {
        iterations: { id: string; title: string; startDate: string; duration: number }[]
        completedIterations?: { id: string; title: string; startDate: string; duration: number }[]
      }
    }[]
  }
}

export interface FieldBase {
  field: { id: string; name: string; dataType: string }
}
export interface TextFieldValue extends FieldBase {
  text: string
}
export interface SingleSelectFieldValue extends FieldBase {
  optionId: string
}
export interface IterationFieldValue extends FieldBase {
  iterationId: string
}
export interface NumberFieldValue extends FieldBase {
  number: number
}
export interface DateFieldValue extends FieldBase {
  date: string
}

export type FieldValue =
  | TextFieldValue
  | SingleSelectFieldValue
  | IterationFieldValue
  | NumberFieldValue
  | DateFieldValue

export interface ProjectItemDetails {
  node: {
    id: string
    project: { id: string }
    content: {
      id: string
      databaseId: number
      number: number
      title: string
      body: string
      repository: { id: string; owner: { login: string }; name: string }
      assignees: { nodes: { id: string; login: string; name: string; avatarUrl: string }[] }
      labels: { nodes: { id: string; name: string; color: string }[] }
      issueType?: { id: string; name: string }
      parent?: {
        id: string
        databaseId: number
        number: number
        title: string
        repository: { owner: { login: string }; name: string }
      }
    }
    fieldValues: {
      nodes: FieldValue[]
    }
  }
}

export interface RestIssuePayload {
  id?: number
  node_id?: string
  number?: number
  title?: string
  repository_url?: string
  html_url?: string
}

export interface RestIssueDependencyEntry extends RestIssuePayload {
  repository?: {
    full_name?: string
  }
  issue?: RestIssuePayload
  blocking_issue?: RestIssuePayload
  blocked_issue?: RestIssuePayload
}

export type RestIssueDependencyResponse =
  | RestIssueDependencyEntry[]
  | {
      dependencies?: RestIssueDependencyEntry[]
      blocking_issues?: RestIssueDependencyEntry[]
    }

export interface RestSubIssue {
  number: number
  title: string
  state: string
  repository?: { full_name?: string; owner?: { login?: string }; name?: string }
}

export interface ResolvedItem {
  domId: ProjectItemDomId
  issueNodeId: IssueNodeId
  projectItemId: ProjectItemId
  repoOwner: RepoOwner
  repoName: RepoName
  issueDatabaseId?: IssueDatabaseId
  issueNumber?: IssueNumber
  currentParent?: IssueRelationshipData
  typename?: 'Issue' | 'PullRequest'
}

export interface ResolvedItemWithTitle extends ResolvedItem {
  title: string
  typename: 'Issue' | 'PullRequest'
}
