import tippy, { type Instance } from 'tippy.js'
import { sprintPanelStore } from '../../lib/sprint-panel-store'
import { ensureTippyCss, getTippyDelayValue } from '../../lib/tippy-utils'

const ATTR = 'data-rgp-sprint-btn'
const TOOLTIP_DELAY = [400, 0] as const
let _unsub: (() => void) | null = null
let _tooltip: Instance | null = null
let _tooltipButton: HTMLElement | null = null
let _tooltipCleanup: (() => void) | null = null
let _showTimeout: number | null = null
let _hideTimeout: number | null = null

export function injectStatusBarSprintButton() {
  if (_tooltipButton && !_tooltipButton.isConnected) cleanupSprintButtonTooltip()

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
  if (btn) bindSprintButtonTooltip(btn)

  _unsub?.()
  _unsub = sprintPanelStore.subscribe((v) => {
    const el = document.querySelector<HTMLElement>(`[${ATTR}="1"]`)
    if (el) setButtonState(el, v)
    else {
      cleanupSprintButtonTooltip()
      _unsub?.()
      _unsub = null
    }
  })
}

function setButtonState(wrapper: HTMLElement, visible: boolean) {
  const btn = wrapper.querySelector<HTMLElement>('button')
  if (btn) btn.setAttribute('data-variant', visible ? 'default' : 'invisible')
}

function injectSprintButtonStyles(): void {
  if (document.getElementById('rgp-sprint-btn-css')) return
  const el = document.createElement('style')
  el.id = 'rgp-sprint-btn-css'
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

function clearTooltipTimers() {
  if (_showTimeout !== null) {
    window.clearTimeout(_showTimeout)
    _showTimeout = null
  }

  if (_hideTimeout !== null) {
    window.clearTimeout(_hideTimeout)
    _hideTimeout = null
  }
}

function cleanupSprintButtonTooltip() {
  clearTooltipTimers()
  _tooltipCleanup?.()
  _tooltipCleanup = null
  _tooltip?.destroy()
  _tooltip = null
  _tooltipButton = null
}

function bindSprintButtonTooltip(button: HTMLElement) {
  if (_tooltipButton === button) return

  cleanupSprintButtonTooltip()
  _tooltipButton = button
  _tooltip = tippy(button, {
    content: 'Sprint panel',
    placement: 'bottom',
    trigger: 'manual',
  })

  const scheduleShow = () => {
    clearTooltipTimers()
    const showDelay = getTippyDelayValue(TOOLTIP_DELAY, 0)
    if (showDelay > 0) {
      _showTimeout = window.setTimeout(() => {
        _showTimeout = null
        if (_tooltipButton !== button || !button.isConnected) return
        _tooltip?.show()
      }, showDelay)
      return
    }

    _tooltip?.show()
  }

  const scheduleHide = () => {
    if (!_tooltip) return

    if (_showTimeout !== null) {
      window.clearTimeout(_showTimeout)
      _showTimeout = null
    }

    const hideDelay = getTippyDelayValue(TOOLTIP_DELAY, 1)
    if (hideDelay > 0) {
      if (_hideTimeout !== null) window.clearTimeout(_hideTimeout)
      _hideTimeout = window.setTimeout(() => {
        _hideTimeout = null
        _tooltip?.hide()
      }, hideDelay)
      return
    }

    _tooltip.hide()
  }

  const hideImmediately = () => {
    clearTooltipTimers()
    _tooltip?.hide()
  }

  const passiveTouch: AddEventListenerOptions = { passive: true }
  button.addEventListener('mouseenter', scheduleShow)
  button.addEventListener('mouseleave', scheduleHide)
  button.addEventListener('focusin', scheduleShow)
  button.addEventListener('focusout', scheduleHide)
  button.addEventListener('mousedown', hideImmediately)
  button.addEventListener('click', hideImmediately)
  button.addEventListener('touchstart', hideImmediately, passiveTouch)

  _tooltipCleanup = () => {
    button.removeEventListener('mouseenter', scheduleShow)
    button.removeEventListener('mouseleave', scheduleHide)
    button.removeEventListener('focusin', scheduleShow)
    button.removeEventListener('focusout', scheduleHide)
    button.removeEventListener('mousedown', hideImmediately)
    button.removeEventListener('click', hideImmediately)
    button.removeEventListener('touchstart', hideImmediately, passiveTouch)
  }
}
