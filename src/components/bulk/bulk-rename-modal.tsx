import React, { useEffect, useState } from 'react'
import Tippy from '../ui/tooltip'
import { Box, Button, Spinner, Text } from '@primer/react'
import { sendMessage } from '../../lib/messages'
import { ArrowRightIcon, PencilIcon, PlusIcon, SearchIcon, TextLineIcon } from '../ui/primitives'
import { ModalStepHeader } from '../ui/modal-step-header'
import { ensureTippyCss } from '../../lib/tippy-utils'
import { Z_MODAL, Z_TOOLTIP } from '../../lib/z-index'

type Stage = 'LOADING' | 'CONFIGURE' | 'PREVIEW' | 'ERROR'
type RenameTab = 'FIND_REPLACE' | 'PREFIX_SUFFIX'

interface TitleItem {
  domId: string
  issueNodeId: string
  title: string
  typename: 'Issue' | 'PullRequest'
}

interface RuleState {
  tab: RenameTab
  findText: string
  replaceText: string
  caseSensitive: boolean
  prefix: string
  suffix: string
}

interface Props {
  count: number
  projectId: string
  itemIds: string[]
  onClose: () => void
  onConfirm: (renames: Array<{ domId: string; issueNodeId: string; newTitle: string; typename: 'Issue' | 'PullRequest' }>) => void
}

function applyRule(original: string, rule: RuleState): string {
  if (rule.tab === 'FIND_REPLACE') {
    if (!rule.findText) return original
    const flags = rule.caseSensitive ? 'g' : 'gi'
    const escaped = rule.findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return original.replace(new RegExp(escaped, flags), rule.replaceText)
  }
  return `${rule.prefix}${original}${rule.suffix}`
}

export function BulkRenameModal({ count, projectId, itemIds, onClose, onConfirm }: Props) {
  useEffect(() => {
    ensureTippyCss()
  }, [])

  const [stage, setStage] = useState<Stage>('LOADING')
  const [items, setItems] = useState<TitleItem[]>([])
  const [errorMsg, setErrorMsg] = useState('')

  // FIND_REPLACE
  const [findText, setFindText] = useState('')
  const [replaceText, setReplaceText] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  // PREFIX_SUFFIX
  const [prefix, setPrefix] = useState('')
  const [suffix, setSuffix] = useState('')

  const [activeTab, setActiveTab] = useState<RenameTab>('FIND_REPLACE')

  const rule: RuleState = { tab: activeTab, findText, replaceText, caseSensitive, prefix, suffix }

  useEffect(() => {
    sendMessage('getItemTitles', { itemIds, projectId })
      .then(resolved => {
        setItems(resolved.map(r => ({
          domId: r.domId,
          issueNodeId: r.issueNodeId,
          title: r.title,
          typename: r.typename,
        })))
        setStage('CONFIGURE')
      })
      .catch(err => {
        console.error('[BulkRenameModal] getItemTitles failed', err)
        setErrorMsg(String(err?.message ?? 'Failed to fetch item titles.'))
        setStage('ERROR')
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const previewed = items.map(item => ({ ...item, newTitle: applyRule(item.title, rule) }))
  const changedCount = previewed.filter(p => p.newTitle !== p.title).length

  function handleConfirm() {
    const renames = previewed
      .filter(p => p.newTitle !== p.title)
      .map(p => ({ domId: p.domId, issueNodeId: p.issueNodeId, newTitle: p.newTitle, typename: p.typename }))
    onConfirm(renames)
  }

  const overlayStyle = {
    position: 'fixed' as const, inset: 0,
    bg: 'rgba(27,31,36,0.5)', zIndex: Z_MODAL,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }

  const panelStyle = {
    bg: 'canvas.overlay', border: '1px solid', borderColor: 'border.default',
    borderRadius: 2, width: 'min(680px, 90vw)', maxHeight: '85vh',
    display: 'flex', flexDirection: 'column' as const, overflow: 'hidden',
  }

  const inputLabelStyle = {
    fontSize: 0,
    fontWeight: 'semibold',
    color: 'fg.muted',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 2,
  } as const

  const inputLabelIconStyle = {
    color: 'fg.muted',
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
  } as const

  // ── LOADING ──────────────────────────────────────────────────────────────────
  if (stage === 'LOADING') {
    return (
      <Box sx={overlayStyle} onKeyDown={(e: React.KeyboardEvent) => { e.stopPropagation(); if (e.key === 'Escape') onClose() }} onKeyUp={(e: React.KeyboardEvent) => e.stopPropagation()}>
        <Box sx={panelStyle}>
          <ModalStepHeader title="Rename Titles" icon={<PencilIcon size={16} />} onClose={onClose} />
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, py: 6 }}>
            <Spinner size="large" />
            <Text sx={{ fontSize: 1, color: 'fg.muted' }}>Fetching item titles…</Text>
          </Box>
        </Box>
      </Box>
    )
  }

  // ── ERROR ─────────────────────────────────────────────────────────────────────
  if (stage === 'ERROR') {
    return (
      <Box sx={overlayStyle} onKeyDown={(e: React.KeyboardEvent) => { e.stopPropagation(); if (e.key === 'Escape') onClose() }} onKeyUp={(e: React.KeyboardEvent) => e.stopPropagation()}>
        <Box sx={panelStyle}>
          <ModalStepHeader title="Rename Titles" icon={<PencilIcon size={16} />} onClose={onClose} />
          <Box sx={{ px: 4, py: 3 }}>
            <Box sx={{ p: 3, borderRadius: 2, bg: 'danger.subtle', border: '1px solid', borderColor: 'danger.muted', color: 'danger.fg', fontSize: 1 }}>
              {errorMsg || 'Failed to fetch item titles.'}
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

  // ── PREVIEW (Step 2/2) ────────────────────────────────────────────────────────
  if (stage === 'PREVIEW') {
    return (
      <Box sx={overlayStyle} onKeyDown={(e: React.KeyboardEvent) => { e.stopPropagation(); if (e.key === 'Escape') onClose() }} onKeyUp={(e: React.KeyboardEvent) => e.stopPropagation()}>
        <Box sx={panelStyle}>
          <ModalStepHeader
            title="Rename Titles"
            icon={<PencilIcon size={16} />}
            step={2}
            totalSteps={2}
            onBack={() => setStage('CONFIGURE')}
            onClose={onClose}
          />

          {/* Frozen table */}
          <Box sx={{ flex: 1, overflow: 'auto', px: 4, py: 3 }}>
            <PreviewTable items={previewed} />
          </Box>

          {/* Footer */}
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
              Rename {changedCount} item{changedCount !== 1 ? 's' : ''}
            </Button>
          </Box>
        </Box>
      </Box>
    )
  }

  // ── CONFIGURE (Step 1/2) ──────────────────────────────────────────────────────
  return (
    <Box sx={overlayStyle}>
      <Box sx={panelStyle}>
        <ModalStepHeader
          title="Rename Titles"
          icon={<PencilIcon size={16} />}
          step={1}
          totalSteps={2}
          onClose={onClose}
        />

        {/* Body */}
        <Box sx={{ flex: 1, overflow: 'auto', px: 4, py: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Tab bar */}
          <Box sx={{ display: 'flex', borderBottom: '1px solid', borderColor: 'border.default', gap: 0 }}>
            {(['FIND_REPLACE', 'PREFIX_SUFFIX'] as RenameTab[]).map(tab => (
              <Box
                key={tab}
                as="button"
                type="button"
                onClick={() => setActiveTab(tab)}
                sx={{
                  px: 3, py: 2, fontSize: 1, fontWeight: activeTab === tab ? 'semibold' : 'normal',
                  bg: 'transparent', border: 'none', cursor: 'pointer',
                  color: activeTab === tab ? 'fg.default' : 'fg.muted',
                  borderBottom: activeTab === tab ? '2px solid' : '2px solid transparent',
                  borderColor: activeTab === tab ? 'accent.emphasis' : 'transparent',
                  mb: '-1px',
                  ':hover': { color: 'fg.default' },
                }}
              >
                {tab === 'FIND_REPLACE' ? 'Find & Replace' : 'Prefix / Suffix'}
              </Box>
            ))}
          </Box>

          {/* Inputs */}
          {activeTab === 'FIND_REPLACE' ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Text as="label" htmlFor="bulk-rename-find-input" sx={inputLabelStyle}>
                  <Box as="span" sx={inputLabelIconStyle}>
                    <SearchIcon size={14} />
                  </Box>
                  Find
                </Text>
                <Box
                  as="input"
                  id="bulk-rename-find-input"
                  type="text"
                  value={findText}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFindText(e.target.value)}
                  placeholder="Text to find…"
                  sx={{
                    px: 2, py: '6px', fontSize: 1, borderRadius: 1,
                    border: '1px solid', borderColor: 'border.default',
                    bg: 'canvas.default', color: 'fg.default',
                    outline: 'none',
                    ':focus': { borderColor: 'accent.emphasis', boxShadow: '0 0 0 2px rgba(9,105,218,0.15)' },
                    width: '100%',
                  }}
                />
              </Box>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Text as="label" htmlFor="bulk-rename-replace-input" sx={inputLabelStyle}>
                  <Box as="span" sx={inputLabelIconStyle}>
                    <ArrowRightIcon size={14} />
                  </Box>
                  Replace with
                </Text>
                <Box
                  as="input"
                  id="bulk-rename-replace-input"
                  type="text"
                  value={replaceText}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setReplaceText(e.target.value)}
                  placeholder="Replacement text…"
                  sx={{
                    px: 2, py: '6px', fontSize: 1, borderRadius: 1,
                    border: '1px solid', borderColor: 'border.default',
                    bg: 'canvas.default', color: 'fg.default',
                    outline: 'none',
                    ':focus': { borderColor: 'accent.emphasis', boxShadow: '0 0 0 2px rgba(9,105,218,0.15)' },
                    width: '100%',
                  }}
                />
              </Box>
              <Box
                as="label"
                sx={{ display: 'inline-flex', alignItems: 'center', gap: 2, cursor: 'pointer', userSelect: 'none', fontSize: 1, color: 'fg.muted' }}
              >
                <Box
                  as="input"
                  type="checkbox"
                  checked={caseSensitive}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCaseSensitive(e.target.checked)}
                  sx={{ cursor: 'pointer' }}
                />
                <Tippy content="Match uppercase/lowercase letters exactly when finding text." delay={[400, 0]} placement="top" zIndex={Z_TOOLTIP}>
                  <Box as="span" tabIndex={0} sx={{ outline: 'none' }}>Case sensitive</Box>
                </Tippy>
              </Box>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Text as="label" htmlFor="bulk-rename-prefix-input" sx={inputLabelStyle}>
                  <Box as="span" sx={inputLabelIconStyle}>
                    <PlusIcon size={14} />
                  </Box>
                  Prefix
                </Text>
                <Box
                  as="input"
                  id="bulk-rename-prefix-input"
                  type="text"
                  value={prefix}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPrefix(e.target.value)}
                  placeholder="Text to prepend…"
                  sx={{
                    px: 2, py: '6px', fontSize: 1, borderRadius: 1,
                    border: '1px solid', borderColor: 'border.default',
                    bg: 'canvas.default', color: 'fg.default',
                    outline: 'none',
                    ':focus': { borderColor: 'accent.emphasis', boxShadow: '0 0 0 2px rgba(9,105,218,0.15)' },
                    width: '100%',
                  }}
                />
              </Box>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Text as="label" htmlFor="bulk-rename-suffix-input" sx={inputLabelStyle}>
                  <Box as="span" sx={inputLabelIconStyle}>
                    <TextLineIcon size={14} />
                  </Box>
                  Suffix
                </Text>
                <Box
                  as="input"
                  id="bulk-rename-suffix-input"
                  type="text"
                  value={suffix}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSuffix(e.target.value)}
                  placeholder="Text to append…"
                  sx={{
                    px: 2, py: '6px', fontSize: 1, borderRadius: 1,
                    border: '1px solid', borderColor: 'border.default',
                    bg: 'canvas.default', color: 'fg.default',
                    outline: 'none',
                    ':focus': { borderColor: 'accent.emphasis', boxShadow: '0 0 0 2px rgba(9,105,218,0.15)' },
                    width: '100%',
                  }}
                />
              </Box>
            </Box>
          )}

          {/* Live preview table */}
          <Box sx={{ overflow: 'hidden', border: '1px solid', borderColor: 'border.default', borderRadius: 1 }}>
            <Box sx={{ maxHeight: 240, overflowY: 'auto' }}>
              <PreviewTable items={previewed} />
            </Box>
          </Box>
        </Box>

        {/* Footer */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 4, py: 3, borderTop: '1px solid', borderColor: 'border.default' }}>
          <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
            {changedCount} of {count} title{count !== 1 ? 's' : ''} will change
          </Text>
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
              disabled={changedCount === 0}
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
              <Box as="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
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

function PreviewTable({ items }: { items: Array<TitleItem & { newTitle: string }> }) {
  return (
    <Box as="table" sx={{ width: '100%', borderCollapse: 'collapse', fontSize: 0 }}>
      <Box as="thead" sx={{ bg: 'canvas.subtle', position: 'sticky', top: 0 }}>
        <Box as="tr">
          <Box as="th" sx={{ px: 2, py: 1, textAlign: 'left', fontWeight: 'semibold', color: 'fg.muted', width: 32, borderBottom: '1px solid', borderColor: 'border.default' }}>#</Box>
          <Box as="th" sx={{ px: 2, py: 1, textAlign: 'left', fontWeight: 'semibold', color: 'fg.muted', borderBottom: '1px solid', borderColor: 'border.default' }}>Original Title</Box>
          <Box as="th" aria-label="Rename direction" sx={{ px: 2, py: 1, textAlign: 'center', fontWeight: 'semibold', color: 'fg.muted', width: 24, borderBottom: '1px solid', borderColor: 'border.default' }}>
            <ArrowRightIcon size={14} />
          </Box>
          <Box as="th" sx={{ px: 2, py: 1, textAlign: 'left', fontWeight: 'semibold', color: 'fg.muted', borderBottom: '1px solid', borderColor: 'border.default' }}>New Title</Box>
        </Box>
      </Box>
      <Box as="tbody">
        {items.map((item, i) => {
          const unchanged = item.newTitle === item.title
          return (
            <Box as="tr" key={item.domId} sx={{ opacity: unchanged ? 0.5 : 1 }}>
              <Box as="td" sx={{ px: 2, py: 1, color: 'fg.muted', borderBottom: '1px solid', borderColor: 'border.muted' }}>{i + 1}</Box>
              <Box as="td" sx={{ px: 2, py: 1, color: unchanged ? 'fg.muted' : 'fg.default', borderBottom: '1px solid', borderColor: 'border.muted', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</Box>
              <Box as="td" sx={{ px: 2, py: 1, color: 'fg.muted', textAlign: 'center', borderBottom: '1px solid', borderColor: 'border.muted' }}>
                <ArrowRightIcon size={14} />
              </Box>
              <Box as="td" sx={{ px: 2, py: 1, color: unchanged ? 'fg.muted' : 'fg.default', fontWeight: unchanged ? 'normal' : 'semibold', borderBottom: '1px solid', borderColor: 'border.muted', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.newTitle}</Box>
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}
