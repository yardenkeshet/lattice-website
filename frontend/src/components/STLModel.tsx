import { useLoader } from '@react-three/fiber'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader'
// import { Suspense } from 'react'

const STLModel = ({ url }) => {
  // useLoader automatically handles async loading
  const geometry = useLoader(STLLoader, url)

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color="gray" />
    </mesh>
  )
}
export default STLModel;