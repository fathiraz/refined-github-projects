import React, { useSyncExternalStore } from 'react'
import { Checkbox } from '@primer/react'
import { getSelectionSnapshot, selectionStore } from '@/lib/selection-store'
import { ensureTippyCss } from '@/lib/tippy-utils'
import Tippy from '@/ui/tooltip'

export type SelectionVariant = 'row' | 'group' | 'header'

export interface SelectionControlProps {
  checked: boolean
  indeterminate?: boolean
  label: string
  onToggle: () => void
  variant?: SelectionVariant
}

export function useSelectionSnapshot(): ReadonlySet<string> {
  return useSyncExternalStore(selectionStore.subscribe, getSelectionSnapshot, getSelectionSnapshot)
}

export function useBulkSelectionState(ids: string[]) {
  const selected = useSelectionSnapshot()

  const selectedCount = ids.reduce((n, id) => (selected.has(id) ? n + 1 : n), 0)
  const checked = ids.length > 0 && selectedCount === ids.length
  const indeterminate = selectedCount > 0 && !checked

  const toggle = () => {
    if (checked) {
      selectionStore.deselectBatch(ids)
    } else {
      selectionStore.selectBatch(ids)
    }
  }

  return { checked, indeterminate, toggle }
}

export function SelectionControl({
  checked,
  indeterminate = false,
  label,
  onToggle,
  variant = 'row',
}: SelectionControlProps) {
  ensureTippyCss()

  return (
    <Tippy content={label} placement="top" delay={[400, 0]}>
      <span
        className="rgp-selection-control"
        data-variant={variant}
        onMouseDown={(event) => {
          event.stopPropagation()
          event.preventDefault()
        }}
      >
        <Checkbox
          checked={checked}
          indeterminate={indeterminate}
          aria-label={label}
          onChange={(event) => {
            event.stopPropagation()
            onToggle()
          }}
          onClick={(event) => event.stopPropagation()}
          sx={{ cursor: 'pointer', display: 'block' }}
        />
      </span>
    </Tippy>
  )
}
