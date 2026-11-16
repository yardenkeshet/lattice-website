# Frontend Features

What the React frontend (`react_frontend/`) actually does, page by page. For the
wire protocol behind it see `backend_api.md`; for where to add tile types and
calculation modes see the runbook (`general_overview_and_server_runbook.md`).

> The legacy `static/client.js` + `templates/index.html` UI (STL uploads,
> `#dropzone`, `#perfBox` timing panel, zip download, intro tile animation) was
> retired in commit `80fca0d`. None of its element IDs exist any more; use
> `git show 80fca0d^:static/client.js` if you need to look at it.

## Routes

Defined in `src/App.tsx` (`react-router-dom`):

| Path | Page | Contents |
|------|------|----------|
| `/` | `HomePage` | Banner, auto-playing image carousel (`src/assets/Carousel/*`, 5 s per slide), "Open Lattice Maker →" button, project description text |
| `/tool` | `ToolPage` | The lattice tool (everything below) |
| `/help` | `HelpPage` | Seven-step walkthrough (choose mode → upload → parameters → tile → calculate → explore → export) plus contact email |
| `/help/full` | `HelpFullPage` | Full description, comments, restrictions, sample IGES downloads (`public/sample-surfaces/DiskSimpleSrf.igs`, `SimpleRevolve.igs`), references and citation text |
| anything else | — | Redirects to `/` |

Every page has the `Banner` at the top (clicking it on the Tool/Help pages goes
home) and the `Footer` at the bottom. `Navbar` exists in `components/ui/` but is
not used by any page.

## Tool page layout

Three columns: **LatticeMenu** (left), **Toolbar + viewer** (centre),
**TileMenu** (right). Below 900 px width (`useMediaQuery('(max-width: 900px)')`)
the two menus share the top row and the viewer drops to its own full-width row
(60 vh, min 300 px).

Almost every label has a hover `Tooltip` explaining it.

## LatticeMenu (left panel)

| Control | Range / values | Default | Notes |
|---------|----------------|---------|-------|
| Tiles Counts X / Y / Z (`nt1`/`nt2`/`nt3`) | integers 1–10 | 1 / 1 / 10 | `NumberInput` |
| Macro-shape construction (`calcMode`) | Extrusion, Revolution, Ruling | Extrusion | From `CALC_MODE_DEFS`. Changing it **clears all uploaded files, the result and the download token**. |
| Extrusion length | 0.1–100 (`MAX_EXTRUSION_LENGTH`), step 0.01 | 10 | Shown in Extrusion mode only. Changes re-run the macro-shape preview after a 500 ms debounce. |
| Load surface(s) as IGES | `.igs` only | — | Click opens a file picker (multi-select in Ruling). Label reads "Load one surface…" or "Load two surfaces…". |
| Loaded file list | — | — | One row per file with a × button to remove it |
| Grading Start / End (`g1`/`g2`) | 0.1–2.5, step 0.01 | 1 / 1 | Linear arm-thickness grading along Z |
| **+ Viewer Settings** (collapsible) | | | |
| ↳ Mesh Color | colour picker | `#00aaff` | Applies to main viewer and tile preview |
| ↳ Background Color | colour picker | `#fff` | Same |
| ↳ Shading | Normal, Gouraud, Phong | Phong | Normal = colour by normal direction; Gouraud = matte per-vertex; Phong = per-pixel with highlights |
| ↳ Specular | 0–255 | 17 | Phong only |
| ↳ Shininess | 0–200 | 50 | Phong only |
| ↳ Reset Display Settings | button | | Restores the five values above |
| ↳ Tessellation Tolerance | 0–1, step 0.05 | 0 | Display-only fineness of the surface preview. On release, re-converts the uploaded surface(s) and recalculates the tile preview. |

## TileMenu (right panel)

- **Live tile preview**: a 166 px `TileCard` with its own orbit/zoom controls
  (no pan). Shows the bundled `assets/default_diagonal_tile.obj` on first load,
  so the preview appears without a server round-trip. Its camera resets when
  the tile type changes.
- **Tile Type**: one card per entry in `TILE_DEFS` (Cross, Diagonal, Cross
  Diagonal). Default: Diagonal. Picking one resets the sliders to that tile's
  defaults and sends `calculate_tile`.
- **Parameters**: one slider per entry in the tile's `sliders` list:

  | Tile | Sliders (default) |
  |------|-------------------|
  | Cross | Outer Radius (0.15), Inner Radius (0.05) |
  | Diagonal | Center Size (0.25), End-Arm Size (0.25), Smoothing of Arms (0.3) |
  | Cross Diagonal | Cross Radius (0.2), Diagonal Relative Radius (0.5) |

  Dragging a slider only changes local state. `calculate_tile` is sent on
  **commit** (mouse-up, or Enter in the editable value badge).
- **Validation**: for Cross, Inner Radius ≥ Outer Radius registers the error
  "Inner radius must be less than outer radius", which blocks Make Lattice.

## Toolbar (above the viewer)

| Control | Behaviour |
|---------|-----------|
| Camera pill (left) | Toggles `perspective` ↔ `orthographic`. Position, rotation and zoom are preserved across the switch (camera snapshot handed to the remounted canvas). |
| **Make Lattice** | Validates, then emits `calculate`. Disabled while a calculation is running. |
| **Export Lattice** | Disabled until a result with a download token exists. Opens a popup with **Export OBJ** and **Export IGS**, each calling `downloadResults(token, 'obj' \| 'igs')`. |
| **Help** (right) | Opens `/help` in a new tab |

Pre-calculate checks (shown in the error banner): any validation error from a
child component; Ruling needs both surfaces ("Please upload both surface
files" / "…Surface 1" / "…Surface 2"); other modes need one ("Please upload a 3D
file first").

## Viewer (`components/ViewerScene.tsx`)

- React Three Fiber canvas, `frameloop="demand"` (renders only on change),
  ambient light plus four directional lights, `OrbitControls` (rotate, pan,
  scroll-zoom).
- **Drag-and-drop**: dropping files onto the canvas goes through the same path as
  the file picker. Empty state reads "Drop a .igs file here"; while dragging,
  "Drop to load"; with content but no upload yet, a hint bar reads "Drop .igs
  file here to load a surface".
- **Auto-fit**: the camera frames newly loaded content (on upload, tile-type
  change and calculation result), but not on a slider commit.
- **What is shown** (`lib/displayedLayers.ts`), in priority order:
  1. A calculation result, if any, shown alone.
  2. Fewer surfaces than the mode needs: just the uploaded surface(s).
  3. All surfaces plus the macro-shape preview: surfaces, then the macro shape
     at 25 % opacity.
  4. All surfaces but macro shape still pending: keep showing the previous
     frame (no flash of bare surfaces).

  Before any upload, the main viewer shows the tile preview (except in Ruling
  mode).
- **Window resize / browser zoom**: after resizing settles (300 ms) the canvas
  is remounted with the camera snapshot, working around R3F keeping a stale size.

## Uploading a surface

1. Only `.igs` is accepted; anything else shows "Unsupported file type…".
2. The number of files must equal the mode's `requiredFilesCount` (1, or 2 for
   Ruling), all selected at once. Otherwise an error is shown and anything
   loaded before is cleared.
3. Each file is POSTed to `/convert_igs_to_obj` for a preview mesh. The original
   IGS bytes are kept (base64) to send with `calculate`.
4. Once all required surfaces are present, a **silent** `calculate` with
   `nt1 = nt2 = nt3 = 0` fetches the macro-shape envelope for the preview. Silent
   calls never show the overlay or queue messages.

## Calculating

- While running, the rest of the page is made `inert` and a full-screen
  **CalculationOverlay** is shown, in one of three phases:

  | Phase | Heading | Text |
  |-------|---------|------|
  | waiting (in server queue) | Getting in line | "Site is busy — you're #N in line" (real position from `queue_status`) |
  | calculating | Building your lattice | Cycling phrases every 2.5 s ("Reading your surfaces…" → … → "Still working — larger models take a bit longer…"); holds on the last one |
  | finalizing (after `progress_end` / `progress_sending`) | Wrapping up | "Finalizing your model…" → "Compressing the mesh…" → "Preparing your preview…" |

  The phrases are not real progress; they're time-based (see
  `lib/progressDisplay.ts`).
- **Ends** on `result`, `error`, `queue_rejected` or a socket disconnect
  ("Lost connection to the server during calculation. Please try again.").
- **Queue full**: `queue_rejected` shows a yellow dismissible banner ("Site is
  too busy right now…"), distinct from the red error banner.
- **After a result**: once the camera has fitted the result, a PNG snapshot of
  the canvas is POSTed with the parameters to `/log-calculation` for the
  calculation history log.

## Messages

- **Error banner** (red, `role="alert"`, ✕ to dismiss), for upload, validation,
  server and download errors. Cleared by most user actions.
- **Queue-busy banner** (yellow, `role="status"`, ✕ to dismiss).

## Hidden shortcuts

- **Ctrl+Shift+L** on the Tool page opens `/viewlog` in a new tab
  (`lib/logViewerShortcut.ts`).

## Not implemented

- **No timing / performance display.** The server returns a `timings` object on
  every `result` and the client sends `client_ts`, but nothing renders them
  (the legacy `#perfBox` was not ported).
- `ViewerScene` accepts `zoom` / `onZoomChange` props for an external zoom
  control, but `ToolPage` doesn't pass them; zoom is OrbitControls' scroll
  wheel only.
