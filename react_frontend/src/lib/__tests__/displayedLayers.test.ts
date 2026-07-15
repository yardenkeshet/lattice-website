import { describe, it, expect } from 'vitest'
import { computeDisplayedLayers, type SurfaceDisplayState } from '../displayedLayers'

const base: SurfaceDisplayState = {
  calcMode: 'extrusion',
  resultBlobUrl: undefined,
  uploadedBlobUrl: undefined,
  uploadedBlobUrl2: undefined,
  macroShapeBlobUrl: undefined,
}

describe('computeDisplayedLayers', () => {
  it('shows nothing before any file is uploaded', () => {
    expect(computeDisplayedLayers(base, [])).toEqual([])
  })

  it('single-file mode: does NOT show the surface alone while waiting for the macro shape', () => {
    const state = { ...base, uploadedBlobUrl: 'surf1' }
    // previous was empty (first upload) — must stay empty, not flash the surface alone
    expect(computeDisplayedLayers(state, [])).toEqual([])
  })

  it('single-file mode: shows surface + macro together once macro arrives', () => {
    const state = { ...base, uploadedBlobUrl: 'surf1', macroShapeBlobUrl: 'macro1' }
    expect(computeDisplayedLayers(state, [])).toEqual([
      { blobUrl: 'surf1' },
      { blobUrl: 'macro1', opacity: 0.25 },
    ])
  })

  it('single-file mode recalculation: freezes the previous render while macro is null again', () => {
    const previous = [{ blobUrl: 'surf1' }, { blobUrl: 'macro1', opacity: 0.25 }]
    const state = { ...base, uploadedBlobUrl: 'surf1', macroShapeBlobUrl: undefined }
    expect(computeDisplayedLayers(state, previous)).toBe(previous)
  })

  it('ruling mode: shows the first surface alone while the second is still missing', () => {
    const state: SurfaceDisplayState = { ...base, calcMode: 'ruling', uploadedBlobUrl: 'surf1' }
    expect(computeDisplayedLayers(state, [])).toEqual([{ blobUrl: 'surf1' }])
  })

  it('ruling mode: does not flash when the second surface arrives before the macro shape — freezes on the first', () => {
    const previous = [{ blobUrl: 'surf1' }]
    const state: SurfaceDisplayState = {
      ...base, calcMode: 'ruling', uploadedBlobUrl: 'surf1', uploadedBlobUrl2: 'surf2',
    }
    expect(computeDisplayedLayers(state, previous)).toBe(previous)
  })

  it('ruling mode: both files uploaded simultaneously — stays blank (not flashing two bare surfaces) until macro arrives', () => {
    const state: SurfaceDisplayState = {
      ...base, calcMode: 'ruling', uploadedBlobUrl: 'surf1', uploadedBlobUrl2: 'surf2',
    }
    expect(computeDisplayedLayers(state, [])).toEqual([])
  })

  it('ruling mode: shows both surfaces + macro together once ready', () => {
    const state: SurfaceDisplayState = {
      ...base, calcMode: 'ruling', uploadedBlobUrl: 'surf1', uploadedBlobUrl2: 'surf2', macroShapeBlobUrl: 'macro1',
    }
    expect(computeDisplayedLayers(state, [])).toEqual([
      { blobUrl: 'surf1' },
      { blobUrl: 'surf2' },
      { blobUrl: 'macro1', opacity: 0.25 },
    ])
  })

  it('a completed calculation result short-circuits everything else', () => {
    const state: SurfaceDisplayState = {
      ...base, uploadedBlobUrl: 'surf1', macroShapeBlobUrl: 'macro1', resultBlobUrl: 'result1',
    }
    expect(computeDisplayedLayers(state, [{ blobUrl: 'stale' }])).toEqual([{ blobUrl: 'result1' }])
  })

  it('clearing the uploaded file resets the display immediately (does not freeze)', () => {
    const previous = [{ blobUrl: 'surf1' }, { blobUrl: 'macro1', opacity: 0.25 }]
    // file cleared: uploadedBlobUrl back to undefined — this is the < requiredFiles branch,
    // which always updates immediately regardless of `previous`.
    expect(computeDisplayedLayers(base, previous)).toEqual([])
  })
})
