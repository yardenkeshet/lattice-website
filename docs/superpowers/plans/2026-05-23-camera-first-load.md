# Camera Auto-Fit on First Model Load — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-fit the camera when a new 3D model first loads (tile type change, file upload, mode switch), while preserving the camera when only parameters change or Calculate is pressed.

**Architecture:** A pure `cameraFit.ts` utility provides the fit-distance and fit-zoom math functions, keeping them unit-testable. `STLMesh` (ViewerScene) and `STLModel` (TileCard) each gain a `fitKey` prop and two refs (`lastFitKeyRef`, `prevGeometryRef`); auto-fit fires inside `useLayoutEffect` only when both the geometry and the fitKey are new. ViewerScene tracks `baseZ` and `baseOrthoZoom` state so `CameraZoom` scales around the most recent fit distance rather than a hardcoded constant.

**Tech Stack:** React 19, React Three Fiber 9, Three.js 0.184, Vitest 4 (unit tests, `jsdom` environment), TypeScript 6.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `react_frontend/src/lib/cameraFit.ts` | **Create** | Pure math: perspective fit distance, orthographic fit zoom |
| `react_frontend/src/lib/__tests__/cameraFit.test.ts` | **Create** | Unit tests for the above |
| `react_frontend/src/components/ui/TileCard.tsx` | **Modify** | Fix STLModel normalization, add fitKey auto-fit, remove TileCardCameraReset |
| `react_frontend/src/components/ViewerScene.tsx` | **Modify** | Fix STLMesh normalization, add fitKey auto-fit (persp + ortho), dynamic zoom bases, remove CameraReset |
| `react_frontend/src/pages/ToolPage.tsx` | **Modify** | Remove the one line that reset the camera on Calculate |

---

## Task 1 — Camera-fit utility (`src/lib/cameraFit.ts`)

**Files:**
- Create: `react_frontend/src/lib/cameraFit.ts`
- Create: `react_frontend/src/lib/__tests__/cameraFit.test.ts`

- [ ] **Step 1.1 — Write the failing tests**

Create `react_frontend/src/lib/__tests__/cameraFit.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  FILL_FRACTION,
  perspectiveFitDistance,
  orthographicFitZoom,
} from '../cameraFit'

describe('perspectiveFitDistance', () => {
  it('returns a positive distance', () => {
    expect(perspectiveFitDistance(1.5, 45, 1)).toBeGreaterThan(0)
  })

  it('sphere fills exactly FILL_FRACTION of viewport half-height on a square canvas', () => {
    const r = 1.0
    const fovDeg = 45
    const d = perspectiveFitDistance(r, fovDeg, 1)
    const halfFovV = (fovDeg / 2) * (Math.PI / 180)
    const visibleHalfH = d * Math.tan(halfFovV)
    // r should equal FILL_FRACTION × visibleHalfH
    expect(r / visibleHalfH).toBeCloseTo(FILL_FRACTION, 5)
  })

  it('increases distance for a tall canvas (horizontal axis constrains)', () => {
    // aspect < 1 → halfFovH < halfFovV → horizontal constrains → more distance needed
    const d_tall   = perspectiveFitDistance(1, 45, 0.5)
    const d_square = perspectiveFitDistance(1, 45, 1.0)
    expect(d_tall).toBeGreaterThan(d_square)
  })

  it('same distance for a wide canvas when vertical still constrains', () => {
    // aspect = 2 → halfFovH > halfFovV → vertical still constrains
    const d_wide   = perspectiveFitDistance(1, 45, 2)
    const d_square = perspectiveFitDistance(1, 45, 1)
    expect(d_wide).toBeCloseTo(d_square, 5)
  })

  it('larger fill fraction → shorter distance', () => {
    const d_tight = perspectiveFitDistance(1, 45, 1, 0.9)
    const d_loose = perspectiveFitDistance(1, 45, 1, 0.5)
    expect(d_tight).toBeLessThan(d_loose)
  })
})

describe('orthographicFitZoom', () => {
  it('returns a positive zoom', () => {
    expect(orthographicFitZoom(1.5, 10, 10)).toBeGreaterThan(0)
  })

  it('visible minHalf / r equals 1/FILL_FRACTION at the returned zoom', () => {
    const r     = 1.0
    const halfW = 10
    const halfH = 6   // minHalf = 6
    const zoom  = orthographicFitZoom(r, halfW, halfH)
    const visibleMinHalf = Math.min(halfW, halfH) / zoom
    expect(visibleMinHalf / r).toBeCloseTo(1 / FILL_FRACTION, 5)
  })

  it('larger sphere → smaller zoom (camera zooms out)', () => {
    const z_small = orthographicFitZoom(0.5, 10, 10)
    const z_large = orthographicFitZoom(2.0, 10, 10)
    expect(z_large).toBeLessThan(z_small)
  })

  it('uses the smaller frustum dimension as the constraint', () => {
    // halfH=4 is smaller than halfW=10, so it constrains
    const zoom_h_constrained = orthographicFitZoom(1, 10, 4)
    const zoom_w_constrained = orthographicFitZoom(1, 4, 10)
    expect(zoom_h_constrained).toBeCloseTo(zoom_w_constrained, 5)
  })
})
```

- [ ] **Step 1.2 — Run tests, confirm they fail**

```bash
cd react_frontend
npx vitest run --project unit src/lib/__tests__/cameraFit.test.ts
```

Expected: **FAIL** — `Cannot find module '../cameraFit'`

- [ ] **Step 1.3 — Implement `cameraFit.ts`**

Create `react_frontend/src/lib/cameraFit.ts`:

```typescript
/** Fraction of the viewport the model should fill on auto-fit (65%). */
export const FILL_FRACTION = 0.65

/**
 * Computes the camera distance along +Z so that a sphere of radius `r`
 * centred at the origin fills `fill` fraction of the viewport.
 *
 * Uses min(verticalHalfFOV, horizontalHalfFOV) so wide and tall canvases
 * both fit correctly.
 *
 * @param r      Bounding-sphere radius of the normalised mesh.
 * @param fovDeg Vertical FOV in degrees (PerspectiveCamera.fov).
 * @param aspect Canvas width ÷ height (PerspectiveCamera.aspect).
 * @param fill   Desired fill fraction (default 0.65).
 */
export function perspectiveFitDistance(
  r: number,
  fovDeg: number,
  aspect: number,
  fill = FILL_FRACTION,
): number {
  const halfFovV = (fovDeg / 2) * (Math.PI / 180)
  const halfFovH = Math.atan(Math.tan(halfFovV) * aspect)
  const halfFov  = Math.min(halfFovV, halfFovH)
  return r / (fill * Math.tan(halfFov))
}

/**
 * Computes the camera.zoom value so that a sphere of radius `r`
 * fills `fill` fraction of the orthographic viewport.
 *
 * Formula: zoom = fill × minHalf / r
 * At this zoom: visible minHalf = minHalf / zoom = r / fill  →  r fills `fill` fraction.
 *
 * @param r             Bounding-sphere radius of the normalised mesh.
 * @param frustumHalfW  Math.abs(camera.right)  at zoom = 1.
 * @param frustumHalfH  Math.abs(camera.top)    at zoom = 1.
 * @param fill          Desired fill fraction (default 0.65).
 */
export function orthographicFitZoom(
  r: number,
  frustumHalfW: number,
  frustumHalfH: number,
  fill = FILL_FRACTION,
): number {
  const minHalf = Math.min(frustumHalfW, frustumHalfH)
  return (fill * minHalf) / r
}
```

- [ ] **Step 1.4 — Run tests, confirm they pass**

```bash
cd react_frontend
npx vitest run --project unit src/lib/__tests__/cameraFit.test.ts
```

Expected: **PASS** — 9 tests, 0 failures.

- [ ] **Step 1.5 — Commit**

```bash
cd react_frontend && cd ..
git add react_frontend/src/lib/cameraFit.ts react_frontend/src/lib/__tests__/cameraFit.test.ts
git commit -m "feat: add cameraFit utility with unit tests (perspectiveFitDistance, orthographicFitZoom)"
```

---

## Task 2 — Fix `TileCard.tsx`

**Files:**
- Modify: `react_frontend/src/components/ui/TileCard.tsx`

Changes:
- `STLModel`: reset transform before measuring, correct centering formula, add `fitKey` prop + auto-fit logic.
- `TileCard`: pass `cameraResetKey` as `fitKey` to `STLModel`.
- Delete `TileCardCameraReset` component entirely.

- [ ] **Step 2.1 — Add the cameraFit import at the top of TileCard.tsx**

In `react_frontend/src/components/ui/TileCard.tsx`, add after the existing imports:

```typescript
import { perspectiveFitDistance } from '../../lib/cameraFit'
```

The existing imports block already contains:
```typescript
import * as THREE from 'three'
```
Keep that line; add the new import below it.

- [ ] **Step 2.2 — Replace the entire `STLModel` function**

Find and replace the block from `function STLModel` through its closing `}` (currently lines 185–210) with:

```typescript
function STLModel({ url, color, fitKey }: { url: string; color: string; fitKey?: string }) {
  const geometry = useLoader(STLLoader, url)
  const ref = React.useRef<THREE.Mesh>(null)
  const { camera }  = useThree()
  const controls    = useThree(s => s.controls) as any

  const lastFitKeyRef   = React.useRef<string | undefined>(undefined)
  const prevGeometryRef = React.useRef<THREE.BufferGeometry | undefined>(undefined)

  React.useLayoutEffect(() => {
    if (!ref.current) return

    // 1. Reset to identity so the AABB is measured in raw local space.
    ref.current.position.set(0, 0, 0)
    ref.current.scale.setScalar(1)

    // 2. Measure raw local AABB.
    const box    = new THREE.Box3().setFromObject(ref.current)
    const center = box.getCenter(new THREE.Vector3())
    const size   = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    if (maxDim === 0) return

    // 3. Normalise: targetSize = 2 for tile card.
    //    Correct formula: position = -center * s so worldCenter = 0 for any geometry.
    const s = 2 / maxDim
    ref.current.scale.setScalar(s)
    ref.current.position.set(-center.x * s, -center.y * s, -center.z * s)

    // 4. Auto-fit only when BOTH the geometry AND the fitKey are new.
    //    This prevents fitting to an old model when only the key changes (key
    //    arrives before the new geometry), and prevents re-fitting on param recalcs
    //    (geometry changes but key stays the same).
    if (
      fitKey !== undefined &&
      geometry !== prevGeometryRef.current &&
      fitKey  !== lastFitKeyRef.current
    ) {
      lastFitKeyRef.current   = fitKey
      prevGeometryRef.current = geometry

      // Bounding sphere of the normalised mesh.
      const normBox = new THREE.Box3().setFromObject(ref.current)
      const sphere  = new THREE.Sphere()
      normBox.getBoundingSphere(sphere)

      // TileCard is always perspective — no orthographic branch needed.
      if (camera instanceof THREE.PerspectiveCamera) {
        const d = perspectiveFitDistance(sphere.radius, camera.fov, camera.aspect)
        camera.position.set(0, 0, d)
        camera.lookAt(0, 0, 0)
        controls?.target?.set(0, 0, 0)
        controls?.update?.()
      }
    }
  }, [geometry, fitKey]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <mesh ref={ref} geometry={geometry} castShadow>
      <meshStandardMaterial color={color} roughness={0.55} metalness={0.1} />
    </mesh>
  )
}
```

- [ ] **Step 2.3 — Delete `TileCardCameraReset`**

Remove the entire `TileCardCameraReset` function (currently lines 212–224):

```typescript
// DELETE THIS ENTIRE FUNCTION:
function TileCardCameraReset({ resetKey }: { resetKey: string }) {
  const { camera } = useThree()
  const controls = useThree(s => s.controls) as any
  React.useEffect(() => {
    camera.position.set(0, 0, 3)
    camera.lookAt(0, 0, 0)
    controls?.target?.set(0, 0, 0)
    controls?.update?.()
  }, [resetKey, controls]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}
```

- [ ] **Step 2.4 — Pass `fitKey` to `STLModel` and remove `TileCardCameraReset` usage**

Inside the `TileCard` component's Canvas JSX, find:

```tsx
<React.Suspense fallback={modelUrl ? null : <PlaceholderMesh color={meshColor} />}>
  {modelUrl
    ? <STLModel url={modelUrl} color={meshColor} />
    : <PlaceholderMesh color={meshColor} />
  }
</React.Suspense>

{enableOrbit && (
  <>
    <OrbitControls
      enablePan={false}
      enableZoom={true}
      makeDefault
    />
    <TileCardCameraReset resetKey={cameraResetKey ?? ''} />
  </>
)}
```

Replace with:

```tsx
<React.Suspense fallback={modelUrl ? null : <PlaceholderMesh color={meshColor} />}>
  {modelUrl
    ? <STLModel url={modelUrl} color={meshColor} fitKey={cameraResetKey} />
    : <PlaceholderMesh color={meshColor} />
  }
</React.Suspense>

{enableOrbit && (
  <OrbitControls
    enablePan={false}
    enableZoom={true}
    makeDefault
  />
)}
```

- [ ] **Step 2.5 — Start the dev server and verify visually**

```bash
cd react_frontend
npm run dev
```

Open `http://localhost:5173/tool`.

Check:
1. TileMenu opens → tile preview fills ~65% of the card, centred. ✓
2. Drag a tile slider → camera does not jump. ✓
3. Click a different tile type → camera resets and fits the new model. ✓

- [ ] **Step 2.6 — Commit**

```bash
cd ..
git add react_frontend/src/components/ui/TileCard.tsx
git commit -m "feat: TileCard — fix STLModel normalization, add fitKey auto-fit, remove TileCardCameraReset"
```

---

## Task 3 — Fix `ViewerScene.tsx`

**Files:**
- Modify: `react_frontend/src/components/ViewerScene.tsx`

Changes:
- `STLMesh`: reset transform before measuring, correct centring formula, add `fitKey` + `onFitDistance` + `onFitOrthoZoom` props + auto-fit (both perspective and orthographic branches).
- `CameraZoom`: replace hardcoded `baseZ=5` and raw `factor` with dynamic `baseZ` and `baseOrthoZoom` props.
- `ViewerScene` component: add `baseZ` + `baseOrthoZoom` state, `handleFitDistance` + `handleFitOrthoZoom` callbacks, pass them to `STLMesh` and `CameraZoom`.
- Delete `CameraReset` component entirely.

- [ ] **Step 3.1 — Add cameraFit imports**

At the top of `react_frontend/src/components/ViewerScene.tsx`, after the existing imports, add:

```typescript
import { perspectiveFitDistance, orthographicFitZoom } from '../lib/cameraFit'
```

- [ ] **Step 3.2 — Delete `CameraReset`**

Remove the entire `CameraReset` function (currently lines 179–189):

```typescript
// DELETE THIS ENTIRE FUNCTION:
function CameraReset({ resetKey }: { resetKey: string }) {
  const { camera } = useThree()
  const controls = useThree(s => s.controls) as any
  React.useEffect(() => {
    camera.position.set(0, 0, 5)
    camera.lookAt(0, 0, 0)
    controls?.target?.set(0, 0, 0)
    controls?.update?.()
  }, [resetKey, controls]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}
```

- [ ] **Step 3.3 — Replace `STLMesh`**

Find and replace the entire `STLMesh` function (currently lines 215–234) with:

```typescript
/* ─── STL mesh loader ─── */

interface STLMeshProps {
  url: string
  fitKey?: string
  onFitDistance?:  (d: number) => void
  onFitOrthoZoom?: (z: number) => void
}

function STLMesh({ url, fitKey, onFitDistance, onFitOrthoZoom }: STLMeshProps) {
  const geometry = useLoader(STLLoader, url)
  const meshRef = React.useRef<THREE.Mesh>(null)
  const { camera }  = useThree()
  const controls    = useThree(s => s.controls) as any

  const lastFitKeyRef   = React.useRef<string | undefined>(undefined)
  const prevGeometryRef = React.useRef<THREE.BufferGeometry | undefined>(undefined)

  React.useLayoutEffect(() => {
    if (!meshRef.current) return

    // 1. Reset to identity so the AABB is measured in raw local space.
    meshRef.current.position.set(0, 0, 0)
    meshRef.current.scale.setScalar(1)

    // 2. Measure raw local AABB.
    const box    = new THREE.Box3().setFromObject(meshRef.current)
    const center = box.getCenter(new THREE.Vector3())
    const size   = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    if (maxDim === 0) return

    // 3. Normalise: targetSize = 3 for main viewer.
    //    Correct formula: position = -center * s  →  worldCenter = 0 for any geometry.
    const s = 3 / maxDim
    meshRef.current.scale.setScalar(s)
    meshRef.current.position.set(-center.x * s, -center.y * s, -center.z * s)

    // 4. Auto-fit only when BOTH the geometry AND the fitKey are new.
    if (
      fitKey !== undefined &&
      geometry !== prevGeometryRef.current &&
      fitKey  !== lastFitKeyRef.current
    ) {
      lastFitKeyRef.current   = fitKey
      prevGeometryRef.current = geometry

      // Bounding sphere of the normalised mesh.
      const normBox = new THREE.Box3().setFromObject(meshRef.current)
      const sphere  = new THREE.Sphere()
      normBox.getBoundingSphere(sphere)
      const r = sphere.radius

      if (camera instanceof THREE.PerspectiveCamera) {
        const d = perspectiveFitDistance(r, camera.fov, camera.aspect)
        camera.position.set(0, 0, d)
        camera.lookAt(0, 0, 0)
        controls?.target?.set(0, 0, 0)
        controls?.update?.()
        onFitDistance?.(d)
      } else if (camera instanceof THREE.OrthographicCamera) {
        const z = orthographicFitZoom(r, Math.abs(camera.right), Math.abs(camera.top))
        camera.zoom = z
        camera.updateProjectionMatrix()
        controls?.update?.()
        onFitOrthoZoom?.(z)
      }
    }
  }, [geometry, fitKey]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <mesh ref={meshRef} geometry={geometry} castShadow>
      <meshStandardMaterial color="#c8c8c8" roughness={0.55} metalness={0.1} />
    </mesh>
  )
}
```

- [ ] **Step 3.4 — Replace `CameraZoom`**

Find and replace the entire `CameraZoom` function (currently lines 192–211) with:

```typescript
/* ─── Camera zoom controller ─── */

function CameraZoom({
  zoom,
  mode,
  baseZ,
  baseOrthoZoom,
}: {
  zoom: number
  mode: string
  baseZ: number
  baseOrthoZoom: number
}) {
  const { camera } = useThree()

  React.useEffect(() => {
    const factor = zoom / 100
    if (mode === 'orthographic') {
      // baseOrthoZoom = camera.zoom at zoom=100 (set by auto-fit).
      // Multiplying by factor lets the user zoom in/out from the fitted position.
      camera.zoom = baseOrthoZoom * factor
      camera.updateProjectionMatrix()
    } else {
      // baseZ = camera.position.z at zoom=100 (set by auto-fit).
      // Dividing by factor moves camera closer (zoom in) or further (zoom out).
      const perspCam = camera as THREE.PerspectiveCamera
      perspCam.position.z = baseZ / factor
      perspCam.updateProjectionMatrix()
    }
  }, [zoom, mode, camera, baseZ, baseOrthoZoom])

  return null
}
```

- [ ] **Step 3.5 — Update `ViewerScene` component: add state, callbacks, and wire everything**

Inside the `ViewerScene` function body, add two new state declarations directly after the existing `const [isDragOver, ...]` line:

```typescript
// Dynamic camera bases — updated when auto-fit fires.
const [baseZ,         setBaseZ]         = React.useState(5)
const [baseOrthoZoom, setBaseOrthoZoom] = React.useState(1)
```

Then add two callbacks after the zoom ref/handler block (before the container ref):

```typescript
// Called by STLMesh after a perspective auto-fit.
const handleFitDistance = React.useCallback((d: number) => {
  setBaseZ(d)
  onZoomChange?.(100)
}, [onZoomChange])

// Called by STLMesh after an orthographic auto-fit.
const handleFitOrthoZoom = React.useCallback((z: number) => {
  setBaseOrthoZoom(z)
  onZoomChange?.(100)
}, [onZoomChange])
```

- [ ] **Step 3.6 — Update the Canvas JSX to use the new props and remove `CameraReset`**

Inside the `<Canvas>` block, find:

```tsx
{/* Camera zoom controller */}
<CameraZoom zoom={zoom} mode={cameraMode} />

{/* Reset camera when parent signals a meaningful model change */}
<CameraReset resetKey={cameraResetKey ?? 'initial'} />

{/* Mesh */}
<React.Suspense fallback={null}>
  {activeUrl && <STLMesh url={activeUrl} />}
</React.Suspense>
```

Replace with:

```tsx
{/* Camera zoom controller — scales around the auto-fit base */}
<CameraZoom zoom={zoom} mode={cameraMode} baseZ={baseZ} baseOrthoZoom={baseOrthoZoom} />

{/* Mesh — auto-fit fires inside STLMesh when both fitKey and geometry are new */}
<React.Suspense fallback={null}>
  {activeUrl && (
    <STLMesh
      url={activeUrl}
      fitKey={cameraResetKey}
      onFitDistance={handleFitDistance}
      onFitOrthoZoom={handleFitOrthoZoom}
    />
  )}
</React.Suspense>
```

- [ ] **Step 3.7 — Start the dev server and verify visually**

```bash
cd react_frontend
npm run dev
```

Open `http://localhost:5173/tool`.

Check all six behaviours from the spec:

| Action | Expected |
|---|---|
| Upload a file | Camera auto-fits, model fills ~65% of viewer, zoom resets to 100 |
| Press Calculate | Camera stays exactly where it was during file inspection |
| Change tile type in TileMenu | Camera auto-fits in both the tile card preview and the main viewer |
| Drag a tile slider | Camera does not move in either the tile card or main viewer |
| Switch to Orthographic mode | Canvas remounts, model auto-fits with orthographic zoom, fills ~65% |
| Switch back to Perspective | Canvas remounts again, model auto-fits with perspective distance |

- [ ] **Step 3.8 — Commit**

```bash
cd ..
git add react_frontend/src/components/ViewerScene.tsx
git commit -m "feat: ViewerScene — fix STLMesh normalization, add fitKey auto-fit (persp + ortho), dynamic zoom bases, remove CameraReset"
```

---

## Task 4 — Fix `ToolPage.tsx` (one line)

**Files:**
- Modify: `react_frontend/src/pages/ToolPage.tsx`

- [ ] **Step 4.1 — Remove the pendingResetKey assignment from `handleCalculate`**

In `react_frontend/src/pages/ToolPage.tsx`, find `handleCalculate`:

```typescript
const handleCalculate = () => {
  if (!uploadedFile || !uploadedB64) {
    setErrorMsg('Please upload a 3D file first')
    return
  }
  pendingResetKey.current = 'calc-' + Date.now()  // ← DELETE THIS LINE
  setIsCalculating(true)
  setResultGzB64(null)
  setDownloadToken(null)
  setErrorMsg(null)
  socket.calculate({
    filename: uploadedFile.name,
    stl_text_b64: uploadedB64,
    client_ts: performance.now(),
    args: { tileType, nt1, nt2, nt3, g1, g2 },
  })
}
```

Remove the marked line. Result:

```typescript
const handleCalculate = () => {
  if (!uploadedFile || !uploadedB64) {
    setErrorMsg('Please upload a 3D file first')
    return
  }
  setIsCalculating(true)
  setResultGzB64(null)
  setDownloadToken(null)
  setErrorMsg(null)
  socket.calculate({
    filename: uploadedFile.name,
    stl_text_b64: uploadedB64,
    client_ts: performance.now(),
    args: { tileType, nt1, nt2, nt3, g1, g2 },
  })
}
```

- [ ] **Step 4.2 — Verify: Calculate preserves the camera**

With the dev server running, upload a file, orbit to a specific angle and zoom level. Press Calculate. Confirm the lattice result appears from the same angle/zoom you were using, not a reset view.

- [ ] **Step 4.3 — Commit**

```bash
git add react_frontend/src/pages/ToolPage.tsx
git commit -m "feat: ToolPage — preserve camera on Calculate (remove pendingResetKey reset)"
```

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| Auto-fit on tile first load / tile type change | Task 2 (TileCard STLModel fitKey), Task 3 (ViewerScene STLMesh fitKey) |
| Preserve camera on tile param change | Covered — fitKey unchanged on param recalc |
| Auto-fit on file upload | Task 3 + Task 4 (viewerResetKey changes on upload, pendingResetKey stays null on calc) |
| Preserve camera on Calculate | Task 4 |
| Normalization bug fix (STLMesh/STLModel) | Tasks 2 and 3 |
| Zoom slider resets to 100 on auto-fit | Task 3 (handleFitDistance + handleFitOrthoZoom call onZoomChange(100)) |
| Dynamic baseZ / baseOrthoZoom for CameraZoom | Task 3 |
| Orthographic auto-fit on mode switch | Task 3 (Canvas remounts → refs reset → auto-fit fires in ortho branch) |
| fitKey flows: ToolPage → ViewerScene → STLMesh | Task 3 Step 3.6 (cameraResetKey passed as fitKey) |
| fitKey flows: TileMenu → TileCard → STLModel | Task 2 Step 2.4 (cameraResetKey passed as fitKey) |
| Pure math utility extracted and tested | Task 1 |

All spec requirements are covered. No gaps found.
