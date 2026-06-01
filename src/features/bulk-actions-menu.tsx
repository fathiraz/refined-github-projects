// Overflow `…` menu rendered next to the inline chips on the bulk-actions
// bar. Hosts the non-Mark / non-Edit verbs in the order specified by
// bulk-actions-bar §3.4: Rename · Reorder · Random Assign · Transfer ·
// Deep Duplicate (count===1) · Export CSV · Delete.

import React from 'react'
import { ActionList, Box } from '@primer/react'
import { exportSelectedToCSV } from '@/features/bulk-utils'
import { shortcut } from '@/features/bulk-actions-utils'
import {
  ArrowRightIcon,
  CopyIcon,
  DownloadIcon,
  MoveIcon,
  PencilIcon,
  PersonIcon,
  TrashIcon,
} from '@/ui/icons'

interface Props {
  count: number
  onRename: () => void
  onReorder: () => void
  onRandomAssign: () => void
  onTransfer: () => void
  onDeepDuplicate: () => void
  onDelete: () => void
}

const kbdSx = {
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

function badgeSx(bg: string, color: string) {
  return {
    width: 22,
    height: 22,
    borderRadius: 2,
    bg,
    color,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  } as const
}

function Kbd({ text }: { text: string }) {
  return (
    <Box as="kbd" sx={kbdSx}>
      {text}
    </Box>
  )
}

export function BulkActionsMenu({
  count,
  onRename,
  onReorder,
  onRandomAssign,
  onTransfer,
  onDeepDuplicate,
  onDelete,
}: Props) {
  return (
    <Box
      sx={{
        position: 'absolute',
        bottom: 'calc(100% + 6px)',
        right: 0,
        width: 256,
        zIndex: 100,
        bg: 'canvas.overlay',
        border: '1px solid',
        borderColor: 'border.default',
        borderRadius: 2,
        overflow: 'hidden',
      }}
      data-testid="rgp-bulk-overflow-menu"
    >
      <ActionList>
        <ActionList.Item onSelect={onRename} data-testid="rgp-overflow-rename">
          <ActionList.LeadingVisual>
            <Box sx={badgeSx('accent.subtle', 'accent.fg')}>
              <PencilIcon size={13} />
            </Box>
          </ActionList.LeadingVisual>
          Rename titles
          <ActionList.TrailingVisual>
            <Kbd text="R" />
          </ActionList.TrailingVisual>
        </ActionList.Item>
        <ActionList.Item onSelect={onReorder} data-testid="rgp-overflow-reorder">
          <ActionList.LeadingVisual>
            <Box sx={badgeSx('accent.subtle', 'accent.fg')}>
              <MoveIcon size={13} />
            </Box>
          </ActionList.LeadingVisual>
          Reorder items
          <ActionList.TrailingVisual>
            <Kbd text="O" />
          </ActionList.TrailingVisual>
        </ActionList.Item>
        <ActionList.Item onSelect={onRandomAssign} data-testid="rgp-overflow-random-assign">
          <ActionList.LeadingVisual>
            <Box sx={badgeSx('accent.subtle', 'accent.fg')}>
              <PersonIcon size={13} />
            </Box>
          </ActionList.LeadingVisual>
          Random Assign (beta)
          <ActionList.TrailingVisual>
            <Kbd text="A" />
          </ActionList.TrailingVisual>
        </ActionList.Item>
        <ActionList.Item onSelect={onTransfer} data-testid="rgp-overflow-transfer">
          <ActionList.LeadingVisual>
            <Box sx={badgeSx('done.subtle', 'done.fg')}>
              <ArrowRightIcon size={13} />
            </Box>
          </ActionList.LeadingVisual>
          Transfer issues
          <ActionList.TrailingVisual>
            <Kbd text="T" />
          </ActionList.TrailingVisual>
        </ActionList.Item>
        {count === 1 && (
          <ActionList.Item onSelect={onDeepDuplicate} data-testid="rgp-overflow-duplicate">
            <ActionList.LeadingVisual>
              <Box sx={badgeSx('done.subtle', 'done.fg')}>
                <CopyIcon size={13} />
              </Box>
            </ActionList.LeadingVisual>
            Deep duplicate
            <ActionList.TrailingVisual>
              <Kbd text="D" />
            </ActionList.TrailingVisual>
          </ActionList.Item>
        )}
        <ActionList.Item
          onSelect={() => exportSelectedToCSV()}
          data-testid="rgp-overflow-export-csv"
        >
          <ActionList.LeadingVisual>
            <Box sx={badgeSx('success.subtle', 'success.fg')}>
              <DownloadIcon size={13} />
            </Box>
          </ActionList.LeadingVisual>
          Export CSV
          <ActionList.TrailingVisual>
            <Kbd text={shortcut('V')} />
          </ActionList.TrailingVisual>
        </ActionList.Item>
        <ActionList.Divider />
        <ActionList.Item variant="danger" onSelect={onDelete} data-testid="rgp-overflow-delete">
          <ActionList.LeadingVisual>
            <Box sx={badgeSx('danger.subtle', 'danger.fg')}>
              <TrashIcon size={13} />
            </Box>
          </ActionList.LeadingVisual>
          Delete
          <ActionList.TrailingVisual>
            <Box
              sx={{
                fontSize: 0,
                fontWeight: 'bold',
                px: 1,
                py: '1px',
                borderRadius: 2,
                bg: 'danger.subtle',
                color: 'danger.fg',
                mr: 1,
              }}
            >
              admin
            </Box>
            <Kbd text="D" />
          </ActionList.TrailingVisual>
        </ActionList.Item>
      </ActionList>
    </Box>
  )
}
