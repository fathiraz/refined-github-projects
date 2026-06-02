import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Box, Button, Flash, Spinner } from '@primer/react'
import { ModalStepHeader } from '@/ui/modal-step-header'
import { primerCss } from '@/lib/primer-css-helper'
import { toastStore } from '@/lib/toast-store'
import { ensureTippyCss } from '@/lib/tippy-utils'

export type ModalStage = 'LOADING' | 'ERROR' | 'INPUT' | 'CONFIRM'

export interface RenderHelpers {
  error: string | null
  stage: ModalStage
}

export interface FooterOpts {
  onClose: () => void
  onSubmit: () => void
  loading: boolean
}

export interface CreateModalOptions<T> {
  /** Modal name used as aria-label and ModalStepHeader title */
  name: string
  /** Icon rendered in ModalStepHeader (optional) */
  icon?: React.ReactNode
  /** Renders the modal content area. Receives data props T, onClose, and render helpers. */
  renderContent: (props: T & { onClose: () => void }, helpers: RenderHelpers) => React.ReactNode
  /** Async handler called when user clicks the confirm button. Receives data props T. */
  onSubmit: (props: T) => Promise<void>
  /** Optional validation before onSubmit. Returns null to allow, or error string to block. */
  validate?: () => string | null
  /** Text for the primary action button (default: "Confirm") */
  confirmLabel?: string
  /** Optional custom footer renderer. Replaces the default cancel/confirm buttons. */
  footer?: (opts: FooterOpts) => React.ReactNode
}

/** The modal component receives all T props plus onClose */
export type ModalComponentProps<T> = T & { onClose: () => void }

export function createModal<T>(opts: CreateModalOptions<T>): React.FC<ModalComponentProps<T>> {
  const { name, icon, renderContent, onSubmit, validate, confirmLabel = 'Confirm', footer } = opts

  const ModalComponent: React.FC<ModalComponentProps<T>> = (props) => {
    const { onClose, ...rest } = props
    const dataProps = rest as T
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const submitInFlightRef = useRef(false)
    const mountedRef = useRef(true)

    const stage: ModalStage = loading ? 'LOADING' : error ? 'ERROR' : 'INPUT'

    useEffect(() => {
      ensureTippyCss()
    }, [])

    useEffect(() => {
      mountedRef.current = true
      return () => {
        mountedRef.current = false
      }
    }, [])

    const handleRequestClose = useCallback(() => {
      if (loading) return
      onClose()
    }, [loading, onClose])

    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') handleRequestClose()
      }
      document.addEventListener('keydown', handleKeyDown)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }, [handleRequestClose])

    const handleSubmit = async () => {
      if (submitInFlightRef.current) return
      submitInFlightRef.current = true

      setError(null)
      try {
        if (validate) {
          const validationError = validate()
          if (validationError) {
            setError(validationError)
            return
          }
        }

        setLoading(true)
        await onSubmit(dataProps)
        toastStore.show({ message: `${name} completed`, type: 'success' })
        handleRequestClose()
      } catch (err) {
        if (mountedRef.current) {
          setError(err instanceof Error ? err.message : String(err))
          setLoading(false)
        }
      } finally {
        submitInFlightRef.current = false
      }
    }

    return (
      <Box
        sx={primerCss.modalOverlay()}
        onClick={handleRequestClose}
        role="dialog"
        aria-modal="true"
        aria-label={name}
      >
        <Box
          sx={primerCss.modalPanel()}
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
          onKeyDown={(e: React.KeyboardEvent) => e.stopPropagation()}
          onKeyUp={(e: React.KeyboardEvent) => e.stopPropagation()}
        >
          <ModalStepHeader title={name} icon={icon} onClose={handleRequestClose} />
          <Box sx={primerCss.contentArea()}>
            {error && (
              <Flash variant="danger" sx={{ mb: 2 }}>
                {error}
              </Flash>
            )}
            {renderContent(
              { ...dataProps, onClose: handleRequestClose } as T & { onClose: () => void },
              {
                error,
                stage,
              },
            )}
          </Box>
          <Box sx={{ ...primerCss.footerBorder(), ...primerCss.footerLayout() }}>
            {footer ? (
              footer({ onClose: handleRequestClose, onSubmit: handleSubmit, loading })
            ) : (
              <>
                <Button
                  variant="default"
                  onClick={handleRequestClose}
                  disabled={loading}
                  sx={primerCss.buttonMotion()}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={handleSubmit}
                  disabled={loading}
                  sx={primerCss.buttonMotion()}
                >
                  {loading && <Spinner size="small" sx={{ mr: 1 }} />}
                  {confirmLabel}
                </Button>
              </>
            )}
          </Box>
        </Box>
      </Box>
    )
  }

  ModalComponent.displayName = `Modal(${name})`
  return ModalComponent
}
