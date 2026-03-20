type Listener = (v: boolean) => void
let _pending = false
const _listeners = new Set<Listener>()

export const sprintConfirmEndStore = {
  get: () => _pending,
  set: (v: boolean) => { _pending = v; _listeners.forEach(fn => fn(v)) },
  subscribe: (fn: Listener) => { _listeners.add(fn); return () => _listeners.delete(fn) },
}
