import { useEffect, useMemo, useState } from 'react'
import { sendMessage } from './messages'
import { patStorage } from './storage'

export function useTokenSetup() {
  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(true)
  const [validating, setValidating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedLogin, setSavedLogin] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let mounted = true
    patStorage.getValue().then((value) => {
      if (!mounted) return
      if (value) setToken(value)
      setLoading(false)
    })
    return () => {
      mounted = false
    }
  }, [])

  const hasToken = useMemo(() => token.trim().length > 0, [token])

  async function saveToken() {
    const value = token.trim()
    if (!value) return false

    setValidating(true)
    setError(null)
    setSaved(false)

    try {
      const result = await sendMessage('validatePat', { token: value })
      if (!result.valid) {
        setError('Invalid token. Make sure it includes project, read:org, and repo scopes.')
        return false
      }

      await patStorage.setValue(value)
      setSavedLogin(result.user || null)
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2500)
      return true
    } catch {
      setError('Token validation failed. Please try again.')
      return false
    } finally {
      setValidating(false)
    }
  }

  return {
    token,
    setToken,
    loading,
    validating,
    error,
    setError,
    saved,
    savedLogin,
    hasToken,
    saveToken,
  }
}
