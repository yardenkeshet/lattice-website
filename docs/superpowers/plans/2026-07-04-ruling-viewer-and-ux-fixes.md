# Ruling Viewer Unification & UX Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix ruling mode to show both surfaces in a single Three.js canvas, add transparent macro-shape preview for all modes, expose extrusion length as a UI control, fix back-face rendering, and add tessellation tolerance to advanced settings.

**Architecture:** `ViewerScene` gains a `layers: MeshLayer[]` prop replacing its current single-mesh props; `ToolPage` assembles layers from uploaded files, a calculation result, and an auto-generated macro shape overlay. Back-face fix and extrusion-length/tolerance wiring are small targeted changes alongside this refactor.

**Tech Stack:** React 18 + TypeScript + Vite, React Three Fiber, Three.js (`THREE.DoubleSide`), Radix UI Slider (`onValueCommit`), Flask-SocketIO (Python 3.13), ctypes DLL wrapper.

## Global Constraints

- Branch: `feature/fix-ruling`
- Backend runs with `.venv/Scripts/python.exe main.py` from repo root — serves on `http://localhost:5003`.
- Frontend dev server: `cd react_frontend && npm run dev` — serves on `http://localhost:5173`.
- TypeScript must compile cleanly (`npm run build` in `react_frontend/`) before every commit.
- No new npm packages — Three.js, React Three Fiber, pako, and Radix UI are already installed.
- Each commit must leave both servers runnable and the UI in a usable state.
- `EXTRUSION`, `REVOLUTION`, `RULING` string constants live in `react_frontend/src/lib/parameters.ts`.

---

## Task 1: Back-face rendering fix

**Files:**
- Modify: `react_frontend/src/components/ViewerScene.tsx` (line ~368)

**Interfaces:**
- Consumes: nothing from other tasks
- Produces: nothing depended on by other tasks (self-contained fix)

- [ ] **Step 1: Add `THREE.DoubleSide` to `STLMesh`'s material**

In `ViewerScene.tsx`, find the `STLMesh` return statement (around line 366–370) and replace:

```tsx
    <mesh ref={meshRef} geometry={geometry} castShadow>
      <meshPhongMaterial color={meshColor} specular={0x111111} shininess={50} />
    </mesh>
```

with:

```tsx
    <mesh ref={meshRef} geometry={geometry} castShadow>
      <meshPhongMaterial color={meshColor} specular={0x111111} shininess={50} side={THREE.DoubleSide} />
    </mesh>
```

`THREE` is already imported at the top of the file (`import * as THREE from 'three'`).

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd react_frontend && npm run build
```

Expected: zero errors.

- [ ] **Step 3: Visual test**

With both servers running, open `http://localhost:5173/tool`, upload an IGS surface, and orbit the camera to view it from the opposite side. The mesh should remain visible from both directions.

- [ ] **Step 4: Commit**

```bash
git add react_frontend/src/components/ViewerScene.tsx
git commit -m "fix(viewer): render surfaces from both sides with DoubleSide material"
```

---

## Task 2: ViewerScene `layers` API + ToolPage wiring

Replaces the current `uploadedFile`/`resultStlGzB64` prop model with a generic `layers: MeshLayer[]` array. Deletes `DualViewerLayout`. `ToolPage` assembles and owns all blob URLs.

**Files:**
- Modify: `react_frontend/src/components/ViewerScene.tsx`
- Delete: `react_frontend/src/components/DualViewerLayout.tsx`
- Modify: `react_frontend/src/pages/ToolPage.tsx`

**Interfaces:**
- Consumes: nothing from other tasks
- Produces:
  - `MeshLayer` type exported from `ViewerScene.tsx`: `{ blobUrl: string; opacity?: number }`
  - `ViewerSceneProps.layers: MeshLayer[]` — consumed by Task 3

- [ ] **Step 1: Add `MeshLayer` type and `layers` prop to `ViewerScene`**

At the top of `ViewerScene.tsx`, after the existing imports, add the exported type:

```tsx
export interface MeshLayer {
  blobUrl: string
  /** Defaults to 1.0 (fully opaque). Values < 1 enable transparency automatically. */
  opacity?: number
}
```

Replace the `ViewerSceneProps` interface — remove `uploadedFile` and `resultStlGzB64`, add `layers`:

```tsx
export interface ViewerSceneProps {
  /** Mesh layers to render. First layer drives auto-fit. */
  layers?: MeshLayer[]
  /** 'perspective' (default) or 'orthographic'. */
  cameraMode?: 'perspective' | 'orthographic'
  /** Zoom level. 100 = default, range 10–500. */
  zoom?: number
  /** Called when user drops a .igs file onto the canvas. */
  onFileDrop?: (file: File) => void
  /** Called when the user scrolls over the viewer to zoom. */
  onZoomChange?: (zoom: number) => void
  /**
   * Called once after the camera finishes auto-fitting to a newly loaded
   * mesh. Receives the underlying canvas DOM element for snapshot capture.
   */
  onAutoFitComplete?: (canvas: HTMLCanvasElement | null) => void
  /**
   * Opaque string controlled by the parent. When this key changes the camera
   * resets to its default position.
   */
  cameraResetKey?: string
  className?: string
  style?: React.CSSProperties
  meshColor: string
  backgroundColor: string
}
```

- [ ] **Step 2: Update `ViewerSceneFn` body**

Replace the function signature destructuring — swap `uploadedFile = null, resultStlGzB64 = null` for `layers = []`:

```tsx
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
  backgroundColor
}: ViewerSceneProps) {
```

Remove these two internal state blocks (they move to ToolPage):

```tsx
// DELETE these two blocks:
const resultBlobUrl = useStlBlobUrl(resultStlGzB64)

const [uploadedBlobUrl, setUploadedBlobUrl] = React.useState<string | undefined>()
React.useEffect(() => {
  if (!uploadedFile) { setUploadedBlobUrl(undefined); return }
  const url = URL.createObjectURL(uploadedFile)
  setUploadedBlobUrl(url)
  return () => URL.revokeObjectURL(url)
}, [uploadedFile])

// DELETE these two derived values:
const activeUrl = resultBlobUrl ?? uploadedBlobUrl
const isEmpty = !activeUrl
```

Replace `isEmpty` with:

```tsx
const isEmpty = layers.length === 0
```

- [ ] **Step 3: Update Canvas content to render all layers**

Inside the `<Canvas>` block, replace the single `<STLErrorBoundary>` block:

```tsx
{/* DELETE the old single-mesh block: */}
<STLErrorBoundary key={activeUrl}>
  <React.Suspense fallback={null}>
    {activeUrl && (
      <STLMesh
        url={activeUrl}
        fitKey={cameraResetKey}
        onFitDistance={handleFitDistance}
        onFitOrthoZoom={handleFitOrthoZoom}
        meshColor={meshColor}
      />
    )}
  </React.Suspense>
</STLErrorBoundary>
```

with:

```tsx
{layers.map((layer, i) => (
  <STLErrorBoundary key={layer.blobUrl}>
    <React.Suspense fallback={null}>
      <STLMesh
        url={layer.blobUrl}
        fitKey={i === 0 ? cameraResetKey : undefined}
        onFitDistance={i === 0 ? handleFitDistance : undefined}
        onFitOrthoZoom={i === 0 ? handleFitOrthoZoom : undefined}
        meshColor={meshColor}
        opacity={layer.opacity ?? 1}
      />
    </React.Suspense>
  </STLErrorBoundary>
))}
```

- [ ] **Step 4: Add `opacity` prop to `STLMesh` and update its material**

Replace the `STLMeshProps` interface:

```tsx
interface STLMeshProps {
  url: string
  fitKey?: string
  onFitDistance?:  (d: number) => void
  onFitOrthoZoom?: (z: number) => void
  meshColor: string
  opacity?: number
}
```

Update the `STLMesh` function signature:

```tsx
function STLMesh({ url, fitKey, onFitDistance, onFitOrthoZoom, meshColor, opacity = 1 }: STLMeshProps) {
```

Replace the returned JSX in `STLMesh`:

```tsx
  return (
    <mesh ref={meshRef} geometry={geometry} castShadow>
      <meshPhongMaterial
        color={meshColor}
        specular={0x111111}
        shininess={50}
        side={THREE.DoubleSide}
        opacity={opacity}
        transparent={opacity < 1}
      />
    </mesh>
  )
```

(This also applies the Task 1 back-face fix to all layers — if Task 1 was already committed, the `side={THREE.DoubleSide}` line already exists on the single mesh; just incorporate it into the new version.)

- [ ] **Step 5: Remove `useStlBlobUrl` import if no longer used in ViewerScene**

Check the top of `ViewerScene.tsx`. `useStlBlobUrl` was imported from `'../lib/stl'`. After removing the `resultBlobUrl = useStlBlobUrl(...)` line, if the import is no longer referenced, delete it:

```tsx
// DELETE this line if no other usage remains:
import { useStlBlobUrl } from '../lib/stl'
```

- [ ] **Step 6: Delete `DualViewerLayout.tsx`**

```bash
rm react_frontend/src/components/DualViewerLayout.tsx
```

- [ ] **Step 7: Update `ToolPage.tsx` — add blob URL management**

Add the following new imports at the top of `ToolPage.tsx` (alongside existing imports):

```tsx
import { useStlBlobUrl } from '../lib/stl'
import type { MeshLayer } from '../components/ViewerScene'
```

Remove the `DualViewerLayout` import:

```tsx
// DELETE:
import { DualViewerLayout } from '../components/DualViewerLayout'
```

Add blob URL state and effects for uploaded files. Place these after the existing `uploadedFile` / `uploadedFile2` state declarations:

```tsx
// Blob URLs for uploaded surface files (created here, consumed by layer assembly)
const [uploadedBlobUrl, setUploadedBlobUrl] = React.useState<string | undefined>()
React.useEffect(() => {
  if (!uploadedFile) { setUploadedBlobUrl(undefined); return }
  const url = URL.createObjectURL(uploadedFile)
  setUploadedBlobUrl(url)
  return () => URL.revokeObjectURL(url)
}, [uploadedFile])

const [uploadedBlobUrl2, setUploadedBlobUrl2] = React.useState<string | undefined>()
React.useEffect(() => {
  if (!uploadedFile2) { setUploadedBlobUrl2(undefined); return }
  const url = URL.createObjectURL(uploadedFile2)
  setUploadedBlobUrl2(url)
  return () => URL.revokeObjectURL(url)
}, [uploadedFile2])

// Blob URL for calculation result (gz+b64 → Blob URL)
const resultBlobUrl = useStlBlobUrl(resultGzB64)
```

- [ ] **Step 8: Add layer assembly in `ToolPage.tsx`**

Add a `useMemo` for the `layers` array, after the blob URL state above:

```tsx
const layers: MeshLayer[] = React.useMemo(() => {
  if (resultBlobUrl) return [{ blobUrl: resultBlobUrl }]
  return [
    uploadedBlobUrl  ? { blobUrl: uploadedBlobUrl  } : null,
    uploadedBlobUrl2 ? { blobUrl: uploadedBlobUrl2 } : null,
  ].filter((l): l is MeshLayer => l !== null)
}, [resultBlobUrl, uploadedBlobUrl, uploadedBlobUrl2])
```

- [ ] **Step 9: Replace the conditional viewer render in `ToolPage.tsx`**

Find the viewer section in `ToolPage`'s return (around line 427–450). Replace the entire conditional block:

```tsx
// DELETE:
{calcMode === RULING && !resultGzB64
  ? (
    <DualViewerLayout
      file1={uploadedFile}
      file2={uploadedFile2}
      onFile1Drop={handleFile1Drop}
      onFile2Drop={handleFile2Drop}
      cameraMode={cameraMode}
      style={{ height: '100%' }}
    />
  )
  : (
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
  )
}
```

with:

```tsx
<ViewerScene
  layers={layers}
  cameraMode={cameraMode}
  cameraResetKey={viewerResetKey}
  onFileDrop={handleViewerFileDrop}
  onAutoFitComplete={handleAutoFitComplete}
  meshColor={meshColor}
  backgroundColor={backgroundColor}
/>
```

Also remove the `handleFile1Drop` and `handleFile2Drop` callbacks from `ToolPage` — they were only used by `DualViewerLayout`, which is now deleted. Drag-drop on the single viewer goes through `handleViewerFileDrop` → `handleFilesAdd` as before.

- [ ] **Step 10: Verify TypeScript compiles**

```bash
cd react_frontend && npm run build
```

Expected: zero errors. Fix any residual references to deleted props.

- [ ] **Step 11: Visual test**

Open `http://localhost:5173/tool`.
- Upload one IGS file in Extrusion mode → single mesh appears in the viewer.
- Switch to Ruling mode, upload two IGS files → both meshes appear together in a single canvas (no side-by-side split).
- Run a calculation → result mesh replaces the uploaded surfaces.

- [ ] **Step 12: Commit**

```bash
git add react_frontend/src/components/ViewerScene.tsx
git add react_frontend/src/pages/ToolPage.tsx
git rm react_frontend/src/components/DualViewerLayout.tsx
git commit -m "feat(viewer): replace dual-viewer with single layers-based ViewerScene"
```

---

## Task 3: Macro shape preview

After file upload in any mode, automatically calls the DLL with `nt1=nt2=nt3=0` and shows the resulting macro shape as a 25%-opacity overlay alongside the loaded surfaces.

**Files:**
- Modify: `react_frontend/src/pages/ToolPage.tsx`

**Interfaces:**
- Consumes: `MeshLayer` type and `layers` memo from Task 2
- Produces: `macroShapeBlobUrl` added to `layers` — no external dependents

- [ ] **Step 1: Add `macroShapeGzB64` state and its blob URL**

In `ToolPage.tsx`, add after the existing `resultGzB64` state:

```tsx
const [macroShapeGzB64, setMacroShapeGzB64] = React.useState<string | null>(null)
const macroShapeBlobUrl = useStlBlobUrl(macroShapeGzB64)
const pendingMacroRef = React.useRef(false)
```

- [ ] **Step 2: Include `macroShapeBlobUrl` in the `layers` memo**

Replace the `layers` `useMemo` from Task 2:

```tsx
const layers: MeshLayer[] = React.useMemo(() => {
  if (resultBlobUrl) return [{ blobUrl: resultBlobUrl }]
  return [
    uploadedBlobUrl      ? { blobUrl: uploadedBlobUrl }                    : null,
    uploadedBlobUrl2     ? { blobUrl: uploadedBlobUrl2 }                   : null,
    macroShapeBlobUrl    ? { blobUrl: macroShapeBlobUrl, opacity: 0.25 }   : null,
  ].filter((l): l is MeshLayer => l !== null)
}, [resultBlobUrl, uploadedBlobUrl, uploadedBlobUrl2, macroShapeBlobUrl])
```

- [ ] **Step 3: Add the macro shape trigger `useEffect`**

Add after the existing socket subscription `useEffect`:

```tsx
// Auto-trigger macro shape preview when surfaces are uploaded.
// Uses nt1=nt2=nt3=0 so the DLL returns the bounding envelope with no lattice.
React.useEffect(() => {
  if (calcMode === RULING) {
    if (!uploadedIgsB64 || !uploadedIgsB64_2) return
  } else {
    if (!uploadedIgsB64) return
  }
  setMacroShapeGzB64(null)
  pendingMacroRef.current = true
  socket.calculate({
    filename: uploadedFile?.name ?? 'surface.igs',
    surface_b64: uploadedIgsB64,
    ...(calcMode === RULING ? { surface2_b64: uploadedIgsB64_2! } : {}),
    client_ts: performance.now(),
    args: {
      tileType,
      calcMode,
      nt1: 0, nt2: 0, nt3: 0,
      g1, g2,
      p1: tileSliderValues[0], p2: tileSliderValues[1], p3: tileSliderValues[2],
    },
  })
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [uploadedIgsB64, uploadedIgsB64_2, calcMode])
```

- [ ] **Step 4: Route macro shape results in the `onResult` handler**

Find the `socket.onResult` callback in the existing `useEffect`. Replace the `else` branch (the `model_stl` handler):

```tsx
} else {
  // model_stl — either a macro shape preview or a real calculation result
  if (pendingMacroRef.current) {
    pendingMacroRef.current = false
    setMacroShapeGzB64(payload.stl_gz_b64)
  } else {
    setIsCalculating(false)
    setCalcLabel('Calculating…')
    setResultGzB64(payload.stl_gz_b64)
    setDownloadToken(payload.download_token)
    if (payload.args_echo) {
      pendingSnapshotRef.current = { filename: payload.filename, args: payload.args_echo }
    }
    if (pendingResetKey.current !== null) {
      setViewerResetKey(pendingResetKey.current)
      pendingResetKey.current = null
    }
  }
}
```

- [ ] **Step 5: Guard `handleCalculate` against in-flight macro previews**

At the very top of `handleCalculate` (before the validation checks), add:

```tsx
pendingMacroRef.current = false  // cancel any in-flight macro preview routing
```

- [ ] **Step 6: Clear macro shape on file removal or mode change**

Update `handleClear1`:

```tsx
const handleClear1 = React.useCallback(() => {
  setUploadedFile(null)
  setUploadedIgsB64(null)
  setMacroShapeGzB64(null)
}, [])
```

Update `handleClear2`:

```tsx
const handleClear2 = React.useCallback(() => {
  setUploadedFile2(null)
  setUploadedIgsB64_2(null)
  setMacroShapeGzB64(null)
}, [])
```

Update `handleCalcModeChange`:

```tsx
const handleCalcModeChange = React.useCallback((mode: CalcMode) => {
  setErrorMsg(null)
  setUploadedFile2(null)
  setUploadedIgsB64_2(null)
  setMacroShapeGzB64(null)
  setCalcMode(mode)
}, [])
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
cd react_frontend && npm run build
```

Expected: zero errors.

- [ ] **Step 8: Visual test**

Open `http://localhost:5173/tool` in Extrusion mode.
- Upload an IGS file → the solid surface mesh appears, then a semi-transparent macro-shape overlay should appear on top.
- Switch to Ruling mode, upload both IGS files → the same transparent overlay appears after both files are loaded.
- Click Calculate → the overlay disappears and the full lattice result replaces the solid surfaces.

- [ ] **Step 9: Commit**

```bash
git add react_frontend/src/pages/ToolPage.tsx
git commit -m "feat(viewer): show transparent macro-shape preview after file upload"
```

---

## Task 4: Extrusion length UI + backend

Exposes the hardcoded `extrude_length=10.0` in `do_extrusion` as a user-controlled `NumberInput` in the LatticeMenu, visible only when Extrusion mode is selected.

**Files:**
- Modify: `react_frontend/src/api/types.ts`
- Modify: `react_frontend/src/pages/ToolPage.tsx`
- Modify: `react_frontend/src/components/ui/LatticeMenu.tsx`
- Modify: `main.py`

**Interfaces:**
- Consumes: `CalculateArgs` from `types.ts`
- Produces: `extrudeLength` in `CalculateArgs` — used by `ToolPage` → `socket.calculate` → backend

- [ ] **Step 1: Add `extrudeLength` to `CalculateArgs` in `types.ts`**

```ts
export interface CalculateArgs {
  tileType: TileType;
  calcMode: CalcMode;
  nt1: number;
  nt2: number;
  nt3: number;
  p1: number;
  p2: number;
  p3: number;
  g1: number;
  g2: number;
  extrudeLength?: number;  // extrusion mode only; backend defaults to 10.0 when absent
}
```

- [ ] **Step 2: Add `extrudeLength` state and props to `LatticeMenu`**

Add to `LatticeMenuProps` interface in `LatticeMenu.tsx`:

```ts
extrudeLength: number
onExtrudeLengthChange: (v: number) => void
```

Add to the destructured props in the `LatticeMenu` body:

```tsx
extrudeLength,
onExtrudeLengthChange,
```

- [ ] **Step 3: Render conditional `NumberInput` in `LatticeMenu`**

Inside the "Macro-shape Construction" section, directly after the `<Dropdown>` for calc mode:

```tsx
{calculationMode === 'extrusion' && (
  <NumberInput
    label="Extrusion Length"
    value={extrudeLength}
    min={0.1}
    onChange={onExtrudeLengthChange}
    aria-label="Extrusion length"
  />
)}
```

- [ ] **Step 4: Add `extrudeLength` state to `ToolPage`**

```tsx
const [extrudeLength, setExtrudeLength] = React.useState(10.0)
```

- [ ] **Step 5: Pass `extrudeLength` props to `LatticeMenu` in `ToolPage`'s render**

In the `<LatticeMenu>` JSX, add:

```tsx
extrudeLength={extrudeLength}
onExtrudeLengthChange={setExtrudeLength}
```

- [ ] **Step 6: Include `extrudeLength` in all `socket.calculate` calls in `ToolPage`**

There are two places where `socket.calculate` is called in `ToolPage`: `handleCalculate` and the macro shape trigger `useEffect` from Task 3.

In `handleCalculate`, update the `args` object:

```tsx
args: { tileType, calcMode, nt1, nt2, nt3, g1, g2, p1: tileSliderValues[0], p2: tileSliderValues[1], p3: tileSliderValues[2], extrudeLength },
```

In the macro shape `useEffect` from Task 3, update the `args` object:

```tsx
args: {
  tileType,
  calcMode,
  nt1: 0, nt2: 0, nt3: 0,
  g1, g2,
  p1: tileSliderValues[0], p2: tileSliderValues[1], p3: tileSliderValues[2],
  extrudeLength,
},
```

- [ ] **Step 7: Update `do_extrusion` signature in `main.py`**

Find `do_extrusion` (around line 447) and add the `extrude_length` parameter:

```python
def do_extrusion(out_folder, igs_path, num_tiles, tile_params, grading_params, tile_type_int, extrude_length=10.0):
    out_igs = os.path.join(out_folder, "MSExtrd.igs").encode('ascii')
    out_stl = os.path.join(out_folder, "MSExtrd.stl").encode('ascii')
    result = _dll_from_extrusion(
        igs_path.encode('ascii'),
        extrude_length,
        num_tiles, grading_params,
        tile_type_int,
        tile_params,
        out_igs, out_stl,
    )

    if result == "First input file is not holding a polynomial Bezier surface.":
        logger.warning("[EXTRUSION] DLL failed — returning dummy STL")
        dummy_path = os.path.join(os.path.dirname(__file__), "last_results", "dummyResult.stl")
        stl_content = read_ascii_stl_file(dummy_path)
    else:
        stl_content = read_ascii_stl_file(out_stl.decode('ascii'))

    return stl_content, "MSExtrd.stl", "MSExtrd.igs"
```

- [ ] **Step 8: Read `extrudeLength` in `handle_calculate` and dispatch it**

In `handle_calculate` (around line 684), after the existing `g2 = float(...)` line, add:

```python
extrude_length = float(args.get('extrudeLength', 10.0))
```

Then find the dispatch block (around line 756) and add an `elif` for extrusion before the generic `else`:

```python
        with temp_igs_file(igs_bytes) as igs_path:
            if calc_mode == CALC_MODE_RULING:
                with temp_igs_file(igs_bytes2) as igs_path2:
                    stl_content, out_stl_name, out_igs_name = do_Ruling(
                        out_folder, igs_path, igs_path2,
                        curr_num_tiles, curr_tile_params, curr_graded, tile_type_int,
                    )
            elif calc_mode == CALC_MODE_EXTRUSION:
                stl_content, out_stl_name, out_igs_name = do_extrusion(
                    out_folder, igs_path, curr_num_tiles, curr_tile_params, curr_graded, tile_type_int,
                    extrude_length,
                )
            else:
                dispatch_fn = CALC_MODE_DISPATCH[calc_mode]
                stl_content, out_stl_name, out_igs_name = dispatch_fn(
                    out_folder, igs_path, curr_num_tiles, curr_tile_params, curr_graded, tile_type_int
                )
```

- [ ] **Step 9: Verify TypeScript compiles**

```bash
cd react_frontend && npm run build
```

Expected: zero errors.

- [ ] **Step 10: Visual test**

Open `http://localhost:5173/tool` in Extrusion mode.
- A "Extrusion Length" number input appears below the mode dropdown. Switch to Revolution or Ruling — the input disappears.
- Switch back to Extrusion, set length to e.g. 50, upload a surface, click Calculate — verify the result mesh is taller/larger than with the default 10.

- [ ] **Step 11: Commit**

```bash
git add react_frontend/src/api/types.ts react_frontend/src/pages/ToolPage.tsx react_frontend/src/components/ui/LatticeMenu.tsx main.py
git commit -m "feat: add extrusion length UI control wired to backend"
```

---

## Task 5: Tessellation tolerance + reactive re-conversion

Adds a "Tessellation Tolerance" slider in the Viewer Settings advanced section. Changing it re-converts any already-uploaded IGS files and refreshes the displayed meshes.

**Files:**
- Modify: `react_frontend/src/api/httpClient.ts`
- Modify: `react_frontend/src/pages/ToolPage.tsx`
- Modify: `react_frontend/src/components/ui/LatticeMenu.tsx`
- Modify: `main.py`

**Interfaces:**
- Consumes: `convertIgsFile` helper in `ToolPage.tsx`
- Produces: nothing depended on by other tasks

- [ ] **Step 1: Add `tolerance` param to `convertIgsToStl` in `httpClient.ts`**

```ts
export async function convertIgsToStl(file: File, tolerance: number = 0.0): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  form.append('tolerance', String(tolerance));
  const response = await fetch(`${BASE_URL}/convert_igs_to_stl`, {
    method: 'POST',
    body: form,
  });
  console.log("got", response);
  if (!response.ok) {
    throw new Error(`IGS conversion failed: ${response.status} ${response.statusText}`);
  }
  const data = await response.json();
  return data.stl_b64 as string;
}
```

- [ ] **Step 2: Update `convertIgsFile` helper in `ToolPage.tsx` to accept and forward `tolerance`**

```tsx
async function convertIgsFile(file: File, tolerance: number = 0.0): Promise<{ stlFile: File; igsB64: string }> {
  const [stlB64, igsB64] = await Promise.all([convertIgsToStl(file, tolerance), fileToBase64(file)])
  const binary = atob(stlB64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const stlName = file.name.replace(/\.igs$/i, '.stl')
  const stlFile = new File([bytes], stlName, { type: 'application/octet-stream' })
  return { stlFile, igsB64 }
}
```

- [ ] **Step 3: Add tolerance state and original IGS file references to `ToolPage`**

```tsx
const [igsConversionTolerance, setIgsConversionTolerance] = React.useState(0.0)
// Keep a reference to the original File objects so tolerance changes can re-convert
const [originalIgsFile,  setOriginalIgsFile]  = React.useState<File | null>(null)
const [originalIgsFile2, setOriginalIgsFile2] = React.useState<File | null>(null)
```

- [ ] **Step 4: Store original IGS files when uploading**

Replace the entire `handleFilesAdd` callback in `ToolPage` with the version below. Every `convertIgsFile` call now passes `igsConversionTolerance` and the original `File` is stored alongside the converted STL:

```tsx
const handleFilesAdd = React.useCallback(async (files: File[]) => {
  setResultGzB64(null)
  setErrorMsg(null)

  if (calcMode === RULING) {
    if (files.length >= 2) {
      setViewerResetKey('file-' + Date.now())
      try {
        const [r1, r2] = await Promise.all([
          convertIgsFile(files[0], igsConversionTolerance),
          convertIgsFile(files[1], igsConversionTolerance),
        ])
        setOriginalIgsFile(files[0])
        setOriginalIgsFile2(files[1])
        setUploadedFile(r1.stlFile)
        setUploadedIgsB64(r1.igsB64)
        setUploadedFile2(r2.stlFile)
        setUploadedIgsB64_2(r2.igsB64)
      } catch { setErrorMsg('Failed to convert IGS file') }
    } else {
      const file = files[0]
      if (!uploadedFile) {
        setViewerResetKey('file-' + Date.now())
        try {
          const { stlFile, igsB64 } = await convertIgsFile(file, igsConversionTolerance)
          setOriginalIgsFile(file)
          setUploadedFile(stlFile)
          setUploadedIgsB64(igsB64)
        } catch { setErrorMsg('Failed to convert IGS file') }
      } else if (!uploadedFile2) {
        try {
          const { stlFile, igsB64 } = await convertIgsFile(file, igsConversionTolerance)
          setOriginalIgsFile2(file)
          setUploadedFile2(stlFile)
          setUploadedIgsB64_2(igsB64)
        } catch { setErrorMsg('Failed to convert IGS file') }
      } else {
        // Both already loaded — replace the first file
        setViewerResetKey('file-' + Date.now())
        try {
          const { stlFile, igsB64 } = await convertIgsFile(file, igsConversionTolerance)
          setOriginalIgsFile(file)
          setUploadedFile(stlFile)
          setUploadedIgsB64(igsB64)
        } catch { setErrorMsg('Failed to convert IGS file') }
      }
    }
  } else {
    const file = files[0]
    setViewerResetKey('file-' + Date.now())
    try {
      const { stlFile, igsB64 } = await convertIgsFile(file, igsConversionTolerance)
      setOriginalIgsFile(file)
      setUploadedFile(stlFile)
      setUploadedIgsB64(igsB64)
    } catch { setErrorMsg('Failed to convert IGS file') }
  }
}, [calcMode, uploadedFile, uploadedFile2, igsConversionTolerance])
```

Also clear original files in `handleClear1` and `handleClear2`:

```tsx
const handleClear1 = React.useCallback(() => {
  setUploadedFile(null)
  setUploadedIgsB64(null)
  setOriginalIgsFile(null)
  setMacroShapeGzB64(null)
}, [])

const handleClear2 = React.useCallback(() => {
  setUploadedFile2(null)
  setUploadedIgsB64_2(null)
  setOriginalIgsFile2(null)
  setMacroShapeGzB64(null)
}, [])
```

- [ ] **Step 5: Add reactive re-conversion `useEffect`**

When `igsConversionTolerance` changes after a file is already loaded, re-convert and refresh the mesh. On first render `originalIgsFile` is `null`, so the effect is safely a no-op until a file is uploaded:

```tsx
React.useEffect(() => {
  if (!originalIgsFile) return
  convertIgsFile(originalIgsFile, igsConversionTolerance)
    .then(({ stlFile, igsB64 }) => {
      setUploadedFile(stlFile)
      setUploadedIgsB64(igsB64)
    })
    .catch(() => {/* ignore re-conversion failures silently */})
  if (originalIgsFile2) {
    convertIgsFile(originalIgsFile2, igsConversionTolerance)
      .then(({ stlFile, igsB64 }) => {
        setUploadedFile2(stlFile)
        setUploadedIgsB64_2(igsB64)
      })
      .catch(() => {})
  }
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [igsConversionTolerance])
```

- [ ] **Step 6: Add `tolerance` props to `LatticeMenu`**

Add to `LatticeMenuProps` in `LatticeMenu.tsx`:

```ts
tolerance: number
onToleranceChange: (v: number) => void
```

Add to the destructured props in the `LatticeMenu` body:

```tsx
tolerance,
onToleranceChange,
```

Add local state for drag preview (so the slider moves smoothly while dragging without triggering re-conversion on every tick):

```tsx
const [localTolerance, setLocalTolerance] = React.useState(tolerance)
React.useEffect(() => { setLocalTolerance(tolerance) }, [tolerance])
```

- [ ] **Step 7: Add Tessellation Tolerance slider inside the Viewer Settings section**

Inside the `{useViewerSettingsMenu && (…)}` block in `LatticeMenu`, add after the "Reset Colors" button:

```tsx
<Divider />
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
```

- [ ] **Step 8: Pass tolerance props from `ToolPage` to `LatticeMenu`**

In the `<LatticeMenu>` JSX in `ToolPage`, add:

```tsx
tolerance={igsConversionTolerance}
onToleranceChange={setIgsConversionTolerance}
```

- [ ] **Step 9: Update backend `handle_convert_igs_to_stl` in `main.py`**

Find `handle_convert_igs_to_stl` (around line 843). After reading the file bytes, add:

```python
tolerance = float(request.form.get('tolerance', 0.0))
```

Then update the `_dll_iges2stl` call (was `0.0`):

```python
err = _dll_iges2stl(igs_path.encode('ascii'), stl_path.encode('ascii'), tolerance)
```

- [ ] **Step 10: Verify TypeScript compiles**

```bash
cd react_frontend && npm run build
```

Expected: zero errors.

- [ ] **Step 11: Visual test**

Open `http://localhost:5173/tool`, click `+ Viewer Settings` to expand the advanced section.
- A "Tessellation Tolerance" slider appears at the bottom of the Viewer Settings panel.
- Upload an IGS file, then drag the slider to a high value (e.g. 0.8) and release — the displayed surface mesh should update with a coarser tessellation.
- Drag back to 0.0 — mesh returns to finest quality.

- [ ] **Step 12: Commit**

```bash
git add react_frontend/src/api/httpClient.ts react_frontend/src/pages/ToolPage.tsx react_frontend/src/components/ui/LatticeMenu.tsx main.py
git commit -m "feat: add tessellation tolerance control with reactive IGS re-conversion"
```
