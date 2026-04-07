// ─── Concurrency guards ───────────────────────────────────────────────────────

let activeDuplicateCount = 0
const MAX_CONCURRENT_DUPLICATES = 3

let activeBulkCount = 0
const MAX_CONCURRENT_BULK = 3

let activeSprintEndCount = 0
const MAX_CONCURRENT_SPRINT_END = 1

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
