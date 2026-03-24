import React from 'react'
import ReactDOM from 'react-dom/client'
import { StyleSheetManager } from 'styled-components'
import isPropValid from '@emotion/is-prop-valid'
import { SprintGroupHeaderWidget } from '../../components/sprint/sprint-table-widget'
import type { ProjectData } from './observer'

const SPRINT_HDR_ATTR = 'data-rgp-sprint-hdr'

interface ProjectContext {
  projectId: string
  owner: string
  isOrg: boolean
  number: number
}

let _ctx: ProjectContext | null = null
let _getFields: (() => Promise<ProjectData>) | null = null

export function initSprintInjector(ctx: ProjectContext, getFields: () => Promise<ProjectData>) {
  _ctx = ctx
  _getFields = getFields
  return injectSprintHeaders
}

export function injectSprintHeaders() {
  if (!_ctx || !_getFields) return
  const currentLabels = document.querySelectorAll<HTMLElement>('span[class*="iteration-group-header-label-module__CurrentIterationLabel"]')
  for (const label of currentLabels) {
    if (label.getAttribute(SPRINT_HDR_ATTR)) continue
    label.setAttribute(SPRINT_HDR_ATTR, '1')

    const hostSpan = document.createElement('span')
    hostSpan.className = 'rgp-sprint-hdr-widget'
    hostSpan.style.cssText =
      'display:inline-flex;align-items:center;gap:4px;margin-left:4px;vertical-align:middle'
    label.after(hostSpan)

    const ctx = _ctx!
    const getFields = _getFields!
    ReactDOM.createRoot(hostSpan).render(
      <StyleSheetManager shouldForwardProp={isPropValid}>
        <SprintGroupHeaderWidget
          projectId={ctx.projectId}
          owner={ctx.owner}
          isOrg={ctx.isOrg}
          number={ctx.number}
          getFields={getFields}
        />
      </StyleSheetManager>,
    )
  }
}
