import threading
import time

from calc_queue import CalcQueueManager, MAX_WAITING


def make_manager(run_job=None, emit=None):
    events = []
    calls = []

    def _default_run_job(job):
        calls.append(job)

    def _default_emit(event, sid, payload):
        events.append((event, sid, payload))

    manager = CalcQueueManager(
        run_job=run_job or _default_run_job,
        emit=emit or _default_emit,
    )
    return manager, calls, events


def _wait_until(predicate, timeout=2.0, interval=0.01):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if predicate():
            return True
        time.sleep(interval)
    return predicate()


def test_first_enqueue_is_accepted_and_processed():
    manager, calls, _ = make_manager()
    manager.start()

    accepted = manager.enqueue('sid-1', {'x': 1})

    assert accepted is True
    assert _wait_until(lambda: len(calls) == 1)
    assert calls[0].sid == 'sid-1'
    assert calls[0].payload == {'x': 1}
    assert calls[0].silent is False


def test_fifo_order():
    order = []

    def run_job(job):
        order.append(job.sid)
        time.sleep(0.05)

    manager, _, _ = make_manager(run_job=run_job)
    manager.start()

    manager.enqueue('first', {})
    assert _wait_until(lambda: order == ['first'])  # let 'first' actually start
    manager.enqueue('second', {})
    manager.enqueue('third', {})

    assert _wait_until(lambda: order == ['first', 'second', 'third'])


def test_rejects_once_waiting_room_is_full():
    release = threading.Event()

    def blocking_run_job(job):
        release.wait(timeout=2)

    manager, _, _ = make_manager(run_job=blocking_run_job)
    manager.start()

    assert manager.enqueue('running', {}) is True
    time.sleep(0.05)  # let it be dequeued

    for i in range(MAX_WAITING):
        assert manager.enqueue(f'waiter-{i}', {}) is True

    assert manager.enqueue('one-too-many', {}) is False

    release.set()


def test_positions_recompute_as_the_front_is_processed():
    release_first = threading.Event()

    def run_job(job):
        if job.sid == 'first':
            release_first.wait(timeout=2)

    manager, _, events = make_manager(run_job=run_job)
    manager.start()

    def waiting_positions(sid):
        return [p['position'] for (ev, s, p) in events
                if ev == 'queue_status' and s == sid and p['state'] == 'waiting']

    manager.enqueue('first', {})
    time.sleep(0.05)  # let it be dequeued
    manager.enqueue('second', {})
    manager.enqueue('third', {})

    assert _wait_until(lambda: waiting_positions('third') and waiting_positions('third')[-1] == 2)

    release_first.set()

    assert _wait_until(lambda: waiting_positions('third') and waiting_positions('third')[-1] == 1)


def test_remove_waiting_updates_positions_for_the_rest():
    release_first = threading.Event()

    def run_job(job):
        if job.sid == 'first':
            release_first.wait(timeout=2)

    manager, _, events = make_manager(run_job=run_job)
    manager.start()

    def waiting_positions(sid):
        return [p['position'] for (ev, s, p) in events
                if ev == 'queue_status' and s == sid and p['state'] == 'waiting']

    manager.enqueue('first', {})
    time.sleep(0.05)  # let it be dequeued
    manager.enqueue('second', {})
    manager.enqueue('third', {})

    manager.remove_waiting('second')

    assert _wait_until(lambda: waiting_positions('third') and waiting_positions('third')[-1] == 1)

    release_first.set()


def test_never_runs_two_jobs_concurrently():
    lock = threading.Lock()
    current = {'count': 0}
    max_seen = {'value': 0}

    def run_job(job):
        with lock:
            current['count'] += 1
            max_seen['value'] = max(max_seen['value'], current['count'])
        time.sleep(0.05)
        with lock:
            current['count'] -= 1

    manager, _, _ = make_manager(run_job=run_job)
    manager.start()

    for i in range(6):
        manager.enqueue(f'sid-{i}', {})

    assert _wait_until(lambda: current['count'] == 0 and max_seen['value'] > 0, timeout=3)
    assert max_seen['value'] == 1


def test_worker_survives_a_job_that_raises():
    processed = []

    def run_job(job):
        if job.sid == 'boom':
            raise RuntimeError('DLL exploded')
        processed.append(job.sid)

    manager, _, _ = make_manager(run_job=run_job)
    manager.start()

    manager.enqueue('boom', {})
    manager.enqueue('after-boom', {})

    assert _wait_until(lambda: processed == ['after-boom'])


def test_tile_slot_is_exclusive():
    manager, _, _ = make_manager()
    manager.start()

    assert manager.try_acquire_dll() is True
    assert manager.try_acquire_dll() is False
    manager.release_dll()
    assert manager.try_acquire_dll() is True
    manager.release_dll()


def test_tile_slot_blocked_while_a_full_job_is_running():
    release = threading.Event()

    def run_job(job):
        release.wait(timeout=2)

    manager, _, _ = make_manager(run_job=run_job)
    manager.start()

    manager.enqueue('full-calc', {})
    time.sleep(0.05)  # let it be dequeued

    assert manager.try_acquire_dll() is False

    release.set()
    assert _wait_until(lambda: manager.try_acquire_dll())
    manager.release_dll()


def test_a_queued_job_waits_for_a_held_tile_slot_to_release():
    manager, calls, _ = make_manager()
    manager.start()

    assert manager.try_acquire_dll() is True  # simulate an in-flight tile call

    manager.enqueue('queued-during-tile', {})
    time.sleep(0.1)
    assert calls == []  # must not start while the tile slot is held

    manager.release_dll()
    assert _wait_until(lambda: len(calls) == 1)


# ── Finding 1: acquire_dll_blocking ─────────────────────────────────────

def test_acquire_dll_blocking_acquires_immediately_when_free():
    manager, _, _ = make_manager()
    manager.start()

    start = time.time()
    assert manager.acquire_dll_blocking(timeout=2.0) is True
    assert time.time() - start < 0.5
    manager.release_dll()


def test_acquire_dll_blocking_waits_for_release_then_acquires():
    manager, _, _ = make_manager()
    manager.start()

    assert manager.try_acquire_dll() is True  # simulate an in-flight holder

    acquired = threading.Event()
    result = {}

    def waiter():
        result['ok'] = manager.acquire_dll_blocking(timeout=2.0)
        acquired.set()

    t = threading.Thread(target=waiter)
    t.start()

    time.sleep(0.1)
    assert not acquired.is_set()  # still blocked — slot is held

    manager.release_dll()

    assert acquired.wait(timeout=2.0)
    assert result['ok'] is True
    manager.release_dll()
    t.join()


def test_acquire_dll_blocking_times_out_without_acquiring():
    manager, _, _ = make_manager()
    manager.start()

    assert manager.try_acquire_dll() is True  # held for the whole test

    start = time.time()
    ok = manager.acquire_dll_blocking(timeout=0.1)
    elapsed = time.time() - start

    assert ok is False
    assert elapsed >= 0.1
    assert elapsed < 1.0  # didn't block far past the timeout

    # Slot must still be held by the original acquirer — a timed-out
    # acquire_dll_blocking must not have grabbed it.
    assert manager.try_acquire_dll() is False
    manager.release_dll()


def test_acquire_dll_blocking_wakes_promptly_even_though_worker_shares_the_condition():
    """Regression for a race found while testing Finding 1: the manager's
    own worker thread is also permanently parked on self._not_empty (idle,
    waiting for a job). A plain notify() in release_dll() can wake that
    worker instead of an acquire_dll_blocking waiter — the worker finds its
    own predicate still false and immediately goes back to wait(), silently
    consuming the notification. The waiter then never gets woken and has to
    sit out its entire timeout before its own wait()-timeout expires and it
    re-checks self._busy. Must be woken well within a fraction of a long
    timeout, not only once the timeout itself elapses."""
    for _ in range(20):
        manager, _, _ = make_manager()
        manager.start()  # worker parks on self._not_empty immediately (no jobs)

        assert manager.try_acquire_dll() is True  # simulate an in-flight holder

        result = {}
        done = threading.Event()

        def waiter():
            start = time.time()
            result['ok'] = manager.acquire_dll_blocking(timeout=5.0)
            result['elapsed'] = time.time() - start
            done.set()

        t = threading.Thread(target=waiter)
        t.start()
        time.sleep(0.05)  # let the waiter actually enter its wait()

        manager.release_dll()

        assert done.wait(timeout=2.0)  # must wake up fast, nowhere near the 5s timeout
        assert result['ok'] is True
        assert result['elapsed'] < 1.0
        t.join()


# ── Finding 2: queue_status emit ordering ───────────────────────────────

def test_idle_queue_dispatch_emits_no_preceding_waiting():
    """A job enqueued onto an otherwise-idle queue must go straight to
    'calculating' with no 'waiting' event at all (spec: empty-queue case)."""
    for trial in range(100):
        events = []

        def run_job(job):
            pass

        def emit(event, sid, payload):
            events.append((event, sid, payload))

        manager = CalcQueueManager(run_job=run_job, emit=emit)
        manager.start()

        sid = f'solo-{trial}'
        manager.enqueue(sid, {})

        assert _wait_until(
            lambda: any(e == 'queue_status' and p['state'] == 'calculating' for (e, s, p) in events if s == sid)
        )
        sid_events = [(e, p['state']) for (e, s, p) in events if e == 'queue_status' and s == sid]
        assert sid_events == [('queue_status', 'calculating')]


def test_no_client_ever_sees_calculating_before_waiting_concurrent():
    """Regression for the reviewer's measured race: concurrent enqueues
    must never deliver a sid's 'calculating' queue_status before its own
    'waiting' one. Runs many trials with a burst of simultaneous enqueue()
    calls (mirroring how the reviewer demonstrated the race originally)."""
    TRIALS = 100
    N_CONCURRENT = 3
    bad_order_count = 0

    for trial in range(TRIALS):
        events = []
        ev_lock = threading.Lock()

        def run_job(job):
            time.sleep(0.005)

        def emit(event, sid, payload):
            with ev_lock:
                events.append((event, sid, payload['state']))

        manager = CalcQueueManager(run_job=run_job, emit=emit)
        manager.start()

        sids = [f't{trial}-{i}' for i in range(N_CONCURRENT)]
        barrier = threading.Barrier(N_CONCURRENT)

        def make_enqueue(s):
            def _f():
                barrier.wait()
                manager.enqueue(s, {})
            return _f

        threads = [threading.Thread(target=make_enqueue(s)) for s in sids]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        def all_calculating():
            calculating_sids = {s for (e, s, st) in events if e == 'queue_status' and st == 'calculating'}
            return all(s in calculating_sids for s in sids)

        assert _wait_until(all_calculating, timeout=2.0)

        for sid in sids:
            sid_states = [st for (e, s, st) in events if s == sid]
            waiting_idx = sid_states.index('waiting') if 'waiting' in sid_states else None
            calc_idx = sid_states.index('calculating') if 'calculating' in sid_states else None
            if waiting_idx is not None and calc_idx is not None and waiting_idx > calc_idx:
                bad_order_count += 1

    assert bad_order_count == 0, f"{bad_order_count} sid(s) saw calculating before waiting"


# ── Finding 3: worker loop is exception-safe at emit boundaries ────────

def test_worker_survives_calculating_emit_that_raises():
    processed = []

    def run_job(job):
        processed.append(job.sid)

    def emit(event, sid, payload):
        if event == 'queue_status' and payload['state'] == 'calculating' and sid == 'bad-emit':
            raise RuntimeError('emit exploded')

    manager, _, _ = make_manager(run_job=run_job, emit=emit)
    manager.start()

    manager.enqueue('bad-emit', {})
    manager.enqueue('after-bad-emit', {})

    assert _wait_until(lambda: processed == ['bad-emit', 'after-bad-emit'])


def test_worker_survives_broadcast_positions_emit_that_raises():
    """Every 'waiting' emit (including the worker's own post-job
    _broadcast_positions() call, made from _worker_loop right after a job
    finishes to update remaining waiters' positions) raises. The caller's
    own enqueue() calls may propagate that (enqueue's direct broadcast runs
    on the caller's thread, outside the worker-loop resilience contract —
    a Flask/SocketIO handler thread, which is a different criticality than
    the sole worker thread), so those are swallowed here the way a request
    handler would. What must hold is the worker thread itself: it must keep
    draining the queue and finishing every job despite every broadcast
    attempt raising."""
    processed = []
    release_first = threading.Event()

    def run_job(job):
        if job.sid == 'first':
            release_first.wait(timeout=2)
        processed.append(job.sid)

    def emit(event, sid, payload):
        if event == 'queue_status' and payload.get('state') == 'waiting':
            raise RuntimeError('broadcast emit exploded')

    manager, _, _ = make_manager(run_job=run_job, emit=emit)
    manager.start()

    manager.enqueue('first', {})  # immediately dispatched — no broadcast, no raise
    time.sleep(0.05)  # let it be dequeued so 'second'/'third' actually wait

    for sid in ('second', 'third'):
        try:
            manager.enqueue(sid, {})
        except RuntimeError:
            pass  # enqueue's own direct broadcast call raised — expected here

    release_first.set()

    # Despite every 'waiting' broadcast (both from enqueue() and from the
    # worker's own post-job _broadcast_positions() call) raising, the worker
    # thread must still drain the whole queue in order.
    assert _wait_until(lambda: processed == ['first', 'second', 'third'])


def test_worker_survives_a_job_that_raises_still_passes():
    # Same scenario as the pre-existing test_worker_survives_a_job_that_raises,
    # re-asserted here to document it must keep passing unmodified after the
    # Finding 3 restructure.
    processed = []

    def run_job(job):
        if job.sid == 'boom':
            raise RuntimeError('DLL exploded')
        processed.append(job.sid)

    manager, _, _ = make_manager(run_job=run_job)
    manager.start()

    manager.enqueue('boom', {})
    manager.enqueue('after-boom', {})

    assert _wait_until(lambda: processed == ['after-boom'])
