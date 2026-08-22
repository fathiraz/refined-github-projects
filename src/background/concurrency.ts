// ─── Concurrency guards ───────────────────────────────────────────────────────
//
// the imperative API (`isXFull`, `acquireX`, `releaseX`) is the sole mechanism
// enforcing in-process concurrency limits. Each handler short-circuits (rather
// than awaiting) when its counter is full, so a rejected request reports back
// immediately instead of queueing behind work the user cannot see.

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
