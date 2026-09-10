/** Fraction of the viewport the model should fill on auto-fit (65%). */
export const FILL_FRACTION = 0.95

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

/**
 * Perspective ↔ orthographic zoom-equivalence conversion.
 *
 * Used when the camera projection is toggled (perspective ⇄ orthographic)
 * so the model's apparent on-screen size doesn't jump. Both directions solve
 * for the same "visible half-height at the target distance" — the vertical
 * extent the camera actually shows — just expressed in the other
 * projection's terms:
 *   - perspective:  visibleHalfHeight = distance × tan(fovV / 2)
 *   - orthographic: visibleHalfHeight = frustumHalfH / zoom
 * Unlike perspectiveFitDistance/orthographicFitZoom above (which fit an
 * object of a given radius to fill a fraction of the viewport), these match
 * two cameras' *current* views exactly — no radius or fill fraction
 * involved, and only the vertical axis is used since that's the axis
 * orthographic `zoom` is defined against.
 */

/**
 * The orthographic `camera.zoom` that reproduces the same visible vertical
 * extent as a perspective camera at the given distance-to-target and FOV.
 *
 * @param distance      Perspective camera's distance to the orbit target.
 * @param fovDeg        Vertical FOV in degrees (PerspectiveCamera.fov).
 * @param frustumHalfH  Math.abs(camera.top) at zoom = 1.
 * @requires distance > 0 and frustumHalfH > 0; returns 0 for degenerate inputs.
 */
export function orthoZoomForPerspectiveDistance(
  distance: number,
  fovDeg: number,
  frustumHalfH: number,
): number {
  if (distance <= 0 || frustumHalfH <= 0) return 0
  const halfFovV = (fovDeg / 2) * (Math.PI / 180)
  const visibleHalfHeight = distance * Math.tan(halfFovV)
  if (visibleHalfHeight <= 0) return 0
  return frustumHalfH / visibleHalfHeight
}

/**
 * The perspective camera distance-to-target that reproduces the same
 * visible vertical extent as an orthographic camera at the given zoom.
 *
 * @param zoom          Orthographic camera's current `.zoom`.
 * @param frustumHalfH  Math.abs(camera.top) at zoom = 1.
 * @param fovDeg        Vertical FOV in degrees the perspective camera will use.
 * @requires zoom > 0 and frustumHalfH > 0; returns 0 for degenerate inputs.
 */
export function perspectiveDistanceForOrthoZoom(
  zoom: number,
  frustumHalfH: number,
  fovDeg: number,
): number {
  if (zoom <= 0 || frustumHalfH <= 0) return 0
  const visibleHalfHeight = frustumHalfH / zoom
  const halfFovV = (fovDeg / 2) * (Math.PI / 180)
  const t = Math.tan(halfFovV)
  if (t <= 0) return 0
  return visibleHalfHeight / t
}
