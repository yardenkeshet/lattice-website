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
