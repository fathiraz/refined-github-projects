import React, { useEffect, useState } from 'react'
import type { ContentScriptContext } from 'wxt/utils/content-script-context'
import { BulkActionsBar } from '@/features/bulk-actions-bar'
import { OnboardingCoach } from '@/features/onboarding-coach'
import { QueueTracker } from '@/features/queue-tracker'
import { ToastList } from '@/features/toast-list'
import { CheckboxPortalHost } from '@/features/checkbox-portal-host'
import { SprintPanel } from '@/features/sprint-modal'
import { createHovercardHost } from '@/lib/hovercard-factory'
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

  const hovercardHostUi = await createHovercardHost(ctx, projectContext)
  hovercardHostUi.mount()

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

  const checkboxPortalUi = await createFeatureUi(ctx, {
    name: 'checkbox-portal',
    component: <CheckboxPortalHost />,
  })
  checkboxPortalUi.mount()

  const handleBeforeUnload = (event: BeforeUnloadEvent) => {
    if (queueStore.hasActive()) {
      event.preventDefault()
      event.returnValue = ''
    }
  }

  window.addEventListener('beforeunload', handleBeforeUnload)

  ctx.onInvalidated(() => {
    window.removeEventListener('beforeunload', handleBeforeUnload)
    // LIFO teardown: reverse mount order.
    checkboxPortalUi.destroy()
    sprintPanelUi.destroy()
    onboardingUi.destroy()
    toastUi.destroy()
    queueUi.destroy()
    hovercardHostUi.destroy()
    bulkBarUi.destroy()
  })
}
