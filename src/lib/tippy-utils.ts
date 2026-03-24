import { TIPPY_CSS } from './tippy-css'

export function ensureTippyCss(): void {
  if (document.getElementById('rgp-tippy-css')) return
  const el = document.createElement('style')
  el.id = 'rgp-tippy-css'
  el.textContent = TIPPY_CSS
  document.head.appendChild(el)
}

export function getTippyDelayValue(
  delay: number | readonly [number | null | undefined, number | null | undefined] | null | undefined,
  index: 0 | 1,
): number {
  if (delay == null) return 0
  if (typeof delay === 'number') return Math.max(0, delay)
  return Math.max(0, delay[index] ?? 0)
}
