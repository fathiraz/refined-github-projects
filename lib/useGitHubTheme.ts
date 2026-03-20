import { useState, useEffect } from 'react'
import { LIGHT, DARK, type ThemeTokens } from './theme'

function resolve(): ThemeTokens {
  const mode = document.documentElement.getAttribute('data-color-mode')
  if (mode === 'dark') return DARK
  if (mode === 'light') return LIGHT
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? DARK : LIGHT
}

export function useGitHubTheme(): ThemeTokens {
  const [t, setT] = useState<ThemeTokens>(resolve)
  useEffect(() => {
    const obs = new MutationObserver(() => setT(resolve()))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-color-mode'] })
    return () => obs.disconnect()
  }, [])
  return t
}
