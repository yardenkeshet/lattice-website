# File Handling Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace filename-keyed, never-cleaned server-side file storage with stateless per-request file transfer and token-keyed ephemeral results; fix the broken two-surface ruling mode and the broken disconnect cleanup; add a permanent calculation-history log (PNG snapshot + params) integrated with the existing JSONL logging.

**Architecture:** The backend stops persisting uploaded surfaces between requests — every socket/HTTP call that needs a surface carries its bytes, which the backend writes to a short-lived temp file, feeds to the DLL, and deletes. Calculation results move from `sid`-keyed folders to `download_token`-keyed folders, with the previous token's folder retired only after a new calculation from the same session succeeds. A second, non-rotating JSONL logger (`calc_logger`) records every completed calculation's params + a frontend-captured canvas snapshot, reusing the existing log viewer's tailing mechanism.

**Tech Stack:** Flask + Flask-SocketIO + ctypes (backend, `main.py`), React + TypeScript + react-three-fiber (frontend, `react_frontend/`), Vitest (existing frontend test runner).

## Global Constraints

- No new Python dependencies — use only `os`, `uuid`, `base64`, `contextlib`, `tempfile`-style patterns already idiomatic in `main.py`.
- No new pytest harness — this backend has no existing test infrastructure (confirmed: no `pytest`, no Flask test client usage anywhere in the repo). Backend tasks are verified manually with `curl` (HTTP) and a `socket.io-client` Node script (Socket.IO events), per the design spec's Section 6.
- Frontend tasks that touch files with existing Vitest coverage (`src/api/httpClient.ts`, `src/api/socketClient.ts`) get real Vitest tests, matching existing conventions in `src/api/__tests__/`.
- Dead code/doc cleanup (`main_orig.py`, `lattice.py`, stale `.md` docs) is explicitly out of scope — do not touch these files.
- `client_data/`/`DATA_DIR` becomes fully unused by the end of this plan but its declaration (`main.py:227`, `main.py:232`) is left in place — removing it is cleanup, not part of this redesign.
- Sample IGS files for manual verification already exist in the repo: `Input/RevolveSrf.igs`, `Input/ExtrudeSrf.igs`, `Input/RuledSrf1.igs`, `Input/RuledSrf2.igs` (the latter two are genuinely different surfaces — use them to verify the ruling-mode fix).
- Spec reference: `docs/superpowers/specs/2026-06-21-file-handling-redesign-design.md`.

---

### Task 1: Stateless `/convert_igs_to_stl` (no more `client_data/` persistence)

**Files:**
- Modify: `main.py` (imports near line 1-24; `/convert_igs_to_stl` route, currently lines 775-809)

**Interfaces:**
- Produces: `temp_igs_file(igs_bytes: bytes)` — a context manager yielding a unique temp `.igs` file path under `tmp/`, deleted on exit. Reused by Task 2.
- Consumes: nothing new (uses existing `_dll_iges2stl`, `logger`).

- [ ] **Step 1: Add the `temp_igs_file` helper**

In `main.py`, add `import contextlib` to the import block at the top (after `import uuid`, line 11):

```python
import uuid
import contextlib
```

Then, directly above the `DOWNLOAD_CACHE = {}` line (currently line 384), add:

```python
TMP_DIR = 'tmp'
os.makedirs(TMP_DIR, exist_ok=True)


@contextlib.contextmanager
def temp_igs_file(igs_bytes: bytes):
    """Write igs_bytes to a uniquely-named temp .igs file; delete it on exit."""
    path = os.path.join(os.getcwd(), TMP_DIR, f"{uuid.uuid4().hex}.igs")
    with open(path, 'wb') as f:
        f.write(igs_bytes)
    try:
        yield path
    finally:
        try:
            os.remove(path)
        except OSError:
            logger.warning(f"[TMP] failed to remove temp file: {path}")
```

- [ ] **Step 2: Rewrite `/convert_igs_to_stl` to use it**

Replace the body of `handle_convert_igs_to_stl` (currently `main.py:775-809`):

```python
@app.route('/convert_igs_to_stl', methods=['POST'])
def handle_convert_igs_to_stl():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    igs_bytes = request.files['file'].read()

    try:
        with temp_igs_file(igs_bytes) as igs_path:
            stl_path = igs_path[:-4] + '_preview.stl'
            t_igs_start = time.time()
            err = _dll_iges2stl(igs_path.encode('ascii'), stl_path.encode('ascii'), 0.0)
            t_igs_ms = round((time.time() - t_igs_start) * 1000)
            if err:
                logger.warning(f"[IGS2STL] DLL warning: {err}")

            if not os.path.exists(stl_path):
                return jsonify({'error': 'IGS conversion produced no output'}), 500

            try:
                with open(stl_path, 'rb') as f:
                    stl_content = f.read()
            finally:
                try:
                    os.remove(stl_path)
                except OSError:
                    logger.warning(f"[TMP] failed to remove temp file: {stl_path}")

        b64_str = base64.b64encode(stl_content).decode('utf-8')
        logger.info(f"[IGS2STL] {len(stl_content) // 1024}KB  {t_igs_ms}ms")
        return jsonify({'stl_b64': b64_str})

    except Exception as exc:
        logger.exception(f"[IGS2STL] {exc}")
        return jsonify({'error': f'Internal server error: {exc}'}), 500
```

This removes all writes to `DATA_DIR`/`client_data/` — the IGS bytes and the converted preview STL both live only in `tmp/` for the duration of the request.

- [ ] **Step 3: Verify manually**

Start the backend (from the repo root, with the venv active):

```bash
python main.py
```

In another terminal:

```bash
curl -s -F "file=@Input/RevolveSrf.igs" http://localhost:5003/convert_igs_to_stl | head -c 200
```

Expected: a JSON object starting with `{"stl_b64":"c29s...` (base64 of an ASCII STL, which starts with `solid`).

Then confirm nothing was written to `client_data/`:

```bash
ls client_data/
```

Expected: only the pre-existing stray files from before this change (e.g. `none.json`, `PenroseDavid.stl`, etc.) — no new `RevolveSrf.igs` or `RevolveSrf_preview.stl` appears. Also confirm the temp file was cleaned up:

```bash
ls tmp/
```

Expected: empty (the temp `.igs` and `_preview.stl` were both removed after the request completed).

- [ ] **Step 4: Commit**

```bash
git add main.py
git commit -m "fix(backend): stop persisting uploaded IGS files for preview conversion"
```

---

### Task 2: Stateless `calculate` with token-keyed results and a real two-surface ruling fix

**Files:**
- Modify: `main.py` — `do_revolution`, `do_extrusion`, `do_Ruling`, `_dll_from_ruling`, `CALC_MODE_DISPATCH`, `handle_calculate`, `on_connect`, `on_disconnect`, `client_state` usage

**Interfaces:**
- Consumes: `temp_igs_file` from Task 1.
- Produces: `do_revolution(out_folder, igs_path, num_tiles, tile_params, grading_params, tile_type_int) -> (stl_content, out_stl_name, out_igs_name)`; same shape for `do_extrusion`; `do_Ruling(out_folder, igs_path, igs_path2, num_tiles, tile_params, grading_params, tile_type_int) -> (stl_content, out_stl_name, out_igs_name)`. `client_state[sid]['current_token']` — the result folder name currently valid for downloads from that session. This is what Task 9 (frontend) sends `surface_b64`/`surface2_b64` to.

- [ ] **Step 1: Remove the hardcoded second ruling surface**

Replace `_dll_from_ruling` (currently `main.py:184-190`):

```python
def _dll_from_ruling(srf1: bytes, srf2: bytes, num_tiles, graded, tile_type, tile_params,
                      out_igs: bytes, out_stl: bytes):
    logger.debug(f"[DLL] FromRuling srf1={srf1}  srf2={srf2}")
    return _call(_dll.MSDLLMSFromRuling,
                 srf1, srf2, num_tiles, graded, tile_type, tile_params, out_igs, out_stl)
```

- [ ] **Step 2: Change `do_revolution`/`do_extrusion`/`do_Ruling` to take a folder, not a token, and return filenames**

Replace `do_revolution` (currently `main.py:387-404`):

```python
def do_revolution(out_folder, igs_path, num_tiles, tile_params, grading_params, tile_type_int):
    out_igs = os.path.join(out_folder, "MSRevolv.igs").encode('ascii')
    out_stl = os.path.join(out_folder, "MSRevolv.stl").encode('ascii')
    _dll_from_revolution(
        igs_path.encode('ascii'),
        num_tiles, grading_params,
        tile_type_int,
        tile_params,
        out_igs, out_stl,
    )
    stl_content = read_ascii_stl_file(out_stl.decode('ascii'))
    return stl_content, "MSRevolv.stl", "MSRevolv.igs"
```

Replace `do_extrusion` (currently `main.py:407-432`):

```python
def do_extrusion(out_folder, igs_path, num_tiles, tile_params, grading_params, tile_type_int):
    out_igs = os.path.join(out_folder, "MSExtrd.igs").encode('ascii')
    out_stl = os.path.join(out_folder, "MSExtrd.stl").encode('ascii')
    result = _dll_from_extrusion(
        igs_path.encode('ascii'),
        10.0,
        num_tiles, grading_params,
        tile_type_int,
        tile_params,
        out_igs, out_stl,
    )

    if result == "First input file is not holding a polynomial Bezier surface.":
        logger.warning("[EXTRUSION] DLL failed — returning dummy STL")
        dummy_path = os.path.join(os.path.dirname(__file__), "last_results", "dummyResult.stl")
        stl_content = read_ascii_stl_file(dummy_path)
    else:
        stl_content = read_ascii_stl_file(out_stl.decode('ascii'))

    return stl_content, "MSExtrd.stl", "MSExtrd.igs"
```

Replace `do_Ruling` (currently `main.py:435-457`):

```python
def do_Ruling(out_folder, igs_path, igs_path2, num_tiles, tile_params, grading_params, tile_type_int):
    out_igs = os.path.join(out_folder, "MSRuled.igs").encode('ascii')
    out_stl = os.path.join(out_folder, "MSRuled.stl").encode('ascii')

    _dll_from_ruling(
        igs_path.encode('ascii'), igs_path2.encode('ascii'),
        num_tiles, grading_params,
        tile_type_int,
        tile_params,
        out_igs, out_stl,
    )

    stl_content = read_ascii_stl_file(out_stl.decode('ascii'))
    return stl_content, "MSRuled.stl", "MSRuled.igs"
```

`CALC_MODE_DISPATCH` (currently `main.py:460-464`) now only covers the two single-surface modes, since `do_Ruling` has a different signature (it needs a second path):

```python
CALC_MODE_DISPATCH = {
    CALC_MODE_EXTRUSION:  do_extrusion,
    CALC_MODE_REVOLUTION: do_revolution,
}
```

- [ ] **Step 3: Track each session's current result token**

In `on_connect` (currently `main.py:575-603`), the `state` dict built for `client_state[sid]` gains a `current_token` field. Change:

```python
    state = {
        "sid": sid,
        "tile_type": None, "p1": None, "p2": None, "p3": None,
        "event": threading.Event(),
    }
```

to:

```python
    state = {
        "sid": sid,
        "tile_type": None, "p1": None, "p2": None, "p3": None,
        "event": threading.Event(),
        "current_token": None,
    }
```

- [ ] **Step 4: Fix `on_disconnect` to clean up by token, not by the nonexistent `sid` key**

Replace `on_disconnect` (currently `main.py:624-629`):

```python
@socketio.on('disconnect')
def on_disconnect():
    sid = request.sid
    logger.info(f'Client disconnected  ip={_client_ip(sid)}', extra=_log_extra(sid))
    token = (client_state.get(sid) or {}).get('current_token')
    if token:
        DOWNLOAD_CACHE.pop(token, None)
    client_state.pop(sid, None)
    clean_session(sid, token)
```

`clean_session` (currently `main.py:614-621`) now removes the token-keyed folder instead of the old `sid`-keyed one:

```python
def clean_session(sid, token):
    connected_clients.pop(sid, None)
    if not token:
        return
    folder = os.path.join(os.getcwd(), LAST_RESULTS_DIR, token)
    try:
        if os.path.exists(folder):
            shutil.rmtree(folder)
    except Exception as exc:
        logger.exception(f"[SESSION] cleanup failed {folder}: {exc}")
```

- [ ] **Step 5: Rewrite `handle_calculate`**

Replace the whole handler (currently `main.py:632-758`) with:

```python
@socketio.on('calculate')
def handle_calculate(data):
    sid = request.sid
    t_start = time.time()

    client_ts    = data.get('client_ts')
    filename     = data.get('filename', 'uploaded.igs')
    args         = data.get('args', {})
    surface_b64  = data.get('surface_b64')
    surface2_b64 = data.get('surface2_b64')

    tile_type = args.get('tileType')
    calc_mode = args.get('calcMode')
    try:
        nt1 = int(args.get('nt1', 2))
        nt2 = int(args.get('nt2', 2))
        nt3 = int(args.get('nt3', 2))
        g1  = float(args.get('g1', 0.2))
        g2  = float(args.get('g2', 1.5))
        p1  = float(args.get('p1', 0.2))
        p2  = float(args.get('p2', 0.0))
        p3  = float(args.get('p3', 0.4))
    except (TypeError, ValueError) as exc:
        logger.exception(f"[CALC] Bad numeric argument: {exc}", extra=_log_extra(sid))
        emit('error', {'msg': f'Invalid numeric argument: {exc}'})
        return

    tile_type_int = TILE_TYPE_MAP.get(tile_type)
    logger.info(
        f"[CALC] {filename}  mode={calc_mode}  tile={tile_type}  tiles=({nt1},{nt2},{nt3})  g=({g1},{g2})  p=({p1:.2f},{p2:.2f},{p3:.2f})  ip={_client_ip(sid)}",
        extra=_log_extra(sid),
    )

    if tile_type_int is None:
        logger.error(f"[CALC] Unknown tileType: {tile_type!r}", extra=_log_extra(sid))
        emit('error', {'msg': f'Unknown tileType: {tile_type}'})
        return

    if calc_mode != CALC_MODE_RULING and calc_mode not in CALC_MODE_DISPATCH:
        logger.error(f"[CALC] Unknown calcMode: {calc_mode!r}", extra=_log_extra(sid))
        emit('error', {'msg': f'Unknown calcMode: {calc_mode}'})
        return

    if not surface_b64:
        logger.error("[CALC] No surface_b64 in payload", extra=_log_extra(sid))
        emit('error', {'msg': 'No surface file provided'})
        return
    try:
        igs_bytes = base64.b64decode(surface_b64)
    except (ValueError, TypeError) as exc:
        logger.exception(f"[CALC] Bad surface_b64: {exc}", extra=_log_extra(sid))
        emit('error', {'msg': f'Invalid surface data: {exc}'})
        return

    igs_bytes2 = None
    if calc_mode == CALC_MODE_RULING:
        if not surface2_b64:
            logger.error("[CALC] Ruling mode requires surface2_b64", extra=_log_extra(sid))
            emit('error', {'msg': 'Ruling mode requires a second surface file'})
            return
        try:
            igs_bytes2 = base64.b64decode(surface2_b64)
        except (ValueError, TypeError) as exc:
            logger.exception(f"[CALC] Bad surface2_b64: {exc}", extra=_log_extra(sid))
            emit('error', {'msg': f'Invalid second surface data: {exc}'})
            return

    curr_num_tiles   = (c_int * 3)(nt1, nt2, nt3)
    curr_graded      = (c_double * 2)(g1, g2)
    curr_tile_params = (c_double * 3)(p1, p2, p3)

    new_token  = str(uuid.uuid4())
    out_folder = os.path.join(os.getcwd(), LAST_RESULTS_DIR, new_token)
    os.makedirs(out_folder, exist_ok=True)

    t_dll_start = time.time()
    try:
        logger.info(f"[CALC] -> {calc_mode}  filename={filename}", extra=_log_extra(sid))
        with temp_igs_file(igs_bytes) as igs_path:
            if calc_mode == CALC_MODE_RULING:
                with temp_igs_file(igs_bytes2) as igs_path2:
                    stl_content, out_stl_name, out_igs_name = do_Ruling(
                        out_folder, igs_path, igs_path2,
                        curr_num_tiles, curr_tile_params, curr_graded, tile_type_int,
                    )
            else:
                dispatch_fn = CALC_MODE_DISPATCH[calc_mode]
                stl_content, out_stl_name, out_igs_name = dispatch_fn(
                    out_folder, igs_path, curr_num_tiles, curr_tile_params, curr_graded, tile_type_int
                )
    except FileNotFoundError as exc:
        logger.exception(f"[CALC] DLL output file not found: {exc}", extra=_log_extra(sid))
        emit('error', {'msg': f'DLL did not produce output file: {exc}'})
        shutil.rmtree(out_folder, ignore_errors=True)
        return
    except Exception as exc:
        logger.exception(f"[CALC] DLL call failed: {exc}", extra=_log_extra(sid))
        emit('error', {'msg': f'Processing error: {exc}'})
        shutil.rmtree(out_folder, ignore_errors=True)
        return

    t_dll_end = time.time()

    if not stl_content:
        logger.error("[CALC] No STL content produced after DLL call", extra=_log_extra(sid))
        emit('error', {'msg': 'No output produced by DLL'})
        shutil.rmtree(out_folder, ignore_errors=True)
        return

    try:
        t_comp_start = time.time()
        compressed_b64 = compress_text_to_b64_gz(stl_content)
        t_comp_end = time.time()
        comp_kb = len(base64.b64decode(compressed_b64)) / 1024
    except Exception as exc:
        logger.exception(f"[CALC] Compression failed: {exc}", extra=_log_extra(sid))
        emit('error', {'msg': 'Compression failed'})
        shutil.rmtree(out_folder, ignore_errors=True)
        return

    # Success — register the new result and retire the previous one for this session.
    DOWNLOAD_CACHE[new_token] = {'sid': sid, 'out_stl': out_stl_name, 'out_igs': out_igs_name}
    old_token = client_state.get(sid, {}).get('current_token')
    if old_token and old_token != new_token:
        DOWNLOAD_CACHE.pop(old_token, None)
        shutil.rmtree(os.path.join(os.getcwd(), LAST_RESULTS_DIR, old_token), ignore_errors=True)
    if sid in client_state:
        client_state[sid]['current_token'] = new_token

    t_total = time.time() - t_start
    timings = {
        'client_to_server_ms': None if client_ts is None else (t_dll_start * 1000 - client_ts),
        'time_dll_ms':         round((t_dll_end - t_dll_start) * 1000),
        'time_compress_ms':    round((t_comp_end - t_comp_start) * 1000),
        'overall_ms':          round(t_total * 1000),
    }

    emit('result', {
        'filename_reduced': os.path.splitext(os.path.basename(filename))[0] + '_reduced.stl',
        'kind':             'model_stl',
        'stl_gz_b64':       compressed_b64,
        'timings':          timings,
        'args_echo':        args,
        'filename':         filename,
        'download_token':   new_token,
    })

    logger.info(
        f"[CALC] done  {comp_kb:.0f}KB"
        f"  overall={timings['overall_ms']}ms"
        f"  dll={timings['time_dll_ms']}ms"
        f"  compress={timings['time_compress_ms']}ms"
        f"  token={new_token}",
        extra=_log_extra(sid),
    )
```

This drops the old `igs_disk_path`/`json_disk_path` disk-lookup block entirely (no more reading from `client_data/`), generates the result token before dispatch (so it can be used as the folder name), and only swaps `current_token` after the calculation has fully succeeded — so a failed calculation never destroys a session's last good downloadable result.

- [ ] **Step 6: Verify manually — single-surface mode**

Start the backend, then from `react_frontend/` run a small Node script using the already-installed `socket.io-client`:

```bash
cd react_frontend
node -e "
const { io } = require('socket.io-client');
const fs = require('fs');
const socket = io('http://localhost:5003');
socket.on('connect', () => {
  const igs = fs.readFileSync('../Input/RevolveSrf.igs').toString('base64');
  socket.emit('calculate', {
    filename: 'RevolveSrf.igs',
    client_ts: Date.now(),
    surface_b64: igs,
    args: { tileType: 'cross', calcMode: 'revolution', nt1: 2, nt2: 2, nt3: 2, g1: 0.2, g2: 1.5, p1: 0.2, p2: 0, p3: 0.4 },
  });
});
socket.on('result', (r) => { console.log('RESULT kind=', r.kind, 'token=', r.download_token, 'stl_len=', (r.stl_gz_b64||'').length); process.exit(0); });
socket.on('error', (e) => { console.error('ERROR', e); process.exit(1); });
setTimeout(() => { console.error('TIMEOUT'); process.exit(1); }, 15000);
"
```

Expected: `RESULT kind= model_stl token=<a uuid> stl_len=<some number > 0>`.

Then confirm the result folder exists and `tmp/` is empty again:

```bash
ls "../last_results/<the token printed above>"
ls ../tmp/
```

Expected: the folder contains `MSRevolv.stl` and `MSRevolv.igs`; `tmp/` is empty (temp input was cleaned up).

- [ ] **Step 7: Verify manually — ruling mode with two real, different surfaces**

Run the same kind of script, but with `calcMode: 'ruling'` and both surfaces:

```bash
cd react_frontend
node -e "
const { io } = require('socket.io-client');
const fs = require('fs');
const socket = io('http://localhost:5003');
socket.on('connect', () => {
  socket.emit('calculate', {
    filename: 'RuledSrf1.igs',
    client_ts: Date.now(),
    surface_b64: fs.readFileSync('../Input/RuledSrf1.igs').toString('base64'),
    surface2_b64: fs.readFileSync('../Input/RuledSrf2.igs').toString('base64'),
    args: { tileType: 'cross_diagonal', calcMode: 'ruling', nt1: 2, nt2: 2, nt3: 2, g1: 0.2, g2: 1.5, p1: 0.2, p2: 0, p3: 0.4 },
  });
});
socket.on('result', (r) => { console.log('RESULT kind=', r.kind, 'token=', r.download_token); process.exit(0); });
socket.on('error', (e) => { console.error('ERROR', e); process.exit(1); });
setTimeout(() => { console.error('TIMEOUT'); process.exit(1); }, 15000);
"
```

Expected: `RESULT kind= model_stl token=<a uuid>` — and critically, check `lattice.log` for the `[DLL] FromRuling` debug line and confirm `srf2=` now points at a path inside `tmp/` (the real uploaded `RuledSrf2.igs` content), not `C:\Users\yaniv\...`:

```bash
grep "FromRuling" ../lattice.log | tail -1
```

Expected: `srf2=` shows a `tmp/<uuid>.igs` path, not the old hardcoded `yaniv` path.

- [ ] **Step 8: Verify the disconnect cleanup fix**

With the backend running and `lattice.log` empty of recent `KeyError` tracebacks, run either script above to completion (it calls `process.exit(0)` which disconnects the socket), then check the log:

```bash
grep -i "keyerror\|Traceback" ../lattice.log | tail -5
```

Expected: no output — `on_disconnect` no longer raises. Then confirm the result folder for that token was removed:

```bash
ls ../last_results/
```

Expected: the token folder from the script run is gone (cleaned up on disconnect).

- [ ] **Step 9: Commit**

```bash
git add main.py
git commit -m "fix(backend): stateless calculate, token-keyed results, real ruling surfaces, fixed disconnect cleanup"
```

---

### Task 3: Ephemeral tile preview (`calculate_tile`)

**Files:**
- Modify: `main.py` — `calculate_tile` (currently `main.py:467-519`)

**Interfaces:**
- Consumes: `uuid`, `LAST_TILES_RESULTS_DIR` is no longer read from; uses `TMP_DIR` from Task 1.
- Produces: no change to the `calculate_tile`/`handle_calculate_tile` external behavior — same `result` event shape.

- [ ] **Step 1: Write to a temp file instead of a fixed shared filename**

Replace `calculate_tile` (currently `main.py:467-519`):

```python
def calculate_tile(tile_params, graded, tile_type_str, sid):
    t_recv = time.time()
    tile_type_int = TILE_TYPE_MAP.get(tile_type_str)
    if tile_type_int is None:
        logger.error(f"[TILE] Unknown tile type: {tile_type_str}", extra=_log_extra(sid))
        return

    stl_tile_path = os.path.join(os.getcwd(), TMP_DIR, f"tile_{uuid.uuid4().hex}.stl")
    _dll_get_tile(tile_type_int, tile_params, graded, stl_tile_path.encode('utf-8'))

    t_processed = time.time()
    if not os.path.exists(stl_tile_path):
        logger.error(f"[TILE] STL not found: {stl_tile_path}", extra=_log_extra(sid))
        return

    try:
        stl_content = read_ascii_stl_file(stl_tile_path)
        try:
            buf = BytesIO()
            with gzip.GzipFile(fileobj=buf, mode='wb') as gz:
                gz.write(stl_content.encode('utf-8'))
            compressed = buf.getvalue()
        except Exception:
            logger.exception("Tile compression failed", extra=_log_extra(sid))
            emit('error', {'msg': 'Compression failed'})
            return

        compressed_b64 = base64.b64encode(compressed).decode('ascii')
        t_done = time.time()
        timings = {
            'client_to_server_ms': 0,
            'time_processed_ms': (t_processed - t_recv) * 1000.0,
            'time_compress_ms': (t_done - t_processed) * 1000.0,
            'overall_ms': (t_done - t_recv) * 1000.0,
        }
        logger.info(
            f"[TILE] {tile_type_str}"
            f"  p=({tile_params[0]:.2f},{tile_params[1]:.2f},{tile_params[2]:.2f})"
            f"  g=({graded[0]:.2f},{graded[1]:.2f})"
            f"  {timings['overall_ms']:.0f}ms",
            extra=_log_extra(sid),
        )
        emit('result', {
            'filename': 'tile.stl',
            'kind': 'tile_stl',
            'stl_gz_b64': compressed_b64,
            'timings': timings,
        })
    finally:
        try:
            os.remove(stl_tile_path)
        except OSError:
            logger.warning(f"[TMP] failed to remove temp file: {stl_tile_path}")
```

Note the `filename` field in the emitted `result` changes from the old full server path (`last_tiles_results/TileCross.stl`) to a generic `'tile.stl'` — nothing in the frontend reads this field for tile results (confirmed: `TileSTLResult.filename` is part of the type but unused in `ToolPage.tsx`'s `onResult` handler), so this is safe.

- [ ] **Step 2: Verify manually**

With the backend running:

```bash
cd react_frontend
node -e "
const { io } = require('socket.io-client');
const socket = io('http://localhost:5003');
socket.on('connect', () => {
  socket.emit('calculate_tile', { type: 'diagonal', values: [0.2, 0.1, 0.4] });
});
socket.on('result', (r) => { console.log('RESULT kind=', r.kind, 'stl_len=', (r.stl_gz_b64||'').length); process.exit(0); });
socket.on('error', (e) => { console.error('ERROR', e); process.exit(1); });
setTimeout(() => { console.error('TIMEOUT'); process.exit(1); }, 15000);
"
```

Expected: `RESULT kind= tile_stl stl_len=<some number > 0>`. Then confirm nothing was left behind:

```bash
ls ../tmp/
ls ../last_tiles_results/
```

Expected: `tmp/` empty; `last_tiles_results/` unchanged from before the call (still only the pre-existing checked-in `TileCross.stl` etc., untouched/not modified by `git status`).

- [ ] **Step 3: Commit**

```bash
git add main.py
git commit -m "fix(backend): write tile previews to ephemeral temp files, not shared global filenames"
```

---

### Task 4: Calculation log — backend logger, snapshot upload endpoint, image route

**Files:**
- Modify: `main.py` — `_JsonFormatter` (currently `main.py:234-246`), logging setup block (currently `main.py:259-269`), HTTP routes section

**Interfaces:**
- Produces: `calc_logger` (a `logging.Logger`) writing JSONL to `calc_log/log.jsonl`; `CALC_LOG_DIR`, `CALC_LOG_IMAGES_DIR`, `CALC_LOG_FILE` constants; `POST /log-calculation` (multipart: `image` file + `metadata` JSON string field `{filename, args}`) → `{"ok": true}`; `GET /calc-log-image/<name>` → the PNG.
- Consumed by: Task 5 (streaming into `/viewlog`), Task 8 (frontend `logCalculation()`).

- [ ] **Step 1: Generalize `_JsonFormatter` to pass through more structured fields**

Replace `_JsonFormatter` (currently `main.py:234-246`):

```python
class _JsonFormatter(logging.Formatter):
    EXTRA_FIELDS = ('sid', 'ip', 'filename', 'args', 'image')

    def format(self, record):
        record.message = record.getMessage()
        obj = {'ts': self.formatTime(record), 'level': record.levelname, 'msg': record.message}
        for field in self.EXTRA_FIELDS:
            value = getattr(record, field, None)
            if value:
                obj[field] = value
        if record.exc_info:
            obj['exc'] = self.formatException(record.exc_info)
        return json.dumps(obj)
```

(`_TextFormatter` is left untouched — it's already dead code since `_use_json = True` is hardcoded, and touching it is out of scope.)

- [ ] **Step 2: Add the `calc_logger` and its non-rotating file**

Directly after the existing logger setup block (after `logger.addHandler(ch)`, currently `main.py:269`), add:

```python
CALC_LOG_DIR        = 'calc_log'
CALC_LOG_IMAGES_DIR = os.path.join(CALC_LOG_DIR, 'images')
CALC_LOG_FILE       = os.path.join(CALC_LOG_DIR, 'log.jsonl')
os.makedirs(CALC_LOG_IMAGES_DIR, exist_ok=True)

calc_logger = logging.getLogger('lattice.calc')
calc_logger.setLevel(logging.INFO)
calc_fh = logging.FileHandler(CALC_LOG_FILE, encoding='utf-8')
calc_fh.setFormatter(fmt)
calc_logger.addHandler(calc_fh)
```

- [ ] **Step 3: Add the `/log-calculation` and `/calc-log-image/<name>` routes**

Add these routes in the HTTP routes section, directly after `/convert_igs_to_stl` (after the function from Task 1):

```python
@app.route('/log-calculation', methods=['POST'])
def handle_log_calculation():
    if 'image' not in request.files:
        return jsonify({'error': 'No image provided'}), 400

    try:
        metadata = json.loads(request.form.get('metadata', '{}'))
    except (TypeError, ValueError):
        metadata = {}
    filename = metadata.get('filename', '')
    args     = metadata.get('args', {})

    entry_id   = uuid.uuid4().hex
    image_name = f'{entry_id}.png'
    image_disk = os.path.join(CALC_LOG_IMAGES_DIR, image_name)
    try:
        request.files['image'].save(image_disk)
    except OSError as exc:
        logger.warning(f"[CALC_LOG] failed to save snapshot: {exc}")
        return jsonify({'error': 'Failed to save snapshot'}), 500

    calc_logger.info(
        f"[CALC_LOG] {filename}"
        f"  tile={args.get('tileType')}  mode={args.get('calcMode')}"
        f"  tiles=({args.get('nt1')},{args.get('nt2')},{args.get('nt3')})"
        f"  g=({args.get('g1')},{args.get('g2')})"
        f"  p=({args.get('p1')},{args.get('p2')},{args.get('p3')})",
        extra={'filename': filename, 'args': args, 'image': f'images/{image_name}'},
    )
    return jsonify({'ok': True})


@app.route('/calc-log-image/<name>')
def calc_log_image(name):
    safe_name = os.path.basename(name)
    if safe_name != name or not safe_name.lower().endswith('.png'):
        return jsonify({'error': 'Invalid image name'}), 400
    path = os.path.join(CALC_LOG_IMAGES_DIR, safe_name)
    if not os.path.exists(path):
        return jsonify({'error': 'Image not found'}), 404
    return send_file(path, mimetype='image/png')
```

- [ ] **Step 4: Verify manually**

Start the backend, then upload a tiny placeholder PNG (any small PNG works — e.g. copy one from `react_frontend/public/` if one exists, or generate a 1x1 PNG):

```bash
python -c "
import base64
png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=')
open('test.png', 'wb').write(png)
"
curl -s -F "image=@test.png" -F 'metadata={"filename":"RevolveSrf.igs","args":{"tileType":"cross","calcMode":"revolution","nt1":2,"nt2":2,"nt3":2,"g1":0.2,"g2":1.5,"p1":0.2,"p2":0,"p3":0.4}}' http://localhost:5003/log-calculation
```

Expected: `{"ok":true}`. Then:

```bash
cat calc_log/log.jsonl
```

Expected: one JSON line with `"msg":"[CALC_LOG] RevolveSrf.igs ..."`, `"filename":"RevolveSrf.igs"`, `"args":{...}`, and `"image":"images/<hex>.png"`. Fetch it back:

```bash
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:5003/calc-log-image/$(python -c "import json; print(json.loads(open('calc_log/log.jsonl').readlines()[-1])['image'].split('/')[-1])")"
```

Expected: `200`. Then confirm path traversal is rejected:

```bash
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:5003/calc-log-image/..%2f..%2fmain.py"
```

Expected: `400` or `404` (not `200`, and `main.py`'s contents must not be returned).

Clean up the test file: `rm test.png`.

- [ ] **Step 5: Commit**

```bash
git add main.py
git commit -m "feat(backend): add calc_log JSONL logger and /log-calculation snapshot endpoint"
```

---

### Task 5: Stream `calc_log` into the existing `/viewlog` live tailer

**Files:**
- Modify: `main.py` — `on_connect` (currently `main.py:575-603`), the `log_thread` global setup

**Interfaces:**
- Consumes: `follow_log`, `get_initial_log_content` (both already generic over file path — no changes needed to their bodies), `CALC_LOG_FILE` from Task 4.

- [ ] **Step 1: Add a second tail thread and seed new connections with calc-log history too**

In `on_connect` (currently `main.py:575-603`), change:

```python
@socketio.on('connect')
def on_connect():
    global log_thread
    sid = request.sid
```

to:

```python
@socketio.on('connect')
def on_connect():
    global log_thread, calc_log_thread
    sid = request.sid
```

and after the existing block that seeds `lattice.log` history and starts `log_thread` (the `for line in get_initial_log_content(LOG_FILE_NAME): ...` and the `if log_thread is None: ...` block at the end of `on_connect`), add:

```python
    for line in get_initial_log_content(CALC_LOG_FILE):
        emit('log_update', {'data': line})

    if calc_log_thread is None:
        calc_log_thread = socketio.start_background_task(
            target=follow_log, file_name=CALC_LOG_FILE, socketio_instance=socketio
        )
```

Add the new global next to the existing `log_thread = None` declaration (currently `main.py:526`):

```python
log_thread = None
calc_log_thread = None
thread_stop_event = False
```

- [ ] **Step 2: Verify manually**

Start the backend fresh (so `calc_log/log.jsonl` already has the entry from Task 4's verification), then open `http://localhost:5003/viewlog` in a browser. Expected: the page's initial seed includes a line with `[CALC_LOG] RevolveSrf.igs ...` from Task 4's test entry, proving the seed-on-connect path works.

Then, with the page still open, repeat Task 4's `curl -F image=... -F metadata=...` call against `/log-calculation` in a terminal. Expected: a new `[CALC_LOG] ...` line appears live in the open browser tab within ~1 second, without refreshing — proving the new tail thread is streaming `calc_log/log.jsonl` the same way the existing thread streams `lattice.log`.

- [ ] **Step 3: Commit**

```bash
git add main.py
git commit -m "feat(backend): stream calc_log entries into the live /viewlog tailer"
```

---

### Task 6: Frontend API layer — `surface_b64`/`surface2_b64` and `logCalculation()`

**Files:**
- Modify: `react_frontend/src/api/types.ts`
- Modify: `react_frontend/src/api/httpClient.ts`
- Test: `react_frontend/src/api/__tests__/httpClient.test.ts`

**Interfaces:**
- Produces: `CalculatePayload.surface_b64: string`, `CalculatePayload.surface2_b64?: string`; `logCalculation(image: Blob, filename: string, args: CalculateArgs): Promise<void>`.
- Consumed by: Task 7 (`ToolPage.tsx` sends `surface_b64`/`surface2_b64`), Task 8 (`ToolPage.tsx` calls `logCalculation`).

- [ ] **Step 1: Add the fields to `CalculatePayload`**

In `react_frontend/src/api/types.ts`, replace the `CalculatePayload` interface (currently lines 16-25):

```ts
export interface CalculatePayload {
  filename: string;
  /** base64-encoded bytes of the uploaded surface IGS file. */
  surface_b64: string;
  /** base64-encoded bytes of the second surface, ruling mode only. */
  surface2_b64?: string;
  /** performance.now() value captured just before emit, for round-trip timing */
  client_ts: number;
  args: CalculateArgs;
}
```

- [ ] **Step 2: Write the failing test for `logCalculation()`**

In `react_frontend/src/api/__tests__/httpClient.test.ts`, add (after the existing `import` line, and as a new `describe` block at the end of the file):

```ts
import { logCalculation } from '../httpClient'
import type { CalculateArgs } from '../types'
```

```ts
describe('logCalculation()', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const args: CalculateArgs = {
    tileType: 'cross', calcMode: 'revolution',
    nt1: 2, nt2: 2, nt3: 2, g1: 0.2, g2: 1.5, p1: 0.2, p2: 0, p3: 0.4,
  }

  it('POSTs the image and metadata as multipart form data', async () => {
    fetchSpy.mockResolvedValue(new Response('{"ok":true}', { status: 200 }))

    const blob = new Blob(['fake-png-bytes'], { type: 'image/png' })
    await logCalculation(blob, 'mypart.igs', args)

    expect(fetchSpy).toHaveBeenCalledOnce()
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://localhost:5003/log-calculation')
    expect(init.method).toBe('POST')
    const form = init.body as FormData
    expect(form.get('image')).toBe(blob)
    const metadata = JSON.parse(form.get('metadata') as string)
    expect(metadata.filename).toBe('mypart.igs')
    expect(metadata.args).toEqual(args)
  })

  it('throws when the server returns a non-ok status', async () => {
    fetchSpy.mockResolvedValue(new Response('', { status: 500, statusText: 'Internal Server Error' }))

    await expect(logCalculation(new Blob(['x']), 'f.igs', args))
      .rejects.toThrow('Calc log failed: 500')
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd react_frontend
npx vitest run src/api/__tests__/httpClient.test.ts
```

Expected: FAIL — `logCalculation` is not exported from `../httpClient`.

- [ ] **Step 4: Implement `logCalculation()`**

In `react_frontend/src/api/httpClient.ts`, add at the end of the file:

```ts
import type { CalculateArgs } from './types';

/**
 * Uploads a canvas snapshot PNG plus the calculation params that produced it
 * to the permanent calc_log archive. Fire-and-forget from the caller's
 * perspective — failures should be caught and ignored by the caller so a
 * logging hiccup never affects the displayed calculation result.
 */
export async function logCalculation(image: Blob, filename: string, args: CalculateArgs): Promise<void> {
  const form = new FormData();
  form.append('image', image, 'snapshot.png');
  form.append('metadata', JSON.stringify({ filename, args }));

  const response = await fetch(`${BASE_URL}/log-calculation`, {
    method: 'POST',
    body: form,
  });

  if (!response.ok) {
    throw new Error(`Calc log failed: ${response.status} ${response.statusText}`);
  }
}
```

Move the `import type { CalculateArgs } from './types';` line to the top of the file alongside any other imports (the file currently has no imports — this becomes the first line, before `const BASE_URL = ...`).

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd react_frontend
npx vitest run src/api/__tests__/httpClient.test.ts
```

Expected: PASS — all tests in the file, including the two new ones.

- [ ] **Step 6: Commit**

```bash
git add src/api/types.ts src/api/httpClient.ts src/api/__tests__/httpClient.test.ts
git commit -m "feat(frontend): add surface_b64/surface2_b64 to CalculatePayload and logCalculation()"
```

---

### Task 7: `ToolPage.tsx` — retain and resend the original IGS bytes

**Files:**
- Modify: `react_frontend/src/pages/ToolPage.tsx`

**Interfaces:**
- Consumes: `CalculatePayload.surface_b64`/`surface2_b64` from Task 6.
- Produces: new state `uploadedIgsB64`/`uploadedIgsB64_2` (the original uploaded IGS bytes, base64) — internal to `ToolPage`, not consumed elsewhere.

This is the key correction found while planning: `uploadedFile`/`uploadedFile2` hold the **converted STL** `File` (for the viewer), never the original IGS bytes — confirmed by reading `convertIgsFile()` (`ToolPage.tsx:34-43`), which only returns `{stlB64, stlFile}` and never surfaces the original IGS bytes it received. Nothing today keeps the original IGS bytes in scope after conversion. This task fixes that.

- [ ] **Step 1: Make `convertIgsFile` also return the original IGS bytes as base64**

Replace `convertIgsFile` (currently `ToolPage.tsx:34-43`):

```ts
/**
 * Sends a .igs file to the server's convert_igs_to_stl endpoint for preview
 * purposes, and also returns the original IGS bytes (base64) so the caller
 * can resend them at Calculate time — the backend no longer persists
 * uploaded files between requests.
 */
async function convertIgsFile(file: File): Promise<{ stlFile: File; igsB64: string }> {
  const [stlB64, igsB64] = await Promise.all([convertIgsToStl(file), fileToBase64(file)])
  const binary = atob(stlB64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const stlName = file.name.replace(/\.igs$/i, '.stl')
  const stlFile = new File([bytes], stlName, { type: 'application/octet-stream' })
  return { stlFile, igsB64 }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
```

- [ ] **Step 2: Add state for the retained IGS bytes**

In the `/* ── File / result state ── */` block (currently `ToolPage.tsx:76-82`), add two new state variables after `uploadedFile`:

```ts
  const [uploadedFile, setUploadedFile]   = React.useState<File | null>(null)
  const [uploadedIgsB64, setUploadedIgsB64] = React.useState<string | null>(null)
  const [resultGzB64, setResultGzB64]     = React.useState<string | null>(null)
```

And in the `/* ── Second file slot for ruling mode ── */` block (currently `ToolPage.tsx:84-85`):

```ts
  const [uploadedFile2, setUploadedFile2] = React.useState<File | null>(null)
  const [uploadedIgsB64_2, setUploadedIgsB64_2] = React.useState<string | null>(null)
```

- [ ] **Step 3: Update every `convertIgsFile` call site to also store the IGS bytes**

Replace `handleFilesAdd` (currently `ToolPage.tsx:190-231`):

```ts
  const handleFilesAdd = React.useCallback(async (files: File[]) => {
    setResultGzB64(null)
    setErrorMsg(null)

    if (calcMode === RULING) {
      if (files.length >= 2) {
        setViewerResetKey('file-' + Date.now())
        try {
          const [r1, r2] = await Promise.all([convertIgsFile(files[0]), convertIgsFile(files[1])])
          setUploadedFile(r1.stlFile)
          setUploadedIgsB64(r1.igsB64)
          setUploadedFile2(r2.stlFile)
          setUploadedIgsB64_2(r2.igsB64)
        } catch { setErrorMsg('Failed to convert IGS file') }
      } else {
        const file = files[0]
        if (!uploadedFile) {
          setViewerResetKey('file-' + Date.now())
          try {
            const { stlFile, igsB64 } = await convertIgsFile(file)
            setUploadedFile(stlFile)
            setUploadedIgsB64(igsB64)
          } catch { setErrorMsg('Failed to convert IGS file') }
        } else if (!uploadedFile2) {
          try {
            const { stlFile, igsB64 } = await convertIgsFile(file)
            setUploadedFile2(stlFile)
            setUploadedIgsB64_2(igsB64)
          } catch { setErrorMsg('Failed to convert IGS file') }
        } else {
          setViewerResetKey('file-' + Date.now())
          try {
            const { stlFile, igsB64 } = await convertIgsFile(file)
            setUploadedFile(stlFile)
            setUploadedIgsB64(igsB64)
          } catch { setErrorMsg('Failed to convert IGS file') }
        }
      }
    } else {
      const file = files[0]
      setViewerResetKey('file-' + Date.now())
      try {
        const { stlFile, igsB64 } = await convertIgsFile(file)
        setUploadedFile(stlFile)
        setUploadedIgsB64(igsB64)
      } catch { setErrorMsg('Failed to convert IGS file') }
    }
  }, [calcMode, uploadedFile, uploadedFile2])
```

Replace `handleFile1Drop` and `handleFile2Drop` (currently `ToolPage.tsx:233-247`):

```ts
  const handleFile1Drop = React.useCallback(async (file: File) => {
    setResultGzB64(null)
    try {
      const { stlFile, igsB64 } = await convertIgsFile(file)
      setUploadedFile(stlFile)
      setUploadedIgsB64(igsB64)
    } catch { setErrorMsg('Failed to convert IGS file') }
  }, [])

  const handleFile2Drop = React.useCallback(async (file: File) => {
    setResultGzB64(null)
    try {
      const { stlFile, igsB64 } = await convertIgsFile(file)
      setUploadedFile2(stlFile)
      setUploadedIgsB64_2(igsB64)
    } catch { setErrorMsg('Failed to convert IGS file') }
  }, [])
```

- [ ] **Step 4: Clear the retained bytes alongside the existing clear handlers**

Replace the clear handlers (currently `ToolPage.tsx:250-262`):

```ts
  const handleClearSingle = React.useCallback(() => {
    setUploadedFile(null)
    setUploadedIgsB64(null)
    setResultGzB64(null)
    setDownloadToken(null)
  }, [])

  const handleClear1 = React.useCallback(() => {
    setUploadedFile(null)
    setUploadedIgsB64(null)
  }, [])

  const handleClear2 = React.useCallback(() => {
    setUploadedFile2(null)
    setUploadedIgsB64_2(null)
  }, [])
```

- [ ] **Step 5: Send the bytes at Calculate time, and validate they're present**

Replace `handleCalculate` (currently `ToolPage.tsx:265-302`):

```ts
  const handleCalculate = React.useCallback(() => {
    const allErrors = Object.values(validationErrors).flat()
    if (allErrors.length > 0) {
      setErrorMsg(allErrors[0].message)
      return
    }

    if (calcMode === RULING) {
      if (!uploadedFile && !uploadedFile2) {
        setErrorMsg('Please upload both surface files')
        return
      }
      if (!uploadedFile || !uploadedIgsB64) {
        setErrorMsg('Please upload Surface 1')
        return
      }
      if (!uploadedFile2 || !uploadedIgsB64_2) {
        setErrorMsg('Please upload Surface 2')
        return
      }
    } else {
      if (!uploadedFile || !uploadedIgsB64) {
        setErrorMsg('Please upload a 3D file first')
        return
      }
    }
    pendingResetKey.current = 'calc-' + Date.now()
    setIsCalculating(true)
    setCalcLabel('Calculating…')
    setErrorMsg(null)
    const calculateArgs = {
      filename: uploadedFile!.name,
      surface_b64: uploadedIgsB64!,
      ...(calcMode === RULING ? { surface2_b64: uploadedIgsB64_2! } : {}),
      client_ts: performance.now(),
      args: { tileType, calcMode, nt1, nt2, nt3, g1, g2, p1: tileSliderValues[0], p2: tileSliderValues[1], p3: tileSliderValues[2] },
    }
    socket.calculate(calculateArgs)
  }, [validationErrors, calcMode, uploadedFile, uploadedFile2, uploadedIgsB64, uploadedIgsB64_2, nt1, nt2, nt3, g1, g2, tileSliderValues, tileType, socket])
```

- [ ] **Step 6: Verify manually in the browser**

```bash
cd react_frontend
npm run dev
```

Open `http://localhost:5173/tool`, upload `Input/RevolveSrf.igs` (drag it onto the viewer or use the + button), wait for the preview to render, then click Calculate. Expected: the calculation completes and the result renders — confirming the round-trip through `surface_b64` works end-to-end with the Task 2 backend changes.

Then switch to Ruling mode, upload `Input/RuledSrf1.igs` and `Input/RuledSrf2.igs` as Surface 1 and Surface 2, and click Calculate. Expected: the calculation completes (previously this silently used a hardcoded surface; now check the resulting mesh differs from a same-surface ruling result, confirming the real second surface was used).

- [ ] **Step 7: Commit**

```bash
git add src/pages/ToolPage.tsx
git commit -m "feat(frontend): retain and resend original IGS bytes instead of relying on server-side disk state"
```

---

### Task 8: Calculation log — frontend snapshot capture and upload

**Files:**
- Modify: `react_frontend/src/components/ViewerScene.tsx`
- Modify: `react_frontend/src/pages/ToolPage.tsx`

**Interfaces:**
- Consumes: `logCalculation()` from Task 6.
- Produces: `ViewerSceneProps.onAutoFitComplete?: (canvas: HTMLCanvasElement | null) => void` — fired once whenever `STLMesh`'s auto-fit logic runs (for both perspective and orthographic cameras).

- [ ] **Step 1: Expose the canvas element and an auto-fit-complete callback from `ViewerScene`**

In `react_frontend/src/components/ViewerScene.tsx`, add `onAutoFitComplete` to `ViewerSceneProps` (after `onFitDistance`-related props — add right after `onClear` in the interface, currently around line 31):

```ts
  /** Called when the user clicks the clear button. Clears the loaded content. */
  onClear?: () => void
  /**
   * Called once after the camera finishes auto-fitting to a newly loaded
   * mesh (fires for both perspective and orthographic modes). Receives the
   * underlying canvas DOM element so the caller can capture a snapshot.
   */
  onAutoFitComplete?: (canvas: HTMLCanvasElement | null) => void
```

Destructure it in `ViewerSceneFn`'s props (currently lines 50-63), adding after `onClear`:

```ts
  onClear,
  onAutoFitComplete,
  className,
```

Add a ref to hold the canvas element, set via the `<Canvas>` component's `onCreated` callback (add near the other refs, after the `containerRef` block, currently around line 75-86):

```ts
  // Holds the actual <canvas> DOM element once R3F creates the renderer.
  const canvasElRef = React.useRef<HTMLCanvasElement | null>(null)
```

Update `handleFitDistance` and `handleFitOrthoZoom` (currently lines 88-98) to also fire `onAutoFitComplete`:

```ts
  // Called by STLMesh after a perspective auto-fit.
  const handleFitDistance = React.useCallback((d: number) => {
    setBaseZ(d)
    onZoomChange?.(100)
    onAutoFitComplete?.(canvasElRef.current)
  }, [onZoomChange, onAutoFitComplete])

  // Called by STLMesh after an orthographic auto-fit.
  const handleFitOrthoZoom = React.useCallback((z: number) => {
    setBaseOrthoZoom(z)
    onZoomChange?.(100)
    onAutoFitComplete?.(canvasElRef.current)
  }, [onZoomChange, onAutoFitComplete])
```

Add `onCreated` to the `<Canvas>` element (currently lines 191-202):

```tsx
      <Canvas
        key={cameraMode}
        frameloop="demand"
        style={{ width: '100%', height: '100%' }}
        camera={
          cameraMode === 'perspective'
            ? { position: [0, 0, 5], fov: 45 }
            : undefined
        }
        orthographic={cameraMode === 'orthographic'}
        gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
        onCreated={(state) => { canvasElRef.current = state.gl.domElement }}
      >
```

(`preserveDrawingBuffer: true` is required — without it, `canvas.toBlob()` can capture a blank frame in `frameloop="demand"` mode because the buffer may already be cleared by the time the snapshot runs.)

- [ ] **Step 2: Capture and upload the snapshot from `ToolPage`, only for completed calculations**

In `ToolPage.tsx`, add an import for `logCalculation` (in the existing `import { downloadResults, convertIgsToStl } from '../api/httpClient'` line, currently line 11):

```ts
import { downloadResults, convertIgsToStl, logCalculation } from '../api/httpClient'
```

Add a ref to stash the pending snapshot's metadata, next to the other refs (after `downloadTokenRef`, currently around line 102-103):

```ts
  const pendingSnapshotRef = React.useRef<{ filename: string; args: CalculateArgs } | null>(null)
```

This needs `CalculateArgs` imported — add it to the existing type-only import from `'../api/types'` (currently line 25):

```ts
import type { CalculateArgs, ValidationError } from '../api/types'
```

In the `model_stl` branch of the `onResult` handler (currently inside the `else` branch at `ToolPage.tsx:137-147`), stash the snapshot metadata right where the reset key is consumed:

```ts
      } else {
        // model_stl from calculate — full lattice result
        setIsCalculating(false)
        setCalcLabel('Calculating…')
        setResultGzB64(payload.stl_gz_b64)
        setDownloadToken(payload.download_token)
        if (payload.args_echo) {
          pendingSnapshotRef.current = { filename: payload.filename, args: payload.args_echo }
        }
        if (pendingResetKey.current !== null) {
          setViewerResetKey(pendingResetKey.current)
          pendingResetKey.current = null
        }
      }
```

Add the auto-fit-complete handler, near the other stable callbacks (after `handleTileMenuClose`, currently line 317):

```ts
  const handleAutoFitComplete = React.useCallback((canvas: HTMLCanvasElement | null) => {
    const pending = pendingSnapshotRef.current
    pendingSnapshotRef.current = null
    if (!pending || !canvas) return
    canvas.toBlob(blob => {
      if (!blob) return
      logCalculation(blob, pending.filename, pending.args).catch(err => {
        console.warn('calc log snapshot failed to upload', err)
      })
    }, 'image/png')
  }, [])
```

Pass it to `<ViewerScene>` (currently lines 407-417):

```tsx
                <ViewerScene
                  uploadedFile={uploadedFile}
                  resultStlGzB64={resultGzB64}
                  cameraMode={cameraMode}
                  cameraResetKey={viewerResetKey}
                  onFileDrop={handleViewerFileDrop}
                  onClear={handleClearSingle}
                  onAutoFitComplete={handleAutoFitComplete}
                  meshColor={meshColor}
                  backgroundColor={backgroundColor}
                />
```

This only ever captures a snapshot when `pendingSnapshotRef.current` was set by a `model_stl` result — plain file uploads and tile previews also trigger auto-fit (since they change `cameraResetKey`/mesh geometry too), but never set this ref, so `handleAutoFitComplete` becomes a no-op for them.

- [ ] **Step 3: Verify manually in the browser**

```bash
cd react_frontend
npm run dev
```

Open the Network tab in devtools, upload `Input/RevolveSrf.igs`, click Calculate, and wait for the result to render. Expected: shortly after the mesh appears (camera auto-fit completes), a `POST /log-calculation` request appears in the Network tab with a `multipart/form-data` body containing an `image` part and a `metadata` part. Then drag-drop a *different* file onto the viewer (a plain upload, no calculation) — expected: no `/log-calculation` request fires for that upload's auto-fit, confirming the gating works.

Then check the backend:

```bash
cat calc_log/log.jsonl | tail -1
```

Expected: a new line with `"filename":"RevolveSrf.igs"` and the actual params used in the browser. Open the PNG referenced by its `image` field directly in a browser tab (`http://localhost:5003/calc-log-image/<name>.png`) and confirm it shows the rendered lattice result, not a blank canvas.

- [ ] **Step 4: Commit**

```bash
git add src/components/ViewerScene.tsx src/pages/ToolPage.tsx
git commit -m "feat(frontend): capture and upload a canvas snapshot after each completed calculation"
```

---

### Task 9: Render calc-log entries in `/viewlog`

**Files:**
- Modify: `templates/log_view.html`

**Interfaces:**
- Consumes: the `image`/`filename`/`args` fields on log entries, already streamed by Task 5 and already parsed generically by the existing `JSON.parse(msg.data)` in `socket.on('log_update', ...)`.

- [ ] **Step 1: Add a params-summary helper and image rendering to `entryHtml`**

In `templates/log_view.html`, add a helper function near the existing `msgHtml` helper (currently after the function at line 110-112):

```js
    function paramsSummary(args) {
        if (!args) return '';
        var parts = [];
        if (args.tileType) parts.push('tile=' + args.tileType);
        if (args.calcMode) parts.push('mode=' + args.calcMode);
        if (args.nt1 != null) parts.push('tiles=(' + args.nt1 + ',' + args.nt2 + ',' + args.nt3 + ')');
        if (args.g1 != null) parts.push('g=(' + args.g1 + ',' + args.g2 + ')');
        return parts.join('  ');
    }
```

Replace `entryHtml` (currently lines 114-129):

```js
    function entryHtml(e, hideSid) {
        var lv = e.level || 'INFO';
        var lc = lv === 'WARNING' ? 'W' : lv === 'ERROR' ? 'E' : '';
        var sid = (e.sid && !hideSid)
            ? '<span class="sid-pill" title="' + esc(e.sid) + '">' + esc(e.sid.substring(0, 8)) + '</span>'
            : '';
        var calcLogExtra = e.image
            ? '<div class="calc-log-extra">'
                + '<a href="/calc-log-image/' + esc(e.image.split('/').pop()) + '" target="_blank">'
                + '<img class="calc-log-thumb" src="/calc-log-image/' + esc(e.image.split('/').pop()) + '" alt="snapshot"></a>'
                + (e.filename ? '<span class="calc-log-filename">' + esc(e.filename) + '</span>' : '')
                + (e.args ? '<span class="calc-log-params">' + esc(paramsSummary(e.args)) + '</span>' : '')
                + '</div>'
            : '';
        return '<div class="log-entry ' + lc + '">'
            + '<div class="log-line">'
            + '<span class="ts">' + esc(timeStr(e.ts)) + '</span>'
            + '<span class="badge ' + lv + '">' + lv + '</span>'
            + '<span class="msg">' + msgHtml(e.msg) + '</span>'
            + sid
            + '</div>'
            + calcLogExtra
            + (e.exc ? '<pre class="exc-block">' + esc(e.exc) + '</pre>' : '')
            + '</div>';
    }
```

- [ ] **Step 2: Add the supporting CSS**

In the `<style>` block, add after the existing `.exc-block` rule (currently line 38):

```css
        .calc-log-extra{display:flex;align-items:center;gap:8px;margin:3px 0 4px 90px;padding:4px 8px;background:rgba(97,175,239,.06);border-left:2px solid #61afef;border-radius:0 3px 3px 0}
        .calc-log-thumb{width:48px;height:48px;object-fit:cover;border-radius:4px;border:1px solid #3e4451}
        .calc-log-filename{font-size:11px;color:#abb2bf}
        .calc-log-params{font-size:10px;color:#4b5263}
```

- [ ] **Step 3: Verify manually**

With the backend running and `calc_log/log.jsonl` containing at least one entry (from Task 4 or Task 8's verification), open `http://localhost:5003/viewlog`. Expected: the `[CALC_LOG] ...` line now renders with a small thumbnail image, the filename, and a compact params summary beneath the log line — clicking the thumbnail opens the full-size PNG in a new tab. Expected: all other (non-calc-log) log lines render exactly as before — no visual regression.

- [ ] **Step 4: Commit**

```bash
git add templates/log_view.html
git commit -m "feat(frontend): render calc_log snapshots and params in the live log viewer"
```

---

## Self-Review

**Spec coverage:**
- §1 (upload/conversion) → Task 1.
- §2 (stateless calculate, real ruling) → Task 2.
- §3 (result storage & download lifecycle, disconnect fix) → Task 2 (folded in — both rewrite the same dispatch/cleanup code paths).
- §4 (tile preview) → Task 3.
- §5 (calc log, integrated logging, live streaming) → Tasks 4, 5, 8, 9.
- §6 (error handling & verification) → covered inline in every task's manual verification steps; `try/finally` temp-file cleanup is in Tasks 1-3.

**Placeholder scan:** no TBD/TODO/"add error handling"-style steps; every step has complete code and an exact verification command with expected output.

**Type/signature consistency check:** `do_revolution`/`do_extrusion` signature `(out_folder, igs_path, num_tiles, tile_params, grading_params, tile_type_int)` matches their call sites in Task 2 Step 5; `do_Ruling`'s `(out_folder, igs_path, igs_path2, ...)` matches its call site; `client_state[sid]['current_token']` is written in Task 2 Step 5 and read in Task 2 Step 4 (`on_disconnect`) — consistent. `CalculatePayload.surface_b64`/`surface2_b64` (Task 6) match the fields read by `handle_calculate` (Task 2) and the fields sent by `ToolPage.tsx` (Task 7). `logCalculation(image, filename, args)` (Task 6) matches its call site in Task 8 Step 2. `ViewerSceneProps.onAutoFitComplete` (Task 8 Step 1) matches the prop passed in Task 8 Step 2 and the calls from `handleFitDistance`/`handleFitOrthoZoom`.
