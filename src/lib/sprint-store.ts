// Local on purpose: every other store here carries domain methods around its
// state, so there is nothing else plain enough to share this with.
function createValueStore<T>(initial: T) {
  let current = initial
  const listeners = new Set<(value: T) => void>()

  return {
    get: () => current,
    set: (value: T) => {
      current = value
      listeners.forEach((fn) => fn(value))
    },
    subscribe: (fn: (value: T) => void) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
  }
}

const panelStore = createValueStore(false)

export const sprintPanelStore = {
  ...panelStore,
  toggle: () => panelStore.set(!panelStore.get()),
}

export const sprintConfirmEndStore = createValueStore(false)
