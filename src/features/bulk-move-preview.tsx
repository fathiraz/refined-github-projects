// preview list of moved/non-moved items used in the bulk-move modal.

import React from 'react'
import { ArrowUpIcon } from '@primer/octicons-react'
import { Box, Text } from '@primer/react'
import type { OrderedItem } from '@/features/bulk-move-utils'

export function PreviewList({
  items,
  selectedMemexIds,
}: {
  items: OrderedItem[]
  selectedMemexIds: Set<number>
}) {
  return (
    <Box
      as="ol"
      sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 0 }}
    >
      {items.map((item, i) => {
        const isSel = selectedMemexIds.has(item.memexItemId)
        return (
          <Box
            as="li"
            key={item.memexItemId}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              px: 2,
              py: '5px',
              borderRadius: 1,
              bg: isSel ? 'accent.subtle' : 'transparent',
              borderBottom: '1px solid',
              borderColor: 'border.muted',
            }}
          >
            <Text
              sx={{
                fontSize: 0,
                color: 'fg.muted',
                minWidth: 20,
                textAlign: 'right',
                flexShrink: 0,
              }}
            >
              {i + 1}
            </Text>
            <Text
              sx={{
                fontSize: 0,
                color: isSel ? 'accent.fg' : 'fg.default',
                fontWeight: isSel ? 'semibold' : 'normal',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {item.title || '(no title)'}
            </Text>
            {isSel && (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  color: 'accent.fg',
                  flexShrink: 0,
                  ml: 'auto',
                }}
              >
                <ArrowUpIcon size={12} />
                <Text sx={{ fontSize: 0, color: 'accent.fg', fontWeight: 'semibold' }}>moving</Text>
              </Box>
            )}
          </Box>
        )
      })}
    </Box>
  )
}
