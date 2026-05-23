# Camera Auto-Fit on First Model Load

**Date:** 2026-05-23  
**Branch:** feature/visual  
**Status:** Approved

---

## Problem

When a 3D model loads for the first time in either viewer, the camera is positioned at a hardcoded distance that often leaves the model overflowing or too small. There is also a centering bug in `STLMesh` (ViewerScene) where the bounding box is measured with the old transform still applied, causing off-center renders on subsequent loads.

---

## Goal

- On first load of a new model (new tile type, new uploaded file), auto-fit the camera so the model fills ~65% of the viewer and is centred.
- On model updates caused by parameter changes, preserve the camera exactly where the user left it.
- After pressing Calculate, preserve the camera (the lattice result appears from the same angle the user used while inspecting the uploaded file).

---

## Behaviour Matrix

| Context | Trigger | Camera |
|---|---|---|
| Tile preview (TileCard large, TileMenu) | Site opens / TileMenu opens | ✦ Auto-fit |
| Tile preview | User picks a different tile type | ✦ Auto-fit |
| Tile preview | User drags a tile slider (param change) | ⟳ Preserve |
| Main viewer (ViewerScene) | User uploads a file for the first time | ✦ Auto-fit |
| Main viewer | User presses Calculate → lattice result arrives | ⟳ Preserve |
| Main viewer | Tile type changes → tile result shown | ✦ Auto-fit |
| Main viewer | Tile param changes → updated tile shown | ⟳ Preserve |

**Auto-fit:** bounding-sphere camera, model fills ~65% of viewer, zoom slider resets to 100.  
**Preserve:** camera stays exactly where the user left it; new mesh appears in the same view.

---

## Approach

**Approach A — `fitKey` prop + geometry-change guard inside the mesh component.**

The mesh component (`STLMesh` / `STLModel`) receives a `fitKey` string from the parent. After normalising the geometry it checks two conditions before auto-fitting:

1. The geometry object changed since the last fit (new model has actually loaded).
2. The `fitKey` changed since the last fit (parent signals a new context).

Both must be true. This prevents fitting to an old model when only the key changed (key changes before the new model arrives), and prevents re-fitting when only a param-recalc updates the geometry (key stays the same).

---

## Design

### 1. The `fitKey` + geometry guard

Both `STLMesh` and `STLModel` gain two refs:

```
lastFitKeyRef     — fitKey value at the time of the last auto-fit
prevGeometryRef   — geometry object at the time of the last auto-fit
```

Inside `useLayoutEffect`, after normalising:

```
if (geometry !== prevGeometryRef.current  AND  fitKey !== lastFitKeyRef.current):
    → run auto-fit
    → lastFitKeyRef.current = fitKey
    → prevGeometryRef.current = geometry
```

**How fitKey flows:**

- `ToolPage.viewerResetKey` → `ViewerScene.cameraResetKey` → `STLMesh.fitKey`
- `TileMenu` passes `tileType` as `cameraResetKey` to `TileCard` → `TileCard` passes it as `fitKey` to `STLModel`

`viewerResetKey` already changes in the right situations (file upload, tile-type change) and stays the same in others (param recalc). The only ToolPage change is to **stop changing it on Calculate** (see Section 5).

### 2. Auto-fit algorithm (65% fill)

After normalising the mesh, compute the bounding sphere and place the camera so the sphere fills 65% of the viewport:

```
r        = normalised mesh bounding sphere radius
halfFovV = camera.fov / 2   (radians)
halfFovH = atan(tan(halfFovV) × camera.aspect)
halfFov  = min(halfFovV, halfFovH)     // most constrained axis

distance = r / (0.65 × tan(halfFov))

camera.position.set(0, 0, distance)
camera.lookAt(0, 0, 0)
controls?.target.set(0, 0, 0)
controls?.update()
```

Using `min(halfFovV, halfFovH)` ensures wide and tall models both fit regardless of viewport aspect ratio. The 0.65 factor means 35% empty margin around the model.

### 3. Normalization fix

**Current bug in `STLMesh`:** bounding box is measured with the previous frame's transform still applied (position and scale are not reset first). `STLModel` resets first but uses a formula that only centres correctly when `localCenter = 0`.

**Correct sequence (applied to both):**

```
1. mesh.position.set(0, 0, 0)
   mesh.scale.setScalar(1)

2. box = Box3.setFromObject(mesh)    // raw local-space AABB
   center = box.getCenter(...)
   maxDim = max(size.x, size.y, size.z)

3. s = targetSize / maxDim          // targetSize: 2 for tile card, 3 for main viewer
   mesh.scale.setScalar(s)
   mesh.position.set(-center.x × s, -center.y × s, -center.z × s)
```

The fix: position is multiplied by `s`. This guarantees `worldCenter = 0` for any geometry, including off-axis STL files where `localCenter ≠ 0`.

### 4. Zoom integration (ViewerScene only)

`CameraZoom` currently uses a hardcoded `baseZ = 5`. After auto-fit, the base must equal `fitDistance`.

Changes to `ViewerScene`:
- Add `baseZ` state (default 5).
- `STLMesh` receives `onFit(distance)` callback; calls it after every auto-fit.
- `ViewerScene.onFit` does: `setBaseZ(distance)` and `onZoomChange?.(100)`.
- `CameraZoom` receives `baseZ` prop; uses it instead of the hardcoded constant:  
  `camera.z = baseZ / (zoom / 100)`

At zoom = 100 the camera sits exactly at the fit distance. The zoom slider scales linearly from there.

TileCard has no external zoom slider — OrbitControls' built-in scroll zoom is self-contained. No zoom callback needed there.

### 5. ToolPage change (one line)

Remove one line from `handleCalculate`:

```diff
- pendingResetKey.current = 'calc-' + Date.now()
```

With this line gone, pressing Calculate leaves `pendingResetKey.current` as null, so `viewerResetKey` never changes when the result arrives → camera preserved across the file-to-lattice transition.

All other `viewerResetKey` logic in ToolPage is already correct and unchanged:
- File upload → `setViewerResetKey('file-' + Date.now())` → auto-fit ✓
- Tile type change → `pendingResetKey.current = type` → auto-fit ✓
- Tile param commit → `pendingResetKey.current = null` → preserve ✓

---

## Files Changed

| File | Change |
|---|---|
| `react_frontend/src/components/ViewerScene.tsx` | Fix `STLMesh` normalization; add `fitKey` + `onFit` props; add auto-fit logic; add `baseZ` state; update `CameraZoom`; remove `CameraReset` component |
| `react_frontend/src/components/ui/TileCard.tsx` | Fix `STLModel` normalization; add `fitKey` prop; add auto-fit logic; remove `TileCardCameraReset` component |
| `react_frontend/src/pages/ToolPage.tsx` | Remove `pendingResetKey.current = 'calc-' + Date.now()` from `handleCalculate` |

---

## Out of Scope

- The mini tile preview in `LatticeMenu` (45.5 px, no orbit, no zoom) — too small to benefit from auto-fit.
- Orthographic camera auto-fit — orthographic uses a different zoom model (`camera.zoom`) and is a separate concern.
- The `CameraZoom` scroll-wheel handler — unchanged; it continues to call `onZoomChange` which now resets to the fit base.
