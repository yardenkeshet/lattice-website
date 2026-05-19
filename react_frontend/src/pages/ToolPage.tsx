import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { Banner } from '../components/ui/Banner'
import { Navbar } from '../components/ui/Navbar'
import { Footer } from '../components/ui/Footer'
import { LatticeMenu } from '../components/ui/LatticeMenu'
import { TileMenu, defaultSliderValues } from '../components/ui/TileMenu'
import { Toolbar } from '../components/ui/Toolbar'
import { ViewerScene } from '../components/ViewerScene'
import { getLatticeSocket } from '../api/socketClient'
import { downloadResults } from '../api/httpClient'
import { useStlBlobUrl } from '../lib/stl'
import type { TileType } from '../api/types'

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
  const [isTileMenuOpen, setIsTileMenuOpen]       = React.useState(true)
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

  /* Blob URL for the tile mini preview in LatticeMenu */
  const tilePreviewUrl = useStlBlobUrl(tilePreviewGzB64)

  /* ── Fire calculateTile once on mount so preview is ready when TileMenu opens ── */
  React.useEffect(() => {
    const padded: [number, number, number] = [
      tileSliderValues[0] ?? 0,
      tileSliderValues[1] ?? 0,
      tileSliderValues[2] ?? 0,
    ]
    socket.calculateTile({ type: tileType, values: padded })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ── Socket subscriptions ── */
  React.useEffect(() => {
    const unsubResult = socket.onResult(payload => {
      setIsCalculating(false)
      if (payload.kind === 'stl') {
        setResultGzB64(payload.stl_gz_b64)
        setTilePreviewGzB64(payload.stl_gz_b64) // also update tile preview
      } else {
        setDownloadToken(payload.download_token)
      }
    })
    const unsubError = socket.onError(err => {
      setIsCalculating(false)
      setErrorMsg(err.message)
    })
    return () => { unsubResult(); unsubError() }
  }, [socket])

  /* ── Tile param change → update state only (no backend call on drag) ── */
  const handleTileSliderChange = React.useCallback((values: number[]) => {
    setTileSliderValues(values)
  }, [])

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
    setUploadedFile(file)
    setResultGzB64(null)      // clear previous result
    setDownloadToken(null)
    setErrorMsg(null)
    try {
      const b64 = await readFileAsB64(file)
      setUploadedB64(b64)
    } catch {
      setErrorMsg('Failed to read file')
    }
  }

  /* ── Calculate ── */
  const handleCalculate = () => {
    if (!uploadedFile || !uploadedB64) {
      setErrorMsg('Please upload a 3D file first')
      return
    }
    setIsCalculating(true)
    setResultGzB64(null)
    setDownloadToken(null)
    setErrorMsg(null)
    socket.calculate({
      filename: uploadedFile.name,
      stl_text_b64: uploadedB64,
      client_ts: performance.now(),
      args: { tileType, nt1, nt2, nt3, g1, g2 },
    })
  }

  /* ── Export ── */
  const handleExport = () => {
    if (!downloadToken) return
    downloadResults(downloadToken).catch(() => setErrorMsg('Download failed'))
  }

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
            <ViewerScene
              uploadedFile={uploadedFile}
              resultStlGzB64={resultGzB64}
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
  flex: 1,
  minHeight: 500,
  borderRadius: 12,
  overflow: 'hidden',
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
