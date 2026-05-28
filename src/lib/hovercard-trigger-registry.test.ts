import { beforeEach, describe, expect, it, vi } from 'vitest'

async function loadRegistry() {
  return import('@/lib/hovercard-trigger-registry')
}

describe('hovercard-trigger-registry', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('ignores stale cleanup when element is re-registered', async () => {
    const { registerHovercardTrigger, subscribeHovercardTriggers } = await loadRegistry()
    const titleCell = document.createElement('div')
    const snapshots: string[][] = []
    const unsubscribe = subscribeHovercardTriggers((triggers) => {
      snapshots.push(triggers.map((trigger) => trigger.itemId))
    })

    const cleanupOld = registerHovercardTrigger('item-old', titleCell)
    const cleanupNew = registerHovercardTrigger('item-new', titleCell)

    cleanupOld()
    expect(snapshots.at(-1)).toEqual(['item-new'])

    cleanupNew()
    expect(snapshots.at(-1)).toEqual([])

    unsubscribe()
  })

  it('emits updated trigger snapshot when item id changes on same element', async () => {
    const { registerHovercardTrigger, subscribeHovercardTriggers } = await loadRegistry()
    const titleCell = document.createElement('div')
    const snapshots: string[][] = []
    const unsubscribe = subscribeHovercardTriggers((triggers) => {
      snapshots.push(triggers.map((trigger) => trigger.itemId))
    })

    const cleanup = registerHovercardTrigger('item-a', titleCell)
    expect(snapshots.at(-1)).toEqual(['item-a'])

    const cleanupUpdated = registerHovercardTrigger('item-b', titleCell)
    expect(snapshots.at(-1)).toEqual(['item-b'])

    cleanupUpdated()
    expect(snapshots.at(-1)).toEqual([])

    cleanup()
    expect(snapshots.at(-1)).toEqual([])

    unsubscribe()
  })
})
