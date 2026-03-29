import React, { useState, useEffect, useRef } from 'react'
import { Box, Button, Text, Select, TextInput, Checkbox, Avatar, Flash, Spinner } from '@primer/react'
import { ModalStepHeader } from '../ui/modal-step-header'
import { PersonIcon, SearchIcon } from '../ui/primitives'
import { Z_MODAL } from '../../lib/z-index'
import { sendMessage } from '../../lib/messages'
import {
  distributeBalanced,
  distributeRandom,
  distributeRoundRobin,
  type DistributionStrategy
} from './bulk-random-assign-utils'

type Assignee = { id: string; name: string; avatarUrl?: string }

type RandomAssignStep = 'ASSIGNEES' | 'PREVIEW' | 'CONFIRM'

interface Props {
  count: number
  projectId: string
  owner: string
  repoName: string
  itemIds: string[]
  onClose: () => void
  onConfirm?: (assignments: Map<string, string[]>, strategy: DistributionStrategy) => void
}

export function BulkRandomAssignModal({ count, onClose, itemIds, onConfirm, owner, repoName }: Props) {
  const [step, setStep] = useState<RandomAssignStep>('ASSIGNEES')
  const [strategy, setStrategy] = useState<DistributionStrategy>('balanced')
  const [preview, setPreview] = useState<Map<string, string[]>>(new Map())
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [assignees, setAssignees] = useState<Assignee[]>([])
  const [isLoadingAssignees, setIsLoadingAssignees] = useState(false)
  const latestRequestIdRef = useRef<number>(0)

  useEffect(() => {
    if (!repoName) return
    setIsLoadingAssignees(true)
    const requestId = Date.now()
    latestRequestIdRef.current = requestId
    const timer = setTimeout(() => {
      sendMessage('searchRepoMetadata', { owner, name: repoName, q: searchQuery, type: 'ASSIGNEES' })
        .then(results => {
          if (requestId === latestRequestIdRef.current) {
            setAssignees(results.map(r => ({ id: r.id, name: r.name, avatarUrl: r.avatarUrl })))
          }
        })
        .finally(() => {
          if (requestId === latestRequestIdRef.current) {
            setIsLoadingAssignees(false)
          }
        })
    }, searchQuery ? 300 : 0)
    return () => clearTimeout(timer)
  }, [owner, repoName, searchQuery])

  const toggleAssignee = (id: string) => {
    setSelectedAssignees(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const selectAll = () => setSelectedAssignees(assignees.map(a => a.id))
  const deselectAll = () => setSelectedAssignees([])

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

  const idToLogin = Object.fromEntries(assignees.map(a => [a.id, a.name]))

  const renderStep = () => {
    switch (step) {
      case 'ASSIGNEES':
        return (
          <Box sx={{ p: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <TextInput
                leadingVisual={SearchIcon}
                placeholder="Filter assignees..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                sx={{ width: '100%', maxWidth: '300px' }}
              />
              <Box sx={{ display: 'flex', gap: 2 }}>
                <Button size="small" onClick={selectAll}>Select All</Button>
                <Button size="small" onClick={deselectAll}>Deselect All</Button>
              </Box>
            </Box>

            <Box sx={{
              border: '1px solid',
              borderColor: 'border.default',
              borderRadius: 2,
              maxHeight: '300px',
              overflowY: 'auto'
            }}>
              {isLoadingAssignees && assignees.length === 0 && (
                <Box sx={{ p: 3, display: 'flex', justifyContent: 'center' }}>
                  <Spinner size="small" />
                </Box>
              )}
              {!isLoadingAssignees && assignees.length === 0 && (
                <Box sx={{ p: 3, textAlign: 'center', color: 'fg.muted' }}>
                  {searchQuery ? `No assignees found matching "${searchQuery}"` : 'No assignees found'}
                </Box>
              )}
              {assignees.map((assignee, index) => (
                <Box
                  key={assignee.id}
                  sx={{
                    p: 2,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    borderTop: index > 0 ? '1px solid' : 'none',
                    borderColor: 'border.default',
                    cursor: 'pointer',
                    '&:hover': { bg: 'canvas.subtle' }
                  }}
                  onClick={() => toggleAssignee(assignee.id)}
                >
                  <Checkbox
                    checked={selectedAssignees.includes(assignee.id)}
                    onChange={() => toggleAssignee(assignee.id)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Select ${assignee.name}`}
                  />
                  {assignee.avatarUrl
                    ? <Avatar src={assignee.avatarUrl} size={20} />
                    : <Box sx={{ width: 20, height: 20, borderRadius: '50%', bg: 'canvas.subtle', border: '1px solid', borderColor: 'border.default' }} />
                  }
                  <Text>{assignee.name}</Text>
                </Box>
              ))}
            </Box>

            {selectedAssignees.length < 2 && (
              <Text sx={{ color: 'danger.fg', fontSize: 1 }}>
                Please select at least 2 assignees to distribute items.
              </Text>
            )}
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
                  .map(([id, items]) => `${idToLogin[id] ?? id}: ${items.length} items`)
                  .join(' | ')}
              </Text>
            </Box>

            <Box sx={{ border: '1px solid', borderColor: 'border.default', borderRadius: 2, overflow: 'hidden' }}>
              {Array.from(preview.entries()).map(([id, items], index) => (
                <Box
                  key={id}
                  sx={{
                    p: 3,
                    borderTop: index > 0 ? '1px solid' : 'none',
                    borderColor: 'border.default',
                    display: 'flex',
                    justifyContent: 'space-between'
                  }}
                >
                  <Text sx={{ fontWeight: 'bold' }}>{idToLogin[id] ?? id}</Text>
                  <Text color="fg.muted">{items.length} items</Text>
                </Box>
              ))}
            </Box>
          </Box>
        )
      case 'CONFIRM':
        return (
          <Box sx={{ p: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Flash variant="warning">
              <Text sx={{ fontWeight: 'bold', display: 'block', mb: 1 }}>Sequential Execution Warning</Text>
              <Text sx={{ fontSize: 1 }}>
                To comply with GitHub API rate limits, these {count} assignments will be processed sequentially.
                Please keep this window open until the process completes.
              </Text>
            </Flash>

            <Box sx={{ p: 3, bg: 'canvas.subtle', borderRadius: 2, border: '1px solid', borderColor: 'border.default' }}>
              <Text sx={{ fontWeight: 'bold', display: 'block', mb: 2 }}>Assignment Summary</Text>
              <Text sx={{ display: 'block', mb: 3 }}>
                Assigning <strong>{count}</strong> items to <strong>{selectedAssignees.length}</strong> assignees using the <strong>{strategy}</strong> strategy.
              </Text>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {Array.from(preview.entries()).map(([id, items]) => (
                  <Box key={id} sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Text>{idToLogin[id] ?? id}</Text>
                    <Text sx={{ fontWeight: 'bold' }}>{items.length} items</Text>
                  </Box>
                ))}
              </Box>
            </Box>
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
            disabled={step === 'ASSIGNEES' && selectedAssignees.length < 2}
            onClick={step === 'CONFIRM' ? () => onConfirm?.(preview, strategy) : handleNext}
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
