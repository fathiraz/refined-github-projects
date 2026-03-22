export const SPRINT_FILTER = '-is:closed -sprint:<@current'

/** Returns true if the filter bar already contains the sprint filter. */
export function hasSprintFilter(): boolean {
  const input = document.getElementById('filter-bar-component-input') as HTMLInputElement | null
  console.log('[rgp:filter] hasSprintFilter — input:', input, 'value:', input?.value)
  return input?.value.includes(SPRINT_FILTER) ?? false
}

/**
 * Injects SPRINT_FILTER into the GitHub Projects filter bar input.
 * Uses the native HTMLInputElement value setter to bypass React's
 * synthetic event system, then dispatches `input` + Enter keydown
 * events so React picks up the new value and the combobox submits.
 * No-ops if the filter already exists or the input is not found.
 */
export function injectSprintFilter(): void {
  const input = document.getElementById('filter-bar-component-input') as HTMLInputElement | null
  console.log('[rgp:filter] injectSprintFilter called — input found:', !!input, 'current value:', input?.value)
  if (!input) {
    console.warn('[rgp:filter] filter bar input not found — skipping injection')
    return
  }
  if (input.value.includes(SPRINT_FILTER)) {
    console.log('[rgp:filter] filter already present — skipping injection')
    return
  }

  const newValue = input.value.trim()
    ? `${input.value.trim()} ${SPRINT_FILTER}`
    : SPRINT_FILTER

  console.log('[rgp:filter] injecting filter, new value:', newValue)

  // 1. Focus so the combobox is active
  input.focus()

  // 2. Bypass React's value override so the controlled input updates
  const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  nativeSetter?.call(input, newValue)
  input.dispatchEvent(new Event('input', { bubbles: true }))

  // 3. Press Enter to submit the filter (GitHub's combobox requires this)
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true }))
  input.dispatchEvent(new KeyboardEvent('keyup',   { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }))

  console.log('[rgp:filter] filter injected and submitted')
}
