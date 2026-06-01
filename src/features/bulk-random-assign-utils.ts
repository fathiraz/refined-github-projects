/**
 * Shuffles an array in place using the Fisher-Yates algorithm.
 * @param array - The array to shuffle.
 * @returns The shuffled array.
 */
function shuffle<T>(array: T[]): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

/**
 * Distributes items to assignees in a balanced way, ensuring each assignee
 * gets a similar number of items.
 * @param items - The IDs of the items to distribute.
 * @param assignees - The IDs of the assignees.
 * @returns A map of assignee ID to item IDs.
 */
export function distributeBalanced(items: string[], assignees: string[]): Map<string, string[]> {
  const distribution = new Map<string, string[]>(assignees.map((a) => [a, []]))
  if (assignees.length === 0 || items.length === 0) return distribution

  const shuffledItems = shuffle(items)
  const counts = new Map<string, number>(assignees.map((a) => [a, 0]))

  for (const item of shuffledItems) {
    let minCount = Infinity
    const candidates: string[] = []

    for (const [assignee, count] of counts.entries()) {
      if (count < minCount) {
        minCount = count
        candidates.length = 0
        candidates.push(assignee)
      } else if (count === minCount) {
        candidates.push(assignee)
      }
    }

    const targetAssignee = candidates[Math.floor(Math.random() * candidates.length)]

    distribution.get(targetAssignee)!.push(item)
    counts.set(targetAssignee, minCount + 1)
  }

  return distribution
}

/**
 * Distributes items to assignees randomly.
 * @param items - The IDs of the items to distribute.
 * @param assignees - The IDs of the assignees.
 * @returns A map of assignee ID to item IDs.
 */
export function distributeRandom(items: string[], assignees: string[]): Map<string, string[]> {
  const distribution = new Map<string, string[]>(assignees.map((a) => [a, []]))
  if (assignees.length === 0 || items.length === 0) return distribution

  const shuffledItems = shuffle(items)

  for (const item of shuffledItems) {
    const randomIndex = Math.floor(Math.random() * assignees.length)
    const assignee = assignees[randomIndex]
    distribution.get(assignee)!.push(item)
  }

  return distribution
}

/**
 * Distributes items to assignees in a round-robin fashion.
 * @param items - The IDs of the items to distribute.
 * @param assignees - The IDs of the assignees.
 * @returns A map of assignee ID to item IDs.
 */
export function distributeRoundRobin(items: string[], assignees: string[]): Map<string, string[]> {
  const distribution = new Map<string, string[]>(assignees.map((a) => [a, []]))
  if (assignees.length === 0 || items.length === 0) return distribution

  items.forEach((item, index) => {
    const assignee = assignees[index % assignees.length]
    distribution.get(assignee)!.push(item)
  })

  return distribution
}

export type DistributionStrategy = 'balanced' | 'random' | 'round-robin'

export type DistributionFunction = (items: string[], assignees: string[]) => Map<string, string[]>

/** Inverts assignee→itemIds to itemId→assigneeIds. */
export function invertDistribution(distribution: Map<string, string[]>): Map<string, string[]> {
  const byItem = new Map<string, string[]>()
  for (const [assigneeId, assignedItemIds] of distribution.entries()) {
    for (const itemId of assignedItemIds) {
      const existing = byItem.get(itemId) ?? []
      byItem.set(itemId, [...existing, assigneeId])
    }
  }
  return byItem
}

/** Rebuilds assignee→itemIds from itemId→assigneeIds (inverse of {@link invertDistribution}). */
export function distributionFromByItem(byItem: Map<string, string[]>): Map<string, string[]> {
  const distribution = new Map<string, string[]>()
  for (const [itemId, assigneeIds] of byItem.entries()) {
    for (const assigneeId of assigneeIds) {
      const bucket = distribution.get(assigneeId) ?? []
      bucket.push(itemId)
      distribution.set(assigneeId, bucket)
    }
  }
  return distribution
}

/**
 * Unions strategy assignment with per-item existing assignees (existing first, deduped).
 */
export function mergePreserveExisting(
  newByItem: Map<string, string[]>,
  existingByItem: Map<string, string[]>,
): Map<string, string[]> {
  const merged = new Map<string, string[]>()
  for (const [itemId, newIds] of newByItem.entries()) {
    const existing = existingByItem.get(itemId) ?? []
    const seen = new Set<string>()
    const ids: string[] = []
    for (const id of existing) {
      if (!seen.has(id)) {
        seen.add(id)
        ids.push(id)
      }
    }
    for (const id of newIds) {
      if (!seen.has(id)) {
        seen.add(id)
        ids.push(id)
      }
    }
    merged.set(itemId, ids)
  }
  return merged
}
