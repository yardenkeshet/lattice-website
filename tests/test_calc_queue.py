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
