import React, { act, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { BaseStyles, ThemeProvider, registerPortalRoot } from '@primer/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/debug-logger', () => ({
  logger: {
    log: () => {},
    warn: () => {},
    error: () => {},
    info: () => {},
  },
  initDebugLogger: async () => {},
}))

import { BULK_BAR_PRIMER_PORTAL_NAME } from '@/lib/primer-shadow-dom-compat'
import { BulkFlyout, type BulkFlyoutPane, type BulkFlyoutTab } from '@/ui/bulk-flyout'

// react-dom requires this flag to allow act() in non-DOM-testing-library setups.
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

beforeAll(() => {
  const existing = document.getElementById(BULK_BAR_PRIMER_PORTAL_NAME)
  const portalRoot = existing ?? document.createElement('div')
  if (!existing) {
    portalRoot.id = BULK_BAR_PRIMER_PORTAL_NAME
    document.body.appendChild(portalRoot)
  }
  registerPortalRoot(portalRoot, BULK_BAR_PRIMER_PORTAL_NAME)
})

interface HarnessProps {
  open: boolean
  onClose: () => void
  mode: 'simple' | 'tabbed' | 'drilldown'
  footer?: 'apply-cancel' | null
  applyDisabled?: boolean
  onApply?: () => void
  bodySx?: Record<string, unknown>
  tabs?: BulkFlyoutTab[]
  panes?: BulkFlyoutPane[]
  rootPaneId?: string
  controlledPaneId?: string
  onPaneChange?: (id: string) => void
  controlledTabId?: string
  onTabChange?: (id: string) => void
}

function Harness(props: HarnessProps) {
  const anchorRef = useRef<HTMLButtonElement | null>(null)
  const [activeTabId, setActiveTabId] = useState(props.tabs?.[0]?.id ?? 'a')
  const [currentPaneId, setCurrentPaneId] = useState(
    props.controlledPaneId ?? props.rootPaneId ?? 'root',
  )

  return (
    <ThemeProvider colorMode="day">
      <BaseStyles>
        <button ref={anchorRef} type="button">
          Anchor
        </button>
        {props.mode === 'simple' && (
          <BulkFlyout
            mode="simple"
            anchorRef={anchorRef as React.RefObject<HTMLElement>}
            open={props.open}
            onClose={props.onClose}
            title="Test flyout"
            footer={props.footer}
            applyDisabled={props.applyDisabled}
            onApply={props.onApply}
            bodySx={props.bodySx}
          >
            <div data-testid="rgp-test-body">simple body</div>
          </BulkFlyout>
        )}
        {props.mode === 'tabbed' && props.tabs && (
          <BulkFlyout
            mode="tabbed"
            anchorRef={anchorRef as React.RefObject<HTMLElement>}
            open={props.open}
            onClose={props.onClose}
            title="Tabbed"
            tabs={props.tabs}
            activeTabId={props.controlledTabId ?? activeTabId}
            onTabChange={(id) => {
              setActiveTabId(id)
              props.onTabChange?.(id)
            }}
            footer={props.footer}
            onApply={props.onApply}
            applyDisabled={props.applyDisabled}
          />
        )}
        {props.mode === 'drilldown' && props.panes && (
          <BulkFlyout
            mode="drilldown"
            anchorRef={anchorRef as React.RefObject<HTMLElement>}
            open={props.open}
            onClose={props.onClose}
            title="Drilldown"
            panes={props.panes}
            currentPaneId={props.controlledPaneId ?? currentPaneId}
            onPaneChange={(id) => {
              setCurrentPaneId(id)
              props.onPaneChange?.(id)
            }}
            rootPaneId={props.rootPaneId ?? 'root'}
          />
        )}
      </BaseStyles>
    </ThemeProvider>
  )
}

let mounted: Array<{ container: HTMLDivElement; root: Root }> = []

interface RenderResult {
  container: HTMLDivElement
  /** Query selector across the whole document — covers Primer portal content. */
  find: (selector: string) => Element | null
  findAll: (selector: string) => Element[]
}

function render(node: React.ReactElement): RenderResult {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(node)
  })
  mounted.push({ container, root })
  const portalRoot = document.getElementById(BULK_BAR_PRIMER_PORTAL_NAME)
  return {
    container,
    find: (selector: string) => {
      return container.querySelector(selector) ?? portalRoot?.querySelector(selector) ?? null
    },
    findAll: (selector: string) => {
      return [
        ...Array.from(container.querySelectorAll(selector)),
        ...Array.from(portalRoot?.querySelectorAll(selector) ?? []),
      ]
    },
  }
}

beforeEach(() => {
  mounted = []
})

afterEach(() => {
  for (const { container, root } of mounted) {
    act(() => root.unmount())
    container.remove()
  }
  // remove keyframes style injected by BulkFlyout
  document.getElementById('rgp-flyout-keyframes')?.remove()
})

describe('<BulkFlyout> simple mode', () => {
  it('renders nothing when open=false', () => {
    const { find } = render(<Harness mode="simple" open={false} onClose={() => {}} />)
    expect(find('[data-testid="rgp-bulk-flyout"]')).toBeNull()
  })

  it('renders body when open=true', () => {
    const { find } = render(<Harness mode="simple" open={true} onClose={() => {}} />)
    expect(find('[data-testid="rgp-test-body"]')).not.toBeNull()
  })

  it('mounts the flyout inside an element with role="dialog"', () => {
    const { find } = render(<Harness mode="simple" open={true} onClose={() => {}} />)
    expect(find('[role="dialog"]')).not.toBeNull()
  })

  it('applies bodySx to the body container, not the shell', () => {
    const { find } = render(
      <Harness mode="simple" open={true} onClose={() => {}} bodySx={{ display: 'grid' }} />,
    )
    const shell = find('[data-testid="rgp-bulk-flyout"]') as HTMLElement
    const body = find('[data-testid="rgp-bulk-flyout-body"]') as HTMLElement
    expect(shell).not.toBeNull()
    expect(body).not.toBeNull()
    expect(getComputedStyle(body).display).toBe('grid')
    expect(getComputedStyle(shell).display).toBe('flex')
  })

  it('injects keyframes wrapped in prefers-reduced-motion: no-preference', () => {
    render(<Harness mode="simple" open={true} onClose={() => {}} />)
    const style = document.getElementById('rgp-flyout-keyframes')
    expect(style).not.toBeNull()
    expect(style!.textContent).toContain('prefers-reduced-motion: no-preference')
    expect(style!.textContent).toContain('@keyframes rgp-flyout-in')
  })
})

describe('<BulkFlyout> apply/cancel footer', () => {
  it('renders Cancel and Apply buttons when footer="apply-cancel"', () => {
    const { find } = render(
      <Harness mode="simple" open={true} onClose={() => {}} footer="apply-cancel" />,
    )
    const footer = find('[data-testid="rgp-bulk-flyout-footer"]')
    expect(footer).not.toBeNull()
    const apply = footer!.querySelector(
      '[data-testid="rgp-bulk-flyout-apply"]',
    ) as HTMLButtonElement
    expect(apply).not.toBeNull()
    expect(footer!.textContent).toContain('Cancel')
    expect(footer!.textContent).toContain('Apply')
  })

  it('disables Apply when applyDisabled', () => {
    const { find } = render(
      <Harness mode="simple" open={true} onClose={() => {}} footer="apply-cancel" applyDisabled />,
    )
    const apply = find('[data-testid="rgp-bulk-flyout-apply"]') as HTMLButtonElement
    expect(apply.disabled).toBe(true)
  })

  it('clicking Apply fires onApply once when enabled', () => {
    const onApply = vi.fn()
    const { find } = render(
      <Harness
        mode="simple"
        open={true}
        onClose={() => {}}
        footer="apply-cancel"
        onApply={onApply}
      />,
    )
    const apply = find('[data-testid="rgp-bulk-flyout-apply"]') as HTMLButtonElement
    act(() => apply.click())
    expect(onApply).toHaveBeenCalledTimes(1)
  })

  it('clicking Apply does NOT fire onApply when disabled', () => {
    const onApply = vi.fn()
    const { find } = render(
      <Harness
        mode="simple"
        open={true}
        onClose={() => {}}
        footer="apply-cancel"
        applyDisabled
        onApply={onApply}
      />,
    )
    const apply = find('[data-testid="rgp-bulk-flyout-apply"]') as HTMLButtonElement
    act(() => apply.click())
    expect(onApply).not.toHaveBeenCalled()
  })

  it('clicking Cancel invokes onClose', () => {
    const onClose = vi.fn()
    const { findAll } = render(
      <Harness mode="simple" open={true} onClose={onClose} footer="apply-cancel" />,
    )
    const buttons = findAll(
      '[data-testid="rgp-bulk-flyout-footer"] button',
    ) as unknown as HTMLButtonElement[]
    const cancel = buttons.find((b) => b.textContent === 'Cancel')!
    act(() => cancel.click())
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('<BulkFlyout> tabbed mode', () => {
  const tabs: BulkFlyoutTab[] = [
    { id: 'one', label: 'One', content: <div data-testid="tab-one">one body</div> },
    { id: 'two', label: 'Two', content: <div data-testid="tab-two">two body</div> },
  ]

  it('renders only the active tab content', () => {
    const { find } = render(
      <Harness mode="tabbed" open={true} onClose={() => {}} tabs={tabs} controlledTabId="one" />,
    )
    expect(find('[data-testid="tab-one"]')).not.toBeNull()
    expect(find('[data-testid="tab-two"]')).toBeNull()
  })

  it('switches body when controlledTabId changes', () => {
    const { find } = render(
      <Harness mode="tabbed" open={true} onClose={() => {}} tabs={tabs} controlledTabId="two" />,
    )
    expect(find('[data-testid="tab-two"]')).not.toBeNull()
    expect(find('[data-testid="tab-one"]')).toBeNull()
  })
})

describe('<BulkFlyout> drilldown mode', () => {
  const panes: BulkFlyoutPane[] = [
    {
      id: 'root',
      title: 'Root pane',
      content: <div data-testid="pane-root">root body</div>,
    },
    {
      id: 'detail',
      title: 'Detail pane',
      content: <div data-testid="pane-detail">detail body</div>,
    },
  ]

  it('shows the root pane with no back button initially', () => {
    const { find } = render(
      <Harness
        mode="drilldown"
        open={true}
        onClose={() => {}}
        panes={panes}
        rootPaneId="root"
        controlledPaneId="root"
      />,
    )
    expect(find('[data-testid="pane-root"]')).not.toBeNull()
    expect(find('button[aria-label="Back"]')).toBeNull()
  })

  it('shows the back button when on a non-root pane', () => {
    const { find } = render(
      <Harness
        mode="drilldown"
        open={true}
        onClose={() => {}}
        panes={panes}
        rootPaneId="root"
        controlledPaneId="detail"
      />,
    )
    expect(find('[data-testid="pane-detail"]')).not.toBeNull()
    expect(find('button[aria-label="Back"]')).not.toBeNull()
  })

  it('back button click invokes onPaneChange with the root pane id', () => {
    const onPaneChange = vi.fn()
    const { find } = render(
      <Harness
        mode="drilldown"
        open={true}
        onClose={() => {}}
        panes={panes}
        rootPaneId="root"
        controlledPaneId="detail"
        onPaneChange={onPaneChange}
      />,
    )
    const back = find('button[aria-label="Back"]') as HTMLButtonElement
    act(() => back.click())
    expect(onPaneChange).toHaveBeenCalledWith('root')
  })
})
