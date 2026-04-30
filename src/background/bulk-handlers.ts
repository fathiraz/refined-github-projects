// bulk-action handler registry. The actual handlers live in per-feature files.

import { registerBulkUpdateHandler } from '@/background/bulk-update'
import { registerBulkStateHandlers } from '@/background/bulk-state'
import { registerBulkRenameHandlers } from '@/background/bulk-rename'
import { registerBulkPositionHandlers } from '@/background/bulk-position'

export function registerBulkHandlers(): void {
  registerBulkUpdateHandler()
  registerBulkStateHandlers()
  registerBulkRenameHandlers()
  registerBulkPositionHandlers()
}
