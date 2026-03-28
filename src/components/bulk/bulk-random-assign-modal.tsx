import React, { useState, useEffect } from 'react'
import { Box, Button, Text, Select } from '@primer/react'
import { ModalStepHeader } from '../ui/modal-step-header'
import { PersonIcon } from '../ui/primitives'
import { Z_MODAL } from '../../lib/z-index'
import {
  distributeBalanced,
  distributeRandom,
  distributeRoundRobin,
  type DistributionStrategy
} from './bulk-random-assign-utils'

type RandomAssignStep = 'ASSIGNEES' | 'PREVIEW' | 'CONFIRM'

interface Props {
  count: number
  projectId: string
  owner: string
  itemIds: string[]
  onClose: () => void
}

export function BulkRandomAssignModal({ count, onClose, itemIds }: Props) {
  const [step, setStep] = useState<RandomAssignStep>('ASSIGNEES')
  const [strategy, setStrategy] = useState<DistributionStrategy>('balanced')
  const [preview, setPreview] = useState<Map<string, string[]>>(new Map())
  const [selectedAssignees] = useState<string[]>(['Alice', 'Bob'])

  const generatePreview = () => {
    const distributionFn =
      strategy === 'balanced'
        ? distributeBalanced
        : strategy === 'random'
        ? distributeRandom
        : distributeRoundRobin
    const result = distributionFn(itemIds, selectedAssignees)
    setPreview(result)
  }

  useEffect(() => {
    if (step === 'PREVIEW') {
      generatePreview()
    }
  }, [step, strategy])

  const handleNext = () => {
    if (step === 'ASSIGNEES') setStep('PREVIEW')
    else if (step === 'PREVIEW') setStep('CONFIRM')
  }

  const handleBack = () => {
    if (step === 'PREVIEW') setStep('ASSIGNEES')
    else if (step === 'CONFIRM') setStep('PREVIEW')
  }

  const renderStep = () => {
    switch (step) {
      case 'ASSIGNEES':
        return (
          <Box sx={{ p: 4 }}>
            <Text>Step 1: Select Assignees</Text>
            {/* Assignee selection will go here in Wave 2 */}
          </Box>
        )
      case 'PREVIEW':
        return (
          <Box sx={{ p: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Text sx={{ fontWeight: 'bold' }}>Strategy:</Text>
                <Select
                  value={strategy}
                  onChange={(e) => setStrategy(e.target.value as DistributionStrategy)}
                >
                  <Select.Option value="balanced">Balanced</Select.Option>
                  <Select.Option value="random">Random</Select.Option>
                  <Select.Option value="round-robin">Round Robin</Select.Option>
                </Select>
              </Box>
              <Button onClick={generatePreview}>Reshuffle</Button>
            </Box>

            <Box sx={{ p: 3, bg: 'canvas.subtle', borderRadius: 2, border: '1px solid', borderColor: 'border.default' }}>
              <Text sx={{ fontWeight: 'bold', display: 'block', mb: 2 }}>Distribution Summary</Text>
              <Text>
                {Array.from(preview.entries())
                  .map(([assignee, items]) => `${assignee}: ${items.length} items`)
                  .join(' | ')}
              </Text>
            </Box>

            <Box sx={{ border: '1px solid', borderColor: 'border.default', borderRadius: 2, overflow: 'hidden' }}>
              {Array.from(preview.entries()).map(([assignee, items], index) => (
                <Box
                  key={assignee}
                  sx={{
                    p: 3,
                    borderTop: index > 0 ? '1px solid' : 'none',
                    borderColor: 'border.default',
                    display: 'flex',
                    justifyContent: 'space-between'
                  }}
                >
                  <Text sx={{ fontWeight: 'bold' }}>{assignee}</Text>
                  <Text color="fg.muted">{items.length} items</Text>
                </Box>
              ))}
            </Box>
          </Box>
        )
      case 'CONFIRM':
        return (
          <Box sx={{ p: 4 }}>
            <Text>Step 3: Confirm & Apply</Text>
            {/* Confirmation summary will go here in Wave 2 */}
          </Box>
        )
    }
  }

  const getStepInfo = () => {
    switch (step) {
      case 'ASSIGNEES':
        return { title: 'Select Assignees', step: 1, subtitle: `Choose users to randomly assign to ${count} items.` }
      case 'PREVIEW':
        return { title: 'Preview Assignments', step: 2, subtitle: 'Review the random distribution before applying.' }
      case 'CONFIRM':
        return { title: 'Confirm & Apply', step: 3, subtitle: 'Finalize and execute the bulk assignment.' }
    }
  }

  const { title, step: stepNum, subtitle } = getStepInfo()

  return (
    <Box
      sx={{
        position: 'fixed',
        inset: 0,
        bg: 'rgba(27,31,36,0.5)',
        zIndex: Z_MODAL,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onKeyDown={(e: React.KeyboardEvent) => {
        e.stopPropagation()
        if (e.key === 'Escape') onClose()
      }}
      onKeyUp={(e: React.KeyboardEvent) => e.stopPropagation()}
    >
      <Box
        sx={{
          bg: 'canvas.overlay',
          border: '1px solid',
          borderColor: 'border.default',
          borderRadius: 2,
          width: 'min(640px, 92vw)',
          maxHeight: '82vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: 'none',
          animation: 'fadeSlideIn 200ms cubic-bezier(0.4, 0, 0.2, 1)',
          '@keyframes fadeSlideIn': {
            from: { opacity: 0, transform: 'translateY(-8px)' },
            to: { opacity: 1, transform: 'translateY(0)' },
          },
          '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
        }}
      >
        <ModalStepHeader
          title={title}
          subtitle={subtitle}
          icon={<PersonIcon size={16} />}
          step={stepNum}
          totalSteps={3}
          onClose={onClose}
          onBack={step !== 'ASSIGNEES' ? handleBack : undefined}
        />

        <Box sx={{ flex: 1, overflowY: 'auto' }}>
          {renderStep()}
        </Box>

        <Box
          sx={{
            p: 3,
            px: 4,
            borderTop: '1px solid',
            borderColor: 'border.default',
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <Button
            variant="default"
            onClick={step === 'ASSIGNEES' ? onClose : handleBack}
            sx={{
              boxShadow: 'none',
              transition: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
              '&:hover:not(:disabled)': { transform: 'translateY(-1px)' },
              '&:active': { transform: 'translateY(0)', transition: '100ms' },
              '@media (prefers-reduced-motion: reduce)': {
                transition: 'none',
                '&:hover:not(:disabled)': { transform: 'none' },
              },
            }}
          >
            {step === 'ASSIGNEES' ? 'Cancel' : 'Back'}
          </Button>
          <Button
            variant="primary"
            onClick={step === 'CONFIRM' ? () => {} : handleNext}
            sx={{
              boxShadow: 'none',
              transition: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
              '&:hover:not(:disabled)': { transform: 'translateY(-1px)' },
              '&:active': { transform: 'translateY(0)', transition: '100ms' },
              '@media (prefers-reduced-motion: reduce)': {
                transition: 'none',
                '&:hover:not(:disabled)': { transform: 'none' },
              },
            }}
          >
            {step === 'CONFIRM' ? `Apply to ${count} Items` : 'Next'}
          </Button>
        </Box>
      </Box>
    </Box>
  )
}
