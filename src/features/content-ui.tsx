import React, { useEffect, useState } from 'react'
import type { ContentScriptContext } from 'wxt/utils/content-script-context'
import ReactDOM from 'react-dom/client'
import { StyleSheetManager } from 'styled-components'
import isPropValid from '@emotion/is-prop-valid'
import { ThemeProvider } from '@primer/react'
import { BulkActionsBar } from '@/features/bulk-actions-bar'
import { OnboardingCoach } from '@/features/onboarding-coach'
import { QueueTracker } from '@/features/queue-tracker'
import { ToastList } from '@/features/toast-list'
import { CheckboxPortalHost } from '@/features/checkbox-portal-host'
import { SprintPanel } from '@/features/sprint-modal'
import { createFeatureUi } from '@/lib/shadow-ui-factory'
import { queueStore } from '@/lib/queue-store'
import { sprintPanelStore } from '@/lib/sprint-store'
import type { ProjectContext, ProjectData } from '@/lib/github-project'

type SprintPanelProps = Omit<React.ComponentProps<typeof SprintPanel>, 'visible' | 'onClose'>

function SprintPanelDriver(props: SprintPanelProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const unsubscribe = sprintPanelStore.subscribe(setVisible)
    return () => {
      unsubscribe()
    }
  }, [])

  return <SprintPanel {...props} visible={visible} onClose={() => sprintPanelStore.set(false)} />
}

export async function setupContentUi(
  ctx: ContentScriptContext,
  projectContext: ProjectContext,
  getFields: () => Promise<ProjectData>,
) {
  const bulkBarUi = await createFeatureUi(ctx, {
    name: 'bulk-bar',
    portalCompat: true,
    component: (
      <BulkActionsBar
        projectId={projectContext.projectId}
        owner={projectContext.owner}
        isOrg={projectContext.isOrg}
        number={projectContext.number}
        getFields={getFields}
      />
    ),
  })
  bulkBarUi.mount()

  const queueUi = await createFeatureUi(ctx, {
    name: 'queue-tracker',
    component: <QueueTracker />,
  })
  queueUi.mount()

  const toastUi = await createFeatureUi(ctx, {
    name: 'toast-list',
    component: <ToastList />,
  })
  toastUi.mount()

  const onboardingUi = await createFeatureUi(ctx, {
    name: 'onboarding',
    component: <OnboardingCoach />,
  })
  onboardingUi.mount()

  const sprintPanelUi = await createFeatureUi(ctx, {
    name: 'sprint-panel',
    component: (
      <SprintPanelDriver
        projectId={projectContext.projectId}
        owner={projectContext.owner}
        isOrg={projectContext.isOrg}
        number={projectContext.number}
        getFields={getFields}
      />
    ),
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
    sprintPanelUi.destroy()
    onboardingUi.destroy()
    toastUi.destroy()
    queueUi.destroy()
    bulkBarUi.destroy()
    portalRoot.unmount()
    portalHostDiv.remove()
    portalStyleHost.remove()
  })
}
