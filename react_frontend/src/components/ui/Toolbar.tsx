import * as React from 'react'
import { cn } from '../../lib/utils'
import { IconButton } from './IconButton'
import { Button } from './Button'
import type { CalcMode } from '../../api/types'

/* ─── Public API ─── */

export interface ToolbarProps {
  zoom?: number          // 10–500, default 100
  cameraMode?: 'perspective' | 'orthographic'
  isCalculating?: boolean
  calcLabel?: string

  onZoomChange?: (zoom: number) => void
  onCameraModeChange?: (mode: 'perspective' | 'orthographic') => void
  /** Present only when in ruling mode — controls multi-file picker and routing. */
  calcMode?: CalcMode
  /** Called when user picks file(s) via the Add button. 1 item normally, up to 2 in ruling mode. */
  onFilesAdd?: (files: File[]) => void
  onCalculate?: () => void

  className?: string

  fileNames: string[]
}

const ZOOM_STEP = 10
const ZOOM_MIN  = 10
const ZOOM_MAX  = 500
const ACCEPTED_3D = '.igs'

const Toolbar = React.forwardRef<HTMLDivElement, ToolbarProps>(
  (
    {
      zoom = 100,
      cameraMode = 'perspective',
      isCalculating = false,
      calcLabel = 'Calculating…',
      onZoomChange,
      onCameraModeChange,
      calcMode,
      onFilesAdd,
      onCalculate,
      className,
      fileNames
    },
    ref
  ) => {
    const fileInputRef = React.useRef<HTMLInputElement>(null)
    const [modeOpen, setModeOpen] = React.useState(false)

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const all = Array.from(e.target.files ?? [])
      if (all.length === 0) return
      const limited = calcMode === 'ruling' ? all.slice(0, 2) : [all[0]]
      onFilesAdd?.(limited)
      e.target.value = ''  // reset so the same file can be re-selected
    }

    return (
      <div ref={ref} className={cn('toolbar', className)} style={containerStyle}>
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_3D}
          multiple={calcMode === 'ruling'}
          style={{ display: 'none' }}
          onChange={handleFileChange}
          aria-hidden="true"
          tabIndex={-1}
        />

        {/* ── Add (file upload) icon button ── */}
        <IconButton
          aria-label="Add IGS file"
          onClick={() => fileInputRef.current?.click()}
        >
          <PlusIcon />
        </IconButton>
        {/* ── Pill: zoom + camera mode ── */}
        <div style={pillStyle}>

          {/* Zoom control */}
          <div style={zoomGroupStyle}>
            <span style={zoomLabelStyle}>{zoom}%</span>
            <button
              type="button"
              aria-label="Zoom out"
              onClick={() => onZoomChange?.(Math.max(ZOOM_MIN, zoom - ZOOM_STEP))}
              style={pillButtonStyle}
            >
              −
            </button>
            <button
              type="button"
              aria-label="Zoom in"
              onClick={() => onZoomChange?.(Math.min(ZOOM_MAX, zoom + ZOOM_STEP))}
              style={pillButtonStyle}
            >
              +
            </button>
          </div>

          <PillDivider />

          {/* Camera mode dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              aria-haspopup="listbox"
              aria-expanded={modeOpen}
              onClick={() => setModeOpen(o => !o)}
              style={cameraPillButtonStyle}
            >
              <CameraIcon />
              <span style={pillTextStyle}>{cameraMode}</span>
              <ChevronDownIcon open={modeOpen} />
            </button>

            {modeOpen && (
              <ul
                role="listbox"
                aria-label="Camera mode"
                style={dropdownListStyle}
                onBlur={() => setModeOpen(false)}
              >
                {(['perspective', 'orthographic'] as const).map(mode => (
                  <li
                    key={mode}
                    role="option"
                    aria-selected={cameraMode === mode}
                    onClick={() => {
                      onCameraModeChange?.(mode)
                      setModeOpen(false)
                    }}
                    style={{
                      ...dropdownItemStyle,
                      ...(cameraMode === mode ? dropdownItemActiveStyle : {}),
                    }}
                  >
                    {mode.charAt(0).toUpperCase() + mode.slice(1)}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <PillDivider />
          {fileNames?<ul> {fileNames.map((name)=><li key={name}><CubeIcon3D/> {name}</li>)}</ul> :<></>}

          {/* Calculate button */}
          <Button
            variant="secondary"
            disabled={isCalculating}
            onClick={onCalculate}
          >
            {isCalculating ? calcLabel : 'Calculate'}
          </Button>
        </div>
      </div>
    )
  }
)

Toolbar.displayName = 'Toolbar'

/* ─── Icons ─── */

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function CameraIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="2" y="6" width="16" height="11" rx="2" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="10" cy="11.5" r="3" stroke="currentColor" strokeWidth="1.3" />
      <path d="M7 6l1.5-3h3L13 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ChevronDownIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
      style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms ease' }}
    >
      <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export const CubeIcon3D = ({ size = 24, className = "" }) => {
  return (
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
      {/* Top Face */}
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      {/* Left Face */}
      <path d="M2 17l10 5V12L2 7v10z" />
      {/* Right Face */}
      <path d="M22 7l-10 5v10l10-5V7z" />
    </svg>
  );
};

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

const zoomGroupStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '0 4px',
}

const zoomLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-base)',
  minWidth: 38,
  textAlign: 'center',
}

const pillButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'var(--font-body)',
  fontSize: 14,
  fontWeight: 700,
  color: 'var(--text-secondary)',
  padding: '0 2px',
  lineHeight: 1,
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
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-base)',
  width: 70,
}

const dropdownListStyle: React.CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 4px)',
  left: 0,
  minWidth: 140,
  backgroundColor: 'var(--bg-primary)',
  borderRadius: 'var(--radius-card)',
  boxShadow: 'var(--dropdown-shadow)',
  border: '1px solid var(--border-base)',
  listStyle: 'none',
  margin: 0,
  padding: '4px 0',
  zIndex: 20,
}

const dropdownItemStyle: React.CSSProperties = {
  padding: '8px 12px',
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-size-xs)',
  fontWeight: 500,
  color: 'var(--text-base)',
  cursor: 'pointer',
}

const dropdownItemActiveStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-tertiary)',
  fontWeight: 600,
}

export { Toolbar }
