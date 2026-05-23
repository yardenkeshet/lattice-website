import * as React from 'react'
import { ViewerScene } from './ViewerScene'

export interface DualViewerLayoutProps {
  file1: File | null
  file2: File | null
  onFile1Drop: (file: File) => void
  onFile2Drop: (file: File) => void
  cameraMode: 'perspective' | 'orthographic'
  zoom: number
  onZoomChange: (zoom: number) => void
  className?: string
  style?: React.CSSProperties
}

export function DualViewerLayout({
  file1,
  file2,
  onFile1Drop,
  onFile2Drop,
  cameraMode,
  zoom,
  onZoomChange,
  className,
  style,
}: DualViewerLayoutProps) {
  return (
    <div
      className={className}
      style={{
        display: 'flex',
        gap: 8,
        width: '100%',
        height: '100%',
        ...style,
      }}
    >
      <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
        <ViewerScene
          uploadedFile={file1}
          cameraMode={cameraMode}
          zoom={zoom}
          onZoomChange={onZoomChange}
          onFileDrop={onFile1Drop}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
      <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
        <ViewerScene
          uploadedFile={file2}
          cameraMode={cameraMode}
          zoom={zoom}
          onZoomChange={onZoomChange}
          onFileDrop={onFile2Drop}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    </div>
  )
}
