// types + rule application for bulk-rename modal.

export type RenameTab = 'FIND_REPLACE' | 'PREFIX_SUFFIX'

export interface TitleItem {
  domId: string
  issueNodeId: string
  title: string
  typename: 'Issue' | 'PullRequest'
}

export interface RuleState {
  tab: RenameTab
  findText: string
  replaceText: string
  caseSensitive: boolean
  prefix: string
  suffix: string
}

export function applyRule(original: string, rule: RuleState): string {
  if (rule.tab === 'FIND_REPLACE') {
    if (!rule.findText) return original
    const flags = rule.caseSensitive ? 'g' : 'gi'
    const escaped = rule.findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return original.replace(new RegExp(escaped, flags), rule.replaceText)
  }
  return `${rule.prefix}${original}${rule.suffix}`
}
