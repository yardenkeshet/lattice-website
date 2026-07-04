import * as React from 'react'
import { Canvas, useThree, useLoader } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import * as THREE from 'three'
import { perspectiveFitDistance, orthographicFitZoom } from '../lib/cameraFit'

/* ─── Public API ─── */

export interface MeshLayer {
  blobUrl: string
  /** Defaults to 1.0 (fully opaque). Values < 1 enable transparency automatically. */
  opacity?: number
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
  backgroundColor
}: ViewerSceneProps) {
  const [isDragOver, setIsDragOver] = React.useState(false)

  // Dynamic camera bases — updated when auto-fit fires.
  const [baseZ,         setBaseZ]         = React.useState(5)
  const [baseOrthoZoom, setBaseOrthoZoom] = React.useState(1)

  // Ref so the wheel handler always reads the latest zoom without a stale closure.
  const zoomRef = React.useRef(zoom)
  React.useEffect(() => { zoomRef.current = zoom }, [zoom])

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
      {isEmpty && !isDragOver && (
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

      {/* ── Three.js canvas — remounts when camera mode changes ── */}
      <Canvas
        key={cameraMode}
        frameloop="demand"
        style={{ width: '100%', height: '100%' }}
        camera={
          cameraMode === 'perspective'
            ? { position: [0, 0, 5], fov: 45 }
            : undefined
        }
        orthographic={cameraMode === 'orthographic'}
        gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
        onCreated={(state) => { canvasElRef.current = state.gl.domElement }}
      >
        <color attach="background" args={[backgroundColor]}/>
        <ambientLight intensity={0.4} />
        <directionalLight color={0xfff5e0} position={[5, 8, 6]} intensity={1.2} />
        <directionalLight color={0xffd9a0} position={[-6, 2, 4]} intensity={0.3} />
        <directionalLight color={0xffffff} position={[0, -4, -8]} intensity={0.25} />
        <directionalLight color={0xffeedd} position={[0, -8, 0]} intensity={0.2} />

        {/* Camera zoom controller — scales around the auto-fit base */}
        <CameraZoom zoom={zoom} mode={cameraMode} baseZ={baseZ} baseOrthoZoom={baseOrthoZoom} />

        {/* Mesh layers — first layer drives auto-fit */}
        {layers.filter(l => l.blobUrl).map((layer, i) => (
          <STLErrorBoundary key={layer.blobUrl}>
            <React.Suspense fallback={null}>
              <STLMesh
                url={layer.blobUrl}
                fitKey={i === 0 ? cameraResetKey : undefined}
                onFitDistance={i === 0 ? handleFitDistance : undefined}
                onFitOrthoZoom={i === 0 ? handleFitOrthoZoom : undefined}
                meshColor={meshColor}
                opacity={layer.opacity ?? 1}
              />
            </React.Suspense>
          </STLErrorBoundary>
        ))}

        <OrbitControls makeDefault enablePan enableZoom={true} />
      </Canvas>
    </div>
  )
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

/* ─── STL mesh loader ─── */

interface STLMeshProps {
  url: string
  fitKey?: string
  onFitDistance?:  (d: number) => void
  onFitOrthoZoom?: (z: number) => void
  meshColor: string
  opacity?: number
}

function STLMesh({ url, fitKey, onFitDistance, onFitOrthoZoom, meshColor, opacity = 1 }: STLMeshProps) {
  const geometry = useLoader(STLLoader, url)
  const meshRef = React.useRef<THREE.Mesh>(null)
  const { camera, invalidate } = useThree()
  const controls               = useThree(s => s.controls) as any

  const lastFitKeyRef   = React.useRef<string | undefined>(undefined)
  const prevGeometryRef = React.useRef<THREE.BufferGeometry | undefined>(undefined)

  React.useLayoutEffect(() => {
    if (!meshRef.current) return

    // 1. Reset to identity so the AABB is measured in raw local space.
    meshRef.current.position.set(0, 0, 0)
    meshRef.current.scale.setScalar(1)

    // 2. Measure raw local AABB.
    const box    = new THREE.Box3().setFromObject(meshRef.current)
    const center = box.getCenter(new THREE.Vector3())
    const size   = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    if (maxDim === 0) return

    // 3. Normalise: targetSize = 3 for main viewer.
    //    Correct formula: position = -center * s  →  worldCenter = 0 for any geometry.
    const s = 3 / maxDim
    meshRef.current.scale.setScalar(s)
    meshRef.current.position.set(-center.x * s, -center.y * s, -center.z * s)

    // 4. Auto-fit only when BOTH the geometry AND the fitKey are new.
    if (
      fitKey !== undefined &&
      geometry !== prevGeometryRef.current &&
      fitKey  !== lastFitKeyRef.current
    ) {
      lastFitKeyRef.current   = fitKey
      prevGeometryRef.current = geometry

      // Bounding sphere of the normalised mesh.
      const normBox = new THREE.Box3().setFromObject(meshRef.current)
      const sphere  = new THREE.Sphere()
      normBox.getBoundingSphere(sphere)
      const r = sphere.radius

      if (camera instanceof THREE.PerspectiveCamera) {
        const d = perspectiveFitDistance(r, camera.fov, camera.aspect)
        const az = Math.PI / 4  // 45° azimuth
        const el = Math.PI / 6  // 30° elevation
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
    invalidate()  // demand mode: trigger a frame after geometry/camera changes
  }, [geometry, fitKey, controls, onFitDistance, onFitOrthoZoom, invalidate]) // camera is stable in R3F (never replaced); eslint-disable-line react-hooks/exhaustive-deps

  return (
    <mesh ref={meshRef} geometry={geometry} castShadow>
      <meshPhongMaterial
        color={meshColor}
        specular={0x111111}
        shininess={50}
        side={THREE.DoubleSide}
        opacity={opacity}
        transparent={opacity < 1}
      />
    </mesh>
  )
}

/* ─── Icons & placeholder ─── */

function UploadCloudIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true" style={{ color: 'var(--text-tertiary)' }}>
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

export const ViewerScene = React.memo(ViewerSceneFn)
ViewerScene.displayName = 'ViewerScene'
