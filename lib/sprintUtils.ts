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

// startDate <= today < endDate
export function isActive(iter: Iteration, today: string): boolean {
  return iter.startDate <= today && today < iterationEndDate(iter)
}

// Smallest startDate that is still in the future
export function nearestUpcoming(iters: Iteration[], today: string): Iteration | null {
  return (
    iters
      .filter((i) => i.startDate > today)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))[0] ?? null
  )
}

// First iteration whose startDate >= the active sprint's endDate
export function nextAfter(iters: Iteration[], activeEndDate: string): Iteration | null {
  return (
    iters
      .filter((i) => i.startDate >= activeEndDate)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))[0] ?? null
  )
}
