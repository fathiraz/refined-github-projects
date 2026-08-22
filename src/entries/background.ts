import { initDebugLogger } from '@/lib/debug-logger'
import { registerConfigHandlers } from '@/background/config-handlers'
import { registerFieldHandlers } from '@/background/field-handlers'
import { registerHierarchyHandlers } from '@/background/hierarchy-handlers'
import { registerSprintHandlers } from '@/background/sprint-handlers'
import { registerDuplicateHandlers } from '@/background/duplicate-handlers'
import { registerBulkUpdateHandler } from '@/background/bulk-update'
import { registerBulkStateHandlers } from '@/background/bulk-state'
import { registerBulkRenameHandlers } from '@/background/bulk-rename'
import { registerBulkPositionHandlers } from '@/background/bulk-position'
import { registerCreateIssueHandler } from '@/background/create-issue'

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
  registerBulkUpdateHandler()
  registerBulkStateHandlers()
  registerBulkRenameHandlers()
  registerBulkPositionHandlers()
  registerCreateIssueHandler()
})
