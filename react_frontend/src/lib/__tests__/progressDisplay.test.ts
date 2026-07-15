import { describe, it, expect } from 'vitest'
import { calcLabelForUpdate, DLL_PROGRESS_CAP } from '../progressDisplay'

describe('calcLabelForUpdate', () => {
  it('passes progress_start message through unchanged', () => {
    expect(calcLabelForUpdate({ type: 'progress_start', message: '[DLL] Building' }))
      .toBe('[DLL] Building')
  })

  it('caps progress_update at DLL_PROGRESS_CAP percent', () => {
    expect(calcLabelForUpdate({ type: 'progress_update', progress: 100 }))
      .toBe(`Calculating… ${DLL_PROGRESS_CAP}%`)
  })

  it('scales intermediate progress proportionally under the cap', () => {
    // 50% of the DLL phase → 50% of the cap
    expect(calcLabelForUpdate({ type: 'progress_update', progress: 50 }))
      .toBe(`Calculating… ${Math.round(DLL_PROGRESS_CAP * 0.5)}%`)
  })

  it('clamps out-of-range progress values into 0-100 before capping', () => {
    expect(calcLabelForUpdate({ type: 'progress_update', progress: 150 }))
      .toBe(`Calculating… ${DLL_PROGRESS_CAP}%`)
    expect(calcLabelForUpdate({ type: 'progress_update', progress: -10 }))
      .toBe('Calculating… 0%')
  })

  it('shows an indeterminate Finalizing state on progress_end, not 100%', () => {
    expect(calcLabelForUpdate({ type: 'progress_end', progress: 100 })).toBe('Finalizing…')
  })

  it('DLL_PROGRESS_CAP is below 100 so progress_update never itself claims done', () => {
    expect(DLL_PROGRESS_CAP).toBeLessThan(100)
    expect(DLL_PROGRESS_CAP).toBeGreaterThan(0)
  })
})
