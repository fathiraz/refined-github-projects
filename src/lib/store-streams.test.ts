import { describe, expect, it, vi } from 'vitest'
import { Chunk, Effect, Stream } from 'effect'

vi.mock('@/lib/debug-logger', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), info: vi.fn() },
}))

import { selectionChanges, selectionStore } from '@/lib/selection-store'
import { toastChanges, toastStore } from '@/lib/toast-store'

// ---------------------------------------------------------------------------
// SubscriptionRef-backed change streams
// ---------------------------------------------------------------------------

describe('store change streams', () => {
  it('selectionChanges emits current value + each subsequent update', async () => {
    selectionStore.clear()

    const collected: ReadonlySet<string>[] = []

    const program = Stream.runForEach(selectionChanges.pipe(Stream.take(3)), (value) =>
      Effect.sync(() => {
        collected.push(value)
      }),
    )

    const fiber = Effect.runFork(program)

    // First emission should be the current (cleared) state. Give the runtime
    // a tick to deliver it.
    await new Promise((r) => setTimeout(r, 0))

    selectionStore.toggle('a', true)
    selectionStore.toggle('b', true)

    await Effect.runPromise(Effect.fromFiber(fiber))

    expect(collected).toHaveLength(3)
    expect([...collected[0]]).toEqualValue([])
    expect([...collected[1]]).toEqualValue(['a'])
    expect([...collected[2]]).toEqualValue(['a', 'b'])
  })

  it('toastChanges streams snapshots through Stream.take(n)', async () => {
    // Drain any leftover toasts from earlier tests
    while (selectionStore.count() > 0) selectionStore.clear()
    // Cannot directly clear toasts (no public clear), but we can collect
    // *new* emissions after a known starting point. Take(2) = current + 1
    // change.
    const collected: number[] = []

    const program = Stream.runCollect(toastChanges.pipe(Stream.take(2)))
    const fiber = Effect.runFork(
      program.pipe(
        Effect.tap((chunk) =>
          Effect.sync(() => {
            for (const value of Chunk.toArray(chunk)) {
              collected.push(value.length)
            }
          }),
        ),
      ),
    )

    await new Promise((r) => setTimeout(r, 0))
    toastStore.show({ message: 'hi', type: 'info' })

    await Effect.runPromise(Effect.fromFiber(fiber))

    expect(collected).toHaveLength(2)
    // Second emission must have at least one more toast than the first.
    expect(collected[1]).toBeGreaterThan(collected[0])
  })
})
