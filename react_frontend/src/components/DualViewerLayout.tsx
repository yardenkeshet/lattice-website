import * as React from 'react'
import { ViewerScene } from './ViewerScene'

export interface DualViewerLayoutProps {
  file1: File | null
  file2: File | null
  onFile1Drop: (file: File) => void
  onFile2Drop: (file: File) => void
  /** Called when the user clears panel 1 (Surface 1). */
  onClear1?: () => void
  /** Called when the user clears panel 2 (Surface 2). */
  onClear2?: () => void
  cameraMode: 'perspective' | 'orthographic'
  className?: string
  style?: React.CSSProperties
}

function DualViewerLayoutFn({
  file1,
  file2,
  onFile1Drop,
  onFile2Drop,
  onClear1,
  onClear2,
  cameraMode,
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
          onFileDrop={onFile1Drop}
          onClear={onClear1}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
      <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
        <ViewerScene
          uploadedFile={file2}
          cameraMode={cameraMode}
          onFileDrop={onFile2Drop}
          onClear={onClear2}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    </div>
  )
}

export const DualViewerLayout = React.memo(DualViewerLayoutFn)
DualViewerLayout.displayName = 'DualViewerLayout'
