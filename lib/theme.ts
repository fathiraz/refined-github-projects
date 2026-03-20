export interface ThemeTokens {
  surface: string
  surfaceRaised: string
  bg: string
  border: string
  text: string
  textMuted: string
  shadow: string
  success: string
  warning: string
  danger: string
  accent: string
}

export const LIGHT: ThemeTokens = {
  surface: '#ffffff',
  surfaceRaised: '#f6f8fa',
  bg: '#eaeef2',
  border: '#d0d7de',
  text: '#24292f',
  textMuted: '#57606a',
  shadow: '0 1px 6px rgba(27,31,36,0.12)',
  success: '#1a7f37',
  warning: '#9a6700',
  danger: '#cf222e',
  accent: '#0969da',
}

export const DARK: ThemeTokens = {
  surface: '#161b22',
  surfaceRaised: '#1c2128',
  bg: '#0d1117',
  border: '#30363d',
  text: '#e6edf3',
  textMuted: '#8b949e',
  shadow: '0 1px 6px rgba(0,0,0,0.4)',
  success: '#3fb950',
  warning: '#d29922',
  danger: '#f85149',
  accent: '#58a6ff',
}
