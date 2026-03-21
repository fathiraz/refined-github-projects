export const VALIDATE_TOKEN = `
  query {
    viewer {
      login
    }
  }
`

export const GET_PROJECT_ITEM_DETAILS = `
  query GetProjectItemDetails($itemId: ID!) {
    node(id: $itemId) {
      ... on ProjectV2Item {
        id
        project { id }
        content {
          ... on Issue {
            id
            title
            body
            repository { id owner { login } name }
            assignees(first: 10) { nodes { id login name avatarUrl } }
            labels(first: 20) { nodes { id name color } }
            issueType { id name }
            parent { id number title repository { owner { login } name } }
          }
        }
        fieldValues(first: 50) {
          nodes {
            ... on ProjectV2ItemFieldTextValue {
              text
              field { ... on ProjectV2Field { id name dataType } }
            }
            ... on ProjectV2ItemFieldSingleSelectValue {
              optionId
              field { ... on ProjectV2SingleSelectField { id name dataType } }
            }
            ... on ProjectV2ItemFieldIterationValue {
              iterationId
              field { ... on ProjectV2IterationField { id name dataType } }
            }
            ... on ProjectV2ItemFieldNumberValue {
              number
              field { ... on ProjectV2Field { id name dataType } }
            }
            ... on ProjectV2ItemFieldDateValue {
              date
              field { ... on ProjectV2Field { id name dataType } }
            }
          }
        }
      }
    }
  }
`

export const GET_PROJECT_FIELDS = `
  query GetProjectFields($owner: String!, $number: Int!, $isOrg: Boolean!) {
    organization(login: $owner) @include(if: $isOrg) {
      projectV2(number: $number) {
        ...ProjectFields
      }
    }
    user(login: $owner) @skip(if: $isOrg) {
      projectV2(number: $number) {
        ...ProjectFields
      }
    }
  }

  fragment ProjectFields on ProjectV2 {
    id
    databaseId
    title
        fields(first: 50) {
          nodes {
            ... on ProjectV2Field {
              id
              name
              dataType
            }
            ... on ProjectV2SingleSelectField {
              id
              name
              dataType
              options {
                id
                name
                color
              }
            }
            ... on ProjectV2IterationField {
              id
              name
              dataType
              configuration {
                iterations {
                  id
                  title
                  startDate
                  duration
                }
                completedIterations {
                  id
                  title
                  startDate
                  duration
                }
              }
            }
          }
        }
      }
`

/**
 * Fetch project items with their content database IDs.
 * Used to resolve DOM-extracted issue database IDs (e.g. from data-hovercard-subject-tag)
 * into their corresponding ProjectV2Item Node IDs.
 */
export const GET_PROJECT_ITEMS_FOR_RESOLUTION = `
  query GetProjectItemsForResolution($projectId: ID!, $cursor: String) {
    node(id: $projectId) {
      ... on ProjectV2 {
        items(first: 100, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id
            content {
              __typename
              ... on Issue { id databaseId repository { owner { login } name } }
              ... on PullRequest { id databaseId repository { owner { login } name } }
            }
          }
        }
      }
    }
  }
`


export const GET_PROJECT_ITEMS_WITH_FIELDS = `
  query GetProjectItemsWithFields($projectId: ID!, $cursor: String) {
    node(id: $projectId) {
      ... on ProjectV2 {
        items(first: 100, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id
            fieldValues(first: 50) {
              nodes {
                ... on ProjectV2ItemFieldIterationValue {
                  iterationId
                  field { ... on ProjectV2IterationField { id } }
                }
                ... on ProjectV2ItemFieldSingleSelectValue {
                  optionId
                  field { ... on ProjectV2SingleSelectField { id } }
                }
                ... on ProjectV2ItemFieldTextValue {
                  text
                  field { ... on ProjectV2Field { id } }
                }
              }
            }
          }
        }
      }
    }
  }
`

export const GET_REPO_ASSIGNEES = `
  query GetRepoAssignees($owner: String!, $name: String!, $q: String!) {
    repository(owner: $owner, name: $name) {
      assignableUsers(first: 20, query: $q) {
        nodes {
          id
          login
          name
          avatarUrl
        }
      }
    }
  }
`

export const GET_REPO_LABELS = `
  query GetRepoLabels($owner: String!, $name: String!, $q: String!) {
    repository(owner: $owner, name: $name) {
      labels(first: 20, query: $q) {
        nodes {
          id
          name
          color
        }
      }
    }
  }
`

export const GET_REPO_MILESTONES = `
  query GetRepoMilestones($owner: String!, $name: String!, $q: String) {
    repository(owner: $owner, name: $name) {
      milestones(first: 20, query: $q, states: [OPEN], orderBy: { field: DUE_DATE, direction: ASC }) {
        nodes {
          id
          title
          number
          description
          dueOn
        }
      }
    }
  }
`

export const GET_REPOSITORY_ID = `
  query GetRepositoryId($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      id
    }
  }
`

export const GET_VIEWER_TOP_REPOS = `
  query GetViewerTopRepos($first: Int!) {
    viewer {
      topRepositories(first: $first, orderBy: { field: PUSHED_AT, direction: DESC }) {
        nodes {
          id
          name
          nameWithOwner
          isPrivate
          description
          hasIssuesEnabled
          isArchived
        }
      }
    }
  }
`

export const SEARCH_VIEWER_REPOS = `
  query SearchViewerRepos($q: String!, $first: Int!) {
    viewer {
      repositories(
        first: $first
        query: $q
        affiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER]
        ownerAffiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER]
        orderBy: { field: PUSHED_AT, direction: DESC }
      ) {
        nodes {
          id
          name
          nameWithOwner
          isPrivate
          description
          hasIssuesEnabled
          isArchived
        }
      }
    }
  }
`

export const SEARCH_OWNER_REPOS = `
  query SearchOwnerRepos($login: String!, $query: String!, $first: Int!) {
    repositoryOwner(login: $login) {
      repositories(
        first: $first
        query: $query
        orderBy: { field: PUSHED_AT, direction: DESC }
      ) {
        nodes {
          id
          name
          nameWithOwner
          isPrivate
          description
          hasIssuesEnabled
          isArchived
        }
      }
    }
  }
`

export const GET_POSSIBLE_TRANSFER_REPOS = `
  query GetPossibleTransferRepos($issueId: ID!, $first: Int!) {
    node(id: $issueId) {
      ... on Issue {
        possibleTransferRepositoriesForViewer(first: $first) {
          edges {
            node {
              id
              name
              nameWithOwner
              isPrivate
              description: shortDescriptionHTML
              hasIssuesEnabled
              isArchived
            }
          }
        }
      }
    }
  }
`

export const GET_PROJECT_ITEMS_FOR_RENAME = `
  query GetProjectItemsForRename($projectId: ID!, $cursor: String) {
    node(id: $projectId) {
      ... on ProjectV2 {
        items(first: 100, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id
            content {
              __typename
              ... on Issue { id databaseId title }
              ... on PullRequest { id databaseId title }
            }
          }
        }
      }
    }
  }
`

export const GET_PROJECT_ITEMS_FOR_REORDER = `
  query GetProjectItemsForReorder($projectId: ID!, $cursor: String) {
    node(id: $projectId) {
      ... on ProjectV2 {
        items(first: 100, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id
            databaseId
            content {
              __typename
              ... on Issue { id databaseId title }
              ... on PullRequest { id databaseId title }
            }
          }
        }
      }
    }
  }
`

export const UPDATE_PROJECT_ITEM_POSITION = `
  mutation UpdateProjectV2ItemPosition($input: UpdateProjectV2ItemPositionInput!) {
    updateProjectV2ItemPosition(input: $input) {
      clientMutationId
    }
  }
`

export const GET_REPO_ISSUE_TYPES = `
  query GetRepoIssueTypes($owner: String!, $name: String!, $cursor: String) {
    repository(owner: $owner, name: $name) {
      issueTypes(first: 20, after: $cursor) {
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          node {
            id
            name
            description
            isEnabled
            color
          }
        }
      }
    }
  }
`
