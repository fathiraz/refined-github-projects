export interface Iteration {
  id: string
  title: string
  startDate: string
  duration: number
}

export interface FieldNode {
  id: string
  name: string
  dataType: string
  options?: { id: string; name: string; color: string }[]
  configuration?: {
    iterations: Iteration[]
  }
}

/** A `YYYY-MM-DD` sprint date as a Date fixed at UTC midnight. */
function utcMidnight(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`)
}

/** Earliest iteration matching `pick`, or null. ISO dates sort lexicographically. */
function earliestBy(iters: Iteration[], pick: (iter: Iteration) => boolean): Iteration | null {
  return iters.filter(pick).sort((a, b) => a.startDate.localeCompare(b.startDate))[0] ?? null
}

export function fmt(iso: string): string {
  return utcMidnight(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

/**
 * A sprint's date range the way GitHub prints it. `iterationEndDate` is
 * exclusive — `isActive`, `nextAfter` and `daysLeft` all rely on that — so the
 * last day shown is one day before it.
 */
export function fmtRange(startDate: string, exclusiveEndDate: string): string {
  const lastDay = utcMidnight(exclusiveEndDate)
  lastDay.setUTCDate(lastDay.getUTCDate() - 1)
  return `${fmt(startDate)} – ${fmt(lastDay.toISOString().slice(0, 10))}`
}

export function daysLeft(endDate: string): number {
  const remainingMs = utcMidnight(endDate).getTime() - utcMidnight(todayUtc()).getTime()
  return Math.max(0, Math.ceil(remainingMs / 86_400_000))
}

export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10)
}

export function iterationEndDate(iter: Iteration): string {
  const d = utcMidnight(iter.startDate)
  d.setUTCDate(d.getUTCDate() + iter.duration)
  return d.toISOString().slice(0, 10)
}

export function isActive(iter: Iteration, today: string): boolean {
  return iter.startDate <= today && today < iterationEndDate(iter)
}

export function nearestUpcoming(iters: Iteration[], today: string): Iteration | null {
  return earliestBy(iters, (iter) => iter.startDate > today)
}

export function nextAfter(iters: Iteration[], activeEndDate: string): Iteration | null {
  return earliestBy(iters, (iter) => iter.startDate >= activeEndDate)
}

export const SPRINT_FILTER = '-sprint:<@current'

export function injectSprintFilter(): void {
  const input = document.getElementById('filter-bar-component-input') as HTMLInputElement | null
  if (!input || input.value.includes(SPRINT_FILTER)) return

  const newValue = input.value.trim() ? `${input.value.trim()} ${SPRINT_FILTER}` : SPRINT_FILTER

  input.focus()

  const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  nativeSetter?.call(input, newValue)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      bubbles: true,
      cancelable: true,
    }),
  )
  input.dispatchEvent(
    new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }),
  )
}
