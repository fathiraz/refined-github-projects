type Listener = (visible: boolean) => void
let _visible = false
const _listeners = new Set<Listener>()

export const sprintPanelStore = {
  get: () => _visible,
  set: (v: boolean) => { _visible = v; _listeners.forEach(fn => fn(v)) },
  toggle: () => sprintPanelStore.set(!_visible),
  subscribe: (fn: Listener) => { _listeners.add(fn); return () => _listeners.delete(fn) },
}
