# Design: Ruling Viewer Unification & UX Fixes

**Date:** 2026-07-04
**Branch:** `feature/fix-ruling`

---

## Overview

Five independent improvements to the lattice tool, addressing mentor feedback:

1. **Single viewer for ruling mode** — replace the dual side-by-side viewer with one canvas that renders both surface meshes.
2. **Macro shape preview** — after file upload in any mode, automatically call the DLL with zero tile counts and display the resulting macro shape as a semi-transparent overlay.
3. **Extrusion length UI** — expose the hardcoded `10.0` extrusion length as a user-controlled input in LatticeMenu.
4. **Back-face rendering fix** — surfaces are invisible when viewed from the back; fix with `THREE.DoubleSide`.
5. **Tessellation resolution control** — expose the IGS→STL conversion tolerance as a hidden advanced setting that re-triggers conversion when changed.

---

## Feature 1 — Single Viewer (Ruling Mode)

### Problem
`ToolPage` uses `DualViewerLayout` (two side-by-side `ViewerScene` components) when in ruling mode before a result is available. This is the only conditional branch in the viewer render path.

### Design

**New type in `ViewerScene.tsx`:**
```ts
interface MeshLayer {
  blobUrl: string
  opacity?: number  // defaults to 1.0; values < 1 enable Three.js transparency automatically
}
```

**`ViewerScene` props change:**
- Remove: `uploadedFile`, `resultStlGzB64`
- Add: `layers: MeshLayer[]`

Inside the Canvas, `ViewerScene` maps `layers` to one `STLMesh` per entry. Each `STLMesh` passes `opacity` and `transparent={opacity < 1}` to its `meshPhongMaterial`. Auto-fit targets the first layer (primary surface drives the camera).

**`ToolPage` assembles layers:**
```
if resultGzB64:
  layers = [{ blobUrl: resultBlobUrl, opacity: 1.0 }]
else:
  layers = [
    uploadedBlobUrl  && { blobUrl: uploadedBlobUrl,  opacity: 1.0 },
    uploadedBlobUrl2 && { blobUrl: uploadedBlobUrl2, opacity: 1.0 },   // ruling only
    macroShapeBlobUrl && { blobUrl: macroShapeBlobUrl, opacity: 0.25 }, // when available
  ].filter(Boolean)
```

`uploadedBlobUrl` and `uploadedBlobUrl2` move from `ViewerScene`'s internal state to `ToolPage` state (created via `URL.createObjectURL`, revoked on cleanup).

**`DualViewerLayout` is deleted.** The conditional in `ToolPage`'s render becomes a single `<ViewerScene layers={layers} ...>` always.

Both surface meshes in ruling mode use the same model color. Visual differentiation may be revisited if the geometry is insufficiently distinct.

---

## Feature 2 — Macro Shape Preview

### Problem
After uploading surfaces, the viewer shows the raw surface mesh but gives no indication of the overall 3D envelope the lattice will fill.

### Design

Calling the DLL with `nt1=nt2=nt3=0` returns a "macro shape" STL — the bounding surface shell with no lattice structure. This is shown as a semi-transparent overlay (25% opacity) alongside the uploaded surfaces.

**New state in `ToolPage`:**
- `macroShapeGzB64: string | null`

**Trigger logic:**
- Revolution / Extrusion: fires when `uploadedIgsB64` is set (single file uploaded)
- Ruling: fires when **both** `uploadedIgsB64` and `uploadedIgsB64_2` are set
- Resets when the user uploads new files or changes `calcMode`

**Implementation:**
- A `pendingMacroRef = useRef(false)` boolean ref is set to `true` immediately before the auto-preview `socket.calculate(...)` call
- The `calculate` payload uses current `calcMode` / `tileType` / `extrudeLength` / `surface_b64(s)`, with `nt1=nt2=nt3=0`
- In `onResult`: if `pendingMacroRef.current === true` and `payload.kind === 'model_stl'`, the result goes into `macroShapeGzB64` (not `resultGzB64`) and `pendingMacroRef.current` is reset to `false`
- **Race condition guard**: `handleCalculate` sets `pendingMacroRef.current = false` at its very start, so any in-flight macro preview result arriving after the user clicks Calculate is treated as a real result (and immediately overwritten by the actual calculation)

**Blob URL conversion** — `ToolPage` calls `useStlBlobUrl(resultGzB64)` and `useStlBlobUrl(macroShapeGzB64)` directly (these hooks move out of `ViewerScene` since `resultStlGzB64` is removed from its props). Blob URLs for uploaded files continue to use `URL.createObjectURL` in `ToolPage` state.

**No backend changes required** — the existing `calculate` handler works correctly with zero tile counts.

**Visual treatment:** 25% opacity, same material as other meshes, semi-transparent solid (not wireframe).

---

## Feature 3 — Extrusion Length UI

### Problem
`do_extrusion` in `main.py` hardcodes `extrude_length=10.0`. There is no UI to change it.

### Design

**LatticeMenu** — a `NumberInput` labeled "Extrusion Length" is added to the calc-mode section, rendered only when `calcMode === 'extrusion'`. It disappears when any other mode is selected.

New props on `LatticeMenu`:
```ts
extrudeLength: number
onExtrudeLengthChange: (v: number) => void
```

New state in `ToolPage`:
```ts
const [extrudeLength, setExtrudeLength] = React.useState(10.0)
```

**API layer** — `extrudeLength` is added to `CalculateArgs` in `types.ts` (optional, backend defaults to `10.0` when absent).

**Backend** — `handle_calculate` reads `args.get('extrudeLength', 10.0)` and passes it to `do_extrusion`. `do_extrusion` signature gains `extrude_length: float` param replacing the hardcoded value.

---

## Feature 4 — Back-Face Rendering Fix

### Problem
Three.js `MeshPhongMaterial` only renders front faces by default. Surfaces whose normals point inward (or viewed from the outside of a concave shape) appear invisible.

### Design

One-line change in `ViewerScene.tsx` — add `side={THREE.DoubleSide}` to every `STLMesh`'s `meshPhongMaterial`:

```tsx
<meshPhongMaterial
  color={meshColor}
  specular={0x111111}
  shininess={50}
  side={THREE.DoubleSide}
  opacity={opacity}
  transparent={opacity < 1}
/>
```

Applies to all mesh layers (uploaded surfaces, calculation results, macro shape overlay).

---

## Feature 5 — Tessellation Resolution Control

### Problem
`_dll_iges2stl` converts an uploaded IGS file to STL for preview using a `tolerance` float, currently hardcoded to `0.0`. The user has no way to trade mesh quality for speed.

### Design

**UI** — a `Slider` labeled "Mesh Quality" (or "Tessellation Tolerance") in a collapsed "Advanced" section within `LatticeMenu`. Range: `0.0` (finest) to `1.0` (coarsest), step `0.05`, default `0.0`. Hidden by default; user expands the section to access it.

New props on `LatticeMenu`:
```ts
tolerance: number
onToleranceChange: (v: number) => void
```

New state in `ToolPage`:
```ts
const [igsConversionTolerance, setIgsConversionTolerance] = React.useState(0.0)
```

**Reactive re-conversion** — a `useEffect` watches `[igsConversionTolerance, uploadedIgsB64]`. When either changes and `uploadedIgsB64` is set, it re-runs `convertIgsFile(originalIgsFile, igsConversionTolerance)` and updates `uploadedFile` (and `uploadedFile2` for ruling). This automatically re-triggers the macro shape preview since `uploadedFile` changes.

`convertIgsToStl(file, tolerance)` in `httpClient.ts` gains a `tolerance` param appended to the multipart form body.

**Backend** — `handle_convert_igs_to_stl` reads `float(request.form.get('tolerance', 0.0))` and passes it to `_dll_iges2stl`.

---

## Files Touched

| File | Change |
|------|--------|
| `react_frontend/src/components/ViewerScene.tsx` | Replace `uploadedFile`/`resultStlGzB64` props with `layers: MeshLayer[]`; add `DoubleSide`; handle per-layer opacity |
| `react_frontend/src/components/DualViewerLayout.tsx` | **Deleted** |
| `react_frontend/src/pages/ToolPage.tsx` | Add `macroShapeGzB64`, `extrudeLength`, `igsConversionTolerance` state; layer assembly; macro shape trigger logic; remove `DualViewerLayout` usage |
| `react_frontend/src/components/ui/LatticeMenu.tsx` | Add extrusion length input (conditional on calcMode); add Advanced section with tolerance slider |
| `react_frontend/src/api/types.ts` | Add `extrudeLength?: number` to `CalculateArgs` |
| `react_frontend/src/api/httpClient.ts` | Add `tolerance` param to `convertIgsToStl` |
| `main.py` | Read `extrudeLength` in `handle_calculate`; update `do_extrusion` signature; read `tolerance` in `handle_convert_igs_to_stl` |
