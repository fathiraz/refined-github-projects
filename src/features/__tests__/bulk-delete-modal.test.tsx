import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { BaseStyles, ThemeProvider } from '@primer/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/debug-logger', () => ({
  logger: { log: () => {}, warn: () => {}, error: () => {}, info: () => {} },
  initDebugLogger: async () => {},
}))

import {
  BulkDeleteModal,
  DELETE_TYPED_CONFIRM_THRESHOLD,
  DELETE_TYPED_CONFIRM_PHRASE,
  DELETE_PREVIEW_CAP,
} from '@/features/bulk-delete-modal'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mounted: Array<{ container: HTMLDivElement; root: Root }> = []

function render(node: React.ReactElement): HTMLDivElement {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(
      <ThemeProvider colorMode="day">
        <BaseStyles>{node}</BaseStyles>
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

describe('<BulkDeleteModal> title', () => {
  it('renders count in title for plural', () => {
    const container = render(<BulkDeleteModal count={5} onClose={() => {}} onConfirm={() => {}} />)
    expect(container.textContent).toContain('Delete 5 items?')
  })

  it('renders singular in title when count === 1', () => {
    const container = render(<BulkDeleteModal count={1} onClose={() => {}} onConfirm={() => {}} />)
    expect(container.textContent).toContain('Delete 1 item?')
  })
})

describe('<BulkDeleteModal> "This cannot be undone" warning', () => {
  it('is rendered regardless of count', () => {
    const container = render(<BulkDeleteModal count={3} onClose={() => {}} onConfirm={() => {}} />)
    const warning = container.querySelector('[data-testid="rgp-bulk-delete-warning"]')
    expect(warning).not.toBeNull()
    expect(warning!.textContent).toContain('This cannot be undone')
  })
})

describe('<BulkDeleteModal> typed-confirm gating', () => {
  it(`below threshold (count < ${DELETE_TYPED_CONFIRM_THRESHOLD}): no typed-confirm input`, () => {
    const container = render(<BulkDeleteModal count={3} onClose={() => {}} onConfirm={() => {}} />)
    expect(container.querySelector('[data-testid="rgp-bulk-delete-typed-confirm"]')).toBeNull()
  })

  it(`at threshold (count >= ${DELETE_TYPED_CONFIRM_THRESHOLD}): renders typed-confirm input`, () => {
    const container = render(
      <BulkDeleteModal
        count={DELETE_TYPED_CONFIRM_THRESHOLD}
        onClose={() => {}}
        onConfirm={() => {}}
      />,
    )
    expect(container.querySelector('[data-testid="rgp-bulk-delete-typed-confirm"]')).not.toBeNull()
  })

  it('confirm button is disabled until input equals the confirm phrase exactly', () => {
    const onConfirm = vi.fn()
    const container = render(
      <BulkDeleteModal count={12} onClose={() => {}} onConfirm={onConfirm} />,
    )
    const confirm = container.querySelector(
      '[data-testid="rgp-bulk-delete-confirm"]',
    ) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)

    const inputWrapper = container.querySelector('[data-testid="rgp-bulk-delete-typed-confirm"]')!
    const input =
      inputWrapper.tagName === 'INPUT'
        ? (inputWrapper as HTMLInputElement)
        : (inputWrapper.querySelector('input') as HTMLInputElement)

    // React-controlled inputs ignore raw .value assignment — use the native setter so React
    // sees the value change and re-fires onChange.
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )!.set!
    const typeIntoInput = (value: string) => {
      act(() => {
        nativeSetter.call(input, value)
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })
    }

    typeIntoInput('Delete')
    // case-sensitive — wrong case stays disabled
    expect(
      (container.querySelector('[data-testid="rgp-bulk-delete-confirm"]') as HTMLButtonElement)
        .disabled,
    ).toBe(true)

    typeIntoInput(DELETE_TYPED_CONFIRM_PHRASE)
    expect(
      (container.querySelector('[data-testid="rgp-bulk-delete-confirm"]') as HTMLButtonElement)
        .disabled,
    ).toBe(false)

    act(() => {
      ;(
        container.querySelector('[data-testid="rgp-bulk-delete-confirm"]') as HTMLButtonElement
      ).click()
    })
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})

describe('<BulkDeleteModal> item-title preview', () => {
  const manyTitles = Array.from({ length: 8 }, (_, i) => `Item ${i + 1}`)

  it('renders the preview region only when titles are provided', () => {
    const without = render(<BulkDeleteModal count={3} onClose={() => {}} onConfirm={() => {}} />)
    expect(without.querySelector('[data-testid="rgp-bulk-delete-preview"]')).toBeNull()
  })

  it(`renders the first ${DELETE_PREVIEW_CAP} titles by default`, () => {
    const container = render(
      <BulkDeleteModal
        count={manyTitles.length}
        itemTitles={manyTitles}
        onClose={() => {}}
        onConfirm={() => {}}
      />,
    )
    const items = container.querySelectorAll('[data-testid="rgp-bulk-delete-preview"] li')
    expect(items.length).toBe(DELETE_PREVIEW_CAP)
  })

  it('expander reveals the remaining titles on click', () => {
    const container = render(
      <BulkDeleteModal
        count={manyTitles.length}
        itemTitles={manyTitles}
        onClose={() => {}}
        onConfirm={() => {}}
      />,
    )
    const expander = container.querySelector(
      '[data-testid="rgp-bulk-delete-preview-expander"]',
    ) as HTMLButtonElement
    expect(expander).not.toBeNull()
    expect(expander.textContent).toContain(`${manyTitles.length - DELETE_PREVIEW_CAP} more`)
    act(() => expander.click())
    const items = container.querySelectorAll('[data-testid="rgp-bulk-delete-preview"] li')
    expect(items.length).toBe(manyTitles.length)
  })
})

describe('<BulkDeleteModal> Cancel', () => {
  it('Cancel invokes onClose', () => {
    const onClose = vi.fn()
    const container = render(<BulkDeleteModal count={3} onClose={onClose} onConfirm={() => {}} />)
    const cancel = container.querySelector(
      '[data-testid="rgp-bulk-delete-cancel"]',
    ) as HTMLButtonElement
    act(() => cancel.click())
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
