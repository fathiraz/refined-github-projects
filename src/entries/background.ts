import { initDebugLogger } from '@/lib/debug-logger'
// Importing the runtime ensures the ManagedRuntime is created exactly once at
// SW startup, before any onMessage handler runs.
import '@/lib/effect-runtime'
import { registerConfigHandlers } from '@/background/config-handlers'
import { registerFieldHandlers } from '@/background/field-handlers'
import { registerHierarchyHandlers } from '@/background/hierarchy-handlers'
import { registerSprintHandlers } from '@/background/sprint-handlers'
import { registerDuplicateHandlers } from '@/background/duplicate-handlers'
import { registerBulkHandlers } from '@/background/bulk-handlers'

export default defineBackground(() => {
  initDebugLogger()

  browser.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
      browser.tabs.create({ url: browser.runtime.getURL('/options.html') })
    }
  })

  registerConfigHandlers()
  registerFieldHandlers()
  registerHierarchyHandlers()
  registerSprintHandlers()
  registerDuplicateHandlers()
  registerBulkHandlers()
})
