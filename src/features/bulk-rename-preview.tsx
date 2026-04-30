// preview table for bulk-rename modal — original vs. new title side-by-side.

import React from 'react'
import { Box } from '@primer/react'
import { ArrowRightIcon } from '@/ui/icons'
import type { TitleItem } from '@/features/bulk-rename-utils'

export function PreviewTable({ items }: { items: Array<TitleItem & { newTitle: string }> }) {
  return (
    <Box as="table" sx={{ width: '100%', borderCollapse: 'collapse', fontSize: 0 }}>
      <Box as="thead" sx={{ bg: 'canvas.subtle', position: 'sticky', top: 0 }}>
        <Box as="tr">
          <Box
            as="th"
            sx={{
              px: 2,
              py: 1,
              textAlign: 'left',
              fontWeight: 'semibold',
              color: 'fg.muted',
              width: 32,
              borderBottom: '1px solid',
              borderColor: 'border.default',
            }}
          >
            #
          </Box>
          <Box
            as="th"
            sx={{
              px: 2,
              py: 1,
              textAlign: 'left',
              fontWeight: 'semibold',
              color: 'fg.muted',
              borderBottom: '1px solid',
              borderColor: 'border.default',
            }}
          >
            Original Title
          </Box>
          <Box
            as="th"
            aria-label="Rename direction"
            sx={{
              px: 2,
              py: 1,
              textAlign: 'center',
              fontWeight: 'semibold',
              color: 'fg.muted',
              width: 24,
              borderBottom: '1px solid',
              borderColor: 'border.default',
            }}
          >
            <ArrowRightIcon size={14} />
          </Box>
          <Box
            as="th"
            sx={{
              px: 2,
              py: 1,
              textAlign: 'left',
              fontWeight: 'semibold',
              color: 'fg.muted',
              borderBottom: '1px solid',
              borderColor: 'border.default',
            }}
          >
            New Title
          </Box>
        </Box>
      </Box>
      <Box as="tbody">
        {items.map((item, i) => {
          const unchanged = item.newTitle === item.title
          return (
            <Box as="tr" key={item.domId} sx={{ opacity: unchanged ? 0.5 : 1 }}>
              <Box
                as="td"
                sx={{
                  px: 2,
                  py: 1,
                  color: 'fg.muted',
                  borderBottom: '1px solid',
                  borderColor: 'border.muted',
                }}
              >
                {i + 1}
              </Box>
              <Box
                as="td"
                sx={{
                  px: 2,
                  py: 1,
                  color: unchanged ? 'fg.muted' : 'fg.default',
                  borderBottom: '1px solid',
                  borderColor: 'border.muted',
                  maxWidth: 200,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {item.title}
              </Box>
              <Box
                as="td"
                sx={{
                  px: 2,
                  py: 1,
                  color: 'fg.muted',
                  textAlign: 'center',
                  borderBottom: '1px solid',
                  borderColor: 'border.muted',
                }}
              >
                <ArrowRightIcon size={14} />
              </Box>
              <Box
                as="td"
                sx={{
                  px: 2,
                  py: 1,
                  color: unchanged ? 'fg.muted' : 'fg.default',
                  fontWeight: unchanged ? 'normal' : 'semibold',
                  borderBottom: '1px solid',
                  borderColor: 'border.muted',
                  maxWidth: 200,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {item.newTitle}
              </Box>
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}
