# Frontend Features

## 3D Viewport
- Full-screen WebGL canvas rendered by Three.js, dark background (`#222222`)
- Directional light + ambient light setup
- **OrbitControls** — rotate, pan, zoom via mouse drag; damping enabled for smooth movement
- Window resize handler — canvas and camera update to match viewport
- **Auto-fit camera** (`fitCameraToMesh`) — after loading a result, camera positions itself to frame the model
- **Perspective / Orthographic camera toggle** button (`#cameraModeToggle`) — switches mode, updates OrbitControls, and re-fits camera; button label and cyan glow change to indicate active mode

## Idle / Intro Animation (tile showcase)
- Loads three tile STL files at startup: `TileCross.stl`, `TileDiagonal.stl`, `TileCrossDiag.stl`
- Lays them out along the X-axis with equal spacing
- Plays a sequential rotation animation (each mesh rotates one full turn on X, then Y, then Z, cycling)
- Animation stopped and tiles removed from scene when a calculation result arrives

## File Input
- **Drag-and-drop** STL onto `#dropzone` — highlights border on hover
- **File picker** (`<input type="file">`) inside the dropzone
- **Binary vs ASCII STL detection** — reads as `ArrayBuffer`, inspects header/triangle-count to decide format; decodes ASCII text with `TextDecoder`
- Loaded file immediately rendered in the 3D viewport

## Loaded Mesh Display
- Previous mesh disposed (geometry + material) before loading the new one
- STL parsed with `STLLoader`, vertex normals computed
- Mesh centered, scaled to fit view (`90 / bbox.diagonal`), then camera re-fitted

## Left HUD Panel (`#ui-panel`)
- **Panel open/close toggle** button (`#toggle-ui-btn`, left side) — slides panel off-screen left, icon switches `«` ↔ `☰`
- **Close button** (`#close-ui-btn`, top-right of panel) — always closes the panel
- Responsive: on narrow screens (`≤600px`) panel moves to bottom of viewport

### Lattice Type Section
- `#tileType` dropdown — options: DIAGONAL, CROSS, CROSS_DIAGONAL
- **Auto-fill presets**: changing tile type auto-populates P1/P2/P3 with sensible defaults
- P1, P2, P3 number inputs (step `0.01`)
- **"Calculate Tile"** button (`#calculateTile`) — emits `calculate_tile` socket event with tile type + P1/P2/P3

### Lattice Section
- `#nt1`, `#nt2`, `#nt3` — Num Tiles (X, Z, Scale/Spacing)
- `#g1`, `#g2` — Grading parameters (Amplitude, Frequency)

### Number Input Interactions
- **Mouse wheel** on any number input increments/decrements by the input's `step`
- **Click-and-drag (scrub)** — horizontal mouse drag changes value; sensitivity: 5 px per step; each drag event also calls `getLiveTileParams()` which re-emits `calculate_tile` (live tile preview on scrub)
- Default browser spin arrows hidden for a cleaner look
- Cursor changes to `ew-resize` to hint at scrubbing

### STL Upload
- `#dropzone` drag-and-drop area inside the panel

### Calculate & Send
- `#calculate` button — base64-encodes current STL text, collects all parameters, emits `calculate` socket event
- Button gains `.btn-disabled` (grayed out, pointer-events off) while a calculation is in progress

## Calculation Progress Indicator (`#calc-activity`)
- CSS spinner animation
- Live elapsed-time counter (`#calc-elapsed`) updated every animation frame via `requestAnimationFrame`
- Label text (`#calc-label`) shows current phase: `"Sending & processing…"` → `"Done"` / `"Failed"`
- Hides after 300 ms grace period once finished; Calculate button re-enabled

## Status Text (`#status`)
- Short text messages: `idle`, `Loaded (binary/ascii) <filename>`, `Sending...`, `Displayed`, `decompress failed`, `Error: …`
- Also used as live readout of P1/P2/P3 values during scrub

## Result Handling (SocketIO `result` event)
- Receives `stl_gz_b64` (base64 gzip) and decompresses with **pako** (`pako.ungzip`)
- Renders decompressed STL into the 3D scene
- Receives `download_token` and, if present, reveals `#download-area`

## Download Area (`#download-area`)
- Hidden until a result with a `download_token` is received
- Form POST to `/download-results` with token in hidden input
- **"Download Results"** button (`#download-btn`) — submits form, downloads a zip of output files

## Performance Metrics Panel (`#perfBox`, top-right)
- Always visible overlay showing five timing values (ms):
  - Client → Server
  - Server process
  - Compress
  - Send back
  - Overall

## Error Handling
- Socket `error` event updates `#status` and stops the progress animation
- Decompression failure caught, status updated, animation stopped

## HUD Text Sprite (present in code, currently inactive)
- `createTextGradientSprite` / `createTextSprite` / `createMultiColorTextSprite` utility functions exist for rendering canvas-based text as a Three.js `Sprite`; currently commented out / not added to scene