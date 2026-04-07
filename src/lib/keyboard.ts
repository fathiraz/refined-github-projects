import { isEditableTarget } from './project-table-dom'

export interface ShortcutModifiers {
  meta?: boolean
  shift?: boolean
  ctrl?: boolean
  alt?: boolean
}

export interface ShortcutDefinition {
  id: string
  key: string
  modifiers: ShortcutModifiers
  context: 'Global' | 'Table Selection' | 'Modal Navigation'
  label: string
  action: () => void
  allowInEditable?: boolean
}

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

const registry = new Map<string, ShortcutDefinition>()
const changeListeners = new Set<() => void>()
let listenerInstalled = false

function notifyChange() {
  changeListeners.forEach((fn) => fn())
}

function matchesModifiers(e: KeyboardEvent, mods: ShortcutModifiers): boolean {
  const wantsMeta = mods.meta ?? false
  const wantsShift = mods.shift ?? false
  const wantsCtrl = mods.ctrl ?? false
  const wantsAlt = mods.alt ?? false

  const metaPressed = isMac ? e.metaKey : e.ctrlKey
  const ctrlPressed = isMac ? e.ctrlKey : false

  return (
    wantsMeta === metaPressed &&
    wantsShift === e.shiftKey &&
    wantsCtrl === ctrlPressed &&
    wantsAlt === e.altKey
  )
}

function normalizeKey(e: KeyboardEvent): string {
  if (e.key.length === 1) return e.key.toLowerCase()
  return e.key
}

function handleKeydown(e: KeyboardEvent) {
  const key = normalizeKey(e)
  for (const shortcut of registry.values()) {
    if (shortcut.key !== key) continue
    if (!matchesModifiers(e, shortcut.modifiers)) continue
    if (!shortcut.allowInEditable && isEditableTarget(e.target)) continue
    e.preventDefault()
    e.stopPropagation()
    shortcut.action()
    return
  }
}

function ensureListener() {
  if (listenerInstalled) return
  document.addEventListener('keydown', handleKeydown, true) // capture phase
  listenerInstalled = true
}

function maybeRemoveListener() {
  if (registry.size > 0 || !listenerInstalled) return
  document.removeEventListener('keydown', handleKeydown, true)
  listenerInstalled = false
}

export const shortcutRegistry = {
  register(def: ShortcutDefinition): void {
    for (const existing of registry.values()) {
      if (
        existing.key === def.key &&
        existing.modifiers.meta === def.modifiers.meta &&
        existing.modifiers.shift === def.modifiers.shift &&
        existing.modifiers.ctrl === def.modifiers.ctrl &&
        existing.modifiers.alt === def.modifiers.alt &&
        existing.id !== def.id
      ) {
        console.warn(`[rgp:keyboard] conflict: "${def.id}" vs "${existing.id}" on key="${def.key}"`)
      }
    }
    registry.set(def.id, def)
    ensureListener()
    notifyChange()
  },

  unregister(id: string): void {
    registry.delete(id)
    maybeRemoveListener()
    notifyChange()
  },

  getAll(): ShortcutDefinition[] {
    return Array.from(registry.values())
  },

  getGrouped(): Map<string, ShortcutDefinition[]> {
    const grouped = new Map<string, ShortcutDefinition[]>()
    for (const def of registry.values()) {
      const group = grouped.get(def.context) ?? []
      group.push(def)
      grouped.set(def.context, group)
    }
    return grouped
  },

  subscribe(fn: () => void): () => void {
    changeListeners.add(fn)
    return () => changeListeners.delete(fn)
  },
}

export function formatShortcut(def: ShortcutDefinition): string {
  const parts: string[] = []
  if (def.modifiers.meta) parts.push(isMac ? '\u2318' : '\u2303')
  if (def.modifiers.ctrl && isMac) parts.push('\u2303')
  if (def.modifiers.alt) parts.push(isMac ? '\u2325' : 'Alt+')
  if (def.modifiers.shift) parts.push('\u21E7')

  const keyDisplay: Record<string, string> = {
    Escape: 'Esc',
    Backspace: isMac ? '\u232B' : 'Backspace',
    Delete: isMac ? '\u2326' : 'Del',
    Enter: '\u21B5',
    '?': '?',
  }
  parts.push(keyDisplay[def.key] ?? def.key.toUpperCase())
  return parts.join('')
}
