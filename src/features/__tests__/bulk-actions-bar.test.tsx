// Characterization test for the bulk-actions bar's overlay state.
//
// The bar owns ten mutually-exclusive overlays plus an independent overflow
// menu. These tests pin which trigger opens which overlay, that only one is
// ever open, that Escape and a cleared selection dismiss everything, and that
// the overflow menu is NOT one of the ten. Written against the pre-refactor
// source so the collapse to a single `overlay` state is provably equivalent.

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { BaseStyles, ThemeProvider } from '@primer/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

interface RegisteredShortcut {
  id: string
  key: string
  modifiers: Record<string, boolean>
  context: string
  label: string
  allowInEditable?: boolean
  action: () => void
}

const hoisted = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  selection: new Set<string>(),
  selectionListeners: new Set<() => void>(),
  shortcuts: new Map<string, { id: string; action: () => void }>(),
}))

vi.mock('@/lib/debug-logger', () => ({
  logger: { log: () => {}, warn: () => {}, error: () => {}, info: () => {}, verbose: () => {} },
  initDebugLogger: async () => {},
}))
vi.mock('@/lib/messages', () => ({ sendMessage: hoisted.sendMessage }))
vi.mock('@/lib/tippy-utils', () => ({ ensureTippyCss: () => {} }))
vi.mock('@/ui/tooltip', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock('@/lib/project-table-dom', () => ({
  getAllInjectedItemIds: () => ['issue:1', 'issue:2'],
  getTitlesForItemIds: () => [{ id: 'issue:1', title: 'One' }],
}))
vi.mock('@/lib/queue-store', () => ({ queueStore: { getActiveCount: () => 0 } }))
vi.mock('@/lib/use-bar-keyboard-chords', () => ({ useBarKeyboardChords: () => {} }))
vi.mock('@/features/bulk-utils', () => ({
  exportSelectedToCSV: () => {},
  flyToTracker: () => {},
}))
vi.mock('@/lib/selection-store', () => ({
  selectionStore: {
    getAll: () => [...hoisted.selection],
    count: () => hoisted.selection.size,
    clear: () => {
      hoisted.selection.clear()
      hoisted.selectionListeners.forEach((fn) => fn())
    },
    selectBatch: () => {},
    subscribe: (fn: () => void) => {
      hoisted.selectionListeners.add(fn)
      return () => hoisted.selectionListeners.delete(fn)
    },
    onFocusRequest: () => () => {},
    requestFocus: () => {},
  },
}))
vi.mock('@/lib/keyboard', () => ({
  shortcutRegistry: {
    register: (def: { id: string; action: () => void }) => hoisted.shortcuts.set(def.id, def),
    unregister: (id: string) => hoisted.shortcuts.delete(id),
    getAll: () => [...hoisted.shortcuts.values()],
  },
  isMac: false,
  formatShortcut: (s: { key: string }) => s.key,
}))

// Every overlay is mocked down to a probe reporting its own open state, so the
// assertions read the bar's state directly rather than through whatever chrome
// each child happens to render.
function probe(testid: string) {
  return (props: Record<string, unknown>) => (props.open ? <div data-testid={testid} /> : null)
}

vi.mock('@/features/bulk-mark-flyout', () => ({ BulkMarkFlyout: probe('overlay-mark') }))
vi.mock('@/features/bulk-edit-flyout', () => ({ BulkEditFlyout: probe('overlay-editFields') }))
vi.mock('@/features/bulk-rename-flyout', () => ({ BulkRenameFlyout: probe('overlay-rename') }))
vi.mock('@/features/bulk-reorder-flyout', () => ({ BulkReorderFlyout: probe('overlay-reorder') }))
vi.mock('@/features/bulk-random-assign-flyout', () => ({
  BulkRandomAssignFlyout: probe('overlay-randomAssign'),
}))
vi.mock('@/features/bulk-actions-modals', () => ({
  BulkActionsModals: (props: Record<string, unknown>) => (
    <>
      {props.showCloseModal ? <div data-testid="overlay-close" /> : null}
      {props.showDeleteModal ? <div data-testid="overlay-delete" /> : null}
      {props.showTransferModal ? <div data-testid="overlay-transfer" /> : null}
      {props.showDupModal ? <div data-testid="overlay-duplicate" /> : null}
      {props.showHelp ? <div data-testid="overlay-help" /> : null}
    </>
  ),
}))

import { BulkActionsBar } from '@/features/bulk-actions-bar'

const OVERLAYS = [
  'mark',
  'editFields',
  'rename',
  'reorder',
  'randomAssign',
  'close',
  'delete',
  'transfer',
  'duplicate',
  'help',
] as const

interface MountResult {
  container: HTMLDivElement
  root: Root
}

const mounted: MountResult[] = []

function renderBar(): MountResult {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(
      <ThemeProvider colorMode="day">
        <BaseStyles>
          <BulkActionsBar
            projectId="PVT_1"
            owner="acme"
            isOrg={false}
            number={1}
            getFields={() => Promise.resolve({ id: 'PVT_1', title: 'Board', fields: [] })}
          />
        </BaseStyles>
      </ThemeProvider>,
    )
  })
  const m = { container, root }
  mounted.push(m)
  return m
}

function openOverlays(m: MountResult): string[] {
  return OVERLAYS.filter((id) => m.container.querySelector(`[data-testid="overlay-${id}"]`))
}

function el(m: MountResult, testid: string): HTMLElement {
  const found = m.container.querySelector<HTMLElement>(`[data-testid="${testid}"]`)
  if (!found) throw new Error(`missing [data-testid="${testid}"]`)
  return found
}

/** Click and flush the microtask queue, so async token checks settle. */
async function click(node: HTMLElement): Promise<void> {
  await act(async () => {
    node.click()
    await Promise.resolve()
    await Promise.resolve()
  })
}

/** Open the overflow menu, then click one of its rows. */
async function viaOverflow(m: MountResult, testid: string): Promise<void> {
  await click(el(m, 'rgp-bar-overflow-chip'))
  await click(el(m, testid))
}

beforeEach(() => {
  hoisted.selection.clear()
  hoisted.selection.add('issue:1')
  hoisted.selection.add('issue:2')
  hoisted.selectionListeners.clear()
  hoisted.shortcuts.clear()
  hoisted.sendMessage.mockReset()
  hoisted.sendMessage.mockResolvedValue({ hasPat: true })
})

afterEach(() => {
  for (const { container, root } of mounted) {
    act(() => root.unmount())
    container.remove()
  }
  mounted.length = 0
})

describe('BulkActionsBar — overlay state', () => {
  it('renders nothing when the selection is empty', () => {
    hoisted.selection.clear()
    const m = renderBar()
    expect(m.container.querySelector('[role="toolbar"]')).toBeNull()
  })

  it('opens no overlay on first render', () => {
    expect(openOverlays(renderBar())).toEqual([])
  })

  it('opens Mark from its chip and closes it on a second click', async () => {
    const m = renderBar()
    await click(el(m, 'rgp-bar-mark-chip'))
    expect(openOverlays(m)).toEqual(['mark'])
    await click(el(m, 'rgp-bar-mark-chip'))
    expect(openOverlays(m)).toEqual([])
  })

  it('opens Edit fields from its chip once the token check passes', async () => {
    const m = renderBar()
    await click(el(m, 'rgp-bar-edit-fields-chip'))
    expect(openOverlays(m)).toEqual(['editFields'])
  })

  it('leaves Edit fields closed when no token is configured', async () => {
    hoisted.sendMessage.mockResolvedValue({ hasPat: false })
    const m = renderBar()
    await click(el(m, 'rgp-bar-edit-fields-chip'))
    expect(hoisted.sendMessage).toHaveBeenCalled()
    expect(openOverlays(m)).toEqual([])
  })

  it.each([
    ['rgp-overflow-rename', 'rename'],
    ['rgp-overflow-reorder', 'reorder'],
    ['rgp-overflow-random-assign', 'randomAssign'],
    ['rgp-overflow-transfer', 'transfer'],
    ['rgp-overflow-delete', 'delete'],
  ])('opens %s from the overflow menu as the only overlay', async (testid, expected) => {
    const m = renderBar()
    await viaOverflow(m, testid)
    expect(openOverlays(m)).toEqual([expected])
  })

  it('opens the help overlay from the ? shortcut', async () => {
    const m = renderBar()
    await act(async () => hoisted.shortcuts.get('help')!.action())
    expect(openOverlays(m)).toEqual(['help'])
  })

  it('opens the requested overlay when another one is already open', async () => {
    const m = renderBar()
    await click(el(m, 'rgp-bar-mark-chip'))
    expect(openOverlays(m)).toEqual(['mark'])
    await viaOverflow(m, 'rgp-overflow-rename')
    expect(openOverlays(m)).toContain('rename')
  })

  // One case per overlay: `closeAllOverlays` used to enumerate all ten setters
  // by hand, and a single missed line left that overlay stuck open.
  it.each([
    ['mark', async (m: MountResult) => click(el(m, 'rgp-bar-mark-chip'))],
    ['editFields', async (m: MountResult) => click(el(m, 'rgp-bar-edit-fields-chip'))],
    ['rename', async (m: MountResult) => viaOverflow(m, 'rgp-overflow-rename')],
    ['reorder', async (m: MountResult) => viaOverflow(m, 'rgp-overflow-reorder')],
    ['randomAssign', async (m: MountResult) => viaOverflow(m, 'rgp-overflow-random-assign')],
    ['transfer', async (m: MountResult) => viaOverflow(m, 'rgp-overflow-transfer')],
    ['delete', async (m: MountResult) => viaOverflow(m, 'rgp-overflow-delete')],
    ['help', async (_m: MountResult) => act(async () => hoisted.shortcuts.get('help')!.action())],
  ])('dismisses %s on Escape', async (id, open) => {
    const m = renderBar()
    await open(m)
    expect(openOverlays(m)).toContain(id)
    await act(async () => hoisted.shortcuts.get('escape')!.action())
    expect(openOverlays(m)).toEqual([])
  })

  // Deep duplicate is single-select only, so it needs its own selection size.
  it('dismisses duplicate on Escape', async () => {
    hoisted.selection.clear()
    hoisted.selection.add('issue:1')
    const m = renderBar()
    await viaOverflow(m, 'rgp-overflow-duplicate')
    expect(openOverlays(m)).toEqual(['duplicate'])
    await act(async () => hoisted.shortcuts.get('escape')!.action())
    expect(openOverlays(m)).toEqual([])
  })

  it('dismisses every overlay when the selection is cleared', async () => {
    const m = renderBar()
    await click(el(m, 'rgp-bar-mark-chip'))
    expect(openOverlays(m)).toEqual(['mark'])
    await act(async () => {
      hoisted.selection.clear()
      hoisted.selectionListeners.forEach((fn) => fn())
    })
    expect(openOverlays(m)).toEqual([])
  })

  it('treats the overflow menu as independent of the ten overlays', async () => {
    const m = renderBar()
    await click(el(m, 'rgp-bar-overflow-chip'))
    expect(el(m, 'rgp-bar-overflow-chip').getAttribute('aria-expanded')).toBe('true')
    expect(openOverlays(m)).toEqual([])
  })

  it('closes the overflow menu when an overlay opens from it', async () => {
    const m = renderBar()
    await viaOverflow(m, 'rgp-overflow-rename')
    expect(openOverlays(m)).toEqual(['rename'])
    expect(el(m, 'rgp-bar-overflow-chip').getAttribute('aria-expanded')).toBe('false')
  })
})

/** The registered table, minus the closures, in registration order. */
function registeredTable(): Array<Omit<RegisteredShortcut, 'action'>> {
  return [...hoisted.shortcuts.values()].map((s) => {
    const { action: _action, ...rest } = s as unknown as RegisteredShortcut
    return rest
  })
}

describe('BulkActionsBar — registered shortcut table', () => {
  it('registers the full table for a multi-item selection', () => {
    renderBar()

    expect(registeredTable()).toEqual([
      {
        id: 'escape',
        key: 'Escape',
        modifiers: {},
        context: 'Global',
        label: 'Close / Deselect',
        allowInEditable: true,
      },
      {
        id: 'select-all',
        key: 'a',
        modifiers: { meta: true },
        context: 'Global',
        label: 'Select All',
      },
      {
        id: 'help',
        key: '?',
        modifiers: { shift: true },
        context: 'Global',
        label: 'Keyboard Shortcuts',
      },
      {
        id: 'focus-actions',
        key: 'b',
        modifiers: { meta: true, shift: true },
        context: 'Global',
        label: 'Focus Actions Menu',
      },
      {
        id: 'edit-fields',
        key: 'e',
        modifiers: { meta: true, shift: true },
        context: 'Table Selection',
        label: 'Edit Fields',
      },
      {
        id: 'random-assign',
        key: 'a',
        modifiers: { meta: true, shift: true },
        context: 'Table Selection',
        label: 'Random Assign',
      },
      {
        id: 'close-issues',
        key: 'x',
        modifiers: { meta: true, shift: true },
        context: 'Table Selection',
        label: 'Close Issues',
      },
      {
        id: 'reopen-issues',
        key: 'o',
        modifiers: { meta: true, shift: true },
        context: 'Table Selection',
        label: 'Reopen Issues',
      },
      {
        id: 'lock-conversations',
        key: 'l',
        modifiers: { meta: true, shift: true },
        context: 'Table Selection',
        label: 'Lock Conversations',
      },
      {
        id: 'pin-issues',
        key: 'f',
        modifiers: { meta: true, shift: true },
        context: 'Table Selection',
        label: 'Pin Issues',
      },
      {
        id: 'transfer-issues',
        key: 'm',
        modifiers: { meta: true, shift: true },
        context: 'Table Selection',
        label: 'Transfer Issues',
      },
      {
        id: 'export-csv',
        key: 'v',
        modifiers: { meta: true, shift: true },
        context: 'Table Selection',
        label: 'Export CSV',
      },
      {
        id: 'rename-titles',
        key: 'r',
        modifiers: { meta: true, shift: true },
        context: 'Table Selection',
        label: 'Rename Titles',
      },
      {
        id: 'reorder-items',
        key: 'j',
        modifiers: { meta: true, shift: true },
        context: 'Table Selection',
        label: 'Reorder Items',
      },
      {
        id: 'delete-items',
        key: 'Backspace',
        modifiers: { meta: true, shift: true },
        context: 'Table Selection',
        label: 'Delete Items',
      },
      {
        id: 'quick-edit',
        key: 'e',
        modifiers: {},
        context: 'Table Selection',
        label: 'Quick Edit',
      },
      {
        id: 'quick-delete',
        key: 'Delete',
        modifiers: {},
        context: 'Table Selection',
        label: 'Delete Items',
      },
    ])
  })

  it('adds the two single-item duplicate shortcuts only when exactly one item is selected', () => {
    hoisted.selection.clear()
    hoisted.selection.add('issue:1')
    renderBar()

    const single = registeredTable()
    expect(single.filter((s) => s.id === 'deep-duplicate')).toEqual([
      {
        id: 'deep-duplicate',
        key: 'd',
        modifiers: { meta: true, shift: true },
        context: 'Table Selection',
        label: 'Deep Duplicate',
      },
    ])
    expect(single.filter((s) => s.id === 'quick-duplicate')).toEqual([
      {
        id: 'quick-duplicate',
        key: 'd',
        modifiers: {},
        context: 'Table Selection',
        label: 'Duplicate',
      },
    ])
  })

  it('keeps only escape and select-all while an overlay is open', async () => {
    const m = renderBar()
    await click(el(m, 'rgp-bar-mark-chip'))

    // a flyout is open: every selection-scoped shortcut unregisters, and so
    // does select-all, leaving escape as the only way out.
    expect(registeredTable().map((s) => s.id)).toEqual(['escape'])
  })

  it('registers nothing while the selection is empty', () => {
    hoisted.selection.clear()
    renderBar()

    expect(registeredTable().map((s) => s.id)).toEqual(['escape', 'select-all'])
  })
})
