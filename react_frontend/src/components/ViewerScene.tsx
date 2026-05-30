import * as React from 'react'
import { Canvas, useThree, useLoader } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import * as THREE from 'three'
import { useStlBlobUrl } from '../lib/stl'
import { perspectiveFitDistance, orthographicFitZoom } from '../lib/cameraFit'

/* ─── Public API ─── */

export interface ViewerSceneProps {
  /**
   * Raw 3D file selected via the Add button or drag-dropped onto the viewer.
   * Displayed as-is (the source mesh before lattice generation).
   */
  uploadedFile?: File | null
  /**
   * base64( gzip( ASCII-STL ) ) — calculated lattice result from the server.
   * When present, takes priority over uploadedFile.
   */
  resultStlGzB64?: string | null
  /** 'perspective' (default) or 'orthographic'. */
  cameraMode?: 'perspective' | 'orthographic'
  /** Zoom level. 100 = default, range 10–500. */
  zoom?: number
  /** Called when user drops a 3D file onto the canvas. */
  onFileDrop?: (file: File) => void
  /** Called when the user scrolls over the viewer to zoom. */
  onZoomChange?: (zoom: number) => void
  /** Called when the user clicks the clear button. Clears the loaded content. */
  onClear?: () => void
  /**
   * Opaque string controlled by the parent. When this key changes the camera
   * resets to its default position. Unchanged on tile-param recalculations so
   * the user's orbit/zoom is preserved across param tweaks.
   */
  cameraResetKey?: string
  className?: string
  style?: React.CSSProperties
}

const ACCEPTED_EXTS = new Set(['.igs'])

const SCROLL_ZOOM_STEP = 10
const SCROLL_ZOOM_MIN  = 10
const SCROLL_ZOOM_MAX  = 500

export function ViewerScene({
  uploadedFile = null,
  resultStlGzB64 = null,
  cameraMode = 'perspective',
  zoom = 100,
  cameraResetKey,
  onFileDrop,
  onZoomChange,
  onClear,
  className,
  style,
}: ViewerSceneProps) {
  const [isDragOver, setIsDragOver] = React.useState(false)

  // Dynamic camera bases — updated when auto-fit fires.
  const [baseZ,         setBaseZ]         = React.useState(5)
  const [baseOrthoZoom, setBaseOrthoZoom] = React.useState(1)

  // Ref so the wheel handler always reads the latest zoom without a stale closure.
  const zoomRef = React.useRef(zoom)
  React.useEffect(() => { zoomRef.current = zoom }, [zoom])

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
  }, [onZoomChange])

  // Called by STLMesh after an orthographic auto-fit.
  const handleFitOrthoZoom = React.useCallback((z: number) => {
    setBaseOrthoZoom(z)
    onZoomChange?.(100)
  }, [onZoomChange])

  /* Convert gz+b64 result to a Blob URL */
  const resultBlobUrl = useStlBlobUrl(resultStlGzB64)

  /* Convert raw File to a Blob URL */
  const [uploadedBlobUrl, setUploadedBlobUrl] = React.useState<string | undefined>()
  React.useEffect(() => {
    if (!uploadedFile) { setUploadedBlobUrl(undefined); return }
    const url = URL.createObjectURL(uploadedFile)
    setUploadedBlobUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [uploadedFile])

  /* Result takes priority over upload */
  const activeUrl = resultBlobUrl ?? uploadedBlobUrl
  const isEmpty = !activeUrl

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
            Drop a .igs file here,<br />or use the + button above
          </span>
        </div>
      )}

      {isDragOver && (
        <div style={dragOverlayStyle}>
          <UploadCloudIcon />
          <span style={placeholderTextStyle}>Drop to load</span>
        </div>
      )}

      {/* ── Clear button — top-right, only when content is loaded ── */}
      {!isEmpty && onClear && (
        <button
          type="button"
          aria-label="Clear viewer"
          onClick={e => { e.stopPropagation(); onClear() }}
          style={clearButtonStyle}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
            <path d="M2 2l6 6M8 2L2 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
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
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[4, 5, 4]} intensity={0.9} />
        <directionalLight position={[-3, -2, -3]} intensity={0.25} />

        {/* Camera zoom controller — scales around the auto-fit base */}
        <CameraZoom zoom={zoom} mode={cameraMode} baseZ={baseZ} baseOrthoZoom={baseOrthoZoom} />

        {/* Mesh — auto-fit fires inside STLMesh when both fitKey and geometry are new */}
        <React.Suspense fallback={null}>
          {activeUrl && (
            <STLMesh
              url={activeUrl}
              fitKey={cameraResetKey}
              onFitDistance={handleFitDistance}
              onFitOrthoZoom={handleFitOrthoZoom}
            />
          )}
        </React.Suspense>

        <OrbitControls makeDefault enablePan enableZoom={false} />
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
}

function STLMesh({ url, fitKey, onFitDistance, onFitOrthoZoom }: STLMeshProps) {
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
        camera.position.set(0, 0, d)
        camera.lookAt(0, 0, 0)
        controls?.target?.set(0, 0, 0)
        controls?.update?.()
        if (d > 0) onFitDistance?.(d)
      } else if (camera instanceof THREE.OrthographicCamera) {
        const z = orthographicFitZoom(r, Math.abs(camera.right), Math.abs(camera.top))
        camera.zoom = z
        camera.updateProjectionMatrix()
        controls?.update?.()
        if (z > 0) onFitOrthoZoom?.(z)
      }
    }
    invalidate()  // demand mode: trigger a frame after geometry/camera changes
  }, [geometry, fitKey, controls, onFitDistance, onFitOrthoZoom, invalidate]) // camera is stable in R3F (never replaced); eslint-disable-line react-hooks/exhaustive-deps

  return (
    <mesh ref={meshRef} geometry={geometry} castShadow>
      <meshStandardMaterial color="#c8c8c8" roughness={0.55} metalness={0.1} />
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

const clearButtonStyle: React.CSSProperties = {
  position: 'absolute',
  top: 8,
  right: 8,
  zIndex: 20,
  width: 22,
  height: 22,
  borderRadius: '50%',
  backgroundColor: 'var(--bg-primary)',
  border: '1.5px solid var(--border-base)',
  boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--text-secondary)',
  padding: 0,
}
