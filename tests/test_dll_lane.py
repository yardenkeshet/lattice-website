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
