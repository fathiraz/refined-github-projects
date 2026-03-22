import React from 'react'
import Tippy from '@tippyjs/react'
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
  const state = checked ? 'checked' : indeterminate ? 'indeterminate' : 'unchecked'

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault()
      onToggle()
    }
  }

  return (
    <Tippy content={label} placement="top" delay={[400, 0]}>
      <button
        type="button"
        role="checkbox"
        aria-label={label}
        aria-checked={indeterminate ? 'mixed' : checked}
        data-state={state}
        data-variant={variant}
        className="rgp-selection-control"
        onClick={(event) => {
          event.stopPropagation()
          onToggle()
        }}
        onMouseDown={(event) => {
          event.stopPropagation()
          event.preventDefault()
        }}
        onKeyDown={handleKeyDown}
      >
        <span className="rgp-selection-control__box">
          {checked ? (
            <svg width={12} height={12} viewBox="0 0 16 16" fill="none"
              stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
              strokeLinejoin="round" aria-hidden="true">
              <path d="M3 8.5 6.25 11.5 13 4.5" />
            </svg>
          ) : indeterminate ? <span className="rgp-selection-control__dash" /> : null}
        </span>
      </button>
    </Tippy>
  )
}
