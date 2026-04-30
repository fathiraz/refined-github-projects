// ─── Concurrency guards ───────────────────────────────────────────────────────
//
// the imperative API (`isXFull`, `acquireX`, `releaseX`) is the sole mechanism
// enforcing in-process concurrency limits today. Each handler short-circuits
// (rather than awaiting) when its counter is full.
//
// TODO(effect-ts-first phase 7): replace these counters with `Effect.Semaphore`
// + `Effect.withPermits` so handlers can await a permit instead of being
// silently rejected. Until that wiring lands, do not export an unused
// semaphore from this module — it would only cause drift between the comment
// and the actual call sites.

const MAX_CONCURRENT_DUPLICATES = 3
const MAX_CONCURRENT_BULK = 3
const MAX_CONCURRENT_SPRINT_END = 1

let activeDuplicateCount = 0
let activeBulkCount = 0
let activeSprintEndCount = 0

// duplicate guards
export function isDuplicateFull(): boolean {
  return activeDuplicateCount >= MAX_CONCURRENT_DUPLICATES
}
export function acquireDuplicate(): void {
  activeDuplicateCount++
}
export function releaseDuplicate(): void {
  activeDuplicateCount--
}

// bulk guards
export function isBulkFull(): boolean {
  return activeBulkCount >= MAX_CONCURRENT_BULK
}
export function acquireBulk(): void {
  activeBulkCount++
}
export function releaseBulk(): void {
  activeBulkCount--
}

// sprint end guards
export function isSprintEndFull(): boolean {
  return activeSprintEndCount >= MAX_CONCURRENT_SPRINT_END
}
export function acquireSprintEnd(): void {
  activeSprintEndCount++
}
export function releaseSprintEnd(): void {
  activeSprintEndCount--
}
