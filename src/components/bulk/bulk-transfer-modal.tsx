import React, { useCallback, useEffect, useMemo, useState } from 'react'
import Tippy from '../ui/tooltip'
import { Box, Button, FormControl, Text } from '@primer/react'
import { SearchSelectPanel, type SearchSelectPanelOption } from '../ui/search-select-panel'
import { LockIcon, MoveIcon } from '../ui/primitives'
import { Z_MODAL, Z_TOOLTIP } from '../../lib/z-index'
import { ModalStepHeader } from '../ui/modal-step-header'
import { sendMessage } from '../../lib/messages'
import { ensureTippyCss } from '../../lib/tippy-utils'

interface RepoItem {
  id: string
  name: string
  nameWithOwner: string
  isPrivate: boolean
  description: string | null
}

interface Props {
  count: number
  owner: string
  firstItemId?: string
  projectId?: string
  onClose: () => void
  onConfirm: (targetRepoOwner: string, targetRepoName: string) => void
}

const interactiveButtonSx = {
  boxShadow: 'none',
  transition: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
  '&:hover:not(:disabled)': { transform: 'translateY(-1px)' },
  '&:active': { transform: 'translateY(0)', transition: '100ms' },
  '@media (prefers-reduced-motion: reduce)': {
    transition: 'none',
    '&:hover:not(:disabled)': { transform: 'none' },
  },
} as const

export function BulkTransferModal({ count, owner, firstItemId, projectId, onClose, onConfirm }: Props) {
  useEffect(() => {
    ensureTippyCss()
    console.log('[TransferModal] mounted', { owner, firstItemId, projectId, count })

    return () => {
      console.log('[TransferModal] unmounted')
    }
  }, [])

  const [selected, setSelected] = useState<RepoItem | undefined>(undefined)

  const searchRepos = useCallback(
    async (query: string) => {
      console.log('[TransferModal] searchRepos:request', { query, owner, firstItemId, projectId })

      try {
        const items = await sendMessage('searchTransferTargets', { owner, q: query, firstItemId, projectId })
        console.log('[TransferModal] searchRepos:result', {
          query,
          resultCount: items.length,
          sample: items.slice(0, 5).map(item => item.nameWithOwner),
        })
        return items
      } catch (error) {
        console.error('[TransferModal] searchRepos:error', { query, error })
        throw error
      }
    },
    [firstItemId, owner, projectId],
  )

  const handleSelectedChange = useCallback((repo: RepoItem | undefined) => {
    console.log('[TransferModal] onSelectedChange', repo
      ? { id: repo.id, nameWithOwner: repo.nameWithOwner }
      : { cleared: true })
    setSelected(repo)
  }, [])

  const mapRepoItem = useCallback(
    (repo: RepoItem): SearchSelectPanelOption<RepoItem> => ({
      id: repo.id,
      item: repo,
      selectionText: repo.nameWithOwner,
      panelItem: {
        id: repo.id,
        text: repo.name,
        description: repo.nameWithOwner,
        descriptionVariant: 'block',
        leadingVisual: repo.isPrivate
          ? () => <LockIcon size={12} color="var(--fgColor-muted)" />
          : () => <Box as="span" sx={{ display: 'block', width: 12, height: 12 }} />,
      },
    }),
    [],
  )

  const selectedTarget = useMemo(() => {
    if (!selected) return null
    const [targetRepoOwner, targetRepoName] = selected.nameWithOwner.split('/')
    if (!targetRepoOwner || !targetRepoName) return null
    return { targetRepoOwner, targetRepoName }
  }, [selected])

  return (
    <Box
      sx={{ position: 'fixed', inset: 0, bg: 'rgba(27,31,36,0.5)', zIndex: Z_MODAL, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onKeyDown={(e: React.KeyboardEvent) => e.stopPropagation()}
      onKeyUp={(e: React.KeyboardEvent) => e.stopPropagation()}
    >
      <Box sx={{ bg: 'canvas.overlay', border: '1px solid', borderColor: 'border.default', borderRadius: 2, width: '100%', maxWidth: 480, overflow: 'hidden', boxShadow: 'none' }}>
        <ModalStepHeader title="Transfer Issues" icon={<MoveIcon size={16} />} onClose={onClose} />

        <Box sx={{ px: 4, py: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Text as="p" sx={{ m: 0, fontSize: 1, color: 'fg.default' }}>
            Transfer {count} issue{count !== 1 ? 's' : ''} to another repository.
          </Text>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, width: '100%' }}>
            <FormControl>
              <FormControl.Label id="transfer-repo-label">
                <Tippy content="Pick the destination repository. Top repositories load first; type to search all repos you can access." delay={[400, 0]} placement="top" zIndex={Z_TOOLTIP}>
                  <Box as="span" sx={{ cursor: 'help', width: 'fit-content' }}>Repository</Box>
                </Tippy>
              </FormControl.Label>
              <SearchSelectPanel
                search={searchRepos}
                mapItem={mapRepoItem}
                selected={selected}
                onSelectedChange={handleSelectedChange}
                placeholder="Select a repository"
                title="Select a repository"
                subtitle="Top repositories load first. Type to search all repositories you can access."
                placeholderText="Search repositories"
                inputLabel="Search repositories"
                width="large"
                searchErrorMessage="Could not load repositories. Check your token and try again."
                errorTitle="Could not load repositories"
                selectedPlacement="selected-first-when-filter-empty"
                anchorAriaLabel="Select a repository"
                debugName="TransferSelectPanel"
                emptyState={({ filterQuery }) => ({
                  title: 'No repositories found',
                  body: filterQuery.trim()
                    ? 'Try a different keyword.'
                    : 'No repositories are available for transfer.',
                  variant: 'empty',
                })}
              />
            </FormControl>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, px: 4, pb: 3 }}>
          <Button variant="default" onClick={onClose} sx={interactiveButtonSx}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={selectedTarget === null}
            onClick={() => {
              if (!selectedTarget) return
              console.log('[TransferModal] confirm', {
                targetRepoOwner: selectedTarget.targetRepoOwner,
                targetRepoName: selectedTarget.targetRepoName,
              })
              onConfirm(selectedTarget.targetRepoOwner, selectedTarget.targetRepoName)
            }}
            sx={interactiveButtonSx}
          >
            Transfer Issue{count !== 1 ? 's' : ''} →
          </Button>
        </Box>
      </Box>
    </Box>
  )
}
