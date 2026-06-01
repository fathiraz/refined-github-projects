import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnchoredOverlay, Box, Button, Heading, SegmentedControl, Text } from '@primer/react'
import { ArrowLeftIcon } from '@primer/octicons-react'

import { BULK_BAR_PRIMER_PORTAL_NAME } from '@/lib/primer-shadow-dom-compat'
import { Z_OVERLAY } from '@/lib/z-index'

/** Visual shell shared by every BulkFlyout — flat, bordered, no shadow per the design system. */
const FLYOUT_SHELL_SX = {
  bg: 'canvas.overlay',
  border: '1px solid',
  borderColor: 'border.default',
  borderRadius: 2,
  boxShadow: 'none',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
} as const

export type BulkFlyoutMode = 'simple' | 'tabbed' | 'drilldown'
export type BulkFlyoutFooter = 'apply-cancel' | null

export interface BulkFlyoutTab {
  id: string
  label: string
  content: React.ReactNode
}

export interface BulkFlyoutPane {
  id: string
  title: string
  content: React.ReactNode
}

interface CommonProps {
  anchorRef: React.RefObject<HTMLElement>
  open: boolean
  onClose: () => void
  title: string
  width?: number
  maxHeight?: number
  footer?: BulkFlyoutFooter
  onApply?: () => void
  applyDisabled?: boolean
  applyLabel?: string
  applyVariant?: 'primary' | 'danger'
  cancelLabel?: string
  /** Optional extra body padding override. Defaults to using primerCss.flyoutShell padding. */
  bodySx?: Record<string, unknown>
  /** Optional aria-label on the popover container. */
  ariaLabel?: string
}

interface SimpleProps extends CommonProps {
  mode: 'simple'
  children: React.ReactNode
}

interface TabbedProps extends CommonProps {
  mode: 'tabbed'
  tabs: BulkFlyoutTab[]
  activeTabId: string
  onTabChange: (tabId: string) => void
  /** Optional shared body rendered after each tab's `content`. */
  children?: React.ReactNode
}

interface DrilldownProps extends CommonProps {
  mode: 'drilldown'
  panes: BulkFlyoutPane[]
  currentPaneId: string
  onPaneChange: (paneId: string) => void
  /** id of the root pane — drilldown shows a back-arrow on every other pane. */
  rootPaneId: string
  /** Optional shared body rendered after each pane's `content`. */
  children?: React.ReactNode
}

export type BulkFlyoutProps = SimpleProps | TabbedProps | DrilldownProps

const FLYOUT_KEYFRAMES_ID = 'rgp-flyout-keyframes'

function ensureFlyoutKeyframes(): void {
  if (typeof document === 'undefined') return
  if (document.getElementById(FLYOUT_KEYFRAMES_ID)) return
  const style = document.createElement('style')
  style.id = FLYOUT_KEYFRAMES_ID
  style.textContent = `
@media (prefers-reduced-motion: no-preference) {
  @keyframes rgp-flyout-in {
    from { transform: translateY(6px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }
}
`
  document.head.appendChild(style)
}

export function BulkFlyout(props: BulkFlyoutProps) {
  const {
    anchorRef,
    open,
    onClose,
    title,
    width = 360,
    maxHeight = 480,
    footer = null,
    onApply,
    applyDisabled = false,
    applyLabel = 'Apply',
    applyVariant = 'primary',
    cancelLabel = 'Cancel',
    bodySx,
    ariaLabel,
  } = props

  useEffect(() => {
    ensureFlyoutKeyframes()
  }, [])

  const handleClose = useCallback(() => {
    onClose()
  }, [onClose])

  const handleAnchoredClose = useCallback(
    (_gesture: 'anchor-click' | 'click-outside' | 'escape' | 'close') => {
      handleClose()
    },
    [handleClose],
  )

  const overlayProps = useMemo(
    () => ({
      portalContainerName: BULK_BAR_PRIMER_PORTAL_NAME,
      role: 'dialog' as const,
      'aria-label': ariaLabel ?? title,
      sx: {
        boxShadow: 'none',
        pointerEvents: 'auto',
        zIndex: Z_OVERLAY,
        animation: 'rgp-flyout-in 160ms cubic-bezier(0.4, 0, 0.2, 1)',
        '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
      },
    }),
    [ariaLabel, title],
  )

  // header content varies by mode
  let header: React.ReactNode = null
  let body: React.ReactNode = null

  if (props.mode === 'simple') {
    header = <SimpleHeader title={title} />
    body = props.children
  } else if (props.mode === 'tabbed') {
    header = (
      <TabbedHeader
        title={title}
        tabs={props.tabs}
        activeTabId={props.activeTabId}
        onTabChange={props.onTabChange}
      />
    )
    const active = props.tabs.find((tab) => tab.id === props.activeTabId)
    body = (
      <>
        {active?.content ?? null}
        {props.children}
      </>
    )
  } else {
    const current = props.panes.find((pane) => pane.id === props.currentPaneId)
    const isRoot = props.currentPaneId === props.rootPaneId
    header = (
      <DrilldownHeader
        title={current?.title ?? title}
        isRoot={isRoot}
        onBack={() => props.onPaneChange(props.rootPaneId)}
      />
    )
    body = (
      <>
        {current?.content ?? null}
        {props.children}
      </>
    )
  }

  return (
    <AnchoredOverlay
      open={open}
      onClose={handleAnchoredClose}
      anchorRef={anchorRef}
      renderAnchor={null}
      align="start"
      side="outside-top"
      width="auto"
      height="auto"
      overlayProps={overlayProps}
    >
      <Box
        sx={{
          ...FLYOUT_SHELL_SX,
          width,
          maxHeight,
          minWidth: width,
        }}
        data-testid="rgp-bulk-flyout"
      >
        <Box sx={{ px: 3, pt: 3, pb: 2 }}>{header}</Box>
        <Box
          sx={{
            flex: 1,
            overflow: 'auto',
            px: 3,
            py: 2,
            minHeight: 0,
            ...(bodySx ?? {}),
          }}
          data-testid="rgp-bulk-flyout-body"
        >
          {body}
        </Box>
        {footer === 'apply-cancel' && (
          <FlyoutFooter
            onCancel={handleClose}
            onApply={onApply}
            applyDisabled={applyDisabled}
            applyLabel={applyLabel}
            applyVariant={applyVariant}
            cancelLabel={cancelLabel}
          />
        )}
      </Box>
    </AnchoredOverlay>
  )
}

function SimpleHeader({ title }: { title: string }) {
  return (
    <Heading as="h2" sx={{ fontSize: 2, fontWeight: 'semibold', m: 0 }}>
      {title}
    </Heading>
  )
}

interface TabbedHeaderProps {
  title: string
  tabs: BulkFlyoutTab[]
  activeTabId: string
  onTabChange: (tabId: string) => void
}

function TabbedHeader({ title, tabs, activeTabId, onTabChange }: TabbedHeaderProps) {
  const activeIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.id === activeTabId),
  )

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Heading as="h2" sx={{ fontSize: 2, fontWeight: 'semibold', m: 0 }}>
        {title}
      </Heading>
      <SegmentedControl
        aria-label={`${title} mode`}
        size="small"
        sx={{ width: '100%' }}
        onChange={(index: number) => {
          const next = tabs[index]
          if (next) onTabChange(next.id)
        }}
      >
        {tabs.map((tab, index) => (
          <SegmentedControl.Button key={tab.id} selected={index === activeIndex}>
            {tab.label}
          </SegmentedControl.Button>
        ))}
      </SegmentedControl>
    </Box>
  )
}

interface DrilldownHeaderProps {
  title: string
  isRoot: boolean
  onBack: () => void
}

function DrilldownHeader({ title, isRoot, onBack }: DrilldownHeaderProps) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      {!isRoot && (
        <Button
          variant="invisible"
          size="small"
          onClick={onBack}
          aria-label="Back"
          sx={{
            boxShadow: 'none',
            p: '4px',
            minWidth: 'unset',
            color: 'fg.muted',
          }}
        >
          <ArrowLeftIcon size={16} />
        </Button>
      )}
      <Heading as="h2" sx={{ fontSize: 2, fontWeight: 'semibold', m: 0, flex: 1, minWidth: 0 }}>
        <Text
          sx={{
            display: 'block',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={title}
        >
          {title}
        </Text>
      </Heading>
    </Box>
  )
}

interface FlyoutFooterProps {
  onCancel: () => void
  onApply?: () => void
  applyDisabled: boolean
  applyLabel: string
  applyVariant: 'primary' | 'danger'
  cancelLabel: string
}

function FlyoutFooter({
  onCancel,
  onApply,
  applyDisabled,
  applyLabel,
  applyVariant,
  cancelLabel,
}: FlyoutFooterProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'flex-end',
        gap: 2,
        px: 3,
        py: 2,
        borderTop: '1px solid',
        borderColor: 'border.default',
      }}
      data-testid="rgp-bulk-flyout-footer"
    >
      <Button
        type="button"
        variant="invisible"
        size="small"
        onClick={onCancel}
        sx={{ boxShadow: 'none' }}
      >
        {cancelLabel}
      </Button>
      <Button
        type="button"
        variant={applyVariant}
        size="small"
        disabled={applyDisabled}
        onClick={() => {
          if (applyDisabled) return
          onApply?.()
        }}
        sx={{ boxShadow: 'none' }}
        data-testid="rgp-bulk-flyout-apply"
      >
        {applyLabel}
      </Button>
    </Box>
  )
}

/**
 * Hook helper: keeps a piece of drilldown state that resets to its root pane
 * whenever the flyout closes. Most consumers will want this so re-opening the
 * flyout always lands on the root.
 */
export function useDrilldownPane(rootPaneId: string, open: boolean) {
  const [currentPaneId, setCurrentPaneId] = useState(rootPaneId)
  const lastOpen = useRef(open)

  useEffect(() => {
    if (lastOpen.current && !open) {
      setCurrentPaneId(rootPaneId)
    }
    lastOpen.current = open
  }, [open, rootPaneId])

  return { currentPaneId, setCurrentPaneId }
}
