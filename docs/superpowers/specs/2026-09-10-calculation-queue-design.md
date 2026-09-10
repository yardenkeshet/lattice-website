# Calculation Queue — Design Spec

**Date:** 2026-09-10
**Branch:** `queue`
**Files affected:** `main.py` (new `calc_queue.py`), `react_frontend/src/api/*`, `react_frontend/src/pages/ToolPage.tsx`, `react_frontend/src/components/ui/Toolbar.tsx` (or equivalent calculate-button component)
**Scope:** Serialize concurrent `calculate` requests through a single-slot server-side queue, add a bounded waiting room with live position updates, and give `calculate_tile` a non-blocking, best-effort path that never queues. Excludes DLL-hang watchdog/timeout handling and any multi-process/multi-worker deployment support — noted below as deferred.

---

## Context: what's there today, and why it's a problem

`main.py` runs Flask-SocketIO in `async_mode='threading'`, as a single Python process (`socketio.run(...)`, no gunicorn/eventlet/gevent workers — confirmed by `nginx/nginx.conf`, which just reverse-proxies one upstream on `:5003`). Every connected client gets its own thread, and the `calculate` handler (`main.py:679`) has **no locking of any kind** around the DLL call.

Concretely: if two browsers click Calculate around the same time, two threads simultaneously call into `gershon/MSDLLD64.dll` — loaded once as a single shared `dll` object in `lattice.py` — via `ctypes`. Per-request *output* file paths are already unique (keyed by a per-download UUID token), so there's no file collision, but the DLL itself is old C code with no documented thread-safety guarantee; concurrent entry into it is a real correctness risk (corrupted geometry, crashes), on top of both calculations fighting for CPU and slowing each other down. There is also a per-client `worker_loop` thread + `threading.Event` already in `main.py` (`main.py:598-622`) that looks like an earlier, abandoned attempt at something similar — nothing ever calls `.set()` on its event, so it's dead code today. This design does not build on it; it's called out here only so it isn't mistaken for part of the new mechanism.

### Root cause

No synchronization exists around the one shared, likely-non-reentrant resource (the DLL). The fix is to make "one calculation at a time" true by construction — a single worker owns the DLL call — rather than hoping concurrent requests never overlap.

---

## 1. `CalcQueueManager` (new module: `calc_queue.py`)

A small class holding all queue state behind one `threading.Lock`:

- `waiting: list[Job]` — ordered, **max 10 entries**. Each `Job` holds `sid`, the already-validated request data needed to run it, and enqueue time.
- `busy: bool` — whether the calculation slot is currently occupied.
- One dedicated **worker thread**, started once at server startup (alongside the existing `log_thread`/`calc_log_thread` pattern), running:
  ```
  loop:
      wait until waiting is non-empty          # Condition variable
      job = pop front of waiting
      busy = True
      broadcast queue_status(calculating) to job.sid
      run full calculate pipeline (decode → DLL → compress → emit result/error) for job
      busy = False
      broadcast updated positions to remaining waiters
  ```

Every `calculate` request — including one that lands when the queue is empty — goes through this same enqueue → worker path. There is no separate "fast path" for the empty-queue case; when nothing is waiting, a job is typically picked up within microseconds, so it's invisible to the user. This keeps the implementation to one code path instead of two.

`CalcQueueManager` itself has no Flask/SocketIO dependency — it takes a `run_job: Callable[[Job], None]` callback and a `broadcast: Callable[[str, dict], None]` callback, so it can be unit-tested standalone (see Section 6).

---

## 2. `calculate` handler changes

Existing validation (unknown `tileType`/`calcMode`, missing `surface_b64`, bad numeric args, etc.) is **unchanged** and still runs synchronously in the handler before the queue is touched — invalid requests never consume a queue slot and still get the existing `emit('error', {...})` treatment.

For a valid request, the handler asks `CalcQueueManager` to enqueue it:

| Queue state at enqueue time | Server behavior |
|---|---|
| Slot free, nobody waiting | Enqueued; worker picks it up almost immediately → client receives `queue_status {state: 'calculating'}`. |
| Slot busy, `waiting` has room (< 10) | Enqueued at the back → client receives `queue_status {state: 'waiting', position, aheadCount}` immediately. Every time the front of `waiting` is popped, all remaining waiters receive a fresh `queue_status` with their updated `position`/`aheadCount`. |
| `waiting` already has 10 entries | **Not enqueued.** Client immediately receives `queue_rejected {message: "Site is too busy right now. Please wait a few minutes and try again."}`. No queue slot is consumed; the client can retry at will. |

`position` is 1-indexed ("you are #1 in line" = next up). When a job starts running, that client's `queue_status` flips to `{state: 'calculating'}` — the frontend's cue to swap the "waiting in line" UI for the existing calculating/progress UI.

---

## 3. `calculate_tile` — non-blocking, no queue

Tile preview (`MSDLLGetTile`) calls the **same shared DLL instance**, so it cannot be exempted from synchronization entirely — but it also must never sit in the visible 10-slot waiting line, since it drives live slider-drag previews and needs to feel instant.

Behavior: `calculate_tile` checks `CalcQueueManager.busy` under the manager's lock, without ever touching `waiting`:
- **Free:** the handler marks `busy = True` for the duration of the tile call (same flag the full-calculation worker uses), runs the (fast) tile calc, then clears it — responds exactly as today.
- **Busy** (a full calculation is running, or another tile call is momentarily mid-flight): the handler **silently skips** this preview update — no `result`, no `error`, no queue UI. The next scrub tick, or the moment the in-flight full calculation finishes, produces a fresh preview normally.

This never blocks: the check-and-set is a single quick critical section, and if it finds `busy = True` it returns immediately rather than waiting.

This keeps slider scrubbing snappy while still guaranteeing the DLL is never entered from two threads at once.

---

## 4. Disconnect handling

`on_disconnect()` gains queue-awareness:

- If the disconnecting `sid` is in `waiting`: remove it from the list and re-broadcast updated positions to the remaining waiters (their positions may have shifted).
- If the disconnecting `sid` is the job currently being run by the worker: the DLL call **cannot be interrupted** (no safe kill mechanism via `ctypes`), so it's allowed to finish. The worker's `emit()` back to that now-gone `sid` is a harmless no-op (wrapped defensively so it can't raise). The existing `clean_session()` folder cleanup for that `sid` is deferred until the worker has actually finished with that job, rather than running immediately on disconnect and racing the worker's still-in-progress file writes.

---

## 5. Frontend

**API layer (`react_frontend/src/api/`):**
- `types.ts` gains `QueueStatusPayload` (discriminated union: `{state: 'waiting', position: number, aheadCount: number} | {state: 'calculating'}`) and `QueueRejectedPayload {message: string}`.
- `socketClient.ts` gains `onQueueStatus(handler)` and `onQueueRejected(handler)` subscriptions on `LatticeSocketClient`, following the existing pattern (typed, unsubscribe-returning, no raw event strings leaking outside this file).

**`ToolPage.tsx`:**
- New local state, e.g. `calcStatus: 'idle' | 'waiting' | 'calculating'`, replacing the current implicit assumption that clicking Calculate means "calculating" starts immediately. Driven by `queue_status`, `queue_rejected`, `result`, and `error` events.
- **`waiting`:** Calculate button stays disabled; a message renders — "Site is busy — you're #N in line" (using `position`/`aheadCount`) — updating live as `queue_status` events arrive.
- **`calculating`:** existing progress/spinner UI (today's `.btn-disabled` + progress indicator equivalent), unchanged visually — just now gated on the `calculating` `queue_status` event instead of firing the instant the button is clicked.
- **Rejected:** a distinct toast/banner (visually different from the generic error styling used for `error` events) showing the "try again later" message; Calculate button re-enables immediately, no lingering state.

---

## 6. Error handling & verification

- No existing error shapes change; `queue_rejected` is additive and distinct from `error` so the frontend can style "you're welcome to retry" differently from "something actually failed."
- Defensive `emit()` around the worker's send-back-to-a-disconnected-client path (Section 4) so a client leaving mid-calculation can't raise inside the worker thread and take down the queue.
- **Unit tests for `CalcQueueManager`** (no Flask/SocketIO needed — pure Python with the injected callbacks):
  - FIFO ordering of `waiting`.
  - Rejection once `waiting` reaches 10, with no side effects (nothing enqueued, `queue_rejected` fired, `waiting` unchanged).
  - Position recompute after the front job is dequeued, and after a mid-queue removal (disconnect case).
  - Concurrency: a fake slow `run_job` plus multiple threads enqueuing concurrently, asserting the worker never runs two jobs overlapping in time (e.g. via a shared "currently running" counter that must never exceed 1).
- **Integration test** using `flask_socketio`'s test client: two simulated clients both `calculate`; assert the second receives `waiting` then `calculating` only after the first's `result` has been emitted.
- **Manual verification:** two real browser tabs, near-simultaneous Calculate clicks — confirm serialized execution, live position updates, and that a full waiting room (simulate via 11 rapid clients, e.g. with a quick script) surfaces `queue_rejected` correctly. Also confirm slider-drag tile preview keeps working smoothly while a full calculation runs elsewhere (some preview frames may silently skip, which is expected).

---

## Out of scope (explicitly deferred)

- **DLL-hang watchdog/timeout.** Today, a hung DLL call would (per the pre-existing lack of synchronization) at worst corrupt one calculation silently. After this change, a hung call stalls the *entire* site for everyone, since all calculations now funnel through one worker — arguably a better failure mode (loud/obvious vs. silent corruption), but not addressed here. A real fix would mean running the DLL call in a subprocess so it can be killed on timeout, which is a larger change than this feature warrants. Flagged for future work.
- **Splitting compression out of the worker's sequential pipeline.** Compression (`compress_text_to_b64_gz`) doesn't touch the DLL, so it isn't required to be serialized for correctness — only the DLL call itself is. It's kept inside the same single-worker pipeline here for simplicity (one job fully finishes, including its `result` emit, before the next starts — no second queue/stage, no out-of-order-emit bookkeeping). If measured wait times turn out to be dominated by compression on large (cross-diagonal) outputs and the deployment has CPU headroom to spare, decoupling it into its own always-available stage is a valid future optimization.
- **Multi-process/multi-worker deployment support.** The in-memory `CalcQueueManager` (a plain Python object behind a `threading.Lock`) is only correct because the app runs as a single process today (confirmed via `nginx.conf` and `socketio.run`). If the deployment ever moves to multiple worker processes, this would need an external coordinator (e.g. Redis-backed lock/queue) — out of scope unless that deployment change happens.
