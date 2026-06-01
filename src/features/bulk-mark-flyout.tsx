// Sectioned contextual flyout anchored to the `Mark ▾` chip on the
// bulk-actions bar. Renders Close/Reopen/Pin/Unpin/Lock|Unlock with counts
// derived from the selection's per-item DOM state. Rows fire immediately on
// click — there is no Apply button (Spec: bulk-verbs `Mark menu` requirement).

import React, { useMemo } from 'react'
import { ActionList, AnchoredOverlay, Box } from '@primer/react'
import {
  CircleSlashIcon,
  IssueOpenedIcon,
  LockIcon,
  PinIcon,
  UnlockIcon,
} from '@primer/octicons-react'

import { BULK_BAR_PRIMER_PORTAL_NAME } from '@/lib/primer-shadow-dom-compat'
import { Z_OVERLAY } from '@/lib/z-index'
import { getItemStateSnapshot, type ItemStateSnapshot } from '@/lib/project-table-dom'

export type MarkVerb = 'close' | 'reopen' | 'pin' | 'unpin' | 'lock' | 'unlock'

export interface BulkMarkFlyoutProps {
  anchorRef: React.RefObject<HTMLElement | null>
  open: boolean
  onClose: () => void
  /** Synchronous snapshot of selection state. Tests inject this directly; runtime falls back to scraping the DOM via `itemIds`. */
  snapshot?: ItemStateSnapshot
  /** Selected item IDs, used to read snapshot from the DOM when `snapshot` is not provided. */
  itemIds: readonly string[]
  onSelectVerb: (verb: MarkVerb) => void
}

const KBD_SX = {
  fontSize: 0,
  fontFamily: 'inherit',
  fontWeight: 500,
  px: '5px',
  py: '1px',
  borderRadius: 1,
  bg: 'canvas.inset',
  border: '1px solid',
  borderColor: 'border.default',
  color: 'fg.muted',
  cursor: 'default',
  lineHeight: 1.6,
  letterSpacing: '0.02em',
} as const

const BADGE_SX = {
  width: 22,
  height: 22,
  borderRadius: 2,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
} as const

function Kbd({ text }: { text: string }) {
  return (
    <Box as="kbd" sx={KBD_SX}>
      {text}
    </Box>
  )
}

export function BulkMarkFlyout({
  anchorRef,
  open,
  onClose,
  snapshot,
  itemIds,
  onSelectVerb,
}: BulkMarkFlyoutProps) {
  const resolved = useMemo<ItemStateSnapshot>(
    () => snapshot ?? getItemStateSnapshot(itemIds),
    [snapshot, itemIds],
  )

  const rows = useMemo(() => buildRows(resolved), [resolved])

  return (
    <AnchoredOverlay
      open={open}
      onClose={onClose}
      anchorRef={anchorRef as React.RefObject<HTMLElement>}
      renderAnchor={null}
      align="start"
      side="outside-top"
      width="auto"
      height="auto"
      overlayProps={{
        portalContainerName: BULK_BAR_PRIMER_PORTAL_NAME,
        role: 'dialog',
        'aria-label': 'Mark',
        sx: {
          boxShadow: 'none',
          pointerEvents: 'auto',
          zIndex: Z_OVERLAY,
          animation: 'rgp-flyout-in 160ms cubic-bezier(0.4, 0, 0.2, 1)',
          '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
        },
      }}
    >
      <Box
        sx={{
          bg: 'canvas.overlay',
          border: '1px solid',
          borderColor: 'border.default',
          borderRadius: 2,
          boxShadow: 'none',
          width: 280,
          overflow: 'hidden',
        }}
        data-testid="rgp-bulk-mark-flyout"
      >
        <ActionList>
          {renderSection('Status', rows.status, onSelectVerb, onClose)}
          {renderSection('Visibility', rows.visibility, onSelectVerb, onClose)}
          {renderSection('Conversation', rows.conversation, onSelectVerb, onClose)}
        </ActionList>
      </Box>
    </AnchoredOverlay>
  )
}

interface MarkRow {
  verb: MarkVerb
  label: string
  icon: React.ReactNode
  badge: { bg: string; color: string }
  chord: string
  testid: string
}

interface MarkRowSet {
  status: MarkRow[]
  visibility: MarkRow[]
  conversation: MarkRow[]
}

export function buildRows(state: ItemStateSnapshot): MarkRowSet {
  const status: MarkRow[] = []
  const visibility: MarkRow[] = []
  const conversation: MarkRow[] = []

  // ── Status section ──
  // When state is unknown for any item, render both paired verbs without counts (D6 fallback).
  if (state.unknownCount > 0) {
    status.push({
      verb: 'close',
      label: 'Close issues',
      icon: <CircleSlashIcon size={13} />,
      badge: { bg: 'attention.subtle', color: 'attention.fg' },
      chord: 'C',
      testid: 'rgp-mark-close',
    })
    status.push({
      verb: 'reopen',
      label: 'Reopen issues',
      icon: <IssueOpenedIcon size={13} />,
      badge: { bg: 'success.subtle', color: 'success.fg' },
      chord: 'C',
      testid: 'rgp-mark-reopen',
    })
  } else {
    if (state.openCount > 0) {
      status.push({
        verb: 'close',
        label: `Close ${state.openCount} ${pluralize('open issue', state.openCount)}`,
        icon: <CircleSlashIcon size={13} />,
        badge: { bg: 'attention.subtle', color: 'attention.fg' },
        chord: 'C',
        testid: 'rgp-mark-close',
      })
    }
    if (state.closedCount > 0) {
      status.push({
        verb: 'reopen',
        label: `Reopen ${state.closedCount} ${pluralize('closed issue', state.closedCount)}`,
        icon: <IssueOpenedIcon size={13} />,
        badge: { bg: 'success.subtle', color: 'success.fg' },
        chord: 'C',
        testid: 'rgp-mark-reopen',
      })
    }
  }

  // ── Visibility section ── pin/unpin always paired (no reliable DOM state)
  visibility.push({
    verb: 'pin',
    label: 'Pin issues',
    icon: <PinIcon size={13} />,
    badge: { bg: 'accent.subtle', color: 'accent.fg' },
    chord: 'P',
    testid: 'rgp-mark-pin',
  })
  visibility.push({
    verb: 'unpin',
    label: 'Unpin issues',
    icon: <PinIcon size={13} />,
    badge: { bg: 'accent.subtle', color: 'accent.fg' },
    chord: 'P',
    testid: 'rgp-mark-unpin',
  })

  // ── Conversation section ── Lock flips to Unlock when all items provably locked
  const allLocked =
    state.lockedCount === state.total && state.lockOrPinUnknownCount === 0 && state.total > 0
  if (allLocked) {
    conversation.push({
      verb: 'unlock',
      label: 'Unlock conversations',
      icon: <UnlockIcon size={13} />,
      badge: { bg: 'attention.subtle', color: 'attention.fg' },
      chord: 'L',
      testid: 'rgp-mark-unlock',
    })
  } else {
    conversation.push({
      verb: 'lock',
      label: 'Lock conversations',
      icon: <LockIcon size={13} />,
      badge: { bg: 'attention.subtle', color: 'attention.fg' },
      chord: 'L',
      testid: 'rgp-mark-lock',
    })
  }

  return { status, visibility, conversation }
}

function pluralize(noun: string, count: number): string {
  return count === 1 ? noun : `${noun}s`
}

function renderSection(
  heading: string,
  rows: MarkRow[],
  onSelectVerb: (verb: MarkVerb) => void,
  onClose: () => void,
): React.ReactNode {
  if (rows.length === 0) return null
  return (
    <ActionList.Group key={heading}>
      <ActionList.GroupHeading as="h3">{heading}</ActionList.GroupHeading>
      {rows.map((row) => (
        <ActionList.Item
          key={row.verb}
          data-testid={row.testid}
          onSelect={() => {
            onSelectVerb(row.verb)
            onClose()
          }}
        >
          <ActionList.LeadingVisual>
            <Box sx={{ ...BADGE_SX, bg: row.badge.bg, color: row.badge.color }}>{row.icon}</Box>
          </ActionList.LeadingVisual>
          {row.label}
          <ActionList.TrailingVisual>
            <Kbd text={row.chord} />
          </ActionList.TrailingVisual>
        </ActionList.Item>
      ))}
    </ActionList.Group>
  )
}
