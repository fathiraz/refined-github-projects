import React, { useEffect, useState } from 'react'
import { selectionStore } from '../lib/selection-store'
import { SelectionControl } from './selection-control'

interface Props {
  itemId: string
}

export function RowCheckbox({ itemId }: Props) {
  const [checked, setChecked] = useState(() => selectionStore.isSelected(itemId))

  useEffect(() => {
    return selectionStore.subscribe(() => {
      setChecked(selectionStore.isSelected(itemId))
    })
  }, [itemId])

  return (
    <SelectionControl
      checked={checked}
      label={`Select item ${itemId}`}
      onToggle={() => selectionStore.toggle(itemId, !checked)}
    />
  )
}
