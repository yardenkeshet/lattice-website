import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { Banner } from '../components/ui/Banner'
import { Footer } from '../components/ui/Footer'
import { LatticeMenu } from '../components/ui/LatticeMenu'
import { TileMenu, defaultSliderValues } from '../components/ui/TileMenu'
import { Toolbar } from '../components/ui/Toolbar'
import { ViewerScene } from '../components/ViewerScene'
import { DualViewerLayout } from '../components/DualViewerLayout'
import { getLatticeSocket } from '../api/socketClient'
import { downloadResults, convertIgsToStl } from '../api/httpClient'
import { useStlBlobUrl } from '../lib/stl'
import type { TileType, CalcMode, ValidationError } from '../api/types'
import { DEFAULT_X_COUNT, DEFAULT_Y_COUNT, DEFAULT_Z_COUNT } from '../lib/utils'

/* ─── IGS conversion utility ─── */

/**
 * Sends a .igs file to the server's convert_igs_to_stl endpoint.
 * Returns the base64-encoded STL string and a synthetic STL File so
 * ViewerScene can render the converted mesh before calculation.
 */
async function convertIgsFile(file: File): Promise<{ stlB64: string; stlFile: File }> {
  const stlB64 = await convertIgsToStl(file)
  const binary = atob(stlB64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const stlName = file.name.replace(/\.igs$/i, '.stl')
  const stlFile = new File([bytes], stlName, { type: 'application/octet-stream' })
  console.log("converted to: ", {stlB64, stlFile})
  return { stlB64, stlFile }
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
  const [tileSliderValues, setTileSliderValues] = React.useState(defaultSliderValues('diagonal'))
  const [tilePreviewGzB64, setTilePreviewGzB64] = React.useState<string | null>(null)

  /* ── Lattice params ── */
  const [nt1, setNt1]               = React.useState(DEFAULT_X_COUNT)
  const [nt2, setNt2]               = React.useState(DEFAULT_Y_COUNT)
  const [nt3, setNt3]               = React.useState(DEFAULT_Z_COUNT)
  const [g1, setG1]                 = React.useState(0.57)
  const [g2, setG2]                 = React.useState(0.83)
  const [calcMode, setCalcMode]     = React.useState<CalcMode>('extrusion')

  /* ── File / result state ── */
  const [uploadedFile, setUploadedFile]   = React.useState<File | null>(null)
  const [uploadedB64, setUploadedB64]     = React.useState<string | null>(null)
  const [resultGzB64, setResultGzB64]     = React.useState<string | null>(null)
  const [downloadToken, setDownloadToken] = React.useState<string | null>(null)
  const [isCalculating, setIsCalculating] = React.useState(false)
  const [calcLabel, setCalcLabel]         = React.useState('Calculating…')
  const [errorMsg, setErrorMsg]           = React.useState<string | null>(null)

  /* ── Second file slot for ruling mode ── */
  const [uploadedFile2, setUploadedFile2] = React.useState<File | null>(null)

  /* ── Validation errors aggregated from child components ── */
  const [validationErrors, setValidationErrors] = React.useState<Record<string, ValidationError[]>>({})
  const handleValidationChange = React.useCallback((source: string, errors: ValidationError[]) => {
    setValidationErrors(prev => ({ ...prev, [source]: errors }))
  }, [])

  /* Ref so socket callbacks always see the current calcMode without a stale closure */
  const calcModeRef = React.useRef<CalcMode>(calcMode)
  React.useEffect(() => { calcModeRef.current = calcMode }, [calcMode])


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
      if (payload.kind === 'tile_stl') {
        // Tile preview from calculate_tile — update mini-preview and main viewer
        // (main viewer only in non-ruling mode; ruling mode shows two surfaces, not a tile)
        setTilePreviewGzB64(payload.stl_gz_b64)
        if (calcModeRef.current !== 'ruling') {
          setResultGzB64(payload.stl_gz_b64)
          if (pendingResetKey.current !== null) {
            setViewerResetKey(pendingResetKey.current)
            pendingResetKey.current = null
          }
        }
      } else {
        // model_stl from calculate — full lattice result
        setIsCalculating(false)
        setCalcLabel('Calculating…')
        setResultGzB64(payload.stl_gz_b64)
        setDownloadToken(payload.download_token)
        if (pendingResetKey.current !== null) {
          setViewerResetKey(pendingResetKey.current)
          pendingResetKey.current = null
        }
      }
    })
    const unsubError = socket.onError(err => {
      setIsCalculating(false)
      setCalcLabel('Calculating…')
      setErrorMsg(err.message)
    })
    const unsubUpdate = socket.onUpdate(upd => {
      if (upd.type === 'progress_start')  setCalcLabel(upd.message)
      else if (upd.type === 'progress_update') setCalcLabel(`Calculating… ${upd.progress}%`)
      else setCalcLabel('Calculating… 100%')
    })
    return () => { unsubResult(); unsubError(); unsubUpdate() }
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
        // Two files chosen: convert both and replace both slots immediately
        setViewerResetKey('file-' + Date.now())
        try {
          const [r1, r2] = await Promise.all([convertIgsFile(files[0]), convertIgsFile(files[1])])
          setUploadedFile(r1.stlFile)
          setUploadedFile2(r2.stlFile)
          setUploadedB64(r1.stlB64)
        } catch { setErrorMsg('Failed to convert IGS file') }
      } else {
        // One file: smart-fill next empty slot
        const file = files[0]
        if (!uploadedFile) {
          setViewerResetKey('file-' + Date.now())
          try {
            const { stlB64, stlFile } = await convertIgsFile(file)
            setUploadedFile(stlFile)
            setUploadedB64(stlB64)
          } catch { setErrorMsg('Failed to convert IGS file') }
        } else if (!uploadedFile2) {
          try {
            const { stlFile } = await convertIgsFile(file)
            setUploadedFile2(stlFile)
          } catch { setErrorMsg('Failed to convert IGS file') }
        } else {
          // Both full — cycle back and replace Surface 1
          setViewerResetKey('file-' + Date.now())
          try {
            const { stlB64, stlFile } = await convertIgsFile(file)
            setUploadedFile(stlFile)
            setUploadedB64(stlB64)
          } catch { setErrorMsg('Failed to convert IGS file') }
        }
      }
    } else {
      // Non-ruling: single file
      const file = files[0]
      setViewerResetKey('file-' + Date.now())
      try {
        const { stlB64, stlFile } = await convertIgsFile(file)
        setUploadedFile(stlFile)
        setUploadedB64(stlB64)
      } catch { setErrorMsg('Failed to convert IGS file') }
    }
  }

  /* Drag-drop onto DualViewerLayout panel 1 — always replaces Surface 1 */
  const handleFile1Drop = async (file: File) => {
    setResultGzB64(null)
    try {
      const { stlB64, stlFile } = await convertIgsFile(file)
      setUploadedFile(stlFile)
      setUploadedB64(stlB64)
    } catch { setErrorMsg('Failed to convert IGS file') }
  }

  /* Drag-drop onto DualViewerLayout panel 2 — always replaces Surface 2.
     Surface 2 b64 is not yet forwarded in the calculate payload
     (backend integration deferred — see spec §7 Out of Scope). */
  const handleFile2Drop = async (file: File) => {
    setResultGzB64(null)
    try {
      const { stlFile } = await convertIgsFile(file)
      setUploadedFile2(stlFile)
    } catch { setErrorMsg('Failed to convert IGS file') }
  }

  /* ── Clear handlers ── */
  const handleClearSingle = () => {
    setUploadedFile(null)
    setUploadedB64(null)
    setResultGzB64(null)
    setDownloadToken(null)
  }

  const handleClear1 = () => {
    setUploadedFile(null)
    setUploadedB64(null)
  }

  const handleClear2 = () => {
    setUploadedFile2(null)
  }

  /* ── Calculate ── */
  const handleCalculate = () => {
    // Check aggregated validation errors first
    const allErrors = Object.values(validationErrors).flat()
    if (allErrors.length > 0) {
      setErrorMsg(allErrors[0].message)
      return
    }

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
      // uploadedB64 is read asynchronously; guard ensures it is ready
      if (!uploadedB64) {
        setErrorMsg('Surface 1 is still loading — please wait a moment')
        return
      }
    } else {
      if (!uploadedFile || !uploadedB64) {
        setErrorMsg('Please upload a 3D file first')
        return
      }
    }
    pendingResetKey.current = 'calc-' + Date.now()
    setIsCalculating(true)
    setCalcLabel('Calculating…')
    setResultGzB64(null)
    setDownloadToken(null)
    setErrorMsg(null)
    console.log("socket please calculate with: ",{
      filename: uploadedFile!.name,
      stl_text_b64: uploadedB64!,
      client_ts: performance.now(),
      args: {
        filename: uploadedFile!.name,
        client_ts: performance.now(),
        args: { tileType, nt1, nt2, nt3, g1, g2, p1: tileSliderValues[0], p2: tileSliderValues[1], p3: tileSliderValues[2],  },
      },
    })
    socket.calculate({
      filename: uploadedFile!.name,
      client_ts: performance.now(),
      args: { tileType, nt1, nt2, nt3, g1, g2, p1: tileSliderValues[0], p2: tileSliderValues[1], p3: tileSliderValues[2],  },
    })
  }

  /* ── Export ── */
  const handleExportStl = () => {
    if (!downloadToken) return
    downloadResults(downloadToken, 'stl').catch(() => setErrorMsg('Download failed'))
  }
  const handleExportIgs = () => {
    if (!downloadToken) return
    downloadResults(downloadToken, 'igs').catch(() => setErrorMsg('Download failed'))
  }

  return (
    <div style={pageStyle}>
      <Banner onLeftLogoClick={() => navigate('/')} />

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
            onExportStl={handleExportStl}
            onExportIgs={handleExportIgs}
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
              calcLabel={calcLabel}
              onZoomChange={setZoom}
              onCameraModeChange={setCameraMode}
              onFilesAdd={handleFilesAdd}
              onCalculate={handleCalculate}
              fileNames={[uploadedFile?.name, uploadedFile2?.name].filter((n): n is string => !!n)}
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
                  onClear1={handleClear1}
                  onClear2={handleClear2}
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
                  onClear={handleClearSingle}
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
              onValidationChange={handleValidationChange}
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
  maxHeight: 395,
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
