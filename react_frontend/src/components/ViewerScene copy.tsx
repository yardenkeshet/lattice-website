import * as React from 'react'
import { Canvas, useThree, useLoader } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { IGESLoader } from "three-iges-loader";
import * as THREE from 'three'
import { useStlBlobUrl } from '../lib/stl'
import { ACCEPTED_3D } from './ui/Toolbar'

/* ─── Public API ─── */

export interface ViewerSceneProps {
  // model.data can be a File (from upload) or a string (b64 from server or raw IGES text)
  model: { type: 'iges' | 'stl', data: any }, 
  cameraMode?: 'perspective' | 'orthographic'
  zoom?: number
  onFileDrop?: (file: File) => void
  onZoomChange?: (zoom: number) => void
  className?: string
  style?: React.CSSProperties
}

const SCROLL_ZOOM_STEP = 10
const SCROLL_ZOOM_MIN = 10
const SCROLL_ZOOM_MAX = 500

export function ViewerScene({
  model = { type: 'stl', data: null },
  cameraMode = 'perspective',
  zoom = 100,
  onFileDrop,
  onZoomChange,
  className,
  style,
}: ViewerSceneProps) {
  const [isDragOver, setIsDragOver] = React.useState(false)
  const [activeUrl, setActiveUrl] = React.useState<string | null>(null)

  // 1. Handle server-side STL results (b64/gz)
  const resultStlUrl = useStlBlobUrl(model.type === 'stl' && typeof model.data === 'string' ? model.data : null)

  // 2. Handle all other data sources (Files or Raw Text)
  React.useEffect(() => {
    if (resultStlUrl) {
      setActiveUrl(resultStlUrl)
      return
    }

    if (!model.data) {
      setActiveUrl(null)
      return
    }

    let url: string | null = null

    if (model.data instanceof File) {
      // It's a local upload
      url = URL.createObjectURL(model.data)
    } else if (typeof model.data === 'string' && model.type === 'iges') {
      // It's raw IGES text content
      const blob = new Blob([model.data], { type: 'text/plain' })
      url = URL.createObjectURL(blob)
    }

    if (url) {
      setActiveUrl(url)
      return () => URL.revokeObjectURL(url!)
    }
  }, [model.data, model.type, resultStlUrl])

  const zoomRef = React.useRef(zoom)
  React.useEffect(() => { zoomRef.current = zoom }, [zoom])

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

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true) }
  const handleDragLeave = () => setIsDragOver(false)
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (!file) return
    const ext = '.' + file.name.split('.').pop()?.toLowerCase()
    if (!ACCEPTED_3D.includes(ext)) return
    onFileDrop?.(file)
  }

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        position: 'relative', width: '100%', height: '100%',
        borderRadius: 12, overflow: 'hidden', backgroundColor: 'var(--bg-secondary)',
        outline: isDragOver ? '2px dashed var(--border-focus)' : '2px dashed transparent',
        transition: 'outline 150ms ease', ...style,
      }}
      onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
    >
      {!activeUrl && !isDragOver && (
        <div style={placeholderStyle}>
          <UploadCloudIcon />
          <span style={placeholderTextStyle}>Drop a .iges or .stl file here</span>
        </div>
      )}

      <Canvas
        key={cameraMode}
        camera={cameraMode === 'perspective' ? { position: [0, 0, 5], fov: 60 } : undefined}
        orthographic={cameraMode === 'orthographic'}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={0.6} />
        <pointLight position={[10, 10, 10]} />
        
        <CameraZoom zoom={zoom} mode={cameraMode} />

        <React.Suspense fallback={null}>
          {activeUrl && (
            model.type === 'iges' 
              ? <IGESMesh igesUrl={activeUrl} /> 
              : <STLMesh url={activeUrl} />
          )}
        </React.Suspense>

        <OrbitControls makeDefault enablePan enableZoom={false} />
      </Canvas>
    </div>
  )
}

/* ─── Mesh Components ─── */

function STLMesh({ url }: { url: string }) {
  const geometry = useLoader(STLLoader, url)
  const meshRef = React.useRef<THREE.Mesh>(null)

  React.useLayoutEffect(() => {
    if (!meshRef.current || !geometry) return
    const box = new THREE.Box3().setFromObject(meshRef.current)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    meshRef.current.position.sub(center)
    meshRef.current.scale.setScalar(3 / (maxDim || 1))
  }, [geometry])

  return (
    <mesh ref={meshRef} geometry={geometry} castShadow>
      <meshStandardMaterial color="#c8c8c8" roughness={0.5} metalness={0.2} />
    </mesh>
  )
}

function IGESMesh({ igesUrl }: { igesUrl: string }) {
  const igesObject = useLoader(IGESLoader, igesUrl)
  const groupRef = React.useRef<THREE.Group>(null)

  React.useLayoutEffect(() => {
    if (!groupRef.current || !igesObject) return

    const box = new THREE.Box3().setFromObject(igesObject)
    
    // Check for valid numbers to prevent the NaN crash
    if (isNaN(box.min.x) || !isFinite(box.min.x)) return

    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    
    groupRef.current.position.set(-center.x, -center.y, -center.z)

    const maxDim = Math.max(size.x, size.y, size.z)
    if (maxDim > 0) {
      groupRef.current.scale.setScalar(3 / maxDim)
    }
  }, [igesObject])

  return (
    <group ref={groupRef}>
      <primitive object={igesObject} />
    </group>
  )
}

/* ─── Helpers ─── */

function CameraZoom({ zoom, mode }: { zoom: number; mode: string }) {
  const { camera } = useThree()
  React.useEffect(() => {
    const factor = zoom / 100
    if (mode === 'orthographic') {
      camera.zoom = factor
      camera.updateProjectionMatrix()
    } else {
      camera.position.z = 5 / factor
      camera.updateProjectionMatrix()
    }
  }, [zoom, mode, camera])
  return null
}

function UploadCloudIcon() { /* ... same as your SVG ... */ return null; }
const placeholderStyle: React.CSSProperties = { /* ... same as yours ... */ };
const placeholderTextStyle: React.CSSProperties = { /* ... same as yours ... */ };

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
    if (!meshRef.current || !geometry) return
    const box = new THREE.Box3().setFromObject(meshRef.current)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    meshRef.current.position.sub(center)
    meshRef.current.scale.setScalar(3 / (maxDim || 1))
  }, [geometry])

  return (
    <mesh ref={meshRef} geometry={geometry} castShadow>
      <meshStandardMaterial color="#c8c8c8" roughness={0.5} metalness={0.2} />
    </mesh>
  )
}

function IGESMesh({ igesUrl }: { igesUrl: string }) {
  const igesObject = useLoader(IGESLoader, igesUrl)
  const groupRef = React.useRef<THREE.Group>(null)

  React.useLayoutEffect(() => {
    if (!groupRef.current || !igesObject) return

    const box = new THREE.Box3().setFromObject(igesObject)
    
    // Check for valid numbers to prevent the NaN crash
    if (isNaN(box.min.x) || !isFinite(box.min.x)) return

    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    
    groupRef.current.position.set(-center.x, -center.y, -center.z)

    const maxDim = Math.max(size.x, size.y, size.z)
    if (maxDim > 0) {
      groupRef.current.scale.setScalar(3 / maxDim)
    }
  }, [igesObject])

  return (
    <group ref={groupRef}>
      <primitive object={igesObject} />
    </group>
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
