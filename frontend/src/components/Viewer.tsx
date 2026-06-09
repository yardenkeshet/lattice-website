import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stage, Environment } from '@react-three/drei';

const Viewer = ({ geometry }: { geometry: THREE.BufferGeometry | null }) => {
  return (
    <div style={{ width: '100%', height: '500px', background: '#111' }}>
      <Canvas shadows camera={{ position: [0, 0, 10] }}>
        <Suspense fallback={null}>
          <Stage environment="city" intensity={0.6}>
            {geometry ? (
              <mesh geometry={geometry} castShadow receiveShadow>
                <meshPhysicalMaterial 
                  color="orange" 
                  roughness={0.3} 
                  metalness={0.8} 
                  clearcoat={1} 
                />
              </mesh>
            ): 
            (<mesh>
                              <meshPhysicalMaterial 
                  color="orange" 
                  roughness={0.5} 
                  metalness={0.4} 
                  clearcoat={0.5} 
                />
              <boxGeometry args={[1, 1, 1]}  />
            </mesh>)}
          </Stage>
        </Suspense>
        <OrbitControls makeDefault />
      </Canvas>
    </div>
  );
};

export default Viewer;