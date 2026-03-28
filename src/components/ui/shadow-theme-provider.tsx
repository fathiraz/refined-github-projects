import React, { useEffect, useState } from 'react'
import { BaseStyles, ThemeProvider } from '@primer/react'

function resolveMode(): 'day' | 'night' {
  const mode = document.documentElement.getAttribute('data-color-mode')
  const dark = document.documentElement.getAttribute('data-dark-theme')
  if (mode === 'dark') return 'night'
  if (mode === 'light') return 'day'
  if (mode === 'auto') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'night' : 'day'
  }
  // data-color-mode absent: use data-dark-theme presence as hint, then system preference
  if (dark) return 'night'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'night' : 'day'
}

export function ShadowThemeProvider({ children }: { children: React.ReactNode }) {
  const [colorMode, setColorMode] = useState<'day' | 'night'>(() => resolveMode())

  useEffect(() => {
    const observer = new MutationObserver(() => setColorMode(resolveMode()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-color-mode', 'data-dark-theme', 'data-light-theme'] })
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => setColorMode(resolveMode())
    mq.addEventListener('change', handler)
    return () => {
      observer.disconnect()
      mq.removeEventListener('change', handler)
    }
  }, [])

  return (
    <ThemeProvider colorMode={colorMode}>
      <BaseStyles>{children}</BaseStyles>
    </ThemeProvider>
  )
}
