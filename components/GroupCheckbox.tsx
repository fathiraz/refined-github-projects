import React, { useEffect, useState } from 'react'
import { selectionStore } from '../lib/selectionStore'
import { SelectionControl } from './SelectionControl'

interface Props {
  getItemIds: () => string[]
}

export function GroupCheckbox({ getItemIds }: Props) {
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    return selectionStore.subscribe(() => forceUpdate((value) => value + 1))
  }, [])

  const ids = getItemIds()
  const selectedCount = ids.filter((id) => selectionStore.isSelected(id)).length
  const allSelected = ids.length > 0 && selectedCount === ids.length
  const someSelected = selectedCount > 0 && !allSelected

  return (
    <SelectionControl
      checked={allSelected}
      indeterminate={someSelected}
      label="Select all items in group"
      variant="group"
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
