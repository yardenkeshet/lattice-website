"""calc_queue.py — single-slot calculation queue with a bounded waiting room.

Serializes access to the (likely non-reentrant) lattice DLL: at most one
full `calculate` job runs at a time, plus non-blocking best-effort access
for fast operations (tile preview) that must never wait in line.

No Flask / SocketIO dependency — the caller supplies `run_job` (does the
actual work for one job) and `emit` (sends one SocketIO event to one sid).
This keeps the class unit-testable with plain Python threads and no app
context. See docs/superpowers/specs/2026-09-10-calculation-queue-design.md.
"""

import logging
import threading
import time
from dataclasses import dataclass, field
from typing import Callable

logger = logging.getLogger('lattice')

MAX_WAITING = 10


@dataclass
class Job:
    sid: str
    payload: dict
    silent: bool = False
    enqueued_at: float = field(default_factory=time.time)


class CalcQueueManager:
    def __init__(self, run_job: Callable[[Job], None], emit: Callable[[str, str, dict], None]):
        self._run_job = run_job
        self._emit = emit
        self._lock = threading.Lock()
        self._not_empty = threading.Condition(self._lock)
        # Serializes emit *sequences* against each other (worker's 'calculating'
        # emit vs. _broadcast_positions' 'waiting' emits) so a client's events
        # always arrive waiting-then-calculating, never reversed. Deliberately
        # separate from self._lock — must never be held during DLL work itself.
        self._emit_lock = threading.Lock()
        self._waiting: list[Job] = []
        self._busy = False  # True while a full job OR a tile-preview call holds the DLL
        self._worker = threading.Thread(target=self._worker_loop, daemon=True, name='calc-queue-worker')

    def start(self) -> None:
        self._worker.start()

    # ── calculate: enqueue / cancel ──────────────────────────────────────

    def enqueue(self, sid: str, payload: dict, silent: bool = False) -> bool:
        """Add a job to the waiting room. Returns False (enqueues nothing)
        if the waiting room is already at MAX_WAITING."""
        with self._lock:
            if len(self._waiting) >= MAX_WAITING:
                return False
            self._waiting.append(Job(sid=sid, payload=payload, silent=silent))
            # True exactly when this job is the only one waiting and the DLL
            # slot is free — meaning the worker will pick it up essentially
            # immediately and emit 'calculating' itself. In that case there's
            # no meaningful 'waiting' state to report, and broadcasting one
            # anyway races the worker's own 'calculating' emit (see Finding 2).
            immediately_dispatchable = not self._busy and len(self._waiting) == 1
            self._not_empty.notify()
        if not immediately_dispatchable:
            self._broadcast_positions()
        return True

    def remove_waiting(self, sid: str) -> None:
        """Remove sid's job(s) from the waiting room, e.g. on disconnect."""
        with self._lock:
            before = len(self._waiting)
            self._waiting = [j for j in self._waiting if j.sid != sid]
            changed = len(self._waiting) != before
        if changed:
            self._broadcast_positions()

    # ── calculate_tile: non-blocking best-effort access ─────────────────

    def try_acquire_dll(self) -> bool:
        """Non-blocking: True (and holds the slot) if free, False if busy."""
        with self._lock:
            if self._busy:
                return False
            self._busy = True
            return True

    def release_dll(self) -> None:
        with self._lock:
            self._busy = False
            # notify_all, not notify: self._not_empty now has two distinct
            # kinds of waiters with different predicates — the worker loop
            # (waiting for `self._waiting` non-empty AND not busy) and any
            # acquire_dll_blocking callers (waiting only for not busy). A
            # plain notify() can wake the wrong one; that thread finds its
            # own predicate still false, goes right back to wait(), and the
            # *other* waiter never gets woken — silently eating the whole
            # timeout instead of resuming promptly. notify_all lets every
            # waiter re-check its own predicate.
            self._not_empty.notify_all()

    def acquire_dll_blocking(self, timeout: float) -> bool:
        """Blocking variant of try_acquire_dll: waits up to `timeout` seconds
        for the DLL slot to free up, then holds it. Returns False (without
        acquiring) if the timeout elapses first. For callers whose failure
        is user-visible (e.g. an HTTP request) where try_acquire_dll's
        silent skip would be the wrong behavior — here we want to wait a
        bounded amount rather than fail instantly."""
        with self._not_empty:
            deadline = time.time() + timeout
            while self._busy:
                remaining = deadline - time.time()
                if remaining <= 0:
                    return False
                self._not_empty.wait(timeout=remaining)
            self._busy = True
            return True

    # ── worker thread ─────────────────────────────────────────────────

    def _worker_loop(self) -> None:
        while True:
            try:
                with self._not_empty:
                    while not self._waiting or self._busy:
                        self._not_empty.wait()
                    job = self._waiting.pop(0)
                    self._busy = True
                try:
                    try:
                        with self._emit_lock:
                            self._emit('queue_status', job.sid, {'state': 'calculating', 'silent': job.silent})
                    except Exception:
                        # A broken emit must never prevent the job itself from
                        # running, nor take the worker thread down — that
                        # would silently freeze the queue for everyone.
                        logger.exception(f"[QUEUE] 'calculating' emit failed  sid={job.sid}")
                    try:
                        self._run_job(job)
                    except Exception:
                        # A single job's failure must never take the worker
                        # thread down — that would silently freeze the queue
                        # for everyone.
                        logger.exception(f"[QUEUE] job failed  sid={job.sid}  silent={job.silent}")
                finally:
                    with self._lock:
                        self._busy = False
                        # See release_dll for why this must be notify_all:
                        # acquire_dll_blocking callers (e.g. a queued
                        # /convert_igs_to_stl request waiting out a full
                        # calculate job) only care about `self._busy`, a
                        # different predicate than the worker's own.
                        self._not_empty.notify_all()
                try:
                    self._broadcast_positions()
                except Exception:
                    logger.exception("[QUEUE] position broadcast failed")
            except Exception:
                logger.exception("[QUEUE] worker loop iteration failed unexpectedly")

    def _broadcast_positions(self) -> None:
        with self._lock:
            snapshot = list(self._waiting)
        with self._emit_lock:
            for i, job in enumerate(snapshot):
                self._emit('queue_status', job.sid, {
                    'state': 'waiting',
                    'position': i + 1,
                    'aheadCount': i,
                    'silent': job.silent,
                })
