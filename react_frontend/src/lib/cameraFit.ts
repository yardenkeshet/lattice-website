/** Fraction of the viewport the model should fill on auto-fit (65%). */
export const FILL_FRACTION = 0.65

/**
 * Computes the camera distance along +Z so that a sphere of radius `r`
 * centred at the origin fills `fill` fraction of the viewport.
 *
 * Uses min(verticalHalfFOV, horizontalHalfFOV) so wide and tall canvases
 * both fit correctly.
 *
 * @param r      Bounding-sphere radius of the normalised mesh.
 * @param fovDeg Vertical FOV in degrees (PerspectiveCamera.fov).
 * @param aspect Canvas width ÷ height (PerspectiveCamera.aspect).
 * @param fill   Desired fill fraction (default 0.65).
 * @requires r > 0 and fill > 0; returns 0 for degenerate inputs.
 */
export function perspectiveFitDistance(
  r: number,
  fovDeg: number,
  aspect: number,
  fill = FILL_FRACTION,
): number {
  if (r <= 0 || fill <= 0) return 0
  const halfFovV = (fovDeg / 2) * (Math.PI / 180)
  const halfFovH = Math.atan(Math.tan(halfFovV) * aspect)
  const halfFov  = Math.min(halfFovV, halfFovH)
  return r / (fill * Math.tan(halfFov))
}

/**
 * Computes the camera.zoom value so that a sphere of radius `r`
 * fills `fill` fraction of the orthographic viewport.
 *
 * Formula: zoom = fill × minHalf / r
 * At this zoom: visible minHalf = minHalf / zoom = r / fill  →  r fills `fill` fraction.
 *
 * @param r             Bounding-sphere radius of the normalised mesh.
 * @param frustumHalfW  Math.abs(camera.right)  at zoom = 1.
 * @param frustumHalfH  Math.abs(camera.top)    at zoom = 1.
 * @param fill          Desired fill fraction (default 0.65).
 * @requires r > 0 and fill > 0; returns 0 for degenerate inputs.
 */
export function orthographicFitZoom(
  r: number,
  frustumHalfW: number,
  frustumHalfH: number,
  fill = FILL_FRACTION,
): number {
  if (r <= 0 || fill <= 0) return 0
  const minHalf = Math.min(frustumHalfW, frustumHalfH)
  return (fill * minHalf) / r
}
