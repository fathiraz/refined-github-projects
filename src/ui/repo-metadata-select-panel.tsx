import React, { useCallback } from 'react'
import { Avatar, Box } from '@primer/react'
import { sendMessage } from '@/lib/messages'
import { PersonIcon, ShieldIcon } from '@/ui/icons'
import { SearchSelectPanel, type SearchSelectPanelOption } from '@/ui/search-select-panel'

type RepoMetadataType = 'ASSIGNEES' | 'LABELS' | 'ISSUE_TYPES'

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
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 16,
          height: 16,
          color: 'fg.muted',
        }}
      >
        <PersonIcon size={14} color="currentColor" />
      </Box>
    )
  }

  if (type === 'ISSUE_TYPES') {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 16,
          height: 16,
          color: item.color || 'fg.muted',
        }}
      >
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

interface MetadataCopy {
  title: string
  hint: string
  filterPlaceholder: string
  errorTitle: string
  emptyTitle: string
  /** Shown only when the filter box is empty; a non-empty filter always says "Try a different search." */
  emptyBody: string
}

/**
 * One row per metadata type. This replaced five parallel `switch (type)`
 * functions whose only job was to pick a string — the copy for a type now
 * reads top-to-bottom instead of being scattered across five branches.
 */
const METADATA_COPY: Record<RepoMetadataType, MetadataCopy> = {
  ASSIGNEES: {
    title: 'Select assignees',
    hint: 'Pick assignees from the repository collaborators you can assign.',
    filterPlaceholder: 'Find a user',
    errorTitle: 'Could not load assignees',
    emptyTitle: 'No assignees found',
    emptyBody: 'No users match your search.',
  },
  LABELS: {
    title: 'Select labels',
    hint: 'Use labels to organize issues and pull requests.',
    filterPlaceholder: 'Find a label',
    errorTitle: 'Could not load labels',
    emptyTitle: 'No labels found',
    emptyBody: 'This repository has no labels yet.',
  },
  ISSUE_TYPES: {
    title: 'Select issue type',
    hint: 'Pick the GitHub issue type to apply to selected items.',
    filterPlaceholder: 'Find an issue type',
    errorTitle: 'Could not load issue types',
    emptyTitle: 'No issue types found',
    emptyBody: 'This repository has no issue types available.',
  },
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
  const copy = METADATA_COPY[type]

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
    title: copy.title,
    subtitle: copy.hint,
    placeholderText: copy.filterPlaceholder,
    inputLabel: copy.filterPlaceholder,
    disabled: disabled || !repoName,
    width: 'large' as const,
    searchErrorMessage: 'Could not load results. Check your token and try again.',
    errorTitle: copy.errorTitle,
    selectedPlacement: 'selected-first' as const,
    anchorAriaLabel: copy.title,
    emptyState: ({ filterQuery }: { filterQuery: string }) => ({
      title: copy.emptyTitle,
      body: filterQuery.trim() ? 'Try a different search.' : copy.emptyBody,
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
