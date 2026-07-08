# Small UI Fixes — Design Spec
_Date: 2026-07-07_

## Overview

Six targeted changes requested by the project supervisor after a review meeting:

1. Cap pel counts (X / Y / Z) at 10
2. Widen grading range to 0.1 – 2.5
3. Swap Make Lattice / Export Lattice button order
4. Calculation mode change clears all uploaded files
5. Drag-and-drop hint bar shown when displaying the tile
6. Bug fix: deleting a file in extrusion mode no longer leaves the mesh visible

---

## 1 — Pel counts capped at 10

**File:** `react_frontend/src/components/ui/LatticeMenu.tsx` lines 107–109

Add `max={10}` to all three `NumberInput` components (X, Y, Z):

```tsx
<NumberInput label="X" value={nt1} min={1} max={10} onChange={onNt1Change} aria-label="X tiles" />
<NumberInput label="Y" value={nt2} min={1} max={10} onChange={onNt2Change} aria-label="Y tiles" />
<NumberInput label="Z" value={nt3} min={1} max={10} onChange={onNt3Change} aria-label="Z tiles" />
```

`NumberInput` already clamps on blur and disables the up-arrow chevron at max — no other changes needed. The tooltip text already says "between 1 and 10" so it stays accurate.

---

## 2 — Grading range 0.1 – 2.5

**File:** `react_frontend/src/components/ui/LatticeMenu.tsx` lines 208–229

Change both Grading Start and Grading End sliders:
- `min={0}` → `min={0.1}`
- `max={1}` → `max={2.5}`
- `step` stays `0.01`

`DEFAULT_G1 = 1` and `DEFAULT_G2 = 1` (in `parameters.ts`) are within the new range — no change needed there.

---

## 3 — Button order swap

**File:** `react_frontend/src/components/ui/Toolbar.tsx` lines 55–78

Swap the Export Lattice and Make Lattice blocks inside the pill. New order:

```
Camera toggle  |  Make Lattice  |  Export Lattice
```

Make Lattice is the primary action; Export only becomes active after a result exists, so it belongs on the right.

---

## 4 — Calculation mode change clears all uploaded files

**File:** `react_frontend/src/pages/ToolPage.tsx` — `handleCalcModeChange` (lines 334–342)

Currently only clears file 2 and the macro shape. Extend to also clear file 1, the calculation result, and the download token:

```ts
const handleCalcModeChange = React.useCallback((mode: CalcMode) => {
  pendingMacroCountRef.current = 0
  setErrorMsg(null)
  // file 1
  setUploadedFile(null)
  setUploadedIgsB64(null)
  setOriginalIgsFile(null)
  // file 2
  setUploadedFile2(null)
  setUploadedIgsB64_2(null)
  setOriginalIgsFile2(null)
  // result + macro shape
  setResultGzB64(null)
  setDownloadToken(null)
  setMacroShapeGzB64(null)
  setCalcMode(mode)
}, [])
```

After this runs: all layers are empty → viewer shows the existing empty-state placeholder ("Drop a .igs file here") — the "Option B" empty canvas the user confirmed.

---

## 5 — Drag-and-drop hint bar when tile is displaying

### When to show

The hint is shown when:
- No surface file is uploaded (`!uploadedFile`)
- No calculation result exists (`!downloadToken`)
- The viewer has content (tile is rendering — `layers.length > 0`)

The hint disappears once a file is uploaded or a calculation completes.

### ToolPage changes

**File:** `react_frontend/src/pages/ToolPage.tsx`

Compute and pass a new prop to `ViewerScene`:

```tsx
const showDropHint = !uploadedFile && !downloadToken

<ViewerScene
  ...
  showDropHint={showDropHint}
/>
```

### ViewerScene changes

**File:** `react_frontend/src/components/ViewerScene.tsx`

Add `showDropHint?: boolean` to `ViewerSceneProps`. Render a full-width bar anchored to the top of the container when `showDropHint && layers.length > 0`:

```tsx
{showDropHint && !isEmpty && (
  <div style={dropHintBarStyle}>
    <UploadCloudIcon />   {/* reuse existing icon, smaller size */}
    <span style={placeholderTextStyle}>Drop .igs file here to load a surface</span>
  </div>
)}
```

**Style spec for `dropHintBarStyle`:**
```ts
{
  position: 'absolute',
  top: 0, left: 0, right: 0,
  height: 30,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  backgroundColor: 'rgba(255, 255, 255, 0.72)',
  backdropFilter: 'blur(4px)',
  zIndex: 2,
  pointerEvents: 'none',
}
```

`pointerEvents: none` ensures the bar does not block OrbitControls or drag events on the canvas below.

---

## 6 — Bug fix: extrusion delete leaves mesh visible

### Root cause

The server emits **two** `model_stl` result events per `calculate` call. The macro-shape preview effects increment `pendingMacroCountRef.current` by **1**, so only one event is absorbed as a macro response. The second event has `pendingMacroCountRef.current === 0` and falls into the "real calculation result" branch, setting `resultGzB64` to the macro shape data.

When the user then deletes the file, `handleClear1` clears `uploadedBlobUrl` and `macroShapeGzB64` but does **not** clear `resultGzB64`, so the macro shape persists in the viewer via `resultBlobUrl`.

### Fix

**Part A — counter fix** (`ToolPage.tsx`)

In both macro-shape `socket.calculate` calls, change `+= 1` → `+= 2`:

```ts
// Main macro shape effect (~line 244)
pendingMacroCountRef.current += 2

// Extrusion-only debounced effect (~line 270)
pendingMacroCountRef.current += 2
```

This ensures both server responses are absorbed as macro-shape events; neither leaks into the real-result branch.

**Part B — defensive clear in `handleClear1`** (`ToolPage.tsx` ~line 405)

```ts
const handleClear1 = React.useCallback(() => {
  pendingMacroCountRef.current = 0
  setUploadedFile(null)
  setUploadedIgsB64(null)
  setOriginalIgsFile(null)
  setMacroShapeGzB64(null)
  setResultGzB64(null)       // ← add
  setDownloadToken(null)     // ← add
}, [])
```

The defensive clear means that even if a stale response arrives after a clear, `resultGzB64` is wiped immediately and won't be mis-displayed. This also aligns behaviour with the intent: if you delete the file, there is no result to show.

---

## Files Changed

| File | Change |
|------|--------|
| `react_frontend/src/components/ui/LatticeMenu.tsx` | Add `max={10}` to X/Y/Z NumberInputs; grading min/max |
| `react_frontend/src/components/ui/Toolbar.tsx` | Swap Make Lattice / Export Lattice order |
| `react_frontend/src/pages/ToolPage.tsx` | Mode change clears all; handleClear1 clears result; macro counter += 2; pass showDropHint |
| `react_frontend/src/components/ViewerScene.tsx` | Accept + render drop hint bar |
