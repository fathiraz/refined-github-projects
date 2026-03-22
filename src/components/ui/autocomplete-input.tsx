import React, { useEffect, useRef, useState } from 'react'
import { sendMessage } from '../../lib/messages'
import { ShieldIcon, XIcon } from './primitives'

export function AutocompleteInput({
  type,
  owner,
  repoName,
  value = [],
  onChange,
  placeholder,
  singleSelect = false,
  disabled = false,
}: {
  type: 'ASSIGNEES' | 'LABELS' | 'MILESTONES' | 'ISSUE_TYPES',
  owner: string,
  repoName: string,
  value: any[],
  onChange: (val: any[]) => void,
  placeholder?: string,
  singleSelect?: boolean,
  disabled?: boolean,
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // FIX: Use composedPath() for Shadow DOM compatibility — regular contains() fails
  // because the dropdown lives inside a shadow root and event.target is the host element
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const path = event.composedPath ? event.composedPath() : []
      if (wrapperRef.current && !path.includes(wrapperRef.current)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!isOpen || disabled) return
    const delay = query === '' ? 0 : 300
    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        const items = await sendMessage('searchRepoMetadata', { owner, name: repoName, q: query, type })
        setResults(items)
      } catch (e) {
        console.error('[rgp:ui] searchRepoMetadata failed', e)
        setResults([])
      }
      setLoading(false)
    }, delay)
    return () => clearTimeout(timer)
  }, [query, type, isOpen, owner, repoName, disabled])

  function handleAdd(item: any) {
    if (singleSelect) {
      onChange([item])
    } else if (!value.find(v => v.id === item.id)) {
      onChange([...value, item])
    }
    setQuery('')
    setIsOpen(false)
  }

  function handleRemove(item: any) {
    onChange(value.filter(v => v.id !== item.id))
  }

  return (
    <div ref={wrapperRef} style={{ position: 'relative', width: '100%' }}>
      <div
        style={{
          display: 'flex', flexWrap: 'wrap', gap: 5,
          padding: value.length > 0 ? '5px 10px' : '8px 12px',
          background: disabled
            ? 'var(--bgColor-disabled, var(--color-canvas-default))'
            : 'var(--bgColor-muted, var(--color-canvas-subtle))',
          border: '1px solid var(--borderColor-default)',
          borderRadius: 6, minHeight: 36, alignItems: 'center',
          cursor: disabled ? 'not-allowed' : 'text',
          opacity: disabled ? 0.6 : 1,
        }}
        onClick={() => !disabled && setIsOpen(true)}
      >
        {value.map(v => (
          <div key={v.id} style={{
            display: 'flex', alignItems: 'center', gap: 4,
            background: 'var(--color-neutral-muted, rgba(110,118,129,0.12))',
            padding: '2px 7px', borderRadius: 6, fontSize: 12,
            color: 'var(--fgColor-default)', flexShrink: 0,
          }}>
            {type === 'LABELS' && (
              <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: v.color || 'var(--borderColor-default)' }} />
            )}
            {type === 'ASSIGNEES' && v.avatarUrl && (
              <img src={v.avatarUrl} alt="" style={{ width: 13, height: 13, borderRadius: '50%' }} />
            )}
            <span>{v.name}</span>
            <button
              onMouseDown={e => { e.preventDefault(); e.stopPropagation() }}
              onClick={e => { e.stopPropagation(); handleRemove(v) }}
              style={{
                background: 'transparent', border: 'none',
                color: 'var(--fgColor-muted)', cursor: 'pointer',
                padding: 0, marginLeft: 1, display: 'flex', alignItems: 'center',
              }}
              aria-label={`Remove ${v.name}`}
            >
              <XIcon size={10} />
            </button>
          </div>
        ))}
        <input
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setIsOpen(true) }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={e => e.stopPropagation()}
          onKeyUp={e => e.stopPropagation()}
          placeholder={value.length === 0 ? placeholder : ''}
          disabled={disabled}
          style={{
            flex: 1, minWidth: 80, background: 'transparent', border: 'none',
            color: 'var(--fgColor-default)', outline: 'none',
            fontFamily: 'inherit', fontSize: 13,
            cursor: disabled ? 'not-allowed' : 'text',
          }}
        />
      </div>

      {isOpen && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
          background: 'var(--bgColor-default, var(--color-canvas-default))',
          border: '1px solid var(--borderColor-default)',
          borderRadius: 6, overflow: 'hidden', zIndex: 100,
          maxHeight: 220, overflowY: 'auto',
        }}>
          {loading ? (
            <div style={{ padding: '10px 14px', color: 'var(--fgColor-muted)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg
                style={{ animation: 'rgp-spin 1s linear infinite', opacity: 0.6 }}
                width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              Loading...
            </div>
          ) : results.length > 0 ? (
            results.map(r => {
              const isSelected = !!value.find(v => v.id === r.id)
              return (
                <button
                  key={r.id}
                  onMouseDown={e => { e.preventDefault(); e.stopPropagation() }}
                  onClick={() => handleAdd(r)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    padding: type === 'ISSUE_TYPES' ? '10px 14px' : '8px 14px',
                    background: isSelected ? 'var(--color-accent-subtle, rgba(9,105,218,0.10))' : 'transparent',
                    border: 'none',
                    borderBottom: '1px solid var(--borderColor-default)',
                    color: 'var(--fgColor-default)', cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  {type === 'LABELS' && (
                    <span style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, background: r.color || 'var(--borderColor-default)' }} />
                  )}
                  {type === 'ASSIGNEES' && r.avatarUrl && (
                    <img src={r.avatarUrl} alt="" style={{ width: 18, height: 18, borderRadius: '50%' }} />
                  )}
                  {type === 'ISSUE_TYPES' && (
                    <ShieldIcon color={r.color || 'var(--fgColor-muted)'} />
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{r.name}</span>
                    {type === 'ISSUE_TYPES' && r.description && (
                      <span style={{ fontSize: 11, color: 'var(--fgColor-muted)', marginTop: 1 }}>{r.description}</span>
                    )}
                  </div>
                  {isSelected && (
                    <svg
                      style={{ marginLeft: 'auto', flexShrink: 0, color: 'var(--color-accent-fg, #0969da)' }}
                      width="14" height="14" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              )
            })
          ) : (
            <div style={{ padding: '10px 14px', color: 'var(--fgColor-muted)', fontSize: 13 }}>
              No results found
            </div>
          )}
        </div>
      )}
    </div>
  )
}
