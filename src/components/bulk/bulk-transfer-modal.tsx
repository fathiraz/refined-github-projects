import React, { useEffect, useMemo, useState } from 'react'
import { Autocomplete, Box, Button, Spinner, Text } from '@primer/react'
import { LockIcon, SearchIcon } from '../ui/primitives'
import { ModalStepHeader } from '../ui/modal-step-header'
import { sendMessage } from '../../lib/messages'

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

export function BulkTransferModal({ count, owner, firstItemId, projectId, onClose, onConfirm }: Props) {
  const [query, setQuery] = useState('')
  const [allRepos, setAllRepos] = useState<RepoItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<RepoItem | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Fetch all possible repos once on mount
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    sendMessage('searchTransferTargets', { owner, q: '', firstItemId, projectId })
      .then(items => { if (!cancelled) setAllRepos(items) })
      .catch(() => { if (!cancelled) setError('Could not load repositories. Check your GitHub token and try again.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [owner, firstItemId, projectId])

  // Client-side filter — no per-keystroke API calls
  const filteredRepos = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return allRepos
    return allRepos.filter(r => r.name.toLowerCase().includes(q) || r.nameWithOwner.toLowerCase().includes(q))
  }, [allRepos, query])

  // Map filtered repos to Autocomplete item format
  const repoItems = useMemo(() =>
    filteredRepos.map(repo => ({
      id: repo.id,
      text: repo.name,
      description: repo.nameWithOwner,
      ...(repo.isPrivate
        ? { leadingVisual: () => <LockIcon size={12} color="var(--fgColor-muted)" /> }
        : {}),
    })),
    [filteredRepos]
  )

  return (
    <Box sx={{ position: 'fixed', inset: 0, bg: 'rgba(27,31,36,0.5)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Box sx={{ bg: 'canvas.overlay', border: '1px solid', borderColor: 'border.default', borderRadius: 2, width: '100%', maxWidth: 480, overflow: 'hidden' }}>
        <ModalStepHeader title="Transfer Issues" onClose={onClose} />

        <Box sx={{ px: 4, py: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Text as="p" sx={{ m: 0, fontSize: 1, color: 'fg.default' }}>
            Transfer {count} issue{count !== 1 ? 's' : ''} to another repository.
          </Text>

          <Autocomplete>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Autocomplete.Input
                placeholder="Search repos…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                block
                leadingVisual={() => <SearchIcon size={14} color="var(--fgColor-muted)" />}
                onKeyDown={e => e.stopPropagation()}
                onKeyUp={e => e.stopPropagation()}
              />
              <Box sx={{ border: '1px solid', borderColor: 'border.default', borderRadius: 2, maxHeight: 220, overflowY: 'auto' }}>
                {loading ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                    <Spinner size="small" />
                  </Box>
                ) : error ? (
                  <Box sx={{ px: 3, py: 2 }}>
                    <Text sx={{ fontSize: 1, color: 'danger.fg' }}>{error}</Text>
                  </Box>
                ) : (
                  <Autocomplete.Menu
                    aria-labelledby="transfer-repo-label"
                    items={repoItems}
                    selectedItemIds={selected ? [selected.id] : []}
                    onSelectedChange={item => {
                      // Primer types onSelectedChange as Item | Item[] depending on selectionVariant
                      const first = Array.isArray(item) ? item[0] : item
                      const found = allRepos.find(r => r.id === String(first?.id)) ?? null
                      setSelected(found)
                    }}
                    selectionVariant="single"
                    filterFn={() => true}
                    emptyStateText="No repositories found."
                  />
                )}
              </Box>
            </Box>
          </Autocomplete>
        </Box>

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, px: 4, pb: 3 }}>
          <Button variant="default" onClick={onClose} sx={{ boxShadow: 'none' }}>Cancel</Button>
          <Button
            variant="primary"
            disabled={selected === null}
            onClick={() => {
              if (!selected) return
              const [repoOwner, repoName] = selected.nameWithOwner.split('/')
              onConfirm(repoOwner, repoName)
            }}
            sx={{ boxShadow: 'none' }}
          >
            Transfer Issue{count !== 1 ? 's' : ''} →
          </Button>
        </Box>
      </Box>
    </Box>
  )
}
