import { initDebugLogger } from '../../lib/debug-logger'
import { registerConfigHandlers } from './handlers/config-handlers'
import { registerFieldHandlers } from './handlers/field-handlers'
import { registerHierarchyHandlers } from './handlers/hierarchy-handlers'
import { registerSprintHandlers } from './handlers/sprint-handlers'
import { registerDuplicateHandlers } from './handlers/duplicate-handlers'
import { registerBulkHandlers } from './handlers/bulk-handlers'

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
