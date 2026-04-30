import { Layer, LogLevel, Logger, HashMap } from 'effect'
import { debugStorage } from '@/lib/storage'

let isDebugEnabled = false

export async function initDebugLogger(): Promise<void> {
  isDebugEnabled = await debugStorage.getValue()
  debugStorage.watch((newValue) => {
    isDebugEnabled = newValue
  })
}

function ts(): string {
  const d = new Date()
  const p2 = (n: number) => String(n).padStart(2, '0')
  const p3 = (n: number) => String(n).padStart(3, '0')
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}.${p3(d.getMilliseconds())}`
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
    // preserve the primary error object/stack by passing it to console.error
    // rather than only stringifying it into the group header. Browsers render
    // Error instances with a clickable stack when handed the real object.
    console.group(`%c🔴 [rgp ${ts()}] ${String(first)}`, 'color:#f85149;font-weight:bold')
    console.error(first, ...rest)
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

// Effect Logger Layer — routes Effect.logError/logDebug/logWarning through the
// enhanced logger above. We also set the minimum log level to Debug so that
// Effect.logDebug calls are actually evaluated and delivered to this Logger,
// which then gates them behind the runtime debug flag via logger.debug().
// without the minimum-level override, Effect's default INFO floor would drop
// logDebug entries before they reach our layer.
const rgpLogger = Logger.make(({ logLevel, message, annotations }) => {
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
})

export const RgpLoggerLive = Layer.mergeAll(
  Logger.replace(Logger.defaultLogger, rgpLogger),
  Logger.minimumLogLevel(LogLevel.Debug),
)
