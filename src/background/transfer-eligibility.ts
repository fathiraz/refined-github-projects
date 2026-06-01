import type { ResolvedItemWithTitle } from '@/background/types'

export type TransferEligibilityReason = 'pull-request' | 'same-repo' | 'unresolved'

export interface TransferEligibilityRow {
  domId: string
  eligible: boolean
  reason?: TransferEligibilityReason
  title?: string
}

export function unresolvedTransferEligibilityRows(itemIds: readonly string[]): TransferEligibilityRow[] {
  return itemIds.map((domId) => ({
    domId,
    eligible: false,
    reason: 'unresolved' as const,
  }))
}

export function classifyTransferEligibilityRows(
  itemIds: readonly string[],
  resolved: readonly ResolvedItemWithTitle[],
  targetRepoOwner: string,
  targetRepoName: string,
): TransferEligibilityRow[] {
  const resolvedByDomId = new Map(resolved.map((r) => [String(r.domId), r] as const))
  const targetOwnerLc = targetRepoOwner.toLowerCase()
  const targetNameLc = targetRepoName.toLowerCase()
  return itemIds.map((domId) => {
    const item = resolvedByDomId.get(domId)
    if (!item) return { domId, eligible: false, reason: 'unresolved' as const }
    if (item.typename === 'PullRequest') {
      return {
        domId,
        eligible: false,
        reason: 'pull-request' as const,
        title: item.title,
      }
    }
    if (
      item.repoOwner.toLowerCase() === targetOwnerLc &&
      item.repoName.toLowerCase() === targetNameLc
    ) {
      return {
        domId,
        eligible: false,
        reason: 'same-repo' as const,
        title: item.title,
      }
    }
    return { domId, eligible: true, title: item.title }
  })
}
