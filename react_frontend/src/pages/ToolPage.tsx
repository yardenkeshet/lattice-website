import * as React from 'react'
import { flushSync } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Banner } from '../components/ui/Banner'
import { Footer } from '../components/ui/Footer'
import { LatticeMenu } from '../components/ui/LatticeMenu'
import { TileMenu, defaultSliderValues } from '../components/ui/TileMenu'
import { Toolbar } from '../components/ui/Toolbar'
import { ViewerScene } from '../components/ViewerScene'
import type { MeshLayer } from '../components/ViewerScene'
import { getLatticeSocket } from '../api/socketClient'
import { computeDisplayedLayers } from '../lib/displayedLayers'
import { downloadResults, convertIgsToStl, logCalculation } from '../api/httpClient'
import { stlTextToGzB64, useStlBlobUrl } from '../lib/stl'
import { calcLabelForUpdate } from '../lib/progressDisplay'
import { isLogViewerShortcut } from '../lib/logViewerShortcut'
import defaultTileUrl from '../assets/default_diagonal_tile.stl?url'
import {
  DEFAULT_X_COUNT, DEFAULT_Y_COUNT, DEFAULT_Z_COUNT,
  DEFAULT_TILE_TYPE, DEFAULT_CALC_MODE, DEFAULT_CAMERA_MODE,
  DEFAULT_G1, DEFAULT_G2,
  INITIAL_VIEWER_RESET_KEY,
  RULING,
  DEFAULT_MODEL_COLOR as DEFAULT_MESH_COLOR,
  DEFAULT_BACKGROUND_COLOR,
  DEFAULT_SHADING_MODE, DEFAULT_SPECULAR_GRAY, DEFAULT_SHININESS,
  DEFAULT_TESSELLATION_TOLERANCE,
  type ShadingMode,
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
async function convertIgsFile(file: File, tolerance: number = DEFAULT_TESSELLATION_TOLERANCE): Promise<{ stlFile: File; igsB64: string }> {
  const [stlB64, igsB64, ...rest] = await Promise.all([convertIgsToStl(file, tolerance), fileToBase64(file)])
  console.log("rest:", rest)
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
  const [extrudeLength, setExtrudeLength] = React.useState(10.0)
  const [meshColor, setMeshColor]     = React.useState<string>(DEFAULT_MESH_COLOR)
  const [backgroundColor, setBackgroundColor]     = React.useState<string>(DEFAULT_BACKGROUND_COLOR)
  const [shadingMode, setShadingMode] = React.useState<ShadingMode>(DEFAULT_SHADING_MODE)
  const [specularGray, setSpecularGray] = React.useState<number>(DEFAULT_SPECULAR_GRAY)
  const [shininess, setShininess]     = React.useState<number>(DEFAULT_SHININESS)


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

  /* ── Tessellation tolerance + original IGS file references for re-conversion ── */
  const [igsConversionTolerance, setIgsConversionTolerance] = React.useState(DEFAULT_TESSELLATION_TOLERANCE)
  // Keep a reference to the original File objects so tolerance changes can re-convert
  const [originalIgsFile,  setOriginalIgsFile]  = React.useState<File | null>(null)
  const [originalIgsFile2, setOriginalIgsFile2] = React.useState<File | null>(null)

  /* ── Blob URLs for uploaded surface files (created here, consumed by layer assembly) ── */
  const uploadedBlobUrl = React.useMemo(
    () => uploadedFile ? URL.createObjectURL(uploadedFile) : undefined,
    [uploadedFile]
  )
  React.useEffect(() => () => { if (uploadedBlobUrl) URL.revokeObjectURL(uploadedBlobUrl) }, [uploadedBlobUrl])

  const uploadedBlobUrl2 = React.useMemo(
    () => uploadedFile2 ? URL.createObjectURL(uploadedFile2) : undefined,
    [uploadedFile2]
  )
  React.useEffect(() => () => { if (uploadedBlobUrl2) URL.revokeObjectURL(uploadedBlobUrl2) }, [uploadedBlobUrl2])

  /* ── Blob URL for calculation result (gz+b64 → Blob URL) ── */
  const resultBlobUrl = useStlBlobUrl(resultGzB64)

  /* ── Macro shape preview state ── */
  const [macroShapeGzB64, setMacroShapeGzB64] = React.useState<string | null>(null)
  const macroShapeBlobUrl = useStlBlobUrl(macroShapeGzB64)
  const pendingMacroCountRef   = React.useRef(0)
  const uploadedIgsB64Ref      = React.useRef<string | null>(null)
  React.useEffect(() => { uploadedIgsB64Ref.current = uploadedIgsB64 }, [uploadedIgsB64])
  const isCalculatingRef = React.useRef(false)
  React.useEffect(() => { isCalculatingRef.current = isCalculating }, [isCalculating])

  /* ── Layer assembly ──
     Only updates once all currently-obtainable information (surfaces +
     macro shape) is ready; freezes on the previous render while waiting on
     a macro-shape recalculation instead of flashing a bare surface. See
     computeDisplayedLayers for the exact rules. */
  const [displayedLayers, setDisplayedLayers] = React.useState<MeshLayer[]>([])
  React.useEffect(() => {
    // uploadedBlobUrl/uploadedBlobUrl2/macroShapeBlobUrl are derived from
    // uploadedFile/uploadedFile2/macroShapeGzB64 via their own effects, so they
    // lag one render behind on changes like a calc-mode switch (which clears
    // the raw file state synchronously). If the blob-URL-derived upload count
    // doesn't yet match the raw file count, skip this update rather than
    // computing from stale blob URLs — that would transiently overwrite an
    // explicit reset (e.g. handleCalcModeChange's setDisplayedLayers([])) with
    // leftover geometry from the previous mode. Once the derived state catches
    // up (next render), the counts match again and this recomputes correctly.
    const rawUploadedCount  = (uploadedFile ? 1 : 0) + (uploadedFile2 ? 1 : 0)
    const blobUploadedCount = (uploadedBlobUrl ? 1 : 0) + (uploadedBlobUrl2 ? 1 : 0)
    if (rawUploadedCount !== blobUploadedCount) return
    setDisplayedLayers(prev => computeDisplayedLayers(
      { calcMode, resultBlobUrl, uploadedBlobUrl, uploadedBlobUrl2, macroShapeBlobUrl },
      prev,
    ))
  }, [calcMode, resultBlobUrl, uploadedBlobUrl, uploadedBlobUrl2, macroShapeBlobUrl, uploadedFile, uploadedFile2])

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
        if (pendingMacroCountRef.current > 0) {
          pendingMacroCountRef.current -= 1
          if (payload.stl_gz_b64) {
            setMacroShapeGzB64(payload.stl_gz_b64)
          }
          // else: more responses still expected — intermediate response discarded silently
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
      pendingMacroCountRef.current = 0
      setIsCalculating(false)
      setCalcLabel('Calculating…')
      setErrorMsg(err.message)
    })
    const unsubUpdate = socket.onUpdate(upd => {
      flushSync(() => setCalcLabel(calcLabelForUpdate(upd)))
    })
    return () => { unsubResult(); unsubError(); unsubUpdate() }
  }, [socket])

  /* ── Hidden log-viewer access (Ctrl+Shift+L) ── */
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!isLogViewerShortcut(e)) return
      const origin = import.meta.env.VITE_BACKEND_URL ?? import.meta.env.VITE_BACKEND_LOCAL_URL ?? ''
      window.open(`${origin}/viewlog`, '_blank', 'noopener,noreferrer')
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  /* ── Auto-trigger macro shape preview when surfaces are uploaded ── */
  // Uses nt1=nt2=nt3=0 so the DLL returns the bounding envelope with no lattice.
  React.useEffect(() => {
    if (calcMode === RULING) {
      if (!uploadedIgsB64 || !uploadedIgsB64_2) return
    } else {
      if (!uploadedIgsB64) return
    }

    pendingMacroCountRef.current += 2
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
        p1: tileSliderValues[0], p2: tileSliderValues[1], p3: tileSliderValues[2] ?? 0,
        extrudeLength,
      },
      tolerance: igsConversionTolerance
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  // extrudeLength intentionally omitted: a separate debounced effect handles it.
  }, [uploadedIgsB64, uploadedIgsB64_2, calcMode])

  /* ── Re-trigger macro shape when extrudeLength changes (extrusion mode only) ── */
  React.useEffect(() => {
    if (calcModeRef.current !== 'extrusion' || !uploadedIgsB64Ref.current) return
    const igsB64 = uploadedIgsB64Ref.current
    const timer = setTimeout(() => {
      if (isCalculatingRef.current) return  // don't interfere with an in-progress calculation
      // setMacroShapeGzB64(null)
      pendingMacroCountRef.current += 2
      socket.calculate({
        filename: uploadedFile?.name ?? 'surface.igs',
        surface_b64: igsB64,
        client_ts: performance.now(),
        args: {
          tileType,
          calcMode: calcModeRef.current,
          nt1: 0, nt2: 0, nt3: 0,
          g1, g2,
          p1: tileSliderValues[0], p2: tileSliderValues[1], p3: tileSliderValues[2] ?? 0,
          extrudeLength,
        },
        tolerance: igsConversionTolerance
      })
    }, 500)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extrudeLength, igsConversionTolerance])
  
  /* ── Tile param change → update state only (no backend call on drag) ── */
  const handleTileSliderChange = React.useCallback((values: number[]) => {
    setTileSliderValues(values)
  }, [])
  
  /* ── Tessellation tolerance commit → re-convert surfaces + recalc tile, no Effect needed:
     this only ever fires from the Tolerance slider's onValueCommit (LatticeMenu.tsx),
     so the work belongs in the handler, not in an Effect reacting to the resulting state.
     The surface re-conversion (HTTP, hits the DLL's IGS→STL path) and the tile
     recalculation (socket, hits the DLL's tile path) must not run concurrently —
     the DLL isn't thread-safe, so overlapping calls corrupt each other's output.
     Wait for the conversions to fully settle before firing calculateTile. ── */
  const handleToleranceChange = React.useCallback((v: number) => {
    setIgsConversionTolerance(v)
    const conversions: Promise<void>[] = []
    if (originalIgsFile) {
      conversions.push(
        convertIgsFile(originalIgsFile, v)
          .then(({ stlFile, igsB64 }) => {
            setUploadedFile(stlFile)
            setUploadedIgsB64(igsB64)
          })
          .catch(() => {/* ignore re-conversion failures silently */})
      )
    }
    if (originalIgsFile2) {
      conversions.push(
        convertIgsFile(originalIgsFile2, v)
          .then(({ stlFile, igsB64 }) => {
            setUploadedFile2(stlFile)
            setUploadedIgsB64_2(igsB64)
          })
          .catch(() => {})
      )
    }
    const padded: [number, number, number] = [tileSliderValues[0] ?? 0, tileSliderValues[1] ?? 0, tileSliderValues[2] ?? 0]
    Promise.all(conversions).then(() => {
      socket.calculateTile({ type: tileType, values: padded, tolerance: v })
    })
  }, [originalIgsFile, originalIgsFile2, tileType, tileSliderValues, socket])

  /* ── Tile param commit (mouse-up or badge Enter) → calculateTile, no camera reset ── */
  const handleTileSliderCommit = React.useCallback((values: number[]) => {
    pendingResetKey.current = null
    const padded: [number, number, number] = [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0]
    socket.calculateTile({ type: tileType, 
      values: padded, tolerance: igsConversionTolerance })
  }, [socket, tileType, igsConversionTolerance])

  const handleTileTypeChange = React.useCallback((type: TileType) => {
    pendingResetKey.current = type
    setTileType(type)
    const defaults = defaultSliderValues(type)
    setTileSliderValues(defaults)
    const padded: [number, number, number] = [defaults[0] ?? 0, defaults[1] ?? 0, defaults[2] ?? 0]
    socket.calculateTile({ type, values: padded,
      tolerance: igsConversionTolerance })
  }, [socket, igsConversionTolerance])

  const handleCalcModeChange = React.useCallback((mode: CalcMode) => {
    pendingMacroCountRef.current = 0
    setErrorMsg(null)
    setUploadedFile(null)
    setUploadedIgsB64(null)
    setOriginalIgsFile(null)
    setUploadedFile2(null)
    setUploadedIgsB64_2(null)
    setOriginalIgsFile2(null)
    setResultGzB64(null)
    setDownloadToken(null)
    setMacroShapeGzB64(null)
    setDisplayedLayers([])
    setCalcMode(mode)
  }, [])

  /* ── File upload ── */
  const handleFilesAdd = React.useCallback(async (files: File[]) => {
    setResultGzB64(null)
    setErrorMsg(null)
    pendingMacroCountRef.current = 0

    if (calcMode === RULING) {
      if (files.length >= 2) {
        setViewerResetKey('file-' + Date.now())
        try {
          const [r1, r2] = await Promise.all([
            convertIgsFile(files[0], igsConversionTolerance),
            convertIgsFile(files[1], igsConversionTolerance),
          ])
          setOriginalIgsFile(files[0])
          setOriginalIgsFile2(files[1])
          setUploadedFile(r1.stlFile)
          setUploadedIgsB64(r1.igsB64)
          setUploadedFile2(r2.stlFile)
          setUploadedIgsB64_2(r2.igsB64)
        } catch (err) { setErrorMsg(err instanceof Error ? err.message : 'Failed to convert IGS file') }
      } else {
        const file = files[0]
        if (!uploadedFile) {
          setViewerResetKey('file-' + Date.now())
          try {
            const { stlFile, igsB64 } = await convertIgsFile(file, igsConversionTolerance)
            setOriginalIgsFile(file)
            setUploadedFile(stlFile)
            setUploadedIgsB64(igsB64)
          } catch (err) { setErrorMsg(err instanceof Error ? err.message : 'Failed to convert IGS file') }
        } else if (!uploadedFile2) {
          try {
            const { stlFile, igsB64 } = await convertIgsFile(file, igsConversionTolerance)
            setOriginalIgsFile2(file)
            setUploadedFile2(stlFile)
            setUploadedIgsB64_2(igsB64)
          } catch (err) { setErrorMsg(err instanceof Error ? err.message : 'Failed to convert IGS file') }
        } else {
          // Both already loaded — replace the first file
          setViewerResetKey('file-' + Date.now())
          try {
            const { stlFile, igsB64 } = await convertIgsFile(file, igsConversionTolerance)
            setOriginalIgsFile(file)
            setUploadedFile(stlFile)
            setUploadedIgsB64(igsB64)
          } catch (err) { setErrorMsg(err instanceof Error ? err.message : 'Failed to convert IGS file') }
        }
      }
    } else {
      const file = files[0]
      setViewerResetKey('file-' + Date.now())
      try {
        const { stlFile, igsB64 } = await convertIgsFile(file, igsConversionTolerance)
        setOriginalIgsFile(file)
        setUploadedFile(stlFile)
        setUploadedIgsB64(igsB64)
      } catch (err) { setErrorMsg(err instanceof Error ? err.message : 'Failed to convert IGS file') }
    }
  }, [calcMode, uploadedFile, uploadedFile2, igsConversionTolerance])

  /* ── Clear handlers ── */
  const handleClear1 = React.useCallback(() => {
    pendingMacroCountRef.current = 0
    setUploadedFile(null)
    setUploadedIgsB64(null)
    setOriginalIgsFile(null)
    setMacroShapeGzB64(null)
    setResultGzB64(null)
    setDownloadToken(null)
  }, [])

  const handleClear2 = React.useCallback(() => {
    pendingMacroCountRef.current = 0
    setUploadedFile2(null)
    setUploadedIgsB64_2(null)
    setOriginalIgsFile2(null)
    setMacroShapeGzB64(null)
  }, [])

  /* ── Calculate ── */
  const handleCalculate = React.useCallback(() => {
    pendingMacroCountRef.current = 0  // cancel any in-flight macro preview routing
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
      args: { tileType, calcMode, nt1, nt2, nt3, g1, g2, p1: tileSliderValues[0], p2: tileSliderValues[1], p3: tileSliderValues[2] ?? 0, extrudeLength },
      tolerance: igsConversionTolerance
    }
    socket.calculate(calculateArgs)
  }, [validationErrors, calcMode, uploadedFile, uploadedFile2, uploadedIgsB64, uploadedIgsB64_2, nt1, nt2, nt3, g1, g2, tileSliderValues, tileType, extrudeLength, igsConversionTolerance, socket])

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

  const showDropHint = !uploadedFile && !downloadToken

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
            shadingMode={shadingMode}
            setShadingMode={setShadingMode}
            specularGray={specularGray}
            setSpecularGray={setSpecularGray}
            shininess={shininess}
            setShininess={setShininess}
            extrudeLength={extrudeLength}
            onExtrudeLengthChange={setExtrudeLength}
            tolerance={igsConversionTolerance}
            onToleranceChange={handleToleranceChange}
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
              layers={displayedLayers}
              cameraMode={cameraMode}
              cameraResetKey={viewerResetKey}
              onFileDrop={handleViewerFileDrop}
              onAutoFitComplete={handleAutoFitComplete}
              meshColor={meshColor}
              backgroundColor={backgroundColor}
              shadingMode={shadingMode}
              specularGray={specularGray}
              shininess={shininess}
              showDropHint={showDropHint}
              hideEmptyPlaceholder={!!uploadedFile || !!uploadedFile2}
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
            shadingMode={shadingMode}
            specularGray={specularGray}
            shininess={shininess}
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
