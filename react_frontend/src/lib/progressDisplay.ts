import type { QueueStatusPayload } from '../api/types'

/**
 * Which stage of a real "Calculate" request the full-screen
 * CalculationOverlay is currently representing. Driven entirely by
 * existing server signals — see ToolPage.tsx's socket-event handlers.
 * 'waiting' shows the real queue-position text (calcLabelForQueueStatus);
 * 'calculating'/'finalizing' cycle through a fabricated, non-percentage
 * phrase sequence instead — see the design spec
 * (docs/superpowers/specs/2026-09-22-calculation-overlay-design.md) for why.
 */
export type CalcOverlayPhase = 'waiting' | 'calculating' | 'finalizing'

/** Rotation interval for the overlay's phrase sequence, in milliseconds. */
export const OVERLAY_PHRASE_STEP_MS = 2500

export const CALCULATING_PHRASES = [
  'Reading your surfaces…',
  'Setting up the macro shape…',
  'Building the lattice microstructure…',
  'Assembling tiles…',
  'Still working — larger models take a bit longer…',
] as const

export const FINALIZING_PHRASES = [
  'Finalizing your model…',
  'Compressing the mesh…',
  'Preparing your preview…',
] as const

/**
 * Which phrase (by index into a phase's phrase list) should be showing
 * after `elapsedMs` since that phase began. Advances one phrase per full
 * `stepMs` and then holds on the last phrase — deliberately does not loop
 * back to the first, since the last phrase in each list is written as a
 * steady-state "still working" line, not something that makes sense to
 * cycle back through.
 */
export function overlayPhraseIndex(elapsedMs: number, phraseCount: number, stepMs: number = OVERLAY_PHRASE_STEP_MS): number {
  const raw = Math.floor(elapsedMs / stepMs)
  return Math.min(Math.max(raw, 0), phraseCount - 1)
}

/**
 * Label shown while a calculate request sits ahead of the "calculating"
 * state, waiting in the bounded server-side queue. This is real
 * information (an actual queue position), unlike the fabricated
 * CALCULATING_PHRASES/FINALIZING_PHRASES sequences above, so it's shown
 * verbatim rather than replaced with a generic phrase.
 */
export function calcLabelForQueueStatus(status: QueueStatusPayload): string {
  if (status.state === 'waiting') {
    return `Site is busy — you're #${status.position} in line`
  }
  return 'Calculating…'
}
