import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { Banner } from '../components/ui/Banner'
import { Navbar } from '../components/ui/Navbar'
import { Footer } from '../components/ui/Footer'
import { LatticeMenu } from '../components/ui/LatticeMenu'
import { TileMenu, defaultSliderValues } from '../components/ui/TileMenu'
import { Toolbar } from '../components/ui/Toolbar'
import { ViewerScene } from '../components/ViewerScene'
import { DualViewerLayout } from '../components/DualViewerLayout'
import { getLatticeSocket } from '../api/socketClient'
import { downloadResults } from '../api/httpClient'
import { useStlBlobUrl } from '../lib/stl'
import type { TileType, CalcMode } from '../api/types'

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
  const [viewerResetKey, setViewerResetKey]       = React.useState('initial')
  /* Tracks what kind of action triggered the last backend call so the result
     handler knows whether to reset the viewer camera. null = no reset. */
  const pendingResetKey = React.useRef<string | null>(null)

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
  const [calcMode, setCalcMode]     = React.useState<CalcMode>('extrusion')

  /* ── File / result state ── */
  const [uploadedFile, setUploadedFile]   = React.useState<File | null>(null)
  const [uploadedB64, setUploadedB64]     = React.useState<string | null>(null)
  const [resultGzB64, setResultGzB64]     = React.useState<string | null>(null)
  const [downloadToken, setDownloadToken] = React.useState<string | null>(null)
  const [isCalculating, setIsCalculating] = React.useState(false)
  const [errorMsg, setErrorMsg]           = React.useState<string | null>(null)

  /* ── Second file slot for ruling mode ── */
  const [uploadedFile2, setUploadedFile2] = React.useState<File | null>(null)

  /* Ref so socket callbacks always see the current calcMode without a stale closure */
  const calcModeRef = React.useRef<CalcMode>(calcMode)
  React.useEffect(() => { calcModeRef.current = calcMode }, [calcMode])

  /* True while a full lattice `calculate` result is in-flight; false for tile results */
  const pendingResultIsLattice = React.useRef<boolean>(false)

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
      if (payload.kind === 'stl') {
        setIsCalculating(false)
        const isLattice = pendingResultIsLattice.current
        pendingResultIsLattice.current = false

        // Always update the tile mini-preview (LatticeMenu + TileMenu)
        setTilePreviewGzB64(payload.stl_gz_b64)

        // Only push into the main viewer if this is a full lattice result,
        // OR we are not in ruling mode (tiles are shown in the main viewer in non-ruling modes)
        if (isLattice || calcModeRef.current !== 'ruling') {
          setResultGzB64(payload.stl_gz_b64)
          if (pendingResetKey.current !== null) {
            setViewerResetKey(pendingResetKey.current)
            pendingResetKey.current = null
          }
        }
      } else {
        setIsCalculating(false)
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

  /* ── Tile param commit (mouse-up or badge Enter) → calculateTile, no camera reset ── */
  const handleTileSliderCommit = React.useCallback((values: number[]) => {
    pendingResetKey.current = null
    const padded: [number, number, number] = [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0]
    socket.calculateTile({ type: tileType, values: padded })
  }, [socket, tileType])

  const handleTileTypeChange = (type: TileType) => {
    pendingResetKey.current = type  // camera resets to match new tile type
    setTileType(type)
    const defaults = defaultSliderValues(type)
    setTileSliderValues(defaults)
    const padded: [number, number, number] = [defaults[0] ?? 0, defaults[1] ?? 0, defaults[2] ?? 0]
    socket.calculateTile({ type, values: padded })
  }

  const handleCalcModeChange = (mode: CalcMode) => {
    // Clear result and second file on every transition; keep uploadedFile (Surface 1) always
    setResultGzB64(null)
    setDownloadToken(null)
    setErrorMsg(null)
    setUploadedFile2(null)
    setCalcMode(mode)
  }

  /* ── File upload ── */
  const handleFilesAdd = async (files: File[]) => {
    setResultGzB64(null)
    setDownloadToken(null)
    setErrorMsg(null)

    if (calcMode === 'ruling') {
      if (files.length >= 2) {
        // Two files chosen: replace both slots immediately
        setViewerResetKey('file-' + Date.now())
        setUploadedFile(files[0])
        setUploadedFile2(files[1])
        try { setUploadedB64(await readFileAsB64(files[0])) }
        catch { setErrorMsg('Failed to read file') }
      } else {
        // One file: smart-fill next empty slot
        const file = files[0]
        if (!uploadedFile) {
          setViewerResetKey('file-' + Date.now())
          setUploadedFile(file)
          try { setUploadedB64(await readFileAsB64(file)) }
          catch { setErrorMsg('Failed to read file') }
        } else if (!uploadedFile2) {
          setUploadedFile2(file)
        } else {
          // Both full — cycle back and replace Surface 1
          setViewerResetKey('file-' + Date.now())
          setUploadedFile(file)
          try { setUploadedB64(await readFileAsB64(file)) }
          catch { setErrorMsg('Failed to read file') }
        }
      }
    } else {
      // Non-ruling: single file, same as original handleFileAdd
      const file = files[0]
      setViewerResetKey('file-' + Date.now())
      setUploadedFile(file)
      try { setUploadedB64(await readFileAsB64(file)) }
      catch { setErrorMsg('Failed to read file') }
    }
  }

  /* Drag-drop onto DualViewerLayout panel 1 — always replaces Surface 1 */
  const handleFile1Drop = async (file: File) => {
    setUploadedFile(file)
    setResultGzB64(null)
    try { setUploadedB64(await readFileAsB64(file)) }
    catch { setErrorMsg('Failed to read file') }
  }

  /* Drag-drop onto DualViewerLayout panel 2 — always replaces Surface 2.
     No b64 read: Surface 2 is not yet forwarded in the calculate payload
     (backend integration deferred — see spec §7 Out of Scope). */
  const handleFile2Drop = (file: File) => {
    setUploadedFile2(file)
    setResultGzB64(null)
  }

  /* ── Calculate ── */
  const handleCalculate = () => {
    if (calcMode === 'ruling') {
      if (!uploadedFile && !uploadedFile2) {
        setErrorMsg('Please upload both surface files')
        return
      }
      if (!uploadedFile) {
        setErrorMsg('Please upload Surface 1')
        return
      }
      if (!uploadedFile2) {
        setErrorMsg('Please upload Surface 2')
        return
      }
    } else {
      if (!uploadedFile || !uploadedB64) {
        setErrorMsg('Please upload a 3D file first')
        return
      }
    }
    pendingResultIsLattice.current = true
    pendingResetKey.current = 'calc-' + Date.now()
    setIsCalculating(true)
    setResultGzB64(null)
    setDownloadToken(null)
    setErrorMsg(null)
    socket.calculate({
      filename: uploadedFile!.name,
      stl_text_b64: uploadedB64!,
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
            onCalculationModeChange={handleCalcModeChange}
            onOpenTileMenu={() => setIsTileMenuOpen(true)}
            onExport={handleExport}
            onToggle={() => setIsLatticeMenuOpen(o => !o)}
          />
        </div>

        {/* Centre: Toolbar + ViewerScene */}
        <div style={centerStyle}>
          <div style={toolbarRowStyle}>
            <Toolbar
              calcMode={calcMode}
              zoom={zoom}
              cameraMode={cameraMode}
              isCalculating={isCalculating}
              onZoomChange={setZoom}
              onCameraModeChange={setCameraMode}
              onFilesAdd={handleFilesAdd}
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
            {calcMode === 'ruling' && !resultGzB64
              ? (
                <DualViewerLayout
                  file1={uploadedFile}
                  file2={uploadedFile2}
                  onFile1Drop={handleFile1Drop}
                  onFile2Drop={handleFile2Drop}
                  cameraMode={cameraMode}
                  zoom={zoom}
                  onZoomChange={setZoom}
                  style={{ height: '100%' }}
                />
              )
              : (
                <ViewerScene
                  uploadedFile={uploadedFile}
                  resultStlGzB64={resultGzB64}
                  cameraMode={cameraMode}
                  zoom={zoom}
                  cameraResetKey={viewerResetKey}
                  onZoomChange={setZoom}
                  onFileDrop={f => handleFilesAdd([f])}
                />
              )
            }
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
  minHeight: 0,
  maxHeight: '395',
}

const toolbarRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
}

const viewerStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  borderRadius: 12,
  overflow: 'hidden',
}

const rightPanelStyle: React.CSSProperties = {
  flexShrink: 0,
  padding: '20px 20px 20px 0',
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
