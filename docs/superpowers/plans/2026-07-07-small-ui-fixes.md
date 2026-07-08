# Small UI Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply six supervisor-requested UI fixes: pel count cap, grading range, button swap, mode-change file clear, drag-and-drop hint bar, and extrusion delete bug fix.

**Architecture:** All changes are confined to four files in `react_frontend/src/`. No new components needed. The drop hint bar is a new JSX block inside the existing `ViewerScene` container div. State-flow changes are in `ToolPage`.

**Tech Stack:** React 19, TypeScript 6, Vite 8, React Three Fiber, Vitest

## Global Constraints

- All changes inside `react_frontend/src/`
- Every change must pass `cd react_frontend && npx tsc -b --noEmit` with zero errors
- Do not add new npm dependencies
- Do not change any Socket.IO event names or backend API contract

---

## Files Changed

| File | What changes |
|------|-------------|
| `react_frontend/src/components/ui/LatticeMenu.tsx` | `max={10}` on X/Y/Z `NumberInput`; grading slider `min`/`max` |
| `react_frontend/src/components/ui/Toolbar.tsx` | Swap Make Lattice / Export Lattice order |
| `react_frontend/src/pages/ToolPage.tsx` | Extend `handleCalcModeChange`; fix `handleClear1`; fix macro counter; compute + pass `showDropHint` |
| `react_frontend/src/components/ViewerScene.tsx` | Accept `showDropHint` prop; render top-bar hint; resize `UploadCloudIcon` |

---

### Task 1: Cap pel counts at 10 and widen grading range to 0.1–2.5

**Files:**
- Modify: `react_frontend/src/components/ui/LatticeMenu.tsx:107-109` (NumberInputs)
- Modify: `react_frontend/src/components/ui/LatticeMenu.tsx:208-229` (Sliders)

**Interfaces:**
- Consumes: `NumberInput` props `min`, `max`; `Slider` props `min`, `max` — both already support these
- Produces: nothing downstream depends on this task

- [ ] **Step 1: Add `max={10}` to the three tile count NumberInputs**

In `LatticeMenu.tsx` around lines 107–109, replace the three `NumberInput` lines:

```tsx
<NumberInput label="X" value={nt1} min={1} max={10} onChange={onNt1Change} aria-label="X tiles" />
<NumberInput label="Y" value={nt2} min={1} max={10} onChange={onNt2Change} aria-label="Y tiles" />
<NumberInput label="Z" value={nt3} min={1} max={10} onChange={onNt3Change} aria-label="Z tiles" />
```

`NumberInput` already clamps on blur and disables the up-chevron at `max` — no other changes needed.

- [ ] **Step 2: Update grading sliders to `min={0.1} max={2.5}`**

In `LatticeMenu.tsx` around lines 208–229, both Grading Start and Grading End `<Slider>` elements currently have `min={0} max={1}`. Change them to:

```tsx
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
```

`DEFAULT_G1 = 1` and `DEFAULT_G2 = 1` in `parameters.ts` are within [0.1, 2.5] — no change needed there.

- [ ] **Step 3: Typecheck**

```bash
cd react_frontend && npx tsc -b --noEmit
```

Expected: zero errors.

- [ ] **Step 4: Verify in browser**

Run `cd react_frontend && npm run dev` and open `http://localhost:5173/tool`.

- Click the up-chevron on X, Y, or Z repeatedly — it should disable at 10. Type `11` and blur — it should snap back to 10.
- Drag Grading Start and Grading End — the track should span from 0.10 to 2.50.

- [ ] **Step 5: Commit**

```bash
git add react_frontend/src/components/ui/LatticeMenu.tsx
git commit -m "feat(lattice-menu): cap pel counts at 10; widen grading range to 0.1-2.5"
```

---

### Task 2: Swap Make Lattice / Export Lattice button order

**Files:**
- Modify: `react_frontend/src/components/ui/Toolbar.tsx:53-79`

**Interfaces:**
- Produces: nothing downstream depends on this task

- [ ] **Step 1: Reorder the buttons inside the pill**

In `Toolbar.tsx`, the pill currently contains: Camera toggle → Export Lattice → Make Lattice.

Replace the content between (and including) the first `<PillDivider />` after the camera button through the closing `</Button>` of Make Lattice with the following — Make Lattice first, Export Lattice second:

```tsx
          <PillDivider />

          {/* Make Lattice button */}
          <Button
            variant="secondary"
            disabled={isCalculating}
            onClick={onCalculate}
          >
            {isCalculating ? calcLabel : 'Make Lattice'}
          </Button>

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
```

- [ ] **Step 2: Typecheck**

```bash
cd react_frontend && npx tsc -b --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Verify in browser**

Open `http://localhost:5173/tool`. The toolbar pill should read left-to-right: **perspective | Make Lattice | Export Lattice**.

- [ ] **Step 4: Commit**

```bash
git add react_frontend/src/components/ui/Toolbar.tsx
git commit -m "feat(toolbar): move Make Lattice before Export Lattice"
```

---

### Task 3: Mode change clears all uploaded files and result

**Files:**
- Modify: `react_frontend/src/pages/ToolPage.tsx:334-342`

**Interfaces:**
- Produces: nothing downstream depends on this task

- [ ] **Step 1: Replace `handleCalcModeChange`**

In `ToolPage.tsx`, replace the existing `handleCalcModeChange` callback (currently clears only file 2 + macro shape) with:

```ts
const handleCalcModeChange = React.useCallback((mode: CalcMode) => {
  pendingMacroCountRef.current = 0
  setErrorMsg(null)
  setUploadedFile(null)
  setUploadedIgsB64(null)
  setOriginalIgsFile(null)
  setUploadedFile2(null)
  setUploadedIgsB64_2(null)
  setOriginalIgsFile2(null)
  setResultGzB64(null)
  setDownloadToken(null)
  setMacroShapeGzB64(null)
  setCalcMode(mode)
}, [])
```

After this runs, all layers are empty → the viewer shows the existing empty-state placeholder ("Drop a .igs file here") automatically.

- [ ] **Step 2: Typecheck**

```bash
cd react_frontend && npx tsc -b --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Verify in browser**

1. Open `/tool`. Upload an `.igs` file — the surface should appear in the viewer.
2. Open the Macro-shape Construction dropdown and switch to any other mode.
3. The viewer should immediately go blank — the "Drop a .igs file here" placeholder appears. The filename in the left panel disappears.
4. Repeat the test starting from a completed calculation (result mesh showing) — switching mode should also clear that.

- [ ] **Step 4: Commit**

```bash
git add react_frontend/src/pages/ToolPage.tsx
git commit -m "feat(tool-page): clear all files and result when calculation mode changes"
```

---

### Task 4: Bug fix — extrusion file delete leaves mesh visible

**Files:**
- Modify: `react_frontend/src/pages/ToolPage.tsx` (two macro effects + `handleClear1`)

**Background:** The server emits **two** `model_stl` result events per `calculate` call. The macro-shape effects increment `pendingMacroCountRef.current` by 1, so only the first response is absorbed as a macro response. The second arrives when the counter is 0 and falls into the "real result" else-branch, setting `resultGzB64` to the macro-shape STL. When the user deletes the file, `handleClear1` does not clear `resultGzB64`, so the macro shape remains visible in the viewer.

- [ ] **Step 1: Increment the counter by 2 in the main macro-shape effect**

Find the effect with dependency array `[uploadedIgsB64, uploadedIgsB64_2, calcMode]` (around line 244). Change:

```ts
    pendingMacroCountRef.current += 1
    socket.calculate({
```

to:

```ts
    pendingMacroCountRef.current += 2
    socket.calculate({
```

- [ ] **Step 2: Increment the counter by 2 in the extrusion debounce effect**

Find the effect with dependency array `[extrudeLength]` (around line 270). Inside the `setTimeout` callback, change:

```ts
      pendingMacroCountRef.current += 1
      socket.calculate({
```

to:

```ts
      pendingMacroCountRef.current += 2
      socket.calculate({
```

- [ ] **Step 3: Add `setResultGzB64(null)` and `setDownloadToken(null)` to `handleClear1`**

Find `handleClear1` (around line 405) and replace it with:

```ts
  const handleClear1 = React.useCallback(() => {
    pendingMacroCountRef.current = 0
    setUploadedFile(null)
    setUploadedIgsB64(null)
    setOriginalIgsFile(null)
    setMacroShapeGzB64(null)
    setResultGzB64(null)
    setDownloadToken(null)
  }, [])
```

- [ ] **Step 4: Typecheck**

```bash
cd react_frontend && npx tsc -b --noEmit
```

Expected: zero errors.

- [ ] **Step 5: Verify the bug is fixed**

1. Switch to **Extrusion** mode. Upload an `.igs` file.
2. Wait until the macro-shape bounding envelope appears in the viewer (semi-transparent overlay).
3. Click × next to the filename in the left panel.
4. The viewer must go completely blank — no surface, no macro shape. The "Drop a .igs file here" placeholder should appear.

- [ ] **Step 6: Regression check on other modes**

Repeat steps 1–4 in **Revolution** mode and **Ruling** mode (upload one file for ruling, verify single-file clear works). Both should also clear cleanly on file delete.

- [ ] **Step 7: Commit**

```bash
git add react_frontend/src/pages/ToolPage.tsx
git commit -m "fix(tool-page): clear result on file delete; fix macro-shape double-response counter"
```

---

### Task 5: Drag-and-drop hint bar when tile is displaying

**Files:**
- Modify: `react_frontend/src/components/ViewerScene.tsx`
- Modify: `react_frontend/src/pages/ToolPage.tsx`

**Interfaces:**
- Produces: `ViewerSceneProps.showDropHint?: boolean` — consumed by `ToolPage` in this same task

**When to show:** `showDropHint` is true when no surface file is loaded (`!uploadedFile`) and no calculation result exists (`!downloadToken`). The bar only renders when `layers.length > 0` (tile is actually showing in the canvas); when `layers` is empty the existing full-canvas empty placeholder already covers the UX.

- [ ] **Step 1: Make `UploadCloudIcon` accept a `size` prop**

In `ViewerScene.tsx`, replace the `UploadCloudIcon` function with a version that accepts an optional `size`:

```tsx
function UploadCloudIcon({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true" style={{ color: 'var(--text-tertiary)' }}>
      <path d="M32 32l-8-8-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M24 24v18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M40.3 36.3A10 10 0 0 0 36 18h-2.5A16 16 0 1 0 8 33.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
```

Existing call sites (`<UploadCloudIcon />` in the placeholder and drag overlay) continue to work unchanged since `size` defaults to 48.

- [ ] **Step 2: Add `showDropHint` to `ViewerSceneProps`**

In the `ViewerSceneProps` interface add one line:

```ts
export interface ViewerSceneProps {
  layers?: MeshLayer[]
  cameraMode?: 'perspective' | 'orthographic'
  zoom?: number
  onFileDrop?: (file: File) => void
  onZoomChange?: (zoom: number) => void
  onAutoFitComplete?: (canvas: HTMLCanvasElement | null) => void
  cameraResetKey?: string
  className?: string
  style?: React.CSSProperties
  meshColor: string
  backgroundColor: string
  showDropHint?: boolean        // ← add this line
}
```

- [ ] **Step 3: Destructure `showDropHint` in `ViewerSceneFn`**

Add `showDropHint = false` to the function parameter destructuring:

```ts
function ViewerSceneFn({
  layers = [],
  cameraMode = 'perspective',
  zoom = 100,
  cameraResetKey,
  onFileDrop,
  onZoomChange,
  onAutoFitComplete,
  className,
  style,
  meshColor,
  backgroundColor,
  showDropHint = false,         // ← add this line
}: ViewerSceneProps) {
```

- [ ] **Step 4: Add the hint bar style constant**

At the bottom of `ViewerScene.tsx`, after `placeholderTextStyle`, add:

```ts
const dropHintBarStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
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

`pointerEvents: none` ensures the bar does not block OrbitControls or the drag-and-drop handler on the canvas below.

- [ ] **Step 5: Render the hint bar in the JSX**

In `ViewerSceneFn`'s return, insert the hint bar block after the `{isDragOver && ...}` block and before `<Canvas ...>`:

```tsx
      {showDropHint && !isEmpty && (
        <div style={dropHintBarStyle}>
          <UploadCloudIcon size={16} />
          <span style={placeholderTextStyle}>Drop .igs file here to load a surface</span>
        </div>
      )}
```

The surrounding context should look like:

```tsx
      {isDragOver && (
        <div style={dragOverlayStyle}>
          <UploadCloudIcon />
          <span style={placeholderTextStyle}>Drop to load</span>
        </div>
      )}

      {showDropHint && !isEmpty && (
        <div style={dropHintBarStyle}>
          <UploadCloudIcon size={16} />
          <span style={placeholderTextStyle}>Drop .igs file here to load a surface</span>
        </div>
      )}

      {/* ── Three.js canvas — remounts when camera mode changes ── */}
      <Canvas
```

- [ ] **Step 6: Compute `showDropHint` and pass it to `ViewerScene` in `ToolPage`**

In `ToolPage.tsx`, after the `fileNames` `useMemo` (around line 497), add:

```ts
  const showDropHint = !uploadedFile && !downloadToken
```

Then add the prop to the `<ViewerScene>` JSX element:

```tsx
            <ViewerScene
              layers={layers}
              cameraMode={cameraMode}
              cameraResetKey={viewerResetKey}
              onFileDrop={handleViewerFileDrop}
              onAutoFitComplete={handleAutoFitComplete}
              meshColor={meshColor}
              backgroundColor={backgroundColor}
              showDropHint={showDropHint}
            />
```

- [ ] **Step 7: Typecheck**

```bash
cd react_frontend && npx tsc -b --noEmit
```

Expected: zero errors.

- [ ] **Step 8: Verify in browser**

1. Open `http://localhost:5173/tool`. The default tile renders in the main viewer. A subtle 30px-tall bar should appear at the very top of the viewer containing a small cloud icon and "Drop .igs file here to load a surface". The tile is still fully visible and OrbitControls still work (drag to orbit).
2. Upload an `.igs` file via the left panel button — the hint bar should disappear immediately once the file is selected.
3. Run a calculation to get a result — hint bar stays gone.
4. Switch calculation modes — viewer goes blank; the full empty placeholder shows (not the bar, since `layers` is empty).
5. Confirm that dragging a file over the canvas still shows the blue dashed border + "Drop to load" overlay correctly on top of the hint bar.

- [ ] **Step 9: Commit**

```bash
git add react_frontend/src/components/ViewerScene.tsx react_frontend/src/pages/ToolPage.tsx
git commit -m "feat(viewer): show drag-and-drop hint bar when tile is displaying"
```

---

## Self-Review

**Spec coverage:**
1. ✅ Pel counts max 10 — Task 1 Step 1
2. ✅ Grading 0.1–2.5 — Task 1 Step 2
3. ✅ Button swap — Task 2
4. ✅ Mode change clears all files + result — Task 3
5. ✅ Drag-and-drop hint bar (Option A top bar) — Task 5
6. ✅ Extrusion delete bug (counter += 2 + handleClear1 clear) — Task 4

**Placeholder scan:** No TBDs, no "similar to Task N", all steps have full code.

**Type consistency:**
- `showDropHint?: boolean` defined in `ViewerSceneProps` (Task 5 Step 2) and consumed in `ToolPage` (Task 5 Step 6) — names match.
- `UploadCloudIcon({ size = 48 })` defined in Step 1; called as `<UploadCloudIcon size={16} />` in Step 5 — matches.
- `pendingMacroCountRef.current += 2` used identically in both Task 4 steps — consistent.
- All set-state function names (`setResultGzB64`, `setDownloadToken`, etc.) match the declarations in `ToolPage.tsx`.
