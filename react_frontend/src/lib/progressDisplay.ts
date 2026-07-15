import type { UpdatePayload } from '../api/types'

/**
 * The DLL's own progress callback only covers the "microstructure building"
 * phase. Writing output files and our own gzip compression happen afterward
 * with no progress reporting, so capping the DLL-driven percentage below
 * 100 avoids a false "done" signal during that silent tail — see
 * docs/superpowers/specs/2026-07-14-mentor-feedback-fixes-round2-design.md.
 */
export const DLL_PROGRESS_CAP = 90

export function calcLabelForUpdate(update: UpdatePayload): string {
  switch (update.type) {
    case 'progress_start':
      return update.message
    case 'progress_update': {
      const clamped = Math.min(100, Math.max(0, update.progress))
      const capped = Math.round(clamped * (DLL_PROGRESS_CAP / 100))
      return `Calculating… ${capped}%`
    }
    case 'progress_end':
      return 'Finalizing…'
    default:
      return 'Calculating…'
  }
}
