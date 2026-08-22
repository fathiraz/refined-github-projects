import React from 'react'
import { ActionList, Box } from '@primer/react'
import { getFieldIcon, type ProjectField } from '@/features/bulk-edit-utils'

/** Sticky group label above a list of rows. `sx` adds to the base, e.g. a borderTop. */
export function SectionHeader({
  children,
  sx,
}: {
  children: React.ReactNode
  sx?: Record<string, unknown>
}) {
  return (
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
        ...sx,
      }}
    >
      {children}
    </Box>
  )
}

interface FieldRowProps {
  field: ProjectField
  onPick: (field: ProjectField) => void
}

export function FieldRow({ field, onPick }: FieldRowProps) {
  return (
    <ActionList.Item onSelect={() => onPick(field)} data-testid={`rgp-edit-field-${field.id}`}>
      <ActionList.LeadingVisual>
        <Box sx={{ color: 'fg.muted' }}>{getFieldIcon(field.dataType)}</Box>
      </ActionList.LeadingVisual>
      {field.name}
      <ActionList.Description>
        {field.dataType.toLowerCase().replace(/_/g, ' ')}
      </ActionList.Description>
    </ActionList.Item>
  )
}
