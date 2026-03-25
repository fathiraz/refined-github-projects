import React from 'react'
import ReactDOM from 'react-dom/client'
import { StyleSheetManager } from 'styled-components'
import isPropValid from '@emotion/is-prop-valid'
import tippy, { type Instance } from 'tippy.js'
import { SprintGroupHeaderWidget } from '../../components/sprint/sprint-table-widget'
import { sprintPanelStore } from '../../components/sprint/sprint-store'
import { ensureTippyCss, getTippyDelayValue } from '../../lib/tippy-utils'
import type { ProjectContext, ProjectData } from '../../lib/github-project'

const SPRINT_HDR_ATTR = 'data-rgp-sprint-hdr'
const STATUS_BAR_BUTTON_ATTR = 'data-rgp-sprint-btn'
const TOOLTIP_DELAY = [400, 0] as const

let unsubscribeSprintButton: (() => void) | null = null
let sprintButtonTooltip: Instance | null = null
let sprintTooltipButton: HTMLElement | null = null
let sprintTooltipCleanup: (() => void) | null = null
let showTooltipTimeout: number | null = null
let hideTooltipTimeout: number | null = null

export function createSprintHeaderInjector(
  projectContext: ProjectContext,
  getFields: () => Promise<ProjectData>,
) {
  return () => {
    const currentLabels = document.querySelectorAll<HTMLElement>(
      'span[class*="iteration-group-header-label-module__CurrentIterationLabel"]',
    )

    for (const label of currentLabels) {
      if (label.getAttribute(SPRINT_HDR_ATTR)) continue
      label.setAttribute(SPRINT_HDR_ATTR, '1')

      const hostSpan = document.createElement('span')
      hostSpan.className = 'rgp-sprint-hdr-widget'
      hostSpan.style.cssText = 'display:inline-flex;align-items:center;gap:4px;margin-left:4px;vertical-align:middle'
      label.after(hostSpan)

      ReactDOM.createRoot(hostSpan).render(
        <StyleSheetManager shouldForwardProp={isPropValid}>
          <SprintGroupHeaderWidget
            projectId={projectContext.projectId}
            owner={projectContext.owner}
            isOrg={projectContext.isOrg}
            number={projectContext.number}
            getFields={getFields}
          />
        </StyleSheetManager>,
      )
    }
  }
}

export function injectStatusBarSprintButton() {
  if (sprintTooltipButton && !sprintTooltipButton.isConnected) cleanupSprintButtonTooltip()

  const statusToken = document.querySelector<HTMLElement>('[class*="latest-status-update-module"]')
  if (!statusToken) return

  const statusWrapper = statusToken.closest('button')?.parentElement
  if (!statusWrapper || document.querySelector(`[${STATUS_BAR_BUTTON_ATTR}]`)) return

  const visible = sprintPanelStore.get()
  const sprintWrapper = statusWrapper.cloneNode(true) as HTMLElement
  sprintWrapper.setAttribute(STATUS_BAR_BUTTON_ATTR, '1')

  const textEl = sprintWrapper.querySelector('[class*="TokenTextContainer"]')
  if (textEl) textEl.textContent = 'Sprint'

  const tokenEl = sprintWrapper.querySelector('[class*="latest-status-update-module"]')
  if (tokenEl) {
    tokenEl.className = tokenEl.className
      .split(' ')
      .filter((className) => !className.includes('latest-status-update-module'))
      .join(' ')
  }

  statusWrapper.parentElement?.insertBefore(sprintWrapper, statusWrapper)

  sprintWrapper.querySelector('button')?.addEventListener('click', (event) => {
    event.stopPropagation()
    event.preventDefault()
    sprintPanelStore.toggle()
  })

  setSprintButtonState(sprintWrapper, visible)
  injectSprintButtonStyles()
  ensureTippyCss()
  const button = sprintWrapper.querySelector('button')
  if (button) bindSprintButtonTooltip(button)

  unsubscribeSprintButton?.()
  unsubscribeSprintButton = sprintPanelStore.subscribe((isVisible) => {
    const element = document.querySelector<HTMLElement>(`[${STATUS_BAR_BUTTON_ATTR}="1"]`)
    if (element) {
      setSprintButtonState(element, isVisible)
      return
    }

    cleanupSprintButtonTooltip()
    unsubscribeSprintButton?.()
    unsubscribeSprintButton = null
  })
}

function setSprintButtonState(wrapper: HTMLElement, visible: boolean) {
  const button = wrapper.querySelector<HTMLElement>('button')
  if (button) button.setAttribute('data-variant', visible ? 'default' : 'invisible')
}

function injectSprintButtonStyles() {
  if (document.getElementById('rgp-sprint-btn-css')) return
  const style = document.createElement('style')
  style.id = 'rgp-sprint-btn-css'
  style.textContent = `
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
  document.head.appendChild(style)
}

function clearTooltipTimers() {
  if (showTooltipTimeout !== null) {
    window.clearTimeout(showTooltipTimeout)
    showTooltipTimeout = null
  }

  if (hideTooltipTimeout !== null) {
    window.clearTimeout(hideTooltipTimeout)
    hideTooltipTimeout = null
  }
}

function cleanupSprintButtonTooltip() {
  clearTooltipTimers()
  sprintTooltipCleanup?.()
  sprintTooltipCleanup = null
  sprintButtonTooltip?.destroy()
  sprintButtonTooltip = null
  sprintTooltipButton = null
}

function bindSprintButtonTooltip(button: HTMLElement) {
  if (sprintTooltipButton === button) return

  cleanupSprintButtonTooltip()
  sprintTooltipButton = button
  sprintButtonTooltip = tippy(button, {
    content: 'Sprint panel',
    placement: 'bottom',
    trigger: 'manual',
  })

  const scheduleShow = () => {
    clearTooltipTimers()
    const showDelay = getTippyDelayValue(TOOLTIP_DELAY, 0)
    if (showDelay > 0) {
      showTooltipTimeout = window.setTimeout(() => {
        showTooltipTimeout = null
        if (sprintTooltipButton !== button || !button.isConnected) return
        sprintButtonTooltip?.show()
      }, showDelay)
      return
    }

    sprintButtonTooltip?.show()
  }

  const scheduleHide = () => {
    if (!sprintButtonTooltip) return

    if (showTooltipTimeout !== null) {
      window.clearTimeout(showTooltipTimeout)
      showTooltipTimeout = null
    }

    const hideDelay = getTippyDelayValue(TOOLTIP_DELAY, 1)
    if (hideDelay > 0) {
      if (hideTooltipTimeout !== null) window.clearTimeout(hideTooltipTimeout)
      hideTooltipTimeout = window.setTimeout(() => {
        hideTooltipTimeout = null
        sprintButtonTooltip?.hide()
      }, hideDelay)
      return
    }

    sprintButtonTooltip.hide()
  }

  const hideImmediately = () => {
    clearTooltipTimers()
    sprintButtonTooltip?.hide()
  }

  const passiveTouch: AddEventListenerOptions = { passive: true }
  button.addEventListener('mouseenter', scheduleShow)
  button.addEventListener('mouseleave', scheduleHide)
  button.addEventListener('focusin', scheduleShow)
  button.addEventListener('focusout', scheduleHide)
  button.addEventListener('mousedown', hideImmediately)
  button.addEventListener('click', hideImmediately)
  button.addEventListener('touchstart', hideImmediately, passiveTouch)

  sprintTooltipCleanup = () => {
    button.removeEventListener('mouseenter', scheduleShow)
    button.removeEventListener('mouseleave', scheduleHide)
    button.removeEventListener('focusin', scheduleShow)
    button.removeEventListener('focusout', scheduleHide)
    button.removeEventListener('mousedown', hideImmediately)
    button.removeEventListener('click', hideImmediately)
    button.removeEventListener('touchstart', hideImmediately, passiveTouch)
  }
}
