import * as React from 'react'
import { cn } from '../../lib/utils'
import { Button } from './Button'
import Popup from './Popup'
import { Tooltip } from './Tooltip'

export interface ToolbarProps {
  cameraMode?: 'perspective' | 'orthographic'
  isCalculating?: boolean
  calcLabel?: string
  canExport?: boolean
  onCameraModeChange: (mode: 'perspective' | 'orthographic') => void
  onExportStl: () => void
  onExportIgs: () => void
  onCalculate?: () => void
  onCalculateRotatingBody?: () => void
  /** Shows the "Get Rotating Body" button — only meaningful in Revolution mode. */
  showRotatingBody?: boolean
  className?: string
}

const ToolbarInner = React.forwardRef<HTMLDivElement, ToolbarProps>(
  (
    {
      cameraMode = 'perspective',
      isCalculating = false,
      calcLabel = 'Calculating…',
      canExport = false,
      onCameraModeChange,
      onExportStl,
      onExportIgs,
      onCalculate,
      onCalculateRotatingBody,
      showRotatingBody = false,
      className,
    },
    ref
  ) => {
    const [isExportPopupOpen, setIsExportPopupOpen] = React.useState(false)

    return (
      <div ref={ref} className={cn('toolbar', className)} style={containerStyle}>
        {/* ── Pill: camera mode + export + calculate ── */}
        <div style={pillStyle}>
          {/* Camera mode toggle */}
          <Tooltip content="Toggles between perspective and orthographic views.">
            <button
              type="button"
              aria-haspopup="listbox"
              onClick={() => onCameraModeChange(cameraMode === 'orthographic' ? 'perspective' : 'orthographic')}
              style={cameraPillButtonStyle}
            >
              <CameraIcon />
              <span style={pillTextStyle}>{cameraMode}</span>
            </button>
          </Tooltip>

          <PillDivider />

          {/* Export Lattice button */}
          {canExport ? (
            <Button
              variant="primary"
              onClick={() => setIsExportPopupOpen(true)}
            >
              Export Lattice
            </Button>
          ) : (
            <Button variant="secondary" disabled>
              Export Lattice
            </Button>
          )}

          <PillDivider />

          {/* Get Rotating Body button — Revolution mode only */}
          {showRotatingBody && (
            <>
              <Button
                variant="secondary"
                disabled={isCalculating}
                onClick={onCalculateRotatingBody}
              >
                Get Rotating Body
              </Button>
              <PillDivider />
            </>
          )}

          {/* Make Lattice button */}
          <Button
            variant="secondary"
            disabled={isCalculating}
            onClick={onCalculate}
          >
            {isCalculating ? calcLabel : 'Make Lattice'}
          </Button>
        </div>

        <Popup isOpen={isExportPopupOpen} onClose={() => setIsExportPopupOpen(false)}>
          <div style={exportPopupStyle}>
            <Button
              variant="primary"
              onClick={() => { setIsExportPopupOpen(false); onExportStl() }}
            >
              Export STL
            </Button>
            <Button
              variant="primary"
              onClick={() => { setIsExportPopupOpen(false); onExportIgs() }}
            >
              Export IGS
            </Button>
          </div>
        </Popup>
      </div>
    )
  }
)

ToolbarInner.displayName = 'Toolbar'

/* ─── Icons ─── */

function CameraIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="2" y="6" width="16" height="11" rx="2" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="10" cy="11.5" r="3" stroke="currentColor" strokeWidth="1.3" />
      <path d="M7 6l1.5-3h3L13 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export const CubeIcon3D = ({ size = 24, className = "" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '0.25em' }}
  >
    <path d="M12 2L2 7l10 5 10-5-10-5z" />
    <path d="M2 17l10 5V12L2 7v10z" />
    <path d="M22 7l-10 5v10l10-5V7z" />
  </svg>
)

/* ─── Pill divider ─── */

function PillDivider() {
  return <div aria-hidden="true" style={pillDividerStyle} />
}

/* ─── Styles ─── */

const containerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 11,
}

const pillStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  height: 42,
  backgroundColor: 'var(--bg-primary)',
  borderRadius: 12,
  padding: '0 5px',
  boxShadow: '0px 2px 4px rgba(0,0,0,0.15)',
}

const pillDividerStyle: React.CSSProperties = {
  width: 3,
  height: 42,
  backgroundColor: 'var(--bg-tertiary)',
  boxShadow: '1px 2px 6px -2px rgba(0,0,0,0.14)',
  flexShrink: 0,
}

const cameraPillButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: '0 5px',
  color: 'var(--text-base)',
}

const pillTextStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  textTransform: 'capitalize',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-base)',
  width: 70,
}

const exportPopupStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  gap: 5,
  justifyContent: 'center',
  padding: '0 var(--space-md)',
}

export const Toolbar = React.memo(ToolbarInner)
