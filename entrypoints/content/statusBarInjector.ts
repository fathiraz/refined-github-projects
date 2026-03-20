import tippy from 'tippy.js'
import { sprintPanelStore } from '../../lib/sprintPanelStore'
import { ensureTippyCss } from '../../lib/tippyUtils'

const ATTR = 'data-rgp-sprint-btn'
let _unsub: (() => void) | null = null

export function injectStatusBarSprintButton() {
  // Anchor via stable CSS module class on the "Add status update" token span
  const statusToken = document.querySelector<HTMLElement>('[class*="latest-status-update-module"]')
  if (!statusToken) return

  // Walk up to the button's wrapping <div> (sibling container in the toolbar)
  const statusWrapper = statusToken.closest('button')?.parentElement
  if (!statusWrapper || document.querySelector(`[${ATTR}]`)) return

  const visible = sprintPanelStore.get()

  // Clone the entire wrapper div — inherits all Primer CSS naturally
  const sprintWrapper = statusWrapper.cloneNode(true) as HTMLElement
  sprintWrapper.setAttribute(ATTR, '1')

  // Update label text
  const textEl = sprintWrapper.querySelector('[class*="TokenTextContainer"]')
  if (textEl) textEl.textContent = 'Sprint'

  // Remove status-update module class so it renders as a plain token
  const tokenEl = sprintWrapper.querySelector('[class*="latest-status-update-module"]')
  if (tokenEl) {
    tokenEl.className = tokenEl.className
      .split(' ')
      .filter((c) => !c.includes('latest-status-update-module'))
      .join(' ')
  }

  // Insert before "Add status update"
  statusWrapper.parentElement?.insertBefore(sprintWrapper, statusWrapper)

  // Wire click
  sprintWrapper.querySelector('button')?.addEventListener('click', (e) => {
    e.stopPropagation()
    e.preventDefault()
    sprintPanelStore.toggle()
  })

  setButtonState(sprintWrapper, visible)
  injectSprintButtonStyles()
  ensureTippyCss()
  const btn = sprintWrapper.querySelector('button')
  if (btn) tippy(btn, { content: 'Sprint panel', placement: 'bottom', delay: [400, 0] })

  _unsub?.()
  _unsub = sprintPanelStore.subscribe((v) => {
    const el = document.querySelector<HTMLElement>(`[${ATTR}="1"]`)
    if (el) setButtonState(el, v)
    else { _unsub?.(); _unsub = null }
  })
}

function setButtonState(wrapper: HTMLElement, visible: boolean) {
  const btn = wrapper.querySelector<HTMLElement>('button')
  if (btn) btn.setAttribute('data-variant', visible ? 'default' : 'invisible')
}

function injectSprintButtonStyles(): void {
  if (document.getElementById('ghpira-sprint-btn-css')) return
  const el = document.createElement('style')
  el.id = 'ghpira-sprint-btn-css'
  el.textContent = `
    [data-rgp-sprint-btn] button {
      border: none !important;
      background: transparent !important;
      box-shadow: none !important;
      transition: background-color 120ms ease !important;
    }
    [data-rgp-sprint-btn] button:hover {
      background-color: var(--color-canvas-subtle, rgba(175,184,193,.2)) !important;
    }
  `
  document.head.appendChild(el)
}
