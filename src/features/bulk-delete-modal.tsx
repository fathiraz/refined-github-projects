import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Box, Button, Flash, FormControl, Text, TextInput } from '@primer/react'

import { TrashIcon } from '@/ui/icons'
import { ModalStepHeader } from '@/ui/modal-step-header'
import { Z_MODAL } from '@/lib/z-index'

interface Props {
  count: number
  /** Optional preview titles for the selected items. First 5 shown by default. */
  itemTitles?: string[]
  onClose: () => void
  onConfirm: () => void
}

/** Items at or above this count require typing `delete` to confirm. */
export const DELETE_TYPED_CONFIRM_THRESHOLD = 10
/** The exact string the user must type — case-sensitive, no surrounding whitespace. */
export const DELETE_TYPED_CONFIRM_PHRASE = 'delete'
/** Item-title preview cap before the "Show N more" expander. */
export const DELETE_PREVIEW_CAP = 5

export function BulkDeleteModal({ count, itemTitles, onClose, onConfirm }: Props) {
  const titles = itemTitles ?? []
  const [showAll, setShowAll] = useState(false)
  const [confirmInput, setConfirmInput] = useState('')

  const needsTypedConfirm = count >= DELETE_TYPED_CONFIRM_THRESHOLD
  const typedConfirmOk = !needsTypedConfirm || confirmInput === DELETE_TYPED_CONFIRM_PHRASE

  const cancelRef = useRef<HTMLButtonElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    // Below threshold: keep Cancel as default focus (cancel-focused confirm).
    // At/above threshold: focus the typed-confirm input so the user can comply.
    const target = needsTypedConfirm ? inputRef.current : cancelRef.current
    target?.focus()
  }, [needsTypedConfirm])

  const visibleTitles = useMemo(
    () => (showAll ? titles : titles.slice(0, DELETE_PREVIEW_CAP)),
    [titles, showAll],
  )
  const hiddenCount = Math.max(0, titles.length - DELETE_PREVIEW_CAP)

  function handleConfirm() {
    if (!typedConfirmOk) return
    onConfirm()
  }

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
    >
      <Box
        sx={{
          bg: 'canvas.overlay',
          border: '1px solid',
          borderColor: 'border.default',
          borderRadius: 2,
          width: '100%',
          maxWidth: 480,
          overflow: 'hidden',
          boxShadow: 'none',
        }}
        data-testid="rgp-bulk-delete-modal"
      >
        <ModalStepHeader
          title={`Delete ${count} item${count !== 1 ? 's' : ''}?`}
          icon={<TrashIcon size={16} />}
          onClose={onClose}
        />

        <Box sx={{ px: 4, py: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Flash variant="warning">
            Removes {count} item{count !== 1 ? 's' : ''} from the project board. Underlying issues
            are not deleted.
          </Flash>

          {titles.length > 0 && (
            <Box
              sx={{
                border: '1px solid',
                borderColor: 'border.default',
                borderRadius: 2,
                p: 2,
                bg: 'canvas.subtle',
              }}
              data-testid="rgp-bulk-delete-preview"
            >
              <Box as="ul" sx={{ m: 0, pl: 3, listStyle: 'disc' }}>
                {visibleTitles.map((title, i) => (
                  <Box
                    as="li"
                    key={`${title}-${i}`}
                    sx={{
                      fontSize: 0,
                      color: 'fg.default',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {title}
                  </Box>
                ))}
              </Box>
              {hiddenCount > 0 && (
                <Button
                  variant="invisible"
                  size="small"
                  onClick={() => setShowAll((v) => !v)}
                  sx={{ boxShadow: 'none', mt: 1, p: 1, fontSize: 0 }}
                  data-testid="rgp-bulk-delete-preview-expander"
                >
                  {showAll ? '▾ Hide' : `Show ${hiddenCount} more ▸`}
                </Button>
              )}
            </Box>
          )}

          {needsTypedConfirm && (
            <FormControl required>
              <FormControl.Label sx={{ fontSize: 0 }}>
                Type <code>{DELETE_TYPED_CONFIRM_PHRASE}</code> to confirm
              </FormControl.Label>
              <TextInput
                ref={inputRef}
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.currentTarget.value)}
                placeholder={`Type "${DELETE_TYPED_CONFIRM_PHRASE}" to confirm`}
                aria-label={`Type "${DELETE_TYPED_CONFIRM_PHRASE}" to confirm deletion`}
                data-testid="rgp-bulk-delete-typed-confirm"
                sx={{ width: '100%' }}
              />
            </FormControl>
          )}

          <Text
            as="p"
            sx={{ m: 0, fontSize: 0, color: 'danger.fg', fontWeight: 'semibold' }}
            data-testid="rgp-bulk-delete-warning"
          >
            This cannot be undone.
          </Text>

          <Text as="p" sx={{ m: 0, fontSize: 0, color: 'fg.muted' }}>
            Requires project admin access.
          </Text>
        </Box>

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, px: 4, pb: 3 }}>
          <Button
            ref={cancelRef}
            variant="default"
            onClick={onClose}
            sx={{ boxShadow: 'none' }}
            data-testid="rgp-bulk-delete-cancel"
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={handleConfirm}
            disabled={!typedConfirmOk}
            sx={{ boxShadow: 'none' }}
            data-testid="rgp-bulk-delete-confirm"
          >
            Delete {count} item{count !== 1 ? 's' : ''}
          </Button>
        </Box>
      </Box>
    </Box>
  )
}
