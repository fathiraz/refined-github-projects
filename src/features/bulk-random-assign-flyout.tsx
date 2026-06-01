// Anchored simple-mode flyout for Random Assign — replaces the legacy
// modal per §8 of the bulk-actions-flyouts change. Assignee multi-select is
// dominant; strategy lives behind a progressive-disclosure section that
// defaults to Balanced. Live per-assignee preview + Shuffle re-roll are
// rendered inline. Apply dispatches `bulkRandomAssign` via the existing BG
// handler (no protocol change).

import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActionList,
  Avatar,
  Box,
  Button,
  Checkbox,
  Radio,
  RadioGroup,
  Spinner,
  Text,
  TextInput,
} from '@primer/react'
import { ChevronDownIcon, ChevronUpIcon } from '@primer/octicons-react'
import { SearchIcon } from '@/ui/icons'
import { BulkFlyout } from '@/ui/bulk-flyout'
import { sendMessage } from '@/lib/messages'
import {
  distributeBalanced,
  distributeRandom,
  distributeRoundRobin,
  type DistributionStrategy,
} from '@/features/bulk-random-assign-utils'

export interface RandomAssignTarget {
  id: string
  name: string
  avatarUrl?: string
}

export interface BulkRandomAssignFlyoutProps {
  anchorRef: React.RefObject<HTMLElement | null>
  open: boolean
  onClose: () => void
  owner: string
  repoName: string
  itemIds: readonly string[]
  count: number
  /** Pinned recent assignee logins (most-recent-first, capped). */
  recentAssignees?: readonly RandomAssignTarget[]
  onConfirm: (assignments: Map<string, string[]>, strategy: DistributionStrategy) => void
}

type Distribution = Map<string, string[]>

const STRATEGY_OPTIONS: Array<{ value: DistributionStrategy; label: string; help: string }> = [
  { value: 'balanced', label: 'Balanced', help: 'Equal load across assignees.' },
  { value: 'random', label: 'Random', help: 'Pure random pick per item.' },
  { value: 'round-robin', label: 'Round-robin', help: 'Cycle through assignees in order.' },
]

function runStrategy(
  strategy: DistributionStrategy,
  items: readonly string[],
  assignees: readonly string[],
): Distribution {
  const fn =
    strategy === 'balanced'
      ? distributeBalanced
      : strategy === 'round-robin'
        ? distributeRoundRobin
        : distributeRandom
  return fn([...items], [...assignees])
}

export function BulkRandomAssignFlyout({
  anchorRef,
  open,
  onClose,
  owner,
  repoName,
  itemIds,
  count,
  recentAssignees,
  onConfirm,
}: BulkRandomAssignFlyoutProps) {
  const [query, setQuery] = useState('')
  const [candidates, setCandidates] = useState<RandomAssignTarget[]>([])
  const [cache, setCache] = useState<Map<string, RandomAssignTarget>>(new Map())
  const [picked, setPicked] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [strategy, setStrategy] = useState<DistributionStrategy>('balanced')
  const [preserveExisting, setPreserveExisting] = useState(false)
  const [showDistribution, setShowDistribution] = useState(false)
  const [shuffleNonce, setShuffleNonce] = useState(0)
  const latestReq = useRef(0)

  // Reset state on open
  useEffect(() => {
    if (!open) {
      setQuery('')
      setPicked([])
      setStrategy('balanced')
      setPreserveExisting(false)
      setShowDistribution(false)
      setShuffleNonce(0)
    }
  }, [open])

  // Search assignees
  useEffect(() => {
    if (!open || !repoName) return
    const requestId = Date.now()
    latestReq.current = requestId
    setLoading(true)
    const timer = setTimeout(
      () => {
        sendMessage('searchRepoMetadata', { owner, name: repoName, q: query, type: 'ASSIGNEES' })
          .then((results) => {
            if (requestId !== latestReq.current) return
            const mapped: RandomAssignTarget[] = results.map((r) => ({
              id: r.id,
              name: r.name,
              avatarUrl: r.avatarUrl,
            }))
            setCandidates(mapped)
            setCache((prev) => {
              const next = new Map(prev)
              for (const m of mapped) next.set(m.id, m)
              return next
            })
          })
          .catch(() => {})
          .finally(() => {
            if (requestId === latestReq.current) setLoading(false)
          })
      },
      query ? 300 : 0,
    )
    return () => clearTimeout(timer)
  }, [open, owner, repoName, query])

  // Seed cache with recents the first time the flyout opens.
  useEffect(() => {
    if (!recentAssignees || recentAssignees.length === 0) return
    setCache((prev) => {
      const next = new Map(prev)
      for (const r of recentAssignees) {
        if (!next.has(r.id)) next.set(r.id, r)
      }
      return next
    })
  }, [recentAssignees])

  const visible = useMemo(() => {
    const seen = new Set<string>()
    const out: RandomAssignTarget[] = []
    // Pinned recents first when query is empty.
    if (!query && recentAssignees) {
      for (const r of recentAssignees) {
        if (!seen.has(r.id)) {
          seen.add(r.id)
          out.push(r)
        }
      }
    }
    // Selected entries always visible.
    for (const id of picked) {
      if (!seen.has(id)) {
        const cached = cache.get(id)
        if (cached) {
          seen.add(id)
          out.push(cached)
        }
      }
    }
    for (const c of candidates) {
      if (!seen.has(c.id)) {
        seen.add(c.id)
        out.push(c)
      }
    }
    return out
  }, [candidates, picked, recentAssignees, cache, query])

  const preview = useMemo<Distribution>(() => {
    if (picked.length === 0 || itemIds.length === 0) return new Map()
    // shuffleNonce is the dependency on Shuffle clicks — random/balanced re-roll.
    void shuffleNonce
    return runStrategy(strategy, itemIds, picked)
  }, [strategy, picked, itemIds, shuffleNonce])

  function toggle(id: string) {
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function handleApply() {
    if (picked.length === 0) return
    onConfirm(preview, strategy)
    onClose()
  }

  const applyDisabled = picked.length === 0
  const idToTarget = (id: string) => cache.get(id)

  return (
    <BulkFlyout
      mode="simple"
      anchorRef={anchorRef as React.RefObject<HTMLElement>}
      open={open}
      onClose={onClose}
      title={`Random Assign — ${count} item${count !== 1 ? 's' : ''}`}
      ariaLabel="Random Assign"
      width={380}
      maxHeight={520}
      footer="apply-cancel"
      applyLabel={`Assign ${picked.length || ''} ${picked.length === 1 ? 'person' : 'people'}`.trim()}
      applyDisabled={applyDisabled}
      onApply={handleApply}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <TextInput
          leadingVisual={SearchIcon}
          value={query}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
          placeholder="Filter assignees…"
          aria-label="Filter assignees"
          sx={{ width: '100%' }}
        />

        <Box
          sx={{
            border: '1px solid',
            borderColor: 'border.default',
            borderRadius: 1,
            maxHeight: 180,
            overflowY: 'auto',
          }}
          data-testid="rgp-random-assign-list"
        >
          {loading && visible.length === 0 && (
            <Box sx={{ p: 2, display: 'flex', justifyContent: 'center' }}>
              <Spinner size="small" />
            </Box>
          )}
          {!loading && visible.length === 0 && (
            <Box sx={{ p: 2, textAlign: 'center', color: 'fg.muted', fontSize: 0 }}>
              {query ? `No matches for "${query}"` : 'No assignees available'}
            </Box>
          )}
          {visible.map((target, idx) => {
            const checked = picked.includes(target.id)
            const isRecent = !query && recentAssignees?.some((r) => r.id === target.id) === true
            return (
              <Box
                key={target.id}
                onClick={() => toggle(target.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e: React.KeyboardEvent) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    toggle(target.id)
                  }
                }}
                sx={{
                  p: 2,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  borderTop: idx > 0 ? '1px solid' : 'none',
                  borderColor: 'border.muted',
                  cursor: 'pointer',
                  ':hover': { bg: 'canvas.subtle' },
                }}
                data-testid={`rgp-random-assign-row-${target.id}`}
              >
                <Checkbox
                  checked={checked}
                  onChange={() => toggle(target.id)}
                  onClick={(e: React.MouseEvent) => e.stopPropagation()}
                  aria-label={`Toggle ${target.name}`}
                />
                {target.avatarUrl ? (
                  <Avatar src={target.avatarUrl} size={20} />
                ) : (
                  <Box
                    sx={{
                      width: 20,
                      height: 20,
                      borderRadius: '50%',
                      bg: 'canvas.subtle',
                      border: '1px solid',
                      borderColor: 'border.default',
                      flexShrink: 0,
                    }}
                  />
                )}
                <Text sx={{ fontSize: 1, flex: 1, minWidth: 0 }}>{target.name}</Text>
                {isRecent && (
                  <Text sx={{ fontSize: 0, color: 'fg.muted', flexShrink: 0 }}>Recent</Text>
                )}
              </Box>
            )
          })}
        </Box>

        <Box
          as="label"
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 2,
            fontSize: 1,
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          <Checkbox
            checked={preserveExisting}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setPreserveExisting(e.target.checked)
            }
            aria-label="Preserve existing assignees"
            data-testid="rgp-random-assign-preserve"
          />
          <Text>Preserve existing assignees</Text>
        </Box>

        {picked.length > 0 && (
          <Box
            sx={{
              border: '1px solid',
              borderColor: 'border.default',
              borderRadius: 1,
              p: 2,
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
            }}
            data-testid="rgp-random-assign-preview"
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text sx={{ fontSize: 0, fontWeight: 'semibold', color: 'fg.muted' }}>Preview</Text>
              <Button
                variant="invisible"
                size="small"
                onClick={() => setShuffleNonce((n) => n + 1)}
                disabled={strategy === 'round-robin'}
                sx={{ boxShadow: 'none', fontSize: 0 }}
                data-testid="rgp-random-assign-shuffle"
              >
                Shuffle
              </Button>
            </Box>
            {Array.from(preview.entries()).map(([id, items]) => {
              const target = idToTarget(id)
              return (
                <Box key={id} sx={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 0 }}>
                  {target?.avatarUrl ? (
                    <Avatar src={target.avatarUrl} size={16} />
                  ) : (
                    <Box
                      sx={{
                        width: 16,
                        height: 16,
                        borderRadius: '50%',
                        bg: 'canvas.subtle',
                        border: '1px solid',
                        borderColor: 'border.default',
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <Text sx={{ flex: 1, minWidth: 0 }}>@{target?.name ?? id}</Text>
                  <Text sx={{ color: 'fg.muted', flexShrink: 0 }}>
                    {items.length} {items.length === 1 ? 'item' : 'items'}
                  </Text>
                </Box>
              )
            })}
          </Box>
        )}

        <Box>
          <Button
            variant="invisible"
            size="small"
            onClick={() => setShowDistribution((v) => !v)}
            aria-expanded={showDistribution}
            sx={{ boxShadow: 'none', fontSize: 0, color: 'fg.muted', px: 0 }}
            data-testid="rgp-random-assign-disclose"
          >
            <Box as="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
              {showDistribution ? <ChevronUpIcon size={12} /> : <ChevronDownIcon size={12} />}
              Distribution: {STRATEGY_OPTIONS.find((o) => o.value === strategy)?.label}
            </Box>
          </Button>
          {showDistribution && (
            <Box sx={{ pl: 2, mt: 1 }} data-testid="rgp-random-assign-strategy">
              <RadioGroup
                name="rgp-strategy"
                onChange={(value) => {
                  if (value) setStrategy(value as DistributionStrategy)
                }}
                sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}
              >
                {STRATEGY_OPTIONS.map((opt) => (
                  <Box key={opt.value} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Radio
                      value={opt.value}
                      checked={strategy === opt.value}
                      onChange={() => setStrategy(opt.value)}
                    />
                    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                      <Text sx={{ fontSize: 1 }}>{opt.label}</Text>
                      <Text sx={{ fontSize: 0, color: 'fg.muted' }}>{opt.help}</Text>
                    </Box>
                  </Box>
                ))}
              </RadioGroup>
            </Box>
          )}
        </Box>
      </Box>
    </BulkFlyout>
  )
}

/** Suppress unused-import warning under ESLint while keeping consistent API for future use. */
void ActionList
