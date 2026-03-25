export interface Iteration {
  id: string
  title: string
  startDate: string
  duration: number
}

export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10)
}

export function iterationEndDate(iter: Iteration): string {
  const d = new Date(iter.startDate + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + iter.duration)
  return d.toISOString().slice(0, 10)
}

export function isActive(iter: Iteration, today: string): boolean {
  return iter.startDate <= today && today < iterationEndDate(iter)
}

export function nearestUpcoming(iters: Iteration[], today: string): Iteration | null {
  return (
    iters
      .filter((iter) => iter.startDate > today)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))[0] ?? null
  )
}

export function nextAfter(iters: Iteration[], activeEndDate: string): Iteration | null {
  return (
    iters
      .filter((iter) => iter.startDate >= activeEndDate)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))[0] ?? null
  )
}

export const SPRINT_FILTER = '-is:closed -sprint:<@current'

export function injectSprintFilter(): void {
  const input = document.getElementById('filter-bar-component-input') as HTMLInputElement | null
  if (!input || input.value.includes(SPRINT_FILTER)) return

  const newValue = input.value.trim()
    ? `${input.value.trim()} ${SPRINT_FILTER}`
    : SPRINT_FILTER

  input.focus()

  const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  nativeSetter?.call(input, newValue)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true }))
  input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }))
}
