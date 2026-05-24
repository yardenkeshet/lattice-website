import * as React from 'react'
import { cn } from '../../lib/utils'
import { useStlBlobUrl } from '../../lib/stl'
import type { TileType, ValidationError } from '../../api/types'
import { TileCard } from './TileCard'
import { Slider } from './Slider'
import crossImg from '../../assets/TileTypes/cross.png'
import diagonalImg from '../../assets/TileTypes/diagonal.png'
import crossDiagonalImg from '../../assets/TileTypes/cross-diagonal.png'

/* ─── Per-tile-type slider definitions ─── */

interface SliderDef {
  label: string
  min: number
  max: number
  defaultValue: number
  step: number
}

const TILE_PARAMS: Record<TileType, SliderDef[]> = {
  cross_diagonal: [
    { label: 'Cross Radius',             min: 0.01, max: 0.5,  defaultValue: 0.2,  step: 0.01 },
    { label: 'Diagonal Relative Radius', min: 0.01, max: 2.0,  defaultValue: 0.5,  step: 0.01 },
  ],
  diagonal: [
    { label: 'Center Size',       min: 0.01, max: 0.5,  defaultValue: 0.25, step: 0.01 },
    { label: 'End-Arm Size',      min: 0.01, max: 0.5,  defaultValue: 0.25, step: 0.01 },
    { label: 'Smoothing of Arms', min: 0.0,  max: 1.0,  defaultValue: 0.5,  step: 0.01 },
  ],
  cross: [
    { label: 'Outer Radius', min: 0.01, max: 0.5,  defaultValue: 0.3,  step: 0.01 },
    { label: 'Inner Radius', min: 0.0,  max: 0.5,  defaultValue: 0.15, step: 0.01 },
  ],
}

export function defaultSliderValues(type: TileType): number[] {
  return TILE_PARAMS[type].map(p => p.defaultValue)
}

/* ─── Public API ─── */

export interface TileMenuProps {
  tileType: TileType
  /** Current slider values for the selected tile type (2 or 3 numbers). */
  sliderValues: number[]
  /**
   * base64( gzip( ASCII-STL ) ) from the server's calculateTile response.
   * Drives the 166px live preview.
   */
  previewStlGzB64?: string
  onTileTypeChange: (type: TileType) => void
  onSliderChange: (values: number[]) => void
  /** Called on slider release or badge commit — triggers model recalculation. */
  onSliderCommit?: (values: number[]) => void
  onClose: () => void
  /**
   * Called whenever the tile's validation state changes.
   * source is always 'tile'. Pass [] to clear errors.
   */
  onValidationChange?: (source: string, errors: ValidationError[]) => void
  className?: string
}

const TILE_OPTIONS: { type: TileType; label: string; imageUrl: string }[] = [
  { type: 'cross',          label: 'Cross',          imageUrl: crossImg },
  { type: 'diagonal',       label: 'Diagonal',        imageUrl: diagonalImg },
  { type: 'cross_diagonal', label: 'Cross Diagonal',  imageUrl: crossDiagonalImg },
]

const TileMenu = React.forwardRef<HTMLDivElement, TileMenuProps>(
  (
    {
      tileType,
      sliderValues,
      previewStlGzB64,
      onTileTypeChange,
      onSliderChange,
      onSliderCommit,
      onClose,
      onValidationChange,
      className,
    },
    ref
  ) => {
    const previewUrl = useStlBlobUrl(previewStlGzB64)
    const defs = TILE_PARAMS[tileType]

    const innerRadiusError =
      tileType === 'cross' && (sliderValues[1] ?? 0) >= (sliderValues[0] ?? 0)

    React.useEffect(() => {
      if (tileType === 'cross' && innerRadiusError) {
        onValidationChange?.('tile', [{ message: 'Inner radius must be less than outer radius' }])
      } else {
        onValidationChange?.('tile', [])
      }
    }, [innerRadiusError, tileType]) // onValidationChange intentionally omitted — stable ref expected

    const buildNext = (index: number, value: number): number[] => {
      const next = [...sliderValues]
      next[index] = value
      return next
    }

    const handleSliderChange = (index: number, value: number) => {
      onSliderChange(buildNext(index, value))
    }

    const handleSliderCommit = (index: number, value: number) => {
      onSliderCommit?.(buildNext(index, value))
    }

    return (
      <div
        ref={ref}
        className={cn('tile-menu', className)}
        style={containerStyle}
      >
        {/* ── Header ── */}
        <div style={headerStyle}>
          <span style={headerTitleStyle}>Lattice Tile</span>
          <button
            type="button"
            aria-label="Close tile menu"
            onClick={onClose}
            style={closeButtonStyle}
          >
            <CloseIcon />
          </button>
        </div>

        <Divider />

        {/* ── Live 166px preview ── */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <TileCard
            size="large"
            modelUrl={previewUrl}
            enableOrbit
            cameraResetKey={tileType}
            aria-label="Tile live preview"
          />
        </div>

        <Divider />

        {/* ── Tile type selection ── */}
        <div style={sectionStyle}>
          <span style={sectionLabelStyle}>Tile Type</span>
          <div style={tileGridWrapperStyle}>
            <div style={tileGridStyle}>
              {TILE_OPTIONS.map(({ type, label, imageUrl }) => (
                <TileCard
                  key={type}
                  size="small"
                  label={label}
                  imageUrl={imageUrl}
                  selected={tileType === type}
                  onClick={() => onTileTypeChange(type)}
                  aria-label={label}
                />
              ))}
            </div>
          </div>
        </div>

        <Divider />

        {/* ── Dynamic sliders ── */}
        <div style={sectionStyle}>
          {defs.map((def, i) => {
            const isInnerRadius = tileType === 'cross' && i === 1
            return (
              <div key={def.label} style={sliderRowStyle}>
                <Slider
                  label={def.label}
                  min={def.min}
                  max={def.max}
                  step={def.step}
                  value={[sliderValues[i] ?? def.defaultValue]}
                  showValue
                  valuePrecision={2}
                  fontSize={12}
                  error={isInnerRadius && innerRadiusError}
                  onValueChange={([v]) => handleSliderChange(i, v)}
                  onValueCommit={([v]) => handleSliderCommit(i, v)}
                />
              </div>
            )
          })}
        </div>
      </div>
    )
  }
)

TileMenu.displayName = 'TileMenu'

/* ─── Close icon ─── */

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

/* ─── Divider ─── */

function Divider() {
  return <div aria-hidden="true" style={dividerStyle} />
}

/* ─── Styles ─── */

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-sm)',
  width: 220,
  backgroundColor: 'var(--bg-primary)',
  borderRadius: 14,
  boxShadow: '1px 2px 9px 0px rgba(0,0,0,0.10)',
  padding: '11px 0 20px',
  overflowY: 'auto',
  maxHeight: '100%',
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0 var(--space-md)',
}

const headerTitleStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-base)',
}

const closeButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: 2,
  color: 'var(--text-secondary)',
  display: 'flex',
  alignItems: 'center',
}

const dividerStyle: React.CSSProperties = {
  height: 3,
  backgroundColor: 'var(--bg-tertiary)',
  margin: '0 0',
  flexShrink: 0,
  boxShadow: '1px 2px 6px -2px rgba(0,0,0,0.14)',
}

const sectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-sm)',
  padding: '0 var(--space-md)',
}

const sectionLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-base)',
}

const tileGridWrapperStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
}

const tileGridStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '7px 9px',
  width: '170px',
}

const sliderRowStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 5,
}

export { TileMenu }
