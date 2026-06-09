# Ruling Calculation Mode — Design Spec

**Date:** 2026-05-23  
**Branch:** feature/visual  
**Scope:** React frontend only (`react_frontend/`). Backend integration is deferred.

---

## Overview

Add "Ruling" as a third calculation mode alongside Extrusion and Revolution. Ruling requires two 3D surface files as input. When selected, the main viewer splits into two equal panels — one per file — so both can be previewed before calculation. After a successful calculation the viewer reverts to a single panel showing the result.

---

## 1. Type Changes (`src/api/types.ts`)

Add a `CalcMode` export:

```ts
export type CalcMode = 'extrusion' | 'revolution' | 'ruling';
```

`ToolPage` currently uses an inline union for `calcMode` state. Switch it to `CalcMode`. `CalculatePayload` is unchanged for now — backend integration will extend it later.

---

## 2. New Component: `DualViewerLayout` (`src/components/DualViewerLayout.tsx`)

Renders two `ViewerScene` instances in a 50/50 flex row with a small gap.

**Props:**
```ts
interface DualViewerLayoutProps {
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
```

**Behaviour:**
- Each `ViewerScene` receives only its own `uploadedFile`. Neither panel ever receives `resultStlGzB64` — tile and result STLs are never shown in the split view.
- Each panel accepts drag-and-drop independently via `ViewerScene`'s existing `onFileDrop` prop. Dropping onto a panel always replaces that panel's file regardless of whether it was empty.
- No label chips on the panels. The empty placeholder inside each `ViewerScene` reads: `"Drop a file here or use the + button"`.
- `cameraMode`, `zoom`, and `onZoomChange` are forwarded to both panels identically (shared camera settings).

---

## 3. `Toolbar` Changes (`src/components/ui/Toolbar.tsx`)

**New prop:** `calcMode: CalcMode`

**`onFileAdd` → `onFilesAdd`:** The callback signature changes from `(file: File) => void` to `(files: File[]) => void`. The array always contains 1 item in non-ruling modes, and 1 or 2 items in ruling mode.

**File input:**
- When `calcMode === 'ruling'`: the hidden `<input type="file">` has `multiple` set. The `onChange` handler reads `Array.from(e.target.files).slice(0, 2)` and calls `onFilesAdd` with up to 2 files.
- Otherwise: no `multiple` attribute; the handler calls `onFilesAdd([files[0]])` as before.

The `+` button's visual appearance is unchanged across all modes.

---

## 4. `LatticeMenu` Changes (`src/components/ui/LatticeMenu.tsx`)

**`CALC_MODE_OPTIONS`** extended:
```ts
const CALC_MODE_OPTIONS = [
  { value: 'extrusion',  label: 'Extrusion' },
  { value: 'revolution', label: 'Revolution' },
  { value: 'ruling',     label: 'Ruling' },
]
```

**Prop types updated:**
- `calculationMode: CalcMode` (was `'extrusion' | 'revolution'`)
- `onCalculationModeChange: (mode: CalcMode) => void`

No other visual change to the menu. Tile preview, sliders, num-tiles inputs, and export button all remain visible and functional in ruling mode.

---

## 5. `ToolPage` State & Logic (`src/pages/ToolPage.tsx`)

### New state / refs

```ts
const [uploadedFile2, setUploadedFile2] = React.useState<File | null>(null)
const calcModeRef = React.useRef<CalcMode>(calcMode)   // kept in sync via useEffect
const pendingResultIsLattice = React.useRef<boolean>(false)
```

`uploadedFile` is renamed conceptually to "Surface 1" in ruling mode (no rename in code — the variable stays `uploadedFile` to minimise diff).

### Mode switching logic

Runs inside `onCalculationModeChange` before calling `setCalcMode`:

| Transition | `uploadedFile` (Surface 1) | `uploadedFile2` (Surface 2) | `resultGzB64` |
|---|---|---|---|
| Non-ruling → non-ruling | Unchanged | — | Unchanged |
| Non-ruling → ruling | Kept | Set to `null` | Cleared |
| Ruling → non-ruling | Kept | Set to `null` | Cleared |

### File upload logic

**Handler signature:** `handleFilesAdd(files: File[])`

In ruling mode:
- 2 files → `setUploadedFile(files[0])`, `setUploadedFile2(files[1])`, clear result
- 1 file → fill next empty slot:
  - If `uploadedFile === null` → set Surface 1
  - Else if `uploadedFile2 === null` → set Surface 2
  - Else → replace Surface 1 (cycle back to start)
- Drag-drop on panel 1 → always sets `uploadedFile`
- Drag-drop on panel 2 → always sets `uploadedFile2`

In non-ruling modes:
- 1 file → `setUploadedFile(files[0])`, clear result (existing behaviour)

### Calculate validation (ruling mode)

```
both missing  → errorMsg = "Please upload both surface files"
file1 missing → errorMsg = "Please upload Surface 1"
file2 missing → errorMsg = "Please upload Surface 2"
both present  → proceed (sends uploadedFile payload only — backend integration TBD)
```

### Tile suppression in main viewer

`pendingResultIsLattice.current` is set to `true` inside `handleCalculate` and remains `false` for all `calculateTile` calls.

In the `onResult` handler:

```ts
if (payload.kind === 'stl') {
  const isLattice = pendingResultIsLattice.current
  pendingResultIsLattice.current = false

  // Only update the main viewer if this is a full lattice result,
  // OR if we are not in ruling mode (tile previews are shown in non-ruling modes).
  if (isLattice || calcModeRef.current !== 'ruling') {
    setResultGzB64(payload.stl_gz_b64)
    if (pendingResetKey.current !== null) {
      setViewerResetKey(pendingResetKey.current)
      pendingResetKey.current = null
    }
  }
  setTilePreviewGzB64(payload.stl_gz_b64)
}
```

### Render switching

```tsx
{calcMode === 'ruling' && !resultGzB64
  ? <DualViewerLayout
      file1={uploadedFile}
      file2={uploadedFile2}
      onFile1Drop={f => { setUploadedFile(f); setResultGzB64(null) }}
      onFile2Drop={f => { setUploadedFile2(f); setResultGzB64(null) }}
      cameraMode={cameraMode}
      zoom={zoom}
      onZoomChange={setZoom}
    />
  : <ViewerScene
      uploadedFile={uploadedFile}
      resultStlGzB64={resultGzB64}
      cameraMode={cameraMode}
      zoom={zoom}
      cameraResetKey={viewerResetKey}
      onZoomChange={setZoom}
      onFileDrop={f => handleFilesAdd([f])}
    />
}
```

After calculation completes (`resultGzB64` is set), the condition switches to the single viewer showing the result — even when `calcMode === 'ruling'`.

---

## 6. Error Handling

The existing dismissible error banner in `ToolPage` is reused unchanged. New error strings for ruling mode are listed in §5 above. No new UI component.

---

## 7. Out of Scope (Deferred)

- `main.py` / `do_Ruling` — still reads hardcoded `Input\RuledSrf1.igs` / `Input\RuledSrf2.igs`
- `CalculatePayload` — no second-file field added yet
- `socketClient.ts` / `httpClient.ts` — no changes
- `nt1`/`nt2`/`nt3`/`g1`/`g2` forwarding to ruling DLL call

---

## 8. Files Changed

| File | Change |
|---|---|
| `src/api/types.ts` | Add `CalcMode` export |
| `src/components/DualViewerLayout.tsx` | **New** |
| `src/components/ui/Toolbar.tsx` | Add `calcMode` prop; `onFilesAdd`; conditional `multiple` |
| `src/components/ui/LatticeMenu.tsx` | Add Ruling option; widen prop types |
| `src/pages/ToolPage.tsx` | New state/refs; mode switching; file upload logic; result handler; render switching |
