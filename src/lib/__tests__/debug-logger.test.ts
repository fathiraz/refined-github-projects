import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock storage before importing debug-logger
vi.mock('../storage', () => ({
  debugStorage: {
    getValue: vi.fn().mockResolvedValue(false),
    watch: vi.fn(),
  },
}))

import { logger, initDebugLogger } from '../debug-logger'

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

  it('info does not output when debug is disabled', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {})
    logger.info('should be silent')
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('initDebugLogger', () => {
  it('initializes without throwing', async () => {
    await expect(initDebugLogger()).resolves.not.toThrow()
  })
})
