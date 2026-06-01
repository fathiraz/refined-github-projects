// DOM-shape regression for the overflow menu after the §3 bar-IA collapse.
// The bar's three top-level chips (Edit fields ▾ · Mark ▾ · …) are validated
// against the spec by checking the surviving menu's row inventory + order.

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { BaseStyles, ThemeProvider } from '@primer/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/debug-logger', () => ({
  logger: { log: () => {}, warn: () => {}, error: () => {}, info: () => {} },
  initDebugLogger: async () => {},
}))

vi.mock('@/features/bulk-utils', () => ({
  exportSelectedToCSV: () => {},
  flyToTracker: () => {},
}))

import { BulkActionsMenu } from '@/features/bulk-actions-menu'

interface MountResult {
  container: HTMLDivElement
  root: Root
}

function render(node: React.ReactElement): MountResult {
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
  return { container, root }
}

function noop() {}

describe('BulkActionsMenu — three-chip-era inventory', () => {
  let mounted: MountResult[] = []

  beforeEach(() => {
    mounted = []
  })

  afterEach(() => {
    for (const { container, root } of mounted) {
      act(() => root.unmount())
      container.remove()
    }
  })

  it('renders exactly the §3.4 verb set (no Mark/Close/Open/Pin/Unpin/Lock/Edit Fields rows)', () => {
    const m = render(
      <BulkActionsMenu
        count={3}
        onRename={noop}
        onReorder={noop}
        onRandomAssign={noop}
        onTransfer={noop}
        onDeepDuplicate={noop}
        onDelete={noop}
      />,
    )
    mounted.push(m)

    const overflow = m.container.querySelector('[data-testid="rgp-bulk-overflow-menu"]')
    expect(overflow).not.toBeNull()

    // verbs that MUST appear in the overflow per §3.4
    expect(m.container.querySelector('[data-testid="rgp-overflow-rename"]')).not.toBeNull()
    expect(m.container.querySelector('[data-testid="rgp-overflow-reorder"]')).not.toBeNull()
    expect(m.container.querySelector('[data-testid="rgp-overflow-random-assign"]')).not.toBeNull()
    expect(m.container.querySelector('[data-testid="rgp-overflow-transfer"]')).not.toBeNull()
    expect(m.container.querySelector('[data-testid="rgp-overflow-export-csv"]')).not.toBeNull()
    expect(m.container.querySelector('[data-testid="rgp-overflow-delete"]')).not.toBeNull()

    // verbs that MUST NOT appear in the overflow (moved to Mark ▾ flyout or own chip)
    expect(m.container.querySelector('[data-testid="rgp-overflow-edit-fields"]')).toBeNull()
    expect(m.container.querySelector('[data-testid="rgp-overflow-close"]')).toBeNull()
    expect(m.container.querySelector('[data-testid="rgp-overflow-open"]')).toBeNull()
    expect(m.container.querySelector('[data-testid="rgp-overflow-pin"]')).toBeNull()
    expect(m.container.querySelector('[data-testid="rgp-overflow-unpin"]')).toBeNull()
    expect(m.container.querySelector('[data-testid="rgp-overflow-lock"]')).toBeNull()
  })

  it('hides Deep duplicate when count > 1', () => {
    const m = render(
      <BulkActionsMenu
        count={5}
        onRename={noop}
        onReorder={noop}
        onRandomAssign={noop}
        onTransfer={noop}
        onDeepDuplicate={noop}
        onDelete={noop}
      />,
    )
    mounted.push(m)
    expect(m.container.querySelector('[data-testid="rgp-overflow-duplicate"]')).toBeNull()
  })

  it('shows Deep duplicate when count === 1', () => {
    const m = render(
      <BulkActionsMenu
        count={1}
        onRename={noop}
        onReorder={noop}
        onRandomAssign={noop}
        onTransfer={noop}
        onDeepDuplicate={noop}
        onDelete={noop}
      />,
    )
    mounted.push(m)
    expect(m.container.querySelector('[data-testid="rgp-overflow-duplicate"]')).not.toBeNull()
  })

  it('orders rows per §3.4: Rename → Reorder → Random Assign → Transfer → Duplicate → Export CSV → Delete', () => {
    const m = render(
      <BulkActionsMenu
        count={1}
        onRename={noop}
        onReorder={noop}
        onRandomAssign={noop}
        onTransfer={noop}
        onDeepDuplicate={noop}
        onDelete={noop}
      />,
    )
    mounted.push(m)
    const expectedOrder = [
      'rgp-overflow-rename',
      'rgp-overflow-reorder',
      'rgp-overflow-random-assign',
      'rgp-overflow-transfer',
      'rgp-overflow-duplicate',
      'rgp-overflow-export-csv',
      'rgp-overflow-delete',
    ]
    const allRows = Array.from(
      m.container.querySelectorAll<HTMLElement>('[data-testid^="rgp-overflow-"]'),
    )
      .map((el) => el.getAttribute('data-testid')!)
      .filter((id) => id !== 'rgp-bulk-overflow-menu' && id.startsWith('rgp-overflow-'))
    expect(allRows).toEqual(expectedOrder)
  })
})
