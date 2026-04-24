import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const hoisted = vi.hoisted(() => ({
  sendMessageMock: vi.fn(),
}))

vi.mock('@webext-core/messaging', () => ({
  defineExtensionMessaging: () => ({
    sendMessage: hoisted.sendMessageMock,
    onMessage: vi.fn(),
  }),
}))

import { sendMessage } from '../messages'

describe('sendMessage', () => {
  beforeEach(() => {
    hoisted.sendMessageMock.mockReset()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('passes through on success', async () => {
    hoisted.sendMessageMock.mockResolvedValue('ok')
    const result = await sendMessage('openOptions', {})
    expect(result).toBe('ok')
    expect(hoisted.sendMessageMock).toHaveBeenCalledTimes(1)
    expect(hoisted.sendMessageMock).toHaveBeenCalledWith('openOptions', {})
  })

  it('retries once on "Could not establish connection"', async () => {
    hoisted.sendMessageMock
      .mockRejectedValueOnce(
        new Error('Could not establish connection. Receiving end does not exist.'),
      )
      .mockResolvedValueOnce('recovered')

    const promise = sendMessage('openOptions', {})
    await vi.advanceTimersByTimeAsync(300)
    const result = await promise

    expect(result).toBe('recovered')
    expect(hoisted.sendMessageMock).toHaveBeenCalledTimes(2)
  })

  it('retries once on "Receiving end does not exist"', async () => {
    hoisted.sendMessageMock
      .mockRejectedValueOnce(new Error('Receiving end does not exist'))
      .mockResolvedValueOnce('recovered')

    const promise = sendMessage('openOptions', {})
    await vi.advanceTimersByTimeAsync(300)
    const result = await promise

    expect(result).toBe('recovered')
    expect(hoisted.sendMessageMock).toHaveBeenCalledTimes(2)
  })

  it('throws non-connection errors immediately', async () => {
    hoisted.sendMessageMock.mockRejectedValue(new Error('something else'))
    await expect(sendMessage('openOptions', {})).rejects.toThrow('something else')
    expect(hoisted.sendMessageMock).toHaveBeenCalledTimes(1)
  })

  it('passes tabId when provided', async () => {
    hoisted.sendMessageMock.mockResolvedValue('ok')
    await sendMessage('openOptions', {}, 42)
    expect(hoisted.sendMessageMock).toHaveBeenCalledWith('openOptions', {}, 42)
  })
})
