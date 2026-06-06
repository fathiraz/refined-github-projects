// pure helpers for the sprint settings advanced disclosure (no React, unit-tested).

import type { SprintSettings } from '@/lib/storage'

/** Whether saved settings already configure any advanced (optional) option. */
export function hasAdvancedSettings(settings: SprintSettings | null): boolean {
  if (!settings) return false
  return Boolean(
    settings.notStartedOptionId ||
    (settings.excludeConditions?.length ?? 0) > 0 ||
    settings.pointsFieldId,
  )
}

/**
 * Short muted summary of configured advanced options for the collapsed disclosure.
 * Returns null when nothing advanced is set.
 */
export function formatAdvancedSettingsHint(args: {
  notStartedOptionName?: string
  excludeCount: number
  pointsFieldName?: string
}): string | null {
  const parts: string[] = []
  if (args.notStartedOptionName) parts.push(`Not started: ${args.notStartedOptionName}`)
  if (args.excludeCount > 0) {
    parts.push(`${args.excludeCount} exclusion${args.excludeCount === 1 ? '' : 's'}`)
  }
  if (args.pointsFieldName) parts.push(args.pointsFieldName)
  return parts.length > 0 ? parts.join(' · ') : null
}
