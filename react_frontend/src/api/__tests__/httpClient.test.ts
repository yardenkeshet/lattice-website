import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { downloadResults, logCalculation } from '../httpClient'
import type { CalculateArgs } from '../types'

/* ─── Tests ─── */

describe('downloadResults()', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    // Spy on global fetch
    fetchSpy = vi.spyOn(globalThis, 'fetch')

    // Stub URL and anchor APIs used for triggering the download
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:mock-url'),
      revokeObjectURL: vi.fn(),
    })

    const mockAnchor = { href: '', download: '', click: vi.fn() }
    vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor as unknown as HTMLElement)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('POSTs to the correct URL with a form-encoded token', async () => {
    fetchSpy.mockResolvedValue(
      new Response(new Blob(['zip-content']), { status: 200 })
    )

    await downloadResults('tok-abc-123', 'stl')

    expect(fetchSpy).toHaveBeenCalledOnce()
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://localhost:5003/download-results')
    expect(init.method).toBe('POST')
    expect(init.body).toBeInstanceOf(URLSearchParams)
    expect((init.body as URLSearchParams).get('token')).toBe('tok-abc-123')
  })

  it('throws when the server returns a non-ok status', async () => {
    fetchSpy.mockResolvedValue(new Response('', { status: 400, statusText: 'Bad Request' }))

    await expect(downloadResults('bad-token','stl')).rejects.toThrow('Download failed: 400 Bad Request')
  })

  it('triggers a browser file download with filename results.zip', async () => {
    fetchSpy.mockResolvedValue(
      new Response(new Blob(['zip']), { status: 200 })
    )

    const anchorMock = { href: '', download: '', click: vi.fn() }
    vi.spyOn(document, 'createElement').mockReturnValue(anchorMock as unknown as HTMLElement)

    await downloadResults('tok-xyz', 'stl')

    expect(anchorMock.download).toBe('results.zip')
    expect(anchorMock.click).toHaveBeenCalledOnce()
  })
})

describe('logCalculation()', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const args: CalculateArgs = {
    tileType: 'cross', calcMode: 'revolution',
    nt1: 2, nt2: 2, nt3: 2, g1: 0.2, g2: 1.5, p1: 0.2, p2: 0, p3: 0.4,
  }

  it('POSTs the image and metadata as multipart form data', async () => {
    fetchSpy.mockResolvedValue(new Response('{"ok":true}', { status: 200 }))

    const blob = new Blob(['fake-png-bytes'], { type: 'image/png' })
    await logCalculation(blob, 'mypart.igs', args)

    expect(fetchSpy).toHaveBeenCalledOnce()
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://localhost:5003/log-calculation')
    expect(init.method).toBe('POST')
    const form = init.body as FormData
    expect(form.get('image')).toBe(blob)
    const metadata = JSON.parse(form.get('metadata') as string)
    expect(metadata.filename).toBe('mypart.igs')
    expect(metadata.args).toEqual(args)
  })

  it('throws when the server returns a non-ok status', async () => {
    fetchSpy.mockResolvedValue(new Response('', { status: 500, statusText: 'Internal Server Error' }))

    await expect(logCalculation(new Blob(['x']), 'f.igs', args))
      .rejects.toThrow('Calc log failed: 500')
  })
})
