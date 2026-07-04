import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { Banner } from '../components/ui/Banner'
import { Footer } from '../components/ui/Footer'
import { LatticeMenu } from '../components/ui/LatticeMenu'
import { TileMenu, defaultSliderValues } from '../components/ui/TileMenu'
import { Toolbar } from '../components/ui/Toolbar'
import { ViewerScene } from '../components/ViewerScene'
import type { MeshLayer } from '../components/ViewerScene'
import { getLatticeSocket } from '../api/socketClient'
import { downloadResults, convertIgsToStl, logCalculation } from '../api/httpClient'
import { stlTextToGzB64, useStlBlobUrl } from '../lib/stl'
import defaultTileUrl from '../assets/default_diagonal_tile.stl?url'
import {
  DEFAULT_X_COUNT, DEFAULT_Y_COUNT, DEFAULT_Z_COUNT,
  DEFAULT_TILE_TYPE, DEFAULT_CALC_MODE, DEFAULT_CAMERA_MODE,
  DEFAULT_G1, DEFAULT_G2,
  INITIAL_VIEWER_RESET_KEY,
  RULING,
  DEFAULT_MODEL_COLOR as DEFAULT_MESH_COLOR,
  DEFAULT_BACKGROUND_COLOR,
} from '../lib/parameters'
import { type CalcMode, type TileType } from '../calculation_params'
import type { CalculateArgs, ValidationError } from '../api/types'

/* ─── IGS conversion utility ─── */

/**
 * Sends a .igs file to the server's convert_igs_to_stl endpoint for preview
 * purposes, and also returns the original IGS bytes (base64) so the caller
 * can resend them at Calculate time — the backend no longer persists
 * uploaded files between requests.
 */
async function convertIgsFile(file: File): Promise<{ stlFile: File; igsB64: string }> {
  const [stlB64, igsB64] = await Promise.all([convertIgsToStl(file), fileToBase64(file)])
  const binary = atob(stlB64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const stlName = file.name.replace(/\.igs$/i, '.stl')
  const stlFile = new File([bytes], stlName, { type: 'application/octet-stream' })
  return { stlFile, igsB64 }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/* ─── ToolPage ─── */

export function ToolPage() {
  const navigate = useNavigate()
  const socket = getLatticeSocket()

  /* ── UI state ── */
  const [cameraMode, setCameraMode]               = React.useState<'perspective' | 'orthographic'>(DEFAULT_CAMERA_MODE)
  const [viewerResetKey, setViewerResetKey]       = React.useState(INITIAL_VIEWER_RESET_KEY)
  /* Tracks what kind of action triggered the last backend call so the result
     handler knows whether to reset the viewer camera. null = no reset. */
  const pendingResetKey = React.useRef<string | null>(null)

  /* ── Tile state ── */
  const [tileType, setTileType]           = React.useState<TileType>(DEFAULT_TILE_TYPE)
  const [tileSliderValues, setTileSliderValues] = React.useState(defaultSliderValues(DEFAULT_TILE_TYPE))
  const [tilePreviewGzB64, setTilePreviewGzB64] = React.useState<string | null>(null)

  /* ── Lattice params ── */
  const [nt1, setNt1]               = React.useState(DEFAULT_X_COUNT)
  const [nt2, setNt2]               = React.useState(DEFAULT_Y_COUNT)
  const [nt3, setNt3]               = React.useState(DEFAULT_Z_COUNT)
  const [g1, setG1]                 = React.useState(DEFAULT_G1)
  const [g2, setG2]                 = React.useState(DEFAULT_G2)
  const [calcMode, setCalcMode]     = React.useState<CalcMode>(DEFAULT_CALC_MODE)
  const [meshColor, setMeshColor]     = React.useState<string>(DEFAULT_MESH_COLOR)
  const [backgroundColor, setBackgroundColor]     = React.useState<string>(DEFAULT_BACKGROUND_COLOR)


  /* ── File / result state ── */
  const [uploadedFile, setUploadedFile]   = React.useState<File | null>(null)
  const [uploadedIgsB64, setUploadedIgsB64] = React.useState<string | null>(null)
  const [resultGzB64, setResultGzB64]     = React.useState<string | null>(null)
  const [downloadToken, setDownloadToken] = React.useState<string | null>(null)
  const [isCalculating, setIsCalculating] = React.useState(false)
  const [calcLabel, setCalcLabel]         = React.useState('Calculating…')
  const [errorMsg, setErrorMsg]           = React.useState<string | null>(null)

  /* ── Second file slot for ruling mode ── */
  const [uploadedFile2, setUploadedFile2] = React.useState<File | null>(null)
  const [uploadedIgsB64_2, setUploadedIgsB64_2] = React.useState<string | null>(null)

  /* ── Blob URLs for uploaded surface files (created here, consumed by layer assembly) ── */
  const [uploadedBlobUrl, setUploadedBlobUrl] = React.useState<string | undefined>()
  React.useEffect(() => {
    if (!uploadedFile) { setUploadedBlobUrl(undefined); return }
    const url = URL.createObjectURL(uploadedFile)
    setUploadedBlobUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [uploadedFile])

  const [uploadedBlobUrl2, setUploadedBlobUrl2] = React.useState<string | undefined>()
  React.useEffect(() => {
    if (!uploadedFile2) { setUploadedBlobUrl2(undefined); return }
    const url = URL.createObjectURL(uploadedFile2)
    setUploadedBlobUrl2(url)
    return () => URL.revokeObjectURL(url)
  }, [uploadedFile2])

  /* ── Blob URL for calculation result (gz+b64 → Blob URL) ── */
  const resultBlobUrl = useStlBlobUrl(resultGzB64)

  /* ── Macro shape preview state ── */
  const [macroShapeGzB64, setMacroShapeGzB64] = React.useState<string | null>(null)
  const macroShapeBlobUrl = useStlBlobUrl(macroShapeGzB64)
  const pendingMacroRef = React.useRef(false)

  /* ── Layer assembly ── */
  const layers: MeshLayer[] = React.useMemo(() => {
    if (resultBlobUrl) return [{ blobUrl: resultBlobUrl }]
    return [
      uploadedBlobUrl      ? { blobUrl: uploadedBlobUrl }                    : null,
      uploadedBlobUrl2     ? { blobUrl: uploadedBlobUrl2 }                   : null,
      macroShapeBlobUrl    ? { blobUrl: macroShapeBlobUrl, opacity: 0.25 }   : null,
    ].filter((l): l is MeshLayer => l !== null)
  }, [resultBlobUrl, uploadedBlobUrl, uploadedBlobUrl2, macroShapeBlobUrl])

  /* ── Validation errors aggregated from child components ── */
  const [validationErrors, setValidationErrors] = React.useState<Record<string, ValidationError[]>>({})
  const handleValidationChange = React.useCallback((source: string, errors: ValidationError[]) => {
    setValidationErrors(prev => ({ ...prev, [source]: errors }))
  }, [])

  /* Ref so socket callbacks always see the current calcMode without a stale closure */
  const calcModeRef = React.useRef<CalcMode>(calcMode)
  React.useEffect(() => { calcModeRef.current = calcMode }, [calcMode])

  /* Refs so the result handler can tell whether the main canvas already has
     an uploaded file or a calculation result to show, without a stale closure */
  const uploadedFileRef = React.useRef<File | null>(uploadedFile)
  React.useEffect(() => { uploadedFileRef.current = uploadedFile }, [uploadedFile])

  const downloadTokenRef = React.useRef<string | null>(downloadToken)
  React.useEffect(() => { downloadTokenRef.current = downloadToken }, [downloadToken])

  /* Stashes the filename + args of the most recent completed calculation so
     the auto-fit-complete handler can upload a snapshot once the camera
     finishes fitting to the newly rendered result. Cleared (read-once) by
     handleAutoFitComplete regardless of whether it was set, so unrelated
     auto-fits (plain uploads, tile previews) never reuse stale data. */
  const pendingSnapshotRef = React.useRef<{ filename: string; args: CalculateArgs } | null>(null)


  /* ── Load bundled default tile on mount so preview is ready without a server round-trip ── */
  React.useEffect(() => {
    fetch(defaultTileUrl)
      .then(r => r.text())
      .then(text => {
        setTilePreviewGzB64(stlTextToGzB64(text))
        setResultGzB64(stlTextToGzB64(text))
      })
      .catch(() => {/* preview stays null; first slider commit will populate it */})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ── Socket subscriptions ── */
  React.useEffect(() => {
    const unsubResult = socket.onResult(payload => {
      console.log("socket: onResult: ", payload)
      if (payload.kind === 'tile_stl') {
        // Tile preview from calculate_tile — update mini-preview, and the main
        // viewer only when it has nothing else to show (no uploaded file or
        // calculation result, and not in ruling mode)
        setTilePreviewGzB64(payload.stl_gz_b64)
        if (calcModeRef.current !== RULING && !uploadedFileRef.current && !downloadTokenRef.current) {
          setResultGzB64(payload.stl_gz_b64)
          if (pendingResetKey.current !== null) {
            setViewerResetKey(pendingResetKey.current)
            pendingResetKey.current = null
          }
        }
      } else {
        // model_stl — either a macro shape preview or a real calculation result
        if (pendingMacroRef.current) {
          pendingMacroRef.current = false
          setMacroShapeGzB64(payload.stl_gz_b64)
        } else {
          setIsCalculating(false)
          setCalcLabel('Calculating…')
          setResultGzB64(payload.stl_gz_b64)
          setDownloadToken(payload.download_token)
          if (payload.args_echo) {
            pendingSnapshotRef.current = { filename: payload.filename, args: payload.args_echo }
          }
          if (pendingResetKey.current !== null) {
            setViewerResetKey(pendingResetKey.current)
            pendingResetKey.current = null
          }
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

  /* ── Auto-trigger macro shape preview when surfaces are uploaded ── */
  // Uses nt1=nt2=nt3=0 so the DLL returns the bounding envelope with no lattice.
  React.useEffect(() => {
    if (calcMode === RULING) {
      if (!uploadedIgsB64 || !uploadedIgsB64_2) return
    } else {
      if (!uploadedIgsB64) return
    }
    setMacroShapeGzB64(null)
    pendingMacroRef.current = true
    socket.calculate({
      filename: uploadedFile?.name ?? 'surface.igs',
      surface_b64: uploadedIgsB64,
      ...(calcMode === RULING ? { surface2_b64: uploadedIgsB64_2! } : {}),
      client_ts: performance.now(),
      args: {
        tileType,
        calcMode,
        nt1: 0, nt2: 0, nt3: 0,
        g1, g2,
        p1: tileSliderValues[0], p2: tileSliderValues[1], p3: tileSliderValues[2],
      },
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadedIgsB64, uploadedIgsB64_2, calcMode])

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

  const handleTileTypeChange = React.useCallback((type: TileType) => {
    pendingResetKey.current = type
    setTileType(type)
    const defaults = defaultSliderValues(type)
    setTileSliderValues(defaults)
    const padded: [number, number, number] = [defaults[0] ?? 0, defaults[1] ?? 0, defaults[2] ?? 0]
    socket.calculateTile({ type, values: padded })
  }, [socket])

  const handleCalcModeChange = React.useCallback((mode: CalcMode) => {
    setErrorMsg(null)
    setUploadedFile2(null)
    setUploadedIgsB64_2(null)
    setMacroShapeGzB64(null)
    setCalcMode(mode)
  }, [])

  /* ── File upload ── */
  const handleFilesAdd = React.useCallback(async (files: File[]) => {
    setResultGzB64(null)
    setErrorMsg(null)

    if (calcMode === RULING) {
      if (files.length >= 2) {
        setViewerResetKey('file-' + Date.now())
        try {
          const [r1, r2] = await Promise.all([convertIgsFile(files[0]), convertIgsFile(files[1])])
          setUploadedFile(r1.stlFile)
          setUploadedIgsB64(r1.igsB64)
          setUploadedFile2(r2.stlFile)
          setUploadedIgsB64_2(r2.igsB64)
        } catch { setErrorMsg('Failed to convert IGS file') }
      } else {
        const file = files[0]
        if (!uploadedFile) {
          setViewerResetKey('file-' + Date.now())
          try {
            const { stlFile, igsB64 } = await convertIgsFile(file)
            setUploadedFile(stlFile)
            setUploadedIgsB64(igsB64)
          } catch { setErrorMsg('Failed to convert IGS file') }
        } else if (!uploadedFile2) {
          try {
            const { stlFile, igsB64 } = await convertIgsFile(file)
            setUploadedFile2(stlFile)
            setUploadedIgsB64_2(igsB64)
          } catch { setErrorMsg('Failed to convert IGS file') }
        } else {
          setViewerResetKey('file-' + Date.now())
          try {
            const { stlFile, igsB64 } = await convertIgsFile(file)
            setUploadedFile(stlFile)
            setUploadedIgsB64(igsB64)
          } catch { setErrorMsg('Failed to convert IGS file') }
        }
      }
    } else {
      const file = files[0]
      setViewerResetKey('file-' + Date.now())
      try {
        const { stlFile, igsB64 } = await convertIgsFile(file)
        setUploadedFile(stlFile)
        setUploadedIgsB64(igsB64)
      } catch { setErrorMsg('Failed to convert IGS file') }
    }
  }, [calcMode, uploadedFile, uploadedFile2])

  /* ── Clear handlers ── */
  const handleClear1 = React.useCallback(() => {
    setUploadedFile(null)
    setUploadedIgsB64(null)
    setMacroShapeGzB64(null)
  }, [])

  const handleClear2 = React.useCallback(() => {
    setUploadedFile2(null)
    setUploadedIgsB64_2(null)
    setMacroShapeGzB64(null)
  }, [])

  /* ── Calculate ── */
  const handleCalculate = React.useCallback(() => {
    pendingMacroRef.current = false  // cancel any in-flight macro preview routing
    const allErrors = Object.values(validationErrors).flat()
    if (allErrors.length > 0) {
      setErrorMsg(allErrors[0].message)
      return
    }

    if (calcMode === RULING) {
      if (!uploadedFile && !uploadedFile2) {
        setErrorMsg('Please upload both surface files')
        return
      }
      if (!uploadedFile || !uploadedIgsB64) {
        setErrorMsg('Please upload Surface 1')
        return
      }
      if (!uploadedFile2 || !uploadedIgsB64_2) {
        setErrorMsg('Please upload Surface 2')
        return
      }
    } else {
      if (!uploadedFile || !uploadedIgsB64) {
        setErrorMsg('Please upload a 3D file first')
        return
      }
    }
    pendingResetKey.current = 'calc-' + Date.now()
    setIsCalculating(true)
    setCalcLabel('Calculating…')
    setErrorMsg(null)
    const calculateArgs = {
      filename: uploadedFile!.name,
      surface_b64: uploadedIgsB64!,
      ...(calcMode === RULING ? { surface2_b64: uploadedIgsB64_2! } : {}),
      client_ts: performance.now(),
      args: { tileType, calcMode, nt1, nt2, nt3, g1, g2, p1: tileSliderValues[0], p2: tileSliderValues[1], p3: tileSliderValues[2] },
    }
    socket.calculate(calculateArgs)
  }, [validationErrors, calcMode, uploadedFile, uploadedFile2, uploadedIgsB64, uploadedIgsB64_2, nt1, nt2, nt3, g1, g2, tileSliderValues, tileType, socket])

  /* ── Export ── */
  const handleExportStl = React.useCallback(() => {
    if (!downloadToken) return
    downloadResults(downloadToken, 'stl').catch(() => setErrorMsg('Download failed'))
  }, [downloadToken])

  const handleExportIgs = React.useCallback(() => {
    if (!downloadToken) return
    downloadResults(downloadToken, 'igs').catch(() => setErrorMsg('Download failed'))
  }, [downloadToken])

  /* ── Stable derived callbacks to avoid inline lambdas on memoized children ── */
  const handleViewerFileDrop = React.useCallback((f: File) => handleFilesAdd([f]), [handleFilesAdd])

  /* ── Auto-fit-complete → upload a calc-log snapshot, but only when the
     fit was triggered by a completed calculation (pendingSnapshotRef set) ── */
  const handleAutoFitComplete = React.useCallback((canvas: HTMLCanvasElement | null) => {
    const pending = pendingSnapshotRef.current
    pendingSnapshotRef.current = null
    if (!pending || !canvas) return
    // Two rAFs: the first fires before R3F's invalidate()-scheduled render (rAF-B),
    // the second fires after it, so toBlob captures the newly rendered frame.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        canvas.toBlob(blob => {
          if (!blob) return
          logCalculation(blob, pending.filename, pending.args).catch(err => {
            console.warn('calc log snapshot failed to upload', err)
          })
        }, 'image/png')
      })
    })
  }, [])

  const fileNames = React.useMemo(
    () => [uploadedFile?.name, uploadedFile2?.name].filter((n): n is string => !!n),
    [uploadedFile, uploadedFile2]
  )

  const handleFileRemove = React.useCallback((name: string) => {
    if (uploadedFile?.name === name) handleClear1()
    else if (uploadedFile2?.name === name) handleClear2()
  }, [uploadedFile, uploadedFile2, handleClear1, handleClear2])

  return (
    <div style={pageStyle}>
      <Banner onClick={() => navigate('/')}/>

      {/* ── Workspace ── */}
      <div style={workspaceStyle}>

        {/* Left: LatticeMenu */}
        <div style={leftPanelStyle}>
          <LatticeMenu
            nt1={nt1} nt2={nt2} nt3={nt3}
            g1={g1} g2={g2}
            calculationMode={calcMode}
            onNt1Change={setNt1} onNt2Change={setNt2} onNt3Change={setNt3}
            onG1Change={setG1} onG2Change={setG2}
            onCalculationModeChange={handleCalcModeChange}
            onFilesAdd={handleFilesAdd}
            onFileRemove={handleFileRemove}
            fileNames={fileNames}
            calcMode={calcMode}
            modelColor={meshColor}
            setModelColor={setMeshColor}
            backgroundColor={backgroundColor}
            setBackgroundColor={setBackgroundColor}
            />
        </div>

        {/* Centre: Toolbar + ViewerScene */}
        <div style={centerStyle}>
          <div style={toolbarRowStyle}>
            <Toolbar
              onCalculate={handleCalculate}
              cameraMode={cameraMode}
              isCalculating={isCalculating}
              calcLabel={calcLabel}
              canExport={!!downloadToken}
              onCameraModeChange={setCameraMode}
              onExportStl={handleExportStl}
              onExportIgs={handleExportIgs}
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
              layers={layers}
              cameraMode={cameraMode}
              cameraResetKey={viewerResetKey}
              onFileDrop={handleViewerFileDrop}
              onAutoFitComplete={handleAutoFitComplete}
              meshColor={meshColor}
              backgroundColor={backgroundColor}
            />
          </div>
        </div>

        {/* Right: TileMenu (always visible) */}
        <div style={rightPanelStyle}>
          <TileMenu
            tileType={tileType}
            sliderValues={tileSliderValues}
            previewStlGzB64={tilePreviewGzB64 ?? undefined}
            onTileTypeChange={handleTileTypeChange}
            onSliderChange={handleTileSliderChange}
            onSliderCommit={handleTileSliderCommit}
            onValidationChange={handleValidationChange}
            meshColor={meshColor}
            backgroundColor={backgroundColor}
          />
        </div>
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
  // maxHeight: 395,
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
