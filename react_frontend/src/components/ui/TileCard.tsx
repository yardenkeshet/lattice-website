import * as React from 'react'
import { Canvas, useLoader, useThree } from '@react-three/fiber'
import { OrbitControls, Center } from '@react-three/drei'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { Slot } from '@radix-ui/react-slot'
import { cn } from '../../lib/utils'
import * as THREE from 'three'
import { perspectiveFitDistance } from '../../lib/cameraFit'
import { ShadedMaterial } from '../ShadedMaterial'
import { DEFAULT_SHADING_MODE, DEFAULT_SPECULAR_GRAY, DEFAULT_SHININESS, type ShadingMode } from '../../lib/parameters'

/* ─── Error boundary ───
   A malformed/truncated STL (e.g. from a server-side race writing the temp
   file) throws inside STLLoader's Suspense resource. Without this boundary
   the error escapes the Canvas and unmounts the whole React tree. */
class STLErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false }
  static getDerivedStateFromError() { return { hasError: true } }
  render() {
    return this.state.hasError ? (this.props.fallback ?? null) : this.props.children
  }
}

/* ─── Public API ─── */

export interface TileCardProps {
  /**
   * URL or path to the STL file to display.
   * When undefined, renders a placeholder geometry (useful for Storybook).
   */
  modelUrl?: string
  /** Label shown at the bottom of the small variant (e.g. "Cross") */
  label?: string
  /**
   * 'mini'  (45.5px) — compact thumbnail used inside LatticeMenu, no label.
   * 'small' (80px)   — tile selector card with label.
   * 'large' (166px)  — real-time preview panel, no label.
   */
  size?: 'mini' | 'small' | 'large'
  /** Highlights the card with a blue border */
  selected?: boolean
  disabled?: boolean
  onClick?: () => void
  /** Render the outer wrapper as its child (Slot / asChild pattern) */
  asChild?: boolean
  className?: string
  'aria-label'?: string
  /**
   * Color of the 3D mesh material.
   * Defaults to a neutral gray matching the Figma screenshots.
   */
  meshColor: string
  backgroundColor: string
  shadingMode?: ShadingMode
  specularGray?: number
  shininess?: number
  /**
   * Allow camera orbit interaction (drag to rotate and scroll to zoom).
   * Disabled by default for small cards so click-to-select works cleanly.
   */
  enableOrbit?: boolean
  /**
   * When this key changes the camera resets to its default position.
   * Pass `tileType` so the view resets on tile-type change but not on
   * parameter recalculation (which updates modelUrl but not the key).
   */
  cameraResetKey?: string
  /**
   * Static image URL (e.g. imported PNG). When provided for non-large sizes,
   * renders an <img> instead of the Three.js canvas.
   */
  imageUrl?: string
}

// Note: ref is forwarded to the outer wrapper div.
const TileCard = React.forwardRef<HTMLDivElement, TileCardProps>(
  (
    {
      modelUrl,
      label,
      size = 'small',
      selected = false,
      disabled = false,
      onClick,
      asChild = false,
      className,
      'aria-label': ariaLabel,
      meshColor,
      backgroundColor,
      shadingMode = DEFAULT_SHADING_MODE,
      specularGray = DEFAULT_SPECULAR_GRAY,
      shininess = DEFAULT_SHININESS,
      enableOrbit = false,
      cameraResetKey,
      imageUrl,
    },
    ref
  ) => {
    const [isHovered, setIsHovered] = React.useState(false)

    const Wrapper = asChild ? Slot : 'div'

    const cardSize =
      size === 'mini'  ? '45.5px' :
      size === 'small' ? 'var(--tile-card-size-sm)' :
      'var(--tile-card-size-lg)'

    const cardStyle: React.CSSProperties = {
      position: 'relative',
      width: cardSize,
      height: cardSize,
      borderRadius: 'var(--radius-track)',
      backgroundColor: 'var(--bg-tertiary)',
      overflow: 'hidden',
      cursor: disabled ? 'not-allowed' : onClick ? 'pointer' : 'default',
      opacity: disabled ? 0.45 : 1,
      outline: selected
        ? 'var(--tile-card-border-selected)'
        : isHovered && !disabled
        ? 'var(--tile-card-border-hover)'
        : '1px solid transparent',
      transition: 'outline 120ms ease',
      boxSizing: 'border-box',
      flexShrink: 0,
    }

    return (
      <Wrapper
        ref={ref}
        className={cn('tile-card', className)}
        style={cardStyle}
        onClick={!disabled ? onClick : undefined}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        aria-label={ariaLabel ?? label ?? 'Tile card'}
        aria-pressed={onClick ? selected : undefined}
        aria-disabled={disabled || undefined}
        role={onClick ? 'button' : undefined}
        tabIndex={onClick && !disabled ? 0 : undefined}
        onKeyDown={e => {
          if (onClick && !disabled && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            onClick()
          }
        }}
      >
        {/* Static image — used for tile selector cards with a known PNG */}
        {imageUrl && size !== 'large'
          ? (
            <img
              src={imageUrl}
              alt=""
              aria-hidden="true"
              style={{
                width: '100%',
                height: label && size === 'small' ? 'calc(100% - 20px)' : '100%',
                objectFit: 'contain',
              }}
            />
          )
          : (
            /* Three.js canvas — leaves room for the label when present */
            <Canvas
              frameloop="demand"
              style={{ width: '100%', height: label && size === 'small' ? 'calc(100% - 20px)' : '100%' }}
              camera={{ position: [0, 0, 3], fov: 45 }}
              gl={{ antialias: true, alpha: true }}
            >
              <color attach="background" args={[backgroundColor]} />
              <ambientLight intensity={0.4} />
              <directionalLight color={0xfff5e0} position={[5, 8, 6]} intensity={1.2} />
              <directionalLight color={0xffd9a0} position={[-6, 2, 4]} intensity={0.3} />
              <directionalLight color={0xffffff} position={[0, -4, -8]} intensity={0.25} />
              <directionalLight color={0xffeedd} position={[0, -8, 0]} intensity={0.2} />

              {enableOrbit && (
                <OrbitControls
                  enablePan={false}
                  enableZoom={true}
                  makeDefault
                />
              )}

              <STLErrorBoundary key={modelUrl} fallback={
                <PlaceholderMesh color={meshColor} shadingMode={shadingMode} specularGray={specularGray} shininess={shininess} />
              }>
                <React.Suspense fallback={modelUrl ? null : (
                  <PlaceholderMesh color={meshColor} shadingMode={shadingMode} specularGray={specularGray} shininess={shininess} />
                )}>
                  {modelUrl
                    ? <STLModel url={modelUrl} color={meshColor} fitKey={cameraResetKey} shadingMode={shadingMode} specularGray={specularGray} shininess={shininess} />
                    : <PlaceholderMesh color={meshColor} shadingMode={shadingMode} specularGray={specularGray} shininess={shininess} />
                  }
                </React.Suspense>
              </STLErrorBoundary>
            </Canvas>
          )
        }

        {/* Label — small size only (mini and large have no label) */}
        {label && size === 'small' && (
          <div style={labelStyle} aria-hidden="true">
            {label}
          </div>
        )}
      </Wrapper>
    )
  }
)

TileCard.displayName = 'TileCard'

/* ─── STL model loader ─── */

interface STLModelProps {
  url: string
  color: string
  fitKey?: string
  shadingMode?: ShadingMode
  specularGray?: number
  shininess?: number
}

function STLModel({
  url, color, fitKey,
  shadingMode = DEFAULT_SHADING_MODE, specularGray = DEFAULT_SPECULAR_GRAY, shininess = DEFAULT_SHININESS,
}: STLModelProps) {
  const geometry = useLoader(STLLoader, url)
  const ref = React.useRef<THREE.Mesh>(null)
  const { camera, invalidate } = useThree()
  const controls               = useThree(s => s.controls) as any

  const lastFitKeyRef   = React.useRef<string | undefined>(undefined)
  const prevGeometryRef = React.useRef<THREE.BufferGeometry | undefined>(undefined)

  React.useLayoutEffect(() => {
    if (!ref.current) return

    // 1. Reset to identity so the AABB is measured in raw local space.
    ref.current.position.set(0, 0, 0)
    ref.current.scale.setScalar(1)

    // 2. Measure raw local AABB.
    const box    = new THREE.Box3().setFromObject(ref.current)
    const center = box.getCenter(new THREE.Vector3())
    const size   = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    if (maxDim === 0) return

    // 3. Normalise: targetSize = 2 for tile card.
    //    Correct formula: position = -center * s so worldCenter = 0 for any geometry.
    const s = 2 / maxDim
    ref.current.scale.setScalar(s)
    ref.current.position.set(-center.x * s, -center.y * s, -center.z * s)

    // 4. Auto-fit only when BOTH the geometry AND the fitKey are new.
    //    This prevents fitting to an old model when only the key changes (key
    //    arrives before the new geometry), and prevents re-fitting on param recalcs
    //    (geometry changes but key stays the same).
    if (
      fitKey !== undefined &&
      geometry !== prevGeometryRef.current &&
      fitKey  !== lastFitKeyRef.current
    ) {
      lastFitKeyRef.current   = fitKey
      prevGeometryRef.current = geometry

      // Bounding sphere of the normalised mesh.
      const normBox = new THREE.Box3().setFromObject(ref.current)
      const sphere  = new THREE.Sphere()
      normBox.getBoundingSphere(sphere)

      // TileCard is always perspective — no orthographic branch needed.
      if (camera instanceof THREE.PerspectiveCamera) {
        const d = perspectiveFitDistance(sphere.radius, camera.fov, camera.aspect)
        camera.position.set(0, 0, d)
        camera.lookAt(0, 0, 0)
        controls?.target?.set(0, 0, 0)
        controls?.update?.()
      }
    }
    invalidate()  // demand mode: trigger a frame after geometry/camera changes
  }, [geometry, fitKey, controls, invalidate]) // camera is stable in R3F (never replaced)

  return (
    <mesh ref={ref} geometry={geometry} castShadow>
      <ShadedMaterial mode={shadingMode} color={color} specularGray={specularGray} shininess={shininess} />
    </mesh>
  )
}

/* ─── Fallback geometry rendered when no modelUrl is provided ─── */

interface PlaceholderMeshProps {
  color: string
  shadingMode?: ShadingMode
  specularGray?: number
  shininess?: number
}

function PlaceholderMesh({
  color,
  shadingMode = DEFAULT_SHADING_MODE,
  specularGray = DEFAULT_SPECULAR_GRAY,
  shininess = DEFAULT_SHININESS,
}: PlaceholderMeshProps) {
  return (
    <Center>
      <mesh castShadow>
        <torusKnotGeometry args={[0.6, 0.2, 128, 32]} />
        <ShadedMaterial mode={shadingMode} color={color} specularGray={specularGray} shininess={shininess} />
      </mesh>
    </Center>
  )
}

/* ─── Styles ─── */

const labelStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 6,
  left: 0,
  right: 0,
  textAlign: 'center',
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-size-xxs)',
  fontWeight: 600,
  color: 'var(--text-base)',
  pointerEvents: 'none',
  userSelect: 'none',
}

export { TileCard }
