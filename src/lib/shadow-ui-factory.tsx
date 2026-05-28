import React, { useLayoutEffect, useRef } from 'react'
import type { ContentScriptContext } from 'wxt/utils/content-script-context'
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
    onRemove(root) {
      root?.unmount()
    },
  })

  return {
    mount() {
      ui.mount()
    },
    destroy() {
      root?.unmount()
      styleHost?.remove()
    },
  }
}
