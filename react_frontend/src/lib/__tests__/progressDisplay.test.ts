import { describe, it, expect } from 'vitest'
import { overlayPhraseIndex, CALCULATING_PHRASES, FINALIZING_PHRASES, OVERLAY_PHRASE_STEP_MS, calcLabelForQueueStatus } from '../progressDisplay'

describe('overlayPhraseIndex', () => {
  it('starts at the first phrase when no time has elapsed', () => {
    expect(overlayPhraseIndex(0, CALCULATING_PHRASES.length)).toBe(0)
  })

  it('advances one phrase per full step', () => {
    expect(overlayPhraseIndex(OVERLAY_PHRASE_STEP_MS, 5)).toBe(1)
    expect(overlayPhraseIndex(OVERLAY_PHRASE_STEP_MS * 2, 5)).toBe(2)
  })

  it('does not advance again until a full step has elapsed', () => {
    expect(overlayPhraseIndex(OVERLAY_PHRASE_STEP_MS + 100, 5)).toBe(1)
    expect(overlayPhraseIndex(OVERLAY_PHRASE_STEP_MS * 2 - 1, 5)).toBe(1)
  })

  it('caps at the last phrase and never loops back to the first', () => {
    expect(overlayPhraseIndex(OVERLAY_PHRASE_STEP_MS * 4, 5)).toBe(4)
    expect(overlayPhraseIndex(OVERLAY_PHRASE_STEP_MS * 999, 5)).toBe(4)
  })

  it('CALCULATING_PHRASES and FINALIZING_PHRASES are both non-empty', () => {
    expect(CALCULATING_PHRASES.length).toBeGreaterThan(0)
    expect(FINALIZING_PHRASES.length).toBeGreaterThan(0)
  })
})

describe('calcLabelForQueueStatus', () => {
  it('shows the position while waiting', () => {
    expect(calcLabelForQueueStatus({ state: 'waiting', position: 4, aheadCount: 3, silent: false }))
      .toBe("Site is busy — you're #4 in line")
  })

  it('falls back to the default calculating label once running', () => {
    expect(calcLabelForQueueStatus({ state: 'calculating', silent: false })).toBe('Calculating…')
  })
})
