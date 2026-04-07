import React, { useCallback } from 'react'
import { Box } from '@primer/react'
import { sendMessage, type IssueSearchResultData } from '../../lib/messages'
import { HashIcon, IssueClosedIcon, IssueReopenedIcon } from './primitives'
import { SearchSelectPanel, type SearchSelectPanelOption } from './search-select-panel'

export type IssueRelationshipItem = IssueSearchResultData

interface IssueRelationshipSelectPanelProps {
  owner?: string
  repoName?: string
  value: IssueRelationshipItem[]
  onChange: (val: IssueRelationshipItem[]) => void
  placeholder?: string
  disabled?: boolean
  singleSelect?: boolean
  title?: string
  subtitle?: string
  placeholderText?: string
  inputLabel?: string
  anchorAriaLabel?: string
}

function formatIssueReference(issue: IssueRelationshipItem): string {
  return `${issue.repoOwner}/${issue.repoName}#${issue.number}`
}

function leadingVisual(issue: IssueRelationshipItem): React.ReactNode {
  if (issue.state === 'CLOSED') {
    return <IssueClosedIcon size={14} color="currentColor" />
  }

  if (issue.state === 'OPEN') {
    return <IssueReopenedIcon size={14} color="currentColor" />
  }

  return <HashIcon size={14} color="currentColor" />
}

export function IssueRelationshipSelectPanel({
  owner,
  repoName,
  value,
  onChange,
  placeholder = 'Search issues',
  disabled = false,
  singleSelect = false,
  title = 'Select issues',
  subtitle,
  placeholderText = 'Search issues',
  inputLabel = placeholderText,
  anchorAriaLabel = title,
}: IssueRelationshipSelectPanelProps) {
  const defaultSubtitle =
    owner && repoName
      ? `Recent open issues from ${owner}/${repoName} appear first. Type a title, \`#123\`, or \`owner/repo#123\` to search more.`
      : 'Type a title, `#123`, or `owner/repo#123` to search across repositories you can access.'

  const searchIssues = useCallback(
    (q: string) => sendMessage('searchRelationshipIssues', { q, owner, repoName }),
    [owner, repoName],
  )

  const mapItem = useCallback(
    (item: IssueRelationshipItem): SearchSelectPanelOption<IssueRelationshipItem> => ({
      id: item.databaseId
        ? `db:${item.databaseId}`
        : `${item.repoOwner}/${item.repoName}#${item.number}`,
      item,
      selectionText: formatIssueReference(item),
      panelItem: {
        id: item.databaseId
          ? `db:${item.databaseId}`
          : `${item.repoOwner}/${item.repoName}#${item.number}`,
        text: item.title,
        description: `${formatIssueReference(item)}${item.state ? ` · ${item.state.toLowerCase()}` : ''}`,
        descriptionVariant: 'block',
        leadingVisual: () => (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 16,
              height: 16,
              color: item.state === 'CLOSED' ? 'danger.fg' : 'accent.fg',
            }}
          >
            {leadingVisual(item)}
          </Box>
        ),
      },
    }),
    [],
  )

  const commonProps = {
    search: searchIssues,
    mapItem,
    placeholder,
    title,
    subtitle: subtitle ?? defaultSubtitle,
    placeholderText,
    inputLabel,
    disabled,
    width: 'large' as const,
    searchErrorMessage: 'Could not load issues. Check your token and try again.',
    errorTitle: 'Could not load issues',
    selectedPlacement: 'selected-first' as const,
    anchorAriaLabel,
    emptyState: ({ filterQuery }: { filterQuery: string }) => ({
      title: filterQuery.trim() ? 'No issues found' : 'Search for issues',
      body: filterQuery.trim()
        ? 'Try a different title or issue reference.'
        : owner && repoName
          ? `Showing 5 recent open issues from ${owner}/${repoName}. Type to search more.`
          : 'Type a title, `#123`, or `owner/repo#123`.',
      variant: 'empty' as const,
    }),
  }

  if (singleSelect) {
    return (
      <SearchSelectPanel
        {...commonProps}
        selected={value[0]}
        onSelectedChange={(selected) => onChange(selected ? [selected] : [])}
      />
    )
  }

  return <SearchSelectPanel {...commonProps} selected={value} onSelectedChange={onChange} />
}
