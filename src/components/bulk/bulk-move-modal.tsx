import React, { useEffect, useRef, useState } from 'react'
import Tippy from '../ui/tooltip'
import { ArrowDownIcon, ArrowRightIcon, ArrowUpIcon } from '@primer/octicons-react'
import { Box, Button, FormControl, Radio, RadioGroup, Spinner, Text, TextInput } from '@primer/react'
import { sendMessage } from '../../lib/messages'
import { MoveIcon } from '../ui/primitives'
import { ModalStepHeader } from '../ui/modal-step-header'
import { ensureTippyCss } from '../../lib/tippy-utils'
import { Z_MODAL, Z_TOOLTIP } from '../../lib/z-index'

type Stage = 'LOADING' | 'CONFIGURE' | 'PREVIEW' | 'ERROR'
type MoveAction = 'TOP' | 'BOTTOM' | 'BEFORE' | 'AFTER'

interface OrderedItem {
  memexItemId: number
  nodeId: string
  title: string
}

export interface ReorderOp {
  nodeId: string
  previousNodeId: string | null
}

interface Props {
  count: number
  projectId: string
  itemIds: string[]
  owner: string
  number: number
  isOrg: boolean
  onClose: () => void
  onConfirm: (ops: ReorderOp[], projectId: string, label: string) => void
}


function computeNewOrder(
  allItems: OrderedItem[],
  selectedMemexIds: Set<number>,
  action: MoveAction,
  targetMemexId: number | null,
): OrderedItem[] {
  const selected = allItems.filter(i => selectedMemexIds.has(i.memexItemId))
  const nonSelected = allItems.filter(i => !selectedMemexIds.has(i.memexItemId))

  if (action === 'TOP') return [...selected, ...nonSelected]
  if (action === 'BOTTOM') return [...nonSelected, ...selected]

  if (targetMemexId == null) return allItems

  const targetIdx = nonSelected.findIndex(i => i.memexItemId === targetMemexId)
  if (targetIdx === -1) return allItems

  if (action === 'BEFORE') {
    return [
      ...nonSelected.slice(0, targetIdx),
      ...selected,
      ...nonSelected.slice(targetIdx),
    ]
  }

  // AFTER
  return [
    ...nonSelected.slice(0, targetIdx + 1),
    ...selected,
    ...nonSelected.slice(targetIdx + 1),
  ]
}

function buildOps(newOrder: OrderedItem[], selectedMemexIds: Set<number>): ReorderOp[] {
  return newOrder.reduce<ReorderOp[]>((acc, item, i) => {
    if (!selectedMemexIds.has(item.memexItemId)) return acc
    const prev = newOrder[i - 1]
    acc.push({ nodeId: item.nodeId, previousNodeId: prev?.nodeId ?? null })
    return acc
  }, [])
}

// ─── Preview list ──────────────────────────────────────────────────────────────

function PreviewList({
  items,
  selectedMemexIds,
}: {
  items: OrderedItem[]
  selectedMemexIds: Set<number>
}) {
  return (
    <Box as="ol" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 0 }}>
      {items.map((item, i) => {
        const isSel = selectedMemexIds.has(item.memexItemId)
        return (
          <Box
            as="li"
            key={item.memexItemId}
            sx={{
              display: 'flex', alignItems: 'center', gap: 2,
              px: 2, py: '5px', borderRadius: 1,
              bg: isSel ? 'accent.subtle' : 'transparent',
              borderBottom: '1px solid', borderColor: 'border.muted',
            }}
          >
            <Text sx={{ fontSize: 0, color: 'fg.muted', minWidth: 20, textAlign: 'right', flexShrink: 0 }}>
              {i + 1}
            </Text>
            <Text sx={{
              fontSize: 0, color: isSel ? 'accent.fg' : 'fg.default',
              fontWeight: isSel ? 'semibold' : 'normal',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {item.title || '(no title)'}
            </Text>
            {isSel && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'accent.fg', flexShrink: 0, ml: 'auto' }}>
                <ArrowUpIcon size={12} />
                <Text sx={{ fontSize: 0, color: 'accent.fg', fontWeight: 'semibold' }}>
                  moving
                </Text>
              </Box>
            )}
          </Box>
        )
      })}
    </Box>
  )
}

// ─── Modal ─────────────────────────────────────────────────────────────────────

export function BulkMoveModal({ count, projectId, itemIds, owner, number, isOrg, onClose, onConfirm }: Props) {
  ensureTippyCss()

  const [stage, setStage] = useState<Stage>('LOADING')
  const [allOrderedItems, setAllOrderedItems] = useState<OrderedItem[]>([])
  const [selectedMemexIds, setSelectedMemexIds] = useState<Set<number>>(new Set())
  const [resolvedProjectId, setResolvedProjectId] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const [action, setAction] = useState<MoveAction>('TOP')
  const [targetMemexId, setTargetMemexId] = useState<number | null>(null)
  const [targetSearch, setTargetSearch] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Fetch data on mount
  useEffect(() => {
    const allDomIds = Array.from(document.querySelectorAll('[data-rgp-cb]'))
      .map(el => el.getAttribute('data-rgp-cb') ?? '')
      .filter(Boolean)

    sendMessage('getReorderContext', { itemIds, projectId, owner, number, isOrg, allDomIds })
      .then(result => {
        setAllOrderedItems(result.allOrderedItems)
        setSelectedMemexIds(new Set(result.selectedItems.map(s => s.memexItemId)))
        setResolvedProjectId(result.projectId)
        setStage('CONFIGURE')
      })
      .catch(err => {
        console.error('[BulkMoveModal] getReorderContext failed', err)
        setErrorMsg(String(err?.message ?? 'Failed to fetch project items.'))
        setStage('ERROR')
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return
    function handle(e: MouseEvent) {
      const path = e.composedPath ? e.composedPath() : [e.target as Node]
      if (dropdownRef.current && !path.includes(dropdownRef.current)) setDropdownOpen(false)
    }
    window.addEventListener('mousedown', handle)
    return () => window.removeEventListener('mousedown', handle)
  }, [dropdownOpen])

  const nonSelectedItems = allOrderedItems.filter(i => !selectedMemexIds.has(i.memexItemId))
  const filteredTargets = nonSelectedItems.filter(i =>
    !targetSearch || i.title.toLowerCase().includes(targetSearch.toLowerCase())
  )
  const needsTarget = action === 'BEFORE' || action === 'AFTER'
  const canProceed = !needsTarget || targetMemexId != null

  const newOrder = computeNewOrder(allOrderedItems, selectedMemexIds, action, targetMemexId)
  const ops = buildOps(newOrder, selectedMemexIds)

  function handleConfirm() {
    const label = `Move · ${count} item${count !== 1 ? 's' : ''}`
    onConfirm(ops, resolvedProjectId, label)
  }

  const overlayStyle = {
    position: 'fixed' as const, inset: 0,
    bg: 'rgba(27,31,36,0.5)', zIndex: Z_MODAL,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }

  const panelStyle = {
    bg: 'canvas.overlay', border: '1px solid', borderColor: 'border.default',
    borderRadius: 2, width: 'min(640px, 90vw)', maxHeight: '85vh',
    display: 'flex', flexDirection: 'column' as const, overflow: 'hidden',
  }

  // ── LOADING ─────────────────────────────────────────────────────────────────
  if (stage === 'LOADING') {
    return (
      <Box sx={overlayStyle}>
        <Box sx={panelStyle}>
          <ModalStepHeader title="Move Items" icon={<MoveIcon size={16} />} onClose={onClose} />
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, py: 6 }}>
            <Spinner size="large" />
            <Text sx={{ fontSize: 1, color: 'fg.muted' }}>Fetching project items…</Text>
          </Box>
        </Box>
      </Box>
    )
  }

  // ── ERROR ────────────────────────────────────────────────────────────────────
  if (stage === 'ERROR') {
    return (
      <Box sx={overlayStyle}>
        <Box sx={panelStyle}>
          <ModalStepHeader title="Move Items" icon={<MoveIcon size={16} />} onClose={onClose} />
          <Box sx={{ px: 4, py: 3 }}>
            <Box sx={{ p: 3, borderRadius: 2, bg: 'danger.subtle', border: '1px solid', borderColor: 'danger.muted', color: 'danger.fg', fontSize: 1 }}>
              {errorMsg || 'Failed to fetch project items.'}
            </Box>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', px: 4, pb: 3 }}>
            <Button variant="default" onClick={onClose} sx={{
              boxShadow: 'none',
              transition: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
              '&:hover:not(:disabled)': { transform: 'translateY(-1px)' },
              '&:active': { transform: 'translateY(0)', transition: '100ms' },
              '@media (prefers-reduced-motion: reduce)': {
                transition: 'none',
                '&:hover:not(:disabled)': { transform: 'none' },
              },
            }}>Close</Button>
          </Box>
        </Box>
      </Box>
    )
  }

  // ── PREVIEW (Step 2/2) ───────────────────────────────────────────────────────
  if (stage === 'PREVIEW') {
    return (
      <Box sx={overlayStyle}>
        <Box sx={panelStyle}>
          <ModalStepHeader
            title="Move Items"
            icon={<MoveIcon size={16} />}
            step={2}
            totalSteps={2}
            onBack={() => setStage('CONFIGURE')}
            onClose={onClose}
          />

          <Box sx={{ flex: 1, overflow: 'auto', px: 4, py: 3 }}>
            <Box sx={{ border: '1px solid', borderColor: 'border.default', borderRadius: 1, overflow: 'hidden' }}>
              <PreviewList items={newOrder} selectedMemexIds={selectedMemexIds} />
            </Box>
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', px: 4, py: 3, borderTop: '1px solid', borderColor: 'border.default' }}>
            <Button variant="primary" onClick={handleConfirm} sx={{
              boxShadow: 'none',
              transition: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
              '&:hover:not(:disabled)': { transform: 'translateY(-1px)' },
              '&:active': { transform: 'translateY(0)', transition: '100ms' },
              '@media (prefers-reduced-motion: reduce)': {
                transition: 'none',
                '&:hover:not(:disabled)': { transform: 'none' },
              },
            }}>
              Move {count} item{count !== 1 ? 's' : ''}
            </Button>
          </Box>
        </Box>
      </Box>
    )
  }

  // ── CONFIGURE (Step 1/2) ─────────────────────────────────────────────────────
  const actionOptions: Array<{
    value: MoveAction
    label: string
    description: string
    icon: React.ComponentType<{ size?: number; fill?: string }>
  }> = [
    { value: 'TOP', label: 'Move to top', description: 'Place selected items at the top of the list.', icon: ArrowUpIcon },
    { value: 'BOTTOM', label: 'Move to bottom', description: 'Place selected items at the bottom of the list.', icon: ArrowDownIcon },
    { value: 'BEFORE', label: 'Move before', description: 'Place selected items right before a chosen item.', icon: ArrowUpIcon },
    { value: 'AFTER', label: 'Move after', description: 'Place selected items right after a chosen item.', icon: ArrowDownIcon },
  ]

  const selectedTargetItem = nonSelectedItems.find(i => i.memexItemId === targetMemexId)

  return (
    <Box sx={overlayStyle}>
      <Box sx={panelStyle}>
        <ModalStepHeader
          title="Move Items"
          icon={<MoveIcon size={16} />}
          step={1}
          totalSteps={2}
          onClose={onClose}
        />

        {/* Body */}
        <Box sx={{ flex: 1, overflow: 'auto', px: 4, py: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Action selector */}
          <RadioGroup
            name="moveAction"
            onChange={(v) => {
              const nextAction = (v as MoveAction | null) ?? 'TOP'
              setAction(nextAction)
              if (nextAction === 'TOP' || nextAction === 'BOTTOM') setTargetMemexId(null)
            }}
            sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}
          >
            <RadioGroup.Label sx={{ fontSize: 0, fontWeight: 'semibold', color: 'fg.muted' }}>
              Where to move
            </RadioGroup.Label>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {actionOptions.map(opt => {
                const isSelected = action === opt.value
                const Icon = opt.icon

                return (
                  <Tippy key={opt.value} content={opt.description} delay={[400, 0]} placement="top" zIndex={Z_TOOLTIP}>
                    <FormControl
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 2,
                        px: 3,
                        py: '6px',
                        borderRadius: 2,
                        border: '1px solid',
                        borderColor: isSelected ? 'accent.emphasis' : 'border.default',
                        bg: isSelected ? 'accent.subtle' : 'canvas.default',
                        transition: 'background-color 120ms ease, border-color 120ms ease',
                        ':hover': { bg: isSelected ? 'accent.subtle' : 'canvas.subtle' },
                        '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
                      }}
                    >
                      <Radio
                        value={opt.value}
                        checked={isSelected}
                        onChange={() => {
                          setAction(opt.value)
                          if (opt.value === 'TOP' || opt.value === 'BOTTOM') setTargetMemexId(null)
                        }}
                      />
                      <FormControl.Label sx={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0, cursor: 'help' }}>
                        <Box
                          as="span"
                          sx={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 2,
                            color: isSelected ? 'accent.fg' : 'fg.default',
                            fontWeight: isSelected ? 'semibold' : 'normal',
                          }}
                        >
                          <Icon size={14} />
                          {opt.label}
                        </Box>
                      </FormControl.Label>
                    </FormControl>
                  </Tippy>
                )
              })}
            </Box>
          </RadioGroup>

          {/* Target item picker */}
          {needsTarget && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Text sx={{ fontSize: 0, fontWeight: 'semibold', color: 'fg.muted' }}>
                {action === 'BEFORE' ? 'Before which item?' : 'After which item?'}
              </Text>
              <Box ref={dropdownRef} sx={{ position: 'relative' }}>
                <TextInput
                  block
                  value={dropdownOpen ? targetSearch : (selectedTargetItem?.title ?? '')}
                  onChange={(e) => {
                    setTargetSearch(e.target.value)
                    setTargetMemexId(null)
                    setDropdownOpen(true)
                  }}
                  onFocus={() => { setTargetSearch(''); setDropdownOpen(true) }}
                  placeholder="Search items…"
                  sx={{
                    px: 2, py: '6px', fontSize: 1, borderRadius: 1,
                    border: '1px solid', borderColor: dropdownOpen ? 'accent.emphasis' : 'border.default',
                    bg: 'canvas.default', color: 'fg.default', outline: 'none',
                    ':focus': { borderColor: 'accent.emphasis', boxShadow: '0 0 0 2px rgba(9,105,218,0.15)' },
                  }}
                />
                {dropdownOpen && (
                  <Box sx={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                    bg: 'canvas.overlay', border: '1px solid', borderColor: 'border.default',
                    borderRadius: 1, mt: '2px', maxHeight: 200, overflowY: 'auto',
                  }}>
                    {filteredTargets.length === 0 ? (
                      <Text sx={{ display: 'block', px: 2, py: 2, fontSize: 0, color: 'fg.muted' }}>No items found</Text>
                    ) : filteredTargets.map(item => (
                      <Box
                        key={item.memexItemId}
                        as="button"
                        type="button"
                        onClick={() => { setTargetMemexId(item.memexItemId); setDropdownOpen(false); setTargetSearch('') }}
                        sx={{
                          display: 'block', width: '100%', textAlign: 'left',
                          px: 2, py: '5px', fontSize: 0, color: 'fg.default',
                          bg: item.memexItemId === targetMemexId ? 'accent.subtle' : 'transparent',
                          border: 'none', cursor: 'pointer',
                          ':hover': { bg: 'canvas.subtle' },
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}
                      >
                        {item.title || '(no title)'}
                      </Box>
                    ))}
                  </Box>
                )}
              </Box>
            </Box>
          )}

          {/* Live preview */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Text sx={{ fontSize: 0, fontWeight: 'semibold', color: 'fg.muted' }}>Preview</Text>
            <Box sx={{ border: '1px solid', borderColor: 'border.default', borderRadius: 1, overflow: 'hidden' }}>
              <Box sx={{ maxHeight: 220, overflowY: 'auto' }}>
                <PreviewList items={newOrder} selectedMemexIds={selectedMemexIds} />
              </Box>
            </Box>
          </Box>
        </Box>

        {/* Footer */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 4, py: 3, borderTop: '1px solid', borderColor: 'border.default' }}>
          <Text sx={{ fontSize: 0, color: 'fg.muted' }}>{count} item{count !== 1 ? 's' : ''} will move</Text>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button variant="default" onClick={onClose} sx={{
              boxShadow: 'none',
              transition: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
              '&:hover:not(:disabled)': { transform: 'translateY(-1px)' },
              '&:active': { transform: 'translateY(0)', transition: '100ms' },
              '@media (prefers-reduced-motion: reduce)': {
                transition: 'none',
                '&:hover:not(:disabled)': { transform: 'none' },
              },
            }}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!canProceed}
              onClick={() => setStage('PREVIEW')}
              sx={{
              boxShadow: 'none',
              transition: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
              '&:hover:not(:disabled)': { transform: 'translateY(-1px)' },
              '&:active': { transform: 'translateY(0)', transition: '100ms' },
              '@media (prefers-reduced-motion: reduce)': {
                transition: 'none',
                '&:hover:not(:disabled)': { transform: 'none' },
              },
            }}
            >
              <Box as="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                Preview
                <ArrowRightIcon size={14} />
              </Box>
            </Button>
          </Box>
        </Box>
      </Box>
    </Box>
  )
}
