import type { BetterSystemStyleObject } from '@primer/react'
import { Z_MODAL } from '@/lib/z-index'

type PrimerPresetFn = (overrides?: BetterSystemStyleObject) => BetterSystemStyleObject

function makePreset(base: BetterSystemStyleObject): PrimerPresetFn {
  return (overrides?: BetterSystemStyleObject) => ({ ...base, ...overrides })
}

export const primerCss = {
  buttonMotion: makePreset({
    boxShadow: 'none',
    transition: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
    '&:hover:not(:disabled)': { transform: 'translateY(-1px)' },
    '&:active': { transform: 'translateY(0)', transition: '100ms' },
    '@media (prefers-reduced-motion: reduce)': {
      transition: 'none',
      '&:hover:not(:disabled)': { transform: 'none' },
    },
  }),

  flatPanel: makePreset({
    boxShadow: 'none',
    border: '1px solid',
    borderColor: 'border.default',
    bg: 'canvas.overlay',
  }),

  modalOverlay: makePreset({
    position: 'fixed',
    inset: 0,
    bg: 'rgba(27,31,36,0.5)',
    zIndex: Z_MODAL,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }),

  modalPanel: makePreset({
    bg: 'canvas.overlay',
    border: '1px solid',
    borderColor: 'border.default',
    borderRadius: 2,
    width: '100%',
    maxWidth: 480,
    overflow: 'hidden',
    boxShadow: 'none',
    display: 'flex',
    flexDirection: 'column',
  }),

  borderedContainer: makePreset({
    border: '1px solid',
    borderColor: 'border.default',
    borderRadius: 1,
    overflow: 'hidden',
  }),

  card: makePreset({
    border: '1px solid',
    borderColor: 'border.default',
    borderRadius: 2,
    boxShadow: 'none',
    overflow: 'hidden',
    bg: 'canvas.default',
  }),

  divider: makePreset({
    borderTop: '1px solid',
    borderColor: 'border.default',
  }),

  footerBorder: makePreset({
    borderTop: '1px solid',
    borderColor: 'border.default',
  }),

  footerLayout: makePreset({
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 2,
    px: 4,
    pb: 3,
  }),

  contentArea: makePreset({
    flex: 1,
    overflow: 'auto',
    px: 4,
    py: 3,
  }),
}
