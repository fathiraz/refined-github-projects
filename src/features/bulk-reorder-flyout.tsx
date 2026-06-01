// Drilldown flyout for bulk reordering (§7 of bulk-actions-flyouts). The
// root pane offers three direct choices — Top, Bottom, Custom. Custom
// drilldowns to a Before / After target picker with a searchable list and a
// "Recent targets" section pinned at the top. Apply dispatches the existing
// `bulkReorder` message; no protocol change.

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ActionList, Box, Spinner, Text, TextInput } from '@primer/react'
import { ArrowDownIcon, ArrowRightIcon, ArrowUpIcon } from '@primer/octicons-react'
import { SearchIcon } from '@/ui/icons'
import { BulkFlyout, type BulkFlyoutPane, useDrilldownPane } from '@/ui/bulk-flyout'
import { sendMessage } from '@/lib/messages'
import {
  buildOps,
  computeNewOrder,
  type MoveAction,
  type OrderedItem,
  type ReorderOp,
} from '@/features/bulk-move-utils'

export interface BulkReorderFlyoutProps {
  anchorRef: React.RefObject<HTMLElement | null>
  open: boolean
  onClose: () => void
  projectId: string
  itemIds: readonly string[]
  count: number
  owner: string
  number: number
  isOrg: boolean
  onConfirm: (ops: ReorderOp[], projectId: string, label: string) => void
}

interface ReorderCallContext {
  ops: ReorderOp[]
  projectId: string
  label: string
}

// Module-level cache of recent reorder targets (memexItemId list, most-recent
// first, capped). Session-only; cleared on tab reload.
const RECENT_TARGETS_CAP = 5
const recentTargets: number[] = []

function pushRecent(memexItemId: number) {
  const idx = recentTargets.indexOf(memexItemId)
  if (idx !== -1) recentTargets.splice(idx, 1)
  recentTargets.unshift(memexItemId)
  if (recentTargets.length > RECENT_TARGETS_CAP) recentTargets.length = RECENT_TARGETS_CAP
}

export function BulkReorderFlyout({
  anchorRef,
  open,
  onClose,
  projectId,
  itemIds,
  count,
  owner,
  number,
  isOrg,
  onConfirm,
}: BulkReorderFlyoutProps) {
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [allOrdered, setAllOrdered] = useState<OrderedItem[]>([])
  const [selectedMemexIds, setSelectedMemexIds] = useState<Set<number>>(new Set())
  const [resolvedProjectId, setResolvedProjectId] = useState('')
  const [direction, setDirection] = useState<'before' | 'after'>('before')
  const [query, setQuery] = useState('')
  const { currentPaneId, setCurrentPaneId } = useDrilldownPane('root', open)
  const latestReq = useRef(0)

  useEffect(() => {
    if (!open || itemIds.length === 0) return
    const requestId = latestReq.current + 1
    latestReq.current = requestId
    setLoading(true)
    setFetchError(null)
    const allDomIds = Array.from(document.querySelectorAll('[data-rgp-cb]'))
      .map((el) => el.getAttribute('data-rgp-cb') ?? '')
      .filter(Boolean)
    sendMessage('getReorderContext', {
      itemIds: [...itemIds],
      projectId,
      owner,
      number,
      isOrg,
      allDomIds,
    })
      .then((result) => {
        if (requestId !== latestReq.current) return
        setAllOrdered(result.allOrderedItems)
        setSelectedMemexIds(new Set(result.selectedItems.map((s) => s.memexItemId)))
        setResolvedProjectId(result.projectId)
      })
      .catch((err: unknown) => {
        if (requestId !== latestReq.current) return
        setFetchError(err instanceof Error ? err.message : 'Failed to fetch project items.')
      })
      .finally(() => {
        if (requestId === latestReq.current) setLoading(false)
      })
    return () => {
      if (latestReq.current === requestId) latestReq.current = 0
    }
  }, [open, projectId, itemIds, owner, number, isOrg])

  useEffect(() => {
    if (!open) {
      setQuery('')
      setDirection('before')
    }
  }, [open])

  function fireAndClose(ctx: ReorderCallContext) {
    onConfirm(ctx.ops, ctx.projectId, ctx.label)
    onClose()
  }

  function applyTopOrBottom(action: MoveAction) {
    const newOrder = computeNewOrder(allOrdered, selectedMemexIds, action, null)
    const ops = buildOps(newOrder, selectedMemexIds)
    fireAndClose({
      ops,
      projectId: resolvedProjectId,
      label: `Move · ${count} item${count !== 1 ? 's' : ''}`,
    })
  }

  function applyCustom(targetMemexId: number) {
    pushRecent(targetMemexId)
    const moveAction: MoveAction = direction === 'before' ? 'BEFORE' : 'AFTER'
    const newOrder = computeNewOrder(allOrdered, selectedMemexIds, moveAction, targetMemexId)
    const ops = buildOps(newOrder, selectedMemexIds)
    fireAndClose({
      ops,
      projectId: resolvedProjectId,
      label: `Move · ${count} item${count !== 1 ? 's' : ''}`,
    })
  }

  const nonSelected = useMemo(
    () => allOrdered.filter((i) => !selectedMemexIds.has(i.memexItemId)),
    [allOrdered, selectedMemexIds],
  )

  const filteredTargets = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return nonSelected
    return nonSelected.filter((i) => i.title.toLowerCase().includes(q))
  }, [nonSelected, query])

  const recentList = useMemo(() => {
    if (query) return []
    const indexed = nonSelected.reduce<Map<number, OrderedItem>>((acc, item) => {
      acc.set(item.memexItemId, item)
      return acc
    }, new Map())
    return recentTargets
      .map((id) => indexed.get(id))
      .filter((x): x is OrderedItem => x !== undefined)
  }, [nonSelected, query])

  const reorderUnavailable = loading || fetchError !== null || resolvedProjectId === ''

  const rootPane: BulkFlyoutPane = {
    id: 'root',
    title: 'Move items',
    content: (
      <Box>
        {loading && (
          <Box sx={{ p: 2, display: 'flex', justifyContent: 'center' }}>
            <Spinner size="small" />
          </Box>
        )}
        {fetchError && (
          <Box sx={{ p: 2, color: 'danger.fg', fontSize: 1 }} data-testid="rgp-reorder-error">
            {fetchError}
          </Box>
        )}
        <ActionList>
          <ActionList.Item
            onSelect={() => applyTopOrBottom('TOP')}
            data-testid="rgp-reorder-top"
            disabled={reorderUnavailable}
          >
            <ActionList.LeadingVisual>
              <ArrowUpIcon size={14} />
            </ActionList.LeadingVisual>
            Top of board
            <ActionList.Description>Place selected items at the top.</ActionList.Description>
          </ActionList.Item>
          <ActionList.Item
            onSelect={() => applyTopOrBottom('BOTTOM')}
            data-testid="rgp-reorder-bottom"
            disabled={reorderUnavailable}
          >
            <ActionList.LeadingVisual>
              <ArrowDownIcon size={14} />
            </ActionList.LeadingVisual>
            Bottom of board
            <ActionList.Description>Place selected items at the bottom.</ActionList.Description>
          </ActionList.Item>
          <ActionList.Item
            onSelect={() => setCurrentPaneId('custom')}
            data-testid="rgp-reorder-custom"
            disabled={reorderUnavailable}
          >
            <ActionList.LeadingVisual>
              <ArrowRightIcon size={14} />
            </ActionList.LeadingVisual>
            Custom position
            <ActionList.Description>Place before / after a chosen item.</ActionList.Description>
          </ActionList.Item>
        </ActionList>
      </Box>
    ),
  }

  const customPane: BulkFlyoutPane = {
    id: 'custom',
    title: 'Custom position',
    content: (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box sx={{ display: 'flex', gap: 2 }}>
          {(['before', 'after'] as const).map((d) => {
            const selected = direction === d
            return (
              <Box
                as="button"
                type="button"
                key={d}
                onClick={() => setDirection(d)}
                aria-pressed={selected}
                sx={{
                  flex: 1,
                  px: 2,
                  py: 1,
                  borderRadius: 1,
                  border: '1px solid',
                  borderColor: selected ? 'accent.emphasis' : 'border.default',
                  bg: selected ? 'accent.subtle' : 'canvas.default',
                  color: selected ? 'accent.fg' : 'fg.default',
                  fontWeight: selected ? 'semibold' : 'normal',
                  fontSize: 1,
                  cursor: 'pointer',
                }}
                data-testid={`rgp-reorder-direction-${d}`}
              >
                {d === 'before' ? 'Before…' : 'After…'}
              </Box>
            )
          })}
        </Box>
        <TextInput
          leadingVisual={SearchIcon}
          value={query}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
          aria-label="Search items"
          placeholder="Search items…"
          sx={{ width: '100%' }}
        />
        <Box
          sx={{
            border: '1px solid',
            borderColor: 'border.default',
            borderRadius: 1,
            maxHeight: 240,
            overflowY: 'auto',
          }}
          data-testid="rgp-reorder-target-list"
        >
          {!query && recentList.length > 0 && (
            <Box>
              <Box
                sx={{
                  px: 2,
                  py: 1,
                  fontSize: 0,
                  fontWeight: 'semibold',
                  color: 'fg.muted',
                  bg: 'canvas.subtle',
                  borderBottom: '1px solid',
                  borderColor: 'border.muted',
                }}
              >
                Recent targets
              </Box>
              {recentList.map((item) => (
                <TargetRow key={`recent-${item.memexItemId}`} item={item} onPick={applyCustom} />
              ))}
              <Box
                sx={{
                  px: 2,
                  py: 1,
                  fontSize: 0,
                  fontWeight: 'semibold',
                  color: 'fg.muted',
                  bg: 'canvas.subtle',
                  borderTop: '1px solid',
                  borderColor: 'border.muted',
                  borderBottom: '1px solid',
                }}
              >
                All items
              </Box>
            </Box>
          )}
          {filteredTargets.length === 0 ? (
            <Box sx={{ p: 2, fontSize: 0, color: 'fg.muted' }}>No items match.</Box>
          ) : (
            filteredTargets.map((item) => (
              <TargetRow key={item.memexItemId} item={item} onPick={applyCustom} />
            ))
          )}
        </Box>
        <PositionPreview
          allOrdered={allOrdered}
          selectedMemexIds={selectedMemexIds}
          direction={direction}
        />
      </Box>
    ),
  }

  return (
    <BulkFlyout
      mode="drilldown"
      anchorRef={anchorRef as React.RefObject<HTMLElement>}
      open={open}
      onClose={onClose}
      title={`Reorder — ${count} item${count !== 1 ? 's' : ''}`}
      ariaLabel="Reorder items"
      width={380}
      maxHeight={540}
      panes={[rootPane, customPane]}
      currentPaneId={currentPaneId}
      onPaneChange={setCurrentPaneId}
      rootPaneId="root"
    />
  )
}

interface TargetRowProps {
  item: OrderedItem
  onPick: (memexItemId: number) => void
}

function TargetRow({ item, onPick }: TargetRowProps) {
  return (
    <Box
      as="button"
      type="button"
      onClick={() => onPick(item.memexItemId)}
      sx={{
        width: '100%',
        textAlign: 'left',
        px: 2,
        py: 1,
        border: 'none',
        bg: 'transparent',
        cursor: 'pointer',
        fontSize: 0,
        color: 'fg.default',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        ':hover': { bg: 'canvas.subtle' },
      }}
      data-testid={`rgp-reorder-target-${item.memexItemId}`}
    >
      {item.title || '(no title)'}
    </Box>
  )
}

interface PositionPreviewProps {
  allOrdered: OrderedItem[]
  selectedMemexIds: Set<number>
  direction: 'before' | 'after'
}

function PositionPreview({ allOrdered, selectedMemexIds }: PositionPreviewProps) {
  const movingCount = selectedMemexIds.size
  const totalCount = allOrdered.length
  return (
    <Text sx={{ fontSize: 0, color: 'fg.muted' }} data-testid="rgp-reorder-preview-footer">
      {movingCount} item{movingCount === 1 ? '' : 's'} will move within {totalCount} total
    </Text>
  )
}

export { recentTargets as _recentReorderTargets }
