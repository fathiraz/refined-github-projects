import { describe, expect, it } from 'vitest'

import type { ResolvedItemWithTitle } from '@/background/types'
import {
  classifyTransferEligibilityRows,
  unresolvedTransferEligibilityRows,
} from '@/background/transfer-eligibility'
import {
  decodeIssueNodeId,
  decodeProjectItemDomId,
  decodeProjectItemId,
  decodeRepoName,
  decodeRepoOwner,
} from '@/lib/schemas-decode'

function resolvedItem(
  domId: string,
  opts: {
    typename: 'Issue' | 'PullRequest'
    repoOwner: string
    repoName: string
    title?: string
  },
): ResolvedItemWithTitle {
  return {
    domId: decodeProjectItemDomId(domId),
    issueNodeId: decodeIssueNodeId('I_issue'),
    projectItemId: decodeProjectItemId('PVT_item'),
    repoOwner: decodeRepoOwner(opts.repoOwner),
    repoName: decodeRepoName(opts.repoName),
    title: opts.title ?? 'Example',
    typename: opts.typename,
  }
}

describe('unresolvedTransferEligibilityRows', () => {
  it('returns one unresolved row per item id in order', () => {
    const rows = unresolvedTransferEligibilityRows(['issue:1', 'issue:2'])
    expect(rows).toEqual([
      { domId: 'issue:1', eligible: false, reason: 'unresolved' },
      { domId: 'issue:2', eligible: false, reason: 'unresolved' },
    ])
  })
})

describe('classifyTransferEligibilityRows', () => {
  const targetOwner = 'acme'
  const targetName = 'dest'

  it('marks missing resolved items as unresolved', () => {
    const rows = classifyTransferEligibilityRows(
      ['issue:1', 'issue:2'],
      [resolvedItem('issue:1', { typename: 'Issue', repoOwner: 'acme', repoName: 'src' })],
      targetOwner,
      targetName,
    )
    expect(rows[0]).toMatchObject({ domId: 'issue:1', eligible: true })
    expect(rows[1]).toEqual({ domId: 'issue:2', eligible: false, reason: 'unresolved' })
  })

  it('marks pull requests ineligible', () => {
    const rows = classifyTransferEligibilityRows(
      ['issue:9'],
      [resolvedItem('issue:9', { typename: 'PullRequest', repoOwner: 'acme', repoName: 'src' })],
      targetOwner,
      targetName,
    )
    expect(rows[0]).toMatchObject({
      domId: 'issue:9',
      eligible: false,
      reason: 'pull-request',
      title: 'Example',
    })
  })

  it('marks same-repo items ineligible', () => {
    const rows = classifyTransferEligibilityRows(
      ['issue:3'],
      [resolvedItem('issue:3', { typename: 'Issue', repoOwner: 'Acme', repoName: 'Dest' })],
      targetOwner,
      targetName,
    )
    expect(rows[0]).toMatchObject({
      domId: 'issue:3',
      eligible: false,
      reason: 'same-repo',
    })
  })

  it('marks cross-repo issues eligible', () => {
    const rows = classifyTransferEligibilityRows(
      ['issue:4'],
      [resolvedItem('issue:4', { typename: 'Issue', repoOwner: 'acme', repoName: 'source' })],
      targetOwner,
      targetName,
    )
    expect(rows[0]).toEqual({
      domId: 'issue:4',
      eligible: true,
      title: 'Example',
    })
  })
})
