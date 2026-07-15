import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { MockInstance } from 'vitest'

/* ─── Mock socket.io-client before importing the module under test ─── */

const mockOn  = vi.fn()
const mockOff = vi.fn()
const mockEmit = vi.fn()

vi.mock('socket.io-client', () => ({
  io: () => ({
    on:         mockOn,
    off:        mockOff,
    emit:       mockEmit,
    connected:  true,
    disconnect: vi.fn(),
  }),
}))

import { LatticeSocketClient } from '../socketClient'
import type { CalculatePayload, CalculateTilePayload } from '../types'
import { EXTRUSION } from '../../lib/parameters'

/* ─── Helpers ─── */

/**
 * Grab the callback that was registered for a given event name
 * via `mockOn(event, cb)`.
 */
function getHandler(event: string): (...args: unknown[]) => void {
  const call = (mockOn as MockInstance).mock.calls.find(([e]) => e === event)
  if (!call) throw new Error(`No handler registered for "${event}"`)
  return call[1]
}

/* ─── Tests ─── */

describe('LatticeSocketClient', () => {
  let client: LatticeSocketClient

  beforeEach(() => {
    vi.clearAllMocks()
    client = new LatticeSocketClient('http://localhost:5003')
  })

  // 1. calculate() emits the correct event name and payload
  it('emits "calculate" with the full payload', () => {
    const payload: CalculatePayload = {
      filename: 'part.stl',
      surface_b64: '',
      client_ts: 1000,
      args: { tileType: 'cross', nt1: 10, nt2: 10, nt3: 1, g1: 0.5, g2: 0.5, p1:0.5, p2:0.4, p3:0.3, calcMode: EXTRUSION },
      tolerance: 0
    }
    client.calculate(payload)
    expect(mockEmit).toHaveBeenCalledWith('calculate', payload)
  })

  // 2. calculateTile() emits the correct event name and payload
  it('emits "calculate_tile" with the correct payload', () => {
    const payload: CalculateTilePayload = { type: 'diagonal', values: [0.25, 0.25, 0.5], tolerance: 0}
    client.calculateTile(payload)
    expect(mockEmit).toHaveBeenCalledWith('calculate_tile', payload)
  })

  // 3. onResult() correctly discriminates STLResult vs TokenResult
  describe('onResult()', () => {
    it('delivers an STLResult when stl_gz_b64 is present', () => {
      const handler = vi.fn()
      client.onResult(handler)

      // Simulate the server emitting a raw result with stl_gz_b64
      const rawStl = {
        filename: 'MSExtrd.stl',
        stl_gz_b64: 'base64data',
        timings: { client_to_server_ms: 5, time_processed_ms: 100, time_compress_ms: 10, time_parsed_ms: 8, overall_ms: 123 },
      }
      getHandler('result')(rawStl)

      expect(handler).toHaveBeenCalledOnce()
      const received = handler.mock.calls[0][0]
      expect(received.kind).toBe('stl')
      expect(received.stl_gz_b64).toBe('base64data')
      expect(received.filename).toBe('MSExtrd.stl')
    })

    it('delivers a TokenResult when stl_gz_b64 is absent', () => {
      const handler = vi.fn()
      client.onResult(handler)

      const rawToken = {
        filename: 'MSExtrd.stl',
        download_token: 'tok-abc-123',
      }
      getHandler('result')(rawToken)

      expect(handler).toHaveBeenCalledOnce()
      const received = handler.mock.calls[0][0]
      expect(received.kind).toBe('token')
      expect(received.download_token).toBe('tok-abc-123')
    })
  })

  // 4. onError() normalises both `msg` and `message` fields
  describe('onError()', () => {
    it('normalises a payload with `msg` field', () => {
      const handler = vi.fn()
      client.onError(handler)

      const errorCall = (mockOn as MockInstance).mock.calls.find(([e]) => e === 'error')
      const rawErrorHandler = errorCall?.[1]
      rawErrorHandler?.({ msg: 'Something went wrong' })

      expect(handler).toHaveBeenCalledWith({ message: 'Something went wrong' })
    })

    it('normalises a payload with `message` field', () => {
      const handler = vi.fn()
      client.onError(handler)

      const errorCall = (mockOn as MockInstance).mock.calls.find(([e]) => e === 'error')
      const rawErrorHandler = errorCall?.[1]
      rawErrorHandler?.({ message: 'DLL failure' })

      expect(handler).toHaveBeenCalledWith({ message: 'DLL failure' })
    })

    it('falls back to a default message when neither field is present', () => {
      const handler = vi.fn()
      client.onError(handler)

      const errorCall = (mockOn as MockInstance).mock.calls.find(([e]) => e === 'error')
      const rawErrorHandler = errorCall?.[1]
      rawErrorHandler?.({})

      expect(handler).toHaveBeenCalledWith({ message: 'Unknown server error' })
    })
  })

  // 5. Unsubscribe functions remove handlers
  it('onResult() returns an unsubscribe function that stops delivery', () => {
    const handler = vi.fn()
    const unsub = client.onResult(handler)

    unsub()

    // After unsubscribing, a raw result should NOT call the handler
    const rawStl = {
      filename: 'x.stl',
      stl_gz_b64: 'xyz',
      timings: { client_to_server_ms: null, time_processed_ms: 1, time_compress_ms: 1, time_parsed_ms: 1, overall_ms: 3 },
    }
    getHandler('result')(rawStl)

    expect(handler).not.toHaveBeenCalled()
  })

  it('onConnect() unsubscribes via the returned function', () => {
    const handler = vi.fn()
    const unsub = client.onConnect(handler)
    unsub()
    expect(mockOff).toHaveBeenCalledWith('connect', handler)
  })

  it('onDisconnect() unsubscribes via the returned function', () => {
    const handler = vi.fn()
    const unsub = client.onDisconnect(handler)
    unsub()
    expect(mockOff).toHaveBeenCalledWith('disconnect', handler)
  })
})
