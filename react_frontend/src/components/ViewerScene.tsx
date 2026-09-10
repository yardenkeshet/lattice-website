import * as React from 'react'
import { Canvas, useThree, useLoader } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import * as THREE from 'three'
import {
  perspectiveFitDistance, orthographicFitZoom,
  orthoZoomForPerspectiveDistance, perspectiveDistanceForOrthoZoom,
} from '../lib/cameraFit'
import { ShadedMaterial } from './ShadedMaterial'
import { DEFAULT_SHADING_MODE, DEFAULT_SPECULAR_GRAY, DEFAULT_SHININESS, type ShadingMode } from '../lib/parameters'

/* ─── Public API ─── */

export interface MeshLayer {
  blobUrl: string
  /** Defaults to 1.0 (fully opaque). Values < 1 enable transparency automatically. */
  opacity?: number
}

/** Vertical FOV (degrees) used by the perspective camera — kept as a named
 *  constant since it's also needed by the perspective↔orthographic zoom
 *  conversion in CameraToggleRestore, not just the Canvas's `camera` prop. */
const PERSPECTIVE_FOV_DEG = 45

/**
 * A snapshot of the live camera's transform, captured just before a
 * perspective↔orthographic toggle (which remounts the Canvas) so the new
 * camera can be initialized to match instead of resetting to the default fit.
 * `distance`/`zoom`/`frustumHalfH` are mode-specific: only the pair matching
 * `mode` is populated, since that's what the conversion math needs.
 */
export interface CameraSnapshot {
  mode: 'perspective' | 'orthographic'
  /** Camera position, world space. */
  position: THREE.Vector3
  /** OrbitControls' look-at pivot, world space. */
  target: THREE.Vector3
  /** Distance from position to target. Present when mode === 'perspective'. */
  distance?: number
  /** camera.zoom. Present when mode === 'orthographic'. */
  zoom?: number
  /** camera.top at zoom = 1. Present when mode === 'orthographic'. */
  frustumHalfH?: number
}

export interface ViewerSceneHandle {
  /** Reads the live camera/controls transform right now, or null if the
   *  canvas hasn't mounted a camera/controls pair yet. */
  getCameraSnapshot: () => CameraSnapshot | null
}

export interface ViewerSceneProps {
  /** Mesh layers to render. First layer drives auto-fit. */
  layers?: MeshLayer[]
  /** 'perspective' (default) or 'orthographic'. */
  cameraMode?: 'perspective' | 'orthographic'
  /** Zoom level. 100 = default, range 10–500. */
  zoom?: number
  /** Called when user drops a .igs file onto the canvas. */
  onFileDrop?: (file: File) => void
  /** Called when the user scrolls over the viewer to zoom. */
  onZoomChange?: (zoom: number) => void
  /**
   * Called once after the camera finishes auto-fitting to a newly loaded
   * mesh. Receives the underlying canvas DOM element for snapshot capture.
   */
  onAutoFitComplete?: (canvas: HTMLCanvasElement | null) => void
  /**
   * Opaque string controlled by the parent. When this key changes the camera
   * resets to its default position.
   */
  cameraResetKey?: string
  className?: string
  style?: React.CSSProperties
  meshColor: string
  backgroundColor: string
  showDropHint?: boolean
  shadingMode?: ShadingMode
  specularGray?: number
  shininess?: number
  /** When true, suppresses the "Drop a .igs file here" empty-state placeholder
   *  even if `layers` is empty — used while a file is uploaded but its
   *  display is intentionally frozen pending a macro-shape recalculation. */
  hideEmptyPlaceholder?: boolean
  /** A camera snapshot captured (via the ref handle) just before a
   *  perspective↔orthographic toggle. Applied once, to the freshly remounted
   *  camera, so the toggle preserves position/rotation/zoom instead of
   *  resetting to the default fit. `null`/omitted on every other mount. */
  pendingCameraSnapshot?: CameraSnapshot | null
}

const ACCEPTED_EXTS = new Set(['.igs'])

const SCROLL_ZOOM_STEP = 10
const SCROLL_ZOOM_MIN  = 10
const SCROLL_ZOOM_MAX  = 500

class STLErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false }
  static getDerivedStateFromError() { return { hasError: true } }
  render() {
    return this.state.hasError ? null : this.props.children
  }
}

function ViewerSceneFn({
  layers = [],
  cameraMode = 'perspective',
  zoom = 100,
  cameraResetKey,
  onFileDrop,
  onZoomChange,
  onAutoFitComplete,
  className,
  style,
  meshColor,
  backgroundColor,
  showDropHint = false,
  shadingMode = DEFAULT_SHADING_MODE,
  specularGray = DEFAULT_SPECULAR_GRAY,
  shininess = DEFAULT_SHININESS,
  hideEmptyPlaceholder = false,
  pendingCameraSnapshot = null,
}: ViewerSceneProps, ref: React.Ref<ViewerSceneHandle>) {
  const [isDragOver, setIsDragOver] = React.useState(false)

  // Dynamic camera bases — updated when auto-fit fires.
  const [baseZ,         setBaseZ]         = React.useState(5)
  const [baseOrthoZoom, setBaseOrthoZoom] = React.useState(1)

  // Live camera/controls, tracked by CameraStateTracker (inside the Canvas)
  // so getCameraSnapshot() can read them imperatively — a toggle click needs
  // the CURRENT transform synchronously, before the Canvas remounts.
  const liveCameraRef   = React.useRef<THREE.Camera | null>(null)
  const liveControlsRef = React.useRef<{ target: THREE.Vector3 } | null>(null)

  React.useImperativeHandle(ref, () => ({
    getCameraSnapshot: (): CameraSnapshot | null => {
      const camera   = liveCameraRef.current
      const controls = liveControlsRef.current
      if (!camera || !controls) return null
      const position = camera.position.clone()
      const target   = controls.target.clone()
      if (cameraMode === 'orthographic') {
        const orthoCam = camera as THREE.OrthographicCamera
        return { mode: 'orthographic', position, target, zoom: orthoCam.zoom, frustumHalfH: orthoCam.top }
      }
      return { mode: 'perspective', position, target, distance: position.distanceTo(target) }
    },
  }), [cameraMode])

  // Ref so the wheel handler always reads the latest zoom without a stale closure.
  const zoomRef = React.useRef(zoom)
  React.useEffect(() => { zoomRef.current = zoom }, [zoom])

  const macroLayerUrl = layers.length > 1 ? layers[layers.length - 1].blobUrl : undefined

  // Shared normalization for preview mode. Keyed by macroLayerUrl so it resets automatically
  // when a new file loads — no separate useEffect needed.
  const [previewNormEntry, setPreviewNormEntry] = React.useState<{ url: string | undefined; scale: number; center: THREE.Vector3 } | null>(null)
  const previewNorm = previewNormEntry?.url === macroLayerUrl ? previewNormEntry : null

  const handlePreviewNorm = React.useCallback((scale: number, center: THREE.Vector3) => {
    setPreviewNormEntry({ url: macroLayerUrl, scale, center })
  }, [macroLayerUrl])

  // Holds the actual <canvas> DOM element once R3F creates the renderer.
  const canvasElRef = React.useRef<HTMLCanvasElement | null>(null)

  // Container ref for attaching the wheel listener with passive:false.
  const containerRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const el = containerRef.current
    if (!el || !onZoomChange) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? -SCROLL_ZOOM_STEP : SCROLL_ZOOM_STEP
      onZoomChange(Math.min(SCROLL_ZOOM_MAX, Math.max(SCROLL_ZOOM_MIN, zoomRef.current + delta)))
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [onZoomChange])

  // Called by STLMesh after a perspective auto-fit.
  const handleFitDistance = React.useCallback((d: number) => {
    setBaseZ(d)
    onZoomChange?.(100)
    onAutoFitComplete?.(canvasElRef.current)
  }, [onZoomChange, onAutoFitComplete])

  // Called by STLMesh after an orthographic auto-fit.
  const handleFitOrthoZoom = React.useCallback((z: number) => {
    setBaseOrthoZoom(z)
    onZoomChange?.(100)
    onAutoFitComplete?.(canvasElRef.current)
  }, [onZoomChange, onAutoFitComplete])

  const isEmpty = layers.length === 0

  /* ── Drag-and-drop handlers ── */
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }
  const handleDragLeave = () => setIsDragOver(false)
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (!file) return
    const ext = '.' + file.name.split('.').pop()?.toLowerCase()
    if (!ACCEPTED_EXTS.has(ext)) return
    onFileDrop?.(file)
  }

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: 'var(--bg-secondary)',
        // Use border (not outline) so the dashed frame is part of the box model,
        // consistent with the spec. Transparent sentinel keeps transitions smooth.
        // Note: the clear button is at top:8/right:8 (inside) rather than -10/-10
        // (on the frame edge) because parent containers have overflow:hidden.
        border: isDragOver
          ? '2px dashed var(--border-focus)'
          : !isEmpty
            ? '2px dashed var(--border-base)'
            : '2px solid transparent',
        transition: 'border-color 150ms ease',
        ...style,
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* ── Empty placeholder ── */}
      {isEmpty && !isDragOver && !hideEmptyPlaceholder && (
        <div style={placeholderStyle}>
          <UploadCloudIcon />
          <span style={placeholderTextStyle}>
            Drop a .igs file here
          </span>
        </div>
      )}

      {isDragOver && (
        <div style={dragOverlayStyle}>
          <UploadCloudIcon />
          <span style={placeholderTextStyle}>Drop to load</span>
        </div>
      )}

      {showDropHint && !isEmpty && (
        <div style={dropHintBarStyle}>
          <UploadCloudIcon size={16} />
          <span style={placeholderTextStyle}>Drop .igs file here to load a surface</span>
        </div>
      )}

      {/* ── Three.js canvas — remounts when camera mode changes ── */}
      <Canvas
        key={cameraMode}
        frameloop="demand"
        style={{ width: '100%', height: '100%' }}
        camera={
          cameraMode === 'perspective'
            ? { position: [0, 0, 5], fov: PERSPECTIVE_FOV_DEG }
            : undefined
        }
        orthographic={cameraMode === 'orthographic'}
        gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
        onCreated={(state) => { canvasElRef.current = state.gl.domElement }}
      >
        {/* Tracks the live camera/controls into refs so getCameraSnapshot()
            (called imperatively, outside React's render cycle) always reads
            the current transform. */}
        <CameraStateTracker cameraRef={liveCameraRef} controlsRef={liveControlsRef} />

        <color attach="background" args={[backgroundColor]}/>
        <ambientLight intensity={0.4} />
        <directionalLight color={0xfff5e0} position={[5, 8, 6]} intensity={1.2} />
        <directionalLight color={0xffd9a0} position={[-6, 2, 4]} intensity={0.3} />
        <directionalLight color={0xffffff} position={[0, -4, -8]} intensity={0.25} />
        <directionalLight color={0xffeedd} position={[0, -8, 0]} intensity={0.2} />

        {/* Camera zoom controller — scales around the auto-fit base */}
        <CameraZoom zoom={zoom} mode={cameraMode} baseZ={baseZ} baseOrthoZoom={baseOrthoZoom} />

        {/* Forces a repaint whenever the layer set itself changes (added, removed,
            reordered, or opacity changed) — belt-and-suspenders on top of R3F's own
            reconciler-driven invalidation so a removed mesh can never linger on
            screen under frameloop="demand". */}
        <LayersInvalidator layers={layers} />

        {/* Mesh layers.
            Single-layer (result mode): layer 0 drives auto-fit, independent normalization.
            Multi-layer (preview mode): last layer is the macro shape — it drives auto-fit and
            publishes its norm; all other layers receive externalNorm and are hidden until it arrives. */}
        {(() => {
          const filtered = layers.filter(l => l.blobUrl)
          const isMultiLayer = filtered.length > 1
          return filtered.map((layer, i) => {
            const isMacroLayer = isMultiLayer && i === filtered.length - 1
            const isFitLayer   = isMacroLayer || (!isMultiLayer && i === 0)
            // Suppress the auto-fit entirely on a toggle-triggered remount
            // (pendingCameraSnapshot set) rather than letting it run and
            // relying on CameraToggleRestore to override it afterward — its
            // onFitDistance/onFitOrthoZoom callbacks would otherwise update
            // baseZ/baseOrthoZoom state, triggering a second render in which
            // CameraZoom re-fires and corrupts an orbited camera (see
            // CameraToggleRestore's comment).
            const fitKey = isFitLayer && !pendingCameraSnapshot ? cameraResetKey : undefined
            return (
              <STLErrorBoundary key={layer.blobUrl}>
                <React.Suspense fallback={null}>
                  <STLMesh
                    url={layer.blobUrl}
                    fitKey={fitKey}
                    onFitDistance={isFitLayer ? handleFitDistance : undefined}
                    onFitOrthoZoom={isFitLayer ? handleFitOrthoZoom : undefined}
                    meshColor={meshColor}
                    opacity={layer.opacity ?? 1}
                    externalNorm={isMultiLayer && !isMacroLayer ? previewNorm : undefined}
                    onNormalized={isMacroLayer ? handlePreviewNorm : undefined}
                    shadingMode={shadingMode}
                    specularGray={specularGray}
                    shininess={shininess}
                  />
                </React.Suspense>
              </STLErrorBoundary>
            )
          })
        })()}

        <OrbitControls makeDefault enablePan enableZoom={true} />

        {/* Last child so its layout effect runs after OrbitControls has
            registered itself, giving the restored position/target/zoom
            final say. STLMesh's own auto-fit is suppressed for this mount
            (see fitKey below) rather than merely out-ordered — letting it
            run and reapplying afterward isn't enough, since its onFitDistance/
            onFitOrthoZoom callbacks update baseZ/baseOrthoZoom state, which
            triggers a second render where CameraZoom re-fires and stomps
            just the z/zoom component of an orbited camera, corrupting it. */}
        <CameraToggleRestore
          snapshot={pendingCameraSnapshot}
          mode={cameraMode}
        />
      </Canvas>
    </div>
  )
}


/* ─── Live camera/controls tracker ───
   Mirrors R3F's default camera + drei's OrbitControls into refs owned by the
   parent (outside the Canvas), so ViewerScene's imperative handle can read
   the current transform synchronously from an event handler. */

function CameraStateTracker({
  cameraRef,
  controlsRef,
}: {
  cameraRef: React.MutableRefObject<THREE.Camera | null>
  controlsRef: React.MutableRefObject<{ target: THREE.Vector3 } | null>
}) {
  const camera   = useThree(s => s.camera)
  const controls = useThree(s => s.controls)

  React.useEffect(() => { cameraRef.current = camera }, [camera, cameraRef])
  React.useEffect(() => {
    controlsRef.current = (controls as unknown as { target: THREE.Vector3 } | null) ?? null
  }, [controls, controlsRef])

  return null
}

/* ─── Camera toggle restore ───
   Applies a CameraSnapshot (captured from the *other* mode, just before the
   Canvas remounted) to the freshly created camera + controls, converting
   zoom between projections so the model's apparent size doesn't jump.
   Position/target copy across directly — only zoom needs the conversion,
   since perspective and orthographic express it differently. */

function CameraToggleRestore({
  snapshot,
  mode,
}: {
  snapshot: CameraSnapshot | null
  mode: 'perspective' | 'orthographic'
}) {
  const camera     = useThree(s => s.camera)
  const controls   = useThree(s => s.controls) as { target: THREE.Vector3; update: () => void } | null
  const invalidate = useThree(s => s.invalidate)
  const appliedRef = React.useRef(false)

  React.useLayoutEffect(() => {
    if (appliedRef.current || !snapshot || !controls) return
    appliedRef.current = true

    controls.target.copy(snapshot.target)

    if (mode === 'orthographic') {
      const orthoCam = camera as THREE.OrthographicCamera
      orthoCam.position.copy(snapshot.position)
      const newZoom = snapshot.mode === 'perspective'
        ? orthoZoomForPerspectiveDistance(snapshot.distance!, PERSPECTIVE_FOV_DEG, orthoCam.top)
        : snapshot.zoom!
      if (newZoom > 0) orthoCam.zoom = newZoom
      orthoCam.lookAt(snapshot.target)
      orthoCam.updateProjectionMatrix()
    } else {
      const perspCam = camera as THREE.PerspectiveCamera
      if (snapshot.mode === 'orthographic') {
        const direction = snapshot.position.clone().sub(snapshot.target).normalize()
        const newDistance = perspectiveDistanceForOrthoZoom(snapshot.zoom!, snapshot.frustumHalfH!, PERSPECTIVE_FOV_DEG)
        perspCam.position.copy(snapshot.target)
        perspCam.position.addScaledVector(direction, newDistance > 0 ? newDistance : snapshot.position.distanceTo(snapshot.target))
      } else {
        perspCam.position.copy(snapshot.position)
      }
      perspCam.zoom = 1
      perspCam.lookAt(snapshot.target)
      perspCam.updateProjectionMatrix()
    }

    controls.update()
    invalidate()
  }, [snapshot, mode, camera, controls, invalidate])

  return null
}

/* ─── Camera zoom controller ─── */

function CameraZoom({
  zoom,
  mode,
  baseZ,
  baseOrthoZoom,
}: {
  zoom: number
  mode: string
  baseZ: number
  baseOrthoZoom: number
}) {
  const { camera, invalidate } = useThree()

  React.useLayoutEffect(() => {
    const factor = zoom / 100
    if (factor <= 0) return  // guard: zoom must be positive
    if (mode === 'orthographic') {
      // baseOrthoZoom = camera.zoom at zoom=100 (set by auto-fit).
      // Multiplying by factor lets the user zoom in/out from the fitted position.
      camera.zoom = baseOrthoZoom * factor
      camera.updateProjectionMatrix()
    } else {
      // baseZ = camera.position.z at zoom=100 (set by auto-fit).
      // Dividing by factor moves camera closer (zoom in) or further (zoom out).
      const perspCam = camera as THREE.PerspectiveCamera
      perspCam.position.z = baseZ / factor
      perspCam.updateProjectionMatrix()
    }
    invalidate()  // demand mode: trigger a frame after camera update
  }, [zoom, mode, camera, baseZ, baseOrthoZoom, invalidate])

  return null
}

/* ─── Layers invalidator ───
   Forces a repaint whenever the layer set itself changes, independent of any
   individual STLMesh's own effects — so a removed layer can't leave a stale
   frame on screen under frameloop="demand". */

function LayersInvalidator({ layers }: { layers: MeshLayer[] }) {
  const invalidate = useThree(s => s.invalidate)
  const layersKey = layers.map(l => `${l.blobUrl}:${l.opacity ?? 1}`).join('|')

  React.useEffect(() => {
    invalidate()
  }, [layersKey, invalidate])

  return null
}

/* ─── STL mesh loader ─── */

interface STLMeshProps {
  url: string
  fitKey?: string
  onFitDistance?:  (d: number) => void
  onFitOrthoZoom?: (z: number) => void
  meshColor: string
  opacity?: number
  externalNorm?: { scale: number; center: THREE.Vector3 } | null
  onNormalized?: (scale: number, center: THREE.Vector3) => void
  shadingMode?: ShadingMode
  specularGray?: number
  shininess?: number
}

function STLMesh({
  url, fitKey, onFitDistance, onFitOrthoZoom, meshColor, opacity = 1, externalNorm, onNormalized,
  shadingMode = DEFAULT_SHADING_MODE, specularGray = DEFAULT_SPECULAR_GRAY, shininess = DEFAULT_SHININESS,
}: STLMeshProps) {
  const geometry = useLoader(STLLoader, url)
  const meshRef = React.useRef<THREE.Mesh>(null)
  const { camera, invalidate } = useThree()
  const controls               = useThree(s => s.controls) as any

  const lastFitKeyRef   = React.useRef<string | undefined>(undefined)
  const prevGeometryRef = React.useRef<THREE.BufferGeometry | undefined>(undefined)

  React.useLayoutEffect(() => {
    if (!meshRef.current) return

    // External norm provided: skip own bbox computation.
    if (externalNorm !== undefined) {
      if (externalNorm === null) {
        // Hide until the macro norm is ready.
        meshRef.current.visible = false
      } else {
        const { scale, center } = externalNorm
        meshRef.current.position.set(0, 0, 0)
        meshRef.current.scale.setScalar(1)
        meshRef.current.scale.setScalar(scale)
        meshRef.current.position.set(-center.x * scale, -center.y * scale, -center.z * scale)
        meshRef.current.visible = true
      }
      invalidate()
      return
    }

    // Standard independent normalization (externalNorm is undefined).
    meshRef.current.position.set(0, 0, 0)
    meshRef.current.scale.setScalar(1)

    const box    = new THREE.Box3().setFromObject(meshRef.current)
    const center = box.getCenter(new THREE.Vector3())
    const size   = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    if (maxDim === 0) return

    const s = 3 / maxDim
    meshRef.current.scale.setScalar(s)
    meshRef.current.position.set(-center.x * s, -center.y * s, -center.z * s)

    onNormalized?.(s, center)

    // Auto-fit only when BOTH the geometry AND the fitKey are new.
    if (
      fitKey !== undefined &&
      geometry !== prevGeometryRef.current &&
      fitKey  !== lastFitKeyRef.current
    ) {
      lastFitKeyRef.current   = fitKey
      prevGeometryRef.current = geometry

      const normBox = new THREE.Box3().setFromObject(meshRef.current)
      const sphere  = new THREE.Sphere()
      normBox.getBoundingSphere(sphere)
      const r = sphere.radius

      if (camera instanceof THREE.PerspectiveCamera) {
        const d = perspectiveFitDistance(r, camera.fov, camera.aspect)
        const az = Math.PI / 4
        const el = Math.PI / 6
        camera.position.set(
          d * Math.cos(el) * Math.sin(az),
          d * Math.sin(el),
          d * Math.cos(el) * Math.cos(az),
        )
        camera.lookAt(0, 0, 0)
        controls?.target?.set(0, 0, 0)
        controls?.update?.()
        if (d > 0) onFitDistance?.(d)
      } else if (camera instanceof THREE.OrthographicCamera) {
        const z = orthographicFitZoom(r, Math.abs(camera.right), Math.abs(camera.top))
        const az = Math.PI / 4
        const el = Math.PI / 6
        camera.position.set(
          10 * Math.cos(el) * Math.sin(az),
          10 * Math.sin(el),
          10 * Math.cos(el) * Math.cos(az),
        )
        camera.lookAt(0, 0, 0)
        camera.zoom = z
        camera.updateProjectionMatrix()
        controls?.target?.set(0, 0, 0)
        controls?.update?.()
        if (z > 0) onFitOrthoZoom?.(z)
      }
    }
    invalidate()
  }, [geometry, fitKey, controls, onFitDistance, onFitOrthoZoom, invalidate, externalNorm, onNormalized]) // camera is stable in R3F (never replaced); eslint-disable-line react-hooks/exhaustive-deps

  return (
    <mesh ref={meshRef} geometry={geometry} castShadow>
      <ShadedMaterial
        mode={shadingMode}
        color={meshColor}
        specularGray={specularGray}
        shininess={shininess}
        side={THREE.DoubleSide}
        opacity={opacity}
      />
    </mesh>
  )
}

/* ─── Icons & placeholder ─── */

function UploadCloudIcon({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true" style={{ color: 'var(--text-tertiary)' }}>
      <path d="M32 32l-8-8-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M24 24v18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M40.3 36.3A10 10 0 0 0 36 18h-2.5A16 16 0 1 0 8 33.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/* ─── Styles ─── */

const placeholderStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 'var(--space-md)',
  pointerEvents: 'none',
  zIndex: 1,
}

const dragOverlayStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 'var(--space-md)',
  backgroundColor: 'rgba(4, 107, 210, 0.08)',
  zIndex: 10,
  pointerEvents: 'none',
}

const placeholderTextStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-size-sm)',
  color: 'var(--text-tertiary)',
  textAlign: 'center',
  lineHeight: 1.5,
}

const dropHintBarStyle: React.CSSProperties = {
  position: 'absolute',
  top: 44,
  left: 0,
  right: 0,
  height: 30,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  backgroundColor: 'rgba(255, 255, 255, 0.72)',
  backdropFilter: 'blur(4px)',
  zIndex: 2,
  pointerEvents: 'none',
}

export const ViewerScene = React.memo(React.forwardRef(ViewerSceneFn))
ViewerScene.displayName = 'ViewerScene'
