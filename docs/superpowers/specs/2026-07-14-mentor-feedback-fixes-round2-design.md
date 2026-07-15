# Design: Mentor Feedback Fixes (Round 2)

**Date:** 2026-07-14
**Scope:** 3 items reported by the mentor, plus one bug found during investigation (a fourth, more severe bug found during investigation is explicitly deferred).

---

## 1. Progress bar not updating during calculation

### Observed behavior
The mentor reported that the server-side percentage clearly increases (visible in the terminal), but the site's progress display does not reflect this — most visibly in extrusion mode, where it appears to jump straight from 0% to 100%.

### Investigation
A Socket.IO diagnostic client was connected directly to the running backend and used to trigger `calculate` for extrusion with two tile types at the same tile count (8×8×8), capturing every `update` event with a timestamp.

**Diagonal tile** (slower DLL phase): progress ticked smoothly and repeatedly — `0% → 91%` spread across 6.1 seconds, each tick 100–300ms apart. This confirms the server does emit a genuine, gradual sequence, not just 0 and 100.

**Cross-diagonal tile** (faster DLL phase, same tile count): all ~30 progress ticks (`0% → 100%`) arrived within **170ms** — far faster than a browser can paint each intermediate state. This is why fast calculations visually appear to "jump" straight to 100%: the ticks are real, but too close together in wall-clock time to render individually before React/the browser coalesces them into a single paint.

**A second, more serious problem was found in the same trace.** For the diagonal-tile run, `progress_end` (100%) fired at **t=8.1s**, but the actual `result` event (with the computed mesh) did not arrive until **t=43.1s** — a silent 35-second gap with no feedback at all. The corresponding server log line explains why:

```
[CALC] done  11927KB  overall=35939ms  dll=22897ms  compress=12977ms
```

The DLL's progress callback only covers the "microstructure building" phase. Writing the output files (folded into the 22.9s `dll_ms`) and our own gzip compression (12.9s, measured separately) happen afterward with **zero** progress reporting. During this entire window the UI is already sitting at "Calculating… 100%", which reads as done when it isn't — arguably a worse experience than the original complaint.

### Conclusion
Confirmed as **not** a data problem (the server does emit real intermediate percentages in every mode) but a **display problem** with two independent causes: paint-rate coalescing on fast calculations, and a false "100%" signal that ignores the un-instrumented write/compress phase.

### Fix
In `ToolPage.tsx`'s `onUpdate` handler (`react_frontend/src/pages/ToolPage.tsx:227-231`):

- **Cap the displayed percentage during the DLL phase at 90%**: `displayed = Math.round(progress * 0.9)`, so `progress_update` never itself claims 100%.
- **On `progress_end`, switch the label to an indeterminate "Finalizing…" state** rather than "100%" — honest that this phase's duration isn't predictable from the DLL's own signal. Only the real `result` event (in `onResult`) sets the terminal "done" state.
- **Force a paint per tick to fix coalescing**: wrap the `setCalcLabel` call in `progress_update` with `flushSync` (from `react-dom`) so each tick is rendered before the next socket message is processed, instead of letting React/browser batch them away. This is safe here because the update is a cheap label change, not an expensive subtree re-render.

---

## 2. Restore a way to view logs (not just the raw URL)

### Current state
There is currently **no UI entry point anywhere** (legacy `static/client.js` or the React app) for the log viewer — only the bare Flask routes `/viewlog` and `/viewfulllog` (note: project docs referred to `/viewlog007`/`/viewfulllog007`; those suffixes no longer exist in `main.py` — the docs are stale). The mentor wants a way back in that isn't simply "know the URL," while keeping direct URL access working.

### Fix
- A global `keydown` listener (mounted once at the top level of the React app) watches for the chord **Ctrl+Shift+L**.
- On match: `window.open('<backend-origin>/viewlog', '_blank')`, using the same backend-origin resolution the socket client already uses (`VITE_BACKEND_URL` / `VITE_BACKEND_LOCAL_URL`).
- The direct URL continues to work unchanged — this is purely an additional, hidden discovery path, not a replacement.

### What does NOT change
- `/viewlog` and `/viewfulllog` themselves are untouched.
- No new in-app log viewer UI is built; the trigger opens the existing Flask-rendered page in a new tab.

---

## 3. Cross-diagonal tile calculations are significantly slower

### Investigation
Using the same diagnostic Socket.IO client, extrusion was run at identical parameters (8×8×8 tiles) for both `diagonal` and `cross_diagonal` tile types.

- **Diagonal**: DLL "building" phase (progress-tracked) took 6.1s; full round trip 35.9s (`dll_ms=22897`, `compress_ms=12977`), producing an 11.9MB (compressed) result.
- **Cross-diagonal**: DLL "building" phase finished in **170ms** — faster than diagonal, not slower — yet the full round trip did not complete within 60 seconds (the diagnostic client gave up waiting).

### Conclusion
The slowness is real, but it is **not** happening before the DLL call (the mentor's specific concern) — pre-DLL overhead (payload decode, temp file write) is negligible in every mode. The DLL's own "microstructure building" step is not the bottleneck either — it's the *fastest* part for cross-diagonal at matched tile counts.

The actual cost is in the **uninstrumented tail**: writing the (much larger, more triangle-dense) output mesh to disk inside the DLL call, and our own gzip compression of that larger output afterward. Cross-diagonal tiles simply produce dramatically more geometry per tile than cross or diagonal, and both the DLL's file-write step and our compression step scale with output size. This matches the mentor's own expectation that "if the actual calculation is this long, there's nothing we can do" — with the caveat that part of the measured time (our compression step) is ours, not the DLL's, even though we are not changing it in this round.

### Fix
**No code change in this round** (compression tuning was considered and explicitly declined). This item is a confirmed-and-explained finding to report back to the mentor: the disparity is real, driven by output mesh size for the DLL's own generation and file-write step, not by anything happening before the DLL is invoked.

---

## 4. Macro-shape "flash" during upload / recalculation

### Observed behavior
When a surface is uploaded (or extrusion length changes, triggering a macro-shape recalculation), the viewer briefly shows just the uploaded surface — much larger on screen than the final composed view — before the macro shape arrives and both are shown together. This flash is jarring because of the size difference between "surface alone" and "surface + macro" normalization.

### Root cause
In `ToolPage.tsx`, the `layers` `useMemo` (`ToolPage.tsx:135-142`) derives the displayed layers directly from live state on every render:

```ts
const layers = useMemo(() => {
  if (resultBlobUrl) return [{ blobUrl: resultBlobUrl }]
  return [uploadedBlobUrl, uploadedBlobUrl2, macroShapeBlobUrl].filter(...)
}, [...])
```

`uploadedBlobUrl` renders the instant a file is set, regardless of whether `macroShapeBlobUrl` exists yet. The extrude-length-change effect (`ToolPage.tsx:264-287`) also calls `setMacroShapeGzB64(null)` immediately before requesting a new macro shape, which — under the current logic — causes an immediate fall-back to "surface only," producing the same flash on recalculation.

### Desired behavior (confirmed with the user)
Display should only update once **all currently-obtainable information** is ready — surface(s) + macro shape together — with one necessary exception: while a mode requiring two files (ruling) has only one of the two uploaded, that one surface is shown alone (the macro genuinely cannot be computed yet). Even then, uploading the second surface must not cause a flash: the display stays on the first surface until the macro shape arrives, then all three appear together atomically. On any recalculation (e.g. extrude-length change) where a complete, valid render was already showing, that render **stays frozen** on screen until the new macro shape arrives — it does not go blank and does not flash.

### Fix
Replace the direct derivation with a **"last complete state"** pattern in `ToolPage.tsx`:

1. Compute `requiredFiles = calcMode === RULING ? 2 : 1` and `uploadedCount` from the current surface state.
2. Maintain a `displayedLayers` state (instead of deriving `layers` fresh every render):
   - If `uploadedCount < requiredFiles`: update `displayedLayers` immediately to show the uploaded surface(s) so far (the one case where partial info is the most we can show).
   - If `uploadedCount === requiredFiles` **and** `macroShapeBlobUrl` is present for the current file set: update `displayedLayers` to the full set (surfaces + macro), replacing whatever was shown before, atomically.
   - If `uploadedCount === requiredFiles` **but** `macroShapeBlobUrl` is not yet ready (including during a recalculation where it was just cleared): **do not update** `displayedLayers` — leave the previous render in place.
   - `resultGzB64` (a completed calculation) still short-circuits everything, as today.
3. `ViewerScene`'s "Drop a .igs file here" empty-state placeholder must not appear while `isCalculating` is true or a macro recalculation is pending, so a frozen mid-recalculation state is never misread as an empty canvas.

### What does NOT change
- **Explicit user actions clear immediately, not frozen.** Removing a file (`handleClear1`/`handleClear2`) or switching calculation mode (`handleCalcModeChange`) resets `displayedLayers` right away (to empty or to the reduced surface set) — the freeze-on-stale-state behavior applies only while *waiting on a macro-shape recalculation*, not to direct user removals.
- **The no-upload tile-preview fallback is unaffected.** When nothing is uploaded and no result exists yet, the existing behavior of showing the default/live tile preview as a placeholder (`onResult`'s `tile_stl` branch, `ToolPage.tsx:186-197`) is orthogonal to this fix and continues unchanged — it only ever applies before any surface is uploaded.

---

## 5. Disconnect-handler crash (found during investigation)

### Observed behavior
While probing the server, every client disconnect logged an unhandled exception:

```
TypeError: on_disconnect() takes 0 positional arguments but 1 was given
```

### Root cause
`main.py`'s `on_disconnect()` (`main.py:660-668`) is declared with no parameters, but the installed `flask-socketio` version invokes disconnect handlers with a `reason` argument. The `TypeError` fires before `clean_session()` runs, so **every disconnect silently skips cleanup** — `last_results/<sid>/` folders are never removed, leaking disk space indefinitely over the life of the server process.

### Fix
```python
@socketio.on('disconnect')
def on_disconnect(reason=None):
    ...
```
Accept and ignore the argument. One-line signature change; behavior of the handler body is otherwise unchanged.

---

## Explicitly deferred (not in this round)

While testing item 3, back-to-back diagnostic requests left the backend process itself unresponsive and it stopped listening on its port entirely — consistent with a native crash from overlapping/concurrent calls into the DLL (which may not be thread-safe against concurrent invocation). This is a real stability risk but needs dedicated investigation (whether a global lock, a request queue, or a DLL-side fix is appropriate) and is **out of scope for this round** per explicit user decision.

---

## Files touched

| File | Changes |
|------|---------|
| `react_frontend/src/pages/ToolPage.tsx` | Progress-percentage capping + `flushSync` + "Finalizing…" state (item 1); global Ctrl+Shift+L listener (item 2); `displayedLayers` last-complete-state pattern replacing the `layers` memo (item 4) |
| `react_frontend/src/components/ViewerScene.tsx` | Suppress empty-state placeholder while calculating/recalculating (item 4) |
| `main.py` | `on_disconnect(reason=None)` signature fix (item 5) |

No backend changes are needed for items 1–3 beyond what's already instrumented; items 1–3 are primarily frontend display fixes plus confirmed-and-documented findings.
