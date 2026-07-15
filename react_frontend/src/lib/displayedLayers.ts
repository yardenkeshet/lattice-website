import type { MeshLayer } from '../components/ViewerScene'
import { CALC_MODE_DEFS, type CalcMode } from '../calculation_params'

export interface SurfaceDisplayState {
  calcMode: CalcMode
  resultBlobUrl?: string
  uploadedBlobUrl?: string
  uploadedBlobUrl2?: string
  macroShapeBlobUrl?: string
}

const MACRO_OPACITY = 0.25

/**
 * Decides what the viewer should show, given the current surface/macro
 * state and whatever was displayed last. Only updates the display once all
 * currently-obtainable information (surfaces + macro shape) is ready,
 * except while a mode needing multiple files still has fewer than required
 * — that partial state is the most that can be shown and always reflects
 * immediately. See docs/superpowers/specs/2026-07-14-mentor-feedback-fixes-round2-design.md
 * item 4 for the full rationale.
 */
export function computeDisplayedLayers(
  state: SurfaceDisplayState,
  previous: MeshLayer[],
): MeshLayer[] {
  const { calcMode, resultBlobUrl, uploadedBlobUrl, uploadedBlobUrl2, macroShapeBlobUrl } = state

  if (resultBlobUrl) return [{ blobUrl: resultBlobUrl }]

  const requiredFiles = CALC_MODE_DEFS[calcMode].requiredFilesCount
  const uploaded = [uploadedBlobUrl, uploadedBlobUrl2].filter((u): u is string => !!u)

  if (uploaded.length < requiredFiles) {
    return uploaded.map(blobUrl => ({ blobUrl }))
  }

  if (macroShapeBlobUrl) {
    return [...uploaded.map(blobUrl => ({ blobUrl })), { blobUrl: macroShapeBlobUrl, opacity: MACRO_OPACITY }]
  }

  // All required files are present but the macro shape isn't ready yet
  // (initial load or a recalculation in progress) — freeze on whatever was
  // shown before rather than flashing the bare surface(s).
  return previous
}
