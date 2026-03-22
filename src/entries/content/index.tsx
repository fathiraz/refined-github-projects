import { injectCheckboxStyles } from './checkboxes'
import { extractProjectContext, fetchProjectFields, setupObservers } from './observer'
import { setupMounts } from './mount'
import { initSprintInjector } from './sprint-injector'
import { injectStatusBarSprintButton } from './status-bar-injector'
import { injectDragHandles, initDragAndDrop, cleanupDragHandles } from './drag-handles'
import { selectionStore } from '../../lib/selection-store'
import { logger, initDebugLogger } from '../../lib/debug-logger'

export default defineContentScript({
  matches: [
    'https://github.com/orgs/*/projects/*',
    'https://github.com/*/projects/*',
  ],
  cssInjectionMode: 'ui',

  async main(ctx) {
    await initDebugLogger()

    injectCheckboxStyles()

    const projectContext = extractProjectContext()
    if (!projectContext) {
      console.warn('[rgp:cs] could not extract project context from URL')
      return
    }

    logger.log('[rgp:cs] content script init', { url: window.location.href, ...projectContext })

    await setupMounts(ctx, projectContext, () => fetchProjectFields(projectContext))

    // Clear bulk selection when user opens an issue/PR detail panel
    document.addEventListener('click', (e) => {
      const target = e.target as Element
      const anchor = target.closest('a[href*="/issues/"], a[href*="/pull/"]')
      if (anchor && anchor.closest('[role="row"]')) selectionStore.clear()
    }, true)

    initDragAndDrop(projectContext.projectId, projectContext.owner, projectContext.number, projectContext.isOrg)
    ctx.onInvalidated(cleanupDragHandles)

    const injectSprintHeaders = initSprintInjector(projectContext, () => fetchProjectFields(projectContext))
    setupObservers([injectSprintHeaders, injectStatusBarSprintButton, injectDragHandles])
  },
})
