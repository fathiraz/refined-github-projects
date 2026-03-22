import React, { useRef, useState } from 'react'
import { marked } from 'marked'

interface Props {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
}

interface ToolbarAction {
  label: string
  prefix: string
  suffix: string
  icon: string
}

const TOOLBAR_ACTIONS: ToolbarAction[] = [
  { label: 'Bold',   prefix: '**', suffix: '**',     icon: 'B' },
  { label: 'Italic', prefix: '_',  suffix: '_',      icon: 'I' },
  { label: 'Quote',  prefix: '> ', suffix: '',       icon: '❝' },
  { label: 'Code',   prefix: '`',  suffix: '`',      icon: '<>' },
  { label: 'Link',   prefix: '[',  suffix: '](url)', icon: '🔗' },
]

export function MarkdownTextarea({ value, onChange, placeholder, rows = 6 }: Props) {
  const [tab, setTab] = useState<'write' | 'preview'>('write')
  const [previewHtml, setPreviewHtml] = useState('')
  const taRef = useRef<HTMLTextAreaElement>(null)

  function handleTabChange(t: 'write' | 'preview') {
    if (t === 'preview') {
      setPreviewHtml(marked.parse(value, { gfm: true }) as string)
    }
    setTab(t)
  }

  function applyAction(prefix: string, suffix: string) {
    const ta = taRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const selected = value.slice(start, end)
    const before = value.slice(0, start)
    const after = value.slice(end)
    const newValue = before + prefix + selected + suffix + after
    onChange(newValue)
    // restore focus + cursor after React re-render
    requestAnimationFrame(() => {
      ta.focus()
      const cursor = start + prefix.length + selected.length + suffix.length
      ta.setSelectionRange(cursor, cursor)
    })
  }

  const tabBtn = (t: 'write' | 'preview') => ({
    background: tab === t ? 'var(--bgColor-default, #fff)' : 'transparent',
    border: tab === t ? '1px solid var(--borderColor-default)' : '1px solid transparent',
    borderRadius: 6,
    padding: '2px 12px',
    cursor: 'pointer',
    fontSize: 13,
    color: 'var(--fgColor-default)',
    fontFamily: 'inherit',
  } as React.CSSProperties)

  const toolBtn = {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: '2px 6px',
    borderRadius: 4,
    fontSize: 13,
    color: 'var(--fgColor-muted)',
    fontFamily: 'inherit',
    fontWeight: 600,
    lineHeight: 1,
  } as React.CSSProperties

  return (
    <div style={{ border: '1px solid var(--borderColor-default)', borderRadius: 6, overflow: 'hidden', width: '100%' }}>
      {/* Tab bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px',
        borderBottom: '1px solid var(--borderColor-muted)',
        background: 'var(--bgColor-muted, var(--color-canvas-subtle))',
      }}>
        <button style={tabBtn('write')} onClick={() => handleTabChange('write')}>Write</button>
        <button style={tabBtn('preview')} onClick={() => handleTabChange('preview')}>Preview</button>
        <div style={{ flex: 1 }} />
        {tab === 'write' && TOOLBAR_ACTIONS.map(a => (
          <button key={a.label} title={a.label} style={toolBtn} onClick={() => applyAction(a.prefix, a.suffix)}>
            {a.icon}
          </button>
        ))}
      </div>

      {/* Write */}
      {tab === 'write' && (
        <textarea
          ref={taRef}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          style={{
            width: '100%', boxSizing: 'border-box', display: 'block',
            padding: '8px 12px', resize: 'vertical', fontFamily: 'inherit', fontSize: 14,
            background: 'var(--bgColor-default, #fff)', color: 'var(--fgColor-default)',
            border: 'none', outline: 'none',
          }}
        />
      )}

      {/* Preview */}
      {tab === 'preview' && (
        <div
          style={{
            padding: '8px 12px',
            minHeight: rows * 24,
            fontSize: 14,
            color: 'var(--fgColor-default)',
            lineHeight: 1.6,
          }}
          // marked parses user-authored markdown; output is sandboxed inside Shadow DOM
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: previewHtml || '<em style="color:var(--fgColor-muted)">Nothing to preview</em>',
          }}
        />
      )}
    </div>
  )
}
