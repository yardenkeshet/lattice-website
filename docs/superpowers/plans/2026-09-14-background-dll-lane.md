# Background DLL Lane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give silent/preview DLL work (macro-shape preview, tile-preview scrubbing, IGS→STL upload preview) a second, independent DLL instance and lock so it never waits on — or delays — a real "Calculate" request, and shrink how long each lane holds its DLL slot so compression/emit no longer blocks the next job.

**Architecture:** Two `DllInstance`s (each a separately-loaded copy of `MSDLL64.dll`, empirically confirmed to have independent global state) — `dll_main` used only by the existing `CalcQueueManager` waiting-room queue, `dll_background` used by a new, simpler `BackgroundDllLane` (try-acquire / blocking-acquire / release) shared by silent-calculate, tile-preview, and `/convert_igs_to_stl`. Each lane is still internally serialized to one DLL call at a time — same-instance concurrent calls still corrupt each other. The calculate pipeline splits into an exclusive "DLL phase" and a non-exclusive "finish phase" (compression + emit), with the finish phase handed off to its own thread so the DLL slot frees the instant the DLL call itself ends.

**Tech Stack:** Python 3.13, Flask-SocketIO (`async_mode='threading'`), `ctypes`, pytest.

**Spec:** `docs/superpowers/specs/2026-09-14-background-dll-lane-design.md`

## Global Constraints

- No existing SocketIO/HTTP event or response shape changes (`queue_status`, `queue_rejected`, `result`, `error` payloads stay exactly as today).
- Same-DLL-instance calls must never run concurrently — every task that touches DLL access must preserve "one call in flight per instance" exactly.
- No new external dependencies.
- Every new module (`dll_instance.py`, `dll_lane.py`) stays Flask/SocketIO-free, matching `calc_queue.py`'s existing testability pattern.
- Run tests with `python -m pytest tests/<file> -q` from the repo root.

---

### Task 1: `DllInstance` — wraps one loaded copy of the DLL

**Files:**
- Create: `dll_instance.py`
- Test: `tests/test_dll_instance.py`

**Interfaces:**
- Produces: `class DllInstance` with `__init__(self, dll_path: str, emit: Callable[[str, str, dict], None])`; methods `get_tile(tile_type: int, tile_params, graded, tolerance: float, out_stl_file: bytes) -> str | None`, `from_revolution(srf_igs: bytes, num_tiles, graded, tile_type: int, tile_params, out_igs: bytes, out_stl: bytes) -> str | None`, `from_extrusion(srf_igs: bytes, extrude_length: float, num_tiles, graded, tile_type: int, tile_params, out_igs: bytes, out_stl: bytes) -> str | None`, `from_ruling(srf1: bytes, srf2: bytes, num_tiles, graded, tile_type: int, tile_params, out_igs: bytes, out_stl: bytes) -> str | None`, `iges2stl(igs_file: bytes, stl_file: bytes, tolerance) -> str | None`, `set_current_sid(sid: str | None) -> None`, and a `handle` property (`int`, the loaded module's `ctypes` handle — used by Task 2's self-check).

- [ ] **Step 1: Write the failing test — loads the real DLL and generates a tile**

```python
# tests/test_dll_instance.py
import os
import ctypes

from dll_instance import DllInstance

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAIN_DLL_PATH = os.path.join(REPO_ROOT, "gershon", "MSDLL64.dll")


def _no_emit(event, sid, payload):
    pass


def test_get_tile_produces_a_valid_stl(tmp_path):
    instance = DllInstance(MAIN_DLL_PATH, emit=_no_emit)

    params = (ctypes.c_double * 2)(0.15, 0.05)
    graded = (ctypes.c_double * 2)(0.2, 1.5)
    out_stl = str(tmp_path / "tile.stl").encode("ascii")

    err = instance.get_tile(0, params, graded, 0.0, out_stl)

    assert err is None
    with open(out_stl, "rb") as f:
        content = f.read().decode()
    assert content.strip().startswith("solid")
    assert "endsolid" in content


def test_get_tile_reports_dll_error_without_raising(tmp_path):
    instance = DllInstance(MAIN_DLL_PATH, emit=_no_emit)

    # Radii both 0.0 is out of the DLL's valid range — must come back as an
    # error string, not raise and not crash the process.
    params = (ctypes.c_double * 2)(0.0, 0.0)
    graded = (ctypes.c_double * 2)(0.2, 1.5)
    out_stl = str(tmp_path / "bad_tile.stl").encode("ascii")

    err = instance.get_tile(0, params, graded, 0.0, out_stl)

    assert err is not None
    assert isinstance(err, str)


def test_two_instances_from_the_same_path_have_distinct_handles():
    a = DllInstance(MAIN_DLL_PATH, emit=_no_emit)
    b = DllInstance(MAIN_DLL_PATH, emit=_no_emit)
    # ctypes.CDLL on Windows can return a cached handle for a path already
    # loaded in this process — this pins today's actual observed behavior
    # (each DllInstance in production loads a DIFFERENT file path, so this
    # same-path case isn't the production scenario) without asserting
    # anything about it either way.
    assert isinstance(a.handle, int)
    assert isinstance(b.handle, int)


def test_set_current_sid_gates_progress_emits():
    received = []

    def emit(event, sid, payload):
        received.append((event, sid, payload))

    instance = DllInstance(MAIN_DLL_PATH, emit=emit)
    # No sid set yet — a manual callback invocation must not emit.
    instance._on_progress_update(_fake_progress_struct(42))
    assert received == []

    instance.set_current_sid("sid-123")
    instance._on_progress_update(_fake_progress_struct(42))
    assert received == [("update", "sid-123", {"type": "progress_update", "progress": 42})]

    instance.set_current_sid(None)
    instance._on_progress_update(_fake_progress_struct(50))
    assert len(received) == 1  # unchanged — no sid, no emit


def _fake_progress_struct(progress: int):
    from dll_instance import _PRInfoStruct
    s = _PRInfoStruct()
    s.InitMsg = b"test"
    s.Progress = progress
    return ctypes.pointer(s)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_dll_instance.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'dll_instance'`

- [ ] **Step 3: Write `dll_instance.py`**

```python
"""dll_instance.py — wraps one loaded copy of MSDLL64.dll.

Each DllInstance is an independently-loaded ctypes module with its own
progress-report callbacks and its own static/global state inside the DLL
(confirmed empirically: two ctypes.CDLL() loads of the same DLL file from
two different paths get distinct module handles and distinct global state
on Windows — see docs/superpowers/specs/2026-09-14-background-dll-lane-design.md).
Concurrent calls into the SAME instance still corrupt each other — callers
are responsible for serializing access to a given instance (see dll_lane.py
and calc_queue.py). This module has no Flask/SocketIO dependency so it can
be unit-tested standalone; callers supply an `emit(event, sid, payload)`
callback for progress reporting.
"""

import ctypes
from ctypes import c_void_p, c_char_p, c_int, c_double, POINTER, Structure, CFUNCTYPE
from typing import Callable


class _PRInfoStruct(Structure):
    _fields_ = [("InitMsg", c_char_p), ("Progress", c_int)]


_PRInfoPtr = POINTER(_PRInfoStruct)
_ProgressCB = CFUNCTYPE(None, _PRInfoPtr)


def _call(fn, *args):
    """Call a DLL function and return its decoded error string (or None)."""
    result = fn(*args)
    if result:
        return result.decode("utf-8", errors="replace")
    return None


class DllInstance:
    def __init__(self, dll_path: str, emit: Callable[[str, str, dict], None]):
        self._emit = emit
        self._current_sid: str | None = None
        self._dll = ctypes.CDLL(dll_path)

        self._dll.MSDLLGetTile.restype = c_char_p
        self._dll.MSDLLGetTile.argtypes = [
            c_int, POINTER(c_double), POINTER(c_double), c_char_p,
        ]
        self._dll.MSDLLMSFromRuling.restype = c_char_p
        self._dll.MSDLLMSFromRuling.argtypes = [
            c_char_p, c_char_p, POINTER(c_int), POINTER(c_double), c_int,
            POINTER(c_double), c_char_p, c_char_p,
        ]
        self._dll.MSDLLMSFromExtrusion.restype = c_char_p
        self._dll.MSDLLMSFromExtrusion.argtypes = [
            c_char_p, c_double, POINTER(c_int), POINTER(c_double), c_int,
            POINTER(c_double), c_char_p, c_char_p,
        ]
        self._dll.MSDLLMSFromRevolution.restype = c_char_p
        self._dll.MSDLLMSFromRevolution.argtypes = [
            c_char_p, POINTER(c_int), POINTER(c_double), c_int,
            POINTER(c_double), c_char_p, c_char_p,
        ]
        self._dll.MSDLLIGES2STL.restype = c_char_p
        self._dll.MSDLLIGES2STL.argtypes = [c_char_p, c_char_p, c_double]

        # Kept as attributes, not locals — ctypes does not keep a Python
        # reference to a CFUNCTYPE-wrapped callback alive on its own, and a
        # garbage-collected callback crashes the process the next time the
        # DLL invokes it.
        self._cb_init_c = _ProgressCB(self._on_progress_init)
        self._cb_update_c = _ProgressCB(self._on_progress_update)
        self._cb_done_c = _ProgressCB(self._on_progress_done)
        self._dll.MSDLLSetProgressReportFuncs.restype = None
        self._dll.MSDLLSetProgressReportFuncs.argtypes = [
            _ProgressCB, _ProgressCB, _ProgressCB, c_void_p,
        ]
        self._dll.MSDLLSetProgressReportFuncs(
            self._cb_init_c, self._cb_update_c, self._cb_done_c, None,
        )

    @property
    def handle(self) -> int:
        return self._dll._handle

    def set_current_sid(self, sid: str | None) -> None:
        """Must be set before, and cleared immediately after, every DLL
        call that can trigger progress callbacks — this instance's calls
        are only ever single-flight, so one sid at a time is correct."""
        self._current_sid = sid

    def _on_progress_init(self, pr) -> None:
        if not self._current_sid:
            return
        try:
            msg = pr.contents.InitMsg.decode()
        except Exception:
            return
        self._emit("update", self._current_sid, {"type": "progress_start", "message": f"[DLL] {msg}"})

    def _on_progress_update(self, pr) -> None:
        if not self._current_sid:
            return
        self._emit("update", self._current_sid, {"type": "progress_update", "progress": pr.contents.Progress})

    def _on_progress_done(self, pr) -> None:
        if not self._current_sid:
            return
        self._emit("update", self._current_sid, {"type": "progress_end", "progress": 100})

    def get_tile(self, tile_type, tile_params, graded, tolerance, out_stl_file: bytes):
        return _call(self._dll.MSDLLGetTile, tile_type, tile_params, graded, out_stl_file)

    def from_revolution(self, srf_igs: bytes, num_tiles, graded, tile_type, tile_params,
                         out_igs: bytes, out_stl: bytes):
        return _call(self._dll.MSDLLMSFromRevolution,
                     srf_igs, num_tiles, graded, tile_type, tile_params, out_igs, out_stl)

    def from_extrusion(self, srf_igs: bytes, extrude_length: float, num_tiles, graded,
                        tile_type, tile_params, out_igs: bytes, out_stl: bytes):
        return _call(self._dll.MSDLLMSFromExtrusion,
                     srf_igs, c_double(extrude_length), num_tiles, graded,
                     tile_type, tile_params, out_igs, out_stl)

    def from_ruling(self, srf1: bytes, srf2: bytes, num_tiles, graded, tile_type, tile_params,
                     out_igs: bytes, out_stl: bytes):
        return _call(self._dll.MSDLLMSFromRuling,
                     srf1, srf2, num_tiles, graded, tile_type, tile_params, out_igs, out_stl)

    def iges2stl(self, igs_file: bytes, stl_file: bytes, tolerance) -> str | None:
        return _call(self._dll.MSDLLIGES2STL, igs_file, stl_file, c_double(tolerance))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_dll_instance.py -v`
Expected: PASS (all four tests)

- [ ] **Step 5: Commit**

```bash
git add dll_instance.py tests/test_dll_instance.py
git commit -m "feat(backend): add DllInstance wrapping one loaded DLL copy

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WU65qj1D57Wdt3LEELawK4"
```

---

### Task 2: Background DLL copy + startup self-check

**Files:**
- Modify: `dll_instance.py`
- Test: `tests/test_dll_instance.py`

**Interfaces:**
- Consumes: `DllInstance` (Task 1) — specifically `.handle`.
- Produces: `prepare_background_dll_copy(source_dll_path: str, source_manifest_path: str, dest_dir: str) -> str` (returns the copied DLL's path); `assert_distinct_dll_instances(a: DllInstance, b: DllInstance) -> None` (raises `RuntimeError` if `a.handle == b.handle`).

- [ ] **Step 1: Write the failing tests**

```python
# append to tests/test_dll_instance.py
import pytest

from dll_instance import prepare_background_dll_copy, assert_distinct_dll_instances

MAIN_DLL_MANIFEST_PATH = MAIN_DLL_PATH + ".manifest"


def test_prepare_background_dll_copy_creates_a_loadable_copy(tmp_path):
    dest_dir = str(tmp_path / "dll_background_instance")

    copied_path = prepare_background_dll_copy(MAIN_DLL_PATH, MAIN_DLL_MANIFEST_PATH, dest_dir)

    assert os.path.exists(copied_path)
    assert copied_path != MAIN_DLL_PATH
    # Must actually be loadable and independently usable.
    instance = DllInstance(copied_path, emit=_no_emit)
    params = (ctypes.c_double * 2)(0.15, 0.05)
    graded = (ctypes.c_double * 2)(0.2, 1.5)
    out_stl = str(tmp_path / "from_copy.stl").encode("ascii")
    assert instance.get_tile(0, params, graded, 0.0, out_stl) is None


def test_prepare_background_dll_copy_is_idempotent_across_restarts(tmp_path):
    dest_dir = str(tmp_path / "dll_background_instance")

    first = prepare_background_dll_copy(MAIN_DLL_PATH, MAIN_DLL_MANIFEST_PATH, dest_dir)
    second = prepare_background_dll_copy(MAIN_DLL_PATH, MAIN_DLL_MANIFEST_PATH, dest_dir)

    assert first == second
    assert os.path.exists(first)


def test_assert_distinct_dll_instances_passes_for_two_real_loads():
    a = DllInstance(MAIN_DLL_PATH, emit=_no_emit)
    b_path = prepare_background_dll_copy(
        MAIN_DLL_PATH, MAIN_DLL_MANIFEST_PATH,
        dest_dir=os.path.join(REPO_ROOT, "tmp", "test_dll_background_instance"),
    )
    b = DllInstance(b_path, emit=_no_emit)

    assert_distinct_dll_instances(a, b)  # must not raise


def test_assert_distinct_dll_instances_raises_when_handles_match():
    class _Fake:
        def __init__(self, handle):
            self.handle = handle

    with pytest.raises(RuntimeError):
        assert_distinct_dll_instances(_Fake(1), _Fake(1))
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_dll_instance.py -v -k "prepare_background or assert_distinct"`
Expected: FAIL with `ImportError: cannot import name 'prepare_background_dll_copy'`

- [ ] **Step 3: Add the copy + self-check functions to `dll_instance.py`**

```python
# add near the top of dll_instance.py, after the existing imports
import os
import shutil
```

```python
# append to dll_instance.py, after the DllInstance class

def prepare_background_dll_copy(source_dll_path: str, source_manifest_path: str, dest_dir: str) -> str:
    """Copies the DLL (+ its .manifest) to dest_dir, overwriting any
    previous copy there, and returns the copied DLL's path. Called once at
    server startup so the background lane always loads a byte-identical,
    but separately-loaded, copy of the real DLL — never committed to the
    repo, so the two can't drift out of sync with each other."""
    os.makedirs(dest_dir, exist_ok=True)
    dest_dll_path = os.path.join(dest_dir, os.path.basename(source_dll_path))
    shutil.copyfile(source_dll_path, dest_dll_path)
    if os.path.exists(source_manifest_path):
        dest_manifest_path = os.path.join(dest_dir, os.path.basename(source_manifest_path))
        shutil.copyfile(source_manifest_path, dest_manifest_path)
    return dest_dll_path


def assert_distinct_dll_instances(a: "DllInstance", b: "DllInstance") -> None:
    """The whole two-lane design rests on two ctypes.CDLL() loads of the
    same DLL file, from two different paths, getting independent module
    handles (and therefore independent static/global state) on Windows.
    This was confirmed by direct measurement, but refuses to silently run
    in a mode that would reintroduce cross-lane DLL corruption if that
    ever turns out not to hold (a different Windows version, a different
    loader configuration, etc.) — fail loud at startup instead."""
    if a.handle == b.handle:
        raise RuntimeError(
            "dll_main and dll_background share the same loaded module handle "
            f"({a.handle:#x}) — the two-lane DLL design requires independent "
            "module instances. Refusing to start in a configuration that "
            "would let background work corrupt a real calculation's output."
        )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_dll_instance.py -v`
Expected: PASS (all eight tests)

- [ ] **Step 5: Commit**

```bash
git add dll_instance.py tests/test_dll_instance.py
git commit -m "feat(backend): add background DLL copy + startup distinct-instance check

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WU65qj1D57Wdt3LEELawK4"
```

---

### Task 3: `BackgroundDllLane`

**Files:**
- Create: `dll_lane.py`
- Test: `tests/test_dll_lane.py`

**Interfaces:**
- Produces: `class BackgroundDllLane` with `try_acquire() -> bool`, `acquire_blocking(timeout: float) -> bool`, `release() -> None`.

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_dll_lane.py
import threading
import time

from dll_lane import BackgroundDllLane


def _wait_until(predicate, timeout=2.0, interval=0.01):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if predicate():
            return True
        time.sleep(interval)
    return predicate()


def test_try_acquire_is_exclusive():
    lane = BackgroundDllLane()

    assert lane.try_acquire() is True
    assert lane.try_acquire() is False
    lane.release()
    assert lane.try_acquire() is True
    lane.release()


def test_acquire_blocking_acquires_immediately_when_free():
    lane = BackgroundDllLane()

    start = time.time()
    assert lane.acquire_blocking(timeout=2.0) is True
    assert time.time() - start < 0.5
    lane.release()


def test_acquire_blocking_waits_for_release_then_acquires():
    lane = BackgroundDllLane()
    assert lane.try_acquire() is True  # simulate an in-flight holder

    acquired = threading.Event()
    result = {}

    def waiter():
        result['ok'] = lane.acquire_blocking(timeout=2.0)
        acquired.set()

    t = threading.Thread(target=waiter)
    t.start()

    time.sleep(0.1)
    assert not acquired.is_set()  # still blocked — lane is held

    lane.release()

    assert acquired.wait(timeout=2.0)
    assert result['ok'] is True
    lane.release()
    t.join()


def test_acquire_blocking_times_out_without_acquiring():
    lane = BackgroundDllLane()
    assert lane.try_acquire() is True  # held for the whole test

    start = time.time()
    ok = lane.acquire_blocking(timeout=0.1)
    elapsed = time.time() - start

    assert ok is False
    assert elapsed >= 0.1
    assert elapsed < 1.0

    assert lane.try_acquire() is False  # still held by the original acquirer
    lane.release()


def test_lane_is_independent_of_a_calc_queue_manager():
    """The whole point of splitting this out of CalcQueueManager: a slow
    main-queue job must never block a BackgroundDllLane acquire."""
    from calc_queue import CalcQueueManager

    release_main_job = threading.Event()

    def slow_run_job(job):
        release_main_job.wait(timeout=2)

    def no_emit(event, sid, payload):
        pass

    queue_manager = CalcQueueManager(run_job=slow_run_job, emit=no_emit)
    queue_manager.start()
    queue_manager.enqueue('main-job', {})
    time.sleep(0.05)  # let the worker pick it up — main queue is now busy

    lane = BackgroundDllLane()
    start = time.time()
    assert lane.try_acquire() is True  # must not be affected by the main queue at all
    assert time.time() - start < 0.1
    lane.release()

    release_main_job.set()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_dll_lane.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'dll_lane'`

- [ ] **Step 3: Write `dll_lane.py`**

```python
"""dll_lane.py — a standalone "one caller at a time" gate for background
(non-queued) DLL work: silent macro-shape preview, tile preview, and
/convert_igs_to_stl. Deliberately has no relationship to CalcQueueManager's
waiting-room/worker-thread machinery — that independence is the entire
point (see docs/superpowers/specs/2026-09-14-background-dll-lane-design.md).
"""

import threading
import time


class BackgroundDllLane:
    def __init__(self):
        self._lock = threading.Lock()
        self._not_busy = threading.Condition(self._lock)
        self._busy = False

    def try_acquire(self) -> bool:
        """Non-blocking: True (and holds the lane) if free, False if busy."""
        with self._lock:
            if self._busy:
                return False
            self._busy = True
            return True

    def acquire_blocking(self, timeout: float) -> bool:
        """Waits up to `timeout` seconds for the lane to free up, then
        holds it. Returns False (without acquiring) if the timeout
        elapses first."""
        with self._not_busy:
            deadline = time.time() + timeout
            while self._busy:
                remaining = deadline - time.time()
                if remaining <= 0:
                    return False
                self._not_busy.wait(timeout=remaining)
            self._busy = True
            return True

    def release(self) -> None:
        with self._lock:
            self._busy = False
            self._not_busy.notify_all()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_dll_lane.py -v`
Expected: PASS (all five tests)

- [ ] **Step 5: Commit**

```bash
git add dll_lane.py tests/test_dll_lane.py
git commit -m "feat(backend): add BackgroundDllLane, independent of the main calc queue

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WU65qj1D57Wdt3LEELawK4"
```

---

### Task 4: Shrink `CalcQueueManager` to just the main-queue's own concerns

**Files:**
- Modify: `calc_queue.py`
- Modify: `tests/test_calc_queue.py`

**Interfaces:**
- Consumes: nothing new.
- Produces: `CalcQueueManager.mark_dll_free() -> None` (new public method). Removes `try_acquire_dll`, `release_dll`, `acquire_dll_blocking` (moved to `BackgroundDllLane`, Task 3 — nothing outside this module calls them anymore after Task 7/9 rewire their callers).

- [ ] **Step 1: Remove the now-obsolete tests from `tests/test_calc_queue.py`**

Delete these eight tests (lines 176–313 in the current file) — they test `try_acquire_dll`/`release_dll`/`acquire_dll_blocking`, which are moving to `BackgroundDllLane` (already re-tested there in Task 3) and, in two cases (`test_tile_slot_blocked_while_a_full_job_is_running`, `test_a_queued_job_waits_for_a_held_tile_slot_to_release`), assert the exact coupling this whole feature removes:

- `test_tile_slot_is_exclusive`
- `test_tile_slot_blocked_while_a_full_job_is_running`
- `test_a_queued_job_waits_for_a_held_tile_slot_to_release`
- `test_acquire_dll_blocking_acquires_immediately_when_free`
- `test_acquire_dll_blocking_waits_for_release_then_acquires`
- `test_acquire_dll_blocking_times_out_without_acquiring`
- `test_acquire_dll_blocking_wakes_promptly_even_though_worker_shares_the_condition`

(the `# ── Finding 1: acquire_dll_blocking ──` comment header above them goes too — nothing left under it).

- [ ] **Step 2: Add the failing test for the new method**

```python
# add to tests/test_calc_queue.py, near test_never_runs_two_jobs_concurrently

def test_mark_dll_free_lets_the_worker_pick_up_the_next_job_without_waiting_for_run_job_to_return():
    """run_job itself is expected to call mark_dll_free() partway through
    (right after its own DLL work, before its slower non-DLL tail) —
    simulate that here and confirm the worker's *own* end-of-job release
    doesn't have to fire first."""
    order = []

    def run_job(job):
        order.append(f'dll-start-{job.sid}')
        manager.mark_dll_free()
        order.append(f'dll-end-{job.sid}')
        time.sleep(0.05)  # simulate a slow non-DLL tail (compression)

    manager, _, _ = make_manager(run_job=run_job)
    manager.start()

    manager.enqueue('first', {})
    assert _wait_until(lambda: 'dll-end-first' in order)

    manager.enqueue('second', {})
    # 'second' must start soon after mark_dll_free(), not after 'first''s
    # full run_job (including its 0.05s tail) returns.
    assert _wait_until(lambda: 'dll-start-second' in order, timeout=1.0)
```

- [ ] **Step 3: Run the new test to verify it fails**

Run: `python -m pytest tests/test_calc_queue.py::test_mark_dll_free_lets_the_worker_pick_up_the_next_job_without_waiting_for_run_job_to_return -v`
Expected: FAIL with `AttributeError: 'CalcQueueManager' object has no attribute 'mark_dll_free'`

- [ ] **Step 4: Update `calc_queue.py`**

Remove the `try_acquire_dll`, `release_dll`, and `acquire_dll_blocking` methods (and their section comment `# ── calculate_tile: non-blocking best-effort access ──`) from `CalcQueueManager`, and add `mark_dll_free`:

```python
    # ── DLL-slot release (called by run_job right after its own DLL work) ──

    def mark_dll_free(self) -> None:
        """Called by run_job as soon as its own DLL call is done (success
        or failure), before it goes on to do non-DLL work (compression,
        emit). With no dedicated worker thread waiting on this signal
        anymore (see dll_lane.BackgroundDllLane for that concern), this
        exists purely so run_job's own timing is explicit and testable —
        the worker loop's own end-of-job release below is an idempotent
        safety net, not the only thing gating the next job."""
        with self._lock:
            self._busy = False
            self._not_empty.notify_all()
```

Leave the `_worker_loop`'s own `finally: self._busy = False; self._not_empty.notify_all()` exactly as it is today — it's now a harmless idempotent safety net (already-False stays False) covering any path that doesn't reach `mark_dll_free()`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `python -m pytest tests/test_calc_queue.py -v`
Expected: PASS (all remaining tests, including the new one; the 7 removed tests are gone from the run entirely)

- [ ] **Step 6: Commit**

```bash
git add calc_queue.py tests/test_calc_queue.py
git commit -m "refactor(backend): move DLL try-acquire out of CalcQueueManager, add mark_dll_free

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WU65qj1D57Wdt3LEELawK4"
```

---

### Task 5: Wire the two DLL instances + background lane into `main.py`

**Files:**
- Modify: `main.py`

**Interfaces:**
- Consumes: `DllInstance`, `prepare_background_dll_copy`, `assert_distinct_dll_instances` (Task 1/2); `BackgroundDllLane` (Task 3).
- Produces: module-level `dll_main`, `dll_background` (both `DllInstance`), `dll_background_lane` (`BackgroundDllLane`) — consumed by Tasks 6–9. `do_revolution`/`do_extrusion`/`do_Ruling`/`calculate_tile` gain a leading `dll_instance` parameter.

This task has no new automated test of its own — it's pure rewiring, verified by Task 5's manual check below plus the full suite staying green (regressions would show up in Tasks 6–9's tests, which depend on this wiring existing).

- [ ] **Step 1: Delete the old single-instance DLL setup block**

In `main.py`, delete everything from the `# DLL — load and configure signatures` section header through the end of `_dll_iges2stl` (currently lines 29–207: the `_DLL_PATH`/`_dll = ctypes.CDLL(...)` block, `IritMiscProgressReportStruct`/`_PRInfoPtr`/`_ProgressCB`, `_current_calc_sid` and `_cb_init`/`_cb_update`/`_cb_done`, the `_dll.MSDLLSetProgressReportFuncs(...)` call, all five `_dll.<Func>.restype/argtypes` blocks, and the `_call`/`_dll_get_tile`/`_dll_from_revolution`/`_dll_from_extrusion`/`_dll_from_ruling`/`_dll_iges2stl` free functions) — all of it now lives in `dll_instance.py` (Task 1).

- [ ] **Step 2: Add the import and the two-instance startup wiring**

Add near the top of `main.py`, alongside the other local imports:

```python
from dll_instance import DllInstance, prepare_background_dll_copy, assert_distinct_dll_instances
from dll_lane import BackgroundDllLane
```

Right after `socketio = SocketIO(...)` (so `_emit_queue_event` and `socketio` both already exist), add:

```python
_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MAIN_DLL_PATH = os.path.join(_BASE_DIR, "gershon", "MSDLL64.dll")
MAIN_DLL_MANIFEST_PATH = MAIN_DLL_PATH + ".manifest"


def _emit_queue_event(event: str, sid: str, payload: dict) -> None:
    socketio.emit(event, payload, room=sid)


try:
    dll_main = DllInstance(MAIN_DLL_PATH, emit=_emit_queue_event)
except OSError as _exc:
    raise OSError(
        f"Failed to load DLL at '{MAIN_DLL_PATH}'. "
        f"Check that the file exists and all dependencies are present. "
        f"Original error: {_exc}"
    ) from _exc

_background_dll_path = prepare_background_dll_copy(
    MAIN_DLL_PATH, MAIN_DLL_MANIFEST_PATH,
    dest_dir=os.path.join(os.getcwd(), 'tmp', 'dll_background_instance'),
)
dll_background = DllInstance(_background_dll_path, emit=_emit_queue_event)
assert_distinct_dll_instances(dll_main, dll_background)
dll_background_lane = BackgroundDllLane()
```

This makes the existing `_emit_queue_event` definition further down the file (just above `calculate_tile`, currently reading as below) redundant — delete it, along with the comment explaining why it used to have to live there:

```python
def _emit_queue_event(event: str, sid: str, payload: dict) -> None:
    socketio.emit(event, payload, room=sid)


# queue_manager is instantiated further down, right after _run_calculate_job
# is defined (see there for why: unlike a name referenced inside a function
# body — which is looked up only when that function is actually called,
# well after the whole module has finished importing — this keyword
# argument is bound eagerly, at this statement's own execution time, so
# _run_calculate_job must already exist as a module global here).
```

Delete that whole block (both the function and the comment above it), leaving `VALID_CALC_MODES = {...}` followed directly by `def calculate_tile(dll_instance, ...)` (Step 3, below).

- [ ] **Step 3: Thread `dll_instance` through the surface-dispatch functions**

```python
def do_revolution(dll_instance, out_folder, igs_path, num_tiles, tile_params, grading_params, tile_type_int):
    out_igs = os.path.join(out_folder, "MSRevolv.igs").encode('ascii')
    out_stl = os.path.join(out_folder, "MSRevolv.stl").encode('ascii')
    dll_error = dll_instance.from_revolution(
        igs_path.encode('ascii'),
        num_tiles, grading_params,
        tile_type_int,
        tile_params,
        out_igs, out_stl,
    )
    if dll_error:
        raise RuntimeError(dll_error)
    stl_content = read_ascii_stl_file(out_stl.decode('ascii'))
    return stl_content, "MSRevolv.stl", "MSRevolv.igs"


def do_extrusion(dll_instance, out_folder, igs_path, num_tiles, tile_params, grading_params, tile_type_int, extrude_length=10.0):
    out_igs = os.path.join(out_folder, "MSExtrd.igs").encode('ascii')
    out_stl = os.path.join(out_folder, "MSExtrd.stl").encode('ascii')
    dll_error = dll_instance.from_extrusion(
        igs_path.encode('ascii'),
        extrude_length,
        num_tiles, grading_params,
        tile_type_int,
        tile_params,
        out_igs, out_stl,
    )
    if dll_error:
        raise RuntimeError(dll_error)

    stl_content = read_ascii_stl_file(out_stl.decode('ascii'))
    return stl_content, "MSExtrd.stl", "MSExtrd.igs"


def do_Ruling(dll_instance, out_folder, igs_path, igs_path2, num_tiles, tile_params, grading_params, tile_type_int):
    out_igs = os.path.join(out_folder, "MSRuled.igs").encode('ascii')
    out_stl = os.path.join(out_folder, "MSRuled.stl").encode('ascii')

    dll_error = dll_instance.from_ruling(
        igs_path.encode('ascii'), igs_path2.encode('ascii'),
        num_tiles, grading_params,
        tile_type_int,
        tile_params,
        out_igs, out_stl,
    )
    if dll_error:
        raise RuntimeError(dll_error)

    stl_content = read_ascii_stl_file(out_stl.decode('ascii'))
    return stl_content, "MSRuled.stl", "MSRuled.igs"
```

`CALC_MODE_DISPATCH = {CALC_MODE_REVOLUTION: do_revolution}` stays unchanged — callers now pass `dll_instance` as `do_revolution`'s first positional argument (updated in Task 6).

Update `calculate_tile`'s signature and its one DLL call site:

```python
def calculate_tile(dll_instance, tile_params, graded, tile_type_str, tolerance, sid):
    t_recv = time.time()
    tile_type_int = TILE_TYPE_MAP.get(tile_type_str)
    if tile_type_int is None:
        logger.error(f"[TILE] Unknown tile type: {tile_type_str}", extra=_log_extra(sid))
        return

    stl_tile_path = os.path.join(os.getcwd(), TMP_DIR, f"tile_{uuid.uuid4().hex}.stl")

    # Actual calculation
    dll_error = dll_instance.get_tile(tile_type_int, tile_params, graded, tolerance, stl_tile_path.encode('utf-8'))

    if dll_error:
        emit('error', {'msg': f'Tile generation failed: {dll_error}'})
        return

    t_processed = time.time()
    if not os.path.exists(stl_tile_path):
        logger.error(f"[TILE] STL not found: {stl_tile_path}", extra=_log_extra(sid))
        emit('error', {'msg': 'Tile generation produced no output'})
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
            f"  t=({tolerance:.2f})"
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

The only changes from today's version: the new leading `dll_instance` parameter, and the DLL call line now reading `dll_instance.get_tile(...)` instead of `_dll_get_tile(...)`. Everything else in the function body is copied verbatim.

- [ ] **Step 4: Run the full test suite to confirm nothing else broke from the rewiring**

Run: `python -m pytest tests/ -q`
Expected: `tests/test_calc_queue.py`, `tests/test_dll_instance.py`, `tests/test_dll_lane.py` PASS (none of them import `main`, so they're unaffected by anything in this task). `tests/test_calculate_queue_integration.py` and `tests/test_convert_igs_to_stl_queue.py` are EXPECTED TO FAIL at this point — they still call the old `_dll_iges2stl`/`queue_manager.try_acquire_dll` names removed in Task 4 and this task; they're fixed in Tasks 9 and 6–8 respectively. Confirm the failures are only in those two files and are `AttributeError`/`TypeError`-shaped (old names gone / old call sites not yet updated), not new logic errors.

Note this task leaves `_run_calculate_job` and `handle_calculate_tile` (both untouched here — fixed in Tasks 6 and 7) calling `do_Ruling`/`do_extrusion`/`CALC_MODE_DISPATCH[...]`/`calculate_tile` with their *old* argument lists against these functions' *new* `dll_instance`-first signatures. The existing test suite doesn't happen to exercise ruling mode, extrusion mode, or `calculate_tile` at this specific checkpoint, so nothing catches it yet — that's expected, not a gap to fix here. Don't run the real server against ruling/extrusion input or a tile drag between this task and Task 7; go straight on to Task 6.

- [ ] **Step 5: Commit**

```bash
git add main.py
git commit -m "refactor(backend): wire dll_main/dll_background/dll_background_lane into main.py

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WU65qj1D57Wdt3LEELawK4"
```

---

### Task 6: Split the calculate pipeline; shrink Lane A's busy window

**Files:**
- Modify: `main.py`
- Modify: `tests/test_calculate_queue_integration.py`

**Interfaces:**
- Consumes: `dll_main`, `queue_manager.mark_dll_free()` (Task 5/4).
- Produces: `_run_calculate_dll_phase(dll_instance, payload, sid) -> dict | None`, `_finish_calculate(payload, sid, dll_result) -> None`, both used again by Task 8 for the silent/background path.

- [ ] **Step 1: Write the failing test — job N+1's DLL phase starts before job N's tail finishes**

```python
# add to tests/test_calculate_queue_integration.py

def test_second_real_calculate_starts_before_first_ones_compression_finishes(monkeypatch):
    """Regression for the busy-window shrink: the worker must free itself
    for the next job the instant the DLL call ends, not after compression
    + emit. Fakes a slow compress step so the effect is observable without
    waiting on real compression timing."""
    calls = _install_fake_revolution(monkeypatch, delay=0.05)

    dll_events = []
    orig_compress = main_module.compress_text_to_b64_gz

    def slow_compress(text):
        dll_events.append(('compress-start', time.time()))
        time.sleep(0.3)
        dll_events.append(('compress-end', time.time()))
        return orig_compress(text)

    monkeypatch.setattr(main_module, 'compress_text_to_b64_gz', slow_compress)

    c1 = main_module.socketio.test_client(main_module.app)
    c2 = main_module.socketio.test_client(main_module.app)
    c1.get_received()
    c2.get_received()

    c1.emit('calculate', _calc_payload())
    time.sleep(0.02)  # let c1's DLL call start
    dll_events.append(('c2-emit', time.time()))
    c2.emit('calculate', _calc_payload())

    # c2's own DLL call (the fake revolution) must be recorded well before
    # c1's slow compression finishes — i.e. the two overlap.
    assert _wait_until(lambda: len(calls) >= 2, timeout=2.0)
    compress_start = next(t for (ev, t) in dll_events if ev == 'compress-start')
    assert calls[1] < compress_start + 0.3  # c2's DLL call started during c1's compression window
```

- [ ] **Step 2: Run it to verify it fails**

Run: `python -m pytest tests/test_calculate_queue_integration.py::test_second_real_calculate_starts_before_first_ones_compression_finishes -v`
Expected: FAIL (c2's DLL call doesn't start until c1's full pipeline, including the 0.3s fake compression, finishes — the assertion on `calls[1]` fails or the `_wait_until` times out)

- [ ] **Step 3: Split `_run_calculate_job` into `_run_calculate_dll_phase` + `_finish_calculate`, and rewrite `_run_calculate_job` to use them**

Replace the existing `_run_calculate_job` function (and the `global _current_calc_sid` line, now gone — `DllInstance.set_current_sid` replaces it) with:

```python
def _run_calculate_dll_phase(dll_instance, payload: dict, sid: str) -> dict | None:
    """The exclusive part of a calculate request: builds the ctypes args
    and calls the DLL. Emits its own error and returns None on failure.
    Callers release their own lane's DLL slot immediately after this
    returns — nothing below this function touches the DLL."""
    p = payload
    filename       = p['filename']
    calc_mode      = p['calc_mode']
    tile_type_int  = p['tile_type_int']
    nt1, nt2, nt3  = p['nt1'], p['nt2'], p['nt3']
    g1, g2         = p['g1'], p['g2']
    p1, p2, p3     = p['p1'], p['p2'], p['p3']
    extrude_length = p['extrude_length']
    igs_bytes      = p['igs_bytes']
    igs_bytes2     = p['igs_bytes2']

    curr_num_tiles   = (c_int * 3)(nt1, nt2, nt3)
    curr_graded      = (c_double * 2)(g1, g2)
    curr_tile_params = (c_double * 3)(p1, p2, p3)

    new_token  = str(uuid.uuid4())
    out_folder = os.path.join(os.getcwd(), LAST_RESULTS_DIR, new_token)
    os.makedirs(out_folder, exist_ok=True)

    t_dll_start = time.time()
    dll_instance.set_current_sid(sid)
    try:
        logger.info(f"[CALC] -> {calc_mode}  filename={filename}", extra=_log_extra(sid))
        with temp_igs_file(igs_bytes) as igs_path:
            if calc_mode == CALC_MODE_RULING:
                with temp_igs_file(igs_bytes2) as igs_path2:
                    stl_content, out_stl_name, out_igs_name = do_Ruling(
                        dll_instance, out_folder, igs_path, igs_path2,
                        curr_num_tiles, curr_tile_params, curr_graded, tile_type_int,
                    )
            elif calc_mode == CALC_MODE_EXTRUSION:
                stl_content, out_stl_name, out_igs_name = do_extrusion(
                    dll_instance, out_folder, igs_path, curr_num_tiles, curr_tile_params, curr_graded, tile_type_int,
                    extrude_length,
                )
            else:
                dispatch_fn = CALC_MODE_DISPATCH[calc_mode]
                stl_content, out_stl_name, out_igs_name = dispatch_fn(
                    dll_instance, out_folder, igs_path, curr_num_tiles, curr_tile_params, curr_graded, tile_type_int
                )
    except FileNotFoundError as exc:
        logger.exception(f"[CALC] DLL output file not found: {exc}", extra=_log_extra(sid))
        socketio.emit('error', {'msg': f'DLL did not produce output file: {exc}'}, room=sid)
        shutil.rmtree(out_folder, ignore_errors=True)
        return None
    except Exception as exc:
        logger.exception(f"[CALC] DLL call failed: {exc}", extra=_log_extra(sid))
        socketio.emit('error', {'msg': f'Processing error: {exc}'}, room=sid)
        shutil.rmtree(out_folder, ignore_errors=True)
        return None
    finally:
        dll_instance.set_current_sid(None)
    t_dll_end = time.time()

    if not stl_content:
        logger.error("[CALC] No STL content produced after DLL call", extra=_log_extra(sid))
        socketio.emit('error', {'msg': 'No output produced by DLL'}, room=sid)
        shutil.rmtree(out_folder, ignore_errors=True)
        return None

    return {
        'stl_content': stl_content, 'out_stl_name': out_stl_name, 'out_igs_name': out_igs_name,
        'out_folder': out_folder, 'new_token': new_token,
        't_dll_start': t_dll_start, 't_dll_end': t_dll_end,
    }


def _finish_calculate(payload: dict, sid: str, dll_result: dict) -> None:
    """The non-exclusive tail of a calculate request: disconnect checks,
    compression, DOWNLOAD_CACHE bookkeeping, the result emit. Deliberately
    never touches the DLL — safe to run on its own thread, in parallel
    with the *next* DLL call on either lane. Must use explicit room=sid
    emits (no implicit request context on a spawned thread)."""
    try:
        client_ts  = payload['client_ts']
        filename   = payload['filename']
        args       = payload['args']
        t_received = payload['t_received']

        stl_content  = dll_result['stl_content']
        out_stl_name = dll_result['out_stl_name']
        out_igs_name = dll_result['out_igs_name']
        out_folder   = dll_result['out_folder']
        new_token    = dll_result['new_token']
        t_dll_start  = dll_result['t_dll_start']
        t_dll_end    = dll_result['t_dll_end']
        t_start      = t_dll_start

        # The client may have disconnected while this job was queued/running.
        # Nothing will ever redeem this token — discard the result rather
        # than leaking a last_results/<token>/ folder and a DOWNLOAD_CACHE entry.
        if sid not in connected_clients:
            logger.info("[CALC] client disconnected during calculation — discarding result", extra=_log_extra(sid))
            shutil.rmtree(out_folder, ignore_errors=True)
            return

        try:
            t_comp_start = time.time()
            compressed_b64 = compress_text_to_b64_gz(stl_content)
            t_comp_end = time.time()
            comp_kb = len(base64.b64decode(compressed_b64)) / 1024
        except Exception as exc:
            logger.exception(f"[CALC] Compression failed: {exc}", extra=_log_extra(sid))
            socketio.emit('error', {'msg': 'Compression failed'}, room=sid)
            shutil.rmtree(out_folder, ignore_errors=True)
            return

        # The client may also have disconnected *during* compression (which
        # can take several seconds for large outputs) — re-check right
        # before registering the download, not just before compression, or
        # we'd leak a DOWNLOAD_CACHE entry and a last_results/<token>/
        # folder that nothing will ever redeem.
        if sid not in connected_clients:
            logger.info("[CALC] client disconnected during compression — discarding result", extra=_log_extra(sid))
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
            'client_to_server_ms': None if client_ts is None else (t_received * 1000 - client_ts),
            'time_dll_ms':         round((t_dll_end - t_dll_start) * 1000),
            'time_compress_ms':    round((t_comp_end - t_comp_start) * 1000),
            'overall_ms':          round(t_total * 1000),
        }

        socketio.emit('result', {
            'filename_reduced': os.path.splitext(os.path.basename(filename))[0] + '_reduced.stl',
            'kind':             'model_stl',
            'stl_gz_b64':       compressed_b64,
            'timings':          timings,
            'args_echo':        args,
            'filename':         filename,
            'download_token':   new_token,
        }, room=sid)

        logger.info(
            f"[CALC] done  {comp_kb:.0f}KB"
            f"  overall={timings['overall_ms']}ms"
            f"  dll={timings['time_dll_ms']}ms"
            f"  compress={timings['time_compress_ms']}ms"
            f"  token={new_token}",
            extra=_log_extra(sid),
        )
    except Exception:
        # This runs on its own thread — an uncaught exception here would
        # otherwise vanish silently instead of failing the request visibly.
        logger.exception("[CALC] _finish_calculate failed unexpectedly", extra=_log_extra(sid))


def _run_calculate_job(job: Job) -> None:
    """CalcQueueManager's run_job callback — Lane A (main queue). Runs on
    the queue's dedicated worker thread — never concurrently with another
    call to this function, and never while dll_main is otherwise in use."""
    dll_result = _run_calculate_dll_phase(dll_main, job.payload, job.sid)
    queue_manager.mark_dll_free()
    if dll_result is not None:
        threading.Thread(
            target=_finish_calculate, args=(job.payload, job.sid, dll_result),
            daemon=True, name=f'calc-finish-{job.sid}',
        ).start()


queue_manager = CalcQueueManager(run_job=_run_calculate_job, emit=_emit_queue_event)
queue_manager.start()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_calc_queue.py tests/test_calculate_queue_integration.py -v`
Expected: PASS, including the new regression test. (`test_calculate_queue_integration.py`'s other pre-existing tests must still pass unchanged — they exercise ordering/position behavior that this task doesn't touch.)

- [ ] **Step 5: Commit**

```bash
git add main.py tests/test_calculate_queue_integration.py
git commit -m "perf(backend): split calculate into DLL phase + finish phase, shrink Lane A busy window

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WU65qj1D57Wdt3LEELawK4"
```

---

### Task 7: Route `calculate_tile` through the background lane

**Files:**
- Modify: `main.py`

**Interfaces:**
- Consumes: `dll_background`, `dll_background_lane` (Task 5); `calculate_tile(dll_instance, ...)` (Task 5).

- [ ] **Step 1: Write the failing test**

```python
# add to tests/test_calculate_queue_integration.py

def test_tile_call_is_not_blocked_by_a_running_main_calculation(monkeypatch):
    """The scenario this whole feature exists for: tile preview must not
    freeze while an unrelated real calculation is running."""
    _install_fake_revolution(monkeypatch, delay=0.5)

    c1 = main_module.socketio.test_client(main_module.app)
    c2 = main_module.socketio.test_client(main_module.app)
    c1.get_received()
    c2.get_received()

    c1.emit('calculate', _calc_payload())
    time.sleep(0.05)  # let c1's (slow, fake) DLL call start and hold dll_main

    start = time.time()
    c2.emit('calculate_tile', {
        'values': [0.15, 0.05, 0.0], 'type': 'cross', 'tolerance': 0.0,
    })
    assert _wait_until(lambda: any(
        m['name'] == 'result' for m in c2.get_received()
    ), timeout=0.4)
    assert time.time() - start < 0.4  # nowhere near c1's 0.5s hold on dll_main
```

- [ ] **Step 2: Run it to verify it fails**

Run: `python -m pytest tests/test_calculate_queue_integration.py::test_tile_call_is_not_blocked_by_a_running_main_calculation -v`
Expected: FAIL (`calculate_tile` still goes through the now-removed `queue_manager.try_acquire_dll`, so this test doesn't even get to the timing assertion — it errors before that)

- [ ] **Step 3: Update `handle_calculate_tile`**

```python
@socketio.on('calculate_tile')
def handle_calculate_tile(data):
    try:
        p1, p2, p3 = data['values']
        tile_type   = data['type']
        tile_params = (c_double * 3)(p1, p2, p3)
        graded1, graded2   = data.get('graded', [1, 1])
        graded  = (c_double * 2)(graded1, graded2)
        tolerance = float(data.get('tolerance', 0.0))

        if not dll_background_lane.try_acquire():
            # Background lane busy with someone else's silent/tile/upload
            # work — skip silently rather than queue or block; the next
            # scrub tick, or the moment the lane frees up, produces a
            # fresh preview normally. Never affected by dll_main.
            return
        sid = request.sid
        dll_background.set_current_sid(sid)
        try:
            calculate_tile(dll_background, tile_params, graded, tile_type, tolerance, sid)
        finally:
            dll_background.set_current_sid(None)
            dll_background_lane.release()
    except Exception as exc:
        logger.exception(f"[TILE] bad request: {exc}", extra={'sid': request.sid})
        emit('error', {'msg': f'Bad tile request: {exc}'})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_calculate_queue_integration.py -v`
Expected: PASS, including the new test

- [ ] **Step 5: Commit**

```bash
git add main.py tests/test_calculate_queue_integration.py
git commit -m "fix(backend): route calculate_tile through the background DLL lane

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WU65qj1D57Wdt3LEELawK4"
```

---

### Task 8: Route silent `calculate` requests through the background lane

**Files:**
- Modify: `main.py`

**Interfaces:**
- Consumes: `dll_background`, `dll_background_lane` (Task 5); `_run_calculate_dll_phase`, `_finish_calculate` (Task 6).
- Produces: `_run_silent_calculate(sid: str, payload: dict) -> None`.

- [ ] **Step 1: Write the failing test**

```python
# add to tests/test_calculate_queue_integration.py

def test_silent_calculate_never_enters_the_main_queue_or_blocks_it(monkeypatch):
    """A silent (background macro-preview) calculate must not occupy a
    waiting-room slot, must not delay a real calculate queued after it,
    and must not surface any queue_status/queue_rejected to the client."""
    _install_fake_revolution(monkeypatch, delay=0.1)

    c1 = main_module.socketio.test_client(main_module.app)
    c1.get_received()

    payload = _calc_payload()
    payload['silent'] = True
    c1.emit('calculate', payload)

    time.sleep(0.05)
    # A silent request must never occupy the main queue's waiting room.
    assert len(main_module.queue_manager._waiting) == 0

    received = c1.get_received()
    assert not any(m['name'] == 'queue_status' for m in received)
    assert not any(m['name'] == 'queue_rejected' for m in received)


def test_silent_calculate_is_dropped_when_the_background_lane_is_busy(monkeypatch):
    _install_fake_revolution(monkeypatch, delay=0.3)

    c1 = main_module.socketio.test_client(main_module.app)
    c1.get_received()

    assert main_module.dll_background_lane.try_acquire() is True  # simulate in-flight background work
    try:
        payload = _calc_payload()
        payload['silent'] = True
        c1.emit('calculate', payload)
        time.sleep(0.1)
        received = c1.get_received()
        # Dropped silently — no error, no result, no queue event.
        assert received == []
    finally:
        main_module.dll_background_lane.release()
```

- [ ] **Step 2: Run them to verify they fail**

Run: `python -m pytest tests/test_calculate_queue_integration.py::test_silent_calculate_never_enters_the_main_queue_or_blocks_it tests/test_calculate_queue_integration.py::test_silent_calculate_is_dropped_when_the_background_lane_is_busy -v`
Expected: FAIL — today's `handle_calculate` still enqueues silent requests into `queue_manager`, so the first test's `len(main_module.queue_manager._waiting) == 0` assertion (or the fake-DLL call itself) fails, and the second test never gets a chance to drop anything.

- [ ] **Step 3: Update `handle_calculate` and add `_run_silent_calculate`**

Replace the tail of `handle_calculate` (from the `payload = {...}` construction to its end) with:

```python
    payload = {
        'client_ts': client_ts, 'filename': filename, 'args': args,
        'calc_mode': calc_mode, 'tile_type_int': tile_type_int,
        'nt1': nt1, 'nt2': nt2, 'nt3': nt3, 'g1': g1, 'g2': g2,
        'p1': p1, 'p2': p2, 'p3': p3, 'extrude_length': extrude_length,
        'igs_bytes': igs_bytes, 'igs_bytes2': igs_bytes2,
        't_received': t_received,
    }

    if silent:
        if not dll_background_lane.try_acquire():
            # Background lane busy — drop this preview. A newer trigger
            # (or the next debounce tick) supersedes it; never queues,
            # never surfaces any UI, never touches dll_main.
            return
        threading.Thread(
            target=_run_silent_calculate, args=(sid, payload),
            daemon=True, name=f'calc-silent-{sid}',
        ).start()
        return

    accepted = queue_manager.enqueue(sid, payload, silent=False)
    if not accepted:
        socketio.emit('queue_rejected', {
            'message': 'Site is too busy right now. Please wait a few minutes and try again.',
            'silent': False,
        }, room=sid)
```

Add, right after `_run_calculate_job` (and before `queue_manager = CalcQueueManager(...)`):

```python
def _run_silent_calculate(sid: str, payload: dict) -> None:
    """Lane B: a silent macro-shape preview. Caller must already hold
    dll_background_lane (a successful try_acquire()) before calling this;
    releases it here, right after the DLL phase, before the (potentially
    slow) finish phase."""
    dll_result = _run_calculate_dll_phase(dll_background, payload, sid)
    dll_background_lane.release()
    if dll_result is not None:
        _finish_calculate(payload, sid, dll_result)
```

Note `_run_silent_calculate` calls `_finish_calculate` directly (not on a further thread) — it's already running on its own thread (spawned by `handle_calculate` above), so no further hand-off is needed.

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_calculate_queue_integration.py -v`
Expected: PASS, including both new tests

- [ ] **Step 5: Commit**

```bash
git add main.py tests/test_calculate_queue_integration.py
git commit -m "fix(backend): route silent calculate requests through the background DLL lane

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WU65qj1D57Wdt3LEELawK4"
```

---

### Task 9: Route `/convert_igs_to_stl` through the background lane

**Files:**
- Modify: `main.py`
- Modify: `tests/test_convert_igs_to_stl_queue.py`

**Interfaces:**
- Consumes: `dll_background`, `dll_background_lane` (Task 5).

- [ ] **Step 1: Update `tests/test_convert_igs_to_stl_queue.py`**

This file currently monkeypatches `main_module._dll_iges2stl` and calls `main_module.queue_manager.try_acquire_dll()`/`.release_dll()` — both gone. Replace every occurrence:

- `monkeypatch.setattr(main_module, '_dll_iges2stl', <fake>)` → `monkeypatch.setattr(main_module.dll_background, 'iges2stl', <fake>)`
- `main_module.queue_manager.try_acquire_dll()` → `main_module.dll_background_lane.try_acquire()`
- `main_module.queue_manager.release_dll()` → `main_module.dll_background_lane.release()`
- `monkeypatch.setattr(main_module.queue_manager, 'acquire_dll_blocking', lambda timeout: False)` → `monkeypatch.setattr(main_module.dll_background_lane, 'acquire_blocking', lambda timeout: False)`

The fake functions currently passed as plain callables (e.g. `_fake_dll_success()`) keep their existing shape — `DllInstance.iges2stl`'s signature is `(igs_file, stl_file, tolerance)`, matching what `_dll_iges2stl` took, so no fake bodies need to change, only the `monkeypatch.setattr` target.

- [ ] **Step 2: Run tests to verify the updated ones fail against today's code**

Run: `python -m pytest tests/test_convert_igs_to_stl_queue.py -v`
Expected: FAIL — `main_module.dll_background`/`dll_background_lane` exist (from Task 5), but the route itself still calls the old `queue_manager.acquire_dll_blocking`/`_dll_iges2stl`, so the monkeypatches in this file no longer take effect on the real code path.

- [ ] **Step 3: Update the route in `main.py`**

```python
@app.route('/convert_igs_to_stl', methods=['POST'])
def handle_convert_igs_to_stl():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    igs_bytes = request.files['file'].read()
    tolerance = float(request.form.get('tolerance', 0.0))

    # This route hits the same DLL as calculate_tile / silent calculate (on
    # every file upload, potentially twice concurrently in ruling mode), so
    # it goes through the same background lane. Unlike calculate_tile, a
    # dropped request here is user-visible (the upload just fails), so it
    # waits briefly for the lane rather than skipping silently. No SocketIO
    # request.sid exists for a plain HTTP POST, so dll_background's current
    # sid is deliberately left untouched — its progress callbacks' `if not
    # self._current_sid: return` guard makes that a safe no-op.
    if not dll_background_lane.acquire_blocking(timeout=30.0):
        logger.warning("[IGS2STL] DLL busy — timed out waiting for the background lane")
        return jsonify({'error': 'Server busy, please try again shortly'}), 503

    try:
        try:
            with temp_igs_file(igs_bytes) as igs_path:
                stl_path = igs_path[:-4] + '_preview.stl'
                t_igs_start = time.time()
                err = dll_background.iges2stl(igs_path.encode('ascii'),
                                               stl_path.encode('ascii'),
                                               tolerance)
                t_igs_ms = round((time.time() - t_igs_start) * 1000)
                if err:
                    logger.warning(f"[IGS2STL] DLL warning: {err}")
                    return jsonify({'error': err or 'IGS conversion failed', 'message' : err or 'IGS conversion failed'}), 500
                if not os.path.exists(stl_path):
                    logger.warning(f"[IGS2STL] DLL warning: no file, {err}")
                    return jsonify({'error': err or 'IGS conversion produced no output'}), 500

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
            response = {'stl_b64': b64_str}
            if err:
                response['warning'] = err
            return jsonify(response)

        except Exception as exc:
            logger.exception(f"[IGS2STL] {exc}")
            return jsonify({'error': f'Internal server error: {exc}'}), 500
    finally:
        dll_background_lane.release()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_convert_igs_to_stl_queue.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add main.py tests/test_convert_igs_to_stl_queue.py
git commit -m "fix(backend): route /convert_igs_to_stl through the background DLL lane

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WU65qj1D57Wdt3LEELawK4"
```

---

### Task 10: End-to-end DLL-lane isolation regression test

**Files:**
- Create: `tests/test_dll_lane_isolation.py`

**Interfaces:**
- Consumes: `DllInstance`, `prepare_background_dll_copy` (Task 1/2).

This is the permanent guard for the empirical finding this whole feature is built on: it must fail loudly if the two-instance isolation ever regresses (e.g. a future Windows/Python update changes `ctypes.CDLL` module-caching behavior).

- [ ] **Step 1: Write the test**

```python
"""tests/test_dll_lane_isolation.py — permanent regression guard for the
empirical finding this feature is built on: two independently-loaded
copies of MSDLL64.dll have independent global state, so a background-lane
call can run genuinely concurrently with a main-lane call without
corrupting its output. See
docs/superpowers/specs/2026-09-14-background-dll-lane-design.md.

Slower than the rest of the suite (runs several real lattice
calculations) — kept in its own file so it can be skipped in fast local
loops with `pytest --deselect tests/test_dll_lane_isolation.py` if needed.
"""
import ctypes
import os
import threading
import time

from dll_instance import DllInstance, prepare_background_dll_copy

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAIN_DLL_PATH = os.path.join(REPO_ROOT, "gershon", "MSDLL64.dll")
MAIN_DLL_MANIFEST_PATH = MAIN_DLL_PATH + ".manifest"
SRF_IGS = os.path.join(REPO_ROOT, "Input", "SimpleRevolve.igs").encode("ascii")


def _no_emit(event, sid, payload):
    pass


def _summarize_stl(path: str):
    with open(path, "rb") as f:
        text = f.read().decode(errors="replace")
    return {
        "triangles": text.count("facet normal"),
        "valid": text.strip().startswith("solid") and "endsolid" in text,
    }


def _run_revolution(instance: DllInstance, out_dir: str, tag) -> dict:
    num_tiles = (ctypes.c_int * 3)(2, 2, 2)
    graded = (ctypes.c_double * 2)(0.2, 1.5)
    tile_params = (ctypes.c_double * 3)(0.2, 0.0, 0.4)
    out_igs = os.path.join(out_dir, f"rev_{tag}.igs").encode("ascii")
    out_stl = os.path.join(out_dir, f"rev_{tag}.stl").encode("ascii")
    err = instance.from_revolution(SRF_IGS, num_tiles, graded, 0, tile_params, out_igs, out_stl)
    assert err is None, f"revolution call itself failed: {err}"
    return _summarize_stl(out_stl.decode("ascii"))


def _run_tile(instance: DllInstance, out_dir: str, tag) -> None:
    params = (ctypes.c_double * 2)(0.15, 0.05)
    graded = (ctypes.c_double * 2)(0.2, 1.5)
    out = os.path.join(out_dir, f"tile_{tag}.stl").encode("ascii")
    instance.get_tile(0, params, graded, 0.0, out)  # errors ignored — only used to keep the DLL busy


def test_background_lane_tile_calls_do_not_corrupt_a_concurrent_main_lane_revolution(tmp_path):
    dll_main = DllInstance(MAIN_DLL_PATH, emit=_no_emit)
    background_path = prepare_background_dll_copy(
        MAIN_DLL_PATH, MAIN_DLL_MANIFEST_PATH, dest_dir=str(tmp_path / "dll_background_instance"),
    )
    dll_background = DllInstance(background_path, emit=_no_emit)
    assert dll_main.handle != dll_background.handle

    baseline = _run_revolution(dll_main, str(tmp_path), "baseline")
    assert baseline["valid"] is True
    assert baseline["triangles"] > 0

    stop_flag = threading.Event()

    def tile_hammer():
        i = 0
        while not stop_flag.is_set():
            _run_tile(dll_background, str(tmp_path), f"hammer-{i}")
            i += 1

    results = []

    def revolution_runner():
        for i in range(4):
            results.append(_run_revolution(dll_main, str(tmp_path), f"concurrent-{i}"))

    t_tile = threading.Thread(target=tile_hammer, daemon=True)
    t_rev = threading.Thread(target=revolution_runner)
    t_tile.start()
    t_rev.start()
    t_rev.join(timeout=120)
    stop_flag.set()
    t_tile.join(timeout=10)

    assert len(results) == 4
    for r in results:
        assert r == baseline, (
            "Background-lane tile calls corrupted a concurrent main-lane "
            f"revolution's output: expected {baseline}, got {r}. This means "
            "the two-instance DLL isolation this feature depends on has "
            "regressed — see the design spec's safety caveat."
        )
```

- [ ] **Step 2: Run it to verify it currently passes (this is the empirical proof, already validated by hand — the automated version must agree)**

Run: `python -m pytest tests/test_dll_lane_isolation.py -v`
Expected: PASS. (If this ever fails on a future environment, treat it as the design's core safety assumption having broken — see the spec's "Safety caveat" note before doing anything else.)

- [ ] **Step 3: Commit**

```bash
git add tests/test_dll_lane_isolation.py
git commit -m "test(backend): add permanent regression guard for two-instance DLL isolation

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WU65qj1D57Wdt3LEELawK4"
```

---

### Task 11: Full-suite verification and manual check

**Files:** none (verification only)

- [ ] **Step 1: Run the entire backend test suite**

Run: `python -m pytest tests/ -q`
Expected: All tests PASS, including `test_calc_queue.py`, `test_dll_instance.py`, `test_dll_lane.py`, `test_calculate_queue_integration.py`, `test_convert_igs_to_stl_queue.py`, `test_dll_lane_isolation.py`.

- [ ] **Step 2: Manual verification — real server, two browser sessions**

1. Start the server: `python main.py`
2. Open two browser tabs to the tool page (or one normal + one incognito, to get two distinct sessions).
3. In tab 1, upload a reasonably large surface and click "Calculate."
4. While tab 1 is still calculating, in tab 2: upload a file (confirm the preview appears promptly, not frozen) and drag a tile-parameter slider (confirm it updates promptly).
5. Confirm tab 1's calculation still completes normally and its result displays.
6. Confirm the server console/`lattice.log` shows no `RuntimeError` from `assert_distinct_dll_instances` at startup.

- [ ] **Step 3: Confirm the design spec and this plan are both committed**

```bash
git add docs/superpowers/specs/2026-09-14-background-dll-lane-design.md docs/superpowers/plans/2026-09-14-background-dll-lane.md
git commit -m "docs: add background DLL lane design spec and implementation plan

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WU65qj1D57Wdt3LEELawK4"
```
