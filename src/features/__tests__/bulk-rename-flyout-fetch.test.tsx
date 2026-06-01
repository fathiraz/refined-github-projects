import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { BaseStyles, ThemeProvider } from '@primer/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const hoisted = vi.hoisted(() => ({
  sendMessage: vi.fn(),
}))

vi.mock('@/lib/messages', () => ({
  sendMessage: hoisted.sendMessage,
}))

vi.mock('@/ui/bulk-flyout', () => ({
  BulkFlyout: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="bulk-flyout-mock">{children}</div> : null,
}))

import { BulkRenameFlyout } from '@/features/bulk-rename-flyout'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type TitleRow = {
  domId: string
  issueNodeId: string
  title: string
  typename: 'Issue' | 'PullRequest'
}

let mounted: Array<{ container: HTMLDivElement; root: Root }> = []

function titleRow(domId: string, title: string): TitleRow {
  return { domId, issueNodeId: `node-${domId}`, title, typename: 'Issue' }
}

function renderFlyout(props: {
  open: boolean
  itemIds: readonly string[]
  onClose?: () => void
}): HTMLDivElement {
  const anchor = document.createElement('div')
  const anchorRef = { current: anchor }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(
      <ThemeProvider colorMode="day">
        <BaseStyles>
          <BulkRenameFlyout
            anchorRef={anchorRef}
            open={props.open}
            onClose={props.onClose ?? (() => {})}
            projectId="proj-1"
            itemIds={props.itemIds}
            count={props.itemIds.length}
            onConfirm={() => {}}
          />
        </BaseStyles>
      </ThemeProvider>,
    )
  })
  mounted.push({ container, root })
  return container
}

function rerenderFlyout(root: Root, props: { open: boolean; itemIds: readonly string[] }): void {
  const anchor = document.createElement('div')
  const anchorRef = { current: anchor }
  act(() => {
    root.render(
      <ThemeProvider colorMode="day">
        <BaseStyles>
          <BulkRenameFlyout
            anchorRef={anchorRef}
            open={props.open}
            onClose={() => {}}
            projectId="proj-1"
            itemIds={props.itemIds}
            count={props.itemIds.length}
            onConfirm={() => {}}
          />
        </BaseStyles>
      </ThemeProvider>,
    )
  })
}

beforeEach(() => {
  mounted = []
  hoisted.sendMessage.mockReset()
})

afterEach(() => {
  for (const { container, root } of mounted) {
    act(() => root.unmount())
    container.remove()
  }
})

describe('BulkRenameFlyout — getItemTitles fetch', () => {
  it('ignores stale response when selection changes while open', async () => {
    let resolveA: (rows: TitleRow[]) => void = () => {}
    let resolveB: (rows: TitleRow[]) => void = () => {}

    hoisted.sendMessage.mockImplementation((_name, data: { itemIds: string[] }) => {
      if (data.itemIds[0] === 'issue:1') {
        return new Promise<TitleRow[]>((resolve) => {
          resolveA = resolve
        })
      }
      return new Promise<TitleRow[]>((resolve) => {
        resolveB = resolve
      })
    })

    const container = renderFlyout({ open: true, itemIds: ['issue:1'] })
    const root = mounted[mounted.length - 1]!.root

    rerenderFlyout(root, { open: true, itemIds: ['issue:2'] })

    await act(async () => {
      resolveB([titleRow('issue:2', 'Title B')])
    })

    expect(container.querySelector('[data-testid="rgp-rename-preview"]')).not.toBeNull()
    expect(container.textContent).toContain('Title B')
    expect(container.textContent).not.toContain('Title A')

    await act(async () => {
      resolveA([titleRow('issue:1', 'Title A')])
    })

    expect(container.textContent).toContain('Title B')
    expect(container.textContent).not.toContain('Title A')
  })

  it('ignores in-flight response after flyout closes', async () => {
    let resolveA: (rows: TitleRow[]) => void = () => {}

    hoisted.sendMessage.mockImplementation(() => {
      return new Promise<TitleRow[]>((resolve) => {
        resolveA = resolve
      })
    })

    const container = renderFlyout({ open: true, itemIds: ['issue:1'] })
    const root = mounted[mounted.length - 1]!.root

    rerenderFlyout(root, { open: false, itemIds: ['issue:1'] })

    await act(async () => {
      resolveA([titleRow('issue:1', 'Title A')])
    })

    expect(container.querySelector('[data-testid="rgp-rename-preview"]')).toBeNull()
    expect(container.textContent).not.toContain('Title A')
  })
})
