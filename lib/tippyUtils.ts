import { TIPPY_CSS } from './tippyCss'

export function ensureTippyCss(): void {
  if (document.getElementById('ghpira-tippy-css')) return
  const el = document.createElement('style')
  el.id = 'ghpira-tippy-css'
  el.textContent = TIPPY_CSS
  document.head.appendChild(el)
}
