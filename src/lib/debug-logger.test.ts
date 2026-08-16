import { describe, it, expect, vi, beforeEach } from 'vitest'

// mock storage before importing debug-logger
const debugFlag = { value: false }
vi.mock('@/lib/storage', () => ({
  debugStorage: {
    getValue: vi.fn(() => Promise.resolve(debugFlag.value)),
    watch: vi.fn(),
  },
}))

import { logger, initDebugLogger } from '@/lib/debug-logger'

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('logger', () => {
  it('error always logs regardless of debug flag', () => {
    const groupSpy = vi.spyOn(console, 'group').mockImplementation(() => {})
    vi.spyOn(console, 'groupEnd').mockImplementation(() => {})
    logger.error('test error')
    expect(groupSpy).toHaveBeenCalled()
    // first arg to console.group includes the error message
    expect(String(groupSpy.mock.calls[0]?.[0])).toContain('test error')
  })

  it('log does not output when debug is disabled', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    logger.log('should be silent')
    expect(spy).not.toHaveBeenCalled()
  })

  it('warn does not output when debug is disabled', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    logger.warn('should be silent')
    expect(spy).not.toHaveBeenCalled()
  })

  it('debug does not output when debug is disabled', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    logger.debug('should be silent')
    expect(spy).not.toHaveBeenCalled()
  })

  it('verbose does not output when debug is disabled', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    logger.verbose('should be silent')
    expect(spy).not.toHaveBeenCalled()
  })

  it('warn groups and logs rest args when debug is enabled', async () => {
    debugFlag.value = true
    await initDebugLogger()
    const groupSpy = vi.spyOn(console, 'group').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const groupEndSpy = vi.spyOn(console, 'groupEnd').mockImplementation(() => {})

    logger.warn('header', { detail: 1 }, 'tail')

    expect(groupSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy).toHaveBeenCalledTimes(2)
    expect(groupEndSpy).toHaveBeenCalledTimes(1)
  })

  it('verbose logs context when debug is enabled', async () => {
    debugFlag.value = true
    await initDebugLogger()
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {})

    logger.verbose('step-name', { ctx: true })

    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('debug logs when debug is enabled', async () => {
    debugFlag.value = true
    await initDebugLogger()
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {})

    logger.debug('debug-msg')

    expect(spy).toHaveBeenCalled()
  })

  it('verbose logs without context when debug is enabled', async () => {
    debugFlag.value = true
    await initDebugLogger()
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {})

    logger.verbose('step-only')

    expect(spy).toHaveBeenCalledTimes(1)
  })
})

describe('initDebugLogger', () => {
  it('initializes without throwing', async () => {
    await expect(initDebugLogger()).resolves.not.toThrow()
  })
})
