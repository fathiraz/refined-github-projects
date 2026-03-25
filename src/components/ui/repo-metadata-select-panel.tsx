import React, { useCallback } from 'react'
import { Avatar, Box } from '@primer/react'
import { sendMessage } from '../../lib/messages'
import { PersonIcon, ShieldIcon } from './primitives'
import { SearchSelectPanel, type SearchSelectPanelOption } from './search-select-panel'

export type RepoMetadataType = 'ASSIGNEES' | 'LABELS' | 'ISSUE_TYPES'

export type RepoMetadataItem = {
  id: string
  name: string
  color?: string
  avatarUrl?: string
  description?: string
}

interface RepoMetadataSelectPanelProps {
  type: RepoMetadataType
  owner: string
  repoName: string
  value: RepoMetadataItem[]
  onChange: (val: RepoMetadataItem[]) => void
  placeholder?: string
  disabled?: boolean
  singleSelect?: boolean
}

function metadataToLeadingVisual(item: RepoMetadataItem, type: RepoMetadataType): React.ReactNode {
  if (type === 'ASSIGNEES') {
    return item.avatarUrl ? (
      <Avatar src={item.avatarUrl} alt="" size={16} square={false} />
    ) : (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, color: 'fg.muted' }}>
        <PersonIcon size={14} color="currentColor" />
      </Box>
    )
  }

  if (type === 'ISSUE_TYPES') {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, color: item.color || 'fg.muted' }}>
        <ShieldIcon size={14} color="currentColor" />
      </Box>
    )
  }

  return (
    <Box
      sx={{
        width: 16,
        height: 16,
        borderRadius: '50%',
        flexShrink: 0,
        border: '1px solid',
        borderColor: 'border.default',
        bg: item.color || 'border.default',
      }}
    />
  )
}

function getPanelTitle(type: RepoMetadataType): string {
  switch (type) {
    case 'LABELS':
      return 'Select labels'
    case 'ISSUE_TYPES':
      return 'Select issue type'
    default:
      return 'Select assignees'
  }
}

function getPanelHint(type: RepoMetadataType): string {
  switch (type) {
    case 'LABELS':
      return 'Use labels to organize issues and pull requests.'
    case 'ISSUE_TYPES':
      return 'Pick the GitHub issue type to apply to selected items.'
    default:
      return 'Pick assignees from the repository collaborators you can assign.'
  }
}

function getFilterPlaceholder(type: RepoMetadataType): string {
  switch (type) {
    case 'LABELS':
      return 'Find a label'
    case 'ISSUE_TYPES':
      return 'Find an issue type'
    default:
      return 'Find a user'
  }
}

function getErrorTitle(type: RepoMetadataType): string {
  switch (type) {
    case 'LABELS':
      return 'Could not load labels'
    case 'ISSUE_TYPES':
      return 'Could not load issue types'
    default:
      return 'Could not load assignees'
  }
}

function getEmptyState(type: RepoMetadataType, filterQuery: string) {
  if (type === 'LABELS') {
    return {
      title: 'No labels found',
      body: filterQuery.trim() ? 'Try a different search.' : 'This repository has no labels yet.',
      variant: 'empty' as const,
    }
  }

  if (type === 'ISSUE_TYPES') {
    return {
      title: 'No issue types found',
      body: filterQuery.trim() ? 'Try a different search.' : 'This repository has no issue types available.',
      variant: 'empty' as const,
    }
  }

  return {
    title: 'No assignees found',
    body: filterQuery.trim() ? 'Try a different search.' : 'No users match your search.',
    variant: 'empty' as const,
  }
}

export function RepoMetadataSelectPanel({
  type,
  owner,
  repoName,
  value = [],
  onChange,
  placeholder = 'Select…',
  disabled = false,
  singleSelect = false,
}: RepoMetadataSelectPanelProps) {
  const panelTitle = getPanelTitle(type)
  const filterPlaceholder = getFilterPlaceholder(type)

  const searchMetadata = useCallback(
    (query: string) => {
      if (!repoName) return Promise.resolve([] as RepoMetadataItem[])
      return sendMessage('searchRepoMetadata', { owner, name: repoName, q: query, type })
    },
    [owner, repoName, type],
  )

  const mapItem = useCallback(
    (item: RepoMetadataItem): SearchSelectPanelOption<RepoMetadataItem> => ({
      id: item.id,
      item,
      selectionText: item.name,
      panelItem: {
        id: item.id,
        text: item.name,
        description: item.description,
        descriptionVariant: item.description ? 'block' : undefined,
        leadingVisual: () => metadataToLeadingVisual(item, type),
      },
    }),
    [type],
  )

  const commonProps = {
    search: searchMetadata,
    mapItem,
    placeholder,
    title: panelTitle,
    subtitle: getPanelHint(type),
    placeholderText: filterPlaceholder,
    inputLabel: filterPlaceholder,
    disabled: disabled || !repoName,
    width: 'large' as const,
    searchErrorMessage: 'Could not load results. Check your token and try again.',
    errorTitle: getErrorTitle(type),
    selectedPlacement: 'selected-first' as const,
    anchorAriaLabel: panelTitle,
    emptyState: ({ filterQuery }: { filterQuery: string }) => getEmptyState(type, filterQuery),
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

  return (
    <SearchSelectPanel
      {...commonProps}
      selected={value}
      onSelectedChange={onChange}
    />
  )
}
