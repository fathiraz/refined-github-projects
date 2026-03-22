import React, { useEffect, useState } from 'react'
import type { ContentScriptContext } from 'wxt/utils/content-script-context'
import ReactDOM from 'react-dom/client'
import { StyleSheetManager } from 'styled-components'
import isPropValid from '@emotion/is-prop-valid'
import { BulkActionsBar } from '../../components/bulk-actions-bar'
import { OnboardingCoach } from '../../components/onboarding-coach'
import { QueueTracker } from '../../components/queue-tracker'
import { ToastList } from '../../components/toast-list'
import { CheckboxPortalHost } from '../../components/checkbox-portal-host'
import { SprintPanel } from '../../components/sprint/sprint-panel'
import { ErrorBoundary } from '../../components/error-boundary'
import { ShadowThemeProvider } from '../../components/ui/shadow-theme-provider'
import { queueStore } from '../../lib/queue-store'
import { sprintPanelStore } from '../../lib/sprint-panel-store'
import type { ProjectData } from './observer'

type SprintPanelProps = Omit<React.ComponentProps<typeof SprintPanel>, 'visible' | 'onClose'>

function SprintPanelDriver(props: SprintPanelProps) {
  const [visible, setVisible] = useState(false)
  useEffect(() => { sprintPanelStore.subscribe(setVisible) }, [])
  return (
    <SprintPanel
      {...props}
      visible={visible}
      onClose={() => sprintPanelStore.set(false)}
    />
  )
}

interface ProjectContext {
  projectId: string
  owner: string
  isOrg: boolean
  number: number
}

export async function setupMounts(
  ctx: ContentScriptContext,
  projectContext: ProjectContext,
  getFields: () => Promise<ProjectData>,
) {
  // Mount Bulk Actions Bar (Shadow DOM CSUI)
  const bulkBarUi = await createShadowRootUi(ctx, {
    name: 'rgp-bulk-bar',
    position: 'inline',
    anchor: document.body,
    append: 'last',
    onMount(container, shadow) {
      const styleHost = document.createElement('div')
      container.parentElement!.insertBefore(styleHost, container)
      const root = ReactDOM.createRoot(container)
      root.render(
        <StyleSheetManager target={styleHost} shouldForwardProp={isPropValid}>
          <ShadowThemeProvider>
            <ErrorBoundary name="bulk-bar">
              <BulkActionsBar
                projectId={projectContext.projectId}
                owner={projectContext.owner}
                isOrg={projectContext.isOrg}
                number={projectContext.number}
                getFields={getFields}
              />
            </ErrorBoundary>
          </ShadowThemeProvider>
        </StyleSheetManager>,
      )
      return root
    },
    onRemove(root) {
      root?.unmount()
    },
  })
  bulkBarUi.mount()

  // Mount Queue Tracker (Shadow DOM CSUI)
  const queueUi = await createShadowRootUi(ctx, {
    name: 'rgp-queue-tracker',
    position: 'inline',
    anchor: document.body,
    append: 'last',
    onMount(container, shadow) {
      const styleHost = document.createElement('div')
      container.parentElement!.insertBefore(styleHost, container)
      const root = ReactDOM.createRoot(container)
      root.render(
        <StyleSheetManager target={styleHost} shouldForwardProp={isPropValid}>
          <ShadowThemeProvider>
            <ErrorBoundary name="queue-tracker">
              <QueueTracker />
            </ErrorBoundary>
          </ShadowThemeProvider>
        </StyleSheetManager>,
      )
      return root
    },
    onRemove(root) {
      root?.unmount()
    },
  })
  queueUi.mount()

  // Mount Toast List (Shadow DOM CSUI — bottom-left)
  const toastUi = await createShadowRootUi(ctx, {
    name: 'rgp-toast-list',
    position: 'inline',
    anchor: document.body,
    append: 'last',
    onMount(container, shadow) {
      const styleHost = document.createElement('div')
      container.parentElement!.insertBefore(styleHost, container)
      const root = ReactDOM.createRoot(container)
      root.render(
        <StyleSheetManager target={styleHost} shouldForwardProp={isPropValid}>
          <ShadowThemeProvider>
            <ErrorBoundary name="toast-list">
              <ToastList />
            </ErrorBoundary>
          </ShadowThemeProvider>
        </StyleSheetManager>,
      )
      return root
    },
    onRemove(root) {
      root?.unmount()
    },
  })
  toastUi.mount()

  const onboardingUi = await createShadowRootUi(ctx, {
    name: 'rgp-onboarding',
    position: 'inline',
    anchor: document.body,
    append: 'last',
    onMount(container, shadow) {
      const styleHost = document.createElement('div')
      container.parentElement!.insertBefore(styleHost, container)
      const root = ReactDOM.createRoot(container)
      root.render(
        <StyleSheetManager target={styleHost} shouldForwardProp={isPropValid}>
          <ShadowThemeProvider>
            <ErrorBoundary name="onboarding">
              <OnboardingCoach />
            </ErrorBoundary>
          </ShadowThemeProvider>
        </StyleSheetManager>,
      )
      return root
    },
    onRemove(root) {
      root?.unmount()
    },
  })
  onboardingUi.mount()

  // Mount Sprint Panel (Shadow DOM CSUI — hidden by default, toggled via sprintPanelStore)
  const sprintPanelUi = await createShadowRootUi(ctx, {
    name: 'rgp-sprint-panel',
    position: 'inline',
    anchor: document.body,
    append: 'last',
    onMount(container, shadow) {
      const styleHost = document.createElement('div')
      container.parentElement!.insertBefore(styleHost, container)
      const root = ReactDOM.createRoot(container)
      root.render(
        <StyleSheetManager target={styleHost} shouldForwardProp={isPropValid}>
          <ShadowThemeProvider>
            <ErrorBoundary name="sprint-panel">
              <SprintPanelDriver
                projectId={projectContext.projectId}
                owner={projectContext.owner}
                isOrg={projectContext.isOrg}
                number={projectContext.number}
                getFields={getFields}
              />
            </ErrorBoundary>
          </ShadowThemeProvider>
        </StyleSheetManager>,
      )
      return root
    },
    onRemove(root) {
      root?.unmount()
    },
  })
  sprintPanelUi.mount()

  // Mount single portal host root (all checkbox portals render through this one root)
  const portalHostDiv = document.createElement('div')
  portalHostDiv.id = 'rgp-portal-host'
  document.body.appendChild(portalHostDiv)
  const portalRoot = ReactDOM.createRoot(portalHostDiv)
  portalRoot.render(<CheckboxPortalHost />)

  // Warn before navigating away while background jobs are running
  const handleBeforeUnload = (e: BeforeUnloadEvent) => {
    if (queueStore.hasActive()) {
      e.preventDefault()
      e.returnValue = ''
    }
  }
  window.addEventListener('beforeunload', handleBeforeUnload)
  ctx.onInvalidated(() => window.removeEventListener('beforeunload', handleBeforeUnload))
}
