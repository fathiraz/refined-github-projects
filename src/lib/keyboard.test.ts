import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// mock project-table-dom before importing keyboard
let mockIsEditable = false
vi.mock('@/lib/project-table-dom', () => ({
  isEditableTarget: () => mockIsEditable,
}))

import { shortcutRegistry, formatShortcut, type ShortcutDefinition } from '@/lib/keyboard'

function makeDef(overrides: Partial<ShortcutDefinition> = {}): ShortcutDefinition {
  return {
    id: overrides.id ?? 'test-shortcut',
    key: overrides.key ?? 'a',
    modifiers: overrides.modifiers ?? {},
    context: overrides.context ?? 'Global',
    label: overrides.label ?? 'Test',
    action: overrides.action ?? vi.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  // clear registry between tests
  for (const def of shortcutRegistry.getAll()) {
    shortcutRegistry.unregister(def.id)
  }
  mockIsEditable = false
})

// ---------------------------------------------------------------------------
// register / unregister / getAll
// ---------------------------------------------------------------------------

describe('shortcutRegistry', () => {
  it('registers and retrieves a shortcut', () => {
    const def = makeDef()
    shortcutRegistry.register(def)

    const all = shortcutRegistry.getAll()
    expect(all).toHaveLength(1)
    expect(all[0].id).toBe('test-shortcut')
  })

  it('unregisters a shortcut by id', () => {
    shortcutRegistry.register(makeDef({ id: 'x' }))
    shortcutRegistry.register(makeDef({ id: 'y' }))
    expect(shortcutRegistry.getAll()).toHaveLength(2)

    shortcutRegistry.unregister('x')
    expect(shortcutRegistry.getAll()).toHaveLength(1)
    expect(shortcutRegistry.getAll()[0].id).toBe('y')
  })

  it('getGrouped groups by context', () => {
    shortcutRegistry.register(makeDef({ id: 'a', context: 'Global' }))
    shortcutRegistry.register(makeDef({ id: 'b', context: 'Table Selection' }))
    shortcutRegistry.register(makeDef({ id: 'c', context: 'Global' }))

    const grouped = shortcutRegistry.getGrouped()
    expect(grouped.get('Global')).toHaveLength(2)
    expect(grouped.get('Table Selection')).toHaveLength(1)
  })

  // ---------------------------------------------------------------------------
  // subscribe
  // ---------------------------------------------------------------------------

  it('subscribe fires on register and unregister', () => {
    const listener = vi.fn()
    const unsub = shortcutRegistry.subscribe(listener)

    shortcutRegistry.register(makeDef({ id: 'sub-test' }))
    expect(listener).toHaveBeenCalledTimes(1)

    shortcutRegistry.unregister('sub-test')
    expect(listener).toHaveBeenCalledTimes(2)

    unsub()
    shortcutRegistry.register(makeDef({ id: 'after-unsub' }))
    // should not fire after unsubscribe
    expect(listener).toHaveBeenCalledTimes(2)
  })

  // ---------------------------------------------------------------------------
  // conflict detection
  // ---------------------------------------------------------------------------

  it('warns on conflicting shortcuts', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    shortcutRegistry.register(makeDef({ id: 'first', key: 'k', modifiers: { meta: true } }))
    shortcutRegistry.register(makeDef({ id: 'second', key: 'k', modifiers: { meta: true } }))

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('conflict'))

    warnSpy.mockRestore()
  })

  it('does not warn when same id re-registers', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    shortcutRegistry.register(makeDef({ id: 'same', key: 'k' }))
    shortcutRegistry.register(makeDef({ id: 'same', key: 'k' }))

    expect(warnSpy).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  // ---------------------------------------------------------------------------
  // keydown handling
  // ---------------------------------------------------------------------------

  it('dispatches action on matching keydown', () => {
    const action = vi.fn()
    shortcutRegistry.register(makeDef({ id: 'enter', key: 'a', modifiers: {}, action }))

    const event = new KeyboardEvent('keydown', { key: 'a', bubbles: true })
    document.dispatchEvent(event)

    expect(action).toHaveBeenCalledTimes(1)
  })

  it('does not dispatch when key does not match', () => {
    const action = vi.fn()
    shortcutRegistry.register(makeDef({ id: 'nomatch', key: 'b', modifiers: {}, action }))

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', bubbles: true }))
    expect(action).not.toHaveBeenCalled()
  })

  it('skips action when target is editable', () => {
    mockIsEditable = true
    const action = vi.fn()
    shortcutRegistry.register(makeDef({ id: 'edit-skip', key: 'a', modifiers: {}, action }))

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))
    expect(action).not.toHaveBeenCalled()
  })

  it('allows action in editable when allowInEditable is true', () => {
    mockIsEditable = true
    const action = vi.fn()
    shortcutRegistry.register(
      makeDef({ id: 'allow-edit', key: 'a', modifiers: {}, action, allowInEditable: true }),
    )

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))
    expect(action).toHaveBeenCalledTimes(1)
  })

  it('normalizes single-char keys to lowercase', () => {
    const action = vi.fn()
    shortcutRegistry.register(makeDef({ id: 'lower', key: 'a', modifiers: {}, action }))

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'A', bubbles: true }))
    expect(action).toHaveBeenCalledTimes(1)
  })

  it('removes keydown listener when all shortcuts unregistered', () => {
    const action = vi.fn()
    shortcutRegistry.register(makeDef({ id: 'only', key: 'q', action }))
    shortcutRegistry.unregister('only')

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'q', bubbles: true }))
    expect(action).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// formatShortcut
// ---------------------------------------------------------------------------

describe('formatShortcut', () => {
  it('formats a simple key with no modifiers', () => {
    const result = formatShortcut(makeDef({ key: '?' }))
    expect(result).toBe('?')
  })

  it('formats Escape as Esc', () => {
    const result = formatShortcut(makeDef({ key: 'Escape' }))
    expect(result).toBe('Esc')
  })

  it('formats Enter as return symbol', () => {
    const result = formatShortcut(makeDef({ key: 'Enter' }))
    expect(result).toBe('\u21B5')
  })

  it('formats unknown keys as uppercase', () => {
    const result = formatShortcut(makeDef({ key: 'x' }))
    expect(result).toBe('X')
  })

  it('includes shift modifier', () => {
    const result = formatShortcut(makeDef({ key: 'a', modifiers: { shift: true } }))
    expect(result).toContain('\u21E7') // ⇧
  })

  it('includes meta modifier', () => {
    const result = formatShortcut(makeDef({ key: 'a', modifiers: { meta: true } }))
    // should contain either ⌘ (Mac) or ⌃ (non-Mac)
    expect(result).toMatch(/[\u2318\u2303]/)
  })
})
