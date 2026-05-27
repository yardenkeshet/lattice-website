import React, { useState, useRef, useEffect, Suspense } from 'react';
import { io, Socket } from 'socket.io-client';
import './App.css';
import { Canvas } from '@react-three/fiber';
import { useLoader } from '@react-three/fiber'
import Viewer from './components/Viewer';
import pako from 'pako';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';

// Define the shape of our lattice data for TypeScript
interface LatticeParams {
  tileType: string;
  p1: number; p2: number; p3: number;
  nt1: number; nt2: number; nt3: number;
  g1: number; g2: number;
}

function STLModel({ url }) {
  const geometry = useLoader(STLLoader, url)
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color="orange" />
    </mesh>
  )
}

const App: React.FC = () => {
  // --- UI State ---
  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const [cameraMode, setCameraMode] = useState<'PERSPECTIVE' | 'ORTHO'>('PERSPECTIVE');
  const [status, setStatus] = useState('idle');
  const [isCalculating, ] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);

  // --- Lattice State ---
  const [params, setParams] = useState<LatticeParams>({
    tileType: 'diagonal',
    p1: 0.2, p2: 0.1, p3: 0.4,
    nt1: 20, nt2: 20, nt3: 1.0,
    g1: 2.0, g2: 0.2
  });

  // --- Refs for 3D Canvas and Sockets ---
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const socketRef = useRef<Socket | null>(null);

  // Initialize Socket.io and 3D Engine
  useEffect(() => {
    // Because of your Vite Proxy, we don't need a URL here
    socketRef.current = io();

    // handle socket events here...
    socketRef.current.on('connect', () => setStatus('connected'));

    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  // Timer logic for calculation
  useEffect(() => {
    let interval: number;
    if (isCalculating) {
      interval = setInterval(() => {
        setElapsedTime(prev => +(prev + 0.1).toFixed(1));
      }, 100);
    }
    return () => clearInterval(interval);
  }, [isCalculating]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { id, value } = e.target;
    setParams(prev => ({
      ...prev,
      [id]: e.target.type === 'number' ? parseFloat(value) : value
    }));
  };

const handleCalculate = () => {
  if (!socketRef.current) return;

  const tileParams = {
    type: params.tileType,
    values: [params.p1, params.p2, params.p3]
  };

  console.log("Send Tiles params", tileParams);
  
  // Emitting the event through the persistent socket reference
  socketRef.current.emit('calculate_tile', tileParams);
  socketRef.current.on("result", (data) => {
    try {
        // 1. Decode Base64 string to a binary string
        const decodedData = window.atob(data.stl_gz_b64);
        
        // 2. Convert binary string to Uint8Array for pako
        const charData = new Uint8Array(decodedData.length);
        for (let i = 0; i < decodedData.length; i++) {
            charData[i] = decodedData.charCodeAt(i);
        }

        // 3. Decompress using Pako (Gzip)
        // pako.ungzip returns a Uint8Array of the original STL
        const decompressed = pako.ungzip(charData);

        // 4. Parse the geometry with STLLoader
        const loader = new STLLoader();
        const geometry = loader.parse(decompressed.buffer);

        // 5. Update your React state
        setGeometry(geometry);
        
        console.log("Timings from server:", data.timings);
    } catch (err) {
        console.error("Failed to extract geometry:", err);
    }
});
};

  return (
    <div className="app-container">
      {/* HUD Toggle Button */}
      <button 
        id="toggle-ui-btn" 
        className={!isPanelOpen ? 'closed' : ''}
        onClick={() => setIsPanelOpen(!isPanelOpen)}
      >
        {isPanelOpen ? '«' : '☰'}
      </button>

      {/* Futuristic UI Panel */}
      <div id="ui-panel" className={!isPanelOpen ? 'closed-panel' : ''}>
        <button id="close-ui-btn" onClick={() => setIsPanelOpen(false)}>✕</button>

        <div className="control-group">
          <label>Camera Mode</label>
          <button 
            className="mode-toggle-btn"
            onClick={() => setCameraMode(prev => prev === 'PERSPECTIVE' ? 'ORTHO' : 'PERSPECTIVE')}
          >
            📷 {cameraMode}
          </button>
        </div>

        <div className="control-group">
          <h1>Lattice Type</h1>
          <select id="tileType" value={params.tileType} onChange={handleInputChange}>
            <option value="diagonal">DIAGONAL</option>
            <option value="cross">CROSS</option>
            <option value="cross_diagonal">CROSS_DIAGONAL</option>
          </select>
          
          <label>Tile Parameters (P1, P2, P3)</label>
          <div className="input-row">
            <input type="number" id="p1" value={params.p1} onChange={handleInputChange} step="0.01" />
            <input type="number" id="p2" value={params.p2} onChange={handleInputChange} step="0.01" />
            <input type="number" id="p3" value={params.p3} onChange={handleInputChange} step="0.01" />
          </div>
        </div>

        <div className="control-group">
          <h1>Lattice</h1>
          <label>Num Tiles</label>
          <div className="input-row">
            <input type="number" id="nt1" value={params.nt1} onChange={handleInputChange} />
            <input type="number" id="nt2" value={params.nt2} onChange={handleInputChange} />
            <input type="number" id="nt3" value={params.nt3} onChange={handleInputChange} step="0.1" />
          </div>
        </div>

        <button 
          id="calculate" 
          className={isCalculating ? 'btn-disabled' : ''} 
          onClick={handleCalculate}
        >
          {isCalculating ? 'Processing...' : 'Calculate & Send'}
        </button>

        <div className="status-bar">
          <strong>Status:</strong> <span>{status}</span>
        </div>

        {isCalculating && (
          <div id="calc-activity">
            <div className="spinner"></div>
            <div className="timer">
              <span>Calculating… </span>
              <span>{elapsedTime}</span>
              <span>{calculationMessage}</span>
            </div>
          </div>
        )}
      </div>

      {/* Performance Monitor */}
      <div id="perfBox">
        <div>Overall: <span>-</span> ms</div>
      </div>

      {/* The 3D Viewport */}
      <canvas id="viewer" ref={canvasRef}></canvas>
      <Viewer geometry={geometry  }></Viewer>
    </div>
  );
};

export default App;