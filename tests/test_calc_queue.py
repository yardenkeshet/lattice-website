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
    assert _wait_until(lambda: True, timeout=0.05)  # let it be dequeued

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
    assert _wait_until(lambda: True, timeout=0.05)
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
    assert _wait_until(lambda: True, timeout=0.05)
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
    assert _wait_until(lambda: True, timeout=0.05)

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
