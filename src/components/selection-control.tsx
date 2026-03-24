import React from 'react'
import { Checkbox } from '@primer/react'
import Tippy from './ui/tooltip'
import { ensureTippyCss } from '../lib/tippy-utils'

interface SelectionControlProps {
  checked: boolean
  indeterminate?: boolean
  label: string
  onToggle: () => void
  variant?: 'row' | 'group' | 'header'
}

export function SelectionControl({ checked, indeterminate = false, label, onToggle, variant = 'row' }: SelectionControlProps) {
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
