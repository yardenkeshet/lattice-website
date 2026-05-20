import * as React from 'react'
import { Canvas, useThree, useLoader } from '@react-three/fiber'
import { OrbitControls, Center } from '@react-three/drei'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import * as THREE from 'three'
import { useStlBlobUrl } from '../lib/stl'

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
  /**
   * Opaque string controlled by the parent. When this key changes the camera
   * resets to its default position. Unchanged on tile-param recalculations so
   * the user's orbit/zoom is preserved across param tweaks.
   */
  cameraResetKey?: string
  className?: string
  style?: React.CSSProperties
}

const ACCEPTED_EXTS = new Set(['.stl', '.obj', '.3mf'])

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
  className,
  style,
}: ViewerSceneProps) {
  const [isDragOver, setIsDragOver] = React.useState(false)

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
        outline: isDragOver ? '2px dashed var(--border-focus)' : '2px dashed transparent',
        transition: 'outline 150ms ease',
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
            Drop a .stl / .obj / .3mf file here,<br />or use the + button above
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

        {/* Camera zoom controller */}
        <CameraZoom zoom={zoom} mode={cameraMode} />

        {/* Reset camera when parent signals a meaningful model change */}
        <CameraReset resetKey={cameraResetKey ?? 'initial'} />

        {/* Mesh */}
        <React.Suspense fallback={null}>
          {activeUrl && <STLMesh url={activeUrl} />}
        </React.Suspense>

        <OrbitControls makeDefault enablePan enableZoom={false} />
      </Canvas>
    </div>
  )
}

/* ─── Camera reset on model change ─── */

function CameraReset({ resetKey }: { resetKey: string }) {
  const { camera } = useThree()
  const controls = useThree(s => s.controls) as any  // reactive: re-fires when controls register
  React.useEffect(() => {
    camera.position.set(0, 0, 5)
    camera.lookAt(0, 0, 0)
    controls?.target?.set(0, 0, 0)
    controls?.update?.()
  }, [resetKey, controls]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

/* ─── Camera zoom controller ─── */

function CameraZoom({ zoom, mode }: { zoom: number; mode: string }) {
  const { camera } = useThree()

  React.useEffect(() => {
    const factor = zoom / 100
    if (mode === 'orthographic') {
      camera.zoom = factor
      camera.updateProjectionMatrix()
    } else {
      // Perspective: move camera along Z axis; z=5 at 100%
      const perspCam = camera as THREE.PerspectiveCamera
      const baseZ = 5
      perspCam.position.z = baseZ / factor
      perspCam.updateProjectionMatrix()
    }
  }, [zoom, mode, camera])

  return null
}

/* ─── STL mesh loader ─── */

function STLMesh({ url }: { url: string }) {
  const geometry = useLoader(STLLoader, url)
  const meshRef = React.useRef<THREE.Mesh>(null)

  React.useLayoutEffect(() => {
    if (!meshRef.current) return
    const box = new THREE.Box3().setFromObject(meshRef.current)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    meshRef.current.position.sub(center)
    meshRef.current.scale.setScalar(3 / maxDim)
  }, [geometry])

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
