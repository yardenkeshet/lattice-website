import * as React from 'react'
import { cn } from '../../lib/utils'
import type { TileType, CalcMode } from '../../api/types'
import { Button } from './Button'
import { Slider } from './Slider'
import { NumberInput } from './NumberInput'
import { Dropdown } from './Dropdown'
import { TileCard } from './TileCard'
import { IconButton } from './IconButton'

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
  onCalculationModeChange: (mode: CalcMode) => void
  onOpenTileMenu: () => void
  onExport: () => void
  onToggle: () => void

  className?: string
}

const CALC_MODE_OPTIONS = [
  { value: 'extrusion',  label: 'Extrusion' },
  { value: 'revolution', label: 'Revolution' },
  { value: 'ruling',     label: 'Ruling' },
]

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
      onCalculationModeChange,
      onOpenTileMenu,
      onExport,
      onToggle,
      className,
    },
    ref
  ) => {
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

    const tileName = tileLabel ?? { cross: 'Cross', diagonal: 'Diagonal', cross_diagonal: 'Cross Diagonal' }[tileType]

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

        {/* ── Lattice Tile row ── */}
        <div style={sectionStyle}>
          <span style={sectionLabelStyle}>Lattice Tile</span>
          <div style={tileSummaryRowStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <TileCard
                size="mini"
                modelUrl={tilePreviewUrl}
                aria-label={`Current tile: ${tileName}`}
                selected
              />
              <span style={tileNameStyle}>{tileName}</span>
            </div>
            <button
              type="button"
              aria-label="Open tile configuration"
              onClick={onOpenTileMenu}
              style={plusButtonStyle}
            >
              <PlusIcon />
            </button>
          </div>
        </div>

        <Divider />

        {/* ── Num Tiles ── */}
        <div style={sectionStyle}>
          <span style={sectionLabelStyle}>Num Tiles</span>
          <div style={numTilesRowStyle}>
            <NumberInput label="X" value={nt1} min={1} max={99} onChange={onNt1Change} aria-label="X tiles" />
            <NumberInput label="Y" value={nt2} min={1} max={99} onChange={onNt2Change} aria-label="Y tiles" />
            <NumberInput label="Z" value={nt3} min={1} max={99} onChange={onNt3Change} aria-label="Z tiles" />
          </div>
        </div>

        <Divider />

        {/* ── Grading sliders ── */}
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
          />
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

        {/* ── Export button ── */}
        <div style={exportRowStyle}>
          <Button
            variant="secondary"
            disabled={!canExport}
            onClick={onExport}
          >
            Export
          </Button>
        </div>
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
  width: 235,
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
  cursor: 'pointer',
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

const exportRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  padding: '0 var(--space-md)',
}

export { LatticeMenu }
