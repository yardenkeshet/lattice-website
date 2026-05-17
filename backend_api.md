# Backend API Contract

Flask-SocketIO server running on `http://localhost:5003`.  
SocketIO transport: `threading` async mode, CORS open (`*`), max HTTP buffer 100 MB.

> **React frontend:** Do not talk to the server directly from UI components.  
> Use the typed wrappers in `react_frontend/src/api/` — all event strings, payload shapes,  
> and edge cases (double `result` emit, inconsistent error fields) are encapsulated there.  
> See the [React API Layer](#react-api-layer) section at the bottom of this file.

---

## HTTP Endpoints

### `GET /`
Serves the main single-page app (`templates/index.html`).

---

### `GET /viewlog007`
Renders the real-time log viewer page (`templates/log_view.html`).  
The page uses SocketIO to receive `log_update` events.

---

### `GET /viewfulllog007`
Renders a static full-log dump (`templates/full_log_view.html`).  
Reads the entire `lattice.log` file into the template at request time.

---

### `POST /download-results`

Downloads the result files for a completed calculation as a ZIP archive.

> **React frontend:** call `downloadResults(token)` from `react_frontend/src/api/httpClient.ts`.  
> It POSTs the token and triggers a browser file save — no form element needed.

**Request** — `application/x-www-form-urlencoded` form body:

| Field   | Type   | Description                                       |
|---------|--------|---------------------------------------------------|
| `token` | string | Single-use download token received in the `result` SocketIO event |

**Response**  
- `200 application/zip` — `results.zip` containing two files:
  - `<name>.stl` — output lattice mesh (ASCII STL)
  - `<name>.igs` — output IGES surface file
- `302` redirect to `/` if the token is missing, invalid, or already consumed.

> **Token is single-use.** It is removed from the server cache on first redemption.  
> The zip filenames vary by operation:
> - CROSS → `MSRevolv.stl` / `MSRevolv.igs`
> - DIAGONAL → `MSExtrd.stl` / `MSExtrd.igs`
> - CROSS_DIAGONAL → `MSRuled.stl` / `MSRuled.igs`

---

## Socket.IO Events

### Client → Server

#### `calculate`
Triggers a full lattice generation from an uploaded STL surface.

> **React frontend:** call `socket.calculate(payload)` on the `LatticeSocketClient` singleton.  
> TypeScript type: `CalculatePayload` in `react_frontend/src/api/types.ts`.

**Payload:**
```jsonc
{
  "filename": "mypart.stl",          // original filename, used as output basename
  "stl_text_b64": "<base64 string>", // base64-encoded STL file content
  "binary": false,                   // optional: true if the STL is binary format
  "client_ts": 1234567890.123,       // performance.now() timestamp, used for round-trip timing
  "args": {
    "tileType": "cross",             // "cross" | "diagonal" | "cross_diagonal"
    "nt1": 20,                       // tile count X (integer)
    "nt2": 20,                       // tile count Z (integer)
    "nt3": 1,                        // scale/spacing (integer, cast from float)
    "g1": 2.0,                       // grading amplitude (float)
    "g2": 0.2                        // grading frequency (float)
  }
}
```

**Tile type → DLL operation mapping:**

| `tileType` value  | DLL function called        | Output filenames              |
|-------------------|----------------------------|-------------------------------|
| `"cross"`         | `MSDLLMSFromRevolution`    | `MSRevolv.stl`, `MSRevolv.igs` |
| `"diagonal"`      | `MSDLLMSFromExtrusion`     | `MSExtrd.stl`, `MSExtrd.igs`  |
| `"cross_diagonal"`| `MSDLLMSFromRuling`        | `MSRuled.stl`, `MSRuled.igs`  |

> Note: `nt1`/`nt2`/`nt3` and `g1`/`g2` are extracted but the current DLL calls
> use hardcoded internal values — these parameters are wired up but not yet forwarded.

**Server responds with two sequential `result` emissions** (see below).

---

#### `calculate_tile`
Generates a standalone tile preview (no surface input needed).

> **React frontend:** call `socket.calculateTile(payload)`.  
> TypeScript type: `CalculateTilePayload` in `react_frontend/src/api/types.ts`.

**Payload:**
```jsonc
{
  "type": "diagonal",          // "cross" | "diagonal" | "cross_diagonal"
  "values": [0.2, 0.1, 0.4]   // [p1, p2, p3] — tile shape parameters
}
```

**Server responds with one `result` emission** containing the tile STL.

---

### Server → Client

#### `result`
Sent by the server after both `calculate` and `calculate_tile`.

> ⚠️ **`calculate` emits `result` twice in sequence:**
> - **First emission** — contains the STL mesh data and timings.
> - **Second emission** — contains the download token only (no STL data).  
> The client must check for the presence of `stl_gz_b64` to tell them apart.
>
> **React frontend:** this is handled automatically by `LatticeSocketClient`. Both emissions  
> are normalized into a single `ResultPayload` discriminated union (`kind: 'stl' | 'token'`).  
> Subscribe via `socket.onResult(handler)` — no raw event string or shape-checking needed.  
> TypeScript types: `STLResult`, `TokenResult`, `ResultPayload` in `react_frontend/src/api/types.ts`.

**First emission (STL data):**
```jsonc
{
  "filename": "mypart_reduced.stl",
  "stl_gz_b64": "<base64(gzip(ascii-stl))>",  // gzip-compressed ASCII STL, base64-encoded
  "timings": {
    "client_to_server_ms": 42.1,   // round-trip send time (null if client_ts not provided)
    "time_processed_ms": 310.5,    // DLL computation time
    "time_compress_ms": 5.2,       // gzip time
    "time_parsed_ms": 0.1,
    "overall_ms": 380.0            // wall time from event receipt to emit
  },
  "args_echo": { /* original args object echoed back */ }
}
```

**Second emission (download token), only for `calculate`:**
```jsonc
{
  "filename": "mypart.stl",
  "download_token": "550e8400-e29b-41d4-a716-446655440000"  // UUID v4
}
```

**`calculate_tile` emission:**
```jsonc
{
  "filename": "<path to tile stl on server>",
  "stl_gz_b64": "<base64(gzip(ascii-stl))>",
  "timings": {
    "client_to_server_ms": 0,
    "time_processed_ms": 310.5,
    "time_compress_ms": 5.2,
    "time_parsed_ms": 0.1,
    "overall_ms": 380.0
  }
}
```

---

#### `log_update`
Emitted continuously to all clients by the background log-tail thread.  
Also emitted to a newly connecting client with the last 50 log lines.

**Payload:**
```jsonc
{ "data": "2026-04-25 12:00:00 INFO some log line" }
```

---

#### `log_error`
Emitted when the log-tail thread cannot read the log file.

**Payload:**
```jsonc
{ "data": "Log file 'lattice.log' not found during tailing." }
```

---

#### `error`
Emitted when a server-side error occurs during `calculate` or file I/O.

**Payload** (two inconsistent shapes exist in the code):
```jsonc
{ "msg": "No STL payload" }
// or
{ "message": "Error: STL ascii file not found at ..." }
```

> **React frontend:** both shapes are normalized to `ErrorPayload { message: string }` inside  
> `LatticeSocketClient.onError()`. Components always receive a single consistent type.

---

## Session Lifecycle

| Event        | Server action                                                                 |
|--------------|-------------------------------------------------------------------------------|
| `connect`    | Assigns `request.sid`; spawns per-client worker thread; starts log-tail thread (once) |
| `disconnect` | Deletes `last_results/<sid>/` folder; removes client from connected_clients map |

---

## Known Quirks

- **Double `result` emit**: The `calculate` handler emits `result` twice. The client must branch on whether `stl_gz_b64` is present. *(Handled automatically by `LatticeSocketClient`.)*
- **`tile_generated` event does not exist on the server.** The server emits `result` for tile responses too. The legacy frontend's `socket.on('tile_generated', …)` listener is dead code. *(Not present in the React client.)*
- **`nt1`/`nt2`/`nt3`/`g1`/`g2` not forwarded to DLL** — the current implementation routes by tile type only and uses hardcoded parameters inside `do_revolution`, `do_extrusion`, `do_Ruling`.
- **Static tile STL files** (`/static/tiles/TileCross.stl`, etc.) are served directly for the intro animation — these are not generated at runtime.

---

## React API Layer

The React frontend (`react_frontend/`) must not reference raw event strings or raw payload shapes directly. All communication goes through `react_frontend/src/api/`:

| File | Responsibility |
|------|---------------|
| `types.ts` | Single source of truth for all payload TypeScript interfaces |
| `socketClient.ts` | `LatticeSocketClient` class — typed emit methods, normalized event handlers, unsubscribe functions for `useEffect` cleanup |
| `httpClient.ts` | `downloadResults(token)` — replaces the legacy HTML form POST |
| `index.ts` | Barrel export — `import { getLatticeSocket, downloadResults } from '../api'` |

**Usage pattern in a React component:**
```tsx
import { getLatticeSocket, type ResultPayload } from '../api';

useEffect(() => {
  const socket = getLatticeSocket();
  const unsub = socket.onResult((payload: ResultPayload) => {
    if (payload.kind === 'stl') { /* render mesh */ }
    if (payload.kind === 'token') { /* show download button */ }
  });
  return unsub; // cleanup on unmount
}, []);
```