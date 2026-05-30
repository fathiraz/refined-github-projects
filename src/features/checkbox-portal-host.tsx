import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { checkboxPortalStore, type PortalEntry } from '@/lib/checkbox-portal-store'
import { getAllInjectedItemIds } from '@/lib/project-table-dom'
import { selectionStore } from '@/lib/selection-store'
import {
  SelectionControl,
  useBulkSelectionState,
  useSelectionSnapshot,
} from '@/ui/selection-control'

function RowCheckbox({ itemId }: { itemId: string }) {
  const selected = useSelectionSnapshot()
  const checked = selected.has(itemId)

  return (
    <SelectionControl
      checked={checked}
      label={`Select item ${itemId}`}
      onToggle={() => selectionStore.toggle(itemId, !checked)}
    />
  )
}

function GroupCheckbox({ getItemIds }: { getItemIds: () => string[] }) {
  const { checked, indeterminate, toggle } = useBulkSelectionState(getItemIds())

  return (
    <SelectionControl
      checked={checked}
      indeterminate={indeterminate}
      label="Select all items in group"
      variant="group"
      onToggle={toggle}
    />
  )
}

function SelectAllCheckbox() {
  const { checked, indeterminate, toggle } = useBulkSelectionState(getAllInjectedItemIds())

  return (
    <SelectionControl
      checked={checked}
      indeterminate={indeterminate}
      label="Select all items"
      variant="header"
      onToggle={toggle}
    />
  )
}

export function CheckboxPortalHost() {
  const [entries, setEntries] = useState<readonly PortalEntry[]>([])

  useEffect(() => checkboxPortalStore.subscribe(setEntries), [])

  return (
    <>
      {entries.map((entry) => {
        switch (entry.type) {
          case 'row':
            return createPortal(
              <RowCheckbox itemId={entry.itemId} />,
              entry.container,
              `row-${entry.itemId}`,
            )
          case 'group':
            return createPortal(
              <GroupCheckbox getItemIds={entry.getItemIds} />,
              entry.container,
              `group-${entry.container.dataset.rgpGcbKey}`,
            )
          case 'selectall':
            return createPortal(<SelectAllCheckbox />, entry.container, 'selectall')
        }
      })}
    </>
  )
}
