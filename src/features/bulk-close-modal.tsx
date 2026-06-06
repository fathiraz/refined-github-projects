import React, { useEffect } from 'react'
import Tippy from '@/ui/tooltip'
import { CheckCircleFillIcon, CircleIcon } from '@primer/octicons-react'
import { Box, Button, Text } from '@primer/react'
import { IssueClosedIcon } from '@/ui/icons'
import { ModalStepHeader } from '@/ui/modal-step-header'
import { ModalShell } from '@/ui/modal-shell'
import { primerCss } from '@/lib/primer-css-helper'
import { ensureTippyCss } from '@/lib/tippy-utils'
import { Z_TOOLTIP } from '@/lib/z-index'

interface Props {
  count: number
  closeReason: 'COMPLETED' | 'NOT_PLANNED'
  onChangeReason: (r: 'COMPLETED' | 'NOT_PLANNED') => void
  onClose: () => void
  onConfirm: () => void
}

const REASONS = [
  { id: 'COMPLETED' as const, label: 'Close as Completed', sublabel: 'Issues are resolved' },
  { id: 'NOT_PLANNED' as const, label: 'Close as Not Planned', sublabel: "Won't be addressed" },
]

export function BulkCloseModal({ count, closeReason, onChangeReason, onClose, onConfirm }: Props) {
  useEffect(() => {
    ensureTippyCss()
  }, [])

  return (
    <ModalShell
      ariaLabel="Close Issues"
      onClose={onClose}
      panelTestId="rgp-bulk-close-modal"
      header={
        <ModalStepHeader
          title="Close Issues"
          icon={<IssueClosedIcon size={16} />}
          onClose={onClose}
        />
      }
      footer={
        <>
          <Button
            variant="default"
            onClick={onClose}
            sx={primerCss.buttonMotion()}
            data-testid="rgp-bulk-close-cancel"
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={onConfirm}
            sx={primerCss.buttonMotion()}
            data-testid="rgp-bulk-close-confirm"
          >
            Close Issue{count !== 1 ? 's' : ''} →
          </Button>
        </>
      }
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Text as="p" sx={{ m: 0, mb: 1, fontSize: 1, color: 'fg.muted' }}>
          Choose how to close {count} issue{count !== 1 ? 's' : ''}:
        </Text>
        {REASONS.map(({ id, label, sublabel }) => {
          const isSelected = closeReason === id
          const SelectionIcon = isSelected ? CheckCircleFillIcon : CircleIcon
          return (
            <Tippy
              key={id}
              content={`Choose "${label}" as the close reason.`}
              delay={[400, 0]}
              placement="top"
              zIndex={Z_TOOLTIP}
            >
              <Box
                as="button"
                type="button"
                aria-pressed={isSelected}
                onClick={() => onChangeReason(id)}
                data-testid={`rgp-bulk-close-reason-${id.toLowerCase()}`}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 3,
                  width: '100%',
                  p: 3,
                  border: '1px solid',
                  borderColor: isSelected ? 'accent.emphasis' : 'border.default',
                  borderRadius: 2,
                  bg: isSelected ? 'accent.subtle' : 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  boxShadow: 'none',
                  transition: 'all 150ms ease',
                  '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
                }}
              >
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    color: isSelected ? 'accent.fg' : 'fg.muted',
                  }}
                >
                  <SelectionIcon size={16} fill="currentColor" />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Text
                    sx={{
                      fontSize: 1,
                      fontWeight: 'bold',
                      color: 'fg.default',
                      display: 'block',
                    }}
                  >
                    {label}
                  </Text>
                  <Text sx={{ fontSize: 0, color: 'fg.muted', display: 'block', mt: '2px' }}>
                    {sublabel}
                  </Text>
                </Box>
              </Box>
            </Tippy>
          )
        })}
      </Box>
    </ModalShell>
  )
}
