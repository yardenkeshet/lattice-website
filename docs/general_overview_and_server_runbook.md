# Lattice Maker Server Runbook

Last updated: 2026-10-15

## Overview

Lattice Maker (<https://lattice.cs.technion.ac.il>) runs as two processes behind nginx. nginx serves the built React app as static files and forwards Socket.IO and API calls to the Flask backend on port 5003. The Vite dev server (`npm run dev`) is **not** part of production.

```
                                      files  ┌───────────────────────────────┐
                                   ┌───────► │ React build (dist folder)     │
┌──────────┐  HTTPS  ┌───────────┐ │         │ /, /tool, /assets, other pages│
│ Browser  │ ──────► │ nginx :443│─┤         └───────────────────────────────┘
└──────────┘         └───────────┘ │  proxy  ┌───────────────────────────────┐
                                   └───────► │ Flask + Socket.IO :5003       │
                                             │ /socket.io, API, MSDLL64.dll  │
                                             └───────────────────────────────┘
```

Only nginx faces the internet. Page files come straight from disk; live calculation traffic goes to Flask.

| Part | Folder | Port | What runs it |
| --- | --- | --- | --- |
| nginx (HTTPS, both sites) | `C:\SitesHub\nginx-1.28.2` | 443 | `start nginx` |
| Flask + Socket.IO backend | `C:\SitesHub\prodution\LatticeMaker\lattice-website` | 5003 (localhost only) | `python main.py` |
| React frontend (static build) | `...\lattice-website\react_frontend\dist` | served by nginx | `npm run build` (once per change) |
| TLS certificate + key | `C:\SitesHub\prodution\lattice_p\cert.pem`, `key_nopass.key` | | referenced by nginx.conf |

What nginx sends where, for `lattice.cs.technion.ac.il`:

| URL path | Goes to |
| --- | --- |
| `/socket.io/` | Flask on 127.0.0.1:5003 (WebSocket upgrade) |
| `/convert_igs_to_obj`, `/download-results`, `/log-calculation`, `/calc-log-image`, `/viewlog`, `/viewfulllog`, `/static` | Flask on 127.0.0.1:5003 |
| `/assets/...` | files in `dist/assets` (cached 1 year; names are hashed) |
| everything else (`/`, `/tool`, ...) | files in `dist`, falling back to `dist/index.html` so React routing works |

The source code is on GitHub: `https://github.com/yardenkeshet/lattice-website.git`. Production runs the `main` branch.

## Everyday operations

The site is up when nginx is running and `python main.py` is running. Nothing else needs to stay open. Use a normal CMD window for these commands.

**Check what is running**

```
tasklist /fi "imagename eq nginx.exe"
netstat -ano | findstr "LISTENING" | findstr ":443 :5003"
```

You should see two `nginx.exe` processes and listeners on ports 443 and 5003.

**Start the site**

1. Start nginx if it is not running:

   ```
   cd C:\SitesHub\nginx-1.28.2
   start nginx
   ```

2. Start the backend in its own CMD window and leave it open:

   ```
   cd C:\SitesHub\prodution\LatticeMaker\lattice-website
   python main.py --host 127.0.0.1
   ```

   `--host 127.0.0.1` means only nginx can reach port 5003. You can put `BACKEND_HOST=127.0.0.1` in `.env` instead.

3. Open <https://lattice.cs.technion.ac.il> and load the Tool page.

**Stop or restart the backend**: press Ctrl+C in its CMD window, then run `python main.py --host 127.0.0.1` again. If the window is lost, find the PID with `netstat -ano | findstr :5003` and run `taskkill /pid <PID> /f`.

**Stop or reload nginx** (run from `C:\SitesHub\nginx-1.28.2`): `nginx -s reload` applies config changes without dropping the site; `nginx -s stop` stops it. Reload or stop affects the CDML site too.

## After changing something

What you must redo depends on what changed. Pull the code first (`git pull` in `lattice-website`).

| What changed | What to do | Downtime |
| --- | --- | --- |
| React code (`react_frontend/src`, `public`, `.env.production`) | `cd react_frontend`, then `npm install` if `package.json` changed, then `npm run build` | None; nginx serves the new `dist` at once. Users refresh the page. |
| Python backend (`main.py`, `*.py`, `gershon\MSDLL64.dll`) | `pip install -r requirements.txt` if it changed, then restart `python main.py` | A few seconds; open sessions reconnect |
| nginx.conf | `nginx -t`, then `nginx -s reload` (from `C:\SitesHub\nginx-1.28.2`) | None if `-t` passed |
| TLS certificate | Replace the files in `C:\SitesHub\prodution\lattice_p`, then `nginx -t` and `nginx -s reload` | None |
| New Flask HTTP route | Add the path to the Flask `location ~ ^/(...)` line in nginx.conf, then reload nginx | None |

Two rules for the frontend build:

- Keep `VITE_BACKEND_URL` blank in `react_frontend/.env.production`. Blank means the browser talks to the same address that served the page, and nginx forwards it. A `localhost` value would point each visitor at their own computer.
- If `npm run build` fails, the old `dist` folder may be left half-written. Fix the error and build again before telling users the site is updated.

## When the site is down

The symptom usually tells you which part failed. Work down this list.

| Symptom in the browser | Likely cause | Fix |
| --- | --- | --- |
| Page does not load at all, or a connection error | nginx not running, or port 443 blocked | `tasklist /fi "imagename eq nginx.exe"`; if empty, `start nginx` from `C:\SitesHub\nginx-1.28.2`. Check `logs\error.log` if it exits right away. |
| `502 Bad Gateway` on `/`, `/tool` | nginx.conf still points `location /` at the Vite dev server (port 5173) | Use the reference config below (`root ...\dist` + `try_files`), then `nginx -t` and `nginx -s reload` |
| `404` or `403` on `/` | `react_frontend\dist` missing or empty | `cd react_frontend`, `npm install`, `npm run build` |
| Page loads but nothing calculates, or "disconnected" | Flask backend not running | `netstat -ano \| findstr :5003`; if nothing, start `python main.py --host 127.0.0.1` and read its output for errors |
| `502` only on `/socket.io/` or downloads | Backend crashed or is on another port | Restart the backend; check `BACKEND_PORT` in `.env` matches the 5003 in nginx.conf |
| Upload fails with `413` | File larger than `client_max_body_size` | Keep it at `100M` in the lattice server block |
| Browser certificate warning | Certificate expired or wrong file | Replace the files in `lattice_p`, then reload nginx |
| `start nginx` does nothing, `bind() ... failed` in error.log | Another program holds port 443 or 80 | `netstat -ano \| findstr :443`, then `tasklist /fi "pid eq <PID>"` to see who; `taskkill /f /im nginx.exe` clears stuck nginx copies |

Quick end-to-end check from the server itself, in CMD or PowerShell. Type `curl.exe`, not `curl`: in PowerShell plain `curl` is an alias for Invoke-WebRequest and fails.

```
curl.exe -sk -o NUL -w "%{http_code}" https://lattice.cs.technion.ac.il/
curl.exe -sk -o NUL -w "%{http_code}" "https://lattice.cs.technion.ac.il/socket.io/?EIO=4&transport=polling"
```

Both should print `200`.

After a reboot nothing starts by itself. Start nginx and the backend as in Everyday operations.

## Setting up a new server

A new Windows server needs four installs, a clone, a build and an nginx block. The DNS name `lattice.cs.technion.ac.il` must point at the new machine, and ports 80 and 443 must be open in its firewall.

1. **Install the tools**
   - Python 3.12 or newer (tick "Add to PATH")
   - Node.js 24 LTS (includes npm)
   - Git
   - nginx for Windows: unzip `nginx-1.28.2.zip` to `C:\SitesHub\nginx-1.28.2`
2. **Get the code**

   ```
   mkdir C:\SitesHub\prodution\LatticeMaker
   cd C:\SitesHub\prodution\LatticeMaker
   git clone https://github.com/yardenkeshet/lattice-website.git
   cd lattice-website
   ```

3. **Backend dependencies**

   ```
   python -m venv .venv
   .\.venv\Scripts\python.exe -m pip install -r requirements.txt
   ```

   `gershon\MSDLL64.dll` comes with the repo; no C++ build is needed.
4. **Backend settings**: create `.env` in `lattice-website` with:

   ```
   BACKEND_PORT=5003
   BACKEND_HOST=127.0.0.1
   ```

5. **Build the frontend**

   ```
   cd react_frontend
   npm install
   npm run build
   ```

   Check `react_frontend\.env.production` has `VITE_BACKEND_URL=` blank.
6. **Certificate**: copy `cert.pem` and `key_nopass.key` to `C:\SitesHub\prodution\lattice_p`. The key must have no passphrase, because nginx on Windows cannot prompt for one.
7. **nginx**: paste the reference server block (next section) inside the `http { }` block of `C:\SitesHub\nginx-1.28.2\conf\nginx.conf`. Fix the `root` path if the repo lives elsewhere.
8. **Start nginx**

   ```
   cd C:\SitesHub\nginx-1.28.2
   nginx -t
   start nginx
   ```

9. **Start the backend (python main.py)** in its own window and leave it open:

   ```
   cd C:\SitesHub\prodution\LatticeMaker\lattice-website
   .\.venv\Scripts\python.exe main.py --host 127.0.0.1
   ```

   No venv on this machine? Use `python main.py --host 127.0.0.1` instead. The site does not work until this is running.
10. **Test**: run the curl checks from When the site is down, then do one real calculation on the Tool page.

Optional: to survive reboots without someone logging in, register nginx and the backend as Windows services (for example with NSSM) or as Task Scheduler tasks set to "At startup".

## Reference nginx config

This is the server block live on 2026-10-15 in `C:\SitesHub\nginx-1.28.2\conf\nginx.conf`. The previous version is saved as `nginx.conf.bak-2026-10-15`.

```nginx
server {
    listen 443 ssl;
    server_name lattice.cs.technion.ac.il;

    ssl_certificate "C:/SitesHub/prodution/lattice_p/cert.pem";
    ssl_certificate_key "C:/SitesHub/prodution/lattice_p/key_nopass.key";

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Matches SocketIO's max_http_buffer_size in main.py
    client_max_body_size 100M;

    # Production build of the React app (npm run build in react_frontend)
    root "C:/SitesHub/prodution/LatticeMaker/lattice-website/react_frontend/dist";
    index index.html;

    # React SPA: unknown paths (e.g. /tool) fall back to index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Vite's hashed bundles never change content under the same name
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Socket.IO -> Flask (5003)
    location /socket.io/ {
        proxy_pass http://127.0.0.1:5003;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_buffering off;
    }

    # Flask HTTP routes (see main.py)
    location ~ ^/(convert_igs_to_obj|download-results|log-calculation|calc-log-image|viewlog|viewfulllog|static)(/|$) {
        proxy_pass http://127.0.0.1:5003;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 600s;
    }
}
```

Optional: add a port-80 block that redirects plain `http://` visitors to HTTPS:

```nginx
server {
    listen 80;
    server_name lattice.cs.technion.ac.il;
    return 301 https://$host$request_uri;
}
```

## nginx commands

Run these from `C:\SitesHub\nginx-1.28.2`. The `-s` commands only work while nginx is running.

| Command | What it does |
| --- | --- |
| `start nginx` | Start nginx in the background |
| `nginx -t` | Test nginx.conf for errors; always run before a reload |
| `nginx -s reload` | Apply config changes without dropping connections |
| `nginx -s stop` | Stop now |
| `nginx -s quit` | Stop after current requests finish |
| `nginx -v` | Show the version |
| `tasklist /fi "imagename eq nginx.exe"` | Is nginx running? (expect 2 processes) |
| `taskkill /f /im nginx.exe` | Force-kill all nginx copies (when `-s stop` fails) |

| File | Path |
| --- | --- |
| Config | `conf\nginx.conf` |
| Access log | `logs\access.log` |
| Error log | `logs\error.log` |
| PID file | `logs\nginx.pid` |

## CDML site

The same nginx also serves <https://cdml-public.technion.ac.il>. It forwards everything to a Python app on port 8444, so reloading or stopping nginx affects both sites.

| | |
| --- | --- |
| Folder | `C:\SitesHub\prodution\imageTechnion_p` |
| Start | `cd C:\SitesHub\prodution\imageTechnion_p`, then `python app.py` |
| Port | 8444 (nginx proxies 443 to it) |
| Certificate | `Cert_cdml.pem` and `private_nopass_cdml.pem` in the same folder |

## Logs

The backend log is the first place to look when calculations fail.

| Log | Location | How to view |
| --- | --- | --- |
| Backend (rotating, 5 MB x 3, kept across restarts; oldest part overwritten at the cap) | `lattice-website\lattice.log` (+ `.1`-`.3` backups) | Browser: [/viewlog](https://lattice.cs.technion.ac.il/viewlog) (opens on the last 7 days, then streams live) or [/viewfulllog](https://lattice.cs.technion.ac.il/viewfulllog) |
| Calculation history | `lattice-website\calc_log\log.jsonl` and `calc_log\images` | Any text viewer, or the same `/viewlog` / `/viewfulllog` pages (merged in) |
| nginx errors | `C:\SitesHub\nginx-1.28.2\logs\error.log` | Any text viewer |
| nginx requests | `C:\SitesHub\nginx-1.28.2\logs\access.log` | Any text viewer |

Desktop viewers for large logs:

- **toolong** (terminal): `pip install toolong`, then `tl lattice.log`
- **Tailviewer** (Windows app): [kittyfisto.github.io/Tailviewer](https://kittyfisto.github.io/Tailviewer/)
- **Log Voyager** (in the browser, opens a local file): [logvoyager.cc](https://www.logvoyager.cc/)

### In-browser log viewer — `/viewlog` and `/viewfulllog`

With the backend running (production or local — `python main.py` on `:5003`), open:

- **`/viewlog`** — "Live" view. Shows the last 150 lines, then streams new lines in real time over the same Socket.IO connection the lattice tool uses. Defaults to hiding `DEBUG` lines and collapsing exception tracebacks, since it's meant for watching things as they happen.
- **`/viewfulllog`** — "Full Detail" view. Same live stream, just defaulted to show every level (including `DEBUG`) and expand exception tracebacks — use it when digging into exactly what happened around a specific failure.

Both pages link to each other ("Full detail →" / "← Surface view"). From the Tool page, **Ctrl+Shift+L** is a hidden shortcut straight to `/viewlog` (see `isLogViewerShortcut` in `react_frontend/src/lib/logViewerShortcut.ts`).

**What the lines mean.** Every log line is one JSON object (`{"ts", "level", "msg", ...}`, see `_JsonFormatter` in `main.py`), rendered by the viewer as a timestamp, a colored level badge, and the message. Two kinds of lines carry extra context:

- Lines tied to a browser session carry `sid` (Socket.IO session id) and `ip` — shown as a small pill next to the message. Most `[CALC]`, `[TILE]`, `[DOWNLOAD]` lines have one; use the search box to filter to a single session's activity.
- Calculation-history lines (written by the separate `calc_logger`, prefixed `[CALC_LOG]`) carry a thumbnail `image`, the uploaded `filename`, and the full parameter set (`tileType`, `calcMode`, tile counts, grading, shape params) — rendered inline with a small preview image. These come from `calc_log/log.jsonl` / `calc_log/images`, a separate file from `lattice.log`, but the viewer streams and displays both together.
- The bracketed tag at the start of a message (`[CALC]`, `[TILE]`, `[DOWNLOAD]`, `[CALC_LOG]`, `[TMP]`, `[UNCAUGHT]`, ...) identifies which part of the backend logged it — group by `[TAG]` in the viewer's "Group by" dropdown to see one subsystem's lines together.

A successful calculation logs three `[CALC]` info lines: `Request` (file, client IP, mode and all parameters), `Engine start` (dispatch function, input size, and where the upload was saved under `client_data/`), and `Done` (result size, total/engine/compression times, download token). The engine's own progress callbacks stream through as `update` Socket.IO events (not log lines), and the download is logged as `[DOWNLOAD]`. Silent macro-shape previews log the same three steps as `[CALC preview]` at `debug` level. If a calculation fails, the error-level `[CALC]` line names which step it failed at and the calculation mode.

### Logs during local development

Nothing about the logs is production-only — running `python main.py` locally writes the same `lattice.log` and `calc_log/` next to it in the repo root, and `/viewlog` / `/viewfulllog` work the same way at `http://localhost:5003/viewlog`. This is usually the fastest way to see what the backend did with a given upload while developing, without reading `lattice.log` directly.

## Testing

Three independent layers, each runnable on its own; `run_all_tests.sh` (repo root) runs all of them in sequence and prints one pass/fail summary. These are development-only — production doesn't run tests, it runs the built/installed app.

| Layer | Command | Needs running? |
| --- | --- | --- |
| Backend (pytest) | `.venv/Scripts/python -m pytest tests/ -v` | Nothing — self-contained. **Don't run alongside `python main.py`**: every pytest run re-copies the background-lane DLL at import time, which collides with a live server's own copy of the same file. `run_all_tests.sh` detects a listener on `:5003` and skips this layer with a message instead of failing confusingly. |
| Frontend unit (vitest) | `cd react_frontend && npx vitest run --project unit` | Nothing — self-contained (jsdom). |
| End-to-end (Playwright) | `cd react_frontend && npx playwright test` | Both `python main.py` (`:5003`) and `npm run dev` (`:5173`), already running in two other terminals. First time only: `npx playwright install chromium` to download the browser binary. |

**To get every layer to actually run in one sitting:** run `./run_all_tests.sh` once with the backend stopped (covers backend + frontend-unit), then start `python main.py` and `npm run dev` and run it again (covers end-to-end; the other two layers just re-run quickly alongside it, which is harmless).

Two tests are slower than the rest because they exercise the real native DLL instead of a mock — expect `tests/test_real_dll_sanity.py` and `react_frontend/e2e/happy-path.spec.ts` to each take several real seconds. All layers are expected to be fully green; a failure in `httpClient.test.ts` or `socketClient.test.ts` specifically is a known-clean area with no accepted failures on file, so treat one there as a real regression.

### What's covered, by file

Backend (`tests/`), pytest:

| File | Covers |
| --- | --- |
| `test_calc_queue.py` | `CalcQueueManager` in isolation — FIFO order, waiting-room capacity, position recompute, one-job-at-a-time, worker surviving a job that raises |
| `test_calculate_queue_integration.py` | The queue wired into the real `calculate` Socket.IO flow |
| `test_convert_igs_to_obj_queue.py` | `/convert_igs_to_obj` goes through the same DLL-slot queue as `calculate`/`calculate_tile` and always releases it |
| `test_dll_instance.py` | `DllInstance` — tile generation, DLL errors surfaced without raising, two independently-loaded instances get distinct handles, progress-emit gating by sid |
| `test_dll_lane.py` | `BackgroundDllLane` locking primitive on its own — exclusivity, blocking acquire, timeout |
| `test_http_routes.py` | HTTP routes: `/`, `/viewlog`, `/viewfulllog`, `/calc-log-image/<name>`, `/download-results` |
| `test_logging_safety_net.py` | Logging itself — `extra=` fields reach the JSON formatter, uncaught exceptions in HTTP and Socket.IO handlers get logged (and HTTP ones still return 500), normal 404/405s aren't hijacked by the error handler |
| `test_real_dll_sanity.py` | The one test that does **not** monkeypatch the DLL — exercises the real `gershon/MSDLL64.dll`, the real queue, and a real download end to end |
| `test_upload_persistence.py` | Saved-upload audit trail — exact bytes written, no filename collisions, path-traversal rejected, forged `saved_input_paths` rejected |

Frontend unit (`react_frontend/src/**/__tests__/`), vitest:

| File | Covers |
| --- | --- |
| `api/__tests__/httpClient.test.ts` | `downloadResults()`, `convertIgsToObj()`, `logCalculation()` |
| `api/__tests__/socketClient.test.ts` | `LatticeSocketClient` — `onResult()`, `onError()`, `onQueueStatus()`, `onQueueRejected()`, and the rest of the typed event wrappers |
| `lib/__tests__/cameraFit.test.ts` | Perspective/orthographic camera-fit math, and converting between the two zoom representations |
| `lib/__tests__/displayedLayers.test.ts` | `computeDisplayedLayers` — which mesh layers are shown for a given state |
| `lib/__tests__/logViewerShortcut.test.ts` | The keyboard shortcut that opens `/viewlog` from the tool page |
| `lib/__tests__/obj.test.ts` | `objGroupToGeometry()` — parsing/merging OBJ layers into one `BufferGeometry` |
| `lib/__tests__/progressDisplay.test.ts` | Progress-overlay phrase cycling and the calc-queue status label |

A fourth vitest project, `storybook` (`npx vitest run --project storybook`), runs every `components/ui/*.stories.tsx` file as a headless-browser interaction test. It's not part of `run_all_tests.sh` or the three layers above, but it's there for component-level regressions.

End-to-end (`react_frontend/e2e/`), Playwright, against the real running app:

| File | Covers |
| --- | --- |
| `app-loads.spec.ts` | Home page and Tool page load with no console errors |
| `error-path.spec.ts` | Clicking "Make Lattice" without an uploaded file shows a visible error |
| `happy-path.spec.ts` | Full real pipeline: upload a surface, calculate, export — the slow one, see above |
| `log-viewer.spec.ts` | `/viewlog` and `/viewfulllog` render and cross-navigate correctly |

## Adding new tile types and calculation modes

The DLL binding lives in `dll_instance.py`, and `main.py` dispatches to it on the backend; on the frontend, everything is configured in one place, `calculation_params.ts`. There's an easy path for most new calculation modes, and a slightly longer one if the DLL function's signature doesn't match the existing pattern (extra parameters, extra surfaces, etc. — see Ruling and Extrusion below for examples of that).

### Backend

#### Adding a new tile type

Tile types don't need a new dispatch path — every calculation mode calls the same `MSDLLGetTile` / `MSDLLMSFrom*` functions with a `tile_type` integer and a fixed-size `tile_params` array, so adding a tile type is just:

1. Have the DLL support a new tile enum value (this is a DLL-side change — see `gershon/Interface.h`).
2. In `main.py`, add the new enum constant and map it, next to the existing ones:

```python
MSDLL_TILE_CROSS          = 0
MSDLL_TILE_DIAGONAL       = 1
MSDLL_TILE_CROSS_DIAGONAL = 2
MSDLL_TILE_NEW_TILE       = 3

TILE_TYPE_MAP = {
    "cross":          MSDLL_TILE_CROSS,
    "diagonal":       MSDLL_TILE_DIAGONAL,
    "cross_diagonal": MSDLL_TILE_CROSS_DIAGONAL,
    "new_tile":       MSDLL_TILE_NEW_TILE,
}
```

The string key (`"new_tile"`) is what the frontend sends as `tileType` — it must match the key you add to `TILE_DEFS` in `calculation_params.ts` (see Frontend below) exactly.

If the new tile type needs a different *number* of shape parameters, no server change is needed: the frontend sends them as the `tileParams` array (`values` for `calculate_tile`) of any length, and `parse_tile_params()` in `main.py` turns it into a `c_double` array of the same length for the DLL's `double *TileParams`. Lists shorter than `MIN_TILE_PARAMS` (3) are padded with zeros, so raise that constant if a tile type ever reads more values than the frontend might send.

#### Adding a new calculation mode

Calculation modes map to DLL surface functions (`MSDLLMSFromRuling`, `MSDLLMSFromRevolution`, `MSDLLMSFromExtrusion`, ...). Each one is bound once in `dll_instance.py` and dispatched once in `main.py`.

1. **Bind the DLL function** in `dll_instance.py`, inside `DllInstance.__init__` (set `restype`/`argtypes`) and as a thin wrapper method, following the existing ones:

```python
# in __init__:
self._dll.MSDLLMSFromNewMode.restype = c_char_p
self._dll.MSDLLMSFromNewMode.argtypes = [
    c_char_p, POINTER(c_int), POINTER(c_double), c_int,
    POINTER(c_double), c_char_p, c_char_p,
]

# as a method on DllInstance:
def from_new_mode(self, srf_igs: bytes, num_tiles, graded, tile_type, tile_params,
                   out_igs: bytes, out_obj: bytes):
    return _call(self._dll.MSDLLMSFromNewMode,
                 srf_igs, num_tiles, graded, tile_type, tile_params, out_igs, out_obj)
```

2. **Add the mode constant and a `do_...` function** in `main.py`, next to `do_revolution` / `do_extrusion` / `do_Ruling`:

```python
CALC_MODE_NEW_MODE = 'new_mode'

def do_new_mode(dll_instance, out_folder, igs_path, num_tiles, tile_params, grading_params, tile_type_int):
    out_igs = os.path.join(out_folder, "MSNewMode.igs").encode('ascii')
    out_obj = os.path.join(out_folder, "MSNewMode.obj").encode('ascii')
    dll_error = dll_instance.from_new_mode(
        igs_path.encode('ascii'), num_tiles, grading_params, tile_type_int, tile_params,
        out_igs, out_obj,
    )
    if dll_error:
        raise RuntimeError(dll_error)
    obj_content = read_obj_file(out_obj.decode('ascii'))
    return obj_content, "MSNewMode.obj", "MSNewMode.igs"
```

3. **Register it** — add the constant to `VALID_CALC_MODES`, and (if its arguments match the `do_revolution(dll_instance, out_folder, igs_path, num_tiles, tile_params, grading_params, tile_type_int)` shape — one surface, no extra params) add it to `CALC_MODE_DISPATCH`:

```python
VALID_CALC_MODES = {CALC_MODE_RULING, CALC_MODE_EXTRUSION, CALC_MODE_REVOLUTION, CALC_MODE_NEW_MODE}

CALC_MODE_DISPATCH = {
    CALC_MODE_REVOLUTION: do_revolution,
    CALC_MODE_NEW_MODE: do_new_mode,
}
```

   If your mode needs a different shape — e.g. a second surface file like Ruling, or an extra scalar like Extrusion's `extrude_length` — it won't fit the generic dispatch signature. Instead, add an explicit `elif calc_mode == CALC_MODE_NEW_MODE:` branch next to the Ruling/Extrusion ones in `_run_calculate_dll_phase()` (`main.py`), where you have full control over what gets passed in and read out of `payload`. If it needs a second surface file, also check `calc_mode == CALC_MODE_RULING` in the socket handler further up (`calculate`) — that's where the second file is required and base64-decoded; generalize that check to include your new mode too.

4. **Match the frontend.** The mode key (`'new_mode'`) must equal what the frontend sends as `calcMode` — add it to `CALC_MODE_DEFS` in `calculation_params.ts` (see Frontend below) with the matching key, and double-check `backend_api.md` once both sides are in sync.

### Frontend

All tile types and calculation modes are configured in one place: `react_frontend/src/calculation_params.ts`. You don't need to touch any UI components — `LatticeMenu`, `TileMenu`, and `TileCard` all read from these config objects.

#### Editing existing calculation modes
Go to `CALC_MODE_DEFS` in `calculation_params.ts` and adjust as you like:
```ts
[YOUR_MODE]: {
    label: 'Your Mode',
    requiredFilesCount: 1, // how many surface files this mode needs (2 for Ruling)
},
```

#### Adding a new calculation mode

Calculation modes map to the DLL surface functions (`MSDLLMSFromRuling`, `MSDLLMSFromRevolution`, `MSDLLMSFromExtrusion`). To add one:

1. Add a new string constant for the mode key in `react_frontend/src/lib/parameters.ts` (alongside `EXTRUSION`, `REVOLUTION`, `RULING`), and export it.
2. Add an entry to `CALC_MODE_DEFS` in `calculation_params.ts`:

```ts
[YOUR_MODE]: { label: 'Your Mode', requiredFilesCount: 1 },
```

- `label` — display name shown in the UI.
- `requiredFilesCount` — how many STL files the user must upload for this mode (e.g. `2` for Ruling, which needs two surfaces).

3. Make sure the corresponding backend handling exists — the mode key must match what `main.py` / `dll_instance.py` expect on the `calculate` socket event (see `backend_api.md`), and the Backend subsection above.

#### Adding a new tile type

Tile types correspond to the DLL's tile enum (`CROSS = 0`, `DIAGONAL = 1`, `CROSS_DIAGONAL = 2`). To add one:

1. Add the tile's preview image to `react_frontend/src/assets/TileTypes/` and import it at the top of `calculation_params.ts`:

```ts
import yourTileImg from './assets/TileTypes/your-tile.png'
```

2. Add a string constant for the tile key in `react_frontend/src/lib/parameters.ts` (alongside `CROSS`, `DIAGONAL`, `CROSS_DIAGONAL`), and export it.
3. Add an entry to `TILE_DEFS` in `calculation_params.ts`:

```ts
[YOUR_TILE]: {
    label: 'Your Tile',
    imageUrl: yourTileImg,
    sliders: [
        { label: 'Param Name', min: 0.0, max: 1.0, defaultValue: 0.5, step: 0.01 },
        // one entry per tile parameter, in the order the DLL/backend expects
    ],
},
```

- `sliders` defines both the UI (shown in `TileMenu`) and the parameter values sent to the backend in `calculateTile` calls — order matters and must match what the backend expects for this tile type.
- The tile key (`YOUR_TILE`) must match the string value the backend/DLL mapping expects (see `backend_api.md` for the tile type → DLL enum mapping, and the Backend subsection above).

#### Notes

- `CalcMode` and `TileType` are derived automatically from the keys of `CALC_MODE_DEFS` and `TILE_DEFS` (`keyof typeof ...`), so adding a new key automatically extends these types everywhere they're used — no manual type updates needed.
- `TileCard`, `TileMenu`, and `LatticeMenu` iterate over these records generically, so new tiles/modes appear in the UI automatically once added here.
- Double-check `backend_api.md` for the exact string values the backend expects for tile types and calculation modes — the frontend keys must match exactly.

## Windows helpers

| Command | What it shows |
| --- | --- |
| `netstat -ano \| findstr :443` | What is using port 443 (last column = PID) |
| `netstat -ano \| findstr :5003` | Is the Flask backend listening |
| `netstat -ano \| findstr LISTENING` | All listening ports |
| `netstat -an -p tcp` / `-p udp` | TCP or UDP connections only |
| `netstat -ab` | Connections with program names (run CMD as Administrator) |
| `tasklist /fi "pid eq 1234"` | Which program has PID 1234 |
| `taskkill /pid 1234 /f` | Kill PID 1234 |
| `ncpa.cpl` | Network adapters; Properties, then Internet Protocol Version 4 (TCP/IPv4) for the DMZ IP settings |

nginx also shows in Task Manager under Background processes.
