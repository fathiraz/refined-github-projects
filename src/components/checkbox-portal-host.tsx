import React, { useEffect, useState } from 'react'
import { Checkbox } from '@primer/react'
import { createPortal } from 'react-dom'
import { checkboxPortalStore, type PortalEntry } from '../lib/checkbox-portal-store'
import { getAllInjectedItemIds } from '../lib/project-table-dom'
import { selectionStore } from '../lib/selection-store'
import { ensureTippyCss } from '../lib/tippy-utils'
import Tippy from './ui/tooltip'

type SelectionVariant = 'row' | 'group' | 'header'

interface SelectionControlProps {
  checked: boolean
  indeterminate?: boolean
  label: string
  onToggle: () => void
  variant?: SelectionVariant
}

function useSelectionVersion() {
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    return selectionStore.subscribe(() => forceUpdate((value) => value + 1))
  }, [])
}

function SelectionControl({ checked, indeterminate = false, label, onToggle, variant = 'row' }: SelectionControlProps) {
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

function RowCheckbox({ itemId }: { itemId: string }) {
  useSelectionVersion()
  const checked = selectionStore.isSelected(itemId)

  return (
    <SelectionControl
      checked={checked}
      label={`Select item ${itemId}`}
      onToggle={() => selectionStore.toggle(itemId, !checked)}
    />
  )
}

function GroupCheckbox({ getItemIds }: { getItemIds: () => string[] }) {
  useSelectionVersion()
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

function SelectAllCheckbox() {
  useSelectionVersion()
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
