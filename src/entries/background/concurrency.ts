// ─── Concurrency guards ───────────────────────────────────────────────────────
//
// The legacy imperative API (`isXFull`, `acquireX`, `releaseX`) is preserved so
// existing handlers continue to short-circuit when the queue is full. The
// underlying counter is now mirrored into an `Effect.Semaphore` so handlers
// migrated to Effect-first in Phase 7 can use the proper `withPermits`
// combinator to await a permit instead of being silently rejected.

import { Effect } from 'effect'

const MAX_CONCURRENT_DUPLICATES = 3
const MAX_CONCURRENT_BULK = 3
const MAX_CONCURRENT_SPRINT_END = 1

export const duplicateSemaphore = Effect.unsafeMakeSemaphore(MAX_CONCURRENT_DUPLICATES)
export const bulkSemaphore = Effect.unsafeMakeSemaphore(MAX_CONCURRENT_BULK)
export const sprintEndSemaphore = Effect.unsafeMakeSemaphore(MAX_CONCURRENT_SPRINT_END)

let activeDuplicateCount = 0
let activeBulkCount = 0
let activeSprintEndCount = 0

// Duplicate guards
export function isDuplicateFull(): boolean {
  return activeDuplicateCount >= MAX_CONCURRENT_DUPLICATES
}
export function acquireDuplicate(): void {
  activeDuplicateCount++
}
export function releaseDuplicate(): void {
  activeDuplicateCount--
}

// Bulk guards
export function isBulkFull(): boolean {
  return activeBulkCount >= MAX_CONCURRENT_BULK
}
export function acquireBulk(): void {
  activeBulkCount++
}
export function releaseBulk(): void {
  activeBulkCount--
}

// Sprint end guards
export function isSprintEndFull(): boolean {
  return activeSprintEndCount >= MAX_CONCURRENT_SPRINT_END
}
export function acquireSprintEnd(): void {
  activeSprintEndCount++
}
export function releaseSprintEnd(): void {
  activeSprintEndCount--
}
