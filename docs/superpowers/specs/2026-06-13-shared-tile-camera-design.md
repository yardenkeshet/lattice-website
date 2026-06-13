# Shared Tile-Preview Camera — Design Spec

**Date:** 2026-06-13
**Scope:** `react_frontend/src/lib/sharedCamera.ts` (new), `react_frontend/src/components/ui/TileCard.tsx`, `react_frontend/src/components/ui/LatticeMenu.tsx`, `react_frontend/src/components/ui/TileMenu.tsx`, `react_frontend/src/pages/ToolPage.tsx`

---

## Overview

`LatticeMenu` shows a mini (45.5px) tile preview and `TileMenu` shows a large
(166px), orbit-enabled tile preview. Both render the same normalized geometry
(`STLModel` scales every mesh so `maxDim → 2`, centered at the origin) with
the same camera FOV (45°) and aspect ratio (1:1, both square canvases), so a
raw camera `position`/`target` pair means the same thing in either preview.

Currently each `TileCard` instance owns an independent `PerspectiveCamera`
that only auto-fits on `cameraResetKey` (tile-type) change. When the user
orbits the large `TileMenu` preview, the mini `LatticeMenu` preview does not
follow.

This change makes the `TileMenu` large preview the single source of truth for
camera orientation whenever it's open, and makes the `LatticeMenu` mini
preview mirror it — via a shared mutable object with a pub-sub list, so no
React state changes or re-renders are involved.

---

## 1. New file — `react_frontend/src/lib/sharedCamera.ts`

```ts
export interface SharedCameraState {
  position: [number, number, number]
  target: [number, number, number]
  initialized: boolean
  listeners: Set<() => void>
}

export function createSharedCameraState(): SharedCameraState {
  return {
    position: [0, 0, 3],
    target: [0, 0, 0],
    initialized: false,
    listeners: new Set(),
  }
}

/** Mutates the shared state in place and synchronously notifies subscribers. */
export function publishSharedCamera(
  state: SharedCameraState,
  position: [number, number, number],
  target: [number, number, number],
): void {
  state.position = position
  state.target = target
  state.initialized = true
  state.listeners.forEach(fn => fn())
}

/** Returns an unsubscribe function. */
export function subscribeSharedCamera(state: SharedCameraState, fn: () => void): () => void {
  state.listeners.add(fn)
  return () => state.listeners.delete(fn)
}
```

---

## 2. `ToolPage.tsx`

Create the shared state once and pass it to both menus:

```ts
const sharedCameraRef = React.useRef(createSharedCameraState())
```

```tsx
<LatticeMenu ... sharedCameraRef={sharedCameraRef} />
...
<TileMenu ... sharedCameraRef={sharedCameraRef} />
```

---

## 3. `TileCard.tsx`

### 3.1 New prop

```ts
export interface TileCardProps {
  ...
  /** Shared camera-orientation state for syncing this preview's camera with another TileCard. */
  sharedCameraRef?: React.RefObject<SharedCameraState>
}
```

Threaded through to `STLModel` alongside `fitKey`.

### 3.2 `STLModel` changes

Role is inferred from the existing `enableOrbit` prop — it is already only
`true` for the `TileMenu` large preview.

**Source (`enableOrbit === true`)** — publish on every camera change:

- In the existing auto-fit `useLayoutEffect` (the block that runs on
  `cameraResetKey`/geometry change and sets `camera.position` via
  `perspectiveFitDistance`), after setting `camera.position` and
  `controls.target`, also call:
  ```ts
  sharedCameraRef?.current && publishSharedCamera(
    sharedCameraRef.current,
    [camera.position.x, camera.position.y, camera.position.z],
    [controls?.target?.x ?? 0, controls?.target?.y ?? 0, controls?.target?.z ?? 0],
  )
  ```
- Add a new effect that subscribes to the `OrbitControls` `'change'` event
  (fired continuously during drag/zoom) and publishes the same way:
  ```ts
  React.useEffect(() => {
    if (!enableOrbit || !controls || !sharedCameraRef?.current) return
    const state = sharedCameraRef.current
    const handleChange = () => publishSharedCamera(
      state,
      [camera.position.x, camera.position.y, camera.position.z],
      [controls.target.x, controls.target.y, controls.target.z],
    )
    controls.addEventListener('change', handleChange)
    return () => controls.removeEventListener('change', handleChange)
  }, [enableOrbit, controls, camera, sharedCameraRef])
  ```

**Follower (`enableOrbit !== true` and `sharedCameraRef` provided)** —
subscribe and mirror:

```ts
React.useEffect(() => {
  if (enableOrbit || !sharedCameraRef?.current) return
  const state = sharedCameraRef.current
  const apply = () => {
    camera.position.set(...state.position)
    camera.lookAt(...state.target)
    invalidate()
  }
  if (state.initialized) apply()
  return subscribeSharedCamera(state, apply)
}, [enableOrbit, camera, sharedCameraRef, invalidate])
```

- If `state.initialized` is already `true` when the follower mounts (the
  `TileMenu` preview is already open / has already published), the mini
  preview snaps to that view immediately — satisfying "snap on open."
- If the shared state was never published (`TileMenu` never opened in this
  session), `state.initialized` stays `false` and the follower keeps its
  existing independent auto-fit behavior — no regression for the
  no-`TileMenu` case.
- The follower's own auto-fit `useLayoutEffect` (scale/centering on
  `cameraResetKey`/geometry change) is unchanged — only the *camera*
  position/target portion of that effect is superseded by the subscription
  once `state.initialized` is `true`. Concretely: that effect's camera-fit
  branch should be skipped when `sharedCameraRef?.current?.initialized` is
  `true`, since the subscription's `apply()` will (re-)run right after via
  the publish from the source's own `cameraResetKey`-driven fit.

---

## 4. `LatticeMenu.tsx` / `TileMenu.tsx`

Both gain an optional `sharedCameraRef?: React.RefObject<SharedCameraState>`
prop, forwarded to their `TileCard`:

- `LatticeMenu`'s mini preview (`size="mini"`, no `enableOrbit`) → follower.
- `TileMenu`'s large preview (`size="large"`, `enableOrbit`) → source.

---

## 5. Out of Scope

- `OrbitControls` has `enablePan={false}` on the large preview, so `target`
  is always `[0, 0, 0]` in practice today. `target` is still synced for
  correctness/future-proofing (e.g. if panning is enabled later).
- No changes to the tile-type selector cards (`size="small"`) — they don't
  receive `sharedCameraRef`.
- No changes to `ViewerScene`'s main canvas camera.

---

## 6. Testing

- Manual: open `TileMenu`, drag/zoom the large preview, confirm the
  `LatticeMenu` mini preview mirrors the orientation in real time.
- Manual: open `TileMenu` after it was previously orbited away from default
  — mini preview should snap to that view immediately on open.
- Manual: with `TileMenu` never opened, mini preview still auto-fits normally
  on tile-type change (no regression).
- Manual: change tile type while `TileMenu` is open — both previews reset to
  the new tile's auto-fit view together.
