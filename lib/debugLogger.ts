/**
 * Debug logger utility - conditional console logging based on user preference
 * All console output is suppressed unless debug mode is enabled in settings
 */

import { debugStorage } from './storage'

let isDebugEnabled = false

// Initialize debug state from storage
export async function initDebugLogger(): Promise<void> {
  isDebugEnabled = await debugStorage.getValue()
}

// Check current debug state without async
export function isDebugMode(): boolean {
  return isDebugEnabled
}

// Toggle debug mode and persist to storage
export async function setDebugMode(enabled: boolean): Promise<void> {
  isDebugEnabled = enabled
  await debugStorage.setValue(enabled)
}

// Logger functions that only output when debug mode is enabled
export const logger = {
  log: (...args: unknown[]): void => {
    if (isDebugEnabled) {
      console.log(...args)
    }
  },
  
  warn: (...args: unknown[]): void => {
    if (isDebugEnabled) {
      console.warn(...args)
    }
  },
  
  error: (...args: unknown[]): void => {
    // Always log errors, even in production
    console.error(...args)
  },
  
  debug: (...args: unknown[]): void => {
    if (isDebugEnabled) {
      console.debug(...args)
    }
  },
  
  info: (...args: unknown[]): void => {
    if (isDebugEnabled) {
      console.info(...args)
    }
  },
}

// Hook to get current debug state (for React components)
export function useDebugLogger(): {
  isDebug: boolean
  setDebug: (enabled: boolean) => Promise<void>
} {
  return {
    isDebug: isDebugEnabled,
    setDebug: setDebugMode,
  }
}