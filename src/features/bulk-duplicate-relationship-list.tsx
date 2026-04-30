// editable issue list for relationship rows in the bulk-duplicate values step.

import React from 'react'
import Tippy from '@/ui/tooltip'
import { Box, Button, Text } from '@primer/react'
import { XIcon } from '@/ui/icons'
import { Z_TOOLTIP } from '@/lib/z-index'
import type { IssueRelationshipData } from '@/lib/messages'
import { formatIssueReference, relationshipKey } from '@/lib/relationship-utils'
import {
  buttonMotionSx,
  duplicateValueTooltip,
  prefixLabelIcon,
} from '@/features/bulk-duplicate-utils'

export function RelationshipListEditor({
  label,
  icon,
  description,
  issues,
  onRemoveIssue,
  tooltipLabel,
}: {
  label: string
  icon: React.ReactNode
  description: string
  issues: IssueRelationshipData[]
  onRemoveIssue: (issue: IssueRelationshipData) => void
  tooltipLabel: string
}) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, width: '100%' }}>
      <Tippy
        content={duplicateValueTooltip(tooltipLabel)}
        delay={[400, 0]}
        placement="top"
        zIndex={Z_TOOLTIP}
      >
        <Text
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 2,
            fontSize: 1,
            fontWeight: 'bold',
            color: 'fg.default',
            width: 'fit-content',
            cursor: 'help',
          }}
        >
          <Box as="span" sx={prefixLabelIcon}>
            {icon}
          </Box>
          {label}
        </Text>
      </Tippy>
      <Text sx={{ fontSize: 0, color: 'fg.muted' }}>{description}</Text>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {issues.map((issue) => (
          <Box
            key={relationshipKey(issue)}
            sx={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 3,
              px: 3,
              py: 2,
              border: '1px solid',
              borderColor: 'border.default',
              borderRadius: 2,
              bg: 'canvas.default',
            }}
          >
            <Box
              sx={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, flex: 1 }}
            >
              <Text sx={{ fontSize: 1, fontWeight: 'bold', color: 'fg.default' }}>
                {issue.title}
              </Text>
              <Text sx={{ fontSize: 0, color: 'fg.muted' }}>{formatIssueReference(issue)}</Text>
            </Box>
            <Button
              variant="invisible"
              size="small"
              aria-label={`Remove ${formatIssueReference(issue)} from ${label}`}
              onClick={() => onRemoveIssue(issue)}
              sx={{ p: '4px', minWidth: 'unset', color: 'fg.muted', ...buttonMotionSx }}
            >
              <XIcon size={14} />
            </Button>
          </Box>
        ))}
      </Box>
    </Box>
  )
}
