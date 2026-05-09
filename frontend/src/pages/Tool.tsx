import React, { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import "../style.css";
import pako from "pako";
import type { BufferGeometry } from "three";
import { STLLoader,  } from "three/examples/jsm/loaders/STLLoader.js";
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';

import Banner from "@/components/Banner";
import LeftMenu from "@/pages/Leftmenu";
import RightMenu from "@/pages/RightMenu";
import Viewer from "@/pages/Viewer";
import NavigationBar from "@/components/NavigationBar";
export interface LatticeParams {
  tileType: string;
  p1: number;
  p2: number;
  p3: number;
  nt1: number;
  nt2: number;
  nt3: number;
  g1: number;
  g2: number;
};

export const ImagesSrcs = ["a", "b"];

const Tool: React.FC = () => {
  // --- UI State ---
  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const [cameraMode, setCameraMode] = useState<'PERSPECTIVE' | 'ORTHO'>('PERSPECTIVE');
  const [status, setStatus] = useState('idle');
  const [isCalculating,] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [modelGeometry, setModelGeometry] = useState<BufferGeometry | null>(null);

  const [igsFile, setIgsFile] = useState<File | null>(null);

  const [tileGeometry, setTileGeometry] = useState<BufferGeometry | null>(null);


  // --- Lattice State ---
  const [params, setParams] = useState<LatticeParams>({
    tileType: 'diagonal',
    p1: 0.2, p2: 0.1, p3: 0.4,
    nt1: 5, nt2: 5, nt3: 4,
    g1: 0.4, g2: 0.2
  });

  // --- Refs for 3D Canvas and Sockets ---
  const modelCanvasRef = useRef<HTMLCanvasElement>(null);
  const tileCanvasRef = useRef<HTMLCanvasElement>(null);
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




  const toBase64 = (file: File) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
  });


  const loadIgsFile = async (file: File) => {
    console.log("File selected:", file.name);
    setIgsFile(file);

    // Since STLLoader doesn't support IGS, and we probably don't have a JS IGS loader handy,
    // we might not be able to preview the IGS file directly in the frontend
    // unless we have another way. For now, we just keep the file state.
    // If the user expects a preview, we'd need an IGS loader.
    // setModelGeometry(null); 
  };

  const onIgsFilesSelected = (files: File[]) => {
    const file = files[0];
    if (!file) return;
    void loadIgsFile(file);
  };

  const handleTileCalculation = () => {
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
        if (data?.download_token) {
          // setDownloadToken(data.download_token);
          return;
        }

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
        const tileGeometry = loader.parse(decompressed.buffer);

        // 5. Update your React state
        // setGeometry(geometry);
        setTileGeometry(tileGeometry);

        console.log("Timings from server:", data.timings);
      } catch (err) {
        console.error("Failed to extract geometry:", err);
      }
    });
  };

  const handleModelCalculation = async () => {
    if (!igsFile) {
      console.error("No file selected!");
      return;
    }

    const rawBase64 = (await toBase64(igsFile)) as string;
    const cleanBase64 = rawBase64.split(',')[1];
    // 3. Construct the payload exactly as the backend expects
    const payload = {
      client_ts: Date.now(),
      filename: igsFile.name,
      args: {
        tileType: params.tileType, // e.g., 'diamond'
        nt1: params.nt1,           // integer
        nt2: params.nt2,
        nt3: params.nt3,
        g1: params.g1,             // float
        g2: params.g2,
      },
      igs_b64: cleanBase64,        // Changed from stl_b64 to igs_b64
      binary: true                 // Matches 'is_binary' flag
    };

    // 4. Emit to the 'calculate' event
    if(!socketRef.current) {
      console.error("Socket not initialized!");
      return;
    }
    socketRef.current.emit('calculate', payload);
    socketRef.current.on("result", (data) => {
      try {
        if (data?.download_token) {
          // setDownloadToken(data.download_token);
          return;
        }

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
        // setGeometry(geometry);
        setModelGeometry(geometry);

        console.log("Timings from server:", data.timings);
      } catch (err) {
        console.error("Failed to extract geometry:", err);
      }
    });
  };

  useEffect(() => {
    console.log("Updated Params:", params);
    handleTileCalculation();
  }, [params]);

  return (
    <div className="app-container">
      {/* HUD Toggle Button */}
      <Banner />
      <NavigationBar />
      <main className="flex flex-row w-screen">

        <LeftMenu
          isPanelOpen={isPanelOpen}
          setIsPanelOpen={setIsPanelOpen}
          cameraMode={cameraMode}
          setCameraMode={setCameraMode}
          params={params}
          onInputChange={handleInputChange}
          onTileCalculate={handleTileCalculation}
          isCalculating={isCalculating}
          status={status}
          elapsedTime={elapsedTime}
          onIgsFilesSelected={onIgsFilesSelected}
          onModelCalculate={handleModelCalculation}
        />
        <Viewer
          canvasRef={modelCanvasRef}
          geometry={modelGeometry}
        />
        <RightMenu
          params={params}
          tileGeometry={tileGeometry}
          onTileCalculate={handleTileCalculation}
          onInputChange={handleInputChange}
          canvasRef={tileCanvasRef}
        />
      </main>
    </div>
  );
};

export default Tool;