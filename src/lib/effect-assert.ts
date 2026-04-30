import { Equal, Data } from 'effect'
import { expect } from 'vitest'

/**
 * Recursively wrap plain JS values into Effect `Data.*` containers so that
 * `Equal.equals` performs a deep value-based comparison instead of falling
 * back to reference equality.
 */
function wrap(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value
  if (Equal.isEqual(value)) return value
  if (Array.isArray(value)) return Data.array(value.map(wrap))
  if (value instanceof Map) {
    const entries: Array<[string, unknown]> = []
    for (const [k, v] of value as Map<unknown, unknown>) {
      entries.push([String(k), wrap(v)])
    }
    entries.sort(([a], [b]) => a.localeCompare(b))
    const obj: Record<string, unknown> = {}
    for (const [k, v] of entries) obj[k] = v
    return Data.struct(obj)
  }
  if (value instanceof Set) {
    const arr = [...value].map(wrap)
    return Data.array(arr)
  }
  if (value instanceof Error) {
    return Data.struct({ name: value.name, message: value.message })
  }
  const out: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = wrap(val)
  }
  return Data.struct(out)
}

/** Pure helper usable outside of `expect(...)`. */
export function equalValue(a: unknown, b: unknown): boolean {
  return Equal.equals(wrap(a), wrap(b))
}

expect.extend({
  toEqualValue(received: unknown, expected: unknown) {
    const pass = equalValue(received, expected)
    return {
      pass,
      message: () =>
        pass
          ? `expected values NOT to be Equal.equals but they were`
          : `expected values to be Equal.equals\n  received: ${JSON.stringify(received)}\n  expected: ${JSON.stringify(expected)}`,
      actual: received,
      expected,
    }
  },
})

declare module 'vitest' {
  interface Assertion<T> {
    toEqualValue(expected: T): void
  }
  interface AsymmetricMatchersContaining {
    toEqualValue(expected: unknown): unknown
  }
}
