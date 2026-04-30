// dropdown menu rendered inside the persistent bulk-actions bar.

import React from 'react'
import { ActionList, Box } from '@primer/react'
import { isMac } from '@/lib/keyboard'
import { exportSelectedToCSV } from '@/features/bulk-utils'
import { shortcut } from '@/features/bulk-actions-utils'
import {
  ArrowRightIcon,
  CircleSlashIcon,
  CopyIcon,
  DownloadIcon,
  ListCheckIcon,
  LockIcon,
  MoveIcon,
  PencilIcon,
  PersonIcon,
  PinIcon,
  SyncIcon,
  TrashIcon,
  UnpinIcon,
} from '@/ui/icons'

interface Props {
  count: number
  onEditFields: () => void
  onRandomAssign: () => void
  onDeepDuplicate: () => void
  onRename: () => void
  onReorder: () => void
  onClose: () => void
  onOpen: () => void
  onLock: () => void
  onPin: () => void
  onUnpin: () => void
  onTransfer: () => void
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
  onEditFields,
  onRandomAssign,
  onDeepDuplicate,
  onRename,
  onReorder,
  onClose,
  onOpen,
  onLock,
  onPin,
  onUnpin,
  onTransfer,
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
    >
      <ActionList>
        <ActionList.Group>
          <ActionList.GroupHeading as="h3">Fields</ActionList.GroupHeading>
          <ActionList.Item onSelect={onEditFields}>
            <ActionList.LeadingVisual>
              <Box sx={badgeSx('accent.subtle', 'accent.fg')}>
                <ListCheckIcon size={13} />
              </Box>
            </ActionList.LeadingVisual>
            Edit Fields
            <ActionList.TrailingVisual>
              <Kbd text={shortcut('E')} />
            </ActionList.TrailingVisual>
          </ActionList.Item>
          <ActionList.Item onSelect={onRandomAssign}>
            <ActionList.LeadingVisual>
              <Box sx={badgeSx('accent.subtle', 'accent.fg')}>
                <PersonIcon size={13} />
              </Box>
            </ActionList.LeadingVisual>
            Random Assign (beta)
            <ActionList.TrailingVisual>
              <Kbd text={shortcut('A')} />
            </ActionList.TrailingVisual>
          </ActionList.Item>
          {count === 1 && (
            <ActionList.Item onSelect={onDeepDuplicate}>
              <ActionList.LeadingVisual>
                <Box sx={badgeSx('done.subtle', 'done.fg')}>
                  <CopyIcon size={13} />
                </Box>
              </ActionList.LeadingVisual>
              Deep Duplicate
              <ActionList.TrailingVisual>
                <Kbd text={shortcut('D')} />
              </ActionList.TrailingVisual>
            </ActionList.Item>
          )}
        </ActionList.Group>
        <ActionList.Group>
          <ActionList.GroupHeading as="h3">Content</ActionList.GroupHeading>
          <ActionList.Item onSelect={onRename}>
            <ActionList.LeadingVisual>
              <Box sx={badgeSx('accent.subtle', 'accent.fg')}>
                <PencilIcon size={13} />
              </Box>
            </ActionList.LeadingVisual>
            Rename Titles
            <ActionList.TrailingVisual>
              <Kbd text={shortcut('R')} />
            </ActionList.TrailingVisual>
          </ActionList.Item>
          <ActionList.Item onSelect={onReorder}>
            <ActionList.LeadingVisual>
              <Box sx={badgeSx('accent.subtle', 'accent.fg')}>
                <MoveIcon size={13} />
              </Box>
            </ActionList.LeadingVisual>
            Reorder Items
            <ActionList.TrailingVisual>
              <Kbd text={shortcut('J')} />
            </ActionList.TrailingVisual>
          </ActionList.Item>
        </ActionList.Group>
        <ActionList.Group>
          <ActionList.GroupHeading as="h3">Status</ActionList.GroupHeading>
          <ActionList.Item onSelect={onClose}>
            <ActionList.LeadingVisual>
              <Box sx={badgeSx('attention.subtle', 'attention.fg')}>
                <CircleSlashIcon size={13} />
              </Box>
            </ActionList.LeadingVisual>
            Close Issues
            <ActionList.TrailingVisual>
              <Kbd text={shortcut('X')} />
            </ActionList.TrailingVisual>
          </ActionList.Item>
          <ActionList.Item onSelect={onOpen}>
            <ActionList.LeadingVisual>
              <Box sx={badgeSx('success.subtle', 'success.fg')}>
                <SyncIcon size={13} />
              </Box>
            </ActionList.LeadingVisual>
            Reopen Issues
            <ActionList.TrailingVisual>
              <Kbd text={shortcut('O')} />
            </ActionList.TrailingVisual>
          </ActionList.Item>
          <ActionList.Item onSelect={onLock}>
            <ActionList.LeadingVisual>
              <Box sx={badgeSx('attention.subtle', 'attention.fg')}>
                <LockIcon size={13} />
              </Box>
            </ActionList.LeadingVisual>
            Lock Conversations
            <ActionList.TrailingVisual>
              <Kbd text={shortcut('L')} />
            </ActionList.TrailingVisual>
          </ActionList.Item>
        </ActionList.Group>
        <ActionList.Group>
          <ActionList.GroupHeading as="h3">Visibility</ActionList.GroupHeading>
          <ActionList.Item onSelect={onPin}>
            <ActionList.LeadingVisual>
              <Box sx={badgeSx('accent.subtle', 'accent.fg')}>
                <PinIcon size={13} />
              </Box>
            </ActionList.LeadingVisual>
            Pin Issues
            <ActionList.TrailingVisual>
              <Kbd text={shortcut('F')} />
            </ActionList.TrailingVisual>
          </ActionList.Item>
          <ActionList.Item onSelect={onUnpin}>
            <ActionList.LeadingVisual>
              <Box sx={badgeSx('accent.subtle', 'accent.fg')}>
                <UnpinIcon size={13} />
              </Box>
            </ActionList.LeadingVisual>
            Unpin
          </ActionList.Item>
        </ActionList.Group>
        <ActionList.Group>
          <ActionList.GroupHeading as="h3">Move</ActionList.GroupHeading>
          <ActionList.Item onSelect={onTransfer}>
            <ActionList.LeadingVisual>
              <Box sx={badgeSx('done.subtle', 'done.fg')}>
                <ArrowRightIcon size={13} />
              </Box>
            </ActionList.LeadingVisual>
            Transfer Issues
            <ActionList.TrailingVisual>
              <Kbd text={shortcut('M')} />
            </ActionList.TrailingVisual>
          </ActionList.Item>
        </ActionList.Group>
        <ActionList.Divider />
        <ActionList.Item onSelect={() => exportSelectedToCSV()}>
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
        <ActionList.Item variant="danger" onSelect={onDelete}>
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
            <Kbd text={isMac ? '⌘⇧⌫' : '⌃⇧⌫'} />
          </ActionList.TrailingVisual>
        </ActionList.Item>
      </ActionList>
    </Box>
  )
}
