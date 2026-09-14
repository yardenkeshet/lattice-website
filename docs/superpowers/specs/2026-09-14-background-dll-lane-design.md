# Background DLL Lane — Design Spec

**Date:** 2026-09-14
**Branch:** `queue`
**Files affected:** new `dll_instance.py`, new `dll_lane.py`, `calc_queue.py`, `main.py`, plus test files for all of the above.
**Scope:** Give silent/preview DLL work (macro-shape preview on upload/mode-change/extrude-debounce, and tile-preview scrubbing) a second, independent DLL lane so it never waits on — or delays — a real "Calculate" request, without reintroducing the concurrent-DLL-corruption bug the `queue` branch was built to fix. Also shrinks how long each lane holds its DLL slot, so compression/emit no longer blocks the next job. Excludes: fixing the separate `pendingMacroCountRef` frontend counter bug (tracked separately, unrelated to this change), and the pre-existing `DOWNLOAD_CACHE`/`current_token` race between a silent and a real result for the same client (noted below, not worsened by this change).

---

## Context: why this is safe to build, and why it wasn't before

Earlier investigation in this branch established that `main.py` loads one shared `MSDLL64.dll` handle and serializes every DLL call (`calculate`, `calculate_tile`, `/convert_igs_to_stl`) through a single `CalcQueueManager` slot, because the DLL keeps process-wide mutable state (`static char GlblErrStr[...]` in `gershon/Interface.c`, plus `IritMiscSetIritParallelExec(...)` reconfigured on every call). Two concurrent calls into the *same loaded module* corrupt each other's output.

This was confirmed empirically: a standalone script calling `MSDLLGetTile` on one thread while `MSDLLMSFromRevolution` ran on another, both against the same loaded `MSDLL64.dll`, produced wrong output on **6/6 concurrent calls in two independent runs** (triangle counts as low as 1.2% of the correct baseline, several results structurally invalid STL).

The same script, modified to load a **second, separately-copied file** of the exact same DLL (`ctypes.CDLL` on a different path) and route the tile-hammer thread through that second handle while the revolution call used the first, produced **0/6 mismatches, 0 errors**, with confirmed genuine overlap (progress-callback timestamps interleaved). Windows gave the two loads distinct module handles (`dll_a._handle != dll_b._handle`).

This means the corruption is scoped to the **loaded module instance**, not to "the DLL" in the abstract — two independently-loaded copies of the same file have independent static/global state. So: give real "Calculate" clicks their own DLL instance (unchanged from today), and give everything silent (macro-shape preview, tile preview, IGS→STL preview conversion) a second, completely independent DLL instance. Each instance is still internally serialized to one call at a time (same-instance concurrent calls still corrupt each other — confirmed by the first test) — that invariant doesn't change. What changes is that the two instances no longer share a slot, so neither can block the other.

**Safety caveat, carried into this plan as a concrete task:** a web search surfaced old claims that Windows dedupes DLL loads by filename regardless of path (which would defeat this). Direct, repeated measurement on the actual production DLL in this actual environment showed otherwise. Because the whole design rests on that assumption, the server asserts it at startup (Task 2) and refuses to run the parallel design if the two instances ever turn out to share a handle.

---

## 1. Two DLL lanes

**`DllInstance`** (new `dll_instance.py`) — wraps one loaded copy of the DLL: signature setup for all five entry points (`MSDLLGetTile`, `MSDLLMSFromRuling`, `MSDLLMSFromExtrusion`, `MSDLLMSFromRevolution`, `MSDLLIGES2STL`), its own registered progress-report callback trio, and its own `set_current_sid(sid)` bookkeeping (replacing today's single module-global `_current_calc_sid` — with two instances, that has to become per-instance, or the exact cross-talk bug this whole feature is fixing would reappear at the Python level). No Flask/SocketIO import; takes an `emit: Callable[[str, str, dict], None]` callback, same pattern as `calc_queue.py`.

**`BackgroundDllLane`** (new `dll_lane.py`) — a standalone, reusable "one caller at a time" gate: `try_acquire()` (non-blocking), `acquire_blocking(timeout)`, `release()`. This is today's `CalcQueueManager.try_acquire_dll`/`release_dll`/`acquire_dll_blocking`, extracted so it has no coupling to the main queue's waiting-room/worker-thread machinery — today, tile preview and the main queue share one lock, which is *why* tile preview currently blocks during a real calculation's whole pipeline.

**Lane assignment:**

| Caller | Lane | Mechanism |
|---|---|---|
| Real "Calculate" click (`calculate`, `silent` falsy) | **Main** (`dll_main`) | Existing `CalcQueueManager` — waiting room, position broadcasts, `queue_rejected` past 10 waiters. Unchanged behavior. |
| Silent macro-shape preview (`calculate`, `silent: true`) | **Background** (`dll_background`) | `BackgroundDllLane.try_acquire()` — busy means *drop this preview*, same silently-skip semantics `calculate_tile` already uses. Never queues, never shows UI. |
| `calculate_tile` | **Background** | Same `BackgroundDllLane` instance as silent calculate — `try_acquire()`, skip if busy. |
| `/convert_igs_to_stl` | **Background** | Same lane, `acquire_blocking(timeout=30.0)` — unlike the other two, a dropped request here is user-visible, so it waits briefly rather than skipping. |

The Background lane is a single shared slot across *all* background work and *all* clients — so two different users both scrubbing tiles at the same instant briefly queue behind each other, but neither ever waits on a real calculation. Given how fast tile/preview calls are, this contention is expected to be sub-second. (A pool of >1 background instances is a natural future extension if this ever proves to be a real bottleneck — not needed to satisfy the current requirement and not built here, per YAGNI.)

---

## 2. Busy-window shrink (both lanes)

Today, `CalcQueueManager`'s single worker thread holds `_busy = True` for a job's *entire* `run_job` call — DLL work **and** gzip compression **and** the `result` emit. The DLL work is done well before that (`_current_calc_sid` is already cleared before compression starts today), so nothing after the DLL call needs the slot held.

This matters differently per lane:
- **Background lane:** releasing right after the DLL call is enough on its own — any *other* caller already runs on its own thread (Flask-SocketIO's `async_mode='threading'` gives each socket event its own thread) and just needs `_busy` to flip false to proceed via its own `try_acquire()`.
- **Main lane:** there is exactly one dedicated worker thread. Releasing a `_busy` flag nobody outside that thread reads anymore doesn't, by itself, let job N+1 start sooner — the worker thread itself is still busy running job N's compression/emit before it loops back to dequeue job N+1. To actually shrink the *wall-clock* gap between "job N's DLL call ends" and "job N+1's DLL call starts," the worker thread must free itself the moment the DLL call ends and hand the compression/emit tail off to a separate thread — exactly the optimization the original `2026-09-10-calculation-queue-design.md` spec flagged and explicitly deferred ("Splitting compression out of the worker's sequential pipeline").

So the calculate pipeline splits into two functions, shared by both lanes:
- `_run_calculate_dll_phase(dll_instance, payload, sid) -> dict | None` — the exclusive part: builds ctypes args, calls the DLL, handles/emits DLL-side errors itself and returns `None` on failure, returns a result dict on success. Releases nothing itself — callers release their own lane's slot immediately after this returns.
- `_finish_calculate(payload, sid, dll_result) -> None` — the non-exclusive tail: disconnect re-checks, compression, `DOWNLOAD_CACHE`/`current_token` bookkeeping, the `result` emit. Never touches the DLL. Run on its own short-lived thread so it can genuinely overlap with the *next* DLL call on either lane.

`_run_calculate_job` (Lane A, called by the queue worker) becomes: run the DLL phase → `queue_manager.mark_dll_free()` (new method, replacing the worker loop's implicit end-of-job release as the *only* thing gating job N+1) → if successful, spawn `_finish_calculate` on a new thread and return. The worker loop's own `finally: self._busy = False` stays as an idempotent safety net.

`_run_silent_calculate` (Lane B) follows the identical shape: DLL phase → `dll_background_lane.release()` → spawn `_finish_calculate`.

**Known race, widened by this plan — corrected after the final whole-branch review flagged the original wording as understating it:** two `_finish_calculate` threads for the *same* `sid` (e.g. a silent preview's finish and a real calculate's finish landing close together) both write `DOWNLOAD_CACHE` and `client_state[sid]['current_token']` with no lock — whichever finishes last wins. The last-writer-wins clobber itself predates this change (the silent path already shared this exact bookkeeping with the real path under the old single-worker-thread design). What's new: before this plan, silent and real jobs shared one worker thread, so their finish phases were *strictly serialized* and could never actually interleave — only one `_finish_calculate` ever ran at a time, for any `sid`. Now silent and real finish phases run on independent threads and genuinely can interleave, which adds a case the old design couldn't produce: if both threads read `old_token` before either writes `current_token`, one result's `last_results/<token>/` folder is orphaned and never reclaimed. The user-visible symptom (a real Calculate's `download_token` clobbered by a concurrent silent preview) is also now reachable *during* a calculation rather than only right after one finishes, partially mitigated by the frontend's `if (isCalculatingRef.current) return` guard on the extrude-debounce path (`ToolPage.tsx`). Still low-frequency and legitimately deferrable — out of scope here — but described accurately: this is a widened window, not an unchanged one. Flagged for separate investigation if it's ever observed to matter (e.g. a stale download token after a rapid extrude-length tweak, or an orphaned `last_results/` folder). One cheap mitigation worth considering later: `_finish_calculate` could skip the `DOWNLOAD_CACHE`/`current_token` bookkeeping entirely for silent results, since the frontend never calls `setDownloadToken` for a preview result anyway — that would remove the clobber outright without adding a lock.

---

## 3. Startup wiring

At `main.py` import time (replacing today's single `_dll = ctypes.CDLL(...)` block):

1. `dll_main = DllInstance(MAIN_DLL_PATH, emit=_emit_queue_event)` — loads `gershon/MSDLL64.dll` directly, as today.
2. `background_dll_path = prepare_background_dll_copy(MAIN_DLL_PATH, MAIN_DLL_MANIFEST_PATH, dest_dir=os.path.join(os.getcwd(), 'tmp', 'dll_background_instance'))` — copies the DLL + its `.manifest` to a scratch path fresh on every startup (never committed to the repo, so the two copies can't drift out of sync).
3. `dll_background = DllInstance(background_dll_path, emit=_emit_queue_event)`.
4. `assert_distinct_dll_instances(dll_main, dll_background)` — raises `RuntimeError` (refusing to start) if the two ever share a handle, per the safety caveat above.
5. `dll_background_lane = BackgroundDllLane()`.

---

## 4. Error handling & verification

- No user-visible event shapes change — `queue_status`/`queue_rejected`/`result`/`error` all keep their existing payloads.
- `_finish_calculate` running on its own thread must, like today's worker thread, use explicit `socketio.emit(..., room=sid)` (no implicit Flask request context) and must not let an exception escape uncaught (wrap in try/except + `logger.exception`, matching the existing defensive pattern around the worker's own `run_job` call).
- **Unit tests** for `DllInstance` (real DLL, fast calls only — tile generation) and `BackgroundDllLane` (pure Python, no DLL, mirrors `test_calc_queue.py`'s existing threading-test style).
- **Regression test** (`tests/test_dll_lane_isolation.py`) encoding the empirical proof from Section "Context" above directly into the suite: loads `dll_main`/`dll_background` for real, hammers tile calls on the background lane while a real revolution runs on the main lane, and asserts the revolution's output exactly matches a sequential baseline. This is the permanent guard against ever silently reintroducing single-instance concurrent access.
- **Integration tests** updated for the new routing: a silent `calculate` must never appear in `CalcQueueManager`'s waiting room or affect its position broadcasts; `/convert_igs_to_stl` and `calculate_tile` tests move from asserting against `queue_manager.try_acquire_dll`/`release_dll` to `dll_background_lane`.
- **Manual verification:** two browser tabs — start a real Calculate in one, and in the other (different session) upload a file / scrub a tile slider; confirm the second tab's preview updates promptly instead of freezing until the first tab's calculation finishes.

---

## Out of scope (explicitly deferred)

- **Pooling multiple background instances.** One shared background lane is enough to satisfy "silent work never blocks a real calculation"; if many simultaneous users' background work starts visibly contending with *each other*, a small pool (same `prepare_background_dll_copy` mechanism, N times) is a straightforward follow-up.
- **The `pendingMacroCountRef` frontend counter bug.** Separate, already-diagnosed issue (stale "server emits result twice" assumption); unrelated to DLL concurrency, tracked separately.
- **The `DOWNLOAD_CACHE`/`current_token` race** between a silent and a real result for the same client, noted in Section 2 — pre-existing, not worsened here.
- **DLL-hang watchdog/timeout**, and **multi-process/multi-worker deployment support** — both already called out as deferred in the original `2026-09-10-calculation-queue-design.md` spec and unaffected by this change.
