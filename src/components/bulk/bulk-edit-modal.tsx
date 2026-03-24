import React, { useEffect } from 'react'
import Tippy from '../ui/tooltip'
import { Box, Button, Checkbox, Flash, FormControl, Heading, Text, TextInput } from '@primer/react'
import { AutocompleteInput } from '../ui/autocomplete-input'
import { RepoMetadataSelectPanel } from '../ui/repo-metadata-select-panel'
import { MarkdownTextarea } from '../ui/markdown-textarea'
import {
  AlertIcon, CheckIcon,
  PersonIcon, TagIcon, ShieldIcon, HashIcon, CalendarIcon,
  TextLineIcon, OptionsSelectIcon, SyncIcon, GearIcon, ProjectBoardIcon, PencilIcon, ListCheckIcon,
} from '../ui/primitives'
import { ModalStepHeader } from '../ui/modal-step-header'
import { Z_MODAL, Z_TOOLTIP } from '../../lib/z-index'
import { ensureTippyCss } from '../../lib/tippy-utils'

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

function getFieldIcon(dataType: string): React.ReactNode {
  switch (dataType) {
    case 'ASSIGNEES':     return <PersonIcon />
    case 'LABELS':        return <TagIcon />
    case 'ISSUE_TYPE':    return <ShieldIcon />
    case 'SINGLE_SELECT': return <OptionsSelectIcon />
    case 'ITERATION':     return <SyncIcon />
    case 'NUMBER':        return <HashIcon />
    case 'DATE':          return <CalendarIcon />
    case 'TEXT':          return <TextLineIcon />
    case 'TITLE':         return <PencilIcon />
    case 'BODY':          return <TextLineIcon />
    case 'COMMENT':       return <TextLineIcon />
    default:              return null
  }
}

function getFieldSelectionTooltip(field: ProjectField): string {
  return `Select ${field.name} to set the same value across all selected items.`
}

function getFieldOptionTooltip(fieldName: string, optionName: string): string {
  return `Set ${fieldName} to ${optionName}.`
}

function getFieldValueStepTooltip(field: ProjectField, itemCount: number): string {
  return `Set ${field.name} for all ${itemCount} selected item${itemCount !== 1 ? 's' : ''}.`
}

const bulkEditHeaderIcon = <ListCheckIcon size={16} />

// ── Step subcomponents ──────────────────────────────────────

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
        <Button variant="default" onClick={onClose} sx={{ boxShadow: 'none', transition: '150ms cubic-bezier(0.4, 0, 0.2, 1)', '&:hover:not(:disabled)': { transform: 'translateY(-1px)' }, '&:active': { transform: 'translateY(0)', transition: '100ms' }, '@media (prefers-reduced-motion: reduce)': { transition: 'none', '&:hover:not(:disabled)': { transform: 'none' } } }}>Cancel</Button>
        <Button variant="primary" onClick={onOpenOptions} sx={{ boxShadow: 'none', transition: '150ms cubic-bezier(0.4, 0, 0.2, 1)', '&:hover:not(:disabled)': { transform: 'translateY(-1px)' }, '&:active': { transform: 'translateY(0)', transition: '100ms' }, '@media (prefers-reduced-motion: reduce)': { transition: 'none', '&:hover:not(:disabled)': { transform: 'none' } } }}>Set up token</Button>
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

  const defaultDataTypeKeys = ['ASSIGNEES', 'LABELS', 'ISSUE_TYPE', 'TRACKS', 'TITLE', 'BODY', 'COMMENT']
  const FIELD_ORDER: Record<string, number> = { TITLE: 0, BODY: 1, COMMENT: 2, ASSIGNEES: 3, LABELS: 4, ISSUE_TYPE: 5, TRACKS: 6 }
  const defaultFields = projectData.fields
    .filter(f => defaultDataTypeKeys.includes(f.dataType) || f.name.toLowerCase() === 'type')
    .sort((a, b) => (FIELD_ORDER[a.dataType] ?? 99) - (FIELD_ORDER[b.dataType] ?? 99))
  const customFields = projectData.fields.filter(f => !defaultFields.includes(f))
  const eligibleCustomFields = customFields.filter(f => ['SINGLE_SELECT', 'ITERATION', 'TEXT', 'NUMBER', 'DATE'].includes(f.dataType))
  const allEligibleFields = [...defaultFields, ...eligibleCustomFields]
  const allSelected = allEligibleFields.length > 0 && allEligibleFields.every(f => selectedFields.some(s => s.id === f.id))

  return (
    <>
      <ModalStepHeader
        title="Select Fields"
        icon={bulkEditHeaderIcon}
        subtitle={`Choose the fields to update on the ${count} selected item${count !== 1 ? 's' : ''}.`}
        step={1}
        totalSteps={3}
        onClose={onClose}
      />
      <Box sx={{ px: 4, pt: 2, pb: 1 }}>
        <Button
          variant="invisible"
          size="small"
          onClick={() => onSetSelectedFields(allSelected ? [] : allEligibleFields)}
          sx={{ p: 0, color: 'accent.fg', fontSize: 1, fontWeight: 'bold', transition: '150ms cubic-bezier(0.4, 0, 0.2, 1)', '&:hover:not(:disabled)': { transform: 'translateY(-1px)' }, '&:active': { transform: 'translateY(0)', transition: '100ms' }, '@media (prefers-reduced-motion: reduce)': { transition: 'none', '&:hover:not(:disabled)': { transform: 'none' } } }}
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
              <Tippy key={field.id} content={getFieldSelectionTooltip(field)} delay={[400, 0]} placement="top" zIndex={Z_TOOLTIP}>
                <Box
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
                  <Checkbox checked={isSelected} onChange={() => {}} sx={{ pointerEvents: 'none' }} />
                  <Box as="span" sx={{ display: 'flex', alignItems: 'center', gap: 3, flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0, color: isSelected ? 'accent.fg' : 'fg.default' }}>{getFieldIcon(field.dataType)}</Box>
                    <Text sx={{ fontSize: 1, fontWeight: 'bold', color: isSelected ? 'accent.fg' : 'fg.default', flex: 1 }}>
                      {field.name}
                    </Text>
                  </Box>
                </Box>
              </Tippy>
            )
          })}
        </Box>

        {/* Custom fields */}
        {eligibleCustomFields.length > 0 && (
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Text sx={{ fontSize: 1, fontWeight: 'bold', color: 'fg.default' }}>Custom Fields</Text>
              <GearIcon color="var(--fgColor-muted)" />
            </Box>
            <Box sx={{ border: '1px solid', borderColor: 'border.default', borderRadius: 2, overflow: 'hidden' }}>
              <Box sx={{ bg: 'canvas.subtle', px: 3, py: 2, borderBottom: '1px solid', borderColor: 'border.default', display: 'flex', alignItems: 'center', gap: 2 }}>
                <ProjectBoardIcon color="var(--fgColor-muted)" />
                <Text sx={{ fontSize: 1, fontWeight: 'bold', color: 'fg.default' }}>{projectData.title}</Text>
              </Box>
              <Box sx={{ display: 'flex', flexDirection: 'column', p: 1 }}>
                {eligibleCustomFields.map(field => {
                  const isSelected = selectedFields.some(f => f.id === field.id)
                  return (
                    <Tippy key={field.id} content={getFieldSelectionTooltip(field)} delay={[400, 0]} placement="top" zIndex={Z_TOOLTIP}>
                      <Box
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
                        <Checkbox checked={isSelected} onChange={() => {}} sx={{ pointerEvents: 'none' }} />
                        <Box as="span" sx={{ display: 'flex', alignItems: 'center', gap: 3, flex: 1, minWidth: 0 }}>
                          <Box sx={{ display: 'flex', flexShrink: 0, color: isSelected ? 'accent.fg' : 'fg.default' }}>{getFieldIcon(field.dataType)}</Box>
                          <Text sx={{ fontSize: 1, fontWeight: 500, color: isSelected ? 'accent.fg' : 'fg.default', flex: 1 }}>
                            {field.name}
                          </Text>
                        </Box>
                        <Text sx={{ fontSize: 0, px: 1, py: '2px', bg: 'neutral.muted', color: 'fg.muted', borderRadius: 2 }}>
                          {field.dataType.toLowerCase()}
                        </Text>
                      </Box>
                    </Tippy>
                  )
                })}
              </Box>
            </Box>
          </Box>
        )}
      </Box>

      <Box sx={{ px: 4, py: 3, borderTop: '1px solid', borderColor: 'border.default', display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="primary" disabled={selectedFields.length === 0} onClick={onNext} sx={{ boxShadow: 'none', transition: '150ms cubic-bezier(0.4, 0, 0.2, 1)', '&:hover:not(:disabled)': { transform: 'translateY(-1px)' }, '&:active': { transform: 'translateY(0)', transition: '100ms' }, '@media (prefers-reduced-motion: reduce)': { transition: 'none', '&:hover:not(:disabled)': { transform: 'none' } } }}>
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
      <ModalStepHeader
        title="Set Values"
        icon={bulkEditHeaderIcon}
        subtitle={`Assign new values for the ${selectedFields.length} selected field${selectedFields.length !== 1 ? 's' : ''}.`}
        step={2}
        totalSteps={3}
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
                    <Tippy key={opt.id} content={getFieldOptionTooltip(field.name, opt.name)} delay={[400, 0]} placement="top" zIndex={Z_TOOLTIP}>
                      <Box
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
                        <Box as="span" sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bg: opt.color ? undefined : 'border.default' }} style={opt.color ? { backgroundColor: opt.color } : undefined} />
                          <Text sx={{ color: 'fg.default', fontSize: 1, fontWeight: 500 }}>{opt.name}</Text>
                        </Box>
                      </Box>
                    </Tippy>
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
                    <Tippy key={iter.id} content={getFieldOptionTooltip(field.name, iter.title)} delay={[400, 0]} placement="top" zIndex={Z_TOOLTIP}>
                      <Box
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
                        <Box as="span" sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                          <Text sx={{ color: 'fg.default', fontSize: 1, fontWeight: 'bold' }}>{iter.title}</Text>
                          <Text sx={{ color: 'fg.muted', fontSize: 0, mt: '2px' }}>{iter.startDate}</Text>
                        </Box>
                        {isSelected && <CheckIcon size={14} color="var(--color-accent-fg)" />}
                      </Box>
                    </Tippy>
                  )
                })}
              </Box>
            )
          } else if (field.dataType === 'ASSIGNEES' || field.dataType === 'LABELS') {
            inputContent = (
              <Box sx={{ width: '100%' }}>
                <RepoMetadataSelectPanel
                  type={field.dataType}
                  owner={owner}
                  repoName={firstRepoName}
                  value={(value.array as { id: string; name: string; color?: string; avatarUrl?: string }[]) || []}
                  onChange={arr => onUpdateFieldValue(field.id, { array: arr })}
                  placeholder={`Select ${field.name.toLowerCase()}`}
                />
              </Box>
            )
          } else if (field.dataType === 'ISSUE_TYPE' || field.name.toLowerCase() === 'type') {
            inputContent = (
              <Box sx={{ width: '100%' }}>
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
              </Box>
            )
          } else if (field.dataType === 'DATE') {
            inputContent = (
              <TextInput
                block
                type="date"
                value={(value.date as string) || ''}
                onChange={e => onUpdateFieldValue(field.id, { date: e.target.value })}
              />
            )
          } else if (field.dataType === 'NUMBER') {
            inputContent = (
              <TextInput
                block
                type="number"
                placeholder="Enter number..."
                value={(value.number as number | '') ?? ''}
                onChange={e => onUpdateFieldValue(field.id, { number: e.target.value === '' ? undefined : parseFloat(e.target.value) })}
              />
            )
          } else if (field.dataType === 'TITLE') {
            inputContent = (
              <TextInput
                block
                placeholder="New title for all selected items..."
                value={(value.text as string) || ''}
                onChange={e => onUpdateFieldValue(field.id, { text: e.target.value })}
              />
            )
          } else if (field.dataType === 'BODY') {
            inputContent = (
              <Box sx={{ width: '100%' }}>
                <MarkdownTextarea
                  value={(value.text as string) || ''}
                  onChange={text => onUpdateFieldValue(field.id, { text })}
                  placeholder="Set description for all selected items (replaces existing)..."
                />
              </Box>
            )
          } else if (field.dataType === 'COMMENT') {
            inputContent = (
              <Box sx={{ width: '100%' }}>
                <MarkdownTextarea
                  value={(value.text as string) || ''}
                  onChange={text => onUpdateFieldValue(field.id, { text })}
                  placeholder="Comment to add to all selected items..."
                />
              </Box>
            )
          } else {
            inputContent = (
              <TextInput
                block
                placeholder={isDefault ? 'E.g. comma separated...' : 'Enter value...'}
                value={(value.text as string) || ''}
                onChange={e => onUpdateFieldValue(field.id, { text: e.target.value })}
              />
            )
          }

          return (
            <FormControl key={field.id} sx={{ width: '100%' }}>
              <FormControl.Label sx={{ display: 'flex', alignItems: 'center', gap: 2, fontWeight: 'bold', width: 'fit-content', cursor: 'help' }}>
                <Tippy content={getFieldValueStepTooltip(field, count)} delay={[400, 0]} placement="top" zIndex={Z_TOOLTIP}>
                  <Box as="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                    {getFieldIcon(field.dataType) && (
                      <Box sx={{ color: 'fg.muted', display: 'flex' }}>{getFieldIcon(field.dataType)}</Box>
                    )}
                    {field.name}
                  </Box>
                </Tippy>
              </FormControl.Label>
              {inputContent}
            </FormControl>
          )
        })}
      </Box>

      <Box sx={{ px: 4, py: 3, borderTop: '1px solid', borderColor: 'border.default', display: 'flex', justifyContent: 'space-between' }}>
        <Button variant="default" onClick={onBack} sx={{ boxShadow: 'none', transition: '150ms cubic-bezier(0.4, 0, 0.2, 1)', '&:hover:not(:disabled)': { transform: 'translateY(-1px)' }, '&:active': { transform: 'translateY(0)', transition: '100ms' }, '@media (prefers-reduced-motion: reduce)': { transition: 'none', '&:hover:not(:disabled)': { transform: 'none' } } }}>← Back</Button>
        <Button variant="primary" onClick={onNext} sx={{ boxShadow: 'none', transition: '150ms cubic-bezier(0.4, 0, 0.2, 1)', '&:hover:not(:disabled)': { transform: 'translateY(-1px)' }, '&:active': { transform: 'translateY(0)', transition: '100ms' }, '@media (prefers-reduced-motion: reduce)': { transition: 'none', '&:hover:not(:disabled)': { transform: 'none' } } }}>Review Changes →</Button>
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
      <ModalStepHeader
        title="Review & Apply"
        icon={bulkEditHeaderIcon}
        subtitle={`You are updating ${count} item${count !== 1 ? 's' : ''}. Confirm the changes below.`}
        step={3}
        totalSteps={3}
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
          <Button variant="default" onClick={onBack} sx={{ boxShadow: 'none', transition: '150ms cubic-bezier(0.4, 0, 0.2, 1)', '&:hover:not(:disabled)': { transform: 'translateY(-1px)' }, '&:active': { transform: 'translateY(0)', transition: '100ms' }, '@media (prefers-reduced-motion: reduce)': { transition: 'none', '&:hover:not(:disabled)': { transform: 'none' } } }}>← Back</Button>
          <Button ref={applyBtnRef} variant="primary" onClick={onApply} sx={{ boxShadow: 'none', transition: '150ms cubic-bezier(0.4, 0, 0.2, 1)', '&:hover:not(:disabled)': { transform: 'translateY(-1px)' }, '&:active': { transform: 'translateY(0)', transition: '100ms' }, '@media (prefers-reduced-motion: reduce)': { transition: 'none', '&:hover:not(:disabled)': { transform: 'none' } } }}>
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
  useEffect(() => {
    ensureTippyCss()
  }, [])

  return (
    <Box
      sx={{
        position: 'fixed', inset: 0,
        bg: 'rgba(27,31,36,0.5)', zIndex: Z_MODAL,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onKeyDown={(e: React.KeyboardEvent) => {
        e.stopPropagation()
        if (e.key === 'Escape') onClose()
      }}
      onKeyUp={(e: React.KeyboardEvent) => e.stopPropagation()}
    >
      <Box sx={{
        bg: 'canvas.overlay', border: '1px solid', borderColor: 'border.default',
        borderRadius: 2, width: 'min(640px, 90vw)', maxHeight: '80vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: 'none',
        animation: 'fadeSlideIn 200ms cubic-bezier(0.4, 0, 0.2, 1)',
        '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
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
