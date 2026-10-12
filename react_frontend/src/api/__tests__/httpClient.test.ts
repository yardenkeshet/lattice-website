import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { convertIgsToObj, downloadResults, logCalculation } from '../httpClient'
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
      new Response(new Blob(['obj-content']), { status: 200 })
    )

    await downloadResults('tok-abc-123', 'obj')

    expect(fetchSpy).toHaveBeenCalledOnce()
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://localhost:5003/download-results')
    expect(init.method).toBe('POST')
    expect(init.body).toBeInstanceOf(URLSearchParams)
    expect((init.body as URLSearchParams).get('token')).toBe('tok-abc-123')
  })

  it('throws when the server returns a non-ok status', async () => {
    fetchSpy.mockResolvedValue(new Response('', { status: 400, statusText: 'Bad Request' }))

    await expect(downloadResults('bad-token','obj')).rejects.toThrow('Download failed: 400 Bad Request')
  })

  it('falls back to results.<fileType> when the server sends no Content-Disposition filename', async () => {
    fetchSpy.mockResolvedValue(
      new Response(new Blob(['obj-content']), { status: 200 })
    )

    const anchorMock = { href: '', download: '', click: vi.fn() }
    vi.spyOn(document, 'createElement').mockReturnValue(anchorMock as unknown as HTMLElement)

    await downloadResults('tok-xyz', 'obj')

    expect(anchorMock.download).toBe('results.obj')
    expect(anchorMock.click).toHaveBeenCalledOnce()
  })
})

describe('convertIgsToObj()', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('POSTs the file + tolerance to /convert_igs_to_obj and returns obj_b64', async () => {
    fetchSpy.mockResolvedValue(new Response('{"obj_b64":"b2JqLWJ5dGVz"}', { status: 200 }))

    const file = new File(['igs-bytes'], 'part.igs')
    const result = await convertIgsToObj(file, 0.5)

    expect(result).toBe('b2JqLWJ5dGVz')
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/\/convert_igs_to_obj$/)
    expect(init.method).toBe('POST')
    const form = init.body as FormData
    expect((form.get('file') as File).name).toBe('part.igs')
    expect(form.get('tolerance')).toBe('0.5')
  })

  it('throws with the server-provided error message on a non-ok status', async () => {
    fetchSpy.mockResolvedValue(new Response('{"error":"bad surface"}', { status: 400 }))

    await expect(convertIgsToObj(new File(['x'], 'bad.igs'))).rejects.toThrow('bad surface')
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
    expect(url).toMatch(/\/log-calculation$/)
    expect(init.method).toBe('POST')
    const form = init.body as FormData
    const imageEntry = form.get('image') as File
    expect(imageEntry.size).toBe(blob.size)
    expect(imageEntry.type).toBe(blob.type)
    expect(imageEntry.name).toBe('snapshot.png')
    const metadata = JSON.parse(form.get('metadata') as string)
    expect(metadata.filename).toBe('mypart.igs')
    expect(metadata.args).toEqual(args)
  })

  it('throws when the server returns a non-ok status', async () => {
    fetchSpy.mockResolvedValue(new Response('', { status: 500, statusText: 'Internal Server Error' }))

    await expect(logCalculation(new Blob(['x']), 'f.igs', args))
      .rejects.toThrow('Calc log failed: 500')
  })

  it('includes saved_input_paths in the metadata when provided', async () => {
    fetchSpy.mockResolvedValue(new Response('{"ok":true}', { status: 200 }))

    const blob = new Blob(['fake-png-bytes'], { type: 'image/png' })
    await logCalculation(blob, 'mypart.igs', args, ['client_data/sid1/abc_mypart.igs'])

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    const form = init.body as FormData
    const metadata = JSON.parse(form.get('metadata') as string)
    expect(metadata.saved_input_paths).toEqual(['client_data/sid1/abc_mypart.igs'])
  })

  it('defaults saved_input_paths to an empty array when omitted', async () => {
    fetchSpy.mockResolvedValue(new Response('{"ok":true}', { status: 200 }))

    const blob = new Blob(['fake-png-bytes'], { type: 'image/png' })
    await logCalculation(blob, 'mypart.igs', args)

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    const form = init.body as FormData
    const metadata = JSON.parse(form.get('metadata') as string)
    expect(metadata.saved_input_paths).toEqual([])
  })
})
