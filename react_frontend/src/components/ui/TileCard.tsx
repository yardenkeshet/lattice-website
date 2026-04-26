import * as React from 'react'
import { Canvas, useLoader, useThree } from '@react-three/fiber'
import { OrbitControls, Center, Environment } from '@react-three/drei'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { Slot } from '@radix-ui/react-slot'
import { cn } from '../../lib/utils'
import * as THREE from 'three'

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
   * 'small' (80px) — tile selector card with label.
   * 'large' (166px) — real-time preview panel, no label.
   */
  size?: 'small' | 'large'
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
  meshColor?: string
  /**
   * Allow camera orbit interaction (drag to rotate).
   * Disabled by default for small cards so click-to-select works cleanly.
   */
  enableOrbit?: boolean
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
      meshColor = '#c8c8c8',
      enableOrbit = false,
    },
    ref
  ) => {
    const [isHovered, setIsHovered] = React.useState(false)

    const Wrapper = asChild ? Slot : 'div'

    const cardStyle: React.CSSProperties = {
      position: 'relative',
      width: size === 'small' ? 'var(--tile-card-size-sm)' : 'var(--tile-card-size-lg)',
      height: size === 'small' ? 'var(--tile-card-size-sm)' : 'var(--tile-card-size-lg)',
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
        {/* Three.js canvas — leaves room for the label when present */}
        <Canvas
          style={{ width: '100%', height: label && size === 'small' ? 'calc(100% - 20px)' : '100%' }}
          camera={{ position: [0, 0, 3], fov: 45 }}
          gl={{ antialias: true, alpha: true }}
        >
          <ambientLight intensity={0.7} />
          <directionalLight position={[3, 4, 3]} intensity={0.8} />
          <directionalLight position={[-3, -2, -3]} intensity={0.2} />

          <React.Suspense fallback={<PlaceholderMesh color={meshColor} />}>
            {modelUrl
              ? <STLModel url={modelUrl} color={meshColor} />
              : <PlaceholderMesh color={meshColor} />
            }
          </React.Suspense>

          {enableOrbit && (
            <OrbitControls
              enablePan={false}
              enableZoom={false}
              makeDefault
            />
          )}
        </Canvas>

        {/* Label — small size only */}
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

function STLModel({ url, color }: { url: string; color: string }) {
  const geometry = useLoader(STLLoader, url)

  // Center and normalise scale so any STL fits the card.
  const ref = React.useRef<THREE.Mesh>(null)
  React.useLayoutEffect(() => {
    if (!ref.current) return
    const box = new THREE.Box3().setFromObject(ref.current)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    ref.current.position.sub(center)
    ref.current.scale.setScalar(2 / maxDim)
  }, [geometry])

  return (
    <mesh ref={ref} geometry={geometry} castShadow>
      <meshStandardMaterial color={color} roughness={0.55} metalness={0.1} />
    </mesh>
  )
}

/* ─── Fallback geometry rendered when no modelUrl is provided ─── */

function PlaceholderMesh({ color }: { color: string }) {
  return (
    <Center>
      <mesh castShadow>
        <torusKnotGeometry args={[0.6, 0.2, 128, 32]} />
        <meshStandardMaterial color={color} roughness={0.55} metalness={0.1} />
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
