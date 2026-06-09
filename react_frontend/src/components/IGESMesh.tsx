import * as React from 'react'
import { useStlBlobUrl } from '../lib/stl' // Using your existing hook
import { STLMesh } from './STLMesh' // Your working STL component
// import { socket } from '../lib/socket' // Assuming your socket instance is exported here
import { Html } from '@react-three/drei/web/Html';
import { getLatticeSocket } from '../api';

export function IGESMesh({ igesUrl }: { igesUrl: string }) {
  const [status, setStatus] = React.useState<'idle' | 'converting' | 'success' | 'error'>('idle');
  const [serverStlB64, setServerStlB64] = React.useState<string | null>(null);
  const [errorMessage, setErrorMessage] = React.useState('');

  // Use your existing hook to turn the server's gzipped b64 into a viewable blob URL
  const convertedStlUrl = useStlBlobUrl(serverStlB64);

  React.useEffect(() => {
    if (!igesUrl) return;

    const startConversion = async () => {
      setStatus('converting');
      setServerStlB64(null);

      try {
        // 1. Fetch the raw text from the local blob URL
        const response = await fetch(igesUrl);
        const igesText = await response.text();

        // 2. Send to server via SocketIO
        // Note: We send the text content because the server can't access a 'blob:' URL
          const socket = getLatticeSocket()
        socket.convertIGESToSTL({
          data: igesText,
          filename: 'upload.iges'
        });

        // 3. Listen for the specific conversion result
        const handleResult = (payload: any) => {
          if (payload.kind === 'model_stl') {
            setServerStlB64(payload.stl_gz_b64);
            setStatus('success');
            socket.off('result', handleResult);
          }
        };

        const handleError = (err: any) => {
          setErrorMessage(err.msg || 'Conversion failed');
          setStatus('error');
          socket.off('error', handleError);
        };

        socket.on('result', handleResult);
        socket.on('error', handleError);

      } catch (err) {
        console.error("Upload flow failed:", err);
        setStatus('error');
      }
    };

    startConversion();

    // Cleanup listeners if the component unmounts
    return () => {
      socket.off('result');
      socket.off('error');
    };
  }, [igesUrl]);

  // --- UI States ---

  if (status === 'converting') {
    return (
      <Html center>
        <div style={loaderStyle}>
          <div className="spinner" />
          <p>Converting IGES to STL (Gmsh)...</p>
        </div>
      </Html>
    );
  }

  if (status === 'error') {
    return (
      <Html center>
        <div style={{ color: 'red', textAlign: 'center' }}>
          <p>⚠️ {errorMessage}</p>
          <button onClick={() => window.location.reload()}>Retry</button>
        </div>
      </Html>
    );
  }

  // Once we have a success and a URL, render the working STLMesh
  if (status === 'success' && convertedStlUrl) {
    return <STLMesh url={convertedStlUrl} />;
  }

  return null;
}

// Simple styling for the overlay
const loaderStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  color: 'white',
  background: 'rgba(0,0,0,0.5)',
  padding: '20px',
  borderRadius: '8px',
  fontFamily: 'sans-serif'
};