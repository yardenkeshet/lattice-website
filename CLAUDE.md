# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the Application

```bash
python main.py
```

Serves on `http://localhost:5003`. No build step required — the C++ computation engine is pre-compiled.

Use the `.venv` virtual environment (Python 3.13). Install dependencies:
```bash
pip install flask flask-socketio numpy
```

## Architecture

This is a Flask + SocketIO web app for generating parametric lattice structures from CAD surface files. The key data flow is:

1. User uploads an STL file and sets parameters in the browser
2. The frontend emits a `calculate` SocketIO event
3. `main.py` receives it, calls `lattice.py` which invokes the C++ DLL via `ctypes`
4. The DLL writes result STL files to `last_results/<sid>/`
5. Results are gzipped + base64-encoded and sent back over the socket as a `result` event
6. Three.js renders the mesh in the browser

> Full Socket.IO event shapes, HTTP endpoints, and known server quirks are documented in `backend_api.md`.

**`main.py`** (~1065 lines) — entire backend: Flask routes, SocketIO event handlers, STL parsing/writing utilities (`parse_ascii_stl`, `write_ascii_stl`, `reduce_triangles`, `twist_mesh`), session management, logging, and file download logic.

**`lattice.py`** — thin `ctypes` wrapper around `gershon/MSDLLD64.dll`. Exposes three surface-type functions:
- `MSDLLMSFromRuling` — ruled surface lattice
- `MSDLLMSFromRevolution` — revolution surface lattice
- `MSDLLMSFromExtrusion` — extrusion surface lattice
- `MSDLLGetTile` — standalone tile geometry (for the tile preview panel)

**`static/client.js`** — legacy frontend: Three.js scene with OrbitControls, drag-and-drop STL upload, parameter HUD (left panel), real-time feedback during calculation, download via token. Full feature inventory is in `frontend_features.md`.

**`templates/index.html`** — legacy single-page app shell.

**`react_frontend/`** — new React + TypeScript frontend (Vite). Currently in development; see [React Frontend](#react-frontend) section below.

## Key Configuration (hardcoded in `main.py`)

| Variable | Value | Purpose |
|----------|-------|---------|
| `LOGFILE` | `lattice.log` | Rotating log (5 MB max) |
| `DATA_DIR` | `client_data/` | Uploaded STL + JSON metadata per client |
| `LAST_RESULTS_DIR` | `last_results/` | Per-session output STL files |
| `LAST_TILES_RESULTS_DIR` | `last_tiles_results/` | Cached tile geometries |
| Port | `5003` | Flask listen port |
| SocketIO buffer | `100 MB` | Max upload size for large STL files |

## Tile Types

The DLL exposes three tile variants (used as integer enum values):
- `0` — CROSS
- `1` — DIAGONAL
- `2` — CROSS_DIAGONAL

The mapping from the string values used in the frontend (`"cross"`, `"diagonal"`, `"cross_diagonal"`) to DLL functions and output filenames is documented in `backend_api.md` under the `calculate` event.

## DLL Path

`lattice.py` loads the DLL from `gershon/MSDLLD64.dll` (relative to the repo root). The path was recently fixed from a hardcoded absolute path — if the DLL fails to load, check that the working directory is the repo root when running `main.py`.

## Log Viewer

Visit `/viewlog007` for a real-time log tail, or `/viewfulllog007` for the full log.

## React Frontend

A new Vite + React + TypeScript frontend is being built in `react_frontend/` to replace `static/client.js`.

**Dev server:**
```bash
cd react_frontend
npm install
npm run dev   # http://localhost:5173
```

**Typed API layer** lives in `react_frontend/src/api/`:

| File | Purpose |
|------|---------|
| `types.ts` | All payload interfaces (`CalculatePayload`, `ResultPayload`, `TileType`, etc.) |
| `socketClient.ts` | `LatticeSocketClient` class — wraps all Socket.IO events behind typed methods; call `getLatticeSocket()` for the shared singleton |
| `httpClient.ts` | `downloadResults(token)` — POSTs the download token and triggers a browser file save |
| `index.ts` | Barrel export — import everything from `'../api'` |

**Key design notes:**
- The raw `result` event (emitted twice by the server after `calculate`) is normalized into a discriminated union `ResultPayload = STLResult | TokenResult`. Branch on `payload.kind`.
- Each `onXxx()` method on `LatticeSocketClient` returns an unsubscribe function suitable for React `useEffect` cleanup.
- No raw event strings appear outside `socketClient.ts`.

**Reference docs:**
- `frontend_features.md` — full inventory of features from the legacy frontend (use as a checklist during the refactor)
- `backend_api.md` — complete Socket.IO event and HTTP endpoint contract, including known server quirks
