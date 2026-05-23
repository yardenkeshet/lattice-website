import { describe, it, expect } from 'vitest'
import {
  FILL_FRACTION,
  perspectiveFitDistance,
  orthographicFitZoom,
} from '../cameraFit'

describe('perspectiveFitDistance', () => {
  it('returns a positive distance', () => {
    expect(perspectiveFitDistance(1.5, 45, 1)).toBeGreaterThan(0)
  })

  it('sphere fills exactly FILL_FRACTION of viewport half-height on a square canvas', () => {
    const r = 1.0
    const fovDeg = 45
    const d = perspectiveFitDistance(r, fovDeg, 1)
    const halfFovV = (fovDeg / 2) * (Math.PI / 180)
    const visibleHalfH = d * Math.tan(halfFovV)
    // r should equal FILL_FRACTION × visibleHalfH
    expect(r / visibleHalfH).toBeCloseTo(FILL_FRACTION, 5)
  })

  it('increases distance for a tall canvas (horizontal axis constrains)', () => {
    // aspect < 1 → halfFovH < halfFovV → horizontal constrains → more distance needed
    const d_tall   = perspectiveFitDistance(1, 45, 0.5)
    const d_square = perspectiveFitDistance(1, 45, 1.0)
    expect(d_tall).toBeGreaterThan(d_square)
  })

  it('wide canvas (aspect=2, fov=45°): vertical axis still constrains → same distance as square', () => {
    // aspect = 2 → halfFovH > halfFovV → vertical still constrains
    const d_wide   = perspectiveFitDistance(1, 45, 2)
    const d_square = perspectiveFitDistance(1, 45, 1)
    expect(d_wide).toBeCloseTo(d_square, 5)
  })

  it('larger fill fraction → shorter distance', () => {
    const d_tight = perspectiveFitDistance(1, 45, 1, 0.9)
    const d_loose = perspectiveFitDistance(1, 45, 1, 0.5)
    expect(d_tight).toBeLessThan(d_loose)
  })

  it('default fill equals FILL_FRACTION', () => {
    const r = 1.0, fovDeg = 45, aspect = 1
    expect(perspectiveFitDistance(r, fovDeg, aspect)).toBeCloseTo(
      perspectiveFitDistance(r, fovDeg, aspect, FILL_FRACTION), 10
    )
  })

  it('distance scales linearly with r', () => {
    const fovDeg = 45, aspect = 1
    const d1 = perspectiveFitDistance(1, fovDeg, aspect)
    const d2 = perspectiveFitDistance(2, fovDeg, aspect)
    expect(d2).toBeCloseTo(d1 * 2, 5)
  })

  it('returns 0 for degenerate inputs (r = 0)', () => {
    expect(perspectiveFitDistance(0, 45, 1)).toBe(0)
  })
})

describe('orthographicFitZoom', () => {
  it('returns a positive zoom', () => {
    expect(orthographicFitZoom(1.5, 10, 10)).toBeGreaterThan(0)
  })

  it('visible minHalf / r equals 1/FILL_FRACTION at the returned zoom', () => {
    const r     = 1.0
    const halfW = 10
    const halfH = 6   // minHalf = 6
    const zoom  = orthographicFitZoom(r, halfW, halfH)
    const visibleMinHalf = Math.min(halfW, halfH) / zoom
    expect(visibleMinHalf / r).toBeCloseTo(1 / FILL_FRACTION, 5)
  })

  it('larger sphere → smaller zoom (camera zooms out)', () => {
    const z_small = orthographicFitZoom(0.5, 10, 10)
    const z_large = orthographicFitZoom(2.0, 10, 10)
    expect(z_large).toBeLessThan(z_small)
  })

  it('uses the smaller frustum dimension as the constraint', () => {
    // halfH=4 is smaller than halfW=10, so it constrains
    const zoom_h_constrained = orthographicFitZoom(1, 10, 4)
    const zoom_w_constrained = orthographicFitZoom(1, 4, 10)
    expect(zoom_h_constrained).toBeCloseTo(zoom_w_constrained, 5)
  })

  it('default fill equals FILL_FRACTION', () => {
    const r = 1.0, halfW = 10, halfH = 10
    expect(orthographicFitZoom(r, halfW, halfH)).toBeCloseTo(
      orthographicFitZoom(r, halfW, halfH, FILL_FRACTION), 10
    )
  })

  it('returns 0 for degenerate inputs (r = 0)', () => {
    expect(orthographicFitZoom(0, 10, 10)).toBe(0)
  })
})
