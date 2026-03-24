/**
 * Shadow DOM compatibility shim for Primer overlays.
 *
 * Problem: Primer's useOnOutsideClick uses a document-level capture mousedown listener
 * and checks `containerRef.current?.contains(event.target as Node)`. In Shadow DOM,
 * the event.target is retargeted to the shadow host for events crossing the shadow
 * boundary, causing Primer to misclassify inside clicks as outside clicks.
 *
 * Solution: This shim patches the `contains` method on relevant elements in the
 * Primer portal subtree. When Primer checks if the overlay contains the event
 * target (which may be retargeted to the shadow host), we use the active mouse
 * event target + composedPath to determine whether the click actually originated
 * inside that overlay.
 */

type ComposedMouseEvent = MouseEvent & { composedPath?: () => EventTarget[] }

// Store only the current mousedown event's retargeted target/path so patched
// contains() checks can answer Primer's document-level outside-click query.
let activeMousedownPath: EventTarget[] = []
let activeMousedownTarget: EventTarget | null = null
let clearTrackedMousedownRaf: number | null = null
const patchedOverlays = new WeakSet<HTMLElement>()

function describeEventTarget(target: EventTarget | null): string {
  if (target instanceof HTMLElement) {
    const parts = [target.tagName.toLowerCase()]
    if (target.id) parts.push(`#${target.id}`)
    if (target.classList.length > 0) parts.push(`.${[...target.classList].slice(0, 3).join('.')}`)
    const role = target.getAttribute('role')
    if (role) parts.push(`[role="${role}"]`)
    return parts.join('')
  }

  if (target instanceof ShadowRoot) return '#shadow-root'
  if (target instanceof Document) return 'document'
  if (target instanceof Window) return 'window'
  if (target instanceof Node) return target.nodeName.toLowerCase()

  return String(target)
}

function summarizeEventPath(path: EventTarget[]): string[] {
  return path.slice(0, 12).map(describeEventTarget)
}

function cancelTrackedMousedownClear(): void {
  if (clearTrackedMousedownRaf === null) return
  window.cancelAnimationFrame(clearTrackedMousedownRaf)
  clearTrackedMousedownRaf = null
}

function resetTrackedMousedown(): void {
  activeMousedownPath = []
  activeMousedownTarget = null
}

function clearTrackedMousedown(): void {
  cancelTrackedMousedownClear()
  resetTrackedMousedown()
}

function scheduleTrackedMousedownClear(): void {
  cancelTrackedMousedownClear()
  clearTrackedMousedownRaf = window.requestAnimationFrame(() => {
    clearTrackedMousedownRaf = null
    console.log('[PrimerShadowCompat] clear tracked mousedown state')
    resetTrackedMousedown()
  })
}

/**
 * Install the Shadow DOM compatibility shim for Primer portal overlays.
 * Must be called before registerPortalRoot and after the portal host is created.
 *
 * @param portalHost - The element with data-rgp-primer-portal attribute
 * @param shadowRoot - The shadow root containing the portal host
 */
export function installPrimerShadowDomCompat(portalHost: HTMLElement, shadowRoot: ShadowRoot): () => void {
  // Capture mousedown at document level BEFORE Primer's listener
  // This ensures we have the current event target/composedPath available when
  // Primer does its contains(event.target) outside-click check.
  const captureMousedown = (e: MouseEvent) => {
    // Track the current event only when it originated from our shadow/portal tree
    const path = (e as ComposedMouseEvent).composedPath?.() ?? []
    const target = e.target
    const originatedFromPortal =
      path.includes(portalHost) || path.includes(shadowRoot) || path.includes(shadowRoot.host)

    if (originatedFromPortal) {
      activeMousedownPath = path
      activeMousedownTarget = target
      console.log('[PrimerShadowCompat] capture:mousedown', {
        target: describeEventTarget(target),
        path: summarizeEventPath(path),
        originatedFromPortal,
      })
      scheduleTrackedMousedownClear()
    } else {
      clearTrackedMousedown()
    }
  }

  document.addEventListener('mousedown', captureMousedown, true)

  const captureClick = (e: MouseEvent) => {
    if (activeMousedownPath.length === 0) return

    const path = (e as ComposedMouseEvent).composedPath?.() ?? []
    const originatedFromPortal =
      path.includes(portalHost) || path.includes(shadowRoot) || path.includes(shadowRoot.host)

    if (originatedFromPortal) {
      console.log('[PrimerShadowCompat] capture:click', {
        target: describeEventTarget(e.target),
        path: summarizeEventPath(path),
      })
    }

    clearTrackedMousedown()
  }

  document.addEventListener('click', captureClick, true)

  // Observer to patch contains() on overlay elements as they're added
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue
        patchPortalOverlaySubtree(node, portalHost, shadowRoot.host)
      }
    }
  })

  observer.observe(portalHost, { childList: true, subtree: true })

  // Patch any existing overlay elements
  Array.from(portalHost.children).forEach((child) => {
    if (child instanceof HTMLElement) {
      patchPortalOverlaySubtree(child, portalHost, shadowRoot.host)
    }
  })

  return () => {
    document.removeEventListener('mousedown', captureMousedown, true)
    document.removeEventListener('click', captureClick, true)
    observer.disconnect()
    clearTrackedMousedown()
  }
}

function patchPortalOverlaySubtree(root: HTMLElement, portalHost: HTMLElement, shadowHost: Element): void {
  const queue: HTMLElement[] = [root]

  while (queue.length > 0) {
    const element = queue.shift()
    if (!element) continue

    patchOverlayContains(element, portalHost, shadowHost)

    for (const child of Array.from(element.children)) {
      if (child instanceof HTMLElement) queue.push(child)
    }
  }
}

/**
 * Patch the contains method on an overlay element to use composedPath
 * for Shadow DOM compatibility.
 */
function patchOverlayContains(overlay: HTMLElement, portalHost: HTMLElement, shadowHost: Element): void {
  if (patchedOverlays.has(overlay)) return
  patchedOverlays.add(overlay)

  const originalContains = overlay.contains.bind(overlay)

  // Override contains to treat the current event's retargeted shadow host
  // target as inside the overlay when the overlay is present in the composedPath.
  overlay.contains = (node: Node | null): boolean => {
    if (!node) return false

    // First try the original contains check
    if (originalContains(node)) {
      return true
    }

    const pathHitsOverlay = activeMousedownPath.some((target) => {
      return target instanceof Node && (target === overlay || originalContains(target))
    })

    const isRetargetedNode =
      node === activeMousedownTarget ||
      node === shadowHost ||
      node === portalHost ||
      node === document.body ||
      node === document.documentElement

    const fallbackResult = pathHitsOverlay && isRetargetedNode

    if (activeMousedownPath.length > 0 && (pathHitsOverlay || isRetargetedNode)) {
      console.log('[PrimerShadowCompat] contains:fallback-check', {
        overlay: describeEventTarget(overlay),
        node: describeEventTarget(node),
        activeTarget: describeEventTarget(activeMousedownTarget),
        pathHitsOverlay,
        isRetargetedNode,
        fallbackResult,
      })
    }

    if (fallbackResult) {
      return true
    }

    return false
  }
}

/**
 * Clear the tracked mousedown state.
 */
export function clearMousedownPath(): void {
  clearTrackedMousedown()
}
