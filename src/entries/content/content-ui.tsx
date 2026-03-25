import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ContentScriptContext } from 'wxt/utils/content-script-context'
import ReactDOM from 'react-dom/client'
import { StyleSheetManager } from 'styled-components'
import isPropValid from '@emotion/is-prop-valid'
import { Box, registerPortalRoot, ThemeProvider } from '@primer/react'
import { BulkActionsBar } from '../../components/bulk/bulk-actions-bar'
import { OnboardingCoach } from '../../components/onboarding-coach'
import { QueueTracker } from '../../components/queue-tracker'
import { ToastList } from '../../components/toast-list'
import { CheckboxPortalHost } from '../../components/checkbox-portal-host'
import { SprintPanel } from '../../components/sprint/sprint-modal'
import { ErrorBoundary } from '../../components/ui/error-boundary'
import { ShadowThemeProvider } from '../../components/ui/shadow-theme-provider'
import { BULK_BAR_PRIMER_PORTAL_NAME, installPrimerShadowDomCompat } from '../../lib/primer-shadow-dom-compat'
import { Z_MODAL_PORTAL } from '../../lib/z-index'
import { queueStore } from '../../lib/queue-store'
import { sprintPanelStore } from '../../components/sprint/sprint-store'
import type { ProjectContext, ProjectData } from '../../lib/github-project'

type SprintPanelProps = Omit<React.ComponentProps<typeof SprintPanel>, 'visible' | 'onClose'>

function SprintPanelDriver(props: SprintPanelProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const unsubscribe = sprintPanelStore.subscribe(setVisible)
    return () => {
      unsubscribe()
    }
  }, [])

  return (
    <SprintPanel
      {...props}
      visible={visible}
      onClose={() => sprintPanelStore.set(false)}
    />
  )
}

function PrimerPortalRootHost({ shadowRoot }: { shadowRoot: ShadowRoot }) {
  const portalRootRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const portalRoot = portalRootRef.current
    if (!portalRoot) return

    const cleanupShadowCompat = installPrimerShadowDomCompat(portalRoot, shadowRoot)
    registerPortalRoot(portalRoot, BULK_BAR_PRIMER_PORTAL_NAME)

    return cleanupShadowCompat
  }, [shadowRoot])

  return (
    <Box
      ref={portalRootRef}
      data-rgp-primer-portal=""
      sx={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: Z_MODAL_PORTAL,
      }}
    />
  )
}

const RGP_PRIMER_PORTAL_SURFACE_CSS = `
[data-rgp-primer-portal],
[data-rgp-primer-portal] * {
  font-family: inherit;
}
[data-rgp-primer-portal] > *,
[data-rgp-primer-portal] > * * {
  pointer-events: auto;
}
`

export async function setupContentUi(
  ctx: ContentScriptContext,
  projectContext: ProjectContext,
  getFields: () => Promise<ProjectData>,
) {
  const bulkBarUi = await createShadowRootUi(ctx, {
    name: 'rgp-bulk-bar',
    position: 'inline',
    anchor: document.body,
    append: 'last',
    onMount(container, shadow) {
      const styleHost = document.createElement('div')
      container.parentElement!.insertBefore(styleHost, container)
      const portalSurfaceStyle = document.createElement('style')
      portalSurfaceStyle.setAttribute('data-rgp-primer-portal-surface', '')
      portalSurfaceStyle.textContent = RGP_PRIMER_PORTAL_SURFACE_CSS
      styleHost.appendChild(portalSurfaceStyle)
      const root = ReactDOM.createRoot(container)
      root.render(
        <StyleSheetManager target={styleHost} shouldForwardProp={isPropValid}>
          <ShadowThemeProvider>
            <PrimerPortalRootHost shadowRoot={shadow} />
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

  const queueUi = await createShadowRootUi(ctx, {
    name: 'rgp-queue-tracker',
    position: 'inline',
    anchor: document.body,
    append: 'last',
    onMount(container) {
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

  const toastUi = await createShadowRootUi(ctx, {
    name: 'rgp-toast-list',
    position: 'inline',
    anchor: document.body,
    append: 'last',
    onMount(container) {
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
    onMount(container) {
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

  const sprintPanelUi = await createShadowRootUi(ctx, {
    name: 'rgp-sprint-panel',
    position: 'inline',
    anchor: document.body,
    append: 'last',
    onMount(container) {
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

  const portalStyleHost = document.createElement('div')
  document.head.appendChild(portalStyleHost)
  const portalHostDiv = document.createElement('div')
  portalHostDiv.id = 'rgp-portal-host'
  document.body.appendChild(portalHostDiv)
  const portalRoot = ReactDOM.createRoot(portalHostDiv)
  portalRoot.render(
    <StyleSheetManager target={portalStyleHost} shouldForwardProp={isPropValid}>
      <ThemeProvider colorMode="auto">
        <CheckboxPortalHost />
      </ThemeProvider>
    </StyleSheetManager>,
  )

  const handleBeforeUnload = (event: BeforeUnloadEvent) => {
    if (queueStore.hasActive()) {
      event.preventDefault()
      event.returnValue = ''
    }
  }

  window.addEventListener('beforeunload', handleBeforeUnload)

  ctx.onInvalidated(() => {
    window.removeEventListener('beforeunload', handleBeforeUnload)
    portalRoot.unmount()
    portalHostDiv.remove()
    portalStyleHost.remove()
  })
}
