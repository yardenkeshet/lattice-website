# Progress label clarity — design

## Goal

The calculate-button label (`calcLabel` in `ToolPage.tsx`, rendered by `Toolbar.tsx`) currently uses a vague `'Finalizing…'` label for the post-DLL server step, and shows no label at all for the client-side decode step after a result arrives. Replace these with more specific, accurate labels so the user understands what's actually happening at each stage.

## Scope

Two label changes only. No new socket events, no backend changes, no changes to the "Sending…" label (already accurate — `surface_b64` is plain base64 prepared at upload time, not gzipped at send time, so there's no meaningful "zipping" step to label on send).

## Changes

### 1. Server-side compression → "Compressing…"

`react_frontend/src/lib/progressDisplay.ts`, `calcLabelForUpdate`, case `'progress_end'`: currently returns `'Finalizing…'`. This event fires when the DLL's own `_cb_done` callback runs (`main.py`), which happens immediately before the server gzips the result STL (`compress_text_to_b64_gz`). Rename the label to `'Compressing…'` to describe that upcoming step accurately. No backend change required — purely a client-side label rename.

Update `progressDisplay.test.ts` to match the new expected string.

### 2. Client-side decode → "Unzipping…"

Today, `ToolPage.tsx`'s `onResult` handler (model_stl success branch, ~line 243-255) sets `isCalculating` to `false` as soon as the result payload arrives. The gzip payload is then decoded separately, reactively, inside `useStlBlobUrl`'s effect (`stl.ts`) — which runs *after* the button has already reverted to "Make Lattice", so the decode step is invisible.

Since `Toolbar` only renders `calcLabel` while `isCalculating` is `true`, the fix is:
- On receiving a successful `model_stl` result, set `calcLabel('Unzipping…')` first.
- Keep `isCalculating` `true` for one extra animation frame (`requestAnimationFrame`) so the label actually paints before the blob decode (triggered by the `resultGzB64` state update in the same tick) completes.
- Then set `isCalculating` to `false`, reverting the button to normal.

This is a real (if fast) decode step — pako's `ungzip` — so the label reflects genuine, if brief, work rather than fabricated busywork.

## Out of scope

- No change to the "Sending…" label or send-time flow.
- No new server-emitted progress events.
- No change to queue-wait labels (`calcLabelForQueueStatus`).
