import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { BaseStyles, Box, ThemeProvider } from '@primer/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ModalShell } from '@/ui/modal-shell'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mounted: Array<{ container: HTMLDivElement; root: Root }> = []

function renderModal(onClose: () => void, closeOnEscape = true) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(
      <ThemeProvider colorMode="day">
        <BaseStyles>
          <ModalShell ariaLabel="Test modal" onClose={onClose} closeOnEscape={closeOnEscape}>
            <Box data-testid="modal-body">Body</Box>
          </ModalShell>
        </BaseStyles>
      </ThemeProvider>,
    )
  })
  mounted.push({ container, root })
  return container
}

beforeEach(() => {
  mounted = []
})

afterEach(() => {
  for (const { container, root } of mounted) {
    act(() => root.unmount())
    container.remove()
  }
})

describe('ModalShell Escape handling', () => {
  it('closes the modal and blocks capture-phase document listeners on Escape', () => {
    const onClose = vi.fn()
    renderModal(onClose)

    const globalSpy = vi.fn()
    document.addEventListener('keydown', globalSpy, true)

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      )
    })

    document.removeEventListener('keydown', globalSpy, true)

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(globalSpy).not.toHaveBeenCalled()
  })

  it('consumes Escape without closing when closeOnEscape is false', () => {
    const onClose = vi.fn()
    renderModal(onClose, false)

    const globalSpy = vi.fn()
    document.addEventListener('keydown', globalSpy, true)

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      )
    })

    document.removeEventListener('keydown', globalSpy, true)

    expect(onClose).not.toHaveBeenCalled()
    expect(globalSpy).not.toHaveBeenCalled()
  })
})
