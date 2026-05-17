import * as React from 'react'
import { useLoader } from '@react-three/fiber'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import * as THREE from 'three'


export function STLMesh({ url }: { url: string }) {
  if(!url) {
    return null;
  }

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