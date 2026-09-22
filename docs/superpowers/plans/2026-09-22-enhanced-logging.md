# Enhanced Logging & Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the logging gaps identified in the design spec — a global error safety net, entry/internal-step visibility into the normal request flow, browser fingerprinting, persisted original upload files with log-line pointers to them, and a real surface-vs-full-detail distinction between the two existing log viewer pages.

**Architecture:** All backend work lands in `main.py` (this app has no other backend module beyond `calc_queue.py`/`dll_instance.py`/`dll_lane.py`, none of which this plan touches). The two log-viewer templates are rebuilt on one shared, parameterized static script rather than staying near-duplicate files. One task threads a new field from the backend's `calculate` result emit through the existing screenshot-upload path on the frontend.

**Tech Stack:** Flask + Flask-SocketIO (Python 3.13, `async_mode='threading'`), vanilla JS in Jinja-rendered templates (no bundler for `templates/`), React + TypeScript (Vite) for `react_frontend/`.

**Spec:** `docs/superpowers/specs/2026-09-22-enhanced-logging-design.md`

## Global Constraints

- All new "entry" and "internal step" log lines are `logging.DEBUG` level. Every existing INFO/WARNING/ERROR line stays exactly as it is — this is strictly additive.
- The identity key everywhere is the existing Socket.IO `sid`. No new identity system, no cookies, no localStorage UUID.
- No instrumentation goes *inside* the DLL call itself — only immediately before and after it.
- Result files (`last_results/<token>/`) are not persisted long-term by this plan — no change to that lifecycle. Only original uploaded surfaces are newly saved.
- No new Flask route/page is added. `/viewlog` and `/viewfulllog` are the only two log-viewer URLs, before and after this plan.
- `_log_extra(sid)` already tolerates an unknown or `None` sid (`_client_ip`/`_client_user_agent` both fall back to `'?'` via `dict.get(..., '?')`) — new call sites with no real sid (plain HTTP routes) may pass `_log_extra(None)` or `_log_extra(getattr(request, 'sid', None))` safely.

---

### Task 1: Global error safety net + browser fingerprinting

**Files:**
- Modify: `main.py:114-185` (logging setup block), `main.py:498-544` (`on_connect`/`_log_extra` area), `main.py:60-70` (near `app`/`socketio` creation, for the two new error handlers)
- Test: `tests/test_logging_safety_net.py` (new file)

**Interfaces:**
- Produces: `_client_user_agent(sid) -> str`, `_log_extra(sid)` now returns `{'sid', 'ip', 'user_agent'}`, two new handlers (`@app.errorhandler(Exception)`, `@socketio.on_error_default`) with no callers — SocketIO/Flask invoke them automatically on any exception that reaches them uncaught.
- Consumes: nothing new from earlier tasks (this is the first task).

- [ ] **Step 1: Add `user_agent` to `_JsonFormatter.EXTRA_FIELDS`**

In `main.py`, the `EXTRA_FIELDS` tuple (currently at line 133-139):

```python
    EXTRA_FIELDS = (
        ('sid', 'sid'),
        ('ip', 'ip'),
        ('filename', 'calc_filename'),
        ('args', 'calc_args'),
        ('image', 'image'),
    )
```

becomes:

```python
    EXTRA_FIELDS = (
        ('sid', 'sid'),
        ('ip', 'ip'),
        ('user_agent', 'user_agent'),
        ('filename', 'calc_filename'),
        ('args', 'calc_args'),
        ('image', 'image'),
    )
```

- [ ] **Step 2: Capture the User-Agent at connect time and add the lookup helper**

In `on_connect()` (currently `main.py:498-519`), the `connected_clients[sid] = {...}` block:

```python
    connected_clients[sid] = {
        'sid': sid,
        'ip_address_reported': ip_address,
        'unique_file_id': unique_file_id,
    }
```

becomes:

```python
    connected_clients[sid] = {
        'sid': sid,
        'ip_address_reported': ip_address,
        'user_agent': request.headers.get('User-Agent', '?'),
        'unique_file_id': unique_file_id,
    }
```

Immediately after `_client_ip` (currently `main.py:538-539`):

```python
def _client_ip(sid):
    return (connected_clients.get(sid) or {}).get('ip_address_reported', '?')
```

add:

```python
def _client_user_agent(sid):
    return (connected_clients.get(sid) or {}).get('user_agent', '?')
```

- [ ] **Step 3: Thread it into `_log_extra`**

`_log_extra` (currently `main.py:542-543`):

```python
def _log_extra(sid):
    return {'sid': sid, 'ip': _client_ip(sid)}
```

becomes:

```python
def _log_extra(sid):
    return {'sid': sid, 'ip': _client_ip(sid), 'user_agent': _client_user_agent(sid)}
```

No other call site changes — every existing `extra=_log_extra(sid)` call automatically carries the new field.

- [ ] **Step 4: Write the failing tests for Steps 1-3**

Create `tests/test_logging_safety_net.py`:

```python
import json
import logging

import main as main_module


def test_log_extra_includes_user_agent():
    main_module.connected_clients['test-sid-ua'] = {
        'sid': 'test-sid-ua', 'ip_address_reported': '127.0.0.1', 'user_agent': 'pytest-agent/1.0',
    }
    try:
        extra = main_module._log_extra('test-sid-ua')
        assert extra['user_agent'] == 'pytest-agent/1.0'
    finally:
        main_module.connected_clients.pop('test-sid-ua', None)


def test_client_user_agent_falls_back_to_unknown_for_missing_sid():
    assert main_module._client_user_agent('no-such-sid') == '?'


def test_json_formatter_surfaces_user_agent(caplog=None):
    record = logging.LogRecord(
        name='lattice', level=logging.INFO, pathname=__file__, lineno=1,
        msg='test message', args=(), exc_info=None,
    )
    record.sid = 'sid-1'
    record.ip = '127.0.0.1'
    record.user_agent = 'pytest-agent/1.0'
    formatted = main_module._JsonFormatter().format(record)
    obj = json.loads(formatted)
    assert obj['user_agent'] == 'pytest-agent/1.0'
```

Run: `python -m pytest tests/test_logging_safety_net.py -v`
Expected: FAIL — `_client_user_agent` doesn't exist yet, `_log_extra` doesn't return `user_agent`, `EXTRA_FIELDS` doesn't include it.

- [ ] **Step 5: Confirm Steps 1-3 make the tests pass**

Run: `python -m pytest tests/test_logging_safety_net.py -v`
Expected: 3 passed.

- [ ] **Step 6: Add the two global error handlers**

Near the other app/socketio setup, right after `socketio = SocketIO(...)` finishes (find the end of that call — currently starting at `main.py:69`), add:

```python
@app.errorhandler(Exception)
def handle_uncaught_http_exception(exc):
    logger.exception(
        f"[UNCAUGHT] {request.method} {request.path}",
        extra=_log_extra(getattr(request, 'sid', None)),
    )
    return jsonify({'error': 'Internal server error'}), 500


@socketio.on_error_default
def handle_uncaught_socketio_exception(exc):
    sid = request.sid if request else None
    logger.exception("[UNCAUGHT] socketio handler failed", extra=_log_extra(sid))
```

These must be defined after `_log_extra` exists (it's defined later in the file, at line 542) — Python resolves the name at call time, not definition time, since both are module-level functions referenced only inside handler bodies, so definition order between them doesn't matter. Placing the handlers near `app`/`socketio` creation (rather than at the very end of the file) keeps them visually next to the objects they're registered on, matching how `CORS(app, ...)` sits right after `app = Flask(__name__)`.

- [ ] **Step 7: Write the failing tests for Step 6**

Append to `tests/test_logging_safety_net.py`:

```python
def test_uncaught_http_exception_is_logged_and_returns_500(monkeypatch, caplog):
    def _boom():
        raise RuntimeError("boom")
    main_module.app.add_url_rule('/__test_boom_http', view_func=_boom)
    client = main_module.app.test_client()

    with caplog.at_level(logging.ERROR, logger='lattice'):
        resp = client.get('/__test_boom_http')

    assert resp.status_code == 500
    assert resp.get_json() == {'error': 'Internal server error'}
    assert any('[UNCAUGHT]' in r.message for r in caplog.records)


def test_uncaught_socketio_exception_is_logged(monkeypatch, caplog):
    @main_module.socketio.on('__test_boom_socketio')
    def _boom(data):
        raise RuntimeError("boom")

    client = main_module.socketio.test_client(main_module.app)
    client.get_received()

    with caplog.at_level(logging.ERROR, logger='lattice'):
        client.emit('__test_boom_socketio', {})

    assert any('[UNCAUGHT]' in r.message for r in caplog.records)
```

Run: `python -m pytest tests/test_logging_safety_net.py -v`
Expected: FAIL (2 new failures — handlers don't exist yet).

- [ ] **Step 8: Confirm Step 6 makes the tests pass**

Run: `python -m pytest tests/test_logging_safety_net.py -v`
Expected: 5 passed.

- [ ] **Step 9: Run the full backend suite to confirm nothing else broke**

Run: `python -m pytest tests/ -v`
Expected: all passing (42 pre-existing + 5 new = 47), 0 failures.

- [ ] **Step 10: Commit**

```bash
git add main.py tests/test_logging_safety_net.py
git commit -m "feat(backend): add global error safety net and browser User-Agent fingerprinting"
```

---

### Task 2: Persist original upload files, pointed to from calc log lines

**Files:**
- Modify: `main.py:304-317` (near `temp_igs_file`, for the new helper), `main.py:570-670` (`handle_calculate`), `main.py:673-742` (`_run_calculate_dll_phase`'s start log line), `main.py:745-829` (`_finish_calculate`'s done log line)
- Test: `tests/test_upload_persistence.py` (new file), extend `tests/test_calculate_queue_integration.py`

**Interfaces:**
- Produces: `_save_original_upload(sid: str, filename: str, raw_bytes: bytes) -> str` (returns the saved path). `payload['saved_input_paths']: list[str]`, present (possibly empty) on every job's payload from this task onward — **Task 5 reads this field** to thread it into the `result` socket emit.
- Consumes: nothing new from Task 1.

- [ ] **Step 1: Write the failing test for `_save_original_upload`**

Create `tests/test_upload_persistence.py`:

```python
import os
import shutil

import main as main_module


TEST_SID = 'test-upload-sid'


def teardown_function(_):
    folder = os.path.join(main_module.DATA_DIR, TEST_SID)
    shutil.rmtree(folder, ignore_errors=True)


def test_save_original_upload_writes_exact_bytes():
    raw = b'a fake igs file, not real geometry'
    saved_path = main_module._save_original_upload(TEST_SID, 'part.igs', raw)

    assert os.path.exists(saved_path)
    with open(saved_path, 'rb') as f:
        assert f.read() == raw
    assert saved_path.startswith(os.path.join(main_module.DATA_DIR, TEST_SID))
    assert os.path.basename(saved_path).endswith('_part.igs')


def test_save_original_upload_does_not_collide_on_repeat_upload():
    raw1 = b'first upload'
    raw2 = b'second upload, same filename'

    path1 = main_module._save_original_upload(TEST_SID, 'part.igs', raw1)
    path2 = main_module._save_original_upload(TEST_SID, 'part.igs', raw2)

    assert path1 != path2
    with open(path1, 'rb') as f:
        assert f.read() == raw1
    with open(path2, 'rb') as f:
        assert f.read() == raw2
```

Run: `python -m pytest tests/test_upload_persistence.py -v`
Expected: FAIL — `_save_original_upload` doesn't exist.

- [ ] **Step 2: Implement `_save_original_upload`**

Immediately after `temp_igs_file`'s definition (currently ending at `main.py:316`), before `DOWNLOAD_CACHE = {}` (`main.py:319`):

```python
def _save_original_upload(sid: str, filename: str, raw_bytes: bytes) -> str:
    """Persist an uploaded surface file under client_data/<sid>/, keyed by a
    UUID prefix so repeat uploads in one session (or Ruling mode's two
    files) never collide. Returns the path a log line can point at, so a
    calculation can be reproduced later from its exact original input.

    `filename` is client-supplied and untrusted — reduced to a single path
    component before use, and the final path is verified to still resolve
    inside session_dir before writing, so a crafted name (e.g. containing
    `../`) can never escape client_data/<sid>/."""
    session_dir = os.path.realpath(os.path.join(DATA_DIR, sid))
    os.makedirs(session_dir, exist_ok=True)
    base = os.path.basename(str(filename).replace('\\', '/').split('/')[-1]).strip()
    if not base or base in ('.', '..'):
        base = 'upload.igs'
    saved_name = f"{uuid.uuid4().hex}_{base}"
    saved_path = os.path.join(session_dir, saved_name)
    if os.path.commonpath([session_dir, os.path.realpath(saved_path)]) != session_dir:
        raise OSError(f"refusing to write outside session dir: {saved_path!r}")
    with open(saved_path, 'wb') as f:
        f.write(raw_bytes)
    return saved_path
```

- [ ] **Step 3: Run the test to confirm it passes**

Run: `python -m pytest tests/test_upload_persistence.py -v`
Expected: 2 passed.

- [ ] **Step 4: Wire the save into `handle_calculate`, non-silent path only**

In `handle_calculate` (`main.py`), the block currently reading:

```python
    if silent:
        if not dll_background_lane.try_acquire():
            # Background lane busy — drop this preview. A newer trigger
            # (or the next debounce tick) supersedes it; never queues,
            # never surfaces any UI, never touches dll_main.
            return
        try:
            threading.Thread(
                target=_run_silent_calculate, args=(sid, payload),
                daemon=True, name=f'calc-silent-{sid}',
            ).start()
        except Exception as exc:
            dll_background_lane.release()
            logger.exception(f"[CALC] failed to start silent-calculate thread: {exc}", extra=_log_extra(sid))
        return

    accepted = queue_manager.enqueue(sid, payload, silent=False)
```

becomes (inserting the save between the `if silent:` block and the enqueue call):

```python
    if silent:
        if not dll_background_lane.try_acquire():
            # Background lane busy — drop this preview. A newer trigger
            # (or the next debounce tick) supersedes it; never queues,
            # never surfaces any UI, never touches dll_main.
            return
        try:
            threading.Thread(
                target=_run_silent_calculate, args=(sid, payload),
                daemon=True, name=f'calc-silent-{sid}',
            ).start()
        except Exception as exc:
            dll_background_lane.release()
            logger.exception(f"[CALC] failed to start silent-calculate thread: {exc}", extra=_log_extra(sid))
        return

    # Only a real (non-silent) calculation's inputs are worth keeping —
    # this is the point that matches "files uploaded for calculation," not
    # every drag-in or background preview. Errors here degrade
    # traceability, never the calculation itself.
    saved_input_paths = []
    try:
        saved_input_paths.append(_save_original_upload(sid, filename, igs_bytes))
        if igs_bytes2 is not None:
            base, ext = os.path.splitext(filename)
            filename2 = f"{base}_surface2{ext or '.igs'}"
            saved_input_paths.append(_save_original_upload(sid, filename2, igs_bytes2))
    except OSError as exc:
        logger.warning(f"[CALC] failed to save original upload: {exc}", extra=_log_extra(sid))
    payload['saved_input_paths'] = saved_input_paths

    accepted = queue_manager.enqueue(sid, payload, silent=False)
```

- [ ] **Step 5: Surface the saved paths in the start and done log lines**

In `_run_calculate_dll_phase` (`main.py`), the start-of-DLL log line currently:

```python
        logger.info(f"[CALC] -> {calc_mode}  filename={filename}", extra=_log_extra(sid))
```

becomes:

```python
        logger.info(
            f"[CALC] -> {calc_mode}  filename={filename}  inputs={p.get('saved_input_paths', [])}",
            extra=_log_extra(sid),
        )
```

(`p` is already the local alias for `payload` at the top of this function — `p = payload`.)

In `_finish_calculate` (`main.py`), add a local right after the existing unpacking block:

```python
        client_ts  = payload['client_ts']
        filename   = payload['filename']
        args       = payload['args']
        t_received = payload['t_received']
```

becomes:

```python
        client_ts          = payload['client_ts']
        filename           = payload['filename']
        args               = payload['args']
        t_received         = payload['t_received']
        saved_input_paths  = payload.get('saved_input_paths', [])
```

and the done log line currently:

```python
        logger.info(
            f"[CALC] done  {comp_kb:.0f}KB"
            f"  overall={timings['overall_ms']}ms"
            f"  dll={timings['time_dll_ms']}ms"
            f"  compress={timings['time_compress_ms']}ms"
            f"  token={new_token}",
            extra=_log_extra(sid),
        )
```

becomes:

```python
        logger.info(
            f"[CALC] done  {comp_kb:.0f}KB"
            f"  overall={timings['overall_ms']}ms"
            f"  dll={timings['time_dll_ms']}ms"
            f"  compress={timings['time_compress_ms']}ms"
            f"  token={new_token}"
            f"  inputs={saved_input_paths}",
            extra=_log_extra(sid),
        )
```

Using `payload.get('saved_input_paths', [])` (not `payload['saved_input_paths']`) in both places means a silent calculation's payload — which never gets this key set — logs `inputs=[]` instead of raising `KeyError`, matching "silent/preview calculations are never saved."

- [ ] **Step 6: Write the failing integration test**

Append to `tests/test_calculate_queue_integration.py` (reusing this file's existing `_calc_payload()` / `_install_fake_revolution()` helpers):

```python
def test_real_calculate_saves_original_upload_and_logs_its_path(monkeypatch, tmp_path):
    monkeypatch.setattr(main_module, 'DATA_DIR', str(tmp_path))
    _install_fake_revolution(monkeypatch, delay=0.02)

    c1 = main_module.socketio.test_client(main_module.app)
    c1.get_received()
    c1.emit('calculate', _calc_payload())

    def got_result():
        events = c1.get_received()
        return any(e['name'] == 'result' for e in events)

    assert _wait_until(got_result, timeout=5.0)

    saved = list(tmp_path.rglob('*_part.igs'))
    assert len(saved) == 1
    assert saved[0].read_bytes() == b'dummy igs bytes'
```

Run: `python -m pytest tests/test_calculate_queue_integration.py -v`
Expected: FAIL — no file saved yet (Step 4 not applied) — wait, this test is written *after* Step 4 in this plan's ordering, so run it once Step 4-5 are both in place; if run standalone before Step 4 it correctly fails, confirming the test is real.

- [ ] **Step 7: Confirm the full suite passes**

Run: `python -m pytest tests/ -v`
Expected: all passing (47 from Task 1 + 2 from Step 3 + 1 from Step 6 = 50), 0 failures.

- [ ] **Step 8: Commit**

```bash
git add main.py tests/test_upload_persistence.py tests/test_calculate_queue_integration.py
git commit -m "feat(backend): persist original upload files per-session, log their paths on calc start/done"
```

---

### Task 3: Entry-point DEBUG logging for currently-silent handlers

**Files:**
- Modify: `main.py` — `handle_calculate_tile`, `handle_convert_igs_to_stl`, `handle_log_calculation`, `download_results`, `calc_log_image`
- Test: extend `tests/test_calculate_queue_integration.py` and `tests/test_convert_igs_to_stl_queue.py`

**Interfaces:**
- Produces: nothing new consumed elsewhere — purely additive log lines.
- Consumes: `_log_extra` from Task 1 (already merged by the time this task runs).

**Deliberately excluded:** `handle_calculate` (already logs an INFO line on entry — see `main.py`'s `[CALC] {filename} mode=...` line), `on_connect`/`on_disconnect` (already log INFO on entry), `index`/`view_log`/`view_full_log` (plain page-render routes — logging every page view adds no debugging value and would spam the log on every visit).

- [ ] **Step 1: Add entry logging to `handle_calculate_tile`**

Currently starts:

```python
@socketio.on('calculate_tile')
def handle_calculate_tile(data):
    try:
        p1, p2, p3 = data['values']
```

becomes:

```python
@socketio.on('calculate_tile')
def handle_calculate_tile(data):
    logger.debug("[CALCULATE_TILE] request received", extra=_log_extra(request.sid))
    try:
        p1, p2, p3 = data['values']
```

- [ ] **Step 2: Add entry logging to `handle_convert_igs_to_stl`**

Currently starts:

```python
@app.route('/convert_igs_to_stl', methods=['POST'])
def handle_convert_igs_to_stl():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
```

becomes:

```python
@app.route('/convert_igs_to_stl', methods=['POST'])
def handle_convert_igs_to_stl():
    logger.debug("[IGS2STL] request received", extra=_log_extra(None))
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
```

(No `sid` exists for this plain HTTP POST — same as the existing comment a few lines down already explains for `dll_background`'s current-sid tracking — so `_log_extra(None)` is used, which resolves to `ip='?'`/`user_agent='?'` rather than raising.)

- [ ] **Step 3: Add entry logging to `handle_log_calculation`**

Currently starts:

```python
@app.route('/log-calculation', methods=['POST'])
def handle_log_calculation():
    if 'image' not in request.files:
        return jsonify({'error': 'No image provided'}), 400
```

becomes:

```python
@app.route('/log-calculation', methods=['POST'])
def handle_log_calculation():
    logger.debug("[CALC_LOG] request received", extra=_log_extra(None))
    if 'image' not in request.files:
        return jsonify({'error': 'No image provided'}), 400
```

- [ ] **Step 4: Add entry logging to `download_results`**

Currently starts:

```python
@app.route('/download-results', methods=['POST'])
def download_results():
    token     = request.form.get('token')
    file_type = request.form.get('file_type')
```

becomes:

```python
@app.route('/download-results', methods=['POST'])
def download_results():
    logger.debug("[DOWNLOAD] request received", extra=_log_extra(None))
    token     = request.form.get('token')
    file_type = request.form.get('file_type')
```

- [ ] **Step 5: Add entry logging to `calc_log_image`**

Currently starts:

```python
@app.route('/calc-log-image/<name>')
def calc_log_image(name):
    safe_name = os.path.basename(name)
```

becomes:

```python
@app.route('/calc-log-image/<name>')
def calc_log_image(name):
    logger.debug(f"[CALC_LOG] image requested: {name}", extra=_log_extra(None))
    safe_name = os.path.basename(name)
```

- [ ] **Step 6: Write the failing tests**

Append to `tests/test_convert_igs_to_stl_queue.py`:

```python
def test_entry_is_logged_at_debug_level(monkeypatch, caplog):
    import logging as _logging
    monkeypatch.setattr(main_module.dll_background, 'iges2stl', _fake_dll_success())
    client = main_module.app.test_client()

    with caplog.at_level(_logging.DEBUG, logger='lattice'):
        _post(client)

    assert any('[IGS2STL] request received' in r.message for r in caplog.records)
```

Append to `tests/test_calculate_queue_integration.py`:

```python
def test_calculate_tile_entry_is_logged_at_debug_level(caplog):
    c1 = main_module.socketio.test_client(main_module.app)
    c1.get_received()

    with caplog.at_level(logging.DEBUG, logger='lattice'):
        c1.emit('calculate_tile', {'type': 'cross', 'values': [0.2, 0.2, 0.4]})
        time.sleep(0.05)

    assert any('[CALCULATE_TILE] request received' in r.message for r in caplog.records)
```

(add `import logging` to the top of `tests/test_calculate_queue_integration.py` alongside its existing `import base64` / `import os` / `import time`.)

Run: `python -m pytest tests/test_convert_igs_to_stl_queue.py tests/test_calculate_queue_integration.py -v`
Expected: FAIL — the new DEBUG lines don't exist yet (run this before Steps 1-5, or trust the assertion logic and verify pass after — either order is fine per the skill; this plan lists implementation before the test for readability, but TDD means writing the test first in practice).

- [ ] **Step 7: Confirm all tests pass**

Run: `python -m pytest tests/ -v`
Expected: all passing (50 + 2 new = 52), 0 failures.

- [ ] **Step 8: Commit**

```bash
git add main.py tests/test_convert_igs_to_stl_queue.py tests/test_calculate_queue_integration.py
git commit -m "feat(backend): add DEBUG entry logging to handlers that were silent until success/failure"
```

---

### Task 4: Internal-step DEBUG logging around the DLL call and compression

**Files:**
- Modify: `main.py` — `_run_calculate_dll_phase`, `_finish_calculate`
- Test: extend `tests/test_calculate_queue_integration.py`

**Interfaces:**
- Produces / Consumes: nothing new — purely additive log lines inside functions Task 2 already modified (different lines; no conflict, since Task 2 only touched the two summary log lines and this task adds new lines around them).

- [ ] **Step 1: Add step logging in `_run_calculate_dll_phase`, bracketing the DLL call**

Currently (`main.py`, inside `_run_calculate_dll_phase`, after the args are unpacked and before `new_token`/`out_folder` setup):

```python
    curr_num_tiles   = (c_int * 3)(nt1, nt2, nt3)
    curr_graded      = (c_double * 2)(g1, g2)
    curr_tile_params = (c_double * 3)(p1, p2, p3)

    new_token  = str(uuid.uuid4())
```

becomes:

```python
    curr_num_tiles   = (c_int * 3)(nt1, nt2, nt3)
    curr_graded      = (c_double * 2)(g1, g2)
    curr_tile_params = (c_double * 3)(p1, p2, p3)
    logger.debug(f"[CALC] surface decoded  {len(igs_bytes)} bytes", extra=_log_extra(sid))

    new_token  = str(uuid.uuid4())
```

Then, immediately before the `t_dll_start = time.time()` line (right before the `try:` that calls `do_Ruling`/`do_extrusion`/`dispatch_fn`):

```python
    t_dll_start = time.time()
    dll_instance.set_current_sid(sid)
    try:
        logger.info(f"[CALC] -> {calc_mode}  filename={filename}  inputs={p.get('saved_input_paths', [])}", extra=_log_extra(sid))
```

becomes:

```python
    t_dll_start = time.time()
    dll_instance.set_current_sid(sid)
    try:
        logger.info(f"[CALC] -> {calc_mode}  filename={filename}  inputs={p.get('saved_input_paths', [])}", extra=_log_extra(sid))
        logger.debug("[CALC] invoking DLL", extra=_log_extra(sid))
```

And immediately after `t_dll_end = time.time()` (right after the DLL call's `try/except/finally` block completes, before the `if not stl_content:` check):

```python
    finally:
        dll_instance.set_current_sid(None)
    t_dll_end = time.time()

    if not stl_content:
```

becomes:

```python
    finally:
        dll_instance.set_current_sid(None)
    t_dll_end = time.time()
    logger.debug(f"[CALC] DLL returned  {round((t_dll_end - t_dll_start) * 1000)}ms", extra=_log_extra(sid))

    if not stl_content:
```

- [ ] **Step 2: Add step logging in `_finish_calculate`, bracketing compression**

Currently:

```python
        try:
            t_comp_start = time.time()
            compressed_b64 = compress_text_to_b64_gz(stl_content)
            t_comp_end = time.time()
            comp_kb = len(base64.b64decode(compressed_b64)) / 1024
        except Exception as exc:
```

becomes:

```python
        logger.debug("[CALC] compressing result", extra=_log_extra(sid))
        try:
            t_comp_start = time.time()
            compressed_b64 = compress_text_to_b64_gz(stl_content)
            t_comp_end = time.time()
            comp_kb = len(base64.b64decode(compressed_b64)) / 1024
            logger.debug(f"[CALC] compression done  {comp_kb:.0f}KB", extra=_log_extra(sid))
        except Exception as exc:
```

- [ ] **Step 3: Write the failing test**

Append to `tests/test_calculate_queue_integration.py`:

```python
def test_calculate_logs_internal_steps_at_debug_level(monkeypatch, caplog):
    _install_fake_revolution(monkeypatch, delay=0.02)
    c1 = main_module.socketio.test_client(main_module.app)
    c1.get_received()

    with caplog.at_level(logging.DEBUG, logger='lattice'):
        c1.emit('calculate', _calc_payload())

        def got_result():
            events = c1.get_received()
            return any(e['name'] == 'result' for e in events)

        assert _wait_until(got_result, timeout=5.0)

    messages = [r.message for r in caplog.records]
    assert any('[CALC] surface decoded' in m for m in messages)
    assert any('[CALC] invoking DLL' in m for m in messages)
    assert any('[CALC] DLL returned' in m for m in messages)
    assert any('[CALC] compressing result' in m for m in messages)
    assert any('[CALC] compression done' in m for m in messages)
```

Run: `python -m pytest tests/test_calculate_queue_integration.py -v`
Expected: FAIL — new DEBUG lines don't exist yet.

- [ ] **Step 4: Confirm the full suite passes**

Run: `python -m pytest tests/ -v`
Expected: all passing (52 + 1 = 53), 0 failures.

- [ ] **Step 5: Commit**

```bash
git add main.py tests/test_calculate_queue_integration.py
git commit -m "feat(backend): add DEBUG step logging bracketing the DLL call and compression"
```

---

### Task 5: Thread the saved input path(s) into the screenshot log entry

**Files:**
- Modify: `main.py` (result emit, `handle_log_calculation`), `react_frontend/src/api/types.ts`, `react_frontend/src/api/socketClient.ts`, `react_frontend/src/api/httpClient.ts`, `react_frontend/src/pages/ToolPage.tsx`
- Test: `react_frontend/src/api/__tests__/httpClient.test.ts`, `react_frontend/src/api/__tests__/socketClient.test.ts`

**Interfaces:**
- Consumes: `payload['saved_input_paths']` from Task 2 (must be merged first — this task reads that field when building the `result` emit).
- Produces: `ModelSTLResult.saved_input_paths?: string[]`, `logCalculation(image, filename, args, savedInputPaths?)`.

- [ ] **Step 1: Backend — add `saved_input_paths` to the `result` emit**

In `_finish_calculate` (`main.py`), the `socketio.emit('result', {...})` block currently:

```python
        socketio.emit('result', {
            'filename_reduced': os.path.splitext(os.path.basename(filename))[0] + '_reduced.stl',
            'kind':             'model_stl',
            'stl_gz_b64':       compressed_b64,
            'timings':          timings,
            'args_echo':        args,
            'filename':         filename,
            'download_token':   new_token,
        }, room=sid)
```

becomes:

```python
        socketio.emit('result', {
            'filename_reduced': os.path.splitext(os.path.basename(filename))[0] + '_reduced.stl',
            'kind':             'model_stl',
            'stl_gz_b64':       compressed_b64,
            'timings':          timings,
            'args_echo':        args,
            'filename':         filename,
            'download_token':   new_token,
            'saved_input_paths': saved_input_paths,
        }, room=sid)
```

(`saved_input_paths` local already exists in this function from Task 2, Step 5.)

- [ ] **Step 2: Backend — `handle_log_calculation` reads and logs it**

Currently:

```python
    filename = metadata.get('filename', '')
    args     = metadata.get('args', {})
```
...
```python
    calc_logger.info(
        f"[CALC_LOG] {filename}"
        f"  tile={args.get('tileType')}  mode={args.get('calcMode')}"
        f"  tiles=({args.get('nt1')},{args.get('nt2')},{args.get('nt3')})"
        f"  g=({args.get('g1')},{args.get('g2')})"
        f"  p=({args.get('p1')},{args.get('p2')},{args.get('p3')})",
        extra={'calc_filename': filename, 'calc_args': args, 'image': f'images/{image_name}'},
    )
```

becomes:

```python
    filename = metadata.get('filename', '')
    args     = metadata.get('args', {})
    saved_input_paths = metadata.get('saved_input_paths', [])
```
...
```python
    calc_logger.info(
        f"[CALC_LOG] {filename}"
        f"  tile={args.get('tileType')}  mode={args.get('calcMode')}"
        f"  tiles=({args.get('nt1')},{args.get('nt2')},{args.get('nt3')})"
        f"  g=({args.get('g1')},{args.get('g2')})"
        f"  p=({args.get('p1')},{args.get('p2')},{args.get('p3')})"
        f"  inputs={saved_input_paths}",
        extra={
            'calc_filename': filename, 'calc_args': args, 'image': f'images/{image_name}',
        },
    )
```

- [ ] **Step 3: Frontend types — `ModelSTLResult` gains the field**

In `react_frontend/src/api/types.ts`, `ModelSTLResult` currently:

```typescript
export interface ModelSTLResult {
  kind: 'model_stl';
  filename: string;
  /** base64( gzip( ASCII-STL ) ) */
  stl_gz_b64: string;
  download_token: string;
  timings: Timings;
  args_echo?: CalculateArgs;
}
```

becomes:

```typescript
export interface ModelSTLResult {
  kind: 'model_stl';
  filename: string;
  /** base64( gzip( ASCII-STL ) ) */
  stl_gz_b64: string;
  download_token: string;
  timings: Timings;
  args_echo?: CalculateArgs;
  /** Paths (server-side) to the original surface file(s) this calculation used. */
  saved_input_paths?: string[];
}
```

- [ ] **Step 4: Frontend — `socketClient.ts` carries the field through**

`RawResult` interface currently:

```typescript
interface RawResult {
  kind?: string;
  filename?: string;
  stl_gz_b64?: string;
  timings?: TileSTLResult['timings'];
  args_echo?: ModelSTLResult['args_echo'];
  download_token?: string;
}
```

becomes:

```typescript
interface RawResult {
  kind?: string;
  filename?: string;
  stl_gz_b64?: string;
  timings?: TileSTLResult['timings'];
  args_echo?: ModelSTLResult['args_echo'];
  download_token?: string;
  saved_input_paths?: ModelSTLResult['saved_input_paths'];
}
```

`handleRawResult`'s `model_stl` branch currently:

```typescript
      ? {
          kind: 'model_stl',
          filename: raw.filename ?? '',
          stl_gz_b64: raw.stl_gz_b64 ?? '',
          download_token: raw.download_token ?? '',
          timings: raw.timings!,
          args_echo: raw.args_echo,
        }
```

becomes:

```typescript
      ? {
          kind: 'model_stl',
          filename: raw.filename ?? '',
          stl_gz_b64: raw.stl_gz_b64 ?? '',
          download_token: raw.download_token ?? '',
          timings: raw.timings!,
          args_echo: raw.args_echo,
          saved_input_paths: raw.saved_input_paths,
        }
```

- [ ] **Step 5: Frontend — `logCalculation()` accepts and sends the field**

In `react_frontend/src/api/httpClient.ts`, currently:

```typescript
export async function logCalculation(image: Blob, filename: string, args: CalculateArgs): Promise<void> {
  const form = new FormData();
  form.append('image', image, 'snapshot.png');
  form.append('metadata', JSON.stringify({ filename, args }));
```

becomes:

```typescript
export async function logCalculation(
  image: Blob, filename: string, args: CalculateArgs, savedInputPaths: string[] = [],
): Promise<void> {
  const form = new FormData();
  form.append('image', image, 'snapshot.png');
  form.append('metadata', JSON.stringify({ filename, args, saved_input_paths: savedInputPaths }));
```

The new parameter defaults to `[]` and is appended last, so both existing call sites and existing tests that call `logCalculation(blob, filename, args)` with three arguments keep compiling and behaving exactly as before.

- [ ] **Step 6: Frontend — thread it from the result handler through to the call site**

In `react_frontend/src/pages/ToolPage.tsx`, `pendingSnapshotRef`'s type currently:

```typescript
  const pendingSnapshotRef = React.useRef<{ filename: string; args: CalculateArgs } | null>(null)
```

becomes:

```typescript
  const pendingSnapshotRef = React.useRef<{ filename: string; args: CalculateArgs; savedInputPaths: string[] } | null>(null)
```

The `onResult` handler's non-macro branch currently sets it:

```typescript
          if (payload.args_echo) {
            pendingSnapshotRef.current = { filename: payload.filename, args: payload.args_echo }
          }
```

becomes:

```typescript
          if (payload.args_echo) {
            pendingSnapshotRef.current = {
              filename: payload.filename, args: payload.args_echo,
              savedInputPaths: payload.saved_input_paths ?? [],
            }
          }
```

`handleAutoFitComplete`'s `logCalculation(...)` call currently:

```typescript
          logCalculation(blob, pending.filename, pending.args).catch(err => {
            console.warn('calc log snapshot failed to upload', err)
          })
```

becomes:

```typescript
          logCalculation(blob, pending.filename, pending.args, pending.savedInputPaths).catch(err => {
            console.warn('calc log snapshot failed to upload', err)
          })
```

- [ ] **Step 7: Write the failing frontend tests**

Append to `react_frontend/src/api/__tests__/httpClient.test.ts`, inside the existing `describe('logCalculation()', ...)` block:

```typescript
  it('includes saved_input_paths in the metadata when provided', async () => {
    fetchSpy.mockResolvedValue(new Response('{"ok":true}', { status: 200 }))

    const blob = new Blob(['fake-png-bytes'], { type: 'image/png' })
    await logCalculation(blob, 'mypart.igs', args, ['client_data/sid1/abc_mypart.igs'])

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    const form = init.body as FormData
    const metadata = JSON.parse(form.get('metadata') as string)
    expect(metadata.saved_input_paths).toEqual(['client_data/sid1/abc_mypart.igs'])
  })

  it('defaults saved_input_paths to an empty array when omitted', async () => {
    fetchSpy.mockResolvedValue(new Response('{"ok":true}', { status: 200 }))

    const blob = new Blob(['fake-png-bytes'], { type: 'image/png' })
    await logCalculation(blob, 'mypart.igs', args)

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    const form = init.body as FormData
    const metadata = JSON.parse(form.get('metadata') as string)
    expect(metadata.saved_input_paths).toEqual([])
  })
```

Append to `react_frontend/src/api/__tests__/socketClient.test.ts`, inside `describe('onResult()', ...)`:

```typescript
    it('carries saved_input_paths through for a model_stl result', () => {
      const handler = vi.fn()
      client.onResult(handler)

      const rawStl = {
        filename: 'MSExtrd.stl',
        stl_gz_b64: 'base64data',
        download_token: 'tok-1',
        saved_input_paths: ['client_data/sid1/abc_part.igs'],
        timings: { client_to_server_ms: 5, time_processed_ms: 100, time_compress_ms: 10, time_parsed_ms: 8, overall_ms: 123 },
      }
      getHandler('result')(rawStl)

      const received = handler.mock.calls[0][0]
      expect(received.saved_input_paths).toEqual(['client_data/sid1/abc_part.igs'])
    })
```

Run: `npx vitest run --project unit` (in `react_frontend/`)
Expected: FAIL — 3 new failures (the field doesn't exist on the types/implementation yet). If Steps 1-6 above are applied first (as this plan lists them), these tests should already pass on the first run — write-test-first practice still applies; confirm by temporarily reverting Step 5's default-parameter change to see the "defaults to empty array" test fail, then reapply.

- [ ] **Step 8: Confirm frontend tests pass**

Run: `npx tsc -p tsconfig.app.json --noEmit` (expect clean) and `npx vitest run --project unit` (expect 60+3=63 passed, same 4 known pre-existing failures unrelated to this branch, per this repo's established baseline).

- [ ] **Step 9: Confirm backend tests still pass**

Run: `python -m pytest tests/ -v`
Expected: 53 passed (no new backend tests in this task beyond Steps 1-2, which are exercised indirectly by existing `_finish_calculate`/`handle_log_calculation` coverage — no regression expected).

- [ ] **Step 10: Commit**

```bash
git add main.py react_frontend/src/api/types.ts react_frontend/src/api/socketClient.ts react_frontend/src/api/httpClient.ts react_frontend/src/pages/ToolPage.tsx react_frontend/src/api/__tests__/httpClient.test.ts react_frontend/src/api/__tests__/socketClient.test.ts
git commit -m "feat: thread saved original-upload paths from a calculation's result into its screenshot log entry"
```

---

### Task 6: Extract the log viewer into a shared script; `/viewlog` becomes surface-level by default

**Files:**
- Create: `static/log_viewer.js`
- Modify: `templates/log_view.html`
- Test: manual verification (no existing test harness covers Jinja templates or static JS in this repo — this task's own live check in Step 4 is the verification)

**Interfaces:**
- Produces: `window.initLogViewer(config)` — a function both this task's `log_view.html` and Task 7's rebuilt `full_log_view.html` call, where `config` is `{defaultLevels: string[], excBlocksExpandedByDefault: boolean, heading: string, otherPageHref: string, otherPageLabel: string}`.
- Consumes: nothing from earlier tasks — independent of the backend work in Tasks 1-5.

- [ ] **Step 1: Create `static/log_viewer.js`**, containing everything from `log_view.html`'s current inline `<script>` block (all of `main.py`'s existing `getPrefix`, `timeStr`, `esc`, `msgHtml`, `paramsSummary`, `entryHtml`, `render`, and the `socket.io` wiring), wrapped in one exported entry point and parameterized where `log_view.html` currently hardcodes values:

```javascript
function initLogViewer(config) {
    var LEVELS = ['INFO', 'DEBUG', 'WARNING', 'ERROR'];
    var active = new Set(config.defaultLevels);

    document.querySelector('h1').textContent = config.heading;

    var navLink = document.getElementById('other-page-link');
    navLink.href = config.otherPageHref;
    navLink.textContent = config.otherPageLabel;

    var fEl = document.getElementById('lvl-filters');
    LEVELS.forEach(function(lv) {
        var b = document.createElement('button');
        b.className = 'lvl-btn';
        b.dataset.level = lv;
        b.textContent = lv;
        if (!active.has(lv)) b.classList.add('off');
        b.onclick = function() {
            if (active.has(lv)) {
                if (active.size > 1) { active.delete(lv); b.classList.add('off'); }
            } else {
                active.add(lv); b.classList.remove('off');
            }
            render();
        };
        fEl.appendChild(b);
    });

    function getPrefix(msg) {
        var m = (msg || '').match(/^\[([A-Z0-9_]+)\]/);
        return m ? m[1] : null;
    }

    function timeStr(ts) {
        return ts ? ts.split(' ')[1].split(',')[0] : '';
    }

    function esc(s) {
        return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    function msgHtml(msg) {
        return esc(msg || '').replace(/(\[[A-Z0-9_]+\])/g, '<span class="prefix">$1</span>');
    }

    function paramsSummary(args) {
        if (!args) return '';
        var parts = [];
        if (args.tileType) parts.push('tile=' + args.tileType);
        if (args.calcMode) parts.push('mode=' + args.calcMode);
        if (args.nt1 != null) parts.push('tiles=(' + args.nt1 + ',' + args.nt2 + ',' + args.nt3 + ')');
        if (args.g1 != null) parts.push('g=(' + args.g1 + ',' + args.g2 + ')');
        return parts.join('  ');
    }

    var allEntries = [];

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
        var excOpenAttr = config.excBlocksExpandedByDefault ? ' open' : '';
        var excBlock = e.exc
            ? (config.excBlocksExpandedByDefault
                ? '<pre class="exc-block">' + esc(e.exc) + '</pre>'
                : '<details' + excOpenAttr + '><summary style="cursor:pointer;color:#e06c75;font-size:11px;margin:3px 0 0 90px;">Exception</summary><pre class="exc-block">' + esc(e.exc) + '</pre></details>')
            : '';
        return '<div class="log-entry ' + lc + '">'
            + '<div class="log-line">'
            + '<span class="ts">' + esc(timeStr(e.ts)) + '</span>'
            + '<span class="badge ' + lv + '">' + lv + '</span>'
            + '<span class="msg">' + msgHtml(e.msg) + '</span>'
            + sid
            + '</div>'
            + calcLogExtra
            + excBlock
            + '</div>';
    }

    function render() {
        var q = (document.getElementById('search').value || '').toLowerCase();
        var sort = document.getElementById('sort').value;
        var group = document.getElementById('group').value;
        var out = document.getElementById('log-output');

        var filtered = allEntries.filter(function(e) {
            return active.has(e.level || 'INFO')
                && (!q || (e.msg || '').toLowerCase().includes(q) || (e.sid || '').toLowerCase().includes(q));
        });

        if (sort === 'desc') filtered = filtered.slice().reverse();

        document.getElementById('stats').textContent = filtered.length + ' / ' + allEntries.length + ' entries';

        if (!filtered.length) {
            out.innerHTML = '<div class="empty">No matching entries</div>';
            return;
        }

        var atBottom = out.scrollHeight - out.scrollTop - out.clientHeight < 40;

        if (group === 'none') {
            out.innerHTML = filtered.map(function(e){ return entryHtml(e, false); }).join('');
        } else if (group === 'sid') {
            var buckets = new Map();
            filtered.forEach(function(e) {
                var k = e.sid || '(no sid)';
                if (!buckets.has(k)) buckets.set(k, []);
                buckets.get(k).push(e);
            });
            var html = '';
            buckets.forEach(function(rows, sid) {
                html += '<div class="group-hdr">SID: ' + esc(sid) + '&nbsp;&nbsp;<span>' + rows.length + ' entries</span></div>';
                html += rows.map(function(e){ return entryHtml(e, true); }).join('');
            });
            out.innerHTML = html;
        } else if (group === 'prefix') {
            var buckets2 = new Map();
            filtered.forEach(function(e) {
                var k = getPrefix(e.msg) || '(no tag)';
                if (!buckets2.has(k)) buckets2.set(k, []);
                buckets2.get(k).push(e);
            });
            var html2 = '';
            buckets2.forEach(function(rows, tag) {
                html2 += '<div class="group-hdr">[' + esc(tag) + ']&nbsp;&nbsp;<span>' + rows.length + ' entries</span></div>';
                html2 += rows.map(function(e){ return entryHtml(e, false); }).join('');
            });
            out.innerHTML = html2;
        }

        if (atBottom) out.scrollTop = out.scrollHeight;
    }

    document.getElementById('search').oninput = render;
    document.getElementById('sort').onchange = render;
    document.getElementById('group').onchange = render;

    var socket = io();

    socket.on('connect', function() {
        allEntries = [];
        document.getElementById('log-output').innerHTML = '<p style="padding:12px;color:#4b5263;">Connected. Streaming…</p>';
    });

    socket.on('log_update', function(msg) {
        var entry;
        try {
            entry = JSON.parse(msg.data);
        } catch(e) {
            entry = { msg: msg.data, level: 'INFO', ts: '' };
        }
        allEntries.push(entry);
        render();
    });

    socket.on('log_error', function(msg) {
        allEntries.push({ msg: 'SERVER ERROR: ' + msg.data, level: 'ERROR', ts: '' });
        render();
    });

    socket.on('disconnect', function() {
        allEntries.push({ msg: 'Disconnected. Refresh to reconnect.', level: 'WARNING', ts: '' });
        render();
    });
}
```

Two behavioral additions over the current inline script, both required by the spec: `config.excBlocksExpandedByDefault` (exception blocks default-collapsed behind a `<details>` on `/viewlog`, default-expanded as a plain `<pre>` on `/viewfulllog` — Task 7 sets this `true`), and the `#other-page-link` wiring the cross-navigation link's `href`/text from `config`.

- [ ] **Step 2: Rewrite `templates/log_view.html`** to be a thin shell: keep all existing CSS and the toolbar/log-wrap markup, but replace the inline `<script>` block, add the nav link, and drop the `oninput`/`onchange` attributes from the toolbar controls — Step 1's `initLogViewer` now wires `.oninput`/`.onchange` on those same elements itself (`document.getElementById('search').oninput = render;` etc.), and `render` is a name local to `initLogViewer`'s closure, not a global — leaving the inline attributes in place would reference a `render()` that doesn't exist at global scope. The toolbar's `<input>`/`<select>` lines currently:

```html
    <input type="text" id="search" placeholder="Search messages or SID…" oninput="render()">
```
```html
    <select id="sort" onchange="render()">
```
```html
    <select id="group" onchange="render()">
```

become:

```html
    <input type="text" id="search" placeholder="Search messages or SID…">
```
```html
    <select id="sort">
```
```html
    <select id="group">
```

(only the `oninput`/`onchange` attributes are removed — every other attribute, the `<option>` children, and everything else in the toolbar stays identical.)

The `<h1>` line currently:

```html
<h1>&#9679; Live — {{ log_file }}</h1>
```

becomes:

```html
<h1 id="page-heading">&#9679; Live — {{ log_file }}</h1>
<a id="other-page-link" href="#" style="display:block;text-align:center;font-size:11px;color:#61afef;text-decoration:none;margin-bottom:8px;"></a>
```

And the closing scripts, currently:

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/socket.io/4.1.2/socket.io.js"></script>
<script>
    // ── In-memory log store ──────────────────────────────────────────────────
    ... [everything through the closing `});` of the disconnect handler] ...
</script>
```

become:

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/socket.io/4.1.2/socket.io.js"></script>
<script src="{{ url_for('static', filename='log_viewer.js') }}"></script>
<script>
    initLogViewer({
        defaultLevels: ['INFO', 'WARNING', 'ERROR'],
        excBlocksExpandedByDefault: false,
        heading: '● Live — {{ log_file }}',
        otherPageHref: '/viewfulllog',
        otherPageLabel: 'Full detail →',
    });
</script>
```

(`heading` is set in JS rather than left as static Jinja-rendered text because Step 1's `initLogViewer` already does `document.querySelector('h1').textContent = config.heading` for symmetry with Task 7's page, which needs its heading set the same way — keeping both pages' heading logic identical avoids a special case.)

- [ ] **Step 3: Verify the static file is served**

Run: `python -c "import main; c = main.app.test_client(); r = c.get('/static/log_viewer.js'); assert r.status_code == 200, r.status_code; assert b'initLogViewer' in r.data"`
Expected: no assertion error (exit code 0).

- [ ] **Step 4: Manual live verification**

Start the backend (`python main.py`), open `http://localhost:5003/viewlog` in a browser, confirm: the page loads with its usual styling, the level filter buttons show `DEBUG` as off (dimmed) by default while `INFO`/`WARNING`/`ERROR` are on, new log lines still stream in live (trigger one via any request to the running server), and the "Full detail →" link is visible and present (it will 404 until Task 7 rebuilds `/viewfulllog` — that's expected at this point in the plan).

- [ ] **Step 5: Commit**

```bash
git add static/log_viewer.js templates/log_view.html
git commit -m "refactor(frontend): extract log viewer into a shared, parameterized script; /viewlog defaults to hiding DEBUG"
```

---

### Task 7: Rebuild `/viewfulllog` as the live full-detail view

**Files:**
- Modify: `templates/full_log_view.html`, `main.py:1009-1019` (`view_full_log()`)
- Test: manual verification (same rationale as Task 6)

**Interfaces:**
- Consumes: `static/log_viewer.js`'s `initLogViewer(config)` from Task 6 — this task cannot start until Task 6 is merged.

- [ ] **Step 1: Rewrite `templates/full_log_view.html`** to reuse `log_view.html`'s markup/CSS wholesale (they must now render visually consistent pages, differing only in default filter state and heading) rather than keeping the old minimal `<pre>`-dump styling:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Full Log Viewer</title>
    <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:monospace;font-size:13px;background:#21252b;color:#abb2bf;padding:16px 20px}
        h1{color:#61afef;text-align:center;margin-bottom:16px;font-size:1em;letter-spacing:.05em;text-transform:uppercase}
        .toolbar{display:flex;flex-wrap:wrap;gap:8px;padding:10px 0 12px;align-items:center}
        .toolbar input[type=text]{flex:1;min-width:140px;height:32px;font-size:12px;font-family:monospace;padding:0 10px;background:#282c34;border:1px solid #3e4451;border-radius:6px;color:#abb2bf}
        .toolbar input[type=text]::placeholder{color:#4b5263}
        .filters{display:flex;gap:6px;flex-wrap:wrap}
        .lvl-btn{font-size:11px;font-weight:600;padding:3px 10px;border-radius:20px;border:1px solid transparent;cursor:pointer;transition:opacity .15s}
        .lvl-btn[data-level=INFO]{background:#2d4a2d;color:#98c379;border-color:#3a6a3a}
        .lvl-btn[data-level=DEBUG]{background:#3e4451;color:#abb2bf;border-color:#555}
        .lvl-btn[data-level=WARNING]{background:#4a3d1a;color:#e5c07b;border-color:#6a5a2a}
        .lvl-btn[data-level=ERROR]{background:#4a1f22;color:#e06c75;border-color:#6a3035}
        .lvl-btn.off{opacity:.35}
        select{height:32px;font-size:12px;padding:0 8px;background:#282c34;border:1px solid #3e4451;border-radius:6px;color:#abb2bf}
        .sep{width:1px;height:24px;background:#3e4451;align-self:center}
        .stats{font-size:11px;color:#4b5263;white-space:nowrap}
        .log-wrap{background:#282c34;border-radius:8px;border:1px solid #3e4451;max-height:80vh;overflow-y:auto}
        .log-entry{display:flex;flex-direction:column;padding:3px 12px;border-left:3px solid transparent;border-bottom:1px solid rgba(255,255,255,.04)}
        .log-entry:hover{background:rgba(255,255,255,.03)}
        .log-entry.E{border-left-color:#e06c75;background:rgba(224,108,117,.06)}
        .log-entry.W{border-left-color:#e5c07b;background:rgba(229,192,123,.05)}
        .log-line{display:flex;gap:8px;align-items:baseline}
        .ts{color:#4b5263;flex-shrink:0;min-width:68px;font-size:11px}
        .badge{flex-shrink:0;font-weight:600;font-size:10px;padding:1px 6px;border-radius:3px;min-width:54px;text-align:center}
        .badge.INFO{background:#2d4a2d;color:#98c379}
        .badge.DEBUG{background:#3e4451;color:#636d83}
        .badge.WARNING{background:#4a3d1a;color:#e5c07b}
        .badge.ERROR{background:#4a1f22;color:#e06c75}
        .msg{color:#abb2bf;flex:1;white-space:pre-wrap;overflow-wrap:break-word}
        .prefix{color:#c678dd;font-weight:bold}
        .sid-pill{flex-shrink:0;background:#1d3248;color:#61afef;font-size:10px;padding:1px 7px;border-radius:10px;cursor:default}
        .exc-block{margin:3px 0 4px 90px;padding:5px 10px;background:rgba(224,108,117,.1);border-left:2px solid #e06c75;color:#e06c75;font-size:11px;white-space:pre-wrap;border-radius:0 3px 3px 0}
        .calc-log-extra{display:flex;align-items:center;gap:8px;margin:3px 0 4px 90px;padding:4px 8px;background:rgba(97,175,239,.06);border-left:2px solid #61afef;border-radius:0 3px 3px 0}
        .calc-log-thumb{width:48px;height:48px;object-fit:cover;border-radius:4px;border:1px solid #3e4451}
        .calc-log-filename{font-size:11px;color:#abb2bf}
        .calc-log-params{font-size:10px;color:#4b5263}
        .empty{padding:20px;color:#4b5263;text-align:center;font-size:12px}
        .group-hdr{padding:4px 12px;background:#1e2127;font-size:10px;color:#61afef;letter-spacing:.04em;border-bottom:1px solid #3e4451;position:sticky;top:0;z-index:1}
        .group-hdr span{color:#4b5263}
    </style>
</head>
<body>
<h1 id="page-heading">&#9679; Full Detail — {{ log_file }}</h1>
<a id="other-page-link" href="#" style="display:block;text-align:center;font-size:11px;color:#61afef;text-decoration:none;margin-bottom:8px;"></a>

<div class="toolbar">
    <input type="text" id="search" placeholder="Search messages or SID…">
    <div class="sep"></div>
    <div class="filters" id="lvl-filters"></div>
    <div class="sep"></div>
    <select id="sort">
        <option value="asc">Oldest first</option>
        <option value="desc">Newest first</option>
    </select>
    <select id="group">
        <option value="none">No grouping</option>
        <option value="sid">Group by SID</option>
        <option value="prefix">Group by [TAG]</option>
    </select>
    <div class="sep"></div>
    <span class="stats" id="stats"></span>
</div>

<div class="log-wrap" id="log-output">
    <p style="padding:12px;color:#4b5263;">Waiting for connection…</p>
</div>

<script src="https://cdnjs.cloudflare.com/ajax/libs/socket.io/4.1.2/socket.io.js"></script>
<script src="{{ url_for('static', filename='log_viewer.js') }}"></script>
<script>
    initLogViewer({
        defaultLevels: ['INFO', 'DEBUG', 'WARNING', 'ERROR'],
        excBlocksExpandedByDefault: true,
        heading: '● Full Detail — {{ log_file }}',
        otherPageHref: '/viewlog',
        otherPageLabel: '← Surface view',
    });
</script>
</body>
</html>
```

(This page's `<input>`/`<select>` elements never had inline `oninput`/`onchange` attributes to begin with — written fresh in this task, matching the already-cleaned-up markup Task 6 leaves `log_view.html` in.)

- [ ] **Step 2: Simplify `view_full_log()`**

Currently (`main.py`):

```python
@app.route('/viewfulllog')
def view_full_log():
    try:
        with open(LOG_FILE_NAME, 'r', encoding='utf-8') as f:
            log_content = f.read()
    except FileNotFoundError:
        log_content = f"Error: Log file '{LOG_FILE_NAME}' not found."
    except Exception as exc:
        log_content = f"An unexpected error occurred: {exc}"
    return render_template('full_log_view.html', log_file=LOG_FILE_NAME, log_content=log_content)
```

becomes:

```python
@app.route('/viewfulllog')
def view_full_log():
    return render_template('full_log_view.html', log_file=LOG_FILE_NAME)
```

(matches `view_log()`'s existing shape exactly: `return render_template('log_view.html', log_file=LOG_FILE_NAME)`.)

- [ ] **Step 3: Manual live verification**

With the backend running, open `http://localhost:5003/viewfulllog`: confirm it now streams live (not a static dump — trigger a new request elsewhere and watch a new entry appear without reloading), `DEBUG` is on by default (all four level buttons active), any exception in the log shows its traceback expanded rather than behind a toggle, and the "← Surface view" link at the top goes to `/viewlog`. Then reload `/viewlog` and confirm its "Full detail →" link now correctly reaches this rebuilt page.

- [ ] **Step 4: Commit**

```bash
git add templates/full_log_view.html main.py
git commit -m "feat(frontend): rebuild /viewfulllog as a live full-detail view sharing log_viewer.js with /viewlog"
```

---

## Self-Review Notes (for the plan author, not a task)

- **Spec coverage:** §1 (error safety net) → Task 1. §2 (entry + internal-step logging) → Tasks 3-4. §3 (fingerprinting) → Task 1. §4 (upload persistence + log pointers) → Tasks 2, 5. §5 (viewer restructuring) → Tasks 6-7. Every spec section has at least one task.
- **Task ordering respects real dependencies:** Task 2 before Task 5 (payload field must exist before it can be threaded into the result emit). Task 6 before Task 7 (the shared script must exist before `full_log_view.html` can call it). Tasks 3-4 depend on Task 1 only for `_log_extra` already including `user_agent` (cosmetic — they'd still work without it, just log one fewer field) — no hard ordering requirement beyond "after Task 1" for cleanliness.
- **Type consistency checked:** `_save_original_upload`'s signature (Task 2) matches every call site written in Task 2 itself. `saved_input_paths` is spelled identically across `main.py` (Task 2 + 5), `types.ts`, `socketClient.ts`, and `ToolPage.tsx` (all Task 5) — `savedInputPaths` (camelCase) is used only for the two frontend-local variables (`pendingSnapshotRef`'s field, `logCalculation`'s parameter), matching this codebase's existing snake_case-wire / camelCase-local convention (e.g. `stl_gz_b64` on the wire vs. camelCase locals elsewhere in `ToolPage.tsx`).
