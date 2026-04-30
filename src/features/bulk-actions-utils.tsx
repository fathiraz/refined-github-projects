// shared helpers for bulk-actions-bar — relationship state shapes, shortcut
// formatter, and modal loading fallback.

import React from 'react'
import { Box, Spinner } from '@primer/react'
import type { BulkEditRelationshipsUpdate } from '@/lib/messages'
import type { RelationshipSelectionState } from '@/features/bulk-edit-modal'
import { isMac } from '@/lib/keyboard'
import { Z_MODAL } from '@/lib/z-index'

export function createEmptyRelationshipUpdates(): BulkEditRelationshipsUpdate {
  return {
    parent: {
      set: undefined,
      clear: false,
    },
    blockedBy: {
      add: [],
      remove: [],
      clear: false,
    },
    blocking: {
      add: [],
      remove: [],
      clear: false,
    },
  }
}

export function createEmptyRelationshipSelection(): RelationshipSelectionState {
  return {
    parent: false,
    blockedBy: false,
    blocking: false,
  }
}

export function hasRelationshipOperations(relationships: BulkEditRelationshipsUpdate): boolean {
  return Boolean(
    relationships.parent.clear ||
      relationships.parent.set ||
      relationships.blockedBy.clear ||
      relationships.blockedBy.add.length > 0 ||
      relationships.blockedBy.remove.length > 0 ||
      relationships.blocking.clear ||
      relationships.blocking.add.length > 0 ||
      relationships.blocking.remove.length > 0,
  )
}

/** display string for a ctrl/cmd+shift+key shortcut */
export function shortcut(key: string) {
  return isMac ? `⌘⇧${key}` : `⌃⇧${key}`
}

export function ModalLoadingFallback() {
  return (
    <Box
      sx={{
        position: 'fixed',
        inset: 0,
        bg: 'rgba(27,31,36,0.5)',
        zIndex: Z_MODAL,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Spinner size="large" />
    </Box>
  )
}
