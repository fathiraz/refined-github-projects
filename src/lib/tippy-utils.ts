import { TIPPY_CSS } from './tippy-css'

export function ensureTippyCss(): void {
  if (document.getElementById('rgp-tippy-css')) return
  const el = document.createElement('style')
  el.id = 'rgp-tippy-css'
  el.textContent = TIPPY_CSS
  document.head.appendChild(el)
}
