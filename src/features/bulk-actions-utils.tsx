// shared helpers for bulk-actions-bar — relationship state shapes, shortcut
// formatter, and modal loading fallback.

import React from 'react'
import { Box, Spinner } from '@primer/react'
import type { BulkEditRelationshipsUpdate, IssueSearchResultData } from '@/lib/messages'
import type { RelationshipKey, RelationshipSelectionState } from '@/features/bulk-edit-utils'
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

export type ParentOperation = 'set' | 'clear'
export type ListOperation = 'add' | 'remove' | 'clear'

function mapSearchResult(item: IssueSearchResultData) {
  return {
    databaseId: item.databaseId,
    number: item.number,
    title: item.title,
    repoOwner: item.repoOwner,
    repoName: item.repoName,
    state: item.state,
  }
}

export function buildRelationshipsPayload(
  key: RelationshipKey,
  parentOp: ParentOperation,
  parentTarget: IssueSearchResultData | null,
  listOp: ListOperation,
  listTargets: IssueSearchResultData[],
): BulkEditRelationshipsUpdate {
  const base = createEmptyRelationshipUpdates()

  if (key === 'parent') {
    if (parentOp === 'clear') {
      base.parent.clear = true
    } else if (parentTarget) {
      base.parent.set = mapSearchResult(parentTarget)
    }
    return base
  }

  const list = key === 'blockedBy' ? base.blockedBy : base.blocking
  if (listOp === 'clear') {
    list.clear = true
  } else if (listOp === 'add') {
    list.add = listTargets.map(mapSearchResult)
  } else if (listOp === 'remove') {
    list.remove = listTargets.map(mapSearchResult)
  }
  return base
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
