import * as React from 'react'
import { cn } from '../../lib/utils'
import { Button } from './Button'
import { Slider } from './Slider'
import { NumberInput } from './NumberInput'
import { Dropdown, type DropdownOption } from './Dropdown'
import { CALC_MODE_DEFS, type CalcMode } from '../../calculation_params'
import { CubeIcon3D } from './Toolbar'
import { ColorPicker } from './ColorPicker'
import { DEFAULT_BACKGROUND_COLOR, DEFAULT_MODEL_COLOR } from '../../lib/parameters'
import { Tooltip } from './Tooltip'
import { sliderRowStyle } from './TileMenu'

const CALC_MODE_OPTIONS: DropdownOption[] = Object.entries(CALC_MODE_DEFS).map(
  ([mode, def]) => ({ value: mode, label: def.label })
)

export interface LatticeMenuProps {
  nt1: number
  nt2: number
  nt3: number
  g1: number
  g2: number
  calculationMode: CalcMode
  onNt1Change: (v: number) => void
  onNt2Change: (v: number) => void
  onNt3Change: (v: number) => void
  onG1Change: (v: number) => void
  onG2Change: (v: number) => void
  onCalculationModeChange: (mode: CalcMode) => void
  onFilesAdd?: (files: File[]) => void
  onFileRemove?: (name: string) => void
  calcMode: CalcMode
  fileNames: string[]
  className?: string
  modelColor: string
  setModelColor: (color: string) => void
  backgroundColor: string
  setBackgroundColor: (color: string) => void
  extrudeLength: number
  onExtrudeLengthChange: (v: number) => void
  tolerance: number
  onToleranceChange: (v: number) => void
}

const LatticeMenu = React.forwardRef<HTMLDivElement, LatticeMenuProps>(
  (
    {
      nt1, nt2, nt3, g1, g2,
      calculationMode,
      onNt1Change, onNt2Change, onNt3Change,
      onG1Change, onG2Change,
      onCalculationModeChange,
      className,
      calcMode,
      onFilesAdd,
      onFileRemove,
      fileNames,
      modelColor,
      setModelColor,
      backgroundColor,
      setBackgroundColor,
      extrudeLength,
      onExtrudeLengthChange,
      tolerance,
      onToleranceChange,
    },
    ref
  ) => {
    const [useViewerSettingsMenu, setUseViewerSettingsMenu] = React.useState(false)
    const [localTolerance, setLocalTolerance] = React.useState(tolerance)
    React.useEffect(() => { setLocalTolerance(tolerance) }, [tolerance])
    const [isAddFilesHovered, setIsAddFilesHovered] = React.useState(false)
    const [isAddFilesFocused, setIsAddFilesFocused] = React.useState(false)

    const fileInputRef = React.useRef<HTMLInputElement>(null)

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const all = Array.from(e.target.files ?? [])
      if (all.length === 0) return
      const limited = CALC_MODE_DEFS[calcMode].requiredFilesCount === 2 ? all.slice(0, 2) : [all[0]]
      onFilesAdd?.(limited)
      e.target.value = ''
    }

    return (
      <div
        ref={ref}
        className={cn('lattice-menu', className)}
        style={containerStyle}
      >
        {/* ── Header ── */}
        <div style={headerStyle}>
          <Tooltip content="The lattice maker's main widget">
            <span style={headerTitleStyle}>Lattice Maker</span>
          </Tooltip>
        </div>

        <Divider />

        {/* ── Tiles Counts ── */}
        <div style={sectionStyle}>
          <Tooltip content="Number of tiles to place along the two (XY) axes of the parametric domain of the input surfaces and Z (out of the two surfaces). Must be a number between 1 and 10, in each axis.">
            <span style={sectionLabelStyle}>Tiles Counts</span>
          </Tooltip>
          <div style={numTilesRowStyle}>
            <NumberInput label="X" value={nt1} min={1} max={10} onChange={onNt1Change} aria-label="X tiles" />
            <NumberInput label="Y" value={nt2} min={1} max={10} onChange={onNt2Change} aria-label="Y tiles" />
            <NumberInput label="Z" value={nt3} min={1} max={10} onChange={onNt3Change} aria-label="Z tiles" />
          </div>
        </div>

        <Divider />

        {/* ── Macro-shape Construction ── */}
        <div style={sectionStyle}>
          <Tooltip content={"Three types of volumetric macro-shape volumetric (trivariate) construction are supported:\n1. Extrusion – the input IGES surface is extruded in +Z by a desired extrusion length.\n2. Revolution – the input IGES surface is revolved around the +Z axis.\n3. Ruling – the two input IGES surfaces are ruled in between.\nEach IGES file should contain either a single tensor-product Bezier surface or a single tensor-product B-spline surface, with no interior knots. UV/degrees could be anything."}>
            <span style={sectionLabelStyle}>Macro-shape Construction</span>
          </Tooltip>
          <Dropdown
            options={CALC_MODE_OPTIONS}
            value={calculationMode}
            onChange={v => onCalculationModeChange(v as CalcMode)}
          />
          {calculationMode === 'extrusion' && (
            <div style={extrudeLengthWrapperStyle}>
              <Tooltip content="Controls how far the input surface is extruded along its normal to form the 3D macro volume. A larger value produces a deeper extrusion.">
                <span style={sectionLabelStyle}>Extrusion Length</span>
              </Tooltip>
              <NumberInput
                value={extrudeLength}
                min={0.1}
                onChange={onExtrudeLengthChange}
                aria-label="Extrusion length"
              />
            </div>
          )}
        </div>

        <Divider />

        {/* ── Load surfaces as IGES Files ── */}
        <div
          role="button"
          tabIndex={0}
          aria-label="Load surfaces as IGES Files"
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click() } }}
          onMouseEnter={() => setIsAddFilesHovered(true)}
          onMouseLeave={() => setIsAddFilesHovered(false)}
          onFocus={() => setIsAddFilesFocused(true)}
          onBlur={() => setIsAddFilesFocused(false)}
          style={{
            ...sectionStyle,
            cursor: 'pointer',
            backgroundColor: isAddFilesHovered ? 'var(--bg-tertiary)' : 'transparent',
            borderRadius: 4,
            transition: 'background-color 120ms ease',
            outline: isAddFilesFocused ? '2px solid var(--border-focus)' : 'none',
            outlineOffset: 2,
          }}
        >
          <div style={tileSummaryRowStyle}>
            <Tooltip content="The Extrusion and Revolution constructors of the macro-shape require that one IGES file surface be specified here. The Ruling constructor requires two IGES file surfaces. Each IGES file should contain either a single tensor-product Bezier surface or a single tensor-product B-spline surface with no interior knots. U/V degrees could be anything.">
              <span style={sectionLabelStyle}>Load surfaces as IGES Files</span>
            </Tooltip>
            <span aria-hidden="true" style={plusButtonStyle}>
              <PlusIcon />
            </span>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".igs"
            multiple={calcMode === 'ruling'}
            style={{ display: 'none' }}
            onChange={handleFileChange}
            aria-hidden="true"
            tabIndex={-1}
          />
        </div>

        {fileNames.length > 0 && (
          <ul style={fileListStyle}>
            {fileNames.map(name => (
              <li key={name} style={fileListItemStyle}>
                <span style={fileItemLeftStyle}>
                  <CubeIcon3D size={14} />
                  <span style={fileNameTextStyle}>{name}</span>
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${name}`}
                  onClick={() => onFileRemove?.(name)}
                  style={removeFileButtonStyle}
                >
                  &times;
                </button>
              </li>
            ))}
          </ul>
        )}

        <Divider />

            <Tooltip content="A linear grading control over the thickness of the arm in the tiles, along the third, Z, direction. Values between zero and one.">
          <div style={sliderRowStyle}>
                <Slider
                  label="Grading Start"
                  min={0.1}
                  max={2.5}
                  step={0.01}
                  value={[g1]}
                  showValue
                  valuePrecision={2}
                  fontSize={12}
                  onValueChange={([v]) => onG1Change(v)}
                />
                <Slider
                  label="Grading End"
                  min={0.1}
                  max={2.5}
                  step={0.01}
                  value={[g2]}
                  showValue
                  valuePrecision={2}
                  fontSize={12}
                  onValueChange={([v]) => onG2Change(v)}
                />
              </div>
            </Tooltip>
        {/* ── Viewer Settings ── */}
        <Button onClick={() => setUseViewerSettingsMenu(v => !v)} variant="secondary">
          {useViewerSettingsMenu ? '- ' : '+ '}Viewer Settings
        </Button>

        {useViewerSettingsMenu && (
          <div style={sectionStyle}>
            <Divider />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Tooltip content="The colors of the foreground objects (tiles, lattice, etc.) in the graphics display.">
                <span>Mesh Color:</span>
              </Tooltip>
              <ColorPicker disableAlpha value={modelColor} onChange={setModelColor} />
            </div>
            <Divider />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Tooltip content="The background color of the graphics display.">
                <span>Background Color:</span>
              </Tooltip>
              <ColorPicker disableAlpha value={backgroundColor} onChange={setBackgroundColor} />
            </div>
            <Divider />
            <Button
              onClick={() => { setModelColor(DEFAULT_MODEL_COLOR); setBackgroundColor(DEFAULT_BACKGROUND_COLOR) }}
              variant="secondary"
            >
              Reset Colors
            </Button>
            <Divider />
            <Tooltip content="Controls the visual quality of the surface preview. Lower values produce a finer, more accurate tessellation. This affects only the display — the macro shape and lattice are always computed directly from the raw IGES data.">
              <div style={sliderRowStyle}>
                <Slider
                  label="Tessellation Tolerance"
                  min={0}
                  max={1}
                  step={0.05}
                  value={[localTolerance]}
                  showValue
                  valuePrecision={2}
                  fontSize={12}
                  onValueChange={([v]) => setLocalTolerance(v)}
                  onValueCommit={([v]) => { setLocalTolerance(v); onToleranceChange(v) }}
                />
              </div>
            </Tooltip>
          </div>
        )}
      </div>
    )
  }
)

LatticeMenu.displayName = 'LatticeMenu'

/* ─── Icons ─── */

function PlusIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 9 9" fill="none" aria-hidden="true">
      <path d="M4.5 1v7M1 4.5h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
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
  width: 300,
  backgroundColor: 'var(--bg-primary)',
  borderRadius: 14,
  boxShadow: '1px 2px 9px 0px rgba(0,0,0,0.10)',
  padding: '19px 0 16px',
  overflowY: 'auto',
  maxHeight: '100%',
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '0 var(--space-md)',
}

const headerTitleStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-base)',
}

const dividerStyle: React.CSSProperties = {
  height: 3,
  backgroundColor: 'var(--bg-tertiary)',
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

const tileSummaryRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
}

const plusButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-secondary)',
  padding: 2,
  display: 'flex',
  alignItems: 'center',
}

const numTilesRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  alignItems: 'center',
}

const fileListStyle: React.CSSProperties = {
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  margin: 0,
  padding: '0 var(--space-md)',
}

const fileListItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
}

const fileItemLeftStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  minWidth: 0,
}

const fileNameTextStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-size-xs)',
  color: 'var(--text-base)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const removeFileButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: 14,
  lineHeight: 1,
  color: 'var(--text-secondary)',
  flexShrink: 0,
  padding: 2,
}

const extrudeLengthWrapperStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
}

export { LatticeMenu }
