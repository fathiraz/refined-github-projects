import React from 'react'
import { Box, Button, Heading, Text } from '@primer/react'
import { XIcon, StepIndicator } from './primitives'

type ModalStepHeaderProps =
  | {
      title: string
      onClose: () => void
      icon?: React.ReactNode
      subtitle?: string
      onBack?: () => void
      step?: undefined
      totalSteps?: undefined
    }
  | {
      title: string
      onClose: () => void
      icon?: React.ReactNode
      subtitle?: string
      onBack?: () => void
      step: number
      totalSteps: number
    }

export function ModalStepHeader({ title, onClose, icon, step, totalSteps, subtitle, onBack }: ModalStepHeaderProps) {
  return (
    <Box sx={{
      display: 'flex', alignItems: 'flex-start', gap: 3,
      px: 4, py: 3, borderBottom: '1px solid', borderColor: 'border.default', flexShrink: 0,
    }}>
      {onBack && (
        <Button
          variant="default"
          size="small"
          onClick={onBack}
          sx={{ mt: '2px', boxShadow: 'none', px: 2, flexShrink: 0 }}
        >
          ←
        </Button>
      )}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {icon && (
            <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0, color: 'fg.muted' }}>
              {icon}
            </Box>
          )}
          <Heading as="h2" sx={{ m: 0, fontSize: 3, fontWeight: 'bold' }}>{title}</Heading>
        </Box>
        {subtitle && (
          <Text as="p" sx={{ m: 0, mt: 1, fontSize: 1, color: 'fg.muted' }}>{subtitle}</Text>
        )}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0, mt: '2px' }}>
        {step !== undefined && totalSteps !== undefined && (
          <>
            <StepIndicator current={step} total={totalSteps} />
            <Text sx={{ fontSize: 0, color: 'fg.muted' }}>Step {step} of {totalSteps}</Text>
          </>
        )}
        <Button
          variant="invisible"
          size="small"
          onClick={onClose}
          aria-label="Close"
          sx={{ p: '4px', minWidth: 'unset', color: 'fg.muted', boxShadow: 'none' }}
        >
          <XIcon size={16} />
        </Button>
      </Box>
    </Box>
  )
}
