import { describe, expect, it } from 'vitest'

import {
  DEFAULT_RULE_STATE,
  evaluateRule,
  hasAnyChange,
  type RuleState,
} from '@/features/bulk-rename-utils'

function rule(over: Partial<RuleState> = {}): RuleState {
  return { ...DEFAULT_RULE_STATE, ...over }
}

describe('bulk-rename-utils — evaluateRule', () => {
  it('replace tab — literal find/replace', () => {
    const r = rule({ tab: 'replace', findText: 'foo', replaceText: 'bar' })
    expect(evaluateRule('foo baz foo', r, 0).newTitle).toBe('bar baz bar')
  })

  it('replace tab — case insensitive by default', () => {
    const r = rule({ tab: 'replace', findText: 'foo', replaceText: 'bar' })
    expect(evaluateRule('FOO Foo foo', r, 0).newTitle).toBe('bar bar bar')
  })

  it('replace tab — case sensitive flag', () => {
    const r = rule({ tab: 'replace', findText: 'foo', replaceText: 'bar', caseSensitive: true })
    expect(evaluateRule('FOO foo', r, 0).newTitle).toBe('FOO bar')
  })

  it('replace tab — regex mode supports groups', () => {
    const r = rule({
      tab: 'replace',
      useRegex: true,
      findText: '^(\\d+)\\s*-\\s*(.+)$',
      replaceText: '$2 ($1)',
    })
    expect(evaluateRule('42 - hello', r, 0).newTitle).toBe('hello (42)')
  })

  it('replace tab — invalid regex surfaces error', () => {
    const r = rule({ tab: 'replace', useRegex: true, findText: '(' })
    const ev = evaluateRule('anything', r, 0)
    expect(ev.error).toBeDefined()
    expect(ev.newTitle).toBe('anything')
  })

  it('prefix tab — prepends literal', () => {
    expect(evaluateRule('Title', rule({ tab: 'prefix', prefix: '[bug] ' }), 0).newTitle).toBe(
      '[bug] Title',
    )
  })

  it('suffix tab — appends literal', () => {
    expect(evaluateRule('Title', rule({ tab: 'suffix', suffix: ' (wip)' }), 0).newTitle).toBe(
      'Title (wip)',
    )
  })

  it('template tab — substitutes {n}, {title}, {number}, {date}', () => {
    const r = rule({ tab: 'template', template: '{n}. {title}' })
    expect(evaluateRule('Hello', r, 4).newTitle).toBe('5. Hello')
  })

  it('template tab — {number} extracts #NNN if present', () => {
    const r = rule({ tab: 'template', template: 'PR-{number}: {title}' })
    expect(evaluateRule('Fix #1234 bug', r, 0).newTitle).toBe('PR-1234: Fix #1234 bug')
  })

  it('number tab — paren style appends (n)', () => {
    const r = rule({ tab: 'number', numberStyle: 'paren', numberStart: 10 })
    expect(evaluateRule('Item', r, 0).newTitle).toBe('Item(10)')
    expect(evaluateRule('Item', r, 2).newTitle).toBe('Item(12)')
  })

  it('number tab — bracket style', () => {
    const r = rule({ tab: 'number', numberStyle: 'bracket', numberStart: 1 })
    expect(evaluateRule('X', r, 5).newTitle).toBe('X[6]')
  })

  it('hasAnyChange detects at least one diff', () => {
    const items = [
      { domId: 'd1', issueNodeId: 'n1', title: 'foo', typename: 'Issue' as const },
      { domId: 'd2', issueNodeId: 'n2', title: 'bar', typename: 'Issue' as const },
    ]
    expect(hasAnyChange(items, rule())).toBe(false)
    expect(hasAnyChange(items, rule({ tab: 'replace', findText: 'foo', replaceText: 'baz' }))).toBe(
      true,
    )
  })
})
