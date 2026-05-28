export interface HovercardTrigger {
  id: string
  itemId: string
  titleCell: HTMLElement
}

type HovercardTriggerListener = (triggers: HovercardTrigger[]) => void

const triggers = new Map<string, HovercardTrigger>()
const elementIds = new WeakMap<HTMLElement, string>()
const listeners = new Set<HovercardTriggerListener>()

let nextTriggerId = 0

function emitTriggers(): void {
  const snapshot = Array.from(triggers.values())
  for (const listener of listeners) {
    listener(snapshot)
  }
}

function getElementId(titleCell: HTMLElement): string {
  const existing = elementIds.get(titleCell)
  if (existing) return existing

  const created = `hovercard-trigger-${nextTriggerId++}`
  elementIds.set(titleCell, created)
  return created
}

export function registerHovercardTrigger(itemId: string, titleCell: HTMLElement): () => void {
  const triggerId = getElementId(titleCell)
  const previous = triggers.get(triggerId)

  if (!previous || previous.itemId !== itemId || previous.titleCell !== titleCell) {
    triggers.set(triggerId, { id: triggerId, itemId, titleCell })
    emitTriggers()
  }

  return () => {
    if (triggers.delete(triggerId)) {
      emitTriggers()
    }
  }
}

export function subscribeHovercardTriggers(listener: HovercardTriggerListener): () => void {
  listeners.add(listener)
  listener(Array.from(triggers.values()))

  return () => {
    listeners.delete(listener)
  }
}
