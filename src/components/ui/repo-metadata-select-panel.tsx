import React, { useCallback } from 'react'
import { Avatar, Box } from '@primer/react'
import { sendMessage } from '../../lib/messages'
import { PersonIcon } from './primitives'
import { SearchSelectPanel, type SearchSelectPanelOption } from './search-select-panel'

export type RepoMetadataItem = {
  id: string
  name: string
  color?: string
  avatarUrl?: string
  description?: string
}

function metadataToLeadingVisual(item: RepoMetadataItem, type: 'ASSIGNEES' | 'LABELS'): React.ReactNode {
  if (type === 'ASSIGNEES') {
    return item.avatarUrl ? (
      <Avatar src={item.avatarUrl} alt="" size={16} square={false} />
    ) : (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16 }}>
        <PersonIcon size={14} color="var(--fgColor-muted)" />
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
        bg: item.color ? undefined : 'border.default',
      }}
      style={item.color ? { backgroundColor: item.color } : undefined}
    />
  )
}

function getPanelTitle(type: 'ASSIGNEES' | 'LABELS'): string {
  return type === 'LABELS' ? 'Select labels' : 'Select assignees'
}

function getPanelHint(type: 'ASSIGNEES' | 'LABELS'): string {
  return type === 'LABELS'
    ? 'Use labels to organize issues and pull requests.'
    : 'Pick assignees from the repository collaborators you can assign.'
}

function getFilterPlaceholder(type: 'ASSIGNEES' | 'LABELS'): string {
  return type === 'LABELS' ? 'Find a label' : 'Find a user'
}

export function RepoMetadataSelectPanel({
  type,
  owner,
  repoName,
  value = [],
  onChange,
  placeholder = 'Select…',
  disabled = false,
}: {
  type: 'ASSIGNEES' | 'LABELS'
  owner: string
  repoName: string
  value: RepoMetadataItem[]
  onChange: (val: RepoMetadataItem[]) => void
  placeholder?: string
  disabled?: boolean
}) {
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

  return (
    <SearchSelectPanel
      search={searchMetadata}
      mapItem={mapItem}
      selected={value}
      onSelectedChange={onChange}
      placeholder={placeholder}
      title={panelTitle}
      subtitle={getPanelHint(type)}
      placeholderText={filterPlaceholder}
      inputLabel={filterPlaceholder}
      disabled={disabled || !repoName}
      width="large"
      searchErrorMessage="Could not load results. Check your token and try again."
      errorTitle={type === 'LABELS' ? 'Could not load labels' : 'Could not load assignees'}
      selectedPlacement="selected-first"
      anchorAriaLabel={panelTitle}
      emptyState={({ filterQuery }) => ({
        title: type === 'LABELS' ? 'No labels found' : 'No assignees found',
        body: filterQuery.trim()
          ? 'Try a different search.'
          : type === 'LABELS'
            ? 'This repository has no labels yet.'
            : 'No users match your search.',
        variant: 'empty',
      })}
    />
  )
}
