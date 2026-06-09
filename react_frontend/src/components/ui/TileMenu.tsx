import * as React from 'react'
import { cn } from '../../lib/utils'
import { useStlBlobUrl } from '../../lib/stl'
import { type ValidationError } from '../../api/types'
import { TileCard } from './TileCard'
import { Slider } from './Slider'
import { CROSS, TILE_DEFS, TILE_TYPES, type TileType } from '../../lib/parameters'

/* ─── Per-tile-type definitions ─── */

export function defaultSliderValues(type: TileType): number[] {
  return TILE_DEFS[type].sliders.map(p => p.defaultValue)
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


const TileMenuInner = React.forwardRef<HTMLDivElement, TileMenuProps>(
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
    const defs = TILE_DEFS[tileType].sliders

    const innerRadiusError =
      tileType === CROSS && (sliderValues[1] ?? 0) >= (sliderValues[0] ?? Infinity)

    // Keep a ref to onValidationChange so the effect never needs it as a dep
    // (avoids re-running when parent re-renders with a new inline function).
    const onValidationChangeRef = React.useRef(onValidationChange)
    React.useEffect(() => { onValidationChangeRef.current = onValidationChange })

    React.useEffect(() => {
      onValidationChangeRef.current?.('tile', innerRadiusError
        ? [{ message: 'Inner radius must be less than outer radius' }]
        : [])
    }, [innerRadiusError, tileType])

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
              {TILE_TYPES.map(type => (
                <TileCard
                  key={type}
                  size="small"
                  label={TILE_DEFS[type].label}
                  imageUrl={TILE_DEFS[type].imageUrl}
                  selected={tileType === type}
                  onClick={() => onTileTypeChange(type)}
                  aria-label={TILE_DEFS[type].label}
                />
              ))}
            </div>
          </div>
        </div>

        <Divider />

        {/* ── Dynamic sliders ── */}
        <div style={sectionStyle}>
          {defs.map((def, i) => {
            const isInnerRadius = tileType === CROSS && i === 1
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

TileMenuInner.displayName = 'TileMenu'

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

export const TileMenu = React.memo(TileMenuInner)
