export const CLONE_ISSUE = `
  mutation CloneIssue(
    $repositoryId: ID!
    $title: String!
    $body: String
    $assigneeIds: [ID!]
    $labelIds: [ID!]
  ) {
    createIssue(input: {
      repositoryId: $repositoryId
      title: $title
      body: $body
      assigneeIds: $assigneeIds
      labelIds: $labelIds
    }) {
      issue { id databaseId number }
    }
  }
`

export const ATTACH_TO_PROJECT = `
  mutation AttachToProject($projectId: ID!, $contentId: ID!) {
    addProjectV2ItemById(input: {
      projectId: $projectId
      contentId: $contentId
    }) {
      item { id }
    }
  }
`

export const UPDATE_PROJECT_FIELD = `
  mutation UpdateProjectField(
    $projectId: ID!
    $itemId: ID!
    $fieldId: ID!
    $value: ProjectV2FieldValue!
  ) {
    updateProjectV2ItemFieldValue(input: {
      projectId: $projectId
      itemId: $itemId
      fieldId: $fieldId
      value: $value
    }) {
      projectV2Item { id }
    }
  }
`

export const ADD_SUB_ISSUE = `
  mutation AddSubIssue($issueId: ID!, $subIssueId: ID!) {
    addSubIssue(input: {
      issueId: $issueId
      subIssueId: $subIssueId
    }) {
      issue { id }
      subIssue { id }
    }
  }
`

export const ADD_ASSIGNEES = `
  mutation AddAssignees($assignableId: ID!, $assigneeIds: [ID!]!) {
    addAssigneesToAssignable(input: {
      assignableId: $assignableId
      assigneeIds: $assigneeIds
    }) {
      assignable {
        ... on Issue { id }
        ... on PullRequest { id }
      }
    }
  }
`

export const REMOVE_ASSIGNEES = `
  mutation RemoveAssignees($assignableId: ID!, $assigneeIds: [ID!]!) {
    removeAssigneesFromAssignable(input: {
      assignableId: $assignableId
      assigneeIds: $assigneeIds
    }) {
      assignable {
        ... on Issue { id }
        ... on PullRequest { id }
      }
    }
  }
`

export const ADD_LABELS = `
  mutation AddLabels($labelableId: ID!, $labelIds: [ID!]!) {
    addLabelsToLabelable(input: {
      labelableId: $labelableId
      labelIds: $labelIds
    }) {
      labelable {
        ... on Issue { id }
        ... on PullRequest { id }
      }
    }
  }
`

export const UPDATE_ISSUE_MILESTONE = `
  mutation UpdateIssueMilestone($issueId: ID!, $milestoneId: ID) {
    updateIssue(input: {
      id: $issueId,
      milestoneId: $milestoneId
    }) {
      issue { id }
    }
  }
`

export const UPDATE_ISSUE_TYPE = `
  mutation UpdateIssueType($issueId: ID!, $issueTypeId: ID!) {
    updateIssue(input: {
      id: $issueId,
      issueTypeId: $issueTypeId
    }) {
      issue { id }
    }
  }
`

export const CLOSE_ISSUE = `
  mutation CloseIssue($issueId: ID!, $stateReason: IssueClosedStateReason) {
    closeIssue(input: { issueId: $issueId, stateReason: $stateReason }) {
      issue { id state stateReason }
    }
  }
`

export const REOPEN_ISSUE = `
  mutation ReopenIssue($issueId: ID!) {
    reopenIssue(input: { issueId: $issueId }) {
      issue { id state }
    }
  }
`

export const TRANSFER_ISSUE = `
  mutation TransferIssue($issueId: ID!, $repositoryId: ID!) {
    transferIssue(input: { issueId: $issueId, repositoryId: $repositoryId }) {
      issue { id }
    }
  }
`

export const LOCK_ISSUE = `
  mutation LockIssue($lockableId: ID!, $lockReason: LockReason) {
    lockLockable(input: { lockableId: $lockableId, lockReason: $lockReason }) {
      lockedRecord {
        ... on Issue { id locked }
      }
    }
  }
`

export const PIN_ISSUE = `
  mutation PinIssue($issueId: ID!) {
    pinIssue(input: { issueId: $issueId }) {
      issue { id }
    }
  }
`

export const UNPIN_ISSUE = `
  mutation UnpinIssue($issueId: ID!) {
    unpinIssue(input: { issueId: $issueId }) {
      issue { id }
    }
  }
`

export const DELETE_PROJECT_ITEM = `
  mutation DeleteProjectItem($projectId: ID!, $itemId: ID!) {
    deleteProjectV2Item(input: { projectId: $projectId, itemId: $itemId }) {
      deletedItemId
    }
  }
`

export const UPDATE_ISSUE_TITLE = `
  mutation UpdateIssueTitle($issueId: ID!, $title: String!) {
    updateIssue(input: { id: $issueId, title: $title }) {
      issue { id title }
    }
  }
`

export const UPDATE_PR_TITLE = `
  mutation UpdatePRTitle($prId: ID!, $title: String!) {
    updatePullRequest(input: { pullRequestId: $prId, title: $title }) {
      pullRequest { id title }
    }
  }
`

export const UPDATE_ISSUE_BODY = `
  mutation UpdateIssueBody($issueId: ID!, $body: String!) {
    updateIssue(input: { id: $issueId, body: $body }) {
      issue { id }
    }
  }
`

export const UPDATE_PR_BODY = `
  mutation UpdatePRBody($prId: ID!, $body: String!) {
    updatePullRequest(input: { pullRequestId: $prId, body: $body }) {
      pullRequest { id }
    }
  }
`

export const ADD_COMMENT = `
  mutation AddComment($subjectId: ID!, $body: String!) {
    addComment(input: { subjectId: $subjectId, body: $body }) {
      commentEdge { node { id } }
    }
  }
`
