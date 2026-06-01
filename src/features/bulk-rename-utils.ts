// Pure types + rule application for bulk-rename. The flyout supports five
// rename modes (replace, prefix, suffix, template, number). Each mode has its
// own state shape; `RuleState` carries enough context to produce a new title
// given the original via `applyRule()`.
//
// Tabs:
//  - replace : optional regex; case-sensitive; multi-line preview safe
//  - prefix  : prepend literal text
//  - suffix  : append literal text
//  - template: token-expansion using {n}, {title}, {number}, {date}
//  - number  : append numbering with style (1)/`1`/[1] starting at an integer

export type RenameTab = 'replace' | 'prefix' | 'suffix' | 'template' | 'number'

export type NumberStyle = 'paren' | 'space' | 'bracket'

export interface TitleItem {
  domId: string
  issueNodeId: string
  title: string
  typename: 'Issue' | 'PullRequest'
}

export interface RuleState {
  tab: RenameTab
  /** Replace tab */
  findText: string
  replaceText: string
  useRegex: boolean
  caseSensitive: boolean
  /** Prefix tab */
  prefix: string
  /** Suffix tab */
  suffix: string
  /** Template tab — template string with tokens; e.g. "[{date}] {title}" */
  template: string
  /** Number tab */
  numberStyle: NumberStyle
  numberStart: number
}

export const DEFAULT_RULE_STATE: RuleState = {
  tab: 'replace',
  findText: '',
  replaceText: '',
  useRegex: false,
  caseSensitive: false,
  prefix: '',
  suffix: '',
  template: '',
  numberStyle: 'paren',
  numberStart: 1,
}

export interface RuleError {
  message: string
}

export interface RuleEvaluation {
  newTitle: string
  /** Per-row error (e.g., regex compilation failure) for diagnostics. */
  error?: RuleError
}

export function evaluateRule(original: string, rule: RuleState, index: number): RuleEvaluation {
  switch (rule.tab) {
    case 'replace':
      return evaluateReplace(original, rule)
    case 'prefix':
      return { newTitle: `${rule.prefix}${original}` }
    case 'suffix':
      return { newTitle: `${original}${rule.suffix}` }
    case 'template':
      return { newTitle: expandTemplate(rule.template, original, index) }
    case 'number':
      return { newTitle: appendNumber(original, rule.numberStyle, rule.numberStart + index) }
  }
}

function evaluateReplace(original: string, rule: RuleState): RuleEvaluation {
  if (!rule.findText) return { newTitle: original }
  const flags = rule.caseSensitive ? 'g' : 'gi'
  try {
    const source = rule.useRegex
      ? rule.findText
      : rule.findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(source, flags)
    return { newTitle: original.replace(re, rule.replaceText) }
  } catch (err) {
    return {
      newTitle: original,
      error: { message: err instanceof Error ? err.message : 'Invalid regular expression' },
    }
  }
}

const NUMBER_FORMATTERS: Record<NumberStyle, (n: number) => string> = {
  paren: (n) => `(${n})`,
  space: (n) => ` ${n}`,
  bracket: (n) => `[${n}]`,
}

function appendNumber(original: string, style: NumberStyle, n: number): string {
  return `${original}${NUMBER_FORMATTERS[style](n)}`
}

const TOKEN_REGEX = /\{(n|title|number|date)\}/g

function expandTemplate(template: string, original: string, index: number): string {
  if (!template) return original
  const today = new Date()
  const isoDate = today.toISOString().slice(0, 10)
  const issueNumberMatch = original.match(/#(\d+)/)
  return template.replace(TOKEN_REGEX, (_match, token: string) => {
    switch (token) {
      case 'n':
        return String(index + 1)
      case 'title':
        return original
      case 'number':
        return issueNumberMatch ? issueNumberMatch[1] : ''
      case 'date':
        return isoDate
      default:
        return ''
    }
  })
}

/** Convenience predicate used by the flyout's footer Apply gating. */
export function hasAnyChange(items: readonly TitleItem[], rule: RuleState): boolean {
  for (let i = 0; i < items.length; i++) {
    const evalRes = evaluateRule(items[i].title, rule, i)
    if (evalRes.newTitle !== items[i].title) return true
  }
  return false
}

/** Legacy applyRule export retained for the dying modal; routes through evaluateRule. */
export function applyRule(original: string, rule: Partial<RuleState>): string {
  const merged: RuleState = { ...DEFAULT_RULE_STATE, ...rule, tab: rule.tab ?? 'replace' }
  return evaluateRule(original, merged, 0).newTitle
}
