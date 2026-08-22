import { describe, it, expect, vi, afterEach } from 'vitest'

import {
  todayUtc,
  fmt,
  fmtRange,
  daysLeft,
  iterationEndDate,
  isActive,
  nearestUpcoming,
  nextAfter,
  type Iteration,
} from '@/lib/sprint-utils'

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function iter(overrides: Partial<Iteration> & { startDate: string; duration: number }): Iteration {
  return { id: overrides.id ?? 'iter-1', title: overrides.title ?? 'Sprint', ...overrides }
}

// ---------------------------------------------------------------------------
// todayUtc
// ---------------------------------------------------------------------------

describe('todayUtc', () => {
  it('returns a YYYY-MM-DD string', () => {
    const result = todayUtc()
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

// ---------------------------------------------------------------------------
// iterationEndDate
// ---------------------------------------------------------------------------

describe('iterationEndDate', () => {
  it('adds 7 days to start date', () => {
    const result = iterationEndDate(iter({ startDate: '2026-04-01', duration: 7 }))
    expect(result).toBe('2026-04-08')
  })

  it('adds 14 days to start date', () => {
    const result = iterationEndDate(iter({ startDate: '2026-04-01', duration: 14 }))
    expect(result).toBe('2026-04-15')
  })

  it('handles month boundary correctly', () => {
    const result = iterationEndDate(iter({ startDate: '2026-01-28', duration: 7 }))
    expect(result).toBe('2026-02-04')
  })
})

// ---------------------------------------------------------------------------
// fmtRange
//
// `iterationEndDate` is deliberately EXCLUSIVE (`start + duration`) because
// `isActive`, `nextAfter` and `daysLeft` all depend on that. GitHub renders the
// INCLUSIVE last day, so the display helper steps back one day. Asserting
// against `fmt` rather than a literal keeps these locale-independent — what is
// under test is which date gets rendered, not how it is spelled.
// ---------------------------------------------------------------------------

describe('fmtRange', () => {
  it('renders the inclusive last day, not the exclusive end', () => {
    const sprint = iter({ startDate: '2026-08-19', duration: 14 })
    expect(iterationEndDate(sprint)).toBe('2026-09-02')
    expect(fmtRange(sprint.startDate, iterationEndDate(sprint))).toBe(
      `${fmt('2026-08-19')} – ${fmt('2026-09-01')}`,
    )
  })

  it('steps back across a month boundary', () => {
    expect(fmtRange('2026-01-28', '2026-02-04')).toBe(`${fmt('2026-01-28')} – ${fmt('2026-02-03')}`)
  })

  it('steps back across a year boundary', () => {
    expect(fmtRange('2025-12-22', '2026-01-05')).toBe(`${fmt('2025-12-22')} – ${fmt('2026-01-04')}`)
  })

  it('steps back across a leap day', () => {
    expect(fmtRange('2028-02-16', '2028-03-01')).toBe(`${fmt('2028-02-16')} – ${fmt('2028-02-29')}`)
  })
})

// ---------------------------------------------------------------------------
// daysLeft — guards the exclusive-end semantics the display fix must NOT change
// ---------------------------------------------------------------------------

describe('daysLeft', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  function atUtc(instant: string) {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(instant))
  }

  it('counts from today to the exclusive end', () => {
    atUtc('2026-08-22T10:00:00Z')
    expect(daysLeft('2026-09-02')).toBe(11)
  })

  it('returns 1 on the sprint final day', () => {
    atUtc('2026-09-01T23:00:00Z')
    expect(daysLeft('2026-09-02')).toBe(1)
  })

  it('returns 0 once the exclusive end arrives', () => {
    atUtc('2026-09-02T00:00:00Z')
    expect(daysLeft('2026-09-02')).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// isActive
// ---------------------------------------------------------------------------

describe('isActive', () => {
  const sprint = iter({ startDate: '2026-04-01', duration: 14 })

  it('returns true when today is the start date', () => {
    expect(isActive(sprint, '2026-04-01')).toBe(true)
  })

  it('returns true when today is in the middle of the sprint', () => {
    expect(isActive(sprint, '2026-04-07')).toBe(true)
  })

  it('returns false when today is the end date (exclusive end)', () => {
    expect(isActive(sprint, '2026-04-15')).toBe(false)
  })

  it('returns false when today is before the start date', () => {
    expect(isActive(sprint, '2026-03-31')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// nearestUpcoming
// ---------------------------------------------------------------------------

describe('nearestUpcoming', () => {
  it('picks the earliest future iteration when multiple exist', () => {
    const iters = [
      iter({ id: 'a', startDate: '2026-05-01', duration: 7 }),
      iter({ id: 'b', startDate: '2026-04-15', duration: 7 }),
      iter({ id: 'c', startDate: '2026-06-01', duration: 7 }),
    ]
    const result = nearestUpcoming(iters, '2026-04-10')
    expect(result).not.toBeNull()
    expect(result!.id).toBe('b')
  })

  it('returns null when no future iterations exist', () => {
    const iters = [
      iter({ id: 'a', startDate: '2026-03-01', duration: 7 }),
      iter({ id: 'b', startDate: '2026-02-01', duration: 7 }),
    ]
    expect(nearestUpcoming(iters, '2026-04-10')).toBeNull()
  })

  it('filters out past iterations and picks the nearest future one', () => {
    const iters = [
      iter({ id: 'past', startDate: '2026-03-01', duration: 7 }),
      iter({ id: 'future-far', startDate: '2026-06-01', duration: 7 }),
      iter({ id: 'future-near', startDate: '2026-04-20', duration: 7 }),
    ]
    const result = nearestUpcoming(iters, '2026-04-10')
    expect(result).not.toBeNull()
    expect(result!.id).toBe('future-near')
  })
})

// ---------------------------------------------------------------------------
// nextAfter
// ---------------------------------------------------------------------------

describe('nextAfter', () => {
  it('picks the earliest iteration starting on or after the given date', () => {
    const iters = [
      iter({ id: 'a', startDate: '2026-04-15', duration: 14 }),
      iter({ id: 'b', startDate: '2026-04-29', duration: 14 }),
      iter({ id: 'c', startDate: '2026-05-13', duration: 14 }),
    ]
    const result = nextAfter(iters, '2026-04-15')
    expect(result).not.toBeNull()
    expect(result!.id).toBe('a')
  })

  it('returns null when no iterations start on or after the given date', () => {
    const iters = [
      iter({ id: 'a', startDate: '2026-03-01', duration: 14 }),
      iter({ id: 'b', startDate: '2026-03-15', duration: 14 }),
    ]
    expect(nextAfter(iters, '2026-04-15')).toBeNull()
  })

  it('returns null for empty array', () => {
    expect(nextAfter([], '2026-04-15')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// injectSprintFilter
// ---------------------------------------------------------------------------

describe('injectSprintFilter', () => {
  it('appends SPRINT_FILTER to the filter input value', async () => {
    const { injectSprintFilter, SPRINT_FILTER } = await import('@/lib/sprint-utils')

    const input = document.createElement('input')
    input.id = 'filter-bar-component-input'
    input.value = 'label:bug'
    document.body.appendChild(input)

    injectSprintFilter()

    expect(input.value).toContain(SPRINT_FILTER)
    document.body.removeChild(input)
  })

  it('sets SPRINT_FILTER as entire value when input is empty', async () => {
    const { injectSprintFilter, SPRINT_FILTER } = await import('@/lib/sprint-utils')

    const input = document.createElement('input')
    input.id = 'filter-bar-component-input'
    input.value = ''
    document.body.appendChild(input)

    injectSprintFilter()

    expect(input.value).toBe(SPRINT_FILTER)
    document.body.removeChild(input)
  })

  it('does nothing when filter is already present', async () => {
    const { injectSprintFilter, SPRINT_FILTER } = await import('@/lib/sprint-utils')

    const input = document.createElement('input')
    input.id = 'filter-bar-component-input'
    input.value = SPRINT_FILTER
    document.body.appendChild(input)

    injectSprintFilter()

    // should not duplicate the filter
    const count = input.value.split(SPRINT_FILTER).length - 1
    expect(count).toBe(1)
    document.body.removeChild(input)
  })

  it('does nothing when input element is not found', async () => {
    const { injectSprintFilter } = await import('@/lib/sprint-utils')
    // no element in DOM — should not throw
    expect(() => injectSprintFilter()).not.toThrow()
  })
})
