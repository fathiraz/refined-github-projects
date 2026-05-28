import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ContentScriptContext } from 'wxt/utils/content-script-context'
import { Box } from '@primer/react'
import { RowHoverCard } from '@/features/hierarchy-chip-tooltip'
import { setHovercardAppendTarget } from '@/lib/hovercard-portal-target'
import { subscribeHovercardTriggers, type HovercardTrigger } from '@/lib/hovercard-trigger-registry'
import { createFeatureUi, type FeatureUi } from '@/lib/shadow-ui-factory'
import type { ProjectContext } from '@/lib/github-project'
import { Z_TOOLTIP } from '@/lib/z-index'

function HovercardPortalHost({ projectContext }: { projectContext: ProjectContext }) {
  const ref = useRef<HTMLDivElement>(null)
  const [triggers, setTriggers] = useState<HovercardTrigger[]>([])

  useLayoutEffect(() => {
    setHovercardAppendTarget(ref.current)
    return () => {
      setHovercardAppendTarget(null)
    }
  }, [])

  useEffect(() => subscribeHovercardTriggers(setTriggers), [])

  return (
    <>
      <Box
        ref={ref}
        data-rgp-hovercard-portal=""
        sx={{
          position: 'fixed',
          inset: 0,
          pointerEvents: 'none',
          zIndex: Z_TOOLTIP,
        }}
      />
      {triggers.map((trigger) => (
        <RowHoverCard
          key={trigger.itemId}
          itemId={trigger.itemId}
          projectContext={projectContext}
          titleCell={trigger.titleCell}
        />
      ))}
    </>
  )
}

export async function createHovercardHost(
  ctx: ContentScriptContext,
  projectContext: ProjectContext,
): Promise<FeatureUi> {
  return createFeatureUi(ctx, {
    name: 'hovercard-host',
    component: <HovercardPortalHost projectContext={projectContext} />,
  })
}
