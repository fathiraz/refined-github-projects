import { logger } from '@/lib/debug-logger'

/**
 * Adapter for `onMessage` handlers. Logs any failure so it surfaces in DevTools
 * instead of being silently swallowed by the messaging library, while still
 * rejecting so the sender sees the failure.
 *
 * Background-local on purpose: it needs the logger, and the logger reads
 * WXT storage — a dependency `lib/messages.ts` must not acquire, since the
 * content script and its suites import that module.
 */
export async function runHandler<A>(label: string, run: () => Promise<A>): Promise<A> {
  try {
    return await run()
  } catch (error) {
    logger.error(`[runHandler:${label}] failed`, error)
    throw error
  }
}
