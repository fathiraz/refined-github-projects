import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { portalStore, type PortalEntry } from '../lib/portalStore'
import { RowCheckbox } from './RowCheckbox'
import { GroupCheckbox } from './GroupCheckbox'
import { SelectAllCheckbox } from './SelectAllCheckbox'

export function CheckboxPortalHost() {
  const [entries, setEntries] = useState<readonly PortalEntry[]>([])

  useEffect(() => portalStore.subscribe(setEntries), [])

  return (
    <>
      {entries.map(entry => {
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
