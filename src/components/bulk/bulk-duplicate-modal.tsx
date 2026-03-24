import React, { useEffect, useRef, useState } from 'react'
import Tippy from '../ui/tooltip'
import { Box, Button, Flash, FormControl, Spinner, Text, TextInput } from '@primer/react'
import { sendMessage, ItemPreviewData } from '../../lib/messages'
import { queueStore } from '../../lib/queue-store'
import { flyToTracker } from '../../lib/fly-animation'
import { RepoMetadataSelectPanel, type RepoMetadataItem } from '../ui/repo-metadata-select-panel'
import { MarkdownTextarea } from '../ui/markdown-textarea'
import {
  CalendarIcon,
  CheckIcon,
  CopyIcon,
  HashIcon,
  OptionsSelectIcon,
  PersonIcon,
  ProjectBoardIcon,
  SyncIcon,
  TagIcon,
  TextLineIcon,
} from '../ui/primitives'
import { ModalStepHeader } from '../ui/modal-step-header'
import { Z_MODAL, Z_TOOLTIP } from '../../lib/z-index'
import { ensureTippyCss } from '../../lib/tippy-utils'

type Step = 'LOADING' | 'PREVIEW' | 'ERROR'

interface Props {
  itemId: string
  projectId: string
  owner: string
  isOrg: boolean
  projectNumber: number
  onClose: () => void
}

type EditableField = ItemPreviewData['fields'][number]

const sectionLabel = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 2,
  fontSize: 0 as const,
  fontWeight: 'bold' as const,
  textTransform: 'uppercase' as const,
  color: 'fg.muted' as const,
  letterSpacing: '0.05em',
}

const prefixLabelIcon = {
  color: 'fg.muted' as const,
  display: 'flex' as const,
  alignItems: 'center' as const,
  flexShrink: 0 as const,
}

function getFieldIcon(dataType: EditableField['dataType']): React.ReactNode {
  switch (dataType) {
    case 'TEXT':
      return <TextLineIcon size={14} />
    case 'NUMBER':
      return <HashIcon size={14} />
    case 'DATE':
      return <CalendarIcon size={14} />
    case 'SINGLE_SELECT':
      return <OptionsSelectIcon size={14} />
    case 'ITERATION':
      return <SyncIcon size={14} />
    default:
      return null
  }
}

function getFieldOptionTooltip(fieldName: string, optionName: string): string {
  return `Set ${fieldName} to ${optionName}.`
}

function duplicateValueTooltip(fieldName: string): string {
  return `Value applied to the duplicated item for ${fieldName}.`
}

export function BulkDuplicateModal({ itemId, projectId, owner, isOrg, projectNumber, onClose }: Props) {
  ensureTippyCss()
  const [step, setStep] = useState<Step>('LOADING')
  const [preview, setPreview] = useState<ItemPreviewData | null>(null)
  const [error, setError] = useState<string>('')
  const [concurrentError, setConcurrentError] = useState(false)
  const duplicateBtnRef = useRef<HTMLButtonElement | null>(null)

  const [editedTitle, setEditedTitle] = useState('')
  const [editedBody, setEditedBody] = useState('')
  const [editedAssignees, setEditedAssignees] = useState<RepoMetadataItem[]>([])
  const [editedLabels, setEditedLabels] = useState<RepoMetadataItem[]>([])
  const [editedFields, setEditedFields] = useState<EditableField[]>([])

  useEffect(() => {
    sendMessage('getItemPreview', { itemId, owner, number: projectNumber, isOrg })
      .then(data => {
        setPreview(data)
        setEditedTitle(data.title)
        setEditedBody(data.body)
        setEditedAssignees(data.assignees.map(a => ({ id: a.id, name: a.login, avatarUrl: a.avatarUrl })))
        setEditedLabels(data.labels)
        setEditedFields(data.fields)
        setStep('PREVIEW')
      })
      .catch((e: Error) => {
        console.error('[rgp] getItemPreview failed', e)
        setError(e.message || 'Failed to load item details')
        setStep('ERROR')
      })
  }, [])

  function updateField(fieldId: string, patch: Partial<EditableField>) {
    setEditedFields(prev => prev.map(f => f.fieldId === fieldId ? { ...f, ...patch } : f))
  }

  function buildFieldValue(f: EditableField): Record<string, unknown> {
    if (f.dataType === 'TEXT') return { text: f.text ?? '' }
    if (f.dataType === 'SINGLE_SELECT') return { singleSelectOptionId: f.optionId ?? '' }
    if (f.dataType === 'ITERATION') return { iterationId: f.iterationId ?? '' }
    if (f.dataType === 'NUMBER') return { number: f.number ?? 0 }
    if (f.dataType === 'DATE') return { date: f.date ?? '' }
    return {}
  }

  async function handleDuplicate() {
    if (queueStore.getActiveCount() >= 3) { setConcurrentError(true); return }
    setConcurrentError(false)
    const rect = duplicateBtnRef.current?.getBoundingClientRect()
    if (rect) flyToTracker(rect)
    sendMessage('duplicateItem', {
      itemId: preview?.resolvedItemId || itemId,
      projectId: preview?.projectId || projectId,
      overrides: {
        title: editedTitle,
        body: editedBody,
        assigneeIds: editedAssignees.map(a => a.id),
        labelIds: editedLabels.map(l => l.id),
        fieldValues: editedFields.map(f => ({ fieldId: f.fieldId, value: buildFieldValue(f) })),
      },
    })
    onClose()
  }

  const repoOwner = preview?.repoOwner || owner
  const repoName = preview?.repoName || ''

  return (
    <Box
      sx={{
        position: 'fixed', inset: 0,
        bg: 'rgba(27,31,36,0.5)', zIndex: Z_MODAL,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onKeyDown={(e: React.KeyboardEvent) => { e.stopPropagation(); if (e.key === 'Escape') onClose() }}
      onKeyUp={(e: React.KeyboardEvent) => e.stopPropagation()}
    >
      <Box sx={{
        bg: 'canvas.overlay', border: '1px solid', borderColor: 'border.default',
        borderRadius: 2, width: 'min(640px, 90vw)', maxHeight: '80vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: 'none',
      }}>
        <ModalStepHeader
          title="Deep Duplicate"
          icon={<CopyIcon size={16} />}
          subtitle={
            step === 'LOADING'
              ? 'Loading item details…'
              : step === 'ERROR'
                ? 'Something went wrong while loading the item.'
                : undefined
          }
          onClose={onClose}
        />

        {/* Loading */}
        {step === 'LOADING' && (
          <Box sx={{ py: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, color: 'fg.muted' }}>
            <Spinner size="large" />
            <Text sx={{ fontSize: 1 }}>Loading item details…</Text>
          </Box>
        )}

        {/* Error */}
        {step === 'ERROR' && (
          <Box sx={{ px: 4, py: 5, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <Flash variant="danger" sx={{ width: '100%' }}>
              {error || 'An error occurred.'}
            </Flash>
            <Button variant="default" onClick={onClose} sx={{
              boxShadow: 'none',
              transition: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
              '&:hover:not(:disabled)': { transform: 'translateY(-1px)' },
              '&:active': { transform: 'translateY(0)', transition: '100ms' },
              '@media (prefers-reduced-motion: reduce)': {
                transition: 'none',
                '&:hover:not(:disabled)': { transform: 'none' },
              },
            }}>Close</Button>
          </Box>
        )}

        {/* Preview */}
        {step === 'PREVIEW' && (
          <>
            <Box sx={{ flex: 1, overflowY: 'auto', px: 4, py: 3, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {/* Title */}
              <FormControl sx={{ width: '100%' }}>
                <FormControl.Label sx={{ display: 'flex', alignItems: 'center', gap: 2, fontWeight: 'bold', width: 'fit-content', cursor: 'help' }}>
                  <Tippy content={duplicateValueTooltip('title')} delay={[400, 0]} placement="top" zIndex={Z_TOOLTIP}>
                    <Box as="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                      <Box sx={prefixLabelIcon}><TextLineIcon size={14} /></Box>
                      Title
                    </Box>
                  </Tippy>
                </FormControl.Label>
                <TextInput block value={editedTitle} onChange={e => setEditedTitle(e.target.value)} />
              </FormControl>

              {/* Body */}
              <FormControl sx={{ width: '100%' }}>
                <FormControl.Label sx={{ display: 'flex', alignItems: 'center', gap: 2, fontWeight: 'bold', width: 'fit-content', cursor: 'help' }}>
                  <Tippy content={duplicateValueTooltip('description')} delay={[400, 0]} placement="top" zIndex={Z_TOOLTIP}>
                    <Box as="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                      <Box sx={prefixLabelIcon}><TextLineIcon size={14} /></Box>
                      Description
                    </Box>
                  </Tippy>
                </FormControl.Label>
                <Box sx={{ width: '100%' }}>
                  <MarkdownTextarea
                    value={editedBody}
                    onChange={setEditedBody}
                    placeholder="Enter description (supports markdown)..."
                    rows={6}
                  />
                </Box>
              </FormControl>

              {/* People section */}
              <Box sx={{ borderTop: '1px solid', borderColor: 'border.default', pt: 3 }}>
                <Text sx={sectionLabel}>
                  <Box as="span" sx={prefixLabelIcon}><PersonIcon size={14} /></Box>
                  People
                </Text>
              </Box>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, width: '100%' }}>
                <Tippy content={duplicateValueTooltip('assignees')} delay={[400, 0]} placement="top" zIndex={Z_TOOLTIP}>
                  <Text sx={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 1, fontWeight: 'bold', color: 'fg.default', width: 'fit-content', cursor: 'help' }}>
                    <Box as="span" sx={prefixLabelIcon}><PersonIcon size={14} /></Box>
                    Assignees
                  </Text>
                </Tippy>
                <Box sx={{ width: '100%' }}>
                  <RepoMetadataSelectPanel
                    type="ASSIGNEES"
                    owner={repoOwner}
                    repoName={repoName}
                    value={editedAssignees}
                    onChange={setEditedAssignees}
                    placeholder="Select assignees"
                  />
                </Box>
              </Box>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, width: '100%' }}>
                <Tippy content={duplicateValueTooltip('labels')} delay={[400, 0]} placement="top" zIndex={Z_TOOLTIP}>
                  <Text sx={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 1, fontWeight: 'bold', color: 'fg.default', width: 'fit-content', cursor: 'help' }}>
                    <Box as="span" sx={prefixLabelIcon}><TagIcon size={14} /></Box>
                    Labels
                  </Text>
                </Tippy>
                <Box sx={{ width: '100%' }}>
                  <RepoMetadataSelectPanel
                    type="LABELS"
                    owner={repoOwner}
                    repoName={repoName}
                    value={editedLabels}
                    onChange={setEditedLabels}
                    placeholder="Select labels"
                  />
                </Box>
              </Box>

              {preview?.issueTypeName && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, width: '100%' }}>
                  <Tippy content={duplicateValueTooltip('issue type')} delay={[400, 0]} placement="top" zIndex={Z_TOOLTIP}>
                    <Text sx={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 1, fontWeight: 'bold', color: 'fg.default', width: 'fit-content', cursor: 'help' }}>
                      <Box as="span" sx={prefixLabelIcon}><OptionsSelectIcon size={14} /></Box>
                      Type
                    </Text>
                  </Tippy>
                  <Text sx={{ fontSize: 1, color: 'fg.muted' }}>{preview.issueTypeName}</Text>
                </Box>
              )}

              {/* Project fields section */}
              {editedFields.length > 0 && (
                <>
                  <Box sx={{ borderTop: '1px solid', borderColor: 'border.default', pt: 3 }}>
                    <Text sx={sectionLabel}>
                      <Box as="span" sx={prefixLabelIcon}><ProjectBoardIcon size={14} /></Box>
                      Project Fields
                    </Text>
                  </Box>

                  {editedFields.map(field => (
                    <Box key={field.fieldId} sx={{ display: 'flex', flexDirection: 'column', gap: 1, width: '100%' }}>
                      {field.dataType === 'TEXT' && (
                        <FormControl sx={{ width: '100%' }}>
                          <FormControl.Label sx={{ display: 'flex', alignItems: 'center', gap: 2, fontWeight: 'bold', width: 'fit-content', cursor: 'help' }}>
                            <Tippy content={duplicateValueTooltip(field.fieldName)} delay={[400, 0]} placement="top" zIndex={Z_TOOLTIP}>
                              <Box as="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                                {getFieldIcon(field.dataType) && (
                                  <Box sx={prefixLabelIcon}>{getFieldIcon(field.dataType)}</Box>
                                )}
                                {field.fieldName}
                              </Box>
                            </Tippy>
                          </FormControl.Label>
                          <TextInput block value={field.text ?? ''} onChange={e => updateField(field.fieldId, { text: e.target.value })} />
                        </FormControl>
                      )}

                      {field.dataType === 'SINGLE_SELECT' && field.options && (
                        <>
                          <Tippy content={duplicateValueTooltip(field.fieldName)} delay={[400, 0]} placement="top" zIndex={Z_TOOLTIP}>
                            <Text sx={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 1, fontWeight: 'bold', color: 'fg.default', width: 'fit-content', cursor: 'help' }}>
                              {getFieldIcon(field.dataType) && (
                                <Box as="span" sx={prefixLabelIcon}>{getFieldIcon(field.dataType)}</Box>
                              )}
                              {field.fieldName}
                            </Text>
                          </Tippy>
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                            {field.options.map(opt => {
                              const isSelected = field.optionId === opt.id
                              return (
                                <Tippy
                                  key={opt.id}
                                  content={getFieldOptionTooltip(field.fieldName, opt.name)}
                                  delay={[400, 0]}
                                  placement="top"
                                  zIndex={Z_TOOLTIP}
                                >
                                  <Box
                                    as="button"
                                    type="button"
                                    aria-pressed={isSelected}
                                    onClick={() => updateField(field.fieldId, { optionId: opt.id, optionName: opt.name, optionColor: opt.color })}
                                    sx={{
                                      display: 'flex', alignItems: 'center', gap: 2, px: 3, py: 1,
                                      border: '1px solid', borderColor: isSelected ? 'accent.emphasis' : 'border.default',
                                      borderRadius: 2, bg: isSelected ? 'accent.subtle' : 'canvas.default',
                                      cursor: 'pointer', transition: 'all 150ms ease',
                                      '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
                                    }}
                                  >
                                    <Box as="span" sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                      <Box sx={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0 }} style={{ backgroundColor: opt.color || 'var(--borderColor-default)' }} />
                                      <Text sx={{ fontSize: 1, fontWeight: 500, color: 'fg.default' }}>{opt.name}</Text>
                                    </Box>
                                  </Box>
                                </Tippy>
                              )
                            })}
                          </Box>
                        </>
                      )}

                      {field.dataType === 'NUMBER' && (
                        <FormControl sx={{ width: '100%' }}>
                          <FormControl.Label sx={{ display: 'flex', alignItems: 'center', gap: 2, fontWeight: 'bold', width: 'fit-content', cursor: 'help' }}>
                            <Tippy content={duplicateValueTooltip(field.fieldName)} delay={[400, 0]} placement="top" zIndex={Z_TOOLTIP}>
                              <Box as="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                                {getFieldIcon(field.dataType) && (
                                  <Box sx={prefixLabelIcon}>{getFieldIcon(field.dataType)}</Box>
                                )}
                                {field.fieldName}
                              </Box>
                            </Tippy>
                          </FormControl.Label>
                          <TextInput
                            type="number"
                            block
                            value={String(field.number ?? '')}
                            onChange={e => {
                              const parsed = parseFloat(e.target.value)
                              updateField(field.fieldId, { number: Number.isFinite(parsed) ? parsed : undefined })
                            }}
                          />
                        </FormControl>
                      )}

                      {field.dataType === 'DATE' && (
                        <FormControl sx={{ width: '100%' }}>
                          <FormControl.Label sx={{ display: 'flex', alignItems: 'center', gap: 2, fontWeight: 'bold', width: 'fit-content', cursor: 'help' }}>
                            <Tippy content={duplicateValueTooltip(field.fieldName)} delay={[400, 0]} placement="top" zIndex={Z_TOOLTIP}>
                              <Box as="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                                {getFieldIcon(field.dataType) && (
                                  <Box sx={prefixLabelIcon}>{getFieldIcon(field.dataType)}</Box>
                                )}
                                {field.fieldName}
                              </Box>
                            </Tippy>
                          </FormControl.Label>
                          <TextInput type="date" block value={field.date ?? ''} onChange={e => updateField(field.fieldId, { date: e.target.value })} />
                        </FormControl>
                      )}

                      {field.dataType === 'ITERATION' && field.iterations && (
                        <>
                          <Tippy content={duplicateValueTooltip(field.fieldName)} delay={[400, 0]} placement="top" zIndex={Z_TOOLTIP}>
                            <Text sx={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 1, fontWeight: 'bold', color: 'fg.default', width: 'fit-content', cursor: 'help' }}>
                              {getFieldIcon(field.dataType) && (
                                <Box as="span" sx={prefixLabelIcon}>{getFieldIcon(field.dataType)}</Box>
                              )}
                              {field.fieldName}
                            </Text>
                          </Tippy>
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {field.iterations.map(iter => {
                              const isSelected = field.iterationId === iter.id
                              return (
                                <Tippy
                                  key={iter.id}
                                  content={getFieldOptionTooltip(field.fieldName, iter.title)}
                                  delay={[400, 0]}
                                  placement="top"
                                  zIndex={Z_TOOLTIP}
                                >
                                  <Box
                                    as="button"
                                    type="button"
                                    aria-pressed={isSelected}
                                    onClick={() => updateField(field.fieldId, { iterationId: iter.id, iterationTitle: iter.title, iterationStartDate: iter.startDate })}
                                    sx={{
                                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                      px: 3, py: 2, border: '1px solid',
                                      borderColor: isSelected ? 'accent.emphasis' : 'border.default',
                                      borderRadius: 2, bg: isSelected ? 'accent.subtle' : 'canvas.default',
                                      cursor: 'pointer', transition: 'all 150ms ease',
                                      '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
                                    }}
                                  >
                                    <Box as="span" sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                                      <Text sx={{ fontSize: 1, fontWeight: 'bold', color: 'fg.default' }}>{iter.title}</Text>
                                      <Text sx={{ fontSize: 0, color: 'fg.muted', mt: '2px' }}>{iter.startDate}</Text>
                                    </Box>
                                  {isSelected && (
                                    <Box sx={{ color: 'accent.fg' }}>
                                      <CheckIcon size={14} />
                                    </Box>
                                  )}
                                  </Box>
                                </Tippy>
                              )
                            })}
                          </Box>
                        </>
                      )}
                    </Box>
                  ))}
                </>
              )}

              {/* Relationships */}
              {preview?.parentIssue && (
                <>
                  <Box sx={{ borderTop: '1px solid', borderColor: 'border.default', pt: 3 }}>
                    <Text sx={sectionLabel}>
                      <Box as="span" sx={prefixLabelIcon}><ProjectBoardIcon size={14} /></Box>
                      Relationships
                    </Text>
                  </Box>
                  <Box>
                    <Text as="p" sx={{ m: 0, mb: 1, fontSize: 0, color: 'fg.muted' }}>
                      This issue will be linked as a sub-issue of:
                    </Text>
                    <Text sx={{ fontSize: 1, color: 'fg.default' }}>
                      {preview.parentIssue.repoOwner}/{preview.parentIssue.repoName}#{preview.parentIssue.number} — {preview.parentIssue.title}
                    </Text>
                  </Box>
                </>
              )}
            </Box>

            {/* Concurrent error */}
            {concurrentError && (
              <Box sx={{ px: 4, pb: 2 }}>
                <Flash variant="warning">
                  3 duplications are already in progress. Wait for one to finish before starting another.
                </Flash>
              </Box>
            )}

            {/* Footer */}
            <Box sx={{ px: 4, py: 3, borderTop: '1px solid', borderColor: 'border.default', display: 'flex', justifyContent: 'space-between', flexShrink: 0 }}>
              <Button variant="default" onClick={onClose} sx={{
                boxShadow: 'none',
                transition: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
                '&:hover:not(:disabled)': { transform: 'translateY(-1px)' },
                '&:active': { transform: 'translateY(0)', transition: '100ms' },
                '@media (prefers-reduced-motion: reduce)': {
                  transition: 'none',
                  '&:hover:not(:disabled)': { transform: 'none' },
                },
              }}>Cancel</Button>
              <Button ref={duplicateBtnRef} variant="primary" onClick={handleDuplicate} sx={{
                display: 'inline-flex', alignItems: 'center', gap: 1,
                boxShadow: 'none',
                transition: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
                '&:hover:not(:disabled)': { transform: 'translateY(-1px)' },
                '&:active': { transform: 'translateY(0)', transition: '100ms' },
                '@media (prefers-reduced-motion: reduce)': {
                  transition: 'none',
                  '&:hover:not(:disabled)': { transform: 'none' },
                },
              }}>
                <CopyIcon size={14} />
                Duplicate →
              </Button>
            </Box>
          </>
        )}
      </Box>
    </Box>
  )
}
