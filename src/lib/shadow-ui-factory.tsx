import React, { useLayoutEffect, useRef } from 'react'
import type { ContentScriptContext } from 'wxt/utils/content-script-context'
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root'
import ReactDOM from 'react-dom/client'
import { StyleSheetManager } from 'styled-components'
import isPropValid from '@emotion/is-prop-valid'
import { Box, registerPortalRoot } from '@primer/react'
import { ErrorBoundary } from '@/ui/error-boundary'
import { ShadowThemeProvider } from '@/ui/shadow-theme-provider'
import {
  BULK_BAR_PRIMER_PORTAL_NAME,
  installPrimerShadowDomCompat,
} from '@/lib/primer-shadow-dom-compat'
import { Z_MODAL_PORTAL } from '@/lib/z-index'

export interface FeatureUiOptions {
  /** Feature name, used as ErrorBoundary name and WXT UI name (prefixed with 'rgp-') */
  name: string
  /** React element to render inside the shadow DOM */
  component: React.ReactElement
  /** DOM anchor element (default: document.body) */
  anchor?: Element | string
  /** Insertion position (default: 'last') */
  append?: 'first' | 'last'
  /** Enable Primer shadow DOM compatibility for overlays (dialogs, dropdowns) */
  portalCompat?: boolean
}

export interface FeatureUi {
  mount: () => void
  destroy: () => void
}

const RGP_PRIMER_PORTAL_SURFACE_CSS = `
[data-rgp-primer-portal],
[data-rgp-primer-portal] * {
  font-family: inherit;
}
[data-rgp-primer-portal] > *,
[data-rgp-primer-portal] > * * {
  pointer-events: auto;
}
`

function PrimerPortalRootHost({ shadowRoot }: { shadowRoot: ShadowRoot }) {
  const portalRootRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const portalRoot = portalRootRef.current
    if (!portalRoot) return

    const cleanupShadowCompat = installPrimerShadowDomCompat(portalRoot, shadowRoot)
    registerPortalRoot(portalRoot, BULK_BAR_PRIMER_PORTAL_NAME)

    return cleanupShadowCompat
  }, [shadowRoot])

  return (
    <Box
      ref={portalRootRef}
      data-rgp-primer-portal=""
      sx={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: Z_MODAL_PORTAL,
      }}
    />
  )
}

export async function createFeatureUi(
  ctx: ContentScriptContext,
  opts: FeatureUiOptions,
): Promise<FeatureUi> {
  let root: ReactDOM.Root | null = null
  let styleHost: HTMLDivElement | null = null

  const ui = await createShadowRootUi(ctx, {
    name: `rgp-${opts.name}`,
    position: 'inline' as const,
    anchor: opts.anchor ?? document.body,
    append: opts.append ?? 'last',
    onMount(container, shadow) {
      styleHost = document.createElement('div')
      container.parentElement!.insertBefore(styleHost, container)

      if (opts.portalCompat) {
        const portalSurfaceStyle = document.createElement('style')
        portalSurfaceStyle.setAttribute('data-rgp-primer-portal-surface', '')
        portalSurfaceStyle.textContent = RGP_PRIMER_PORTAL_SURFACE_CSS
        styleHost.appendChild(portalSurfaceStyle)
      }

      root = ReactDOM.createRoot(container)
      root.render(
        <StyleSheetManager target={styleHost} shouldForwardProp={isPropValid}>
          <ShadowThemeProvider>
            {opts.portalCompat && <PrimerPortalRootHost shadowRoot={shadow} />}
            <ErrorBoundary name={opts.name}>{opts.component}</ErrorBoundary>
          </ShadowThemeProvider>
        </StyleSheetManager>,
      )
      return root
    },
    onRemove(reactRoot) {
      reactRoot?.unmount()
      styleHost?.remove()
      styleHost = null
      root = null
    },
  })

  return {
    mount() {
      ui.mount()
    },
    destroy() {
      ui.remove()
      styleHost?.remove()
      styleHost = null
      root = null
    },
  }
}

export interface LightDomUiOptions {
  /** Feature name, used as ErrorBoundary name and as a data attribute on the host */
  name: string
  /** React element to render directly into the light DOM */
  component: React.ReactElement
  /** DOM anchor element (default: document.body) */
  anchor?: Element
  /** Insertion position relative to anchor's children (default: 'last') */
  append?: 'first' | 'last'
}

/**
 * Mount a React tree directly into the light DOM (no shadow root). Use this for
 * portal *hosts* whose only job is to `createPortal` into existing light-DOM
 * targets — wrapping such a host in a shadow root would isolate the React tree
 * from the very DOM it needs to portal into.
 *
 * Styled-components styles still flow through a dedicated `styleHost` sibling
 * so they remain scoped to this UI and can be torn down cleanly. Primer theme
 * context propagates through `createPortal` via React context (preserved
 * across portals), so portaled `@primer/react` components still resolve their
 * `sx` and `colorMode` correctly.
 */
export function createLightDomUi(ctx: ContentScriptContext, opts: LightDomUiOptions): FeatureUi {
  let root: ReactDOM.Root | null = null
  let host: HTMLDivElement | null = null
  let styleHost: HTMLDivElement | null = null
  let mounted = false
  let invalidated = false

  const teardown = () => {
    root?.unmount()
    host?.remove()
    styleHost?.remove()
    root = null
    host = null
    styleHost = null
    mounted = false
  }

  ctx.onInvalidated(() => {
    invalidated = true
    teardown()
  })

  return {
    mount() {
      if (mounted || invalidated) return
      const anchor = opts.anchor ?? document.body
      host = document.createElement('div')
      host.setAttribute('data-rgp-light-dom', opts.name)
      styleHost = document.createElement('div')
      styleHost.setAttribute('data-rgp-light-dom-styles', opts.name)

      if (opts.append === 'first') {
        anchor.insertBefore(styleHost, anchor.firstChild)
        anchor.insertBefore(host, styleHost.nextSibling)
      } else {
        anchor.appendChild(styleHost)
        anchor.appendChild(host)
      }

      root = ReactDOM.createRoot(host)
      root.render(
        <StyleSheetManager target={styleHost} shouldForwardProp={isPropValid}>
          <ShadowThemeProvider>
            <ErrorBoundary name={opts.name}>{opts.component}</ErrorBoundary>
          </ShadowThemeProvider>
        </StyleSheetManager>,
      )
      mounted = true
    },
    destroy() {
      teardown()
    },
  }
}
