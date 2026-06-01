import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/debug-logger', () => ({
  logger: { log: () => {}, warn: () => {}, error: () => {}, info: () => {} },
  initDebugLogger: async () => {},
}))

import { buildRows } from '@/features/bulk-mark-flyout'
import type { ItemStateSnapshot } from '@/lib/project-table-dom'

function snap(over: Partial<ItemStateSnapshot> = {}): ItemStateSnapshot {
  return {
    openCount: 0,
    closedCount: 0,
    pinnedCount: 0,
    unpinnedCount: 0,
    lockedCount: 0,
    unlockedCount: 0,
    unknownCount: 0,
    total: 0,
    ...over,
  }
}

describe('BulkMarkFlyout.buildRows — Status section', () => {
  it('hides Reopen when all selected items are open', () => {
    const rows = buildRows(snap({ openCount: 5, total: 5 }))
    expect(rows.status.map((r) => r.verb)).toEqual(['close'])
    expect(rows.status[0].label).toBe('Close 5 open issues')
  })

  it('hides Close when all selected items are closed', () => {
    const rows = buildRows(snap({ closedCount: 3, total: 3 }))
    expect(rows.status.map((r) => r.verb)).toEqual(['reopen'])
    expect(rows.status[0].label).toBe('Reopen 3 closed issues')
  })

  it('shows both Close and Reopen with counts on mixed state', () => {
    const rows = buildRows(snap({ openCount: 3, closedCount: 2, total: 5 }))
    expect(rows.status.map((r) => r.verb)).toEqual(['close', 'reopen'])
    expect(rows.status[0].label).toBe('Close 3 open issues')
    expect(rows.status[1].label).toBe('Reopen 2 closed issues')
  })

  it('shows both paired verbs WITHOUT counts when state is unknown (D6)', () => {
    const rows = buildRows(snap({ unknownCount: 4, total: 4 }))
    expect(rows.status.map((r) => r.verb)).toEqual(['close', 'reopen'])
    expect(rows.status[0].label).toBe('Close issues')
    expect(rows.status[1].label).toBe('Reopen issues')
  })

  it('uses singular noun when count === 1', () => {
    const rows = buildRows(snap({ openCount: 1, total: 1 }))
    expect(rows.status[0].label).toBe('Close 1 open issue')
  })
})

describe('BulkMarkFlyout.buildRows — Visibility section', () => {
  it('always renders Pin and Unpin together (no DOM state)', () => {
    const rows = buildRows(snap({ openCount: 5, total: 5 }))
    expect(rows.visibility.map((r) => r.verb)).toEqual(['pin', 'unpin'])
  })
})

describe('BulkMarkFlyout.buildRows — Conversation section', () => {
  it('renders Lock by default', () => {
    const rows = buildRows(snap({ openCount: 3, total: 3 }))
    expect(rows.conversation.map((r) => r.verb)).toEqual(['lock'])
  })

  it('flips to Unlock when every selected item is locked (no unknowns)', () => {
    const rows = buildRows(snap({ lockedCount: 4, total: 4 }))
    expect(rows.conversation.map((r) => r.verb)).toEqual(['unlock'])
    expect(rows.conversation[0].label).toBe('Unlock conversations')
  })

  it('does NOT flip to Unlock if any item is in unknown state (D6 fallback)', () => {
    const rows = buildRows(snap({ lockedCount: 3, unknownCount: 1, total: 4 }))
    expect(rows.conversation.map((r) => r.verb)).toEqual(['lock'])
  })
})

describe('BulkMarkFlyout.buildRows — chord letters', () => {
  it('attaches C / P / L chord letters to each row', () => {
    const rows = buildRows(snap({ openCount: 2, closedCount: 1, total: 3 }))
    const allRows = [...rows.status, ...rows.visibility, ...rows.conversation]
    const byVerb = new Map(allRows.map((r) => [r.verb, r.chord]))
    expect(byVerb.get('close')).toBe('C')
    expect(byVerb.get('reopen')).toBe('C')
    expect(byVerb.get('pin')).toBe('P')
    expect(byVerb.get('unpin')).toBe('P')
    expect(byVerb.get('lock')).toBe('L')
  })

  it('attaches L chord to Unlock when flipped', () => {
    const rows = buildRows(snap({ lockedCount: 2, total: 2 }))
    expect(rows.conversation[0].chord).toBe('L')
  })
})
