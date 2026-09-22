# Enhanced Logging & Observability — Design Spec

**Date:** 2026-09-22
**Target branch:** a new branch off `queue` (this branch already has the calc-queue / background-DLL-lane system; the shared logging infra — JSON formatter, `calc_log`, screenshots, log viewer, Ctrl+Shift+L — is identical on `dev` and `queue`, inherited from a common ancestor)
**Files primarily affected:** `main.py`, `templates/log_view.html`, `templates/full_log_view.html`

---

## Context

The app already has a reasonably solid logging foundation: JSON-formatted log lines (`_JsonFormatter`) written to a rotating `lattice.log`, a separate `calc_log/log.jsonl` + `calc_log/images/*.png` recording one entry (with a screenshot of the rendered result) per completed calculation, a live log viewer at `/viewlog` (streamed over Socket.IO, filterable by level, searchable, groupable by SID/prefix), a static full-file dump at `/viewfulllog`, and a hidden `Ctrl+Shift+L` shortcut that opens `/viewlog`.

Four gaps were identified during a review of current behavior:

1. **Error coverage is inconsistent.** Most handlers wrap their risky operations in `try/except` with `logger.exception(...)`, but there's no blanket safety net — a handler that's missing a `try/except` (like `handle_calculate_tile` was, before a prior fix) fails silently server-side with nothing in the log.
2. **No visibility into the normal flow.** Logging today is almost entirely reactive (something went wrong) or a summary at the end (`[CALC] done ...`). There's no line marking "a request came in and started being handled," and no lines at the meaningful steps in between (surface decoded, DLL about to run, compression started) — so a slow or stuck request can't be traced from the log, only diagnosed after the fact from a final summary or an error.
3. **Client fingerprinting is thin.** Every log line already carries `sid` and `ip` (via the `_log_extra(sid)` helper); nothing else about the client is captured.
4. **Uploaded surface files are never persisted.** `temp_igs_file()` writes the decoded upload to a temp file for the duration of one DLL call and deletes it in the same breath (`finally: os.remove(...)`). If a calculation needs to be reproduced later, the original input is already gone.

Separately, the current two log pages (`/viewlog` live, `/viewfulllog` static full-text dump) don't offer an obvious way to move between them, and `/viewfulllog`'s "full" in its name doesn't actually mean more *detail* today — it's the same log content as `/viewlog`, just as a static dump instead of a live stream.

---

## Goals

- Every unhandled server-side exception ends up in the log, with a traceback, regardless of whether the handler that raised it has its own `try/except`.
- Every request/event handler logs that it was invoked, and logs its meaningful internal steps — enough to trace a request's full path through the server without needing to reproduce a bug to see where it went. Not the DLL's own internals — that's opaque native code, out of scope.
- Every log line that already carries `sid`/`ip` also carries the browser's User-Agent string, at no extra call-site cost.
- The original surface file(s) behind a real (non-silent) calculation are saved to disk, per-session, and the `[CALC]` start/done log lines (and the existing `[CALC_LOG]` screenshot entry) all point at the exact saved file(s) used for that run.
- The two existing log routes gain a real distinction — `/viewlog` stays the surface-level live view (default: hide `DEBUG`); `/viewfulllog` becomes a live full-detail view (default: show everything, including the new step-by-step `DEBUG` lines) — and a one-click way to switch between them from either page.

## Non-Goals

- **No new identity system.** "User ID" means the existing Socket.IO `sid`, exactly as already used everywhere else in the app. No cookies, no localStorage UUID, no login.
- **No persistent-across-reload upload folder.** A reload gets a new `sid` and, from then on, a new upload folder — this matches how every other piece of per-session state in the app already behaves (`client_state`, `connected_clients`, `last_results/<token>/`).
- **Result files are still not persisted long-term.** Nothing changes here — `last_results/<token>/` remains cleaned up on disconnect exactly as today. Only the *original inputs* are newly saved; outputs can always be regenerated from them.
- **No instrumentation inside the DLL call itself.** Logging brackets the DLL call (before/after); it doesn't and can't see inside it.
- **No new page.** The full-detail view reuses the existing `/viewfulllog` route rather than adding a third URL.

---

## 1. Global error safety net

Two handlers, added once near the other app/socketio setup code:

```python
@app.errorhandler(Exception)
def handle_uncaught_http_exception(exc):
    logger.exception(f"[UNCAUGHT] {request.method} {request.path}", extra=_log_extra(getattr(request, 'sid', None)))
    return jsonify({'error': 'Internal server error'}), 500


@socketio.on_error_default
def handle_uncaught_socketio_exception(exc):
    sid = request.sid if request else None
    logger.exception(f"[UNCAUGHT] socketio handler failed", extra=_log_extra(sid))
```

These are a backstop, not a replacement for the existing per-handler `try/except` blocks — those stay exactly as they are (they emit a specific, useful `error` event to the client; the backstop only guarantees the log line exists even where a handler has no such block, current or future). `_log_extra` already tolerates an unknown/missing sid (`_client_ip` returns `'?'` via `.get(..., '?')`), so passing a possibly-`None` sid here is safe.

## 2. Entry + internal-step logging

**Entry logging** — one `logger.debug(...)` line at the top of every route and every `@socketio.on(...)` handler that doesn't already have an equivalent line, e.g.:

```python
@socketio.on('calculate_tile')
def handle_calculate_tile(data):
    logger.debug("[CALCULATE_TILE] request received", extra=_log_extra(request.sid))
    ...
```

Handlers that already log an INFO line immediately on entry (`handle_calculate`'s `[CALC] {filename} mode=...` line) don't need a redundant DEBUG line — the existing one already marks arrival; only handlers currently *silent* until something happens or fails get this treated as a gap and closed the same way the 2026-06-09 logging-gaps pass closed similar gaps.

**Internal-step logging** — inside each handler, one `DEBUG` line at each meaningful step, bracketing (not entering) the DLL call:

```python
logger.debug(f"[CALC] surface decoded  {len(igs_bytes)} bytes", extra=_log_extra(sid))
...
logger.debug("[CALC] invoking DLL", extra=_log_extra(sid))
# ... DLL call happens here, untouched ...
logger.debug(f"[CALC] DLL returned  {t_dll_ms}ms", extra=_log_extra(sid))
logger.debug("[CALC] compressing result", extra=_log_extra(sid))
...
logger.debug(f"[CALC] compression done  {comp_kb:.0f}KB", extra=_log_extra(sid))
```

All of this is `DEBUG` level, additive on top of the existing INFO/WARNING/ERROR lines — nothing currently visible at the default filter changes.

The implementation plan enumerates the exact handlers and exact insertion points (`handle_calculate`, `_run_calculate_job`/`_finish_calculate`, `handle_calculate_tile`, `handle_convert_igs_to_stl`, `handle_log_calculation`, `download_results`, plus `on_connect`/`on_disconnect` where useful) — this spec fixes the *pattern*, not the full line-by-line enumeration.

## 3. Client fingerprinting

`_log_extra` gains one more field, read once per log call from the same place `ip` already comes from:

```python
def _log_extra(sid):
    return {'sid': sid, 'ip': _client_ip(sid), 'user_agent': _client_user_agent(sid)}
```

`user_agent` is captured once, at connect time, the same way `ip_address_reported` already is:

```python
connected_clients[sid] = {
    'sid': sid,
    'ip_address_reported': ip_address,
    'user_agent': request.headers.get('User-Agent', '?'),
    'unique_file_id': unique_file_id,
}
```

```python
def _client_user_agent(sid):
    return (connected_clients.get(sid) or {}).get('user_agent', '?')
```

For the one HTTP-only route that has no `sid` at all (`/convert_igs_to_stl`), the User-Agent is read directly off `request.headers` at the call site instead — there's no `connected_clients` entry to look it up from.

Every existing call site that already passes `extra=_log_extra(sid)` gets the new field automatically; no call sites need to change.

`_JsonFormatter.EXTRA_FIELDS` gains one entry so the field actually reaches the JSON output:

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

## 4. Persisting original upload files

**Trigger point:** `handle_calculate`, only on the non-silent path (i.e., after the existing `if silent: ... return` block — background/preview calculations never reach this point, matching "files uploaded *for calculation*," not every drag-in).

**Storage layout:** `client_data/<sid>/<uuid4>_<original_filename>`, one file per surface. Ruling mode's second surface gets its own entry the same way. The UUID prefix exists specifically so two uploads in the same session (a re-upload, or Ruling mode's two files) never collide or silently overwrite each other — each saved calculation's log entry must keep pointing at the exact bytes used for *that* run, even after the user uploads something else later in the same session.

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

Called right after `igs_bytes`/`igs_bytes2` are decoded and validated, before the silent/non-silent branch:

```python
saved_paths = [_save_original_upload(sid, filename, igs_bytes)]
if igs_bytes2 is not None:
    saved_paths.append(_save_original_upload(sid, filename2, igs_bytes2))
```

(`filename2` doesn't exist as a separate field on the current payload — Ruling mode's second file's name will need threading through from the frontend the same way `filename` already is, or a fallback synthesized name if not; the implementation plan resolves this exactly.)

`saved_paths` is added to `payload` (`payload['saved_input_paths'] = saved_paths`) so it survives into `_run_calculate_job`/`_finish_calculate` and appears in both the start line and the done line:

```python
logger.info(
    f"[CALC] {filename}  mode={calc_mode}  ...  inputs={saved_paths}",
    extra=_log_extra(sid),
)
...
logger.info(
    f"[CALC] done  ...  token={new_token}  inputs={saved_paths}",
    extra=_log_extra(sid),
)
```

**`[CALC_LOG]` screenshot entries** (`handle_log_calculation`, `POST /log-calculation`) already carry `filename` and `args` in their `extra=`; they gain the same `saved_input_paths` — but note this endpoint is called from the frontend independently of `handle_calculate`, with only the filename/args it already has in hand, not the exact saved path. The implementation plan needs to settle how the screenshot entry finds the right `saved_paths` for its calculation (most likely: the frontend already has `pendingSnapshotRef.current` holding the args from the just-completed calculation — the same completed-calculation record that already threads `filename`/`args` through to `logCalculation()` — so the saved path can ride along in that same structure without a new lookup).

Errors here (disk full, permissions) are logged (`logger.warning`, matching the existing `[CALC_LOG] failed to save snapshot` pattern) but never block the calculation itself — a failed save degrades traceability, not functionality.

## 5. Log viewer: surface vs. full detail

Both `/viewlog` and `/viewfulllog` already receive the exact same broadcast `log_update` events (from `follow_log`, which emits to all connected clients with no `room=` scoping) — the only thing that needs to change is what the *page* does with that stream, not the stream itself.

- **`/viewlog`** (`log_view.html`): unchanged behavior. Its `active` level-filter set (currently `new Set(LEVELS)` — all four levels on by default) changes its *default* to exclude `DEBUG`: `new Set(['INFO', 'WARNING', 'ERROR'])`. The `DEBUG` toggle button still exists and still works — a user can turn `DEBUG` on manually — it's just off by default, keeping today's visual density as the default experience.
- **`/viewfulllog`** (`full_log_view.html`): rebuilt on the same live-streaming foundation as `log_view.html` (Socket.IO connection, `get_initial_log_content` backfill, filter/search/group UI) rather than the current one-shot server-rendered text dump. Its `active` set defaults to all four levels including `DEBUG`. Exception blocks (`.exc-block`) default to expanded rather than requiring a click, since this page's whole purpose is maximum detail for debugging.
- **Cross-navigation:** both pages' `<h1>` header area gets a small link/toggle button to the other page (`Full detail →` on `/viewlog`, `← Surface view` on `/viewfulllog`), so once you're on either one, reaching the other is one click — no second keyboard shortcut needed.
- **`view_full_log()`'s current file-read logic** (the `try/except FileNotFoundError` block reading `LOG_FILE_NAME` directly) goes away along with the static-dump behavior it served; the route becomes a thin `render_template('full_log_view.html', log_file=LOG_FILE_NAME)` call, matching `view_log()`.

The two templates end up sharing enough structure (toolbar, level filters, search, grouping, the socket.io connection/backfill logic) that the implementation plan should factor the common parts into one shared script/partial rather than maintaining two near-duplicate ~200-line HTML files — this is the kind of duplication a plan should design away, not preserve, per the project's own YAGNI/DRY conventions.

---

## Data Flow Summary

```
Browser uploads a surface
   → (preview only: /convert_igs_to_stl, no sid correlation, nothing saved)
   → user clicks "Make Lattice"
   → `calculate` socket event, sid known
       → [not silent] igs_bytes decoded
       → _save_original_upload() → client_data/<sid>/<uuid>_<filename>
       → [CALC] start log line, includes saved path(s)
       → queued → DLL phase (bracketed by DEBUG step logs) → compress
       → [CALC] done log line, includes saved path(s)
       → result emitted to client
       → client auto-fits camera, captures canvas → POST /log-calculation
       → [CALC_LOG] entry (screenshot + args), includes saved path(s)
```

Any exception anywhere in this path that isn't already caught by a specific `try/except` is caught by the global safety net (§1) and logged with a full traceback before the request/connection fails.

---

## Testing Considerations

- Unit tests for `_save_original_upload` (creates the directory, writes the exact bytes, two calls with the same sid+filename never collide).
- A regression test asserting `_log_extra(sid)` includes `user_agent` and that `_JsonFormatter` actually surfaces it in the JSON output (mirroring the existing pattern for `sid`/`ip`).
- A test that an exception raised inside a handler with no local `try/except` still produces a log line (exercises the global safety net directly, not just by inspection).
- Existing `tests/test_calc_queue.py` / `tests/test_calculate_queue_integration.py` coverage of `handle_calculate`'s payload shape should keep passing unchanged — this spec adds a field (`saved_input_paths`) to the internal `payload` dict, not a breaking change to any existing field.
- Manual/live verification of both log pages: confirm `/viewlog` still defaults to hiding `DEBUG`, `/viewfulllog` defaults to showing everything including the new step logs, and the cross-navigation link on each reaches the other.
