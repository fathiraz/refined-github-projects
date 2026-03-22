import React, { useEffect, useState } from 'react'
import { getAllInjectedItemIds } from '../lib/dom-utils'
import { selectionStore } from '../lib/selection-store'
import { SelectionControl } from './selection-control'

export function SelectAllCheckbox() {
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    return selectionStore.subscribe(() => forceUpdate((value) => value + 1))
  }, [])

  const ids = getAllInjectedItemIds()
  const selectedCount = ids.filter((id) => selectionStore.isSelected(id)).length
  const allSelected = ids.length > 0 && selectedCount === ids.length
  const someSelected = selectedCount > 0 && !allSelected

  return (
    <SelectionControl
      checked={allSelected}
      indeterminate={someSelected}
      label="Select all items"
      variant="header"
      onToggle={() => {
        if (allSelected) {
          selectionStore.deselectBatch(ids)
        } else {
          selectionStore.selectBatch(ids)
        }
      }}
    />
  )
}
