import React from 'react'
import { Box, Button, Checkbox, Flash, Text } from '@primer/react'
import { CopyIcon } from '@/ui/icons'
import { ModalStepHeader } from '@/ui/modal-step-header'
import {
  bulkDuplicateHeaderIcon,
  buttonMotionSx,
  prefixLabelIcon,
  sectionGroupMeta,
  sectionGroupOrder,
  sectionLabel,
  type DuplicateSection,
  type SectionId,
} from '@/features/bulk-duplicate-utils'

export function SelectSectionsStep({
  sections,
  selectedSections,
  onToggleSection,
  onSelectAll,
  onDeselectAll,
  onClose,
  onNext,
}: {
  sections: DuplicateSection[]
  selectedSections: SectionId[]
  onToggleSection: (sectionId: SectionId) => void
  onSelectAll: () => void
  onDeselectAll: () => void
  onClose: () => void
  onNext: () => void
}) {
  const allSelected =
    sections.length > 0 && sections.every((section) => selectedSections.includes(section.id))

  return (
    <>
      <ModalStepHeader
        title="Select Sections"
        icon={bulkDuplicateHeaderIcon}
        subtitle="Choose which details to carry over to the duplicated item."
        step={1}
        totalSteps={2}
        onClose={onClose}
      />
      <Box
        sx={{
          px: 4,
          pt: 2,
          pb: 1,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 3,
        }}
      >
        <Button
          variant="invisible"
          size="small"
          onClick={allSelected ? onDeselectAll : onSelectAll}
          sx={{ p: 0, color: 'accent.fg', fontSize: 1, fontWeight: 'bold', ...buttonMotionSx }}
        >
          {allSelected ? 'Deselect all' : 'Select all'}
        </Button>
        <Text sx={{ fontSize: 0, color: 'fg.muted', textAlign: 'right' }}>
          If Title is skipped, the duplicate falls back to the original title.
        </Text>
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
        {sectionGroupOrder.map((group) => {
          const groupSections = sections.filter((section) => section.group === group)
          if (groupSections.length === 0) return null

          return (
            <Box key={group} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Text sx={sectionLabel}>
                <Box as="span" sx={prefixLabelIcon}>
                  {sectionGroupMeta[group].icon}
                </Box>
                {sectionGroupMeta[group].label}
              </Text>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {groupSections.map((section) => {
                  const isSelected = selectedSections.includes(section.id)
                  return (
                    <Box
                      key={section.id}
                      as="button"
                      type="button"
                      onClick={() => onToggleSection(section.id)}
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
                          {section.icon}
                        </Box>
                        <Box
                          sx={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}
                        >
                          <Text
                            sx={{
                              fontSize: 1,
                              fontWeight: 'bold',
                              color: isSelected ? 'accent.fg' : 'fg.default',
                            }}
                          >
                            {section.label}
                          </Text>
                          {section.helperText && (
                            <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
                              {section.helperText}
                            </Text>
                          )}
                        </Box>
                      </Box>
                      {section.badge && (
                        <Text
                          sx={{
                            fontSize: 0,
                            px: 1,
                            py: '2px',
                            bg: 'neutral.muted',
                            color: 'fg.muted',
                            borderRadius: 2,
                            flexShrink: 0,
                          }}
                        >
                          {section.badge}
                        </Text>
                      )}
                    </Box>
                  )
                })}
              </Box>
            </Box>
          )
        })}
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
        <Button variant="primary" onClick={onNext} sx={buttonMotionSx}>
          Next: Review →
        </Button>
      </Box>
    </>
  )
}

export function ReviewStep({
  sections,
  diffStatus,
  concurrentError,
  duplicateBtnRef,
  onClose,
  onBack,
  onDuplicate,
  renderSection,
}: {
  sections: DuplicateSection[]
  diffStatus: (sectionId: SectionId) => 'edited' | 'same'
  concurrentError: boolean
  duplicateBtnRef: React.RefObject<HTMLButtonElement | null>
  onClose: () => void
  onBack: () => void
  onDuplicate: () => void
  renderSection: (section: DuplicateSection) => React.ReactNode
}) {
  return (
    <>
      <ModalStepHeader
        title="Review & Duplicate"
        icon={bulkDuplicateHeaderIcon}
        subtitle="Edit and confirm each section before creating the duplicate."
        step={2}
        totalSteps={2}
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
        {sections.length === 0 ? (
          <Box sx={{ py: 6, textAlign: 'center', color: 'fg.muted', fontSize: 1 }}>
            No sections selected. The duplicate will use the original title only.
          </Box>
        ) : (
          sectionGroupOrder.map((group) => {
            const groupSections = sections.filter((section) => section.group === group)
            if (groupSections.length === 0) return null

            return (
              <Box key={group} sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <Text sx={sectionLabel}>
                  <Box as="span" sx={prefixLabelIcon}>
                    {sectionGroupMeta[group].icon}
                  </Box>
                  {sectionGroupMeta[group].label}
                </Text>
                {groupSections.map((section) => (
                  <Box key={section.id} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {renderSection(section)}
                    {/* §11.6 — diff badge appears under each editor so the user
                        sees at a glance which rows are edited vs unchanged. */}
                    <Text
                      data-testid={`rgp-duplicate-diff-badge-${section.id}`}
                      data-diff-status={diffStatus(section.id)}
                      sx={{
                        fontSize: 0,
                        color: diffStatus(section.id) === 'edited' ? 'accent.fg' : 'fg.muted',
                      }}
                    >
                      {diffStatus(section.id) === 'edited' ? '· edited' : '· same as source'}
                    </Text>
                  </Box>
                ))}
              </Box>
            )
          })
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
        {concurrentError && (
          <Flash variant="warning">
            3 duplications are already in progress. Wait for one to finish before starting another.
          </Flash>
        )}
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Button variant="default" onClick={onBack} sx={buttonMotionSx}>
            ← Back
          </Button>
          <Button
            ref={duplicateBtnRef}
            variant="primary"
            onClick={onDuplicate}
            sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, ...buttonMotionSx }}
            data-testid="rgp-duplicate-confirm"
          >
            <CopyIcon size={14} />
            Duplicate Item →
          </Button>
        </Box>
      </Box>
    </>
  )
}
