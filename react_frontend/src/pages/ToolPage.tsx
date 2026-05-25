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
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import pako from 'pako'
import type { TileType } from '../api/types'
import type { BufferGeometry } from 'three'

/* ─── STL decode helper ─── */
function stlGzB64ToGeometry2(gzB64: string): BufferGeometry {
  const compressed = Uint8Array.from(atob(gzB64), c => c.charCodeAt(0))
  const decompressed = pako.inflate(compressed)
  const stlText = new TextDecoder().decode(decompressed)
  console.log('[STL] decompressed:', stlText.slice(0, 100))
  return new STLLoader().parse(stlText.trimStart())
}

function stlGzB64ToGeometry(gzB64: string): BufferGeometry {
  const compressed = Uint8Array.from(atob(gzB64), c => c.charCodeAt(0))
  const decompressed = pako.inflate(compressed)

  const header = new TextDecoder().decode(decompressed.slice(0, 256)).trimStart()
  const looksLikeAscii = header.startsWith('solid') && header.includes('facet normal')

  console.log('[STL] header start:', JSON.stringify(header.slice(0, 30)))
  console.log('[STL] looksLikeAscii:', looksLikeAscii)

  const loader = new STLLoader()
  if (looksLikeAscii) {
    return loader.parse(new TextDecoder().decode(decompressed).trimStart())
  } else {
    // Binary STL — must pass a copy, STLLoader reads from offset 0 of the buffer.
    // decompressed.buffer may have an offset if pako returned a subarray view,
    // so slice to get a clean ArrayBuffer.
    return loader.parse(decompressed.buffer.slice(
      decompressed.byteOffset,
      decompressed.byteOffset + decompressed.byteLength
    ) as ArrayBuffer)
  }
}

/* ─── Types ─── */

interface TileState {
  type: TileType
  sliderValues: number[]
  previewGzB64: string | null
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
  const [tileParams, setTileParams] = React.useState<TileState>({
    type: 'diagonal',
    sliderValues: defaultSliderValues('diagonal'),
    previewGzB64: null,
  })

  /* ── File & geometry state ── */
  const [uploadedFile, setUploadedFile]         = React.useState<File | null>(null)
  const [tileGeometry, setTileGeometry]         = React.useState<BufferGeometry | null>(null)
  const [previewGeometry, setPreviewGeometry]   = React.useState<BufferGeometry | null>(null)
  const [calculatedGeometry, setCalculatedGeometry] = React.useState<BufferGeometry | null>(null)

  /* ── Calculation status ── */
  const [isCalculating, setIsCalculating]   = React.useState(false)
  const [downloadToken, setDownloadToken]   = React.useState<string | null>(null)
  const [errorMsg, setErrorMsg]             = React.useState<string | null>(null)

  /* ── Lattice params ── */
  const [nt1, setNt1]           = React.useState(10)
  const [nt2, setNt2]           = React.useState(10)
  const [nt3, setNt3]           = React.useState(1)
  const [g1, setG1]             = React.useState(0.57)
  const [g2, setG2]             = React.useState(0.83)
  const [calcMode, setCalcMode] = React.useState<'extrusion' | 'revolution'>('extrusion')

  /* ── Socket subscriptions ── */

React.useEffect(() => {
  console.log('previewGeometry changed:', previewGeometry)
}, [previewGeometry])

  React.useEffect(() => {
    const unsubResult = socket.onResult((payload) => {
      console.log('Received result payload:', payload)

      if (payload.kind === 'model_stl') {
        try {
          const geometry = stlGzB64ToGeometry2(payload.stl_gz_b64)
          console.log('[model_stl] geometry:', geometry)
          console.log('[model_stl] vertex count:', geometry.attributes.position?.count)
          if (!geometry.attributes.position || geometry.attributes.position.count === 0) {
            throw new Error('DLL returned an empty mesh (0 vertices)')
          }
          setCalculatedGeometry(geometry)
          setDownloadToken(payload.download_token)
          setIsCalculating(false)
        } catch (e) {
          console.error('[model_stl] stlGzB64ToGeometry failed:', e)
          setIsCalculating(false)
          setErrorMsg(e instanceof Error ? e.message : 'Failed to parse result geometry')
        }
      } else if (payload.kind === 'tile_stl') {
        setTileParams(prev => ({ ...prev, previewGzB64: payload.stl_gz_b64 }))
        setTileGeometry(stlGzB64ToGeometry(payload.stl_gz_b64))

      } else if (payload.kind === 'model_preview_stl') {
        const geometry = stlGzB64ToGeometry(payload.stl_gz_b64)
        console.log('Updated preview geometry from model_preview_stl result', geometry)
        setPreviewGeometry(geometry)
      } else {
        console.warn('Received unknown result kind:', (payload as any).kind)
      }
    })

    const unsubError = socket.onError(err => {
      console.error('Socket error:', err)
      setIsCalculating(false)
      setErrorMsg(err.message)
    })

    return () => {
      unsubResult()
      unsubError()
    }
  }, [socket])

  /* ── Tile param commit ── */
  const handleTileSliderCommit = React.useCallback((values: number[]) => {
    const padded: [number, number, number] = [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0]
    socket.calculateTile({ type: tileParams.type, values: padded })
  }, [socket, tileParams.type])

  const handleTileTypeChange = (type: TileType) => {
    const defaults = defaultSliderValues(type)
    setTileParams({ type, sliderValues: defaults, previewGzB64: tileParams.previewGzB64 })
    const padded: [number, number, number] = [defaults[0] ?? 0, defaults[1] ?? 0, defaults[2] ?? 0]
    socket.calculateTile({ type, values: padded })
  }

  const handleTileSliderChange = React.useCallback((values: number[]) => {
    setTileParams(prev => ({ ...prev, sliderValues: values }))
  }, [])

  /* ── File upload ── */
  const handleFileAdd = async (file: File) => {
    try {
      // BUG FIX: was not saving the file, so handleCalculate had no file to read.
      setUploadedFile(file)
      setPreviewGeometry(null)
      setCalculatedGeometry(null)
      setDownloadToken(null)
      setErrorMsg(null)

      const fileContent = await file.text()
      socket.convertIGESToSTL({ filename: file.name, data: fileContent })
    } catch (err) {
      console.error('Failed to read file:', err)
    }
  }

  /* ── Calculate ── */
  const handleCalculate = () => {
    // BUG FIX: was referencing undefined `userModel.file` and `upl.file`
    // instead of the `uploadedFile` state variable.
    if (!uploadedFile) return

    setCalculatedGeometry(null)
    setDownloadToken(null)
    setErrorMsg(null)
    setIsCalculating(true)

    const reader = new FileReader()
    reader.onload = () => {
      const base64String = (reader.result as string).split(',')[1]

      socket.calculate({
        filename: uploadedFile.name,
        igs_b64: base64String,
        client_ts: Date.now(),
        args: {
          tileType: tileParams.type,
          nt1, nt2, nt3, g1, g2,
          p1: tileParams.sliderValues[0],
          p2: tileParams.sliderValues[1],
          p3: tileParams.sliderValues[2],
        },
      })
    }
    reader.onerror = () => {
      setIsCalculating(false)
      setErrorMsg('Error reading file')
    }
    reader.readAsDataURL(uploadedFile)
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

      <div style={workspaceStyle}>

        <div style={leftPanelStyle}>
          <LatticeMenu
            tileType={tileParams.type}
            tilePreviewUrl=""
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

          {errorMsg && (
            <div style={errorStyle}>
              {errorMsg}
              <button style={errorDismissStyle} onClick={() => setErrorMsg(null)}>✕</button>
            </div>
          )}

          <div style={viewerStyle}>
            <ViewerSceneAndDrop
              model={calculatedGeometry ?? previewGeometry}
              cameraMode={cameraMode}
              zoom={zoom}
              onZoomChange={setZoom}
              onFileDrop={handleFileAdd}
            />
          </div>
        </div>

        {isTileMenuOpen && (
          <div style={rightPanelStyle}>
            <TileMenu
              tileType={tileParams.type}
              sliderValues={tileParams.sliderValues}
              previewStlGzB64={tileParams.previewGzB64 ?? undefined}
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
