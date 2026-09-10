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
from typing import Callable, Optional

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
            self._not_empty.notify()
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
            self._not_empty.notify()  # wake the worker if it was waiting on this

    # ── worker thread ─────────────────────────────────────────────────

    def _worker_loop(self) -> None:
        while True:
            with self._not_empty:
                while not self._waiting or self._busy:
                    self._not_empty.wait()
                job = self._waiting.pop(0)
                self._busy = True
            self._emit('queue_status', job.sid, {'state': 'calculating', 'silent': job.silent})
            try:
                self._run_job(job)
            except Exception:
                # A single job's failure must never take the worker thread
                # down — that would silently freeze the queue for everyone.
                logger.exception(f"[QUEUE] job failed  sid={job.sid}  silent={job.silent}")
            with self._lock:
                self._busy = False
            self._broadcast_positions()

    def _broadcast_positions(self) -> None:
        with self._lock:
            snapshot = list(self._waiting)
        for i, job in enumerate(snapshot):
            self._emit('queue_status', job.sid, {
                'state': 'waiting',
                'position': i + 1,
                'aheadCount': i,
                'silent': job.silent,
            })
