import * as React from 'react'
import * as THREE from 'three'
import type { BufferGeometry } from 'three'


export function STLMesh({ geometry }: { geometry?: BufferGeometry }) {
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

  if (!geometry) return null

  return (
    <mesh ref={meshRef} geometry={geometry} castShadow>
      <meshStandardMaterial color="#c8c8c8" roughness={0.5} metalness={0.2} />
    </mesh>
  )
}