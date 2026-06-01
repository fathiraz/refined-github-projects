import React, { act, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/debug-logger', () => ({
  logger: { log: () => {}, warn: () => {}, error: () => {}, info: () => {} },
  initDebugLogger: async () => {},
}))

import {
  resolveDChord,
  useBarKeyboardChords,
  type BarChordMap,
} from '@/lib/use-bar-keyboard-chords'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

interface HarnessProps {
  chords: BarChordMap
  outsideRef?: React.MutableRefObject<HTMLElement | null>
}

function Harness({ chords, outsideRef }: HarnessProps) {
  const barRef = useRef<HTMLDivElement | null>(null)
  useBarKeyboardChords(barRef, chords)
  return React.createElement(
    'div',
    null,
    React.createElement('div', { ref: barRef, 'data-testid': 'bar', tabIndex: -1 }),
    React.createElement('input', {
      ref: (el: HTMLInputElement | null) => {
        if (outsideRef) outsideRef.current = el
      },
      'data-testid': 'outside-input',
    }),
  )
}

let mounted: Array<{ container: HTMLDivElement; root: Root }> = []

function render(node: React.ReactElement): HTMLDivElement {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(node)
  })
  mounted.push({ container, root })
  return container
}

function pressKey(target: HTMLElement, key: string, shift = false): void {
  act(() => {
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key, shiftKey: shift, bubbles: true, cancelable: true }),
    )
  })
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

describe('useBarKeyboardChords', () => {
  it('fires the chord action when its key is pressed inside the bar', () => {
    const onEdit = vi.fn()
    const container = render(<Harness chords={{ E: { action: onEdit } }} />)
    const bar = container.querySelector('[data-testid="bar"]') as HTMLElement
    pressKey(bar, 'e')
    expect(onEdit).toHaveBeenCalledTimes(1)
  })

  it('ignores chord keys when target is an editable element', () => {
    const onEdit = vi.fn()
    const outsideRef = { current: null } as React.MutableRefObject<HTMLElement | null>
    render(<Harness chords={{ E: { action: onEdit } }} outsideRef={outsideRef} />)
    // We dispatch on the input itself; the bar's listener won't fire because
    // the event never bubbles into the bar.
    pressKey(outsideRef.current as HTMLElement, 'e')
    expect(onEdit).not.toHaveBeenCalled()
  })

  it('does not fire when modifier keys are pressed', () => {
    const onEdit = vi.fn()
    const container = render(<Harness chords={{ E: { action: onEdit } }} />)
    const bar = container.querySelector('[data-testid="bar"]') as HTMLElement
    act(() => {
      bar.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'e', metaKey: true, bubbles: true, cancelable: true }),
      )
    })
    expect(onEdit).not.toHaveBeenCalled()
  })

  it('silent no-op when the chord is available=false', () => {
    const onClose = vi.fn()
    const container = render(
      <Harness chords={{ C: { available: () => false, action: onClose } }} />,
    )
    const bar = container.querySelector('[data-testid="bar"]') as HTMLElement
    pressKey(bar, 'c')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('fires when available=true', () => {
    const onClose = vi.fn()
    const container = render(<Harness chords={{ C: { available: () => true, action: onClose } }} />)
    const bar = container.querySelector('[data-testid="bar"]') as HTMLElement
    pressKey(bar, 'c')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("'?' opens help overlay handler", () => {
    const onHelp = vi.fn()
    const container = render(<Harness chords={{ '?': { action: onHelp } }} />)
    const bar = container.querySelector('[data-testid="bar"]') as HTMLElement
    pressKey(bar, '?')
    expect(onHelp).toHaveBeenCalledTimes(1)
  })

  it('ignores Shift+letter (Shift is reserved)', () => {
    const onEdit = vi.fn()
    const container = render(<Harness chords={{ E: { action: onEdit } }} />)
    const bar = container.querySelector('[data-testid="bar"]') as HTMLElement
    pressKey(bar, 'E', true)
    expect(onEdit).not.toHaveBeenCalled()
  })
})

describe('resolveDChord', () => {
  it("disambiguates to 'duplicate' when count === 1", () => {
    expect(resolveDChord(1)).toBe('duplicate')
  })
  it("disambiguates to 'delete' when count > 1", () => {
    expect(resolveDChord(2)).toBe('delete')
    expect(resolveDChord(100)).toBe('delete')
  })
})
