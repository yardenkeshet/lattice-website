# Ruling Calculation Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "Ruling" as a third calculation mode that shows a 50/50 split dual-viewer for uploading two surface files, with smart file-slot routing, tile-suppression in the dual view, and mode-switching file-state transitions.

**Architecture:** `CalcMode` type is the shared foundation. A new `DualViewerLayout` component composes two existing `ViewerScene` instances side-by-side. `LatticeMenu` and `Toolbar` get widened props. `ToolPage` gains a second file slot, a mode-switching handler, updated file-upload routing, and a revised result handler that suppresses tile results from the main viewer when in ruling mode.

**Tech Stack:** React 18, TypeScript, React Three Fiber / Three.js (`ViewerScene`), Socket.IO (`LatticeSocketClient`), Vite, Storybook

**Spec:** `docs/superpowers/specs/2026-05-23-ruling-mode-design.md`

---

## File Map

| File | Action | What changes |
|---|---|---|
| `react_frontend/src/api/types.ts` | Modify | Add `CalcMode` export |
| `react_frontend/src/components/DualViewerLayout.tsx` | **Create** | New 50/50 split viewer component |
| `react_frontend/src/components/DualViewerLayout.stories.tsx` | **Create** | Storybook story |
| `react_frontend/src/components/ui/LatticeMenu.tsx` | Modify | Add Ruling option; widen `calculationMode` / `onCalculationModeChange` types |
| `react_frontend/src/components/ui/Toolbar.tsx` | Modify | Add `calcMode` prop; rename `onFileAdd` → `onFilesAdd`; conditional `multiple` on file input |
| `react_frontend/src/components/ui/Toolbar.stories.tsx` | Modify | Update `onFileAdd` → `onFilesAdd` in story |
| `react_frontend/src/pages/ToolPage.tsx` | Modify | New state/refs; mode switching; file upload routing; result handler; render switching |

---

## Task 1: Add `CalcMode` type

**Files:**
- Modify: `react_frontend/src/api/types.ts`

- [ ] **Step 1: Add the type**

Open `react_frontend/src/api/types.ts`. After the `TileType` line, insert:

```ts
export type CalcMode = 'extrusion' | 'revolution' | 'ruling';
```

- [ ] **Step 2: Type-check**

```bash
cd react_frontend
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add react_frontend/src/api/types.ts
git commit -m "feat(types): add CalcMode union type"
```

---

## Task 2: Create `DualViewerLayout` component

**Files:**
- Create: `react_frontend/src/components/DualViewerLayout.tsx`
- Create: `react_frontend/src/components/DualViewerLayout.stories.tsx`

This component renders two `ViewerScene` instances in a flex row. Neither panel receives `resultStlGzB64` — the dual view is for input previews only.

- [ ] **Step 1: Write the story file first (establishes the interface)**

Create `react_frontend/src/components/DualViewerLayout.stories.tsx`:

```tsx
import * as React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { DualViewerLayout } from './DualViewerLayout'

const meta: Meta<typeof DualViewerLayout> = {
  title: 'Components/DualViewerLayout',
  component: DualViewerLayout,
  parameters: { layout: 'fullscreen' },
}
export default meta
type Story = StoryObj<typeof DualViewerLayout>

export const BothEmpty: Story = {
  args: {
    file1: null,
    file2: null,
    onFile1Drop: (f) => console.log('file1 dropped', f.name),
    onFile2Drop: (f) => console.log('file2 dropped', f.name),
    cameraMode: 'perspective',
    zoom: 100,
    onZoomChange: (z) => console.log('zoom', z),
  },
  decorators: [
    (Story) => (
      <div style={{ height: '500px' }}>
        <Story />
      </div>
    ),
  ],
}
```

- [ ] **Step 2: Verify the type error (component does not exist yet)**

```bash
cd react_frontend
npx tsc --noEmit
```

Expected: error — `Cannot find module './DualViewerLayout'`. This confirms the story references a not-yet-created module.

- [ ] **Step 3: Implement `DualViewerLayout`**

Create `react_frontend/src/components/DualViewerLayout.tsx`:

```tsx
import * as React from 'react'
import { ViewerScene } from './ViewerScene'

export interface DualViewerLayoutProps {
  file1: File | null
  file2: File | null
  onFile1Drop: (file: File) => void
  onFile2Drop: (file: File) => void
  cameraMode: 'perspective' | 'orthographic'
  zoom: number
  onZoomChange: (zoom: number) => void
  className?: string
  style?: React.CSSProperties
}

export function DualViewerLayout({
  file1,
  file2,
  onFile1Drop,
  onFile2Drop,
  cameraMode,
  zoom,
  onZoomChange,
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
          zoom={zoom}
          onZoomChange={onZoomChange}
          onFileDrop={onFile1Drop}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
      <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
        <ViewerScene
          uploadedFile={file2}
          cameraMode={cameraMode}
          zoom={zoom}
          onZoomChange={onZoomChange}
          onFileDrop={onFile2Drop}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Type-check**

```bash
cd react_frontend
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Verify in Storybook**

```bash
cd react_frontend
npm run storybook
```

Open http://localhost:6006 → `Components/DualViewerLayout → BothEmpty`.

Expected: Two equal-width panels side by side, each showing the upload cloud icon and the "Drop a .stl / .obj / .3mf file here, or use the + button above" placeholder. Try dragging a file onto each panel and confirm only that panel's console log fires.

- [ ] **Step 6: Commit**

```bash
git add react_frontend/src/components/DualViewerLayout.tsx \
        react_frontend/src/components/DualViewerLayout.stories.tsx
git commit -m "feat(viewer): add DualViewerLayout component for ruling mode"
```

---

## Task 3: Update `LatticeMenu` — add Ruling option

**Files:**
- Modify: `react_frontend/src/components/ui/LatticeMenu.tsx`

- [ ] **Step 1: Import `CalcMode` and update the props interface**

In `react_frontend/src/components/ui/LatticeMenu.tsx`, change the existing `TileType` import line:

```ts
// Before:
import type { TileType } from '../../api/types'

// After:
import type { TileType, CalcMode } from '../../api/types'
```

In the `LatticeMenuProps` interface, find and replace the two affected lines:

```ts
// Before:
calculationMode: 'extrusion' | 'revolution'
// ...
onCalculationModeChange: (mode: 'extrusion' | 'revolution') => void

// After:
calculationMode: CalcMode
// ...
onCalculationModeChange: (mode: CalcMode) => void
```

- [ ] **Step 2: Add Ruling to `CALC_MODE_OPTIONS`**

Find the `CALC_MODE_OPTIONS` constant and replace it:

```ts
const CALC_MODE_OPTIONS = [
  { value: 'extrusion',  label: 'Extrusion' },
  { value: 'revolution', label: 'Revolution' },
  { value: 'ruling',     label: 'Ruling' },
]
```

- [ ] **Step 3: Fix the Dropdown `onChange` cast**

Inside the component's JSX, find the Dropdown's `onChange` prop and update the cast:

```tsx
// Before:
onChange={v => onCalculationModeChange(v as 'extrusion' | 'revolution')}

// After:
onChange={v => onCalculationModeChange(v as CalcMode)}
```

- [ ] **Step 4: Type-check**

```bash
cd react_frontend
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Verify in Storybook**

Open http://localhost:6006 → `UI/LatticeMenu`. Open the Calculation Mode dropdown.

Expected: Three options — Extrusion, Revolution, Ruling.

- [ ] **Step 6: Commit**

```bash
git add react_frontend/src/components/ui/LatticeMenu.tsx
git commit -m "feat(lattice-menu): add Ruling to calculation mode dropdown"
```

---

## Task 4: Update `Toolbar` — multi-file support

**Files:**
- Modify: `react_frontend/src/components/ui/Toolbar.tsx`
- Modify: `react_frontend/src/components/ui/Toolbar.stories.tsx`

The `onFileAdd` prop is renamed to `onFilesAdd` and receives an array. In ruling mode, the hidden file input gets the `multiple` attribute so the OS picker allows choosing up to 2 files.

- [ ] **Step 1: Import `CalcMode` and update `ToolbarProps`**

In `react_frontend/src/components/ui/Toolbar.tsx`, add the import:

```ts
import type { CalcMode } from '../../api/types'
```

In `ToolbarProps`, replace `onFileAdd` with:

```ts
/** Present only when in ruling mode — controls multi-file picker and routing. */
calcMode?: CalcMode
/** Called when user picks file(s) via the Add button. 1 item normally, up to 2 in ruling mode. */
onFilesAdd?: (files: File[]) => void
```

Remove the old `onFileAdd?: (file: File) => void` line entirely.

- [ ] **Step 2: Update the destructured props in the `forwardRef` callback**

In the `React.forwardRef` call, replace `onFileAdd` in the destructuring with:

```ts
calcMode,
onFilesAdd,
```

- [ ] **Step 3: Replace `handleFileChange` and the hidden input**

Delete the existing `handleFileChange` function and the existing `<input>` element. Add these in their place:

```tsx
const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const all = Array.from(e.target.files ?? [])
  if (all.length === 0) return
  const limited = calcMode === 'ruling' ? all.slice(0, 2) : [all[0]]
  onFilesAdd?.(limited)
  e.target.value = ''  // reset so the same file can be re-selected
}
```

```tsx
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
```

- [ ] **Step 4: Update `Toolbar.stories.tsx`**

In `react_frontend/src/components/ui/Toolbar.stories.tsx`, find the `Default` story and replace `onFileAdd` with `onFilesAdd`:

```tsx
// Before:
onFileAdd={f => alert(`File selected: ${f.name}`)}

// After:
onFilesAdd={files => alert(`Files selected: ${files.map(f => f.name).join(', ')}`)}
```

- [ ] **Step 5: Type-check**

```bash
cd react_frontend
npx tsc --noEmit
```

Expected: one error in `ToolPage.tsx` — `onFileAdd` does not exist on `ToolbarProps`. That is correct and will be fixed in Task 5.

- [ ] **Step 6: Commit**

```bash
git add react_frontend/src/components/ui/Toolbar.tsx \
        react_frontend/src/components/ui/Toolbar.stories.tsx
git commit -m "feat(toolbar): rename onFileAdd to onFilesAdd; add calcMode for multi-file support"
```

---

## Task 5: Wire up `ToolPage`

**Files:**
- Modify: `react_frontend/src/pages/ToolPage.tsx`

This task connects all the new pieces. Work through the steps in order — the file will not type-check until all steps are complete.

- [ ] **Step 1: Update imports**

At the top of `react_frontend/src/pages/ToolPage.tsx`, update the two existing import lines:

```ts
// Add CalcMode to the types import:
import type { TileType, CalcMode } from '../api/types'

// Add DualViewerLayout:
import { DualViewerLayout } from '../components/DualViewerLayout'
```

- [ ] **Step 2: Change `calcMode` state type**

Find the existing `calcMode` state declaration and change the type annotation:

```ts
// Before:
const [calcMode, setCalcMode] = React.useState<'extrusion' | 'revolution'>('extrusion')

// After:
const [calcMode, setCalcMode] = React.useState<CalcMode>('extrusion')
```

- [ ] **Step 3: Add new state and refs**

After the existing state block (after `const [errorMsg, setErrorMsg]`), add:

```ts
/* ── Second file slot for ruling mode ── */
const [uploadedFile2, setUploadedFile2] = React.useState<File | null>(null)

/* Ref so socket callbacks always see the current calcMode without a stale closure */
const calcModeRef = React.useRef<CalcMode>(calcMode)
React.useEffect(() => { calcModeRef.current = calcMode }, [calcMode])

/* True while a full lattice `calculate` result is in-flight; false for tile results */
const pendingResultIsLattice = React.useRef<boolean>(false)
```

- [ ] **Step 4: Add the mode-switching handler**

Add a new handler function after the existing `handleTileTypeChange`:

```ts
const handleCalcModeChange = (mode: CalcMode) => {
  // Clear result and second file on every transition; keep uploadedFile (Surface 1) always
  setResultGzB64(null)
  setDownloadToken(null)
  setErrorMsg(null)
  setUploadedFile2(null)
  setCalcMode(mode)
}
```

- [ ] **Step 5: Replace `handleFileAdd` with `handleFilesAdd`**

Delete the existing `handleFileAdd` function entirely and add:

```ts
const handleFilesAdd = async (files: File[]) => {
  setResultGzB64(null)
  setDownloadToken(null)
  setErrorMsg(null)

  if (calcMode === 'ruling') {
    if (files.length >= 2) {
      // Two files chosen: replace both slots immediately
      setViewerResetKey('file-' + Date.now())
      setUploadedFile(files[0])
      setUploadedFile2(files[1])
      try { setUploadedB64(await readFileAsB64(files[0])) }
      catch { setErrorMsg('Failed to read file') }
    } else {
      // One file: smart-fill next empty slot
      const file = files[0]
      if (!uploadedFile) {
        setViewerResetKey('file-' + Date.now())
        setUploadedFile(file)
        try { setUploadedB64(await readFileAsB64(file)) }
        catch { setErrorMsg('Failed to read file') }
      } else if (!uploadedFile2) {
        setUploadedFile2(file)
      } else {
        // Both full — cycle back and replace Surface 1
        setViewerResetKey('file-' + Date.now())
        setUploadedFile(file)
        try { setUploadedB64(await readFileAsB64(file)) }
        catch { setErrorMsg('Failed to read file') }
      }
    }
  } else {
    // Non-ruling: single file, same as original handleFileAdd
    const file = files[0]
    setViewerResetKey('file-' + Date.now())
    setUploadedFile(file)
    try { setUploadedB64(await readFileAsB64(file)) }
    catch { setErrorMsg('Failed to read file') }
  }
}
```

- [ ] **Step 6: Replace `handleCalculate` — ruling validation + `pendingResultIsLattice`**

Delete the existing `handleCalculate` and add:

```ts
const handleCalculate = () => {
  if (calcMode === 'ruling') {
    if (!uploadedFile && !uploadedFile2) {
      setErrorMsg('Please upload both surface files')
      return
    }
    if (!uploadedFile) {
      setErrorMsg('Please upload Surface 1')
      return
    }
    if (!uploadedFile2) {
      setErrorMsg('Please upload Surface 2')
      return
    }
  } else {
    if (!uploadedFile || !uploadedB64) {
      setErrorMsg('Please upload a 3D file first')
      return
    }
  }
  pendingResultIsLattice.current = true
  pendingResetKey.current = 'calc-' + Date.now()
  setIsCalculating(true)
  setResultGzB64(null)
  setDownloadToken(null)
  setErrorMsg(null)
  socket.calculate({
    filename: uploadedFile!.name,
    stl_text_b64: uploadedB64!,
    client_ts: performance.now(),
    args: { tileType, nt1, nt2, nt3, g1, g2 },
  })
}
```

- [ ] **Step 7: Update the socket result handler — tile suppression**

Find the `useEffect` that sets up `unsubResult` and `unsubError`. Replace the entire callback body passed to `socket.onResult(...)` with:

```ts
const unsubResult = socket.onResult(payload => {
  if (payload.kind === 'stl') {
    setIsCalculating(false)
    const isLattice = pendingResultIsLattice.current
    pendingResultIsLattice.current = false

    // Always update the tile mini-preview (LatticeMenu + TileMenu)
    setTilePreviewGzB64(payload.stl_gz_b64)

    // Only push into the main viewer if this is a full lattice result,
    // OR we are not in ruling mode (tiles are shown in the main viewer in non-ruling modes)
    if (isLattice || calcModeRef.current !== 'ruling') {
      setResultGzB64(payload.stl_gz_b64)
      if (pendingResetKey.current !== null) {
        setViewerResetKey(pendingResetKey.current)
        pendingResetKey.current = null
      }
    }
  } else {
    setIsCalculating(false)
    setDownloadToken(payload.download_token)
  }
})
```

- [ ] **Step 8: Update the `LatticeMenu` call site**

Find `onCalculationModeChange={setCalcMode}` in the JSX and change it to:

```tsx
onCalculationModeChange={handleCalcModeChange}
```

- [ ] **Step 9: Update the `Toolbar` call site**

Find the `<Toolbar ... />` JSX block and replace the entire element with:

```tsx
<Toolbar
  calcMode={calcMode}
  zoom={zoom}
  cameraMode={cameraMode}
  isCalculating={isCalculating}
  onZoomChange={setZoom}
  onCameraModeChange={setCameraMode}
  onFilesAdd={handleFilesAdd}
  onCalculate={handleCalculate}
/>
```

- [ ] **Step 10: Switch the viewer render to dual/single**

Find the `<div style={viewerStyle}>` block and replace its inner content with:

```tsx
<div style={viewerStyle}>
  {calcMode === 'ruling' && !resultGzB64
    ? (
      <DualViewerLayout
        file1={uploadedFile}
        file2={uploadedFile2}
        onFile1Drop={f => { setUploadedFile(f); setResultGzB64(null) }}
        onFile2Drop={f => { setUploadedFile2(f); setResultGzB64(null) }}
        cameraMode={cameraMode}
        zoom={zoom}
        onZoomChange={setZoom}
        style={{ height: '100%' }}
      />
    )
    : (
      <ViewerScene
        uploadedFile={uploadedFile}
        resultStlGzB64={resultGzB64}
        cameraMode={cameraMode}
        zoom={zoom}
        cameraResetKey={viewerResetKey}
        onZoomChange={setZoom}
        onFileDrop={f => handleFilesAdd([f])}
      />
    )
  }
</div>
```

- [ ] **Step 11: Type-check — everything should be clean**

```bash
cd react_frontend
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 12: Smoke-test in the dev server**

```bash
cd react_frontend
npm run dev
```

Open http://localhost:5173/tool. Verify the following:

1. **Dropdown** — Calculation Mode shows Extrusion / Revolution / Ruling.
2. **Switch to Ruling** — main viewer splits into two equal panels, each with the upload placeholder.
3. **Drag a file onto the left panel** — left panel shows the 3D model; right panel stays empty.
4. **Drag a file onto the right panel** — right panel shows its 3D model independently.
5. **+ button, select 1 file in Ruling mode** — fills the next empty slot (left first, then right, then replaces left when both are full).
6. **+ button, select 2 files in Ruling mode** — both panels update immediately, previous files discarded.
7. **Calculate with one panel empty** — dismissible error banner shows the correct missing-file message.
8. **Switch Ruling → Extrusion** — single viewer appears with the first file; second file is discarded.
9. **Switch Extrusion → Ruling** — left panel shows the previously loaded file; right panel is empty.
10. **Tile type change in ruling mode** — tile mini-preview updates (LatticeMenu + TileMenu) but neither dual-view panel changes.
11. **After a successful Calculate** (run in Extrusion/Revolution mode if backend is live) — result appears in a single viewer, even if calcMode was switched to Ruling before the result arrived.

- [ ] **Step 13: Commit**

```bash
git add react_frontend/src/pages/ToolPage.tsx
git commit -m "feat(tool-page): ruling mode — dual viewer, mode switching, tile suppression"
```

---

## Done

All five tasks deliver a fully working Ruling mode in the frontend. Backend integration (sending two files in `CalculatePayload`, updating `do_Ruling` in `main.py`) is tracked separately in the spec's "Out of Scope" section.
