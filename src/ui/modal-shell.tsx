import React, { useCallback, useEffect } from 'react'
import type { BetterSystemStyleObject } from '@primer/react'
import { Box } from '@primer/react'
import { primerCss } from '@/lib/primer-css-helper'

export interface ModalShellProps {
  /** Accessible name for the dialog (aria-label). */
  ariaLabel: string
  onClose: () => void
  /** Header slot — ModalStepHeader or custom chrome. */
  header?: React.ReactNode
  /** Scrollable body content. */
  children: React.ReactNode
  /** Optional footer row (buttons). */
  footer?: React.ReactNode
  /** When false, backdrop clicks do not close. Default true. */
  closeOnBackdrop?: boolean
  /** Extra sx merged into the panel container. */
  panelSx?: BetterSystemStyleObject
  /** Optional data-testid on the panel. */
  panelTestId?: string
  /** When false, Escape does not close. Default true. */
  closeOnEscape?: boolean
}

export function ModalShell({
  ariaLabel,
  onClose,
  header,
  children,
  footer,
  closeOnBackdrop = true,
  panelSx,
  panelTestId,
  closeOnEscape = true,
}: ModalShellProps) {
  const handleRequestClose = useCallback(() => {
    onClose()
  }, [onClose])

  useEffect(() => {
    if (!closeOnEscape) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleRequestClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [closeOnEscape, handleRequestClose])

  return (
    <Box
      sx={primerCss.modalOverlay()}
      onClick={closeOnBackdrop ? handleRequestClose : undefined}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
    >
      <Box
        sx={{
          ...primerCss.modalPanel(),
          animation: 'fadeSlideIn 200ms cubic-bezier(0.4, 0, 0.2, 1)',
          '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
          ...panelSx,
        }}
        data-testid={panelTestId}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        onKeyDown={(e: React.KeyboardEvent) => {
          if (e.key !== 'Escape') e.stopPropagation()
        }}
        onKeyUp={(e: React.KeyboardEvent) => e.stopPropagation()}
      >
        {header}
        <Box sx={primerCss.contentArea()}>{children}</Box>
        {footer && (
          <Box sx={{ ...primerCss.footerBorder(), ...primerCss.footerLayout() }}>{footer}</Box>
        )}
      </Box>
    </Box>
  )
}
