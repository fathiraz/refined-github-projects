import React, { useCallback, useEffect, useMemo, useState } from 'react'
import Tippy from '@/ui/tooltip'
import { Box, Button, Checkbox, Flash, FormControl, Text } from '@primer/react'
import { SearchSelectPanel, type SearchSelectPanelOption } from '@/ui/search-select-panel'
import { LockIcon, MoveIcon } from '@/ui/icons'
import { Z_MODAL, Z_TOOLTIP } from '@/lib/z-index'
import { ModalStepHeader } from '@/ui/modal-step-header'
import { sendMessage } from '@/lib/messages'
import { ensureTippyCss } from '@/lib/tippy-utils'

interface RepoItem {
  id: string
  name: string
  nameWithOwner: string
  isPrivate: boolean
  description: string | null
  eligibility?: 'ok' | 'archived' | 'issues-disabled'
}

interface Props {
  count: number
  owner: string
  firstItemId?: string
  /** §10.7 — all selected DOM ids; required for per-source-item pre-flight. */
  itemIds?: readonly string[]
  projectId?: string
  onClose: () => void
  /**
   * §10.7/§10.8 — when pre-flight finds ineligible items, the bar should
   * dispatch the bulkTransfer only against the eligible subset; the optional
   * third arg carries those DOM ids. Omitted means "use the current selection".
   */
  onConfirm: (
    targetRepoOwner: string,
    targetRepoName: string,
    eligibleItemIds?: readonly string[],
  ) => void
}

interface EligibilityRow {
  domId: string
  eligible: boolean
  reason?: 'pull-request' | 'same-repo' | 'unresolved'
  title?: string
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

// §10.5 — session-scoped recent transfer destinations (most-recent first, cap 5).
const RECENT_TRANSFER_DESTINATIONS_CAP = 5
const recentTransferDestinations: RepoItem[] = []

export function rememberTransferDestination(repo: RepoItem): void {
  const existingIndex = recentTransferDestinations.findIndex((r) => r.id === repo.id)
  if (existingIndex >= 0) recentTransferDestinations.splice(existingIndex, 1)
  recentTransferDestinations.unshift(repo)
  while (recentTransferDestinations.length > RECENT_TRANSFER_DESTINATIONS_CAP) {
    recentTransferDestinations.pop()
  }
}

export function getRecentTransferDestinations(): readonly RepoItem[] {
  return recentTransferDestinations
}

/** Static consequence list per §10.6 — applies to every GitHub transfer. */
const TRANSFER_CONSEQUENCES: readonly string[] = [
  'Labels lost — labels not present in the destination are dropped',
  'Project link dropped — the issue leaves this project',
  'New issue number assigned',
  'Comments preserved',
  'Assignees preserved if they are members of the target',
]

function describeEligibilityReason(reason: EligibilityRow['reason']): string {
  switch (reason) {
    case 'pull-request':
      return 'Pull request (GitHub only transfers issues)'
    case 'same-repo':
      return 'Already in the destination repository'
    case 'unresolved':
      return 'Could not resolve item details'
    default:
      return 'Ineligible'
  }
}

export function BulkTransferModal({
  count,
  owner,
  firstItemId,
  itemIds,
  projectId,
  onClose,
  onConfirm,
}: Props) {
  useEffect(() => {
    ensureTippyCss()
  }, [])

  const [selected, setSelected] = useState<RepoItem | undefined>(undefined)
  // §10.4 — default to owner-scoped per spec.
  const [scope, setScope] = useState<'owner-only' | 'all'>('owner-only')
  // §10.7 — eligibility map keyed by destination "owner/name". Cached so
  // toggling away and back to the same repo doesn't re-fire the BG call.
  const [eligibilityByTarget, setEligibilityByTarget] = useState<
    Record<string, readonly EligibilityRow[]>
  >({})
  const [eligibilityLoading, setEligibilityLoading] = useState(false)
  const [showIneligibleExpander, setShowIneligibleExpander] = useState(false)

  const searchRepos = useCallback(
    async (query: string) => {
      const items = await sendMessage('searchTransferTargets', {
        owner,
        q: query,
        firstItemId,
        projectId,
        scope,
        includeIneligible: true,
      })

      // §10.5 — when query is empty, fold recent transfer destinations to the
      // top so the user can re-pick frequently used targets without typing.
      if (query.trim() === '' && recentTransferDestinations.length > 0) {
        const seen = new Set<string>()
        const out: RepoItem[] = []
        for (const recent of recentTransferDestinations) {
          if (!seen.has(recent.id)) {
            out.push(recent)
            seen.add(recent.id)
          }
        }
        for (const item of items) {
          if (!seen.has(item.id)) {
            out.push(item)
            seen.add(item.id)
          }
        }
        return out
      }

      return items
    },
    [firstItemId, owner, projectId, scope],
  )

  const handleSelectedChange = useCallback((repo: RepoItem | undefined) => {
    // §10.3 — block selection of ineligible repos at the modal layer.
    if (repo && repo.eligibility && repo.eligibility !== 'ok') return
    setSelected(repo)
  }, [])

  const mapRepoItem = useCallback((repo: RepoItem): SearchSelectPanelOption<RepoItem> => {
    const isRecent = recentTransferDestinations.some((r) => r.id === repo.id)
    const eligibility = repo.eligibility ?? 'ok'
    const eligibilityLabel =
      eligibility === 'archived'
        ? '✗ archived'
        : eligibility === 'issues-disabled'
          ? '✗ issues disabled'
          : null
    const descriptionParts: string[] = [repo.nameWithOwner]
    if (isRecent) descriptionParts.push('Recent')
    if (eligibilityLabel) descriptionParts.push(eligibilityLabel)
    return {
      id: repo.id,
      item: repo,
      selectionText: repo.nameWithOwner,
      panelItem: {
        id: repo.id,
        text: repo.name,
        description: descriptionParts.join(' · '),
        descriptionVariant: 'block',
        disabled: eligibility !== 'ok',
        leadingVisual: repo.isPrivate
          ? () => <LockIcon size={12} color="var(--fgColor-muted)" />
          : () => <Box as="span" sx={{ display: 'block', width: 12, height: 12 }} />,
      },
    }
  }, [])

  const selectedTarget = useMemo(() => {
    if (!selected) return null
    const [targetRepoOwner, targetRepoName] = selected.nameWithOwner.split('/')
    if (!targetRepoOwner || !targetRepoName) return null
    return { targetRepoOwner, targetRepoName }
  }, [selected])

  // §10.7 — kick off pre-flight whenever the selected target changes. Result
  // is cached per "owner/name" key so toggling between recents doesn't re-fire.
  const targetKey = selectedTarget
    ? `${selectedTarget.targetRepoOwner}/${selectedTarget.targetRepoName}`.toLowerCase()
    : null
  useEffect(() => {
    setShowIneligibleExpander(false)
    if (!selectedTarget || !targetKey || !projectId || !itemIds || itemIds.length === 0) return
    if (eligibilityByTarget[targetKey]) return
    let cancelled = false
    setEligibilityLoading(true)
    sendMessage('validateTransferEligibility', {
      itemIds: [...itemIds],
      projectId,
      targetRepoOwner: selectedTarget.targetRepoOwner,
      targetRepoName: selectedTarget.targetRepoName,
    })
      .then((rows) => {
        if (cancelled) return
        setEligibilityByTarget((prev) => ({ ...prev, [targetKey]: rows }))
      })
      .catch((cause) => {
        // pre-flight is advisory — if it fails, fall back to letting BG return
        // per-item failures during the actual transfer. Don't block the user.
        console.warn('[rgp] validateTransferEligibility failed', cause)
      })
      .finally(() => {
        if (!cancelled) setEligibilityLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedTarget, targetKey, projectId, itemIds, eligibilityByTarget])

  const eligibilityRows = targetKey ? eligibilityByTarget[targetKey] : undefined
  const ineligibleRows = useMemo(
    () => (eligibilityRows ? eligibilityRows.filter((r) => !r.eligible) : []),
    [eligibilityRows],
  )
  const eligibleRows = useMemo(
    () => (eligibilityRows ? eligibilityRows.filter((r) => r.eligible) : null),
    [eligibilityRows],
  )
  const eligibleCount = eligibleRows ? eligibleRows.length : count

  // §10.8 — dynamic button label reflects the eligible subset returned by the
  // pre-flight. Falls back to total `count` until pre-flight resolves so the
  // disabled→enabled transition is not jittery.
  const buttonLabel = useMemo(() => {
    if (!selectedTarget) {
      const noun = count === 1 ? 'item' : 'items'
      return `Transfer ${count} ${noun}`
    }
    const noun = eligibleCount === 1 ? 'item' : 'items'
    const subsetSuffix =
      eligibleRows && eligibleCount !== count ? ` (${eligibleCount} of ${count})` : ''
    return `Transfer ${eligibleCount} ${noun}${subsetSuffix} to ${selectedTarget.targetRepoOwner}/${selectedTarget.targetRepoName}`
  }, [count, selectedTarget, eligibleCount, eligibleRows])

  return (
    <Box
      sx={{
        position: 'fixed',
        inset: 0,
        bg: 'rgba(27,31,36,0.5)',
        zIndex: Z_MODAL,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onKeyDown={(e: React.KeyboardEvent) => e.stopPropagation()}
      onKeyUp={(e: React.KeyboardEvent) => e.stopPropagation()}
    >
      <Box
        sx={{
          bg: 'canvas.overlay',
          border: '1px solid',
          borderColor: 'border.default',
          borderRadius: 2,
          width: '100%',
          maxWidth: 480,
          overflow: 'hidden',
          boxShadow: 'none',
        }}
      >
        <ModalStepHeader
          title={`Transfer ${count} ${count === 1 ? 'issue' : 'issues'}`}
          icon={<MoveIcon size={16} />}
          onClose={onClose}
        />

        <Box sx={{ px: 4, py: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Text as="p" sx={{ m: 0, fontSize: 1, color: 'fg.default' }}>
            Transfer {count} issue{count !== 1 ? 's' : ''} to another repository.
          </Text>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, width: '100%' }}>
            <FormControl>
              <FormControl.Label id="transfer-repo-label">
                <Tippy
                  content="Pick the destination repository. Top repositories load first; type to search all repos you can access."
                  delay={[400, 0]}
                  placement="top"
                  zIndex={Z_TOOLTIP}
                >
                  <Box as="span" sx={{ cursor: 'help', width: 'fit-content' }}>
                    Repository
                  </Box>
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
            {/* §10.4 — scope toggle. Defaults owner-only; flip to widen search. */}
            <Box
              as="label"
              sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 1, cursor: 'pointer' }}
              data-testid="rgp-transfer-scope-toggle"
            >
              <Checkbox
                checked={scope === 'all'}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setScope(e.target.checked ? 'all' : 'owner-only')
                  setSelected(undefined)
                }}
                aria-label="Show all accessible repos"
              />
              <Text sx={{ fontSize: 0, color: 'fg.muted' }}>Show all accessible repos</Text>
            </Box>
          </Box>

          {/* §10.7 — pre-flight warning. Renders only when some selected items
              are ineligible for the chosen destination. The expander lists the
              titles + the per-item reason so the user can decide whether to
              proceed with the eligible subset. */}
          {selectedTarget && ineligibleRows.length > 0 && (
            <Flash variant="warning" data-testid="rgp-transfer-preflight-warning">
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Text sx={{ fontSize: 1, fontWeight: 'semibold' }}>
                  {ineligibleRows.length} item{ineligibleRows.length === 1 ? '' : 's'} cannot be
                  transferred to {selectedTarget.targetRepoOwner}/{selectedTarget.targetRepoName}
                </Text>
                <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
                  Proceed to transfer the remaining {eligibleCount} eligible item
                  {eligibleCount === 1 ? '' : 's'}.
                </Text>
                <Button
                  variant="invisible"
                  size="small"
                  onClick={() => setShowIneligibleExpander((v) => !v)}
                  sx={{ alignSelf: 'flex-start', px: 1, ...interactiveButtonSx }}
                  data-testid="rgp-transfer-preflight-expander"
                >
                  {showIneligibleExpander ? 'Hide details' : 'Show details'}
                </Button>
                {showIneligibleExpander && (
                  <Box
                    as="ul"
                    sx={{
                      m: 0,
                      pl: 3,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 1,
                      maxHeight: 160,
                      overflowY: 'auto',
                    }}
                  >
                    {ineligibleRows.map((row) => (
                      <Box
                        key={row.domId}
                        as="li"
                        sx={{ fontSize: 0, color: 'fg.default', lineHeight: 1.5 }}
                      >
                        <Text sx={{ fontWeight: 500 }}>{row.title ?? row.domId}</Text>
                        <Text sx={{ color: 'fg.muted' }}>
                          {' '}
                          — {describeEligibilityReason(row.reason)}
                        </Text>
                      </Box>
                    ))}
                  </Box>
                )}
              </Box>
            </Flash>
          )}

          {/* §10.6 consequence panel — applies to every GitHub repo transfer. */}
          <Box
            data-testid="rgp-transfer-consequence-panel"
            sx={{
              border: '1px solid',
              borderColor: 'border.default',
              borderRadius: 2,
              bg: 'canvas.subtle',
              p: 3,
            }}
          >
            <Text
              as="p"
              sx={{
                m: 0,
                mb: 2,
                fontSize: 0,
                fontWeight: 'semibold',
                color: 'fg.muted',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              What happens on transfer
            </Text>
            <Box as="ul" sx={{ m: 0, pl: 3, display: 'flex', flexDirection: 'column', gap: 1 }}>
              {TRANSFER_CONSEQUENCES.map((line) => (
                <Box key={line} as="li" sx={{ fontSize: 0, color: 'fg.default', lineHeight: 1.5 }}>
                  {line}
                </Box>
              ))}
            </Box>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, px: 4, pb: 3 }}>
          <Button variant="default" onClick={onClose} sx={interactiveButtonSx}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={
              selectedTarget === null ||
              eligibilityLoading ||
              (eligibilityRows !== undefined && eligibleCount === 0)
            }
            onClick={() => {
              if (!selectedTarget || !selected) return
              rememberTransferDestination(selected)
              const eligibleIds = eligibleRows ? eligibleRows.map((r) => r.domId) : undefined
              onConfirm(selectedTarget.targetRepoOwner, selectedTarget.targetRepoName, eligibleIds)
            }}
            sx={interactiveButtonSx}
            data-testid="rgp-transfer-confirm"
          >
            {eligibilityLoading ? 'Checking…' : buttonLabel}
          </Button>
        </Box>
      </Box>
    </Box>
  )
}
