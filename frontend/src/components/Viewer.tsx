import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { Canvas, useLoader } from '@react-three/fiber';
import { OrbitControls, Stage } from '@react-three/drei';
import { type BufferGeometry } from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

type ViewerProps = {
  geometry?: BufferGeometry | null;
  stlGetUrl?: string | null;
};

function STLMesh({ url }: { url: string }) {
  const geometry = useLoader(STLLoader, url);
  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshPhysicalMaterial color="orange" roughness={0.3} metalness={0.8} clearcoat={1} />
    </mesh>
  );
}

// function init() {
//     const canvas = document.getElementById('viewer');
//     renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
//     scene = new THREE.Scene();
//     scene.background = new THREE.Color(0x222222);

//     const aspect = window.innerWidth / window.innerHeight;
//     perspectiveCamera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
//     perspectiveCamera.position.set(0, 0, 150);

//     const frustumSize = 1000; // Increase this significantly

//     orthographicCamera = new THREE.OrthographicCamera(
//         frustumSize * aspect / -2,
//         frustumSize * aspect / 2,
//         frustumSize / 2,
//         frustumSize / -2,
//         0.1,
//         2000
//     );
//     orthographicCamera.position.set(0, 0, 150);

//     camera = perspectiveCamera;

//     controls = new OrbitControls(camera, renderer.domElement);
//     controls.target.set(0,0,0);
//     // Add these properties for better Firefox compatibility:
//       controls.enableDamping = true;  // Smooth camera movement
//       controls.dampingFactor = 0.05;  // Adjust smoothness (0.05 is default)
//       controls.screenSpacePanning = false; // Better for 3D viewing
//     controls.update();

//     const light = new THREE.DirectionalLight(0xffffff, 0.9);
//     light.position.set(1,1,1);
//     scene.add(light);
//     scene.add(new THREE.AmbientLight(0x888888, 0.6));

//     // Text sprite HUD
//       //textSprite = createTextSprite('Hello Lattice Fan');
//       textSprite = createTextGradientSprite('Lattice Fan');
//     //textSprite = createMultiColorTextSprite([
//     //{ text: 'Hello ',  color: '#ff6666' },
//     //{ text: 'Camera',  color: '#66ff66' }
//     //]);

//     //camera.add(textSprite);
//     scene.add(perspectiveCamera);
//     scene.add(orthographicCamera);
// }


const Viewer: React.FC<ViewerProps> = ({ geometry, stlGetUrl }) => {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  const effectiveUrl = useMemo(() => {
    if (!stlGetUrl) return null;
    return stlGetUrl;
  }, [stlGetUrl]);

  useEffect(() => {
    let isCancelled = false;
    let currentObjectUrl: string | null = null;

    async function fetchStl() {
      if (!effectiveUrl) {
        setObjectUrl(null);
        return;
      }

      try {
        const res = await fetch(effectiveUrl, { method: 'GET' });
        if (!res.ok) throw new Error(`GET STL failed: ${res.status} ${res.statusText}`);
        const blob = await res.blob();
        if (isCancelled) return;

        currentObjectUrl = URL.createObjectURL(blob);
        setObjectUrl(currentObjectUrl);
      } catch (e) {
        // Fail closed: keep prior render (or fallback cube)
        if (!isCancelled) setObjectUrl(null);
        console.error(e);
      }
    }

    fetchStl();

    return () => {
      isCancelled = true;
      if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
    };
  }, [effectiveUrl]);

  return (
    <div className={"bg-white  w-xl "}>
      {/* <div style={{ width: '100%', height: '500px', background: '#111' }}> */}
      <Canvas shadows camera={{ isPerspectiveCamera: true, position: [0, 0, 150] }}>
        <Suspense fallback={null}>
          <Stage environment="city" intensity={0.6} >
            {geometry ? (
              <mesh geometry={geometry} castShadow receiveShadow >
                <meshPhysicalMaterial color="blue" roughness={0.4} metalness={0.1} clearcoat={1} />
              </mesh>
            ) : objectUrl ? (
              <STLMesh url={objectUrl} />
            ) : (
              <mesh>
                <meshPhysicalMaterial color="white" roughness={0.7} metalness={0.1} clearcoat={0} />
                <boxGeometry args={[1, 1, 1]} />
              </mesh>
            )}
          </Stage>
        </Suspense>
        <OrbitControls makeDefault />
      </Canvas>
    </div>
  );
};

export default Viewer;