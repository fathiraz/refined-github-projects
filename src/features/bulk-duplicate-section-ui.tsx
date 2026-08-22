// Shared building blocks for the Deep Duplicate REVIEW step.
//
// `renderValueSection` opened ten branches with the same twenty-line
// Tippy-wrapped label, and rendered single-select options and iterations with
// the same pressable chip. Both live here now, once.

import React from 'react'
import { Box, FormControl, Text } from '@primer/react'

import Tippy from '@/ui/tooltip'
import { Z_TOOLTIP } from '@/lib/z-index'
import { duplicateValueTooltip, prefixLabelIcon } from '@/features/bulk-duplicate-utils'

/** Bold section heading with its prefix icon and help tooltip. */
export function SectionLabel({
  icon,
  label,
  tooltipFor,
  as = 'text',
}: {
  icon?: React.ReactNode
  label: string
  /** Subject of the "what does copying this do" tooltip. */
  tooltipFor: string
  /** `label` renders inside a FormControl.Label; `text` stands alone. */
  as?: 'text' | 'label'
}) {
  const content = (
    <>
      {icon && (
        <Box as="span" sx={prefixLabelIcon}>
          {icon}
        </Box>
      )}
      {label}
    </>
  )

  const tooltip = duplicateValueTooltip(tooltipFor)

  if (as === 'label') {
    return (
      <FormControl.Label
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          fontWeight: 'bold',
          width: 'fit-content',
          cursor: 'help',
        }}
      >
        <Tippy content={tooltip} delay={[400, 0]} placement="top" zIndex={Z_TOOLTIP}>
          <Box as="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
            {content}
          </Box>
        </Tippy>
      </FormControl.Label>
    )
  }

  return (
    <Tippy content={tooltip} delay={[400, 0]} placement="top" zIndex={Z_TOOLTIP}>
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
        {content}
      </Text>
    </Tippy>
  )
}

/** Pressable option chip used by the single-select and iteration pickers. */
export function OptionChip({
  selected,
  tooltip,
  onSelect,
  layout = 'inline',
  children,
}: {
  selected: boolean
  tooltip: string
  onSelect: () => void
  /** `inline` for colour-dot options, `row` for full-width iterations. */
  layout?: 'inline' | 'row'
  children: React.ReactNode
}) {
  return (
    <Tippy content={tooltip} delay={[400, 0]} placement="top" zIndex={Z_TOOLTIP}>
      <Box
        as="button"
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        sx={{
          display: 'flex',
          alignItems: 'center',
          ...(layout === 'row'
            ? { justifyContent: 'space-between', px: 3, py: 2 }
            : { gap: 2, px: 3, py: 1 }),
          border: '1px solid',
          borderColor: selected ? 'accent.emphasis' : 'border.default',
          borderRadius: 2,
          bg: selected ? 'accent.subtle' : 'canvas.default',
          cursor: 'pointer',
          transition: 'all 150ms ease',
          '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
        }}
      >
        {children}
      </Box>
    </Tippy>
  )
}

/** Column wrapper shared by the non-FormControl sections. */
export const sectionColumnSx = {
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
} as const

/**
 * Shimmer fill for the LOADING skeleton. The `@keyframes` used to be declared
 * on only the first of five otherwise-identical blocks, leaving the other four
 * silently dependent on that sibling; declaring it here keeps every block
 * self-sufficient.
 */
export const shimmerSx = {
  '@keyframes rgp-shimmer': {
    '0%': { backgroundPosition: '-200px 0' },
    '100%': { backgroundPosition: '200px 0' },
  },
  background:
    'linear-gradient(90deg, var(--color-border-muted) 25%, var(--color-border-default) 50%, var(--color-border-muted) 75%)',
  backgroundSize: '400px 100%',
  animation: 'rgp-shimmer 1.4s ease infinite',
  '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
} as const
