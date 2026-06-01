// Tabbed anchored flyout for bulk renaming (§6 of bulk-actions-flyouts).
// Five tabs — Replace · Prefix · Suffix · Template · Number — each producing
// `RuleState`. A capped preview (5 rows + expander) renders the resulting
// new titles. Apply dispatches the existing `bulkRename` message; no
// protocol change.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Box, Checkbox, Flash, Radio, RadioGroup, Spinner, Text, TextInput } from '@primer/react'
import { BulkFlyout, type BulkFlyoutTab } from '@/ui/bulk-flyout'
import { sendMessage } from '@/lib/messages'
import {
  DEFAULT_RULE_STATE,
  evaluateRule,
  hasAnyChange,
  type NumberStyle,
  type RenameTab,
  type RuleState,
  type TitleItem,
} from '@/features/bulk-rename-utils'

export interface RenameFlyoutConfirm {
  domId: string
  issueNodeId: string
  newTitle: string
  typename: 'Issue' | 'PullRequest'
}

export interface BulkRenameFlyoutProps {
  anchorRef: React.RefObject<HTMLElement | null>
  open: boolean
  onClose: () => void
  projectId: string
  itemIds: readonly string[]
  count: number
  onConfirm: (renames: RenameFlyoutConfirm[]) => void
}

const TABS: BulkFlyoutTab[] = [
  { id: 'replace', label: 'Replace', content: null },
  { id: 'prefix', label: 'Prefix', content: null },
  { id: 'suffix', label: 'Suffix', content: null },
  { id: 'template', label: 'Template', content: null },
  { id: 'number', label: 'Number', content: null },
]

const TEMPLATE_TOKENS = ['{n}', '{title}', '{number}', '{date}'] as const

const PREVIEW_CAP = 5

const inputSx = {
  width: '100%',
  fontSize: 1,
} as const

export function BulkRenameFlyout({
  anchorRef,
  open,
  onClose,
  projectId,
  itemIds,
  count,
  onConfirm,
}: BulkRenameFlyoutProps) {
  const [items, setItems] = useState<TitleItem[]>([])
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [rule, setRule] = useState<RuleState>(DEFAULT_RULE_STATE)
  const [showAll, setShowAll] = useState(false)
  const templateInputRef = useRef<HTMLInputElement | null>(null)
  const latestFetch = useRef(0)

  // Reset on open
  useEffect(() => {
    if (!open) {
      setRule(DEFAULT_RULE_STATE)
      setShowAll(false)
      setItems([])
      setFetchError(null)
    }
  }, [open])

  // Fetch titles whenever flyout opens
  useEffect(() => {
    if (!open || itemIds.length === 0) return

    const requestId = latestFetch.current + 1
    latestFetch.current = requestId
    setLoading(true)
    setFetchError(null)
    sendMessage('getItemTitles', { itemIds: [...itemIds], projectId })
      .then((resolved) => {
        if (requestId !== latestFetch.current) return
        setItems(
          resolved.map((r) => ({
            domId: r.domId,
            issueNodeId: r.issueNodeId,
            title: r.title,
            typename: r.typename,
          })),
        )
      })
      .catch((err: unknown) => {
        if (requestId !== latestFetch.current) return
        setFetchError(err instanceof Error ? err.message : 'Failed to fetch item titles.')
      })
      .finally(() => {
        if (requestId === latestFetch.current) setLoading(false)
      })

    return () => {
      if (latestFetch.current === requestId) {
        // Bump past the cancelled id so its in-flight response cannot match
        // again. Resetting to 0 would collide with the next monotonic id.
        latestFetch.current = requestId + 1
        setLoading(false)
      }
    }
  }, [open, projectId, itemIds])

  const setTab = useCallback((id: string) => {
    setRule((prev) => ({ ...prev, tab: id as RenameTab }))
  }, [])

  // Evaluate every item; expose first regex error (if any) for the Replace tab
  const evaluations = useMemo(
    () => items.map((it, idx) => ({ item: it, ...evaluateRule(it.title, rule, idx) })),
    [items, rule],
  )

  const regexError = useMemo(() => {
    if (rule.tab !== 'replace' || !rule.useRegex) return null
    const e = evaluations.find((row) => row.error)
    return e?.error?.message ?? null
  }, [evaluations, rule.tab, rule.useRegex])

  const changedCount = useMemo(
    () => evaluations.filter((row) => row.newTitle !== row.item.title).length,
    [evaluations],
  )

  const canApply = !loading && !regexError && hasAnyChange(items, rule)

  function handleApply() {
    if (!canApply) return
    const renames: RenameFlyoutConfirm[] = evaluations
      .filter((row) => row.newTitle !== row.item.title)
      .map((row) => ({
        domId: row.item.domId,
        issueNodeId: row.item.issueNodeId,
        newTitle: row.newTitle,
        typename: row.item.typename,
      }))
    onConfirm(renames)
    onClose()
  }

  function insertTemplateToken(token: string) {
    setRule((prev) => {
      const input = templateInputRef.current
      const next = { ...prev }
      const before = prev.template ?? ''
      if (input) {
        const start = input.selectionStart ?? before.length
        const end = input.selectionEnd ?? before.length
        next.template = `${before.slice(0, start)}${token}${before.slice(end)}`
        requestAnimationFrame(() => {
          const pos = start + token.length
          input.focus()
          input.setSelectionRange(pos, pos)
        })
      } else {
        next.template = `${before}${token}`
      }
      return next
    })
  }

  const visiblePreview = showAll ? evaluations : evaluations.slice(0, PREVIEW_CAP)
  const hiddenCount = Math.max(0, evaluations.length - PREVIEW_CAP)

  return (
    <BulkFlyout
      mode="tabbed"
      anchorRef={anchorRef as React.RefObject<HTMLElement>}
      open={open}
      onClose={onClose}
      title={`Rename — ${count} item${count !== 1 ? 's' : ''}`}
      ariaLabel="Rename titles"
      width={420}
      maxHeight={540}
      footer="apply-cancel"
      tabs={TABS}
      activeTabId={rule.tab}
      onTabChange={setTab}
      applyLabel={`Rename ${changedCount} item${changedCount === 1 ? '' : 's'}`}
      applyDisabled={!canApply || changedCount === 0}
      onApply={handleApply}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {loading && (
          <Box sx={{ p: 2, display: 'flex', justifyContent: 'center' }}>
            <Spinner size="small" />
          </Box>
        )}
        {fetchError && <Flash variant="danger">{fetchError}</Flash>}

        {rule.tab === 'replace' && (
          <ReplaceTab rule={rule} onChange={setRule} regexError={regexError} />
        )}
        {rule.tab === 'prefix' && (
          <SingleInputTab
            label="Prefix"
            helper="Text prepended to every selected title."
            value={rule.prefix}
            onChange={(v) => setRule((p) => ({ ...p, prefix: v }))}
            testid="rgp-rename-prefix"
          />
        )}
        {rule.tab === 'suffix' && (
          <SingleInputTab
            label="Suffix"
            helper="Text appended to every selected title."
            value={rule.suffix}
            onChange={(v) => setRule((p) => ({ ...p, suffix: v }))}
            testid="rgp-rename-suffix"
          />
        )}
        {rule.tab === 'template' && (
          <TemplateTab
            rule={rule}
            onChange={setRule}
            inputRef={templateInputRef}
            onInsertToken={insertTemplateToken}
          />
        )}
        {rule.tab === 'number' && <NumberTab rule={rule} onChange={setRule} />}

        {!loading && evaluations.length > 0 && (
          <Box
            sx={{
              border: '1px solid',
              borderColor: 'border.default',
              borderRadius: 1,
              overflow: 'hidden',
            }}
            data-testid="rgp-rename-preview"
          >
            <Box
              sx={{
                px: 2,
                py: 1,
                bg: 'canvas.subtle',
                borderBottom: '1px solid',
                borderColor: 'border.default',
                fontSize: 0,
                fontWeight: 'semibold',
                color: 'fg.muted',
              }}
            >
              Preview · {changedCount} of {count} will change
            </Box>
            <Box>
              {visiblePreview.map(({ item, newTitle }, idx) => {
                const unchanged = newTitle === item.title
                return (
                  <Box
                    key={item.domId}
                    sx={{
                      px: 2,
                      py: 1,
                      fontSize: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '2px',
                      borderTop: idx > 0 ? '1px solid' : 'none',
                      borderColor: 'border.muted',
                      opacity: unchanged ? 0.55 : 1,
                    }}
                  >
                    <Text
                      sx={{
                        color: 'fg.muted',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.title}
                    </Text>
                    <Text
                      sx={{
                        color: unchanged ? 'fg.muted' : 'fg.default',
                        fontWeight: unchanged ? 'normal' : 'semibold',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      → {newTitle}
                    </Text>
                  </Box>
                )
              })}
            </Box>
            {hiddenCount > 0 && (
              <Box
                as="button"
                type="button"
                onClick={() => setShowAll((v) => !v)}
                sx={{
                  width: '100%',
                  px: 2,
                  py: 1,
                  fontSize: 0,
                  textAlign: 'center',
                  border: 'none',
                  borderTop: '1px solid',
                  borderColor: 'border.muted',
                  bg: 'canvas.subtle',
                  color: 'accent.fg',
                  cursor: 'pointer',
                }}
                data-testid="rgp-rename-preview-expander"
              >
                {showAll ? 'Show fewer' : `Show ${hiddenCount} more`}
              </Box>
            )}
          </Box>
        )}
      </Box>
    </BulkFlyout>
  )
}

interface ReplaceProps {
  rule: RuleState
  onChange: React.Dispatch<React.SetStateAction<RuleState>>
  regexError: string | null
}

function ReplaceTab({ rule, onChange, regexError }: ReplaceProps) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Text as="label" sx={{ fontSize: 0, fontWeight: 'semibold', color: 'fg.muted' }}>
          Find
        </Text>
        <TextInput
          value={rule.findText}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            onChange((p) => ({ ...p, findText: e.target.value }))
          }
          aria-label="Find"
          placeholder="Text to find…"
          sx={inputSx}
          data-testid="rgp-rename-find"
        />
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Text as="label" sx={{ fontSize: 0, fontWeight: 'semibold', color: 'fg.muted' }}>
          Replace with
        </Text>
        <TextInput
          value={rule.replaceText}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            onChange((p) => ({ ...p, replaceText: e.target.value }))
          }
          aria-label="Replace with"
          placeholder="Replacement text…"
          sx={inputSx}
          data-testid="rgp-rename-replace"
        />
      </Box>
      <Box sx={{ display: 'flex', gap: 3, alignItems: 'center' }}>
        <Box as="label" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, fontSize: 0 }}>
          <Checkbox
            checked={rule.useRegex}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              onChange((p) => ({ ...p, useRegex: e.target.checked }))
            }
            aria-label="Use regex"
            data-testid="rgp-rename-regex"
          />
          Use regex
        </Box>
        <Box as="label" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, fontSize: 0 }}>
          <Checkbox
            checked={rule.caseSensitive}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              onChange((p) => ({ ...p, caseSensitive: e.target.checked }))
            }
            aria-label="Case sensitive"
          />
          Case sensitive
        </Box>
      </Box>
      {regexError && (
        <Flash variant="danger" data-testid="rgp-rename-regex-error">
          {regexError}
        </Flash>
      )}
    </Box>
  )
}

interface SingleInputProps {
  label: string
  helper: string
  value: string
  onChange: (next: string) => void
  testid: string
}

function SingleInputTab({ label, helper, value, onChange, testid }: SingleInputProps) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Text as="label" sx={{ fontSize: 0, fontWeight: 'semibold', color: 'fg.muted' }}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        aria-label={label}
        placeholder={helper}
        sx={inputSx}
        data-testid={testid}
      />
      <Text sx={{ fontSize: 0, color: 'fg.muted' }}>{helper}</Text>
    </Box>
  )
}

interface TemplateProps {
  rule: RuleState
  onChange: React.Dispatch<React.SetStateAction<RuleState>>
  inputRef: React.MutableRefObject<HTMLInputElement | null>
  onInsertToken: (token: string) => void
}

function TemplateTab({ rule, onChange, inputRef, onInsertToken }: TemplateProps) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Text as="label" sx={{ fontSize: 0, fontWeight: 'semibold', color: 'fg.muted' }}>
          Template
        </Text>
        <TextInput
          ref={inputRef as React.RefObject<HTMLInputElement>}
          value={rule.template}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            onChange((p) => ({ ...p, template: e.target.value }))
          }
          aria-label="Template"
          placeholder="e.g. [{date}] {title}"
          sx={inputSx}
          data-testid="rgp-rename-template"
        />
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {TEMPLATE_TOKENS.map((token) => (
          <Box
            as="button"
            key={token}
            type="button"
            onClick={() => onInsertToken(token)}
            sx={{
              fontFamily: 'mono',
              fontSize: 0,
              px: 2,
              py: '2px',
              borderRadius: 1,
              border: '1px solid',
              borderColor: 'border.default',
              bg: 'canvas.subtle',
              color: 'fg.default',
              cursor: 'pointer',
              ':hover': { bg: 'canvas.inset' },
            }}
            data-testid={`rgp-rename-token-${token}`}
          >
            {token}
          </Box>
        ))}
      </Box>
      <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
        Tokens: <code>{'{n}'}</code> row index · <code>{'{title}'}</code> original ·{' '}
        <code>{'{number}'}</code> issue # · <code>{'{date}'}</code> today (YYYY-MM-DD).
      </Text>
    </Box>
  )
}

interface NumberTabProps {
  rule: RuleState
  onChange: React.Dispatch<React.SetStateAction<RuleState>>
}

function NumberTab({ rule, onChange }: NumberTabProps) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <RadioGroup
        name="rgp-rename-number-style"
        onChange={(value) => {
          if (value) onChange((p) => ({ ...p, numberStyle: value as NumberStyle }))
        }}
        sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}
      >
        <RadioGroup.Label sx={{ fontSize: 0, fontWeight: 'semibold', color: 'fg.muted' }}>
          Numbering style
        </RadioGroup.Label>
        <Box sx={{ display: 'flex', gap: 3 }}>
          {(
            [
              ['paren', '(1)'],
              ['space', ' 1'],
              ['bracket', '[1]'],
            ] as Array<[NumberStyle, string]>
          ).map(([value, label]) => (
            <Box key={value} sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
              <Radio
                value={value}
                checked={rule.numberStyle === value}
                onChange={() => onChange((p) => ({ ...p, numberStyle: value }))}
              />
              <Text sx={{ fontFamily: 'mono', fontSize: 0 }}>{label}</Text>
            </Box>
          ))}
        </Box>
      </RadioGroup>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Text as="label" sx={{ fontSize: 0, fontWeight: 'semibold', color: 'fg.muted' }}>
          Start at
        </Text>
        <TextInput
          type="number"
          value={String(rule.numberStart)}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            onChange((p) => ({ ...p, numberStart: Number(e.target.value) || 1 }))
          }
          aria-label="Number start"
          sx={inputSx}
          data-testid="rgp-rename-number-start"
        />
      </Box>
    </Box>
  )
}
