// Inlined tippy.js CSS — avoids ?raw import which Rolldown doesn't support for node_modules
const TIPPY_CSS =
  '.tippy-box[data-animation=fade][data-state=hidden]{opacity:0}[data-tippy-root]{max-width:calc(100vw - 10px)}.tippy-box{position:relative;background-color:#333;color:#fff;border-radius:4px;font-size:14px;line-height:1.4;white-space:normal;outline:0;transition-property:transform,visibility,opacity}.tippy-box[data-placement^=top]>.tippy-arrow{bottom:0}.tippy-box[data-placement^=top]>.tippy-arrow:before{bottom:-7px;left:0;border-width:8px 8px 0;border-top-color:initial;transform-origin:center top}.tippy-box[data-placement^=bottom]>.tippy-arrow{top:0}.tippy-box[data-placement^=bottom]>.tippy-arrow:before{top:-7px;left:0;border-width:0 8px 8px;border-bottom-color:initial;transform-origin:center bottom}.tippy-box[data-placement^=left]>.tippy-arrow{right:0}.tippy-box[data-placement^=left]>.tippy-arrow:before{border-width:8px 0 8px 8px;border-left-color:initial;right:-7px;transform-origin:center left}.tippy-box[data-placement^=right]>.tippy-arrow{left:0}.tippy-box[data-placement^=right]>.tippy-arrow:before{left:-7px;border-width:8px 8px 8px 0;border-right-color:initial;transform-origin:center right}.tippy-box[data-inertia][data-state=visible]{transition-timing-function:cubic-bezier(.54,1.5,.38,1.11)}.tippy-arrow{width:16px;height:16px;color:#333}.tippy-arrow:before{content:"";position:absolute;border-color:transparent;border-style:solid}.tippy-content{position:relative;padding:5px 9px;z-index:1}'

export function ensureTippyCss(): void {
  if (document.getElementById('rgp-tippy-css')) return
  const el = document.createElement('style')
  el.id = 'rgp-tippy-css'
  el.textContent = TIPPY_CSS
  document.head.appendChild(el)
}

const RGP_CARD_THEME_CSS = [
  '.tippy-box[data-theme~="rgp-card"]{background-color:transparent;color:inherit;border-radius:0;font-size:inherit}',
  '.tippy-box[data-theme~="rgp-card"]>.tippy-content{padding:0}',
  '@keyframes rgp-shimmer{0%{background-position:-200px 0}100%{background-position:200px 0}}',
  '.rgp-skeleton{background:linear-gradient(90deg,var(--color-border-muted,#d0d7de) 25%,var(--color-border-default,#d0d7de) 50%,var(--color-border-muted,#d0d7de) 75%);background-size:400px 100%;animation:rgp-shimmer 1.4s ease infinite;border-radius:4px}',
  '@media(prefers-reduced-motion:reduce){.rgp-skeleton{animation:none;background:var(--color-border-muted,#d0d7de)}}',
].join('')

export function ensureRgpCardTheme(): void {
  if (document.getElementById('rgp-tippy-card-theme')) return
  const el = document.createElement('style')
  el.id = 'rgp-tippy-card-theme'
  el.textContent = RGP_CARD_THEME_CSS
  document.head.appendChild(el)
}

export function getTippyDelayValue(
  delay: number | readonly [number | null | undefined, number | null | undefined] | null | undefined,
  index: 0 | 1,
): number {
  if (delay == null) return 0
  if (typeof delay === 'number') return Math.max(0, delay)
  return Math.max(0, delay[index] ?? 0)
}
