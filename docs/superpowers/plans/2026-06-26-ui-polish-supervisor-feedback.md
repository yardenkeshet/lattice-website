# UI Polish — Supervisor Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply supervisor-requested UI changes to the React frontend: remove menu toggles, restructure the toolbar, rename labels, and add a custom Tooltip component site-wide.

**Architecture:** All changes are in `react_frontend/src/`. Each task leaves the codebase TypeScript-clean before committing. No backend changes required. The Tooltip component uses `React.createPortal` into `document.body` so it escapes `overflow: hidden` containers.

**Tech Stack:** React 18, TypeScript, Vite, React Three Fiber, Storybook. No new dependencies added.

## Global Constraints

- Branch: `feature/ui-polish-supervisor-feedback` (from `feature/file-handling-redesign`)
- All files are under `react_frontend/src/` unless noted
- No new npm packages
- Keep all existing CSS custom properties (`var(--bg-primary)`, `var(--text-base)`, etc.)
- Tooltip text strings must match the spec verbatim (copy from Task 7)
- TypeScript must compile with no errors at the end of each task

---

### Task 1: Create branch and fix page title

**Files:**
- Modify: `react_frontend/index.html`

**Interfaces:**
- Produces: nothing — trivial config change

- [ ] **Step 1: Create branch**

```bash
git checkout -b feature/ui-polish-supervisor-feedback
```

Expected: `Switched to a new branch 'feature/ui-polish-supervisor-feedback'`

- [ ] **Step 2: Fix the page title**

In `react_frontend/index.html`, change line 7:

```html
<!-- before -->
<title>react_frontend</title>

<!-- after -->
<title>Lattice Maker</title>
```

- [ ] **Step 3: Verify**

Run the dev server (`npm run dev` in `react_frontend/`). Open `http://localhost:5173`. The browser tab should show "Lattice Maker".

- [ ] **Step 4: Commit**

```bash
git add react_frontend/index.html
git commit -m "feat: set page title to Lattice Maker"
```

---

### Task 2: Create Tooltip component and Storybook story

**Files:**
- Create: `react_frontend/src/components/ui/Tooltip.tsx`
- Create: `react_frontend/src/components/ui/Tooltip.stories.tsx`

**Interfaces:**
- Produces: `Tooltip` — `({ content: string, children: ReactNode }) => JSX.Element`

- [ ] **Step 1: Create `Tooltip.tsx`**

```tsx
// react_frontend/src/components/ui/Tooltip.tsx
import * as React from 'react'

interface TooltipProps {
  content: string
  children: React.ReactNode
}

export function Tooltip({ content, children }: TooltipProps) {
  const [visible, setVisible] = React.useState(false)
  const [coords, setCoords] = React.useState({ top: 0, left: 0 })
  const triggerRef = React.useRef<HTMLDivElement>(null)

  const show = () => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setCoords({
      top: rect.top - 8,
      left: rect.left + rect.width / 2,
    })
    setVisible(true)
  }

  const hide = () => setVisible(false)

  return (
    <div ref={triggerRef} onMouseEnter={show} onMouseLeave={hide} style={{ display: 'contents' }}>
      {children}
      {visible && typeof document !== 'undefined' &&
        React.createPortal(
          <div style={tooltipStyle(coords)}>
            {content}
          </div>,
          document.body
        )
      }
    </div>
  )
}

function tooltipStyle(coords: { top: number; left: number }): React.CSSProperties {
  return {
    position: 'fixed',
    top: coords.top,
    left: coords.left,
    transform: 'translate(-50%, -100%)',
    backgroundColor: 'var(--bg-secondary)',
    color: 'var(--text-base)',
    fontFamily: 'var(--font-body)',
    fontSize: 11,
    lineHeight: 1.55,
    padding: '7px 11px',
    borderRadius: 8,
    boxShadow: '0 2px 10px rgba(0,0,0,0.18)',
    maxWidth: 280,
    whiteSpace: 'pre-line',
    zIndex: 9999,
    pointerEvents: 'none',
  }
}
```

- [ ] **Step 2: Create `Tooltip.stories.tsx`**

```tsx
// react_frontend/src/components/ui/Tooltip.stories.tsx
import type { Meta, StoryObj } from '@storybook/react'
import { Tooltip } from './Tooltip'

const meta: Meta<typeof Tooltip> = {
  title: 'UI/Tooltip',
  component: Tooltip,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof Tooltip>

export const Short: Story = {
  args: {
    content: "The lattice maker's main widget",
    children: <button style={{ padding: '6px 14px' }}>Hover me</button>,
  },
}

export const Long: Story = {
  args: {
    content:
      'Three types of volumetric macro-shape volumetric (trivariate) construction are supported:\n1. Extrusion – the input IGES surface is extruded in +Z by a desired extrusion length.\n2. Revolution – the input IGES surface is revolved around the +Z axis.\n3. Ruling – the two input IGES surfaces are ruled in between.',
    children: <button style={{ padding: '6px 14px' }}>Hover for long text</button>,
  },
}
```

- [ ] **Step 3: TypeScript check**

```bash
cd react_frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Manual verify in Storybook**

```bash
npm run storybook
```

Open `http://localhost:6006`. Navigate to UI → Tooltip. Hover over the button in each story. Tooltip should appear above the button, centered, with dark background matching site style.

- [ ] **Step 5: Commit**

```bash
git add react_frontend/src/components/ui/Tooltip.tsx react_frontend/src/components/ui/Tooltip.stories.tsx
git commit -m "feat: add custom Tooltip component with portal rendering"
```

---

### Task 3: Remove viewer clear (×) buttons

**Files:**
- Modify: `react_frontend/src/components/ViewerScene.tsx`
- Modify: `react_frontend/src/components/DualViewerLayout.tsx`
- Modify: `react_frontend/src/pages/ToolPage.tsx`

**Interfaces:**
- Consumes: nothing new
- Produces: `ViewerScene` no longer accepts `onClear`; `DualViewerLayout` no longer accepts `onClear1`/`onClear2`

- [ ] **Step 1: Remove clear button from `ViewerScene.tsx`**

In `ViewerScene.tsx`:

1. Remove `onClear` from the `ViewerSceneProps` interface — delete this line:
   ```ts
   onClear?: () => void
   ```

2. Remove `onClear` from the function parameter destructuring — delete `, onClear` from the params list.

3. Remove the entire clear button JSX block (lines 188–200):
   ```tsx
   {/* ── Clear button — top-right, only when content is loaded ── */}
   {!isEmpty && onClear && (
     <button
       type="button"
       aria-label="Clear viewer"
       onClick={e => { e.stopPropagation(); onClear() }}
       style={clearButtonStyle}
     >
       <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
         <path d="M2 2l6 6M8 2L2 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
       </svg>
     </button>
   )}
   ```

4. Remove the `clearButtonStyle` constant at the bottom of the file:
   ```ts
   const clearButtonStyle: React.CSSProperties = { ... }
   ```

5. Update the placeholder text (line 177) to remove the reference to the `+` button:
   ```tsx
   // before
   Drop a .igs file here,<br />or use the + button above
   
   // after
   Drop a .igs file here
   ```

- [ ] **Step 2: Remove clear props from `DualViewerLayout.tsx`**

In `DualViewerLayout.tsx`:

1. Remove `onClear1` and `onClear2` from `DualViewerLayoutProps` — delete these lines:
   ```ts
   onClear1?: () => void
   onClear2?: () => void
   ```

2. Remove `onClear1` and `onClear2` from the function parameter destructuring.

3. Remove `onClear={onClear1}` from the first `<ViewerScene>` call.

4. Remove `onClear={onClear2}` from the second `<ViewerScene>` call.

The final `DualViewerLayout.tsx` should look like:

```tsx
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
```

- [ ] **Step 3: Update `ToolPage.tsx` — remove clear props**

In `ToolPage.tsx`:

1. Remove `onClear={handleClearSingle}` from the `<ViewerScene>` usage (around line 463).

2. Remove `onClear1={handleClear1}` and `onClear2={handleClear2}` from the `<DualViewerLayout>` usage (around lines 453–454).

The ViewerScene usage becomes:
```tsx
<ViewerScene
  uploadedFile={uploadedFile}
  resultStlGzB64={resultGzB64}
  cameraMode={cameraMode}
  cameraResetKey={viewerResetKey}
  onFileDrop={handleViewerFileDrop}
  onAutoFitComplete={handleAutoFitComplete}
  meshColor={meshColor}
  backgroundColor={backgroundColor}
/>
```

The DualViewerLayout usage becomes:
```tsx
<DualViewerLayout
  file1={uploadedFile}
  file2={uploadedFile2}
  onFile1Drop={handleFile1Drop}
  onFile2Drop={handleFile2Drop}
  cameraMode={cameraMode}
  style={{ height: '100%' }}
/>
```

- [ ] **Step 4: TypeScript check**

```bash
cd react_frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Manual verify**

Start dev server. Load an IGS file. Confirm the × button is gone from the viewer. Confirm files can still be removed via the × buttons in LatticeMenu's file list.

- [ ] **Step 6: Commit**

```bash
git add react_frontend/src/components/ViewerScene.tsx react_frontend/src/components/DualViewerLayout.tsx react_frontend/src/pages/ToolPage.tsx
git commit -m "feat: remove viewer clear button; files managed via LatticeMenu only"
```

---

### Task 4: TileMenu always open — remove close button

**Files:**
- Modify: `react_frontend/src/components/ui/TileMenu.tsx`
- Modify: `react_frontend/src/pages/ToolPage.tsx`

**Interfaces:**
- Consumes: nothing new
- Produces: `TileMenu` no longer accepts `onClose`; always rendered in ToolPage

- [ ] **Step 1: Remove `onClose` from `TileMenu.tsx`**

In `TileMenu.tsx`:

1. Remove `onClose: () => void` from `TileMenuProps`.

2. Remove `onClose` from the function parameter destructuring.

3. Remove the close button JSX from the header (lines 99–107):
   ```tsx
   <button
     type="button"
     aria-label="Close tile menu"
     onClick={onClose}
     style={closeButtonStyle}
   >
     <CloseIcon />
   </button>
   ```

4. Remove the `CloseIcon` function (lines 182–188).

5. Remove the `closeButtonStyle` constant.

The header block becomes:
```tsx
{/* ── Header ── */}
<div style={headerStyle}>
  <span style={headerTitleStyle}>Lattice Tile</span>
</div>
```

And `headerStyle` can simplify since there's no longer a right-side element (remove `justifyContent: 'space-between'` if desired, or leave it — either is fine).

- [ ] **Step 2: Update `ToolPage.tsx` — TileMenu always rendered**

In `ToolPage.tsx`:

1. Remove the `isTileMenuOpen` state declaration:
   ```ts
   // delete this line:
   const [isTileMenuOpen, setIsTileMenuOpen] = React.useState(DEFAULT_TILE_MENU_OPEN)
   ```

2. Remove the `handleTileMenuClose` callback:
   ```ts
   // delete this:
   const handleTileMenuClose = React.useCallback(() => setIsTileMenuOpen(false), [])
   ```

3. Change the right panel from conditionally rendered to always rendered. Replace:
   ```tsx
   {isTileMenuOpen && (
     <div style={rightPanelStyle}>
       <TileMenu
         ...
         onClose={handleTileMenuClose}
         ...
       />
     </div>
   )}
   ```
   with:
   ```tsx
   <div style={rightPanelStyle}>
     <TileMenu
       tileType={tileType}
       sliderValues={tileSliderValues}
       previewStlGzB64={tilePreviewGzB64 ?? undefined}
       onTileTypeChange={handleTileTypeChange}
       onSliderChange={handleTileSliderChange}
       onSliderCommit={handleTileSliderCommit}
       onValidationChange={handleValidationChange}
       meshColor={meshColor}
       backgroundColor={backgroundColor}
     />
   </div>
   ```

4. Remove the `DEFAULT_TILE_MENU_OPEN` import from the `'../lib/parameters'` import (if it's now unused). Check: if `DEFAULT_LATTICE_MENU_OPEN` is also still used, keep that import but remove `DEFAULT_TILE_MENU_OPEN` from the destructure.

- [ ] **Step 3: TypeScript check**

```bash
cd react_frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Manual verify**

Start dev server. Open the tool page. Confirm the TileMenu (right panel) is always visible with no × button in its header.

- [ ] **Step 5: Commit**

```bash
git add react_frontend/src/components/ui/TileMenu.tsx react_frontend/src/pages/ToolPage.tsx
git commit -m "feat: TileMenu always visible, remove close button"
```

---

### Task 5: Toolbar — remove file button, add Export Lattice, rename Calculate

**Files:**
- Modify: `react_frontend/src/components/ui/Toolbar.tsx`
- Modify: `react_frontend/src/pages/ToolPage.tsx`

**Interfaces:**
- Consumes: `Popup` from `'./Popup'`
- Produces: `ToolbarProps` — removes `onFilesAdd`, `fileNames`, `calcMode`; adds `onExportStl: () => void`, `onExportIgs: () => void`, `canExport?: boolean`

- [ ] **Step 1: Rewrite `Toolbar.tsx`**

Replace the entire file with:

```tsx
import * as React from 'react'
import { cn } from '../../lib/utils'
import { Button } from './Button'
import Popup from './Popup'

export interface ToolbarProps {
  cameraMode?: 'perspective' | 'orthographic'
  isCalculating?: boolean
  calcLabel?: string
  canExport?: boolean
  onCameraModeChange: (mode: 'perspective' | 'orthographic') => void
  onExportStl: () => void
  onExportIgs: () => void
  onCalculate?: () => void
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
          <button
            type="button"
            aria-haspopup="listbox"
            onClick={() => onCameraModeChange(cameraMode === 'orthographic' ? 'perspective' : 'orthographic')}
            style={cameraPillButtonStyle}
          >
            <CameraIcon />
            <span style={pillTextStyle}>{cameraMode}</span>
          </button>

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
```

- [ ] **Step 2: Update `ToolPage.tsx` — Toolbar props**

In `ToolPage.tsx`, update the `<Toolbar>` usage to:

```tsx
<Toolbar
  onCalculate={handleCalculate}
  cameraMode={cameraMode}
  isCalculating={isCalculating}
  calcLabel={calcLabel}
  canExport={!!downloadToken}
  onCameraModeChange={setCameraMode}
  onExportStl={handleExportStl}
  onExportIgs={handleExportIgs}
/>
```

(Remove `calcMode`, `onFilesAdd`, `fileNames` from this usage.)

- [ ] **Step 3: TypeScript check**

```bash
cd react_frontend && npx tsc --noEmit
```

Expected: no errors. (LatticeMenu still has its own Export button at this point — that gets removed in Task 6.)

- [ ] **Step 4: Manual verify**

Start dev server. On the tool page:
- Confirm the `+` file button is gone from the toolbar
- Confirm "Export Lattice" button appears to the left of "Make Lattice"
- Confirm "Export Lattice" is disabled before a lattice is calculated
- Confirm "Make Lattice" is the label (not "Calculate")
- Confirm clicking "Export Lattice" after a calculation opens the STL/IGS popup

- [ ] **Step 5: Commit**

```bash
git add react_frontend/src/components/ui/Toolbar.tsx react_frontend/src/pages/ToolPage.tsx
git commit -m "feat: toolbar — add Export Lattice button, rename Calculate to Make Lattice, remove file button"
```

---

### Task 6: LatticeMenu — remove collapse, tile section, Export; rename sections; update ToolPage

**Files:**
- Modify: `react_frontend/src/components/ui/LatticeMenu.tsx`
- Modify: `react_frontend/src/pages/ToolPage.tsx`

**Interfaces:**
- Produces: `LatticeMenuProps` removes `isOpen`, `onToggle`, `onOpenTileMenu`, `tilePreviewUrl`, `tileLabel`, `canExport`, `onExportStl`, `onExportIgs`

- [ ] **Step 1: Rewrite `LatticeMenu.tsx`**

Replace the entire file with the following (key changes annotated in comments):

```tsx
import * as React from 'react'
import { cn } from '../../lib/utils'
import { Button } from './Button'
import { Slider } from './Slider'
import { NumberInput } from './NumberInput'
import { Dropdown, type DropdownOption } from './Dropdown'
import { CALC_MODE_DEFS, type CalcMode, type TileType } from '../../calculation_params'
import { CubeIcon3D } from './Toolbar'
import { ColorPicker } from './ColorPicker'
import { DEFAULT_BACKGROUND_COLOR, DEFAULT_MODEL_COLOR } from '../../lib/parameters'

const CALC_MODE_OPTIONS: DropdownOption[] = Object.entries(CALC_MODE_DEFS).map(
  ([mode, def]) => ({ value: mode, label: def.label })
)

export interface LatticeMenuProps {
  tileType: TileType
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
    },
    ref
  ) => {
    const [useAdvancedFeatures, setUseAdvancedFeatures] = React.useState(false)
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
          <span style={headerTitleStyle}>Lattice Maker</span>
        </div>

        <Divider />

        {/* ── Tiles Counts ── */}
        <div style={sectionStyle}>
          <span style={sectionLabelStyle}>Tiles Counts</span>
          <div style={numTilesRowStyle}>
            <NumberInput label="X" value={nt1} min={1} onChange={onNt1Change} aria-label="X tiles" />
            <NumberInput label="Y" value={nt2} min={1} onChange={onNt2Change} aria-label="Y tiles" />
            <NumberInput label="Z" value={nt3} min={1} onChange={onNt3Change} aria-label="Z tiles" />
          </div>
        </div>

        <Divider />

        {/* ── Macro-shape Construction ── */}
        <div style={sectionStyle}>
          <span style={sectionLabelStyle}>Macro-shape Construction</span>
          <Dropdown
            options={CALC_MODE_OPTIONS}
            value={calculationMode}
            onChange={v => onCalculationModeChange(v as CalcMode)}
          />
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
            <span style={sectionLabelStyle}>Load surfaces as IGES Files</span>
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

        {/* ── Advanced Features ── */}
        <Button onClick={() => setUseAdvancedFeatures(v => !v)} variant="secondary">
          {useAdvancedFeatures ? '- ' : '+ '}Use Advanced Features
        </Button>
        {useAdvancedFeatures && (
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
            <Divider />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              Mesh Color:
              <ColorPicker disableAlpha value={modelColor} onChange={setModelColor} />
            </div>
            <Divider />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>Background Color:</span>
              <ColorPicker disableAlpha value={backgroundColor} onChange={setBackgroundColor} />
            </div>
            <Divider />
            <Button
              onClick={() => { setModelColor(DEFAULT_MODEL_COLOR); setBackgroundColor(DEFAULT_BACKGROUND_COLOR) }}
              variant="secondary"
            >
              Reset Colors
            </Button>
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

export { LatticeMenu }
```

- [ ] **Step 2: Update `ToolPage.tsx` — LatticeMenu props and state**

In `ToolPage.tsx`:

1. Remove the `isLatticeMenuOpen` state:
   ```ts
   // delete this line:
   const [isLatticeMenuOpen, setIsLatticeMenuOpen] = React.useState(DEFAULT_LATTICE_MENU_OPEN)
   ```

2. Remove `DEFAULT_LATTICE_MENU_OPEN` from the `'../lib/parameters'` import (and `DEFAULT_TILE_MENU_OPEN` if still present).

3. Remove the `tilePreviewUrl` blob URL (no longer needed since LatticeMenu no longer shows tile preview):
   ```ts
   // delete this line:
   const tilePreviewUrl = useStlBlobUrl(tilePreviewGzB64)
   ```
   Also remove the `useStlBlobUrl` import if it's now unused (check — `useStlBlobUrl` is also imported in TileMenu via `'../../lib/stl'`, but in ToolPage it may now only be needed for... actually `useStlBlobUrl` is only used for `tilePreviewUrl` in ToolPage; `resultGzB64` is passed raw to ViewerScene which has its own `useStlBlobUrl` internally). Remove the import if it's unused.

4. Remove `stlTextToGzB64` from the `'../lib/stl'` import if it's now unused. (It's used in the `useEffect` that loads the default tile on mount. Keep it if that effect stays. Keep the effect — it still populates `tilePreviewGzB64` which drives the TileMenu live preview. But the `setResultGzB64(stlTextToGzB64(text))` call in that effect can stay too since it gives the viewer an initial tile to display.)

5. Update `<LatticeMenu>` usage — remove the props that no longer exist:
   ```tsx
   <LatticeMenu
     tileType={tileType}
     nt1={nt1} nt2={nt2} nt3={nt3}
     g1={g1} g2={g2}
     calculationMode={calcMode}
     onNt1Change={setNt1} onNt2Change={setNt2} onNt3Change={setNt3}
     onG1Change={setG1} onG2Change={setG2}
     onCalculationModeChange={handleCalcModeChange}
     onFilesAdd={handleFilesAdd}
     onFileRemove={handleFileRemove}
     fileNames={fileNames}
     calcMode={calcMode}
     modelColor={meshColor}
     setModelColor={setMeshColor}
     backgroundColor={backgroundColor}
     setBackgroundColor={setBackgroundColor}
   />
   ```
   (Removed: `tilePreviewUrl`, `canExport`, `isOpen`, `onToggle`, `onOpenTileMenu`, `onExportStl`, `onExportIgs`)

6. The `leftPanelStyle` wrapper no longer needs a collapse toggle, so it stays as-is.

- [ ] **Step 3: TypeScript check**

```bash
cd react_frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Manual verify**

Start dev server. Confirm:
- LatticeMenu always shows its full panel (no hamburger icon, no collapse button)
- The tile preview section is gone from LatticeMenu
- Tile count fields have no max limit (try entering 50 — it should be accepted)
- Section heading reads "Macro-shape Construction" (not "Calculation Mode")
- Section heading reads "Load surfaces as IGES Files" (not "Add Files")
- No Export button in LatticeMenu
- Export Lattice still works from the Toolbar

- [ ] **Step 5: Commit**

```bash
git add react_frontend/src/components/ui/LatticeMenu.tsx react_frontend/src/pages/ToolPage.tsx
git commit -m "feat: LatticeMenu — always open, remove tile section and export, rename sections, remove tile count max"
```

---

### Task 7: Apply tooltips to all target elements

**Files:**
- Modify: `react_frontend/src/components/ui/LatticeMenu.tsx`
- Modify: `react_frontend/src/components/ui/TileMenu.tsx`
- Modify: `react_frontend/src/components/ui/Toolbar.tsx`

**Interfaces:**
- Consumes: `Tooltip` from `'./Tooltip'`
- Produces: tooltip text on all specified elements

- [ ] **Step 1: Add tooltips to `LatticeMenu.tsx`**

Add the import at the top:
```tsx
import { Tooltip } from './Tooltip'
```

Then wrap each target as follows. All changes are in the JSX return:

**LatticeMenu title** — wrap the header span:
```tsx
<div style={headerStyle}>
  <Tooltip content="The lattice maker's main widget">
    <span style={headerTitleStyle}>Lattice Maker</span>
  </Tooltip>
</div>
```

**Tiles Counts section label** — wrap the label:
```tsx
<Tooltip content="Number of tiles to place along the two (XY) axes of the parametric domain of the input surfaces and Z (out of the two surfaces). Must be a number between 1 and 10, in each axis.">
  <span style={sectionLabelStyle}>Tiles Counts</span>
</Tooltip>
```

**Macro-shape Construction dropdown** — wrap the label (and optionally the Dropdown too — wrapping just the label is sufficient):
```tsx
<Tooltip content={"Three types of volumetric macro-shape volumetric (trivariate) construction are supported:\n1. Extrusion – the input IGES surface is extruded in +Z by a desired extrusion length.\n2. Revolution – the input IGES surface is revolved around the +Z axis.\n3. Ruling – the two input IGES surfaces are ruled in between.\nEach IGES file should contain either a single tensor-product Bezier surface or a single tensor-product B-spline surface, with no interior knots. UV/degrees could be anything."}>
  <span style={sectionLabelStyle}>Macro-shape Construction</span>
</Tooltip>
```

**Load surfaces as IGES Files** — wrap the section label inside the clickable div:
```tsx
<Tooltip content="The Extrusion and Revolution constructors of the macro-shape require that one IGES file surface be specified here. The Ruling constructor requires two IGES file surfaces. Each IGES file should contain either a single tensor-product Bezier surface or a single tensor-product B-spline surface with no interior knots. U/V degrees could be anything.">
  <span style={sectionLabelStyle}>Load surfaces as IGES Files</span>
</Tooltip>
```

**Grading sliders** — wrap the Grading Start and Grading End `<Slider>` components as a group, or wrap the section container. Simplest: wrap both sliders with a single Tooltip at the section level. Inside `useAdvancedFeatures && (...)`, add a wrapper:
```tsx
<Tooltip content="A linear grading control over the thickness of the arm in the tiles, along the third, Z, direction. Values between zero and one.">
  <div>
    <Slider label="Grading Start" ... />
    <Slider label="Grading End" ... />
  </div>
</Tooltip>
```

**Mesh Color** — wrap the label:
```tsx
<Tooltip content="The colors of the foreground objects (tiles, lattice, etc.) in the graphics display.">
  <span>Mesh Color:</span>
</Tooltip>
```

**Background Color** — wrap the label:
```tsx
<Tooltip content="The background color of the graphics display.">
  <span>Background Color:</span>
</Tooltip>
```

- [ ] **Step 2: Add tooltips to `TileMenu.tsx`**

Add import:
```tsx
import { Tooltip } from './Tooltip'
```

**TileMenu panel title**:
```tsx
<div style={headerStyle}>
  <Tooltip content="Tile selection. Three types of tiles are supported here – a 6-arms 3D cross tile, an 8-arms diagonal tile, and a tile with 14 arms, cross and diagonal. The parameters of the arms and core sizes could be set below.">
    <span style={headerTitleStyle}>Lattice Tile</span>
  </Tooltip>
</div>
```

**Tile type cards section label**:
```tsx
<Tooltip content="The three tile types to select from.">
  <span style={sectionLabelStyle}>Tile Type</span>
</Tooltip>
```

**Tile param sliders** — wrap the section containing the dynamic sliders:
```tsx
<div style={sectionStyle}>
  <Tooltip content="Tile-specific parameters, controlling arm thicknesses, etc.">
    <span style={sectionLabelStyle}>Parameters</span>
  </Tooltip>
  {defs.map((def, i: number) => { ... })}
</div>
```
(Add a "Parameters" label above the sliders if there isn't one already — currently there is no label for that section in TileMenu. Add a `<span style={sectionLabelStyle}>Parameters</span>` as the new first child of the slider section, wrapped in Tooltip.)

- [ ] **Step 3: Add tooltip to `Toolbar.tsx`**

Add import:
```tsx
import { Tooltip } from './Tooltip'
```

**Camera mode toggle** — wrap the button:
```tsx
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
```

- [ ] **Step 4: TypeScript check**

```bash
cd react_frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Manual verify**

Start dev server. Hover over each of the following and confirm the tooltip appears above, centered, with correct text:
- "Lattice Maker" title in left panel
- "Tiles Counts" label
- "Macro-shape Construction" label
- "Load surfaces as IGES Files" label
- "Grading Start" / "Grading End" sliders area (in Advanced Features)
- "Mesh Color" label (in Advanced Features)
- "Background Color" label (in Advanced Features)
- "Lattice Tile" title in right panel
- "Tile Type" label in right panel
- "Parameters" label in right panel
- Camera toggle button in toolbar

Also confirm tooltips are not clipped by panel `overflow: hidden` (they should float above all other elements).

- [ ] **Step 6: Commit**

```bash
git add react_frontend/src/components/ui/LatticeMenu.tsx react_frontend/src/components/ui/TileMenu.tsx react_frontend/src/components/ui/Toolbar.tsx
git commit -m "feat: apply Tooltip to all specified UI elements"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|-----------------|------|
| New branch | Task 1 |
| Page title "Lattice Maker" | Task 1 |
| LatticeMenu always open | Tasks 4 (wait — Task 4 is TileMenu) / Task 6 |
| TileMenu always open, no close button | Task 4 |
| Remove "Lattice Tile" tile preview section from LatticeMenu | Task 6 |
| Remove tile count upper limit | Task 6 |
| Remove × clear button from ViewerScene | Task 3 |
| Remove Add Files button from Toolbar | Task 5 |
| Export Lattice button in Toolbar left of Make Lattice | Task 5 |
| Export Lattice disabled without result | Task 5 |
| Rename "Calculation Mode" → "Macro-shape Construction" | Task 6 |
| Rename "Add Files" → "Load surfaces as IGES Files" | Task 6 |
| Rename "Export" → "Export Lattice" | Task 5 |
| Rename "Calculate" → "Make Lattice" | Task 5 |
| Custom Tooltip component | Task 2 |
| Tooltips on all 11 specified targets | Task 7 |

All spec items covered. No placeholders or TBDs remain.
