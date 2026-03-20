import React, { useEffect, useRef, useState } from 'react'
import { Box, Button, Flash, Heading, Spinner, Text } from '@primer/react'
import { sendMessage, ItemPreviewData } from '../lib/messages'
import { queueStore } from '../lib/queueStore'
import { flyToTracker } from '../lib/flyAnimation'
import { AutocompleteInput } from './ui/AutocompleteInput'
import { CopyIcon, XIcon } from './ui/primitives'

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

const inputCss: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  background: 'var(--bgColor-muted, var(--color-canvas-subtle))',
  color: 'var(--fgColor-default)',
  border: '1px solid var(--borderColor-default)',
  borderRadius: 6,
  outline: 'none',
  fontFamily: 'inherit',
  fontSize: 14,
  boxSizing: 'border-box',
}

const ACCENT = 'var(--color-accent-emphasis, #0969da)'
const BORDER = 'var(--borderColor-default)'

const sectionLabel = {
  fontSize: 0 as const,
  fontWeight: 'bold' as const,
  textTransform: 'uppercase' as const,
  color: 'fg.muted' as const,
  letterSpacing: '0.05em',
  display: 'block' as const,
}

export function DeepDuplicateModal({ itemId, projectId, owner, isOrg, projectNumber, onClose }: Props) {
  const [step, setStep] = useState<Step>('LOADING')
  const [preview, setPreview] = useState<ItemPreviewData | null>(null)
  const [error, setError] = useState<string>('')
  const [concurrentError, setConcurrentError] = useState(false)
  const duplicateBtnRef = useRef<HTMLButtonElement | null>(null)

  const [editedTitle, setEditedTitle] = useState('')
  const [editedBody, setEditedBody] = useState('')
  const [editedAssignees, setEditedAssignees] = useState<{ id: string; name: string; avatarUrl: string }[]>([])
  const [editedLabels, setEditedLabels] = useState<{ id: string; name: string; color: string }[]>([])
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
        bg: 'rgba(27,31,36,0.5)', zIndex: 10001,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onKeyDown={(e: React.KeyboardEvent) => { e.stopPropagation(); if (e.key === 'Escape') onClose() }}
      onKeyUp={(e: React.KeyboardEvent) => e.stopPropagation()}
    >
      <Box sx={{
        bg: 'canvas.overlay', border: '1px solid', borderColor: 'border.default',
        borderRadius: 2, width: 'min(640px, 90vw)', maxHeight: '80vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 4, py: 3, borderBottom: '1px solid', borderColor: 'border.default', flexShrink: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{ color: 'accent.fg' }}><CopyIcon size={16} /></Box>
            <Heading as="h2" sx={{ fontSize: 3, fontWeight: 'bold', m: 0 }}>
              {step === 'PREVIEW' ? 'Deep Duplicate' : step === 'ERROR' ? 'Error' : 'Loading…'}
            </Heading>
          </Box>
          <Button variant="invisible" size="small" onClick={onClose} aria-label="Close" sx={{ p: '4px', minWidth: 'unset', color: 'fg.muted' }}>
            <XIcon size={16} />
          </Button>
        </Box>

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
            <Button variant="default" onClick={onClose} sx={{ boxShadow: 'none' }}>Close</Button>
          </Box>
        )}

        {/* Preview */}
        {step === 'PREVIEW' && (
          <>
            <Box sx={{ flex: 1, overflowY: 'auto', px: 4, py: 3, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {/* Title */}
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Text sx={{ fontSize: 1, fontWeight: 'bold', color: 'fg.default' }}>Title</Text>
                <input
                  type="text"
                  value={editedTitle}
                  onChange={e => setEditedTitle(e.target.value)}
                  style={inputCss}
                  onFocus={e => { e.target.style.borderColor = ACCENT }}
                  onBlur={e => { e.target.style.borderColor = BORDER }}
                />
              </Box>

              {/* Body */}
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Text sx={{ fontSize: 1, fontWeight: 'bold', color: 'fg.default' }}>Body</Text>
                <textarea
                  value={editedBody}
                  onChange={e => setEditedBody(e.target.value)}
                  rows={3}
                  style={{ ...inputCss, resize: 'vertical', lineHeight: 1.5 }}
                  onFocus={e => { e.target.style.borderColor = ACCENT }}
                  onBlur={e => { e.target.style.borderColor = BORDER }}
                />
              </Box>

              {/* People section */}
              <Box sx={{ borderTop: '1px solid', borderColor: 'border.default', pt: 3 }}>
                <Text sx={sectionLabel}>People</Text>
              </Box>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Text sx={{ fontSize: 1, fontWeight: 'bold', color: 'fg.default' }}>Assignees</Text>
                <AutocompleteInput
                  type="ASSIGNEES"
                  owner={repoOwner}
                  repoName={repoName}
                  value={editedAssignees}
                  onChange={setEditedAssignees}
                  placeholder="Search assignees…"
                />
              </Box>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Text sx={{ fontSize: 1, fontWeight: 'bold', color: 'fg.default' }}>Labels</Text>
                <AutocompleteInput
                  type="LABELS"
                  owner={repoOwner}
                  repoName={repoName}
                  value={editedLabels}
                  onChange={setEditedLabels}
                  placeholder="Search labels…"
                />
              </Box>

              {preview?.issueTypeName && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Text sx={{ fontSize: 1, fontWeight: 'bold', color: 'fg.default' }}>Type</Text>
                  <Text sx={{ fontSize: 1, color: 'fg.muted' }}>{preview.issueTypeName}</Text>
                </Box>
              )}

              {/* Project fields section */}
              {editedFields.length > 0 && (
                <>
                  <Box sx={{ borderTop: '1px solid', borderColor: 'border.default', pt: 3 }}>
                    <Text sx={sectionLabel}>Project Fields</Text>
                  </Box>

                  {editedFields.map(field => (
                    <Box key={field.fieldId} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <Text sx={{ fontSize: 1, fontWeight: 'bold', color: 'fg.default' }}>{field.fieldName}</Text>

                      {field.dataType === 'TEXT' && (
                        <input
                          type="text"
                          value={field.text ?? ''}
                          onChange={e => updateField(field.fieldId, { text: e.target.value })}
                          style={inputCss}
                          onFocus={e => { e.target.style.borderColor = ACCENT }}
                          onBlur={e => { e.target.style.borderColor = BORDER }}
                        />
                      )}

                      {field.dataType === 'SINGLE_SELECT' && field.options && (
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                          {field.options.map(opt => {
                            const isSelected = field.optionId === opt.id
                            return (
                              <Box
                                key={opt.id}
                                as="button"
                                type="button"
                                onClick={() => updateField(field.fieldId, { optionId: opt.id, optionName: opt.name, optionColor: opt.color })}
                                sx={{
                                  display: 'flex', alignItems: 'center', gap: 2, px: 3, py: 1,
                                  border: '1px solid', borderColor: isSelected ? 'accent.emphasis' : 'border.default',
                                  borderRadius: 2, bg: isSelected ? 'canvas.subtle' : 'transparent',
                                  cursor: 'pointer', transition: 'all 150ms ease',
                                  '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
                                }}
                              >
                                <Box sx={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0 }} style={{ backgroundColor: opt.color || 'var(--borderColor-default)' }} />
                                <Text sx={{ fontSize: 1, fontWeight: 500, color: 'fg.default' }}>{opt.name}</Text>
                              </Box>
                            )
                          })}
                        </Box>
                      )}

                      {field.dataType === 'NUMBER' && (
                        <input
                          type="number"
                          value={field.number ?? ''}
                          onChange={e => updateField(field.fieldId, { number: parseFloat(e.target.value) })}
                          style={inputCss}
                          onFocus={e => { e.target.style.borderColor = ACCENT }}
                          onBlur={e => { e.target.style.borderColor = BORDER }}
                        />
                      )}

                      {field.dataType === 'DATE' && (
                        <input
                          type="date"
                          value={field.date ?? ''}
                          onChange={e => updateField(field.fieldId, { date: e.target.value })}
                          style={inputCss}
                          onFocus={e => { e.target.style.borderColor = ACCENT }}
                          onBlur={e => { e.target.style.borderColor = BORDER }}
                        />
                      )}

                      {field.dataType === 'ITERATION' && field.iterations && (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {field.iterations.map(iter => {
                            const isSelected = field.iterationId === iter.id
                            return (
                              <Box
                                key={iter.id}
                                as="button"
                                type="button"
                                onClick={() => updateField(field.fieldId, { iterationId: iter.id, iterationTitle: iter.title, iterationStartDate: iter.startDate })}
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
                                  <Text sx={{ fontSize: 1, fontWeight: 'bold', color: 'fg.default' }}>{iter.title}</Text>
                                  <Text sx={{ fontSize: 0, color: 'fg.muted', mt: '2px' }}>{iter.startDate}</Text>
                                </Box>
                                {isSelected && (
                                  <Box sx={{ color: 'accent.fg' }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                                  </Box>
                                )}
                              </Box>
                            )
                          })}
                        </Box>
                      )}
                    </Box>
                  ))}
                </>
              )}

              {/* Relationships */}
              {preview?.parentIssue && (
                <>
                  <Box sx={{ borderTop: '1px solid', borderColor: 'border.default', pt: 3 }}>
                    <Text sx={sectionLabel}>Relationships</Text>
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
              <Button variant="default" onClick={onClose} sx={{ boxShadow: 'none' }}>Cancel</Button>
              <Button ref={duplicateBtnRef} variant="primary" onClick={handleDuplicate} sx={{ boxShadow: 'none', display: 'inline-flex', alignItems: 'center', gap: 1 }}>
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
