import * as React from 'react'
import { ViewerScene } from './ViewerScene'
import { DEFAULT_BACKGROUND_COLOR, DEFAULT_MODEL_COLOR } from '../lib/parameters'

export interface DualViewerLayoutProps {
  file1: File | null
  file2: File | null
  onFile1Drop: (file: File) => void
  onFile2Drop: (file: File) => void
  cameraMode: 'perspective' | 'orthographic'
  className?: string
  style?: React.CSSProperties
}

function DualViewerLayoutFn({
  file1,
  file2,
  onFile1Drop,
  onFile2Drop,
  cameraMode,
  className,
  style,
}: DualViewerLayoutProps) {
  return (
    <div
      className={className}
      style={{ display: 'flex', gap: 8, width: '100%', height: '100%', ...style }}
    >
      <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
        <ViewerScene
          backgroundColor={DEFAULT_BACKGROUND_COLOR}
          meshColor={DEFAULT_MODEL_COLOR}
          uploadedFile={file1}
          cameraMode={cameraMode}
          onFileDrop={onFile1Drop}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
      <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
        <ViewerScene
          backgroundColor={DEFAULT_BACKGROUND_COLOR}
          meshColor={DEFAULT_MODEL_COLOR}
          uploadedFile={file2}
          cameraMode={cameraMode}
          onFileDrop={onFile2Drop}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    </div>
  )
}

export const DualViewerLayout = React.memo(DualViewerLayoutFn)
DualViewerLayout.displayName = 'DualViewerLayout'
