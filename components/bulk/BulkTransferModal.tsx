import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Box, Button, Heading, Spinner, Text, TextInput } from '@primer/react'
import { CheckIcon, LockIcon, SearchIcon, XIcon } from '../ui/primitives'
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
  const inputRef = useRef<HTMLInputElement>(null)

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

  // Explicit focus on mount — autoFocus is unreliable inside shadow DOM
  useEffect(() => { inputRef.current?.focus() }, [])

  // Client-side filter — no per-keystroke API calls
  const repos = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return allRepos
    return allRepos.filter(r => r.name.toLowerCase().includes(q) || r.nameWithOwner.toLowerCase().includes(q))
  }, [allRepos, query])

  return (
    <Box sx={{ position: 'fixed', inset: 0, bg: 'rgba(27,31,36,0.5)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Box sx={{ bg: 'canvas.overlay', border: '1px solid', borderColor: 'border.default', borderRadius: 2, width: '100%', maxWidth: 480, overflow: 'hidden' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 4, py: 3, borderBottom: '1px solid', borderColor: 'border.default' }}>
          <Heading as="h2" sx={{ fontSize: 3, fontWeight: 'bold', m: 0 }}>Transfer Issues</Heading>
          <Button variant="invisible" size="small" onClick={onClose} aria-label="Close" sx={{ p: '4px', minWidth: 'unset', color: 'fg.muted' }}>
            <XIcon size={16} />
          </Button>
        </Box>

        <Box sx={{ px: 4, py: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Text as="p" sx={{ m: 0, fontSize: 1, color: 'fg.default' }}>
            Transfer {count} issue{count !== 1 ? 's' : ''} to another repository.
          </Text>

          <TextInput
            ref={inputRef}
            placeholder="Search repos…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.stopPropagation()}
            onKeyUp={e => e.stopPropagation()}
            block
            leadingVisual={() => (
              <SearchIcon size={14} color="var(--fgColor-muted)" />
            )}
          />

          <Box
            sx={{
              border: '1px solid',
              borderColor: 'border.default',
              borderRadius: 2,
              maxHeight: 220,
              overflowY: 'auto',
            }}
          >
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                <Spinner size="small" />
              </Box>
            ) : error ? (
              <Box sx={{ px: 3, py: 2 }}>
                <Text sx={{ fontSize: 1, color: 'danger.fg' }}>{error}</Text>
              </Box>
            ) : repos.length === 0 ? (
              <Box sx={{ px: 3, py: 2 }}>
                <Text sx={{ fontSize: 1, color: 'fg.muted' }}>No repositories found.</Text>
              </Box>
            ) : (
              repos.map((repo, i) => {
                const isSelected = selected?.id === repo.id
                return (
                  <Box
                    key={repo.id}
                    as="button"
                    type="button"
                    onClick={() => setSelected(repo)}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      width: '100%',
                      px: 3,
                      py: '8px',
                      bg: isSelected ? 'accent.subtle' : 'transparent',
                      borderTop: i === 0 ? 'none' : '1px solid',
                      borderColor: 'border.default',
                      cursor: 'pointer',
                      textAlign: 'left',
                      '&:hover': { bg: isSelected ? 'accent.subtle' : 'canvas.subtle' },
                    }}
                  >
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Text sx={{ fontSize: 1, fontWeight: 'semibold', color: 'fg.default' }}>{repo.name}</Text>
                        {repo.isPrivate && <LockIcon size={12} color="var(--fgColor-muted)" />}
                      </Box>
                      <Text sx={{ fontSize: 0, color: 'fg.muted' }}>{repo.nameWithOwner}</Text>
                    </Box>
                    {isSelected && <CheckIcon size={14} color="var(--fgColor-accent, #0969da)" />}
                  </Box>
                )
              })
            )}
          </Box>
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
