import { debugStorage } from './storage'

let isDebugEnabled = false

export async function initDebugLogger(): Promise<void> {
  isDebugEnabled = await debugStorage.getValue()
  debugStorage.watch((newValue) => {
    isDebugEnabled = newValue
  })
}

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
