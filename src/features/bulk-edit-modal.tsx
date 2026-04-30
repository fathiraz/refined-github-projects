import React, { useEffect } from 'react'
import Tippy from '@/ui/tooltip'
import { Box, Button, Checkbox, Flash, FormControl, Heading, Text, TextInput } from '@primer/react'
import { RepoMetadataSelectPanel } from '@/ui/repo-metadata-select-panel'
import { MarkdownTextarea } from '@/ui/markdown-textarea'
import type { BulkEditRelationshipsUpdate } from '@/lib/messages'
import { AlertIcon, CheckIcon, GearIcon, ProjectBoardIcon, XIcon } from '@/ui/icons'
import { ModalStepHeader } from '@/ui/modal-step-header'
import { Z_MODAL, Z_TOOLTIP } from '@/lib/z-index'
import { ensureTippyCss } from '@/lib/tippy-utils'
import { getFieldOptionTooltip } from '@/features/field-helpers'
import {
  bulkEditHeaderIcon,
  buildRelationshipSummaryRows,
  describeFieldValue,
  getFieldIcon,
  getFieldSelectionTooltip,
  getFieldValueStepTooltip,
  getRelationshipSelectionCount,
  getRelationshipSelectionTooltip,
  RELATIONSHIP_OPTIONS,
  type ProjectData,
  type ProjectField,
  type RelationshipKey,
  type RelationshipSelectionState,
  type RelationshipSummaryRow,
  type WizardStep,
} from '@/features/bulk-edit-utils'
import { RelationshipsSection } from '@/features/bulk-edit-relationships'

export type {
  ProjectData,
  ProjectField,
  RelationshipSelectionState,
  WizardStep,
} from '@/features/bulk-edit-utils'

interface WizardProps {
  count: number
  step: WizardStep
  projectData: ProjectData | null
  selectedFields: ProjectField[]
  fieldValues: Record<string, unknown>
  relationships: BulkEditRelationshipsUpdate
  relationshipSelection: RelationshipSelectionState
  hasChanges: boolean
  validationErrors: string[]
  concurrentError: boolean
  owner: string
  firstRepoName: string
  applyBtnRef: React.RefObject<HTMLButtonElement | null>
  onClose: () => void
  onToggleField: (f: ProjectField) => void
  onUpdateFieldValue: (id: string, v: unknown) => void
  onUpdateRelationships: (relationships: BulkEditRelationshipsUpdate) => void
  onUpdateRelationshipSelection: (selection: RelationshipSelectionState) => void
  onSetSelectedFields: (fields: ProjectField[]) => void
  onGoToStep: (step: WizardStep) => void
  onApply: () => void
  onOpenOptions: () => void
}

function TokenWarning({
  onClose,
  onOpenOptions,
}: {
  onClose: () => void
  onOpenOptions: () => void
}) {
  return (
    <Box
      sx={{
        p: 5,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        textAlign: 'center',
      }}
    >
      <Box sx={{ color: 'attention.fg' }}>
        <AlertIcon size={40} />
      </Box>
      <Box>
        <Heading as="h2" sx={{ m: 0, fontSize: 4, fontWeight: 'bold', mb: 2 }}>
          Token not set up
        </Heading>
        <Text as="p" sx={{ m: 0, fontSize: 1, color: 'fg.muted', maxWidth: 320 }}>
          Add your GitHub token to use bulk actions.
        </Text>
      </Box>
      <Box sx={{ display: 'flex', gap: 2 }}>
        <Button
          variant="default"
          onClick={onClose}
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
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={onOpenOptions}
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
          Set up token
        </Button>
      </Box>
    </Box>
  )
}

interface FieldsStepProps {
  count: number
  projectData: ProjectData | null
  selectedFields: ProjectField[]
  relationshipSelection: RelationshipSelectionState
  onToggleField: (f: ProjectField) => void
  onUpdateRelationshipSelection: (selection: RelationshipSelectionState) => void
  onSetSelectedFields: (fields: ProjectField[]) => void
  onClose: () => void
  onNext: () => void
}

function FieldsStep({
  count,
  projectData,
  selectedFields,
  relationshipSelection,
  onToggleField,
  onUpdateRelationshipSelection,
  onSetSelectedFields,
  onClose,
  onNext,
}: FieldsStepProps) {
  const defaultDataTypeKeys = ['ASSIGNEES', 'LABELS', 'ISSUE_TYPE', 'TITLE', 'BODY', 'COMMENT']
  const FIELD_ORDER: Record<string, number> = {
    TITLE: 0,
    BODY: 1,
    COMMENT: 2,
    ASSIGNEES: 3,
    LABELS: 4,
    ISSUE_TYPE: 5,
  }
  const projectFields = projectData?.fields ?? []
  const defaultFields = projectFields
    .filter(
      (field) =>
        defaultDataTypeKeys.includes(field.dataType) || field.name.toLowerCase() === 'type',
    )
    .sort((a, b) => (FIELD_ORDER[a.dataType] ?? 99) - (FIELD_ORDER[b.dataType] ?? 99))
  const customFields = projectFields.filter((field) => !defaultFields.includes(field))
  const eligibleCustomFields = customFields.filter((field) =>
    ['SINGLE_SELECT', 'ITERATION', 'TEXT', 'NUMBER', 'DATE'].includes(field.dataType),
  )
  const allEligibleFields = [...defaultFields, ...eligibleCustomFields]
  const selectedFieldIds = new Set(selectedFields.map((field) => field.id))
  const selectedRelationshipCount = getRelationshipSelectionCount(relationshipSelection)
  const totalSelectableCount = allEligibleFields.length + RELATIONSHIP_OPTIONS.length
  const selectedSelectableCount =
    allEligibleFields.filter((field) => selectedFieldIds.has(field.id)).length +
    selectedRelationshipCount
  const allSelected = totalSelectableCount > 0 && selectedSelectableCount === totalSelectableCount
  const canContinue = selectedFields.length > 0 || selectedRelationshipCount > 0

  const toggleRelationship = (key: RelationshipKey) => {
    onUpdateRelationshipSelection({
      ...relationshipSelection,
      [key]: !relationshipSelection[key],
    })
  }

  return (
    <>
      <ModalStepHeader
        title="Select Fields"
        icon={bulkEditHeaderIcon}
        subtitle={`Choose the fields and relationships to update on the ${count} selected item${count !== 1 ? 's' : ''}.`}
        step={1}
        totalSteps={3}
        onClose={onClose}
      />
      <Box sx={{ px: 4, pt: 2, pb: 1 }}>
        <Button
          variant="invisible"
          size="small"
          onClick={() => {
            onSetSelectedFields(allSelected ? [] : allEligibleFields)
            onUpdateRelationshipSelection(
              allSelected
                ? { parent: false, blockedBy: false, blocking: false }
                : { parent: true, blockedBy: true, blocking: true },
            )
          }}
          sx={{
            p: 0,
            color: 'accent.fg',
            fontSize: 1,
            fontWeight: 'bold',
            transition: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
            '&:hover:not(:disabled)': { transform: 'translateY(-1px)' },
            '&:active': { transform: 'translateY(0)', transition: '100ms' },
            '@media (prefers-reduced-motion: reduce)': {
              transition: 'none',
              '&:hover:not(:disabled)': { transform: 'none' },
            },
          }}
        >
          {allSelected ? 'Deselect all' : 'Select all'}
        </Button>
      </Box>

      <Box
        sx={{
          flex: 1,
          overflowY: 'auto',
          px: 4,
          py: 2,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        {projectData ? (
          <>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {defaultFields.map((field) => {
                const isSelected = selectedFieldIds.has(field.id)
                return (
                  <Tippy
                    key={field.id}
                    content={getFieldSelectionTooltip(field)}
                    delay={[400, 0]}
                    placement="top"
                    zIndex={Z_TOOLTIP}
                  >
                    <Box
                      as="button"
                      type="button"
                      onClick={() => onToggleField(field)}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 3,
                        width: '100%',
                        textAlign: 'left',
                        border: 'none',
                        borderRadius: 2,
                        bg: isSelected ? 'accent.subtle' : 'transparent',
                        px: 3,
                        py: 2,
                        cursor: 'pointer',
                        transition: 'background-color 150ms ease',
                        ':hover': { bg: isSelected ? 'accent.subtle' : 'canvas.subtle' },
                        '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
                      }}
                    >
                      <Checkbox
                        checked={isSelected}
                        onChange={() => {}}
                        sx={{ pointerEvents: 'none' }}
                      />
                      <Box
                        as="span"
                        sx={{ display: 'flex', alignItems: 'center', gap: 3, flex: 1, minWidth: 0 }}
                      >
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            flexShrink: 0,
                            color: isSelected ? 'accent.fg' : 'fg.default',
                          }}
                        >
                          {getFieldIcon(field.dataType)}
                        </Box>
                        <Text
                          sx={{
                            fontSize: 1,
                            fontWeight: 'bold',
                            color: isSelected ? 'accent.fg' : 'fg.default',
                            flex: 1,
                          }}
                        >
                          {field.name}
                        </Text>
                      </Box>
                    </Box>
                  </Tippy>
                )
              })}
            </Box>

            {eligibleCustomFields.length > 0 && (
              <Box>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    mb: 2,
                  }}
                >
                  <Text sx={{ fontSize: 1, fontWeight: 'bold', color: 'fg.default' }}>
                    Custom Fields
                  </Text>
                  <GearIcon color="var(--fgColor-muted)" />
                </Box>
                <Box
                  sx={{
                    border: '1px solid',
                    borderColor: 'border.default',
                    borderRadius: 2,
                    overflow: 'hidden',
                  }}
                >
                  <Box
                    sx={{
                      bg: 'canvas.subtle',
                      px: 3,
                      py: 2,
                      borderBottom: '1px solid',
                      borderColor: 'border.default',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 2,
                    }}
                  >
                    <ProjectBoardIcon color="var(--fgColor-muted)" />
                    <Text sx={{ fontSize: 1, fontWeight: 'bold', color: 'fg.default' }}>
                      {projectData.title}
                    </Text>
                  </Box>
                  <Box sx={{ display: 'flex', flexDirection: 'column', p: 1 }}>
                    {eligibleCustomFields.map((field) => {
                      const isSelected = selectedFieldIds.has(field.id)
                      return (
                        <Tippy
                          key={field.id}
                          content={getFieldSelectionTooltip(field)}
                          delay={[400, 0]}
                          placement="top"
                          zIndex={Z_TOOLTIP}
                        >
                          <Box
                            as="button"
                            type="button"
                            onClick={() => onToggleField(field)}
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 3,
                              width: '100%',
                              textAlign: 'left',
                              border: 'none',
                              borderRadius: 2,
                              bg: isSelected ? 'accent.subtle' : 'transparent',
                              px: 2,
                              py: 2,
                              cursor: 'pointer',
                              transition: 'background-color 150ms ease',
                              ':hover': { bg: isSelected ? 'accent.subtle' : 'canvas.subtle' },
                              '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
                            }}
                          >
                            <Checkbox
                              checked={isSelected}
                              onChange={() => {}}
                              sx={{ pointerEvents: 'none' }}
                            />
                            <Box
                              as="span"
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 3,
                                flex: 1,
                                minWidth: 0,
                              }}
                            >
                              <Box
                                sx={{
                                  display: 'flex',
                                  flexShrink: 0,
                                  color: isSelected ? 'accent.fg' : 'fg.default',
                                }}
                              >
                                {getFieldIcon(field.dataType)}
                              </Box>
                              <Text
                                sx={{
                                  fontSize: 1,
                                  fontWeight: 500,
                                  color: isSelected ? 'accent.fg' : 'fg.default',
                                  flex: 1,
                                }}
                              >
                                {field.name}
                              </Text>
                            </Box>
                            <Text
                              sx={{
                                fontSize: 0,
                                px: 1,
                                py: '2px',
                                bg: 'neutral.muted',
                                color: 'fg.muted',
                                borderRadius: 2,
                              }}
                            >
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
          </>
        ) : (
          <Box sx={{ py: 4, textAlign: 'center', color: 'fg.muted', fontSize: 1 }}>
            Loading fields…
          </Box>
        )}

        <Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2 }}>
            <Text sx={{ fontSize: 1, fontWeight: 'bold', color: 'fg.default' }}>Relationships</Text>
            <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
              Choose which relationship categories to edit in the next step.
            </Text>
          </Box>
          <Box
            sx={{
              border: '1px solid',
              borderColor: 'border.default',
              borderRadius: 2,
              overflow: 'hidden',
            }}
          >
            {RELATIONSHIP_OPTIONS.map((relationship, index) => {
              const isSelected = relationshipSelection[relationship.key]
              return (
                <Tippy
                  key={relationship.key}
                  content={getRelationshipSelectionTooltip(relationship.label)}
                  delay={[400, 0]}
                  placement="top"
                  zIndex={Z_TOOLTIP}
                >
                  <Box
                    as="button"
                    type="button"
                    onClick={() => toggleRelationship(relationship.key)}
                    sx={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 3,
                      width: '100%',
                      textAlign: 'left',
                      border: 'none',
                      borderTop: index === 0 ? 'none' : '1px solid',
                      borderColor: 'border.default',
                      bg: isSelected ? 'accent.subtle' : 'transparent',
                      px: 3,
                      py: 3,
                      cursor: 'pointer',
                      transition: 'background-color 150ms ease',
                      ':hover': { bg: isSelected ? 'accent.subtle' : 'canvas.subtle' },
                      '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
                    }}
                  >
                    <Checkbox
                      checked={isSelected}
                      onChange={() => {}}
                      sx={{ pointerEvents: 'none', mt: '2px' }}
                    />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Text
                        sx={{
                          display: 'block',
                          fontSize: 1,
                          fontWeight: 'bold',
                          color: isSelected ? 'accent.fg' : 'fg.default',
                        }}
                      >
                        {relationship.label}
                      </Text>
                      <Text sx={{ display: 'block', fontSize: 0, color: 'fg.muted', mt: 1 }}>
                        {relationship.description}
                      </Text>
                    </Box>
                  </Box>
                </Tippy>
              )
            })}
          </Box>
        </Box>
      </Box>

      <Box
        sx={{
          px: 4,
          py: 3,
          borderTop: '1px solid',
          borderColor: 'border.default',
          display: 'flex',
          justifyContent: 'flex-end',
        }}
      >
        <Button
          variant="primary"
          disabled={!canContinue}
          onClick={onNext}
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
  relationships: BulkEditRelationshipsUpdate
  relationshipSelection: RelationshipSelectionState
  hasChanges: boolean
  owner: string
  firstRepoName: string
  onUpdateFieldValue: (id: string, v: unknown) => void
  onUpdateRelationships: (relationships: BulkEditRelationshipsUpdate) => void
  onClose: () => void
  onBack: () => void
  onNext: () => void
}

function ValuesStep({
  count,
  selectedFields,
  fieldValues,
  relationships,
  relationshipSelection,
  hasChanges,
  owner,
  firstRepoName,
  onUpdateFieldValue,
  onUpdateRelationships,
  onClose,
  onBack,
  onNext,
}: ValuesStepProps) {
  const hasRelationshipSections = getRelationshipSelectionCount(relationshipSelection) > 0

  return (
    <>
      <ModalStepHeader
        title="Set Values"
        icon={bulkEditHeaderIcon}
        subtitle={`Assign new values for the selected fields${hasRelationshipSections ? ' and relationships' : ''}.`}
        step={2}
        totalSteps={3}
        onBack={onBack}
        onClose={onClose}
      />
      <Box
        sx={{
          flex: 1,
          overflowY: 'auto',
          px: 4,
          py: 3,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        {selectedFields.map((field) => {
          const isDefault =
            ['ASSIGNEES', 'LABELS', 'MILESTONE', 'ISSUE_TYPE'].includes(field.dataType) ||
            field.name.toLowerCase() === 'type'
          const value = (fieldValues[field.id] || {}) as Record<string, unknown>
          let inputContent: React.ReactNode = null

          if (field.dataType === 'SINGLE_SELECT' && field.options) {
            inputContent = (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                {field.options.map((opt) => {
                  const isSelected = value.singleSelectOptionId === opt.id
                  return (
                    <Tippy
                      key={opt.id}
                      content={getFieldOptionTooltip(field.name, opt.name)}
                      delay={[400, 0]}
                      placement="top"
                      zIndex={Z_TOOLTIP}
                    >
                      <Box
                        as="button"
                        type="button"
                        onClick={() =>
                          onUpdateFieldValue(field.id, { singleSelectOptionId: opt.id })
                        }
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 2,
                          px: 3,
                          py: 1,
                          border: '1px solid',
                          borderColor: isSelected ? 'accent.emphasis' : 'border.default',
                          borderRadius: 2,
                          bg: isSelected ? 'canvas.subtle' : 'transparent',
                          cursor: 'pointer',
                          transition: 'all 150ms ease',
                          '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
                        }}
                      >
                        <Box as="span" sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          <Box
                            sx={{
                              width: 10,
                              height: 10,
                              borderRadius: '50%',
                              bg: opt.color ? undefined : 'border.default',
                            }}
                            style={opt.color ? { backgroundColor: opt.color } : undefined}
                          />
                          <Text sx={{ color: 'fg.default', fontSize: 1, fontWeight: 500 }}>
                            {opt.name}
                          </Text>
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
                {field.configuration.iterations.map((iter) => {
                  const isSelected = value.iterationId === iter.id
                  return (
                    <Tippy
                      key={iter.id}
                      content={getFieldOptionTooltip(field.name, iter.title)}
                      delay={[400, 0]}
                      placement="top"
                      zIndex={Z_TOOLTIP}
                    >
                      <Box
                        as="button"
                        type="button"
                        onClick={() => onUpdateFieldValue(field.id, { iterationId: iter.id })}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          px: 3,
                          py: 2,
                          border: '1px solid',
                          borderColor: isSelected ? 'accent.emphasis' : 'border.default',
                          borderRadius: 2,
                          bg: isSelected ? 'canvas.subtle' : 'transparent',
                          cursor: 'pointer',
                          transition: 'all 150ms ease',
                          '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
                        }}
                      >
                        <Box
                          as="span"
                          sx={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'flex-start',
                          }}
                        >
                          <Text sx={{ color: 'fg.default', fontSize: 1, fontWeight: 'bold' }}>
                            {iter.title}
                          </Text>
                          <Text sx={{ color: 'fg.muted', fontSize: 0, mt: '2px' }}>
                            {iter.startDate}
                          </Text>
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
                  value={
                    (value.array as {
                      id: string
                      name: string
                      color?: string
                      avatarUrl?: string
                    }[]) || []
                  }
                  onChange={(arr) => onUpdateFieldValue(field.id, { array: arr })}
                  placeholder={`Select ${field.name.toLowerCase()}`}
                />
              </Box>
            )
          } else if (field.dataType === 'ISSUE_TYPE' || field.name.toLowerCase() === 'type') {
            inputContent = (
              <Box sx={{ width: '100%' }}>
                <RepoMetadataSelectPanel
                  type="ISSUE_TYPES"
                  owner={owner}
                  repoName={firstRepoName || ''}
                  value={
                    (value.array as {
                      id: string
                      name: string
                      color?: string
                      description?: string
                    }[]) || []
                  }
                  onChange={(arr) =>
                    onUpdateFieldValue(field.id, {
                      ...((fieldValues[field.id] as Record<string, unknown>) || {}),
                      array: arr,
                      dataType: 'ISSUE_TYPE',
                    })
                  }
                  placeholder={
                    firstRepoName
                      ? 'Select issue type'
                      : 'Repository not detected - please open a project with issues'
                  }
                  singleSelect
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
                onChange={(e) => onUpdateFieldValue(field.id, { date: e.target.value })}
              />
            )
          } else if (field.dataType === 'NUMBER') {
            inputContent = (
              <TextInput
                block
                type="number"
                placeholder="Enter number..."
                value={(value.number as number | '') ?? ''}
                onChange={(e) =>
                  onUpdateFieldValue(field.id, {
                    number: e.target.value === '' ? undefined : parseFloat(e.target.value),
                  })
                }
              />
            )
          } else if (field.dataType === 'TITLE') {
            inputContent = (
              <TextInput
                block
                placeholder="New title for all selected items..."
                value={(value.text as string) || ''}
                onChange={(e) => onUpdateFieldValue(field.id, { text: e.target.value })}
              />
            )
          } else if (field.dataType === 'BODY') {
            inputContent = (
              <Box sx={{ width: '100%' }}>
                <MarkdownTextarea
                  value={(value.text as string) || ''}
                  onChange={(text) => onUpdateFieldValue(field.id, { text })}
                  placeholder="Set description for all selected items (replaces existing)..."
                />
              </Box>
            )
          } else if (field.dataType === 'COMMENT') {
            inputContent = (
              <Box sx={{ width: '100%' }}>
                <MarkdownTextarea
                  value={(value.text as string) || ''}
                  onChange={(text) => onUpdateFieldValue(field.id, { text })}
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
                onChange={(e) => onUpdateFieldValue(field.id, { text: e.target.value })}
              />
            )
          }

          return (
            <FormControl key={field.id} sx={{ width: '100%' }}>
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
                <Tippy
                  content={getFieldValueStepTooltip(field, count)}
                  delay={[400, 0]}
                  placement="top"
                  zIndex={Z_TOOLTIP}
                >
                  <Box as="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                    {getFieldIcon(field.dataType) && (
                      <Box sx={{ color: 'fg.muted', display: 'flex' }}>
                        {getFieldIcon(field.dataType)}
                      </Box>
                    )}
                    {field.name}
                  </Box>
                </Tippy>
              </FormControl.Label>
              {inputContent}
            </FormControl>
          )
        })}

        {hasRelationshipSections && (
          <RelationshipsSection
            owner={owner}
            repoName={firstRepoName || undefined}
            relationshipSelection={relationshipSelection}
            relationships={relationships}
            onUpdateRelationships={onUpdateRelationships}
          />
        )}
      </Box>

      <Box
        sx={{
          px: 4,
          py: 3,
          borderTop: '1px solid',
          borderColor: 'border.default',
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <Button
          variant="default"
          onClick={onBack}
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
          ← Back
        </Button>
        <Button
          variant="primary"
          disabled={!hasChanges}
          onClick={onNext}
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
          Review Changes →
        </Button>
      </Box>
    </>
  )
}

interface SummaryStepProps {
  count: number
  selectedFields: ProjectField[]
  fieldValues: Record<string, unknown>
  relationships: BulkEditRelationshipsUpdate
  hasChanges: boolean
  validationErrors: string[]
  concurrentError: boolean
  applyBtnRef: React.RefObject<HTMLButtonElement | null>
  onClose: () => void
  onBack: () => void
  onApply: () => void
}

function SummaryStep({
  count,
  selectedFields,
  fieldValues,
  relationships,
  hasChanges,
  validationErrors,
  concurrentError,
  applyBtnRef,
  onClose,
  onBack,
  onApply,
}: SummaryStepProps) {
  const rows: RelationshipSummaryRow[] = [
    ...selectedFields.map((field) => ({
      label: field.name,
      value: describeFieldValue(field, fieldValues),
    })),
    ...buildRelationshipSummaryRows(relationships),
  ]

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
        {rows.length > 0 ? (
          <Box
            sx={{
              bg: 'canvas.subtle',
              border: '1px solid',
              borderColor: 'border.default',
              borderRadius: 2,
              overflow: 'hidden',
            }}
          >
            {rows.map((row, index) => (
              <Box
                key={`${row.label}-${row.value}-${index}`}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  px: 3,
                  py: 3,
                  borderBottom: index < rows.length - 1 ? '1px solid' : 'none',
                  borderColor: 'border.default',
                }}
              >
                <Text sx={{ flex: 1, color: 'fg.muted', fontSize: 1, fontWeight: 500 }}>
                  {row.label}
                </Text>
                <Text
                  sx={{
                    flex: 1,
                    color: 'fg.default',
                    fontSize: 1,
                    fontWeight: 'bold',
                    textAlign: 'right',
                  }}
                >
                  {row.value}
                </Text>
              </Box>
            ))}
          </Box>
        ) : (
          <Box sx={{ py: 5, textAlign: 'center', color: 'fg.muted', fontSize: 1 }}>
            No changes configured yet.
          </Box>
        )}
      </Box>

      <Box
        sx={{
          px: 4,
          py: 3,
          borderTop: '1px solid',
          borderColor: 'border.default',
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
        }}
      >
        {validationErrors.length > 0 && (
          <Flash variant="danger">
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Text sx={{ fontSize: 1, fontWeight: 'bold' }}>
                Fix these relationship conflicts before applying:
              </Text>
              <Box as="ul" sx={{ m: 0, pl: 3 }}>
                {validationErrors.slice(0, 5).map((error) => (
                  <Box as="li" key={error} sx={{ mb: 1, fontSize: 0 }}>
                    {error}
                  </Box>
                ))}
                {validationErrors.length > 5 && (
                  <Box as="li" sx={{ fontSize: 0 }}>
                    {validationErrors.length - 5} more conflict
                    {validationErrors.length - 5 !== 1 ? 's' : ''}.
                  </Box>
                )}
              </Box>
            </Box>
          </Flash>
        )}
        {concurrentError && (
          <Flash variant="warning">
            3 processes are already running. Wait for one to finish before starting another.
          </Flash>
        )}
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Button
            variant="default"
            onClick={onBack}
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
            ← Back
          </Button>
          <Button
            ref={applyBtnRef}
            variant="primary"
            disabled={!hasChanges}
            onClick={onApply}
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
            Apply to {count} Item{count !== 1 ? 's' : ''}
          </Button>
        </Box>
      </Box>
    </>
  )
}

export function BulkEditWizard({
  count,
  step,
  projectData,
  selectedFields,
  fieldValues,
  relationships,
  relationshipSelection,
  hasChanges,
  validationErrors,
  concurrentError,
  owner,
  firstRepoName,
  applyBtnRef,
  onClose,
  onToggleField,
  onUpdateFieldValue,
  onUpdateRelationships,
  onUpdateRelationshipSelection,
  onSetSelectedFields,
  onGoToStep,
  onApply,
  onOpenOptions,
}: WizardProps) {
  useEffect(() => {
    ensureTippyCss()
  }, [])

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
          width: 'min(720px, 92vw)',
          maxHeight: '82vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: 'none',
          animation: 'fadeSlideIn 200ms cubic-bezier(0.4, 0, 0.2, 1)',
          '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
        }}
      >
        {step === 'TOKEN_WARNING' && (
          <TokenWarning onClose={onClose} onOpenOptions={onOpenOptions} />
        )}
        {step === 'FIELDS' && (
          <FieldsStep
            count={count}
            projectData={projectData}
            selectedFields={selectedFields}
            relationshipSelection={relationshipSelection}
            onToggleField={onToggleField}
            onUpdateRelationshipSelection={onUpdateRelationshipSelection}
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
            relationships={relationships}
            relationshipSelection={relationshipSelection}
            hasChanges={hasChanges}
            owner={owner}
            firstRepoName={firstRepoName}
            onUpdateFieldValue={onUpdateFieldValue}
            onUpdateRelationships={onUpdateRelationships}
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
            relationships={relationships}
            hasChanges={hasChanges}
            validationErrors={validationErrors}
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
