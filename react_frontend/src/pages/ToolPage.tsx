import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { Banner } from '../components/ui/Banner'
import { Navbar } from '../components/ui/Navbar'
import { Footer } from '../components/ui/Footer'
import { LatticeMenu } from '../components/ui/LatticeMenu'
import { TileMenu, defaultSliderValues } from '../components/ui/TileMenu'
import { Toolbar } from '../components/ui/Toolbar'
import { ViewerSceneAndDrop } from '../components/ViewerSceneAndDrop'
import { getLatticeSocket } from '../api/socketClient'
import { downloadResults } from '../api/httpClient'
import { useStlBlobUrl } from '../lib/stl'
import type { TileType, VIEWER_ORDER } from '../api/types'

/* ─── File reading utility ─── */

async function readFileAsB64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // result is "data:<mime>;base64,<data>" — strip the prefix
      const b64 = result.split(',')[1]
      resolve(b64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/* ─── ToolPage ─── */

export function ToolPage() {
  const navigate = useNavigate()
  const socket = getLatticeSocket()

  /* ── UI state ── */
  const [isLatticeMenuOpen, setIsLatticeMenuOpen] = React.useState(true)
  const [isTileMenuOpen, setIsTileMenuOpen]       = React.useState(false)
  const [zoom, setZoom]                           = React.useState(100)
  const [cameraMode, setCameraMode]               = React.useState<'perspective' | 'orthographic'>('perspective')

  /* ── Tile state ── */
  const [tileType, setTileType]           = React.useState<TileType>('diagonal')
  const [tileSliderValues, setTileSliderValues] = React.useState(() => defaultSliderValues('diagonal'))
  const [tilePreviewGzB64, setTilePreviewGzB64] = React.useState<string | null>(null)

  /* ── Lattice params ── */
  const [nt1, setNt1]               = React.useState(10)
  const [nt2, setNt2]               = React.useState(10)
  const [nt3, setNt3]               = React.useState(1)
  const [g1, setG1]                 = React.useState(0.57)
  const [g2, setG2]                 = React.useState(0.83)
  const [calcMode, setCalcMode]     = React.useState<'extrusion' | 'revolution'>('extrusion')

  /* ── File / result state ── */
  const [uploadedFile, setUploadedFile]   = React.useState<File | null>(null)
  const [uploadedB64, setUploadedB64]     = React.useState<string | null>(null)
  const [resultGzB64, setResultGzB64]     = React.useState<string | null>(null)
  const [downloadToken, setDownloadToken] = React.useState<string | null>(null)
  const [isCalculating, setIsCalculating] = React.useState(false)
  const [errorMsg, setErrorMsg]           = React.useState<string | null>(null)
  const [modelPreviewOrder, setModelPreviewOrder] = React.useState<VIEWER_ORDER>('tile_preview') 
  const [igesUrl, setIgesUrl] = React.useState<string | null>(null);

  /* Blob URL for the tile mini preview in LatticeMenu */
  const tilePreviewUrl = useStlBlobUrl(tilePreviewGzB64)

  /* ── Socket subscriptions ── */
  React.useEffect(() => {
  const unsubResult = socket.onResult((payload) => {
    setIsCalculating(false)
    console.log("Received result payload:", payload);
    // 1. Check for the new IGS kind we defined in the backend
    if (payload.kind === 'model_igs') {
      console.log('Received model IGS result:', payload);
      
      // Use the new igs_gz_b64 key
      setResultGzB64(payload.igs_gz_b64);
      
      // Update preview order logic
      setModelPreviewOrder(payload.igs_gz_b64 ? 'result' : 'tile_preview');
      
      // If the backend sent a download token, save it
      if (payload.download_token) {
        setDownloadToken(payload.download_token);
      }

    } else if (payload.kind === 'tile_stl') {
      // Keeping this for your tile preview if that still uses STL
      console.log('Received tile preview:', payload);
      setTilePreviewGzB64(payload.stl_gz_b64);
      
      if (resultGzB64 === null) {
        setModelPreviewOrder('tile_preview');
      }
    } else if (payload.kind === 'model_preview_stl') {
      // Keeping this for your tile preview if that still uses STL
      console.log('Received model_preview_stl:', payload);
      setResultGzB64(payload.stl_gz_b64);
      
    } else {
      // Fallback for other kinds or unexpected payloads
      if (payload.download_token) {
        setDownloadToken(payload.download_token);
      }
    }
  })

  const unsubError = socket.onError(err => {
    console.log("Got error:", err);
    setIsCalculating(false);
    setErrorMsg(err.message || "An unknown error occurred");
  })

  return () => { 
    unsubResult(); 
    unsubError(); 
  }
}, [socket, resultGzB64]) // Added resultGzB64 to dependencies for the preview order logic

  /* ── Tile param commit (mouse-up or badge Enter) → calculateTile ── */
  const handleTileSliderCommit = React.useCallback((values: number[]) => {
    const padded: [number, number, number] = [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0]
    socket.calculateTile({ type: tileType, values: padded })
  }, [socket, tileType])

  const handleTileTypeChange = (type: TileType) => {
    setTileType(type)
    const defaults = defaultSliderValues(type)
    setTileSliderValues(defaults)
    const padded: [number, number, number] = [defaults[0] ?? 0, defaults[1] ?? 0, defaults[2] ?? 0]
    socket.calculateTile({ type, values: padded })
  }

  /* ── File upload ── */
  const handleFileAdd = async (file: File) => {
  try {

      // 1. file.text() returns a Promise, so you must await it
      const fileContent = await file.text();
    console.log("Added file :", { 
        filename: file.name, 
        data: fileContent 
      });
    setResultGzB64(null)      // clear previous result
    setDownloadToken(null)
    setErrorMsg(null)
    setUploadedFile(file)
    setModelPreviewOrder('uploaded')
      // 2. Emit the payload matching the key ('data') the backend expects
      // If using standard socket.io-client syntax:
      socket.convertIGESToSTL({ 
        filename: file.name, 
        data: fileContent 
      });

      // Alternatively, if you are using a custom wrapper object:
      // socket.convertIGESToSTL({ filename: file.name, data: fileContent });

    } catch (err) {
      console.error("Failed to read file text:", err);
    }

    
    // if(file)
    // {
    //   const url = URL.createObjectURL(file);
    //   setIgesUrl(url);
    // }
    // try {
    //   const b64 = await readFileAsB64(file)
    //   setUploadedB64(b64)
    // } catch {
    //   setErrorMsg('Failed to read file')
    // }
  }

  /* ── Calculate ── */
  const handleCalculate = () => {
    if (!uploadedFile ) {
      setErrorMsg('Please upload a 3D file first')
      return
    }
    setIsCalculating(true)
    setResultGzB64(null)
    setDownloadToken(null)
    setErrorMsg(null)
    console.log("Emitting calculate with file:", uploadedFile);
    // socket.calculate({
    //   filename: uploadedFile.name,
    //   stl_text_b64: uploadedFile ,
    //   client_ts: performance.now(),
    //   args: { tileType, nt1, nt2, nt3, g1, g2 },
    // })
if (!uploadedFile) {
        console.error("No file selected");
        return;
    }

    const reader = new FileReader();

    reader.onload = () => {
        // reader.result will be a Data URL (e.g., "data:application/octet-stream;base64,AAAA...")
        // We need to strip the prefix to get just the base64 string
        const base64String = (reader.result as string).split(',')[1];

        // Assuming 'socket' is your Socket.IO client instance
        socket.calculate({
            filename: uploadedFile.name,
            igs_b64: base64String, 
            client_ts: Date.now(),
            args: {
                tileType: 'diagonal',
                nt1: 10,
                nt2: 10,
                nt3: 1,
                g1: 0.57,
                g2: 0.83
            }
        });
    };

    reader.onerror = (error) => {
        console.error("Error reading file:", error);
    };

    reader.readAsDataURL(uploadedFile);
  }

  /* ── Export ── */
  const handleExport = () => {
    if (!downloadToken) return
    downloadResults(downloadToken).catch(() => setErrorMsg('Download failed'))
  }


    const handleTileSliderChange = React.useCallback((values: number[]) => {
    setTileSliderValues(values)
  }, [])
  return (
    <div style={pageStyle}>
      <Banner />
      <Navbar activePage="tool" onNavigate={page => navigate(page === 'home' ? '/' : '/tool')} />

      {/* ── Workspace ── */}
      <div style={workspaceStyle}>

        {/* Left: LatticeMenu (collapsible) */}
        <div style={leftPanelStyle}>
          <LatticeMenu
            tileType={tileType}
            tilePreviewUrl={tilePreviewUrl}
            nt1={nt1} nt2={nt2} nt3={nt3}
            g1={g1} g2={g2}
            calculationMode={calcMode}
            canExport={!!downloadToken}
            isOpen={isLatticeMenuOpen}
            onNt1Change={setNt1} onNt2Change={setNt2} onNt3Change={setNt3}
            onG1Change={setG1} onG2Change={setG2}
            onCalculationModeChange={setCalcMode}
            onOpenTileMenu={() => setIsTileMenuOpen(true)}
            onExport={handleExport}
            onToggle={() => setIsLatticeMenuOpen(o => !o)}
          />
        </div>

        {/* Centre: Toolbar + ViewerScene */}
        <div style={centerStyle}>
          <div style={toolbarRowStyle}>
            <Toolbar
              zoom={zoom}
              cameraMode={cameraMode}
              isCalculating={isCalculating}
              onZoomChange={setZoom}
              onCameraModeChange={setCameraMode}
              onFileAdd={handleFileAdd}
              onCalculate={handleCalculate}
            />
          </div>

          {/* Error message */}
          {errorMsg && (
            <div style={errorStyle} role="alert">
              {errorMsg}
              <button
                type="button"
                aria-label="Dismiss error"
                onClick={() => setErrorMsg(null)}
                style={errorDismissStyle}
              >✕</button>
            </div>
          )}

          <div style={viewerStyle}>
            <ViewerSceneAndDrop
              // model={modelPreviewOrder === 'uploaded' 
              //   ? {type: 'iges', data: igesUrl} : 
              //   { type: 'stl', data: modelPreviewOrder === 'result' ? resultGzB64 : (modelPreviewOrder === 'tile_preview' ? tilePreviewGzB64 : null) }}
              // model={ {type: 'stl', data: resultGzB64 }}
              model={ {type: 'stl', data: resultGzB64 ?? tilePreviewGzB64}}
              cameraMode={cameraMode}
              zoom={zoom}
              onZoomChange={setZoom}
              onFileDrop={handleFileAdd}
            />
          </div>
        </div>

        {/* Right: TileMenu (conditionally shown) */}
        {isTileMenuOpen && (
          <div style={rightPanelStyle}>
            <TileMenu
              tileType={tileType}
              sliderValues={tileSliderValues}
              previewStlGzB64={tilePreviewGzB64 ?? undefined}
              onTileTypeChange={handleTileTypeChange}
              onSliderChange={handleTileSliderChange}
              onSliderCommit={handleTileSliderCommit}
              onClose={() => setIsTileMenuOpen(false)}
            />
          </div>
        )}
      </div>

      <Footer />
    </div>
  )
}

/* ─── Styles ─── */

const pageStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  minHeight: '100vh',
  backgroundColor: 'var(--bg-primary)',
}

const workspaceStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'flex-start',
  gap: 0,
  backgroundColor: '#e3e3e3',
  padding: 0,
  position: 'relative',
}

const leftPanelStyle: React.CSSProperties = {
  flexShrink: 0,
  padding: '20px 0 20px 20px',
  alignSelf: 'flex-start',
}

const centerStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: 20,
  minWidth: 0,
}

const toolbarRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
}

const viewerStyle: React.CSSProperties = {
  // flex: 1,
  minHeight: 500,
  borderRadius: 12,
  overflow: 'hidden',
  height: 0,
}

const rightPanelStyle: React.CSSProperties = {
  flexShrink: 0,
  padding: '20px 20px 20px 0',
  alignSelf: 'flex-start',
}

const errorStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  padding: '8px 12px',
  backgroundColor: 'var(--status-error-bg)',
  borderRadius: 'var(--radius-card)',
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-size-sm)',
  color: 'var(--text-error)',
}

const errorDismissStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--text-error)',
  fontSize: 12,
  padding: 0,
}
