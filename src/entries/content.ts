import { setupContentUi } from '@/features/content-ui'
import {
  createSprintHeaderInjector,
  injectStatusBarSprintButton,
} from '@/features/sprint-injections'
import {
  injectTableEnhancementStyles,
  initDragAndDrop,
  setupTableEnhancements,
} from '@/features/table-enhancements'
import { createHierarchyChipInjector } from '@/features/hierarchy-injections'
import { setupIssueDetailInjector } from '@/features/issue-detail-injections'
import { setupCreateIssueFieldInjector } from '@/features/create-issue-injections'
import { selectionStore } from '@/lib/selection-store'
import { logger, initDebugLogger } from '@/lib/debug-logger'
import { extractProjectContext, fetchProjectFields } from '@/lib/github-project'

export default defineContentScript({
  matches: ['https://github.com/orgs/*/projects/*', 'https://github.com/*/projects/*'],
  cssInjectionMode: 'ui',

  async main(ctx) {
    await initDebugLogger()

    const projectContext = extractProjectContext()
    if (!projectContext) {
      console.warn('[rgp:cs] could not extract project context from URL')
      return
    }

    injectTableEnhancementStyles()

    logger.log('[rgp:cs] content script init', { url: window.location.href, ...projectContext })

    const getFields = () => fetchProjectFields(projectContext)
    await setupContentUi(ctx, projectContext, getFields)

    const handleProjectItemOpen = (event: Event) => {
      const target = event.target as Element
      const anchor = target.closest('a[href*="/issues/"], a[href*="/pull/"]')
      if (anchor && anchor.closest('[role="row"]')) selectionStore.clear()
    }

    document.addEventListener('click', handleProjectItemOpen, true)

    initDragAndDrop(
      projectContext.projectId,
      projectContext.owner,
      projectContext.number,
      projectContext.isOrg,
    )

    const injectSprintHeaders = createSprintHeaderInjector(ctx, projectContext)
    const injectHierarchyChips = createHierarchyChipInjector(projectContext)
    const cleanupIssueDetail = setupIssueDetailInjector(projectContext)
    const cleanupCreateIssueFields = setupCreateIssueFieldInjector(ctx, getFields)
    const cleanupTableEnhancements = setupTableEnhancements([
      injectSprintHeaders,
      injectStatusBarSprintButton,
      injectHierarchyChips,
    ])

    ctx.onInvalidated(() => {
      cleanupTableEnhancements()
      cleanupIssueDetail()
      cleanupCreateIssueFields()
      document.removeEventListener('click', handleProjectItemOpen, true)
    })
  },
})
