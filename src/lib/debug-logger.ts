import { Logger, HashMap } from 'effect'
import { debugStorage } from './storage'

let isDebugEnabled = false

export async function initDebugLogger(): Promise<void> {
  isDebugEnabled = await debugStorage.getValue()
  debugStorage.watch((newValue) => {
    isDebugEnabled = newValue
  })
}

function ts(): string {
  return new Date().toISOString().slice(11, 23)
}

export const logger = {
  log: (...args: unknown[]): void => {
    if (!isDebugEnabled) return
    const [first, ...rest] = args
    console.log(`%c[rgp ${ts()}]`, 'color:#58a6ff;font-weight:bold', first, ...rest)
  },

  warn: (...args: unknown[]): void => {
    if (!isDebugEnabled) return
    const [first, ...rest] = args
    console.group(`%c⚠ [rgp ${ts()}] ${String(first)}`, 'color:#d29922;font-weight:bold')
    if (rest.length) rest.forEach((a) => console.warn(a))
    console.groupEnd()
  },

  error: (...args: unknown[]): void => {
    const [first, ...rest] = args
    console.group(`%c🔴 [rgp ${ts()}] ${String(first)}`, 'color:#f85149;font-weight:bold')
    if (rest.length) rest.forEach((a) => console.error(a))
    console.groupEnd()
  },

  debug: (...args: unknown[]): void => {
    if (!isDebugEnabled) return
    const [first, ...rest] = args
    console.debug(`%c[rgp ${ts()}]`, 'color:#8b949e', first, ...rest)
  },

  info: (...args: unknown[]): void => {
    if (!isDebugEnabled) return
    const [first, ...rest] = args
    console.info(`%c[rgp ${ts()}]`, 'color:#3fb950;font-weight:bold', first, ...rest)
  },

  verbose: (step: string, context?: unknown): void => {
    if (!isDebugEnabled) return
    if (context !== undefined) {
      console.debug(`%c  ↳ ${ts()} ${step}`, 'color:#8b949e', context)
    } else {
      console.debug(`%c  ↳ ${ts()} ${step}`, 'color:#8b949e')
    }
  },
}

// Effect Logger Layer — routes Effect.logError/logDebug/logWarning through the enhanced logger
export const RgpLoggerLive = Logger.replace(
  Logger.defaultLogger,
  Logger.make(({ logLevel, message, annotations }) => {
    const msg = [message].flat().map(String).join(' ')
    const ctx = HashMap.isEmpty(annotations)
      ? undefined
      : Object.fromEntries(HashMap.entries(annotations))
    const args: unknown[] = ctx ? [msg, ctx] : [msg]
    switch (logLevel.label) {
      case 'ERROR':
      case 'FATAL':
        logger.error(...args)
        break
      case 'WARN':
        logger.warn(...args)
        break
      case 'DEBUG':
      case 'TRACE':
        logger.debug(...args)
        break
      default:
        logger.log(...args)
    }
  }),
)
