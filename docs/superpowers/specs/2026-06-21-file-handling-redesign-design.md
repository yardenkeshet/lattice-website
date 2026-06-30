# File Handling Redesign — Design Spec

**Date:** 2026-06-21
**Branch:** `feature/file-handling-redesign` (off `feature/colors_and_zoom`)
**Files affected:** `main.py`, `react_frontend/src/api/*`, `react_frontend/src/pages/ToolPage.tsx`, `react_frontend/src/components/ViewerScene.tsx`, `templates/log_view.html`
**Scope:** How uploaded surface files, calculation outputs, tile previews, and a new calculation-history log move through the system. Excludes dead-code/doc cleanup (`main_orig.py`, `lattice.py`, stale `.md` docs) — noted but deliberately deferred.

---

## Context: how file handling works today, and what's wrong with it

The backend (`main.py`) and frontend (`react_frontend/`) have drifted from the docs (`CLAUDE.md`, `backend_api.md`) that describe them. The actual current flow:

1. The viewer only accepts `.igs` (this is correct/intentional — the docs claiming `.stl`/`.obj`/`.3mf` are wrong).
2. Every upload is POSTed to `POST /convert_igs_to_stl`, which **writes the IGS file to disk** in `client_data/<basename>.igs` (global folder, keyed only by sanitized filename) so the DLL's IGES→STL converter can run on it, purely so the frontend can preview it (Three.js can only render STL).
3. Clicking Calculate sends a socket `calculate` event with **no file content** — just `{filename, client_ts, args}`. The backend re-derives `<basename>.igs` from `filename` and looks it up in `client_data/` *again*, a second, disconnected lookup into the same collision-prone global folder.
4. Results land in `last_results/<sid>/` under **fixed per-tile-type filenames** (`MSRevolv.stl/igs`, etc.), referenced by a `download_token` UUID in an in-memory `DOWNLOAD_CACHE` dict.
5. `do_Ruling()` (the two-surface "ruling" calc mode) hardcodes the second surface to a literal path from a developer's machine (`client_data/RuledSrf2.igs`) — confirmed by `git log` to be a debugging leftover (commit `332490d`), still present with a `TODO` comment on the current branch. The user's actual second uploaded surface is silently ignored.
6. `calculate_tile` previews write to **fixed global filenames** in `last_tiles_results/` (`TileCross.stl`, etc.) — same collision risk as #2/#3, for live slider-drag previews.
7. On disconnect, `clean_session()` deletes `last_results/<sid>/`, but `client_data/` is **never cleaned** — unbounded growth (already has stray files from past test sessions).
8. **Currently broken on `feature/colors_and_zoom`:** `on_disconnect()` does `del DOWNLOAD_CACHE[sid]`, but `DOWNLOAD_CACHE` is keyed by download *token* (a UUID), never by `sid`. This raises `KeyError` on every disconnect, which happens *before* `clean_session(sid)` runs — so **`last_results/<sid>/` cleanup is currently silently broken entirely**.
9. The download token is no longer single-use (already fixed by a teammate: `download_results()` now uses `DOWNLOAD_CACHE.get(token)` instead of `.pop()`), but because of #8 it also now never expires.

### Root cause

Items 2/3/5/6/7/8 all stem from the same design flaw: **server-side storage keyed by something other than a real, unique, request-scoped identity** (a user-controlled filename, or a `sid` that isn't reliably cleaned up). The fix is to stop persisting anything server-side that isn't tied to an identity that's both unique and has a clear, enforced lifetime.

---

## 1. Upload & Conversion (frontend preview only)

**Current:** `POST /convert_igs_to_stl` writes the IGS to `client_data/<basename>.igs` and a `_preview.stl` next to it, permanently.

**After:** The backend writes the incoming IGS bytes to a throwaway temp file (random name, e.g. `tempfile.NamedTemporaryFile`), runs `MSDLLIGES2STL`, reads back the STL bytes, and deletes the temp file in a `finally` block. Nothing is written to `client_data/`. Response shape (`{stl_b64}`) is unchanged — no frontend changes needed for this endpoint.

The frontend already holds the original IGS bytes in memory after this call (`uploadedB64` / `uploadedFile` state in `ToolPage.tsx`) for the viewer preview; that's what gets sent again at Calculate time (Section 2).

---

## 2. Calculate (stateless, real two-surface ruling)

**Current:** `CalculatePayload` carries no file content; `handle_calculate` re-finds `client_data/<basename>.igs` by re-parsing `filename`.

**After:**
- `CalculatePayload` gains `surface_b64: string` (always) and `surface2_b64?: string` (ruling mode only) — the actual IGS bytes, resent fresh on every `calculate` call. `filename` becomes a display/log label only; the disk lookup by filename is removed entirely.
- `handle_calculate` writes each surface to its own ephemeral temp file, calls the relevant DLL function, and deletes the temp input(s) in a `finally` block — whether the DLL call succeeds or raises.
- `do_Ruling()` drops the hardcoded `srf2` override and the leftover debug `print()`; it receives and uses the real second surface's temp path.

This is the first time ruling mode will use what the user actually uploaded for surface 2.

---

## 3. Result storage & download lifecycle

**Current:** results live in `last_results/<sid>/`, fixed filenames per tile type, token → `{sid, out_stl, out_igs}` in `DOWNLOAD_CACHE`, broken disconnect cleanup (see Context #8).

**After:**
- Each `calculate` call generates one UUID used as **both** the download token **and** the result folder name: `last_results/<token>/MSRevolv.stl` (etc). Storage identity is no longer tied to `sid` or any filename.
- `client_state[sid]` (already exists, used for the tile worker thread) gains a `current_token` field.
- When a session's *next* `calculate` completes successfully, the previous token's folder is deleted and its `DOWNLOAD_CACHE` entry removed **before** the new one is created — this is the "valid until next calculate" download semantic.
- `/download-results` keeps the existing `.get(token)` (not `.pop()`) behavior — STL and IGS both stay downloadable, repeatedly, until superseded or the session ends.
- **Fixes the disconnect bug:** `on_disconnect()` replaces `del DOWNLOAD_CACHE[sid]` with a lookup through `client_state[sid]['current_token']`, removing that specific entry via `DOWNLOAD_CACHE.pop(token, None)` and deleting its folder — restoring working cleanup.

---

## 4. Tile preview (`calculate_tile`)

**Current:** writes to fixed shared filenames in `last_tiles_results/` (`TileCross.stl`, `TileDiagnoal.stl`, `TileCrossDiagnoal.stl`) — collision-prone across concurrent users, same root cause as Section 1-3.

**After:** each `calculate_tile` call writes to a randomly-named temp file, reads the bytes back for the gzip/base64 response, and deletes the temp file immediately (`finally` block). `last_tiles_results/` is no longer touched at runtime. The files already checked into the repo there remain as unused static leftovers (cleanup is out of scope per the agreed exclusions above).

---

## 5. Calculation log (PNG snapshot archive, integrated with existing logging)

### Current logging system (for reference)

- `lattice.log`: JSON-Lines format, one `{ts, level, msg, sid?, ip?, exc?}` object per line, written via a custom `_JsonFormatter` (`main.py`, around line 234) attached to a `RotatingFileHandler` capped at **5 MB × 3 backups (~20 MB total)** — old entries get overwritten automatically.
- Most detail beyond `sid`/`ip` is folded into the free-text `msg` using a `[TAG] key=value` convention (e.g. `[CALC] done 120KB overall=380ms ... stl=... igs=...`).
- `/viewlog` (`templates/log_view.html`) is a **live tailer**: a background thread (`follow_log`) tails `lattice.log` and emits each new line as a `log_update` socket event; the page does `JSON.parse` per line and renders/filters/groups by level, `sid`, and the `[TAG]` prefix. New connections are seeded with the last 50 lines via `get_initial_log_content`.
- `/viewfulllog` dumps the raw rotated file into a `<pre>` block.

This rotation directly conflicts with "keep calculation history as far back as we can" — so calc-log entries cannot simply be written into `lattice.log`.

### Design

- **New logger, same format, separate file:** a second `logging.Logger` (`calc_logger`), using the *same* `_JsonFormatter` class, attached to a plain non-rotating `FileHandler` writing to `calc_log/log.jsonl`. PNGs live alongside it in `calc_log/images/<uuid>.png`. No deletion/retention policy yet (explicitly deferred).
- **Structured fields:** `filename`, `args` (the calculation params), and `image` (relative path) are passed through as extra fields exactly the way `sid`/`ip` already are — `_JsonFormatter` needs a small generalization to pass through these three keys when present, instead of only `sid`/`ip`.
- **`msg` follows the existing convention:** `[CALC_LOG] {filename}  tile={tileType}  tiles=({nt1},{nt2},{nt3})  g=({g1},{g2})  p=({p1},{p2},{p3})` — same shape as the existing `[CALC]` line, just permanent.
- **Frontend capture:** after a `model_stl` result's mesh has loaded and `ViewerScene`'s camera has finished its existing auto-fit, the canvas is captured via `canvas.toBlob('image/png')` and POSTed to a new `POST /log-calculation` endpoint (multipart: the PNG blob + `filename` + `args`). This is fire-and-forget — a failed POST is caught and console-logged on the frontend, never surfaced to the user or allowed to affect the displayed result.
- **Backend handling:** generates a UUID, saves the PNG to `calc_log/images/<uuid>.png`, writes one `calc_logger.info(...)` line with `image` pointing at it.
- **Live streaming into `/viewlog`, reusing the existing mechanism:** a second instance of the existing `follow_log` background thread (parameterized by file path, no new tailing logic needed) tails `calc_log/log.jsonl` and emits `log_update` events exactly like the `lattice.log` tailer does today. Because the viewer already does generic `JSON.parse` per line, new entries appear without any protocol change.
- **`log_view.html` additions (additive only):** `entryHtml()` gains a small branch — when `e.image`/`e.args`/`e.filename` are present, render a thumbnail (via a new minimal `GET /calc-log-image/<name>` route that validates the requested name is a bare basename before serving from `calc_log/images/`, preventing path traversal) and a compact params summary. Existing log-line rendering is untouched.
- New connections are seeded with the last N `calc_log` lines too, mirroring the existing `get_initial_log_content` seeding for `lattice.log`.

---

## 6. Error handling & verification

- All new ephemeral-temp-file code paths (conversion, calculate, ruling, tile preview) wrap their DLL calls in `try/finally` so temp inputs are deleted even when the DLL call raises — today's code has no equivalent guarantee.
- Missing/invalid surface bytes in a `calculate` payload reuse the existing `emit('error', {...})` pattern — no new error shape introduced.
- There is no existing pytest/vitest suite covering this backend logic; verification is manual end-to-end, covering:
  - Upload an IGS → preview renders → nothing written to `client_data/`.
  - Run a calculation → download both STL and IGS, more than once each.
  - Run a second calculation from the same session → confirm the first result's `last_results/<token>/` folder and `DOWNLOAD_CACHE` entry are gone.
  - Disconnect → confirm `last_results/` actually empties (regression check for the current disconnect bug).
  - Ruling mode with two genuinely different uploaded surfaces → confirm the DLL call uses the real second surface, not a hardcoded one.
  - A completed calculation → confirm a PNG + matching `calc_log/log.jsonl` line appear, and the entry renders (with thumbnail) in `/viewlog`.

---

## Out of scope (explicitly deferred)

- Removing `main_orig.py` and `lattice.py` (confirmed dead code) and refreshing `CLAUDE.md`/`backend_api.md`/`frontend_features.md` to match reality.
- Any retention/deletion policy for `calc_log/` — to be decided later.
- Forwarding `nt1`/`nt2`/`nt3`/`g1`/`g2` to the ruling DLL call if not already wired (pre-existing gap, not part of this redesign).
