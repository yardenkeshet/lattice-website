import * as React from 'react'
import { cn } from '../../lib/utils'
import { Button } from './Button'
import { Slider } from './Slider'
import { NumberInput } from './NumberInput'
import { Dropdown, type DropdownOption } from './Dropdown'
import { TileCard } from './TileCard'
import { IconButton } from './IconButton'
import { CALC_MODE_DEFS, type CalcMode, type TileType } from '../../calculation_params'
import { CubeIcon3D } from './Toolbar'
import { ColorPicker } from './ColorPicker'
import { DEFAULT_BACKGROUND_COLOR, DEFAULT_MODEL_COLOR } from '../../lib/parameters'
import Popup from './Popup'

const CALC_MODE_OPTIONS: DropdownOption[] = Object.entries(CALC_MODE_DEFS).map(
  ([mode, def]) => ({ value: mode, label: def.label })
)

/* ─── Public API ─── */

export interface LatticeMenuProps {
  /** Currently selected tile type — shown as mini preview. */
  tileType: TileType
  tileLabel?: string
  /** Optional mini tile preview URL */
  tilePreviewUrl?: string

  nt1: number
  nt2: number
  nt3: number
  g1: number
  g2: number
  calculationMode: CalcMode

  /** Whether a download token is available (enables Export button). */
  canExport?: boolean
  /** Whether the panel is expanded (true) or collapsed to an icon (false). */
  isOpen?: boolean

  onNt1Change: (v: number) => void
  onNt2Change: (v: number) => void
  onNt3Change: (v: number) => void
  onG1Change: (v: number) => void
  onG2Change: (v: number) => void
  onG1Commit?: (v: number) => void
  onG2Commit?: (v: number) => void
  onCalculationModeChange: (mode: CalcMode) => void
  onOpenTileMenu: () => void
  onExportStl: () => void
  onExportIgs: () => void
  onToggle: () => void
  onFilesAdd?: (files: File[]) => void
  onFileRemove?: (name: string) => void
  calcMode: CalcMode
  fileNames: string[]
  className?: string
  modelColor: string
  setModelColor: (color: string) => void
  backgroundColor: string
  setBackgroundColor: (color: string) => void
}

const LatticeMenu = React.forwardRef<HTMLDivElement, LatticeMenuProps>(
  (
    {
      tileType,
      tileLabel,
      tilePreviewUrl,
      nt1, nt2, nt3, g1, g2,
      calculationMode,
      canExport = false,
      isOpen = true,
      onNt1Change, onNt2Change, onNt3Change,
      onG1Change, onG2Change,
      onG1Commit, onG2Commit,
      onCalculationModeChange,
      onOpenTileMenu,
      onExportStl,
      onExportIgs,
      onToggle,
      className,
      calcMode,
      onFilesAdd,
      onFileRemove,
      fileNames,
      modelColor,
      setModelColor,
      backgroundColor,
      setBackgroundColor
    },
    ref
  ) => {
    // Hooks must be called unconditionally — before any early return.
    const [isTileHovered, setIsTileHovered] = React.useState(false)
    const [isTileFocused, setIsTileFocused] = React.useState(false)
    const [useAdvancedFeatures, setUseAdvancedFeatures] = React.useState(false)
    const [isExportPopupOpen, setIsExportPopupOpen] = React.useState(false)
    const [isAddFilesHovered, setIsAddFilesHovered] = React.useState(false)
    const [isAddFilesFocused, setIsAddFilesFocused] = React.useState(false)



    const tileName = tileLabel

    const fileInputRef = React.useRef<HTMLInputElement>(null)

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const all = Array.from(e.target.files ?? [])
      if (all.length === 0) return
      const limited = CALC_MODE_DEFS[calcMode].requiredFilesCount == 2 ? all.slice(0, 2) : [all[0]]
      onFilesAdd?.(limited)
      e.target.value = ''  // reset so the same file can be re-selected
    }
    /* ── Collapsed state: just a floating menu icon button ── */
    if (!isOpen) {
      return (
        <div ref={ref} style={collapsedWrapperStyle} className={className}>
          <IconButton aria-label="Open Lattice Maker menu" onClick={onToggle}>
            <MenuIcon />
          </IconButton>
        </div>
      )
    }
    return (
      <div
        ref={ref}
        className={cn('lattice-menu', className)}
        style={containerStyle}
      >
        {/* ── Header ── */}
        <div style={headerStyle}>
          <span style={headerTitleStyle}>Lattice Maker</span>
          <button type="button" aria-label="Collapse menu" onClick={onToggle} style={collapseButtonStyle}>
            <ChevronLeftIcon />
          </button>
        </div>

        <Divider />

        {/* ── Lattice Tile row — whole section is the click target ── */}
        <div
          role="button"
          tabIndex={0}
          aria-label="Open tile configuration"
          onClick={onOpenTileMenu}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenTileMenu() } }}
          onMouseEnter={() => setIsTileHovered(true)}
          onMouseLeave={() => setIsTileHovered(false)}
          onFocus={() => setIsTileFocused(true)}
          onBlur={() => setIsTileFocused(false)}
          style={{
            ...sectionStyle,
            cursor: 'pointer',
            backgroundColor: isTileHovered ? 'var(--bg-tertiary)' : 'transparent',
            borderRadius: 4,
            transition: 'background-color 120ms ease',
            outline: isTileFocused ? '2px solid var(--border-focus)' : 'none',
            outlineOffset: 2,
          }}
        >
          <span style={sectionLabelStyle}>Lattice Tile</span>
          <div style={tileSummaryRowStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <TileCard
                size="mini"
                modelUrl={tilePreviewUrl}
                cameraResetKey={tileType}
                meshColor={modelColor}
                backgroundColor={backgroundColor}
                aria-label={`Current tile: ${tileName}`}
                selected
              />
              <span style={tileNameStyle}>{tileName}</span>
            </div>
            {/* PlusIcon is now decorative — click is handled by the parent div */}
            <span aria-hidden="true" style={plusButtonStyle}>
              <PlusIcon />
            </span>
          </div>
        </div>

        <Divider />

        {/* ── Num Tiles ── */}
        <div style={sectionStyle}>
          <span style={sectionLabelStyle}>Tiles Counts</span>
          <div style={numTilesRowStyle}>
            <NumberInput label="X" value={nt1} min={1} max={99} onChange={onNt1Change} aria-label="X tiles" />
            <NumberInput label="Y" value={nt2} min={1} max={99} onChange={onNt2Change} aria-label="Y tiles" />
            <NumberInput label="Z" value={nt3} min={1} max={99} onChange={onNt3Change} aria-label="Z tiles" />
          </div>
        </div>



        <Divider />

        {/* ── Calculation mode ── */}
        <div style={sectionStyle}>
          <span style={sectionLabelStyle}>Calculation Mode</span>
          <Dropdown
            options={CALC_MODE_OPTIONS}
            value={calculationMode}
            onChange={v => onCalculationModeChange(v as CalcMode)}
          />
        </div>

        <Divider />

        {/* ── Add Files row — whole row is the click target ── */}
        <div
          role="button"
          tabIndex={0}
          aria-label="Add IGS file"
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
            <span style={sectionLabelStyle}>Add Files:</span>
            <span aria-hidden="true" style={plusButtonStyle}>
              <PlusIcon />
            </span>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={'.igs'}
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
        {/* ── Export button ── */}
        <div style={exportRowStyle}>
          {
            canExport ?
              <Button
                variant="primary"
                disabled={!canExport}
                onClick={() => setIsExportPopupOpen(true)}
              >
                Export
              </Button> :
              <Button
                variant="secondary"
                disabled={true}
              >
                Export
              </Button>
          }
        </div>
        <Popup isOpen={isExportPopupOpen} onClose={() => setIsExportPopupOpen(false)}>
          <div style={exportRowStyle}>
            <Button
              variant="primary"
              disabled={!canExport}
              onClick={() => { setIsExportPopupOpen(false); onExportStl() }}
            >
              Export STL
            </Button>
            <Divider />
            <Button
              variant="primary"
              disabled={!canExport}
              onClick={() => { setIsExportPopupOpen(false); onExportIgs() }}
            >
              Export IGS
            </Button>
          </div>
        </Popup>

        <Divider />

        {/* ── Grading sliders ── */}
        <Button onClick={() => { setUseAdvancedFeatures(!useAdvancedFeatures) }} variant="secondary">{useAdvancedFeatures ? "- " : "+ "}Use Advanced Features</Button>
        {
          useAdvancedFeatures
            ?
            <div style={sectionStyle}>
              <Slider
                label="Grading Start"
                min={0}
                max={1}
                step={0.01}
                value={[g1]}
                showValue
                valuePrecision={2}
                fontSize={12}
                onValueChange={([v]) => onG1Change(v)}
                onValueCommit={([v]) => onG1Commit?.(v)}
              />
              <Slider
                label="Grading End"
                min={0}
                max={1}
                step={0.01}
                value={[g2]}
                showValue
                valuePrecision={2}
                fontSize={12}
                onValueChange={([v]) => onG2Change(v)}
                onValueCommit={([v]) => onG2Commit?.(v)}
              />
              <Divider />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                Mesh Color:
                <ColorPicker
                  disableAlpha
                  value={modelColor}
                  onChange={setModelColor}
                />
              </div>
              <Divider />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                Background Color:
                <ColorPicker
                  disableAlpha
                  value={backgroundColor}
                  onChange={setBackgroundColor}
                />
              </div>
              <Divider />
              <Button onClick={() => { setModelColor(DEFAULT_MODEL_COLOR); setBackgroundColor(DEFAULT_BACKGROUND_COLOR) }} variant="secondary">
                Reset Colors
              </Button>
            </div>
            : <></>

        }
      </div>
    )
  }
)

LatticeMenu.displayName = 'LatticeMenu'

/* ─── Icons ─── */

function MenuIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function ChevronLeftIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M13 4l-6 6 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

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

const collapsedWrapperStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  paddingTop: 8,
}

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
  justifyContent: 'space-between',
  padding: '0 var(--space-md)',
}

const headerTitleStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-base)',
}

const collapseButtonStyle: React.CSSProperties = {
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
  flexShrink: 0,
  boxShadow: '1px 2px 6px -2px rgba(0,0,0,0.14)',
}

export const sectionStyle: React.CSSProperties = {
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

const tileNameStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-size-xs)',
  fontWeight: 600,
  color: 'var(--text-base)',
  whiteSpace: 'nowrap',
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

const exportRowStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  gap: '5px',
  justifyContent: 'center',
  padding: '0 var(--space-md)',
}

export { LatticeMenu }
