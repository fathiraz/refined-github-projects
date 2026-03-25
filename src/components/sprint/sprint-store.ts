type VisibilityListener = (visible: boolean) => void
let _visible = false
const _visibilityListeners = new Set<VisibilityListener>()

export const sprintPanelStore = {
  get: () => _visible,
  set: (v: boolean) => { _visible = v; _visibilityListeners.forEach(fn => fn(v)) },
  toggle: () => sprintPanelStore.set(!_visible),
  subscribe: (fn: VisibilityListener) => { _visibilityListeners.add(fn); return () => _visibilityListeners.delete(fn) },
}

type ConfirmListener = (v: boolean) => void
let _pending = false
const _confirmListeners = new Set<ConfirmListener>()

export const sprintConfirmEndStore = {
  get: () => _pending,
  set: (v: boolean) => { _pending = v; _confirmListeners.forEach(fn => fn(v)) },
  subscribe: (fn: ConfirmListener) => { _confirmListeners.add(fn); return () => _confirmListeners.delete(fn) },
}
