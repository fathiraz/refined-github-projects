import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ThemeProvider, BaseStyles } from '@primer/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/tippy-utils', () => ({
  ensureTippyCss: () => {},
}))

vi.mock('@/ui/tooltip', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/lib/messages', () => ({
  sendMessage: vi.fn(),
}))

vi.mock('@/lib/queue-store', () => ({
  queueStore: {
    subscribe: () => () => {},
    dismiss: () => {},
  },
}))

import { ProcessCard, formatTrackerTitle } from '@/features/queue-tracker'
import type { ProcessEntry } from '@/lib/queue-store'

function makeEntry(overrides: Partial<ProcessEntry> = {}): ProcessEntry {
  const base = {
    processId: 'p1',
    label: 'Bulk update',
    total: 4,
    completed: 1,
    paused: false,
    done: false,
    ...overrides,
  }
  return {
    ...base,
    phase: base.done
      ? base.failedItems && base.failedItems.length > 0
        ? {
            kind: 'partial',
            failedItemIds: base.failedItems.map((f) => f.id),
            failedItems: base.failedItems,
          }
        : { kind: 'success' }
      : { kind: 'in-flight', progress: { done: base.completed, total: base.total } },
  }
}

function renderCards(entries: ProcessEntry[]): { container: HTMLDivElement; root: Root } {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(
      <ThemeProvider colorMode="day">
        <BaseStyles>
          {entries.map((e) => (
            <ProcessCard key={e.processId} entry={e} onDismiss={() => {}} />
          ))}
        </BaseStyles>
      </ThemeProvider>,
    )
  })
  return { container, root }
}

describe('formatTrackerTitle', () => {
  it('returns plain label when total === 0', () => {
    expect(formatTrackerTitle({ label: 'Bulk update', total: 0 })).toBe('Bulk update')
  })

  it('uses singular noun when total === 1', () => {
    expect(formatTrackerTitle({ label: 'Bulk update', total: 1 })).toBe('Bulk update · 1 item')
  })

  it('uses plural noun when total > 1', () => {
    expect(formatTrackerTitle({ label: 'Bulk update', total: 4 })).toBe('Bulk update · 4 items')
  })

  it('uses U+00B7 middle dot as separator', () => {
    const out = formatTrackerTitle({ label: 'x', total: 2 })
    expect(out.includes('·')).toBe(true)
  })
})

describe('ProcessCard rendering', () => {
  let mounted: Array<{ container: HTMLDivElement; root: Root }> = []

  beforeEach(() => {
    mounted = []
  })

  afterEach(() => {
    for (const { container, root } of mounted) {
      act(() => root.unmount())
      container.remove()
    }
  })

  it('sets role="status" and aria-live="polite" on outer container', () => {
    const m = renderCards([makeEntry()])
    mounted.push(m)
    const card = m.container.querySelector('[data-testid="rgp-queue-tracker-card"]')
    expect(card).not.toBeNull()
    expect(card!.getAttribute('role')).toBe('status')
    expect(card!.getAttribute('aria-live')).toBe('polite')
  })

  it('renders one data-testid node per entry', () => {
    const entries = [
      makeEntry({ processId: 'a' }),
      makeEntry({ processId: 'b' }),
      makeEntry({ processId: 'c' }),
    ]
    const m = renderCards(entries)
    mounted.push(m)
    const cards = m.container.querySelectorAll('[data-testid="rgp-queue-tracker-card"]')
    expect(cards.length).toBe(entries.length)
  })

  it('hides the n/total fraction when entry.done === true', () => {
    const m = renderCards([makeEntry({ done: true, completed: 4, total: 4 })])
    mounted.push(m)
    const text = m.container.textContent ?? ''
    expect(text.includes('4/4')).toBe(false)
  })

  it('shows the n/total fraction when entry.done === false', () => {
    const m = renderCards([makeEntry({ done: false, completed: 1, total: 4 })])
    mounted.push(m)
    const text = m.container.textContent ?? ''
    expect(text.includes('1/4')).toBe(true)
  })

  it("tags 'in-flight' cards with data-phase-testid", () => {
    const m = renderCards([makeEntry({ done: false })])
    mounted.push(m)
    const card = m.container.querySelector('[data-testid="rgp-queue-tracker-card"]')
    expect(card!.getAttribute('data-phase')).toBe('in-flight')
    expect(card!.getAttribute('data-phase-testid')).toBe('rgp-tracker-in-flight')
  })

  it("tags 'success' cards with data-phase-testid", () => {
    const m = renderCards([makeEntry({ done: true, completed: 4, total: 4 })])
    mounted.push(m)
    const card = m.container.querySelector('[data-testid="rgp-queue-tracker-card"]')
    expect(card!.getAttribute('data-phase-testid')).toBe('rgp-tracker-success')
  })

  it("tags 'partial' cards with data-phase-testid", () => {
    const m = renderCards([
      makeEntry({
        done: true,
        completed: 4,
        total: 4,
        failedItems: [{ id: 'a', title: 'a', error: 'boom' }],
      }),
    ])
    mounted.push(m)
    const card = m.container.querySelector('[data-testid="rgp-queue-tracker-card"]')
    expect(card!.getAttribute('data-phase-testid')).toBe('rgp-tracker-partial')
  })

  it('renders Undo button when phase=success with a reverse op', () => {
    const m = renderCards([
      {
        ...makeEntry({ done: true, completed: 4, total: 4 }),
        phase: {
          kind: 'success',
          undoableUntil: Date.now() + 10_000,
          reverse: {
            messageType: 'bulkUpdate',
            data: { reopen: true },
            affectedItemIds: ['x'],
            label: 'Reopen 4 issues',
          },
        },
      },
    ])
    mounted.push(m)
    const undo = m.container.querySelector('[data-testid="rgp-tracker-undo"]') as HTMLButtonElement
    expect(undo).not.toBeNull()
    expect(undo.textContent).toBe('Reopen 4 issues')
    expect(undo.disabled).toBe(false)
  })

  it('disables Undo when entry is paused (rate-limited)', () => {
    const m = renderCards([
      {
        ...makeEntry({ done: true, completed: 4, total: 4, paused: true }),
        phase: {
          kind: 'success',
          undoableUntil: Date.now() + 10_000,
          reverse: {
            messageType: 'bulkUpdate',
            data: {},
            affectedItemIds: ['x'],
          },
        },
      },
    ])
    mounted.push(m)
    const undo = m.container.querySelector('[data-testid="rgp-tracker-undo"]') as HTMLButtonElement
    expect(undo.disabled).toBe(true)
  })

  it('hides Undo row when phase=success has no reverse op', () => {
    const m = renderCards([makeEntry({ done: true, completed: 4, total: 4 })])
    mounted.push(m)
    expect(m.container.querySelector('[data-testid="rgp-tracker-undo-row"]')).toBeNull()
  })
})
