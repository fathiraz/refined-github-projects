import React from 'react'
import { Box, Button, Flash, Heading, Text } from '@primer/react'
import { AutocompleteInput } from '../ui/AutocompleteInput'
import {
  AlertIcon, CheckIcon, XIcon, StepIndicator,
  PersonIcon, TagIcon, ShieldIcon, HashIcon, CalendarIcon,
  TextLineIcon, OptionsSelectIcon, SyncIcon, GearIcon, ProjectBoardIcon,
} from '../ui/primitives'

export interface ProjectField {
  id: string
  name: string
  dataType: string
  options?: { id: string; name: string; color?: string }[]
  configuration?: {
    iterations: { id: string; title: string; startDate: string; duration: number }[]
  }
}

export interface ProjectData {
  id: string
  title: string
  fields: ProjectField[]
}

export type WizardStep = 'TOKEN_WARNING' | 'FIELDS' | 'VALUES' | 'SUMMARY'

interface WizardProps {
  count: number
  step: WizardStep
  projectData: ProjectData | null
  selectedFields: ProjectField[]
  fieldValues: Record<string, unknown>
  concurrentError: boolean
  owner: string
  firstRepoName: string
  applyBtnRef: React.RefObject<HTMLButtonElement | null>
  onClose: () => void
  onToggleField: (f: ProjectField) => void
  onUpdateFieldValue: (id: string, v: unknown) => void
  onSetSelectedFields: (fields: ProjectField[]) => void
  onGoToStep: (step: WizardStep) => void
  onApply: () => void
  onOpenOptions: () => void
}

// ── Field icon helpers ──────────────────────────────────────

const FIELD_COLORS: Record<string, string> = {
  ASSIGNEES:     'var(--color-accent-fg, #0969da)',
  LABELS:        'var(--color-success-fg, #1a7f37)',
  ISSUE_TYPE:    'var(--color-done-fg, #8250df)',
  SINGLE_SELECT: 'var(--color-attention-fg, #9a6700)',
  ITERATION:     'var(--color-done-fg, #8250df)',
  NUMBER:        'var(--color-accent-fg, #0969da)',
  DATE:          'var(--color-danger-fg, #cf222e)',
  TEXT:          'var(--fgColor-muted, #8b949e)',
}

function getFieldIcon(dataType: string): React.ReactNode {
  const c = FIELD_COLORS[dataType] ?? 'var(--fgColor-muted, #8b949e)'
  switch (dataType) {
    case 'ASSIGNEES':     return <PersonIcon color={c} />
    case 'LABELS':        return <TagIcon color={c} />
    case 'ISSUE_TYPE':    return <ShieldIcon color={c} />
    case 'SINGLE_SELECT': return <OptionsSelectIcon color={c} />
    case 'ITERATION':     return <SyncIcon color={c} />
    case 'NUMBER':        return <HashIcon color={c} />
    case 'DATE':          return <CalendarIcon color={c} />
    case 'TEXT':          return <TextLineIcon color={c} />
    default:              return null
  }
}

// Custom checkbox for field selection rows
function FieldCheckbox({ checked }: { checked: boolean }) {
  return (
    <Box sx={{
      width: 18, height: 18, borderRadius: '4px', border: '1.5px solid',
      borderColor: checked ? 'accent.emphasis' : 'border.default',
      bg: checked ? 'accent.emphasis' : 'transparent',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'all 150ms ease', flexShrink: 0,
      '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
    }}>
      {checked && <CheckIcon size={11} color="#fff" />}
    </Box>
  )
}

// Shared raw input styles (used for date / number / text)
const inputCss: React.CSSProperties = {
  padding: '8px 12px',
  background: 'var(--bgColor-muted, var(--color-canvas-subtle))',
  color: 'var(--fgColor-default)',
  border: '1px solid var(--borderColor-default)',
  borderRadius: 6, outline: 'none', fontFamily: 'inherit', fontSize: 14, boxSizing: 'border-box',
}

// ── Step subcomponents ──────────────────────────────────────

function WizardHeader({ step, title, subtitle, onBack, onClose }: {
  step: 1 | 2 | 3
  title: string
  subtitle?: string
  onBack?: () => void
  onClose: () => void
}) {
  return (
    <Box sx={{
      display: 'flex', alignItems: 'flex-start', gap: 3,
      px: 4, py: 3, borderBottom: '1px solid', borderColor: 'border.default', flexShrink: 0,
    }}>
      {onBack && (
        <Button variant="default" size="small" onClick={onBack} sx={{ mt: 1, boxShadow: 'none', px: 2, flexShrink: 0 }}>
          ←
        </Button>
      )}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
          <StepIndicator current={step} total={3} />
          <Text sx={{ fontSize: 0, fontWeight: 'bold', color: 'accent.fg', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Step {step} of 3
          </Text>
        </Box>
        <Heading as="h2" sx={{ m: 0, fontSize: 4, fontWeight: 'bold', letterSpacing: '-0.025em', lineHeight: 1.2 }}>
          {title}
        </Heading>
        {subtitle && (
          <Text as="p" sx={{ m: 0, mt: 1, fontSize: 1, color: 'fg.muted' }}>{subtitle}</Text>
        )}
      </Box>
      <Button variant="invisible" size="small" onClick={onClose} aria-label="Close" sx={{ p: '4px', minWidth: 'unset', color: 'fg.muted', mt: 1, flexShrink: 0 }}>
        <XIcon size={16} />
      </Button>
    </Box>
  )
}

function TokenWarning({ onClose, onOpenOptions }: { onClose: () => void; onOpenOptions: () => void }) {
  return (
    <Box sx={{ p: 5, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, textAlign: 'center' }}>
      <Box sx={{ color: 'attention.fg' }}>
        <AlertIcon size={40} />
      </Box>
      <Box>
        <Heading as="h2" sx={{ m: 0, fontSize: 4, fontWeight: 'bold', mb: 2 }}>Token not set up</Heading>
        <Text as="p" sx={{ m: 0, fontSize: 1, color: 'fg.muted', maxWidth: 320 }}>
          Add your GitHub token to use bulk actions.
        </Text>
      </Box>
      <Box sx={{ display: 'flex', gap: 2 }}>
        <Button variant="default" onClick={onClose} sx={{ boxShadow: 'none' }}>Cancel</Button>
        <Button variant="primary" onClick={onOpenOptions} sx={{ boxShadow: 'none' }}>Set up token</Button>
      </Box>
    </Box>
  )
}

interface FieldsStepProps {
  count: number
  projectData: ProjectData | null
  selectedFields: ProjectField[]
  onToggleField: (f: ProjectField) => void
  onSetSelectedFields: (fields: ProjectField[]) => void
  onClose: () => void
  onNext: () => void
}

function FieldsStep({ count, projectData, selectedFields, onToggleField, onSetSelectedFields, onClose, onNext }: FieldsStepProps) {
  if (!projectData) {
    return (
      <Box sx={{ py: 6, textAlign: 'center', color: 'fg.muted', fontSize: 1 }}>
        Loading fields…
      </Box>
    )
  }

  const defaultDataTypeKeys = ['ASSIGNEES', 'LABELS', 'ISSUE_TYPE', 'TRACKS']
  const defaultFields = projectData.fields.filter(f => defaultDataTypeKeys.includes(f.dataType) || f.name.toLowerCase() === 'type')
  const customFields = projectData.fields.filter(f => !defaultFields.includes(f))
  const eligibleCustomFields = customFields.filter(f => ['SINGLE_SELECT', 'ITERATION', 'TEXT', 'NUMBER', 'DATE'].includes(f.dataType))
  const allEligibleFields = [...defaultFields, ...eligibleCustomFields]
  const allSelected = allEligibleFields.length > 0 && allEligibleFields.every(f => selectedFields.some(s => s.id === f.id))

  return (
    <>
      <WizardHeader
        step={1}
        title="Select Fields"
        subtitle={`Choose the fields to update on the ${count} selected item${count !== 1 ? 's' : ''}.`}
        onClose={onClose}
      />
      <Box sx={{ px: 4, pt: 2, pb: 1 }}>
        <Button
          variant="invisible"
          size="small"
          onClick={() => onSetSelectedFields(allSelected ? [] : allEligibleFields)}
          sx={{ p: 0, color: 'accent.fg', fontSize: 1, fontWeight: 'bold' }}
        >
          {allSelected ? 'Deselect all' : 'Select all'}
        </Button>
      </Box>

      <Box sx={{ flex: 1, overflowY: 'auto', px: 4, py: 2 }}>
        {/* Default fields */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 4 }}>
          {defaultFields.map(field => {
            const isSelected = selectedFields.some(f => f.id === field.id)
            return (
              <Box
                key={field.id}
                as="button"
                type="button"
                onClick={() => onToggleField(field)}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 3, width: '100%',
                  textAlign: 'left', border: 'none', borderRadius: 2,
                  bg: isSelected ? 'accent.subtle' : 'transparent',
                  px: 3, py: 2, cursor: 'pointer',
                  transition: 'background-color 150ms ease',
                  ':hover': { bg: isSelected ? 'accent.subtle' : 'canvas.subtle' },
                  '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
                }}
              >
                <FieldCheckbox checked={isSelected} />
                <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>{getFieldIcon(field.dataType)}</Box>
                <Text sx={{ fontSize: 1, fontWeight: 'bold', color: isSelected ? 'accent.fg' : 'fg.default', flex: 1 }}>
                  {field.name}
                </Text>
              </Box>
            )
          })}
        </Box>

        {/* Custom fields */}
        {eligibleCustomFields.length > 0 && (
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Text sx={{ fontSize: 1, fontWeight: 'bold', color: 'fg.default' }}>Custom Fields</Text>
              <GearIcon color="var(--fgColor-muted, #8b949e)" />
            </Box>
            <Box sx={{ border: '1px solid', borderColor: 'border.default', borderRadius: 2, overflow: 'hidden' }}>
              <Box sx={{ bg: 'canvas.subtle', px: 3, py: 2, borderBottom: '1px solid', borderColor: 'border.default', display: 'flex', alignItems: 'center', gap: 2 }}>
                <ProjectBoardIcon color="var(--fgColor-muted, #8b949e)" />
                <Text sx={{ fontSize: 1, fontWeight: 'bold', color: 'fg.default' }}>{projectData.title}</Text>
              </Box>
              <Box sx={{ display: 'flex', flexDirection: 'column', p: 1 }}>
                {eligibleCustomFields.map(field => {
                  const isSelected = selectedFields.some(f => f.id === field.id)
                  return (
                    <Box
                      key={field.id}
                      as="button"
                      type="button"
                      onClick={() => onToggleField(field)}
                      sx={{
                        display: 'flex', alignItems: 'center', gap: 3, width: '100%',
                        textAlign: 'left', border: 'none', borderRadius: 2,
                        bg: isSelected ? 'accent.subtle' : 'transparent',
                        px: 2, py: 2, cursor: 'pointer',
                        transition: 'background-color 150ms ease',
                        ':hover': { bg: isSelected ? 'accent.subtle' : 'canvas.subtle' },
                        '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
                      }}
                    >
                      <FieldCheckbox checked={isSelected} />
                      <Box sx={{ display: 'flex', flexShrink: 0 }}>{getFieldIcon(field.dataType)}</Box>
                      <Text sx={{ fontSize: 1, fontWeight: 500, color: isSelected ? 'accent.fg' : 'fg.default', flex: 1 }}>
                        {field.name}
                      </Text>
                      <Text sx={{ fontSize: 0, px: 1, py: '2px', bg: 'neutral.muted', color: 'fg.muted', borderRadius: 2 }}>
                        {field.dataType.toLowerCase()}
                      </Text>
                    </Box>
                  )
                })}
              </Box>
            </Box>
          </Box>
        )}
      </Box>

      <Box sx={{ px: 4, py: 3, borderTop: '1px solid', borderColor: 'border.default', display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="primary" disabled={selectedFields.length === 0} onClick={onNext} sx={{ boxShadow: 'none' }}>
          Next: Set Values →
        </Button>
      </Box>
    </>
  )
}

interface ValuesStepProps {
  count: number
  selectedFields: ProjectField[]
  fieldValues: Record<string, unknown>
  owner: string
  firstRepoName: string
  onUpdateFieldValue: (id: string, v: unknown) => void
  onClose: () => void
  onBack: () => void
  onNext: () => void
}

function ValuesStep({ count, selectedFields, fieldValues, owner, firstRepoName, onUpdateFieldValue, onClose, onBack, onNext }: ValuesStepProps) {
  return (
    <>
      <WizardHeader
        step={2}
        title="Set Values"
        subtitle={`Assign new values for the ${selectedFields.length} selected field${selectedFields.length !== 1 ? 's' : ''}.`}
        onBack={onBack}
        onClose={onClose}
      />
      <Box sx={{ flex: 1, overflowY: 'auto', px: 4, py: 3, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {selectedFields.map(field => {
          const isDefault = ['ASSIGNEES', 'LABELS', 'MILESTONE', 'ISSUE_TYPE', 'TRACKS'].includes(field.dataType) || field.name.toLowerCase() === 'type'
          const value = (fieldValues[field.id] || {}) as Record<string, unknown>
          let inputContent: React.ReactNode = null

          if (field.dataType === 'SINGLE_SELECT' && field.options) {
            inputContent = (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                {field.options.map(opt => {
                  const isSelected = value.singleSelectOptionId === opt.id
                  return (
                    <Box
                      key={opt.id}
                      as="button"
                      type="button"
                      onClick={() => onUpdateFieldValue(field.id, { singleSelectOptionId: opt.id })}
                      sx={{
                        display: 'flex', alignItems: 'center', gap: 2, px: 3, py: 1,
                        border: '1px solid', borderColor: isSelected ? 'accent.emphasis' : 'border.default',
                        borderRadius: 2, bg: isSelected ? 'canvas.subtle' : 'transparent',
                        cursor: 'pointer', transition: 'all 150ms ease',
                        '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
                      }}
                    >
                      <Box sx={{ width: 10, height: 10, borderRadius: '50%', bg: opt.color ? undefined : 'border.default' }} style={opt.color ? { backgroundColor: opt.color } : undefined} />
                      <Text sx={{ color: 'fg.default', fontSize: 1, fontWeight: 500 }}>{opt.name}</Text>
                    </Box>
                  )
                })}
              </Box>
            )
          } else if (field.dataType === 'ITERATION' && field.configuration?.iterations) {
            inputContent = (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {field.configuration.iterations.map(iter => {
                  const isSelected = value.iterationId === iter.id
                  return (
                    <Box
                      key={iter.id}
                      as="button"
                      type="button"
                      onClick={() => onUpdateFieldValue(field.id, { iterationId: iter.id })}
                      sx={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        px: 3, py: 2, border: '1px solid',
                        borderColor: isSelected ? 'accent.emphasis' : 'border.default',
                        borderRadius: 2, bg: isSelected ? 'canvas.subtle' : 'transparent',
                        cursor: 'pointer', transition: 'all 150ms ease',
                        '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
                      }}
                    >
                      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                        <Text sx={{ color: 'fg.default', fontSize: 1, fontWeight: 'bold' }}>{iter.title}</Text>
                        <Text sx={{ color: 'fg.muted', fontSize: 0, mt: '2px' }}>{iter.startDate}</Text>
                      </Box>
                      {isSelected && <CheckIcon size={14} color="var(--color-accent-fg, #0969da)" />}
                    </Box>
                  )
                })}
              </Box>
            )
          } else if (field.dataType === 'ASSIGNEES' || field.dataType === 'LABELS') {
            inputContent = (
              <AutocompleteInput
                type={field.dataType}
                owner={owner}
                repoName={firstRepoName}
                value={(value.array as { name: string }[]) || []}
                onChange={arr => onUpdateFieldValue(field.id, { array: arr })}
                placeholder={`Search and select ${field.name.toLowerCase()}...`}
              />
            )
          } else if (field.dataType === 'ISSUE_TYPE' || field.name.toLowerCase() === 'type') {
            inputContent = (
              <AutocompleteInput
                type="ISSUE_TYPES"
                owner={owner}
                repoName={firstRepoName || ''}
                value={(value.array as { name: string }[]) || []}
                onChange={arr => onUpdateFieldValue(field.id, { ...(fieldValues[field.id] as Record<string, unknown> || {}), array: arr, dataType: 'ISSUE_TYPE' })}
                placeholder={firstRepoName ? 'Search issue types...' : 'Repository not detected - please open a project with issues'}
                singleSelect={true}
                disabled={!firstRepoName}
              />
            )
          } else if (field.dataType === 'DATE') {
            inputContent = (
              <input
                type="date"
                value={(value.date as string) || ''}
                onChange={e => onUpdateFieldValue(field.id, { date: e.target.value })}
                style={{ ...inputCss, maxWidth: 200, width: '100%' }}
                onFocus={e => { e.target.style.borderColor = 'var(--color-accent-emphasis, #0969da)' }}
                onBlur={e => { e.target.style.borderColor = 'var(--borderColor-default)' }}
              />
            )
          } else if (field.dataType === 'NUMBER') {
            inputContent = (
              <input
                type="number"
                placeholder="Enter number..."
                value={(value.number as number | '') ?? ''}
                onChange={e => onUpdateFieldValue(field.id, { number: e.target.value === '' ? undefined : parseFloat(e.target.value) })}
                style={{ ...inputCss, maxWidth: 160, width: '100%' }}
                onFocus={e => { e.target.style.borderColor = 'var(--color-accent-emphasis, #0969da)' }}
                onBlur={e => { e.target.style.borderColor = 'var(--borderColor-default)' }}
              />
            )
          } else {
            inputContent = (
              <input
                type="text"
                placeholder={isDefault ? 'E.g. comma separated...' : 'Enter value...'}
                value={(value.text as string) || ''}
                onChange={e => onUpdateFieldValue(field.id, { text: e.target.value })}
                style={{ ...inputCss, width: '100%' }}
                onFocus={e => { e.target.style.borderColor = 'var(--color-accent-emphasis, #0969da)' }}
                onBlur={e => { e.target.style.borderColor = 'var(--borderColor-default)' }}
              />
            )
          }

          return (
            <Box key={field.id} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Text sx={{ fontSize: 1, fontWeight: 'bold', color: 'fg.default', display: 'flex', alignItems: 'center', gap: 2 }}>
                {getFieldIcon(field.dataType) && <Box sx={{ color: 'fg.muted', display: 'flex' }}>{getFieldIcon(field.dataType)}</Box>}
                {field.name}
              </Text>
              {inputContent}
            </Box>
          )
        })}
      </Box>

      <Box sx={{ px: 4, py: 3, borderTop: '1px solid', borderColor: 'border.default', display: 'flex', justifyContent: 'space-between' }}>
        <Button variant="default" onClick={onBack} sx={{ boxShadow: 'none' }}>← Back</Button>
        <Button variant="primary" onClick={onNext} sx={{ boxShadow: 'none' }}>Review Changes →</Button>
      </Box>
    </>
  )
}

interface SummaryStepProps {
  count: number
  selectedFields: ProjectField[]
  fieldValues: Record<string, unknown>
  concurrentError: boolean
  applyBtnRef: React.RefObject<HTMLButtonElement | null>
  onClose: () => void
  onBack: () => void
  onApply: () => void
}

function SummaryStep({ count, selectedFields, fieldValues, concurrentError, applyBtnRef, onClose, onBack, onApply }: SummaryStepProps) {
  return (
    <>
      <WizardHeader
        step={3}
        title="Review & Apply"
        subtitle={`You are updating ${count} item${count !== 1 ? 's' : ''}. Confirm the changes below.`}
        onBack={onBack}
        onClose={onClose}
      />
      <Box sx={{ flex: 1, overflowY: 'auto', px: 4, py: 3 }}>
        <Box sx={{ bg: 'canvas.subtle', border: '1px solid', borderColor: 'border.default', borderRadius: 2, overflow: 'hidden' }}>
          {selectedFields.map((field, i) => {
            const valueObj = (fieldValues[field.id] || {}) as Record<string, unknown>
            let displayValue = 'None / Cleared'

            const arr = valueObj.array as { name: string }[] | undefined
            if (arr && arr.length > 0) {
              displayValue = arr.map(v => v.name).join(', ')
            } else if (valueObj.date) {
              displayValue = new Date((valueObj.date as string) + 'T00:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
            } else if (valueObj.number !== undefined && valueObj.number !== null) {
              displayValue = String(valueObj.number)
            } else if (valueObj.text) {
              displayValue = valueObj.text as string
            } else if (valueObj.singleSelectOptionId && field.options) {
              const opt = field.options.find(o => o.id === valueObj.singleSelectOptionId)
              if (opt) displayValue = opt.name
            } else if (valueObj.iterationId && field.configuration?.iterations) {
              const iter = field.configuration.iterations.find(it => it.id === valueObj.iterationId)
              if (iter) displayValue = iter.title
            }

            return (
              <Box
                key={field.id}
                sx={{
                  display: 'flex', alignItems: 'center', px: 3, py: 3,
                  borderBottom: i < selectedFields.length - 1 ? '1px solid' : 'none',
                  borderColor: 'border.default',
                }}
              >
                <Text sx={{ flex: 1, color: 'fg.muted', fontSize: 1, fontWeight: 500 }}>{field.name}</Text>
                <Text sx={{ flex: 1, color: 'fg.default', fontSize: 1, fontWeight: 'bold', textAlign: 'right' }}>{displayValue}</Text>
              </Box>
            )
          })}
        </Box>
      </Box>

      <Box sx={{ px: 4, py: 3, borderTop: '1px solid', borderColor: 'border.default', display: 'flex', flexDirection: 'column', gap: 3 }}>
        {concurrentError && (
          <Flash variant="warning">
            3 processes are already running. Wait for one to finish before starting another.
          </Flash>
        )}
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Button variant="default" onClick={onBack} sx={{ boxShadow: 'none' }}>← Back</Button>
          <Button ref={applyBtnRef} variant="primary" onClick={onApply} sx={{ boxShadow: 'none' }}>
            Apply to {count} Item{count !== 1 ? 's' : ''}
          </Button>
        </Box>
      </Box>
    </>
  )
}

// ── Main exported component ─────────────────────────────────

export function BulkEditWizard({
  count, step, projectData, selectedFields, fieldValues, concurrentError,
  owner, firstRepoName, applyBtnRef,
  onClose, onToggleField, onUpdateFieldValue, onSetSelectedFields, onGoToStep, onApply, onOpenOptions,
}: WizardProps) {
  return (
    <Box sx={{
      position: 'fixed', inset: 0,
      bg: 'rgba(27,31,36,0.5)', zIndex: 10000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <Box sx={{
        bg: 'canvas.overlay', border: '1px solid', borderColor: 'border.default',
        borderRadius: 2, width: 'min(640px, 90vw)', maxHeight: '80vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {step === 'TOKEN_WARNING' && (
          <TokenWarning onClose={onClose} onOpenOptions={onOpenOptions} />
        )}
        {step === 'FIELDS' && (
          <FieldsStep
            count={count}
            projectData={projectData}
            selectedFields={selectedFields}
            onToggleField={onToggleField}
            onSetSelectedFields={onSetSelectedFields}
            onClose={onClose}
            onNext={() => onGoToStep('VALUES')}
          />
        )}
        {step === 'VALUES' && (
          <ValuesStep
            count={count}
            selectedFields={selectedFields}
            fieldValues={fieldValues}
            owner={owner}
            firstRepoName={firstRepoName}
            onUpdateFieldValue={onUpdateFieldValue}
            onClose={onClose}
            onBack={() => onGoToStep('FIELDS')}
            onNext={() => onGoToStep('SUMMARY')}
          />
        )}
        {step === 'SUMMARY' && (
          <SummaryStep
            count={count}
            selectedFields={selectedFields}
            fieldValues={fieldValues}
            concurrentError={concurrentError}
            applyBtnRef={applyBtnRef}
            onClose={onClose}
            onBack={() => onGoToStep('VALUES')}
            onApply={onApply}
          />
        )}
      </Box>
    </Box>
  )
}
