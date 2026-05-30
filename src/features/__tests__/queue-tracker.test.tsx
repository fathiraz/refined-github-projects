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
  return {
    processId: 'p1',
    label: 'Bulk update',
    total: 4,
    completed: 1,
    paused: false,
    done: false,
    ...overrides,
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
})
