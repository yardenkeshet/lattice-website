import * as THREE from 'three'
import { NORMAL, GOURAUD, DEFAULT_SPECULAR_GRAY, DEFAULT_SHININESS, type ShadingMode } from '../lib/parameters'

export interface ShadedMaterialProps {
  mode: ShadingMode
  color: string
  /** 0–255 grayscale specular intensity. Phong only. */
  specularGray?: number
  /** Phong only. */
  shininess?: number
  opacity?: number
  side?: THREE.Side
}

/**
 * Picks the Three.js material matching the selected shading mode. Shared
 * between ViewerScene and TileCard so all mesh previews stay in sync.
 */
export function ShadedMaterial({
  mode,
  color,
  specularGray = DEFAULT_SPECULAR_GRAY,
  shininess = DEFAULT_SHININESS,
  opacity = 1,
  side = THREE.DoubleSide,
}: ShadedMaterialProps) {
  const transparent = opacity < 1

  if (mode === NORMAL) {
    return <meshNormalMaterial side={side} opacity={opacity} transparent={transparent} />
  }
  if (mode === GOURAUD) {
    return <meshLambertMaterial color={color} side={side} opacity={opacity} transparent={transparent} />
  }
  const specularHex = (specularGray << 16) | (specularGray << 8) | specularGray
  return (
    <meshPhongMaterial
      color={color}
      specular={specularHex}
      shininess={shininess}
      side={side}
      opacity={opacity}
      transparent={transparent}
    />
  )
}
