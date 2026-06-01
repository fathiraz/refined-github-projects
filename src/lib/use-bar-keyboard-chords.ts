import { useEffect } from 'react'

import { isEditableTarget } from '@/lib/project-table-dom'

/**
 * Single-character bar-focus chord identifiers. These map 1:1 to bulk verbs;
 * `'?'` opens the keyboard help overlay.
 */
export type BarChordKey =
  | 'E' // Edit fields
  | 'R' // Rename
  | 'O' // Reorder
  | 'A' // Random Assign
  | 'M' // Mark
  | 'C' // Close
  | 'P' // Pin
  | 'L' // Lock
  | 'T' // Transfer
  | 'D' // Delete (count > 1) or Duplicate (count === 1)
  | '?'

export interface BarChordHandler {
  /**
   * Optional availability gate. When this returns `false` the chord is a
   * silent no-op (matches the C/P/L "unavailable" semantics).
   */
  available?: () => boolean
  /** Fired when the chord is pressed and `available()` returns truthy. */
  action: () => void
}

export type BarChordMap = Partial<Record<BarChordKey, BarChordHandler>>

/**
 * Bind a bar-focus chord map to the wrapping bar element. Chords only fire
 * while focus is inside `barRef.current`; document-level shortcuts (e.g.
 * GitHub's own keymap) are NOT affected.
 *
 * Modifier presses are ignored so chords don't collide with `Cmd+X` style
 * shortcuts. Editable targets (inputs, textareas, contentEditable) are also
 * ignored.
 */
export function useBarKeyboardChords(
  barRef: React.RefObject<HTMLElement | null>,
  chords: BarChordMap,
): void {
  useEffect(() => {
    const bar = barRef.current
    if (!bar) return

    const handler = (event: KeyboardEvent) => {
      // ignore when typing in a text field — the user is composing input
      if (isEditableTarget(event.target)) return
      // ignore modifier combos so we don't shadow document-level shortcuts
      if (event.metaKey || event.ctrlKey || event.altKey) return

      const key = resolveChordKey(event)
      if (!key) return

      const chord = chords[key]
      if (!chord) return

      // silent no-op when caller marked the chord unavailable
      if (chord.available && !chord.available()) {
        event.preventDefault()
        event.stopPropagation()
        return
      }

      event.preventDefault()
      event.stopPropagation()
      chord.action()
    }

    bar.addEventListener('keydown', handler)
    return () => bar.removeEventListener('keydown', handler)
  }, [barRef, chords])
}

function resolveChordKey(event: KeyboardEvent): BarChordKey | null {
  // help chord: `?` is Shift+/ on most layouts; both `event.key === '?'` and
  // `event.key === '/' && shiftKey` are accepted (but Shift gating is handled
  // by `event.key`, which already accounts for the layout).
  if (event.key === '?') return '?'
  if (event.shiftKey) return null // chords are bare; Shift-letter is reserved for other use

  if (event.key.length !== 1) return null
  const upper = event.key.toUpperCase()
  if (
    upper === 'E' ||
    upper === 'R' ||
    upper === 'O' ||
    upper === 'A' ||
    upper === 'M' ||
    upper === 'C' ||
    upper === 'P' ||
    upper === 'L' ||
    upper === 'T' ||
    upper === 'D'
  ) {
    return upper
  }
  return null
}

/**
 * Disambiguate the `D` chord:
 *   - `count === 1` → Duplicate
 *   - `count > 1`   → Delete
 */
export function resolveDChord(count: number): 'duplicate' | 'delete' {
  return count === 1 ? 'duplicate' : 'delete'
}
