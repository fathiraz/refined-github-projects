import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { BaseStyles, ThemeProvider } from '@primer/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/debug-logger', () => ({
  logger: { log: () => {}, warn: () => {}, error: () => {}, info: () => {} },
  initDebugLogger: async () => {},
}))
vi.mock('@/lib/tippy-utils', () => ({ ensureTippyCss: () => {} }))
vi.mock('@/lib/toast-store', () => ({
  toastStore: { show: () => {} },
}))

import { createModal } from '@/lib/modal-factory'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TestModal = createModal<{ onConfirm: () => void }>({
  name: 'Test',
  renderContent: (_props, _helpers) => <input data-testid="modal-input" />,
  onSubmit: async () => {},
})

let mounted: Array<{ container: HTMLDivElement; root: Root }> = []

function render(node: React.ReactElement) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(node)
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

describe('createModal keyboard propagation', () => {
  it('stops keydown/keyup propagation to document when typing inside the modal panel', () => {
    const container = render(
      <ThemeProvider colorMode="day">
        <BaseStyles>
          <TestModal onConfirm={() => {}} onClose={() => {}} />
        </BaseStyles>
      </ThemeProvider>,
    )

    const input = container.querySelector('[data-testid="modal-input"]') as HTMLInputElement
    expect(input).not.toBeNull()

    const spy = vi.fn()
    document.addEventListener('keydown', spy)
    document.addEventListener('keyup', spy)

    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))
      input.dispatchEvent(new KeyboardEvent('keyup', { key: 'a', bubbles: true }))
    })

    document.removeEventListener('keydown', spy)
    document.removeEventListener('keyup', spy)

    expect(spy).not.toHaveBeenCalled()
  })
})
