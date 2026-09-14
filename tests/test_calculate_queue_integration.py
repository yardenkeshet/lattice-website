import base64
import os
import time

import main as main_module


def _wait_until(predicate, timeout=5.0, interval=0.01):
    """Poll `predicate` until it's truthy or `timeout` elapses. Mirrors
    tests/test_calc_queue.py's helper of the same name — duplicated here
    rather than imported since this repo has no shared test-utils module
    yet and it's a few lines."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        if predicate():
            return True
        time.sleep(interval)
    return predicate()


def _calc_payload():
    return {
        'filename': 'part.igs',
        'surface_b64': base64.b64encode(b'dummy igs bytes').decode('ascii'),
        'client_ts': time.time() * 1000,
        'args': {
            'tileType': 'cross', 'calcMode': 'revolution',
            'nt1': 2, 'nt2': 2, 'nt3': 2, 'g1': 0.2, 'g2': 1.5,
            'p1': 0.2, 'p2': 0.0, 'p3': 0.4,
        },
    }


def _install_fake_revolution(monkeypatch, delay=0.3):
    """Replaces the real DLL-backed revolution dispatch with a fast fake
    so the test exercises queue behavior, not the native DLL. Patches the
    CALC_MODE_DISPATCH *entry* (not the do_revolution name) because the
    dict already captured the original function reference at import time."""
    calls = []

    def _fake(dll_instance, out_folder, igs_path, num_tiles, tile_params, grading_params, tile_type_int):
        calls.append(time.time())
        time.sleep(delay)
        return "solid fake\nendsolid fake\n", "MSRevolv.stl", "MSRevolv.igs"

    monkeypatch.setitem(main_module.CALC_MODE_DISPATCH, main_module.CALC_MODE_REVOLUTION, _fake)
    return calls


def test_second_client_waits_then_calculates(monkeypatch):
    calls = _install_fake_revolution(monkeypatch)

    c1 = main_module.socketio.test_client(main_module.app)
    c2 = main_module.socketio.test_client(main_module.app)
    c1.get_received()
    c2.get_received()

    c1.emit('calculate', _calc_payload())
    time.sleep(0.05)  # let the worker dequeue and start c1's (0.3s) fake job
    c2.emit('calculate', _calc_payload())

    # Poll for c2's 'result' event instead of sleeping a fixed duration —
    # two 0.3s fake jobs plus a result emit and compression leaves thin
    # margin under load with a fixed sleep (Finding 7).
    c2_events = []

    def c2_got_result():
        c2_events.extend(c2.get_received())
        return any(e['name'] == 'result' for e in c2_events)

    assert _wait_until(c2_got_result, timeout=5.0)
    names_in_order = [e['name'] for e in c2_events]

    waiting = next(e for e in c2_events if e['name'] == 'queue_status' and e['args'][0]['state'] == 'waiting')
    calculating = next(e for e in c2_events if e['name'] == 'queue_status' and e['args'][0]['state'] == 'calculating')
    result = next(e for e in c2_events if e['name'] == 'result')

    assert waiting['args'][0]['position'] == 1
    assert names_in_order.index(waiting['name']) < c2_events.index(calculating) < c2_events.index(result)
    assert len(calls) == 2  # c1's job ran, then c2's


def test_disconnect_during_compression_discards_result(monkeypatch):
    """Finding 4: a client who disconnects *during* compression (not just
    before the DLL call) must not leak a DOWNLOAD_CACHE entry or a
    last_results/<token>/ folder — nothing will ever redeem that token."""
    _install_fake_revolution(monkeypatch, delay=0.02)

    before_sids = set(main_module.connected_clients.keys())
    c1 = main_module.socketio.test_client(main_module.app)
    c1.get_received()
    new_sid = next(iter(set(main_module.connected_clients.keys()) - before_sids))

    download_cache_before = set(main_module.DOWNLOAD_CACHE.keys())
    results_dir = os.path.join(os.getcwd(), main_module.LAST_RESULTS_DIR)
    dirs_before = set(os.listdir(results_dir)) if os.path.isdir(results_dir) else set()

    orig_compress = main_module.compress_text_to_b64_gz

    def fake_compress(text):
        # Simulate the client disconnecting mid-compression: on_disconnect
        # already ran (it only knows about the *previous* token, per the
        # spec note) and removed this sid from connected_clients.
        main_module.connected_clients.pop(new_sid, None)
        return orig_compress(text)

    monkeypatch.setattr(main_module, 'compress_text_to_b64_gz', fake_compress)

    c1.emit('calculate', _calc_payload())

    # Give the worker time to run the (fast, fake) job, hit compression
    # (which triggers our simulated mid-compression disconnect), and either
    # emit a result or correctly discard it. Poll rather than sleep fixed.
    assert _wait_until(lambda: new_sid not in main_module.connected_clients, timeout=5.0)
    time.sleep(0.2)  # let _run_calculate_job finish its post-compression checks

    received = c1.get_received()
    assert not any(e['name'] == 'result' for e in received)
    assert set(main_module.DOWNLOAD_CACHE.keys()) == download_cache_before
    dirs_after = set(os.listdir(results_dir)) if os.path.isdir(results_dir) else set()
    assert dirs_after == dirs_before  # no leaked last_results/<token>/ folder


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


def test_eleventh_waiting_client_is_rejected(monkeypatch):
    _install_fake_revolution(monkeypatch)

    clients = [main_module.socketio.test_client(main_module.app) for _ in range(12)]
    for c in clients:
        c.get_received()

    clients[0].emit('calculate', _calc_payload())
    time.sleep(0.1)  # let the worker dequeue and start client 0's job

    for c in clients[1:]:
        c.emit('calculate', _calc_payload())

    accepted_names = [e['name'] for e in clients[10].get_received()]
    rejected_names = [e['name'] for e in clients[11].get_received()]

    assert 'queue_rejected' not in accepted_names
    assert 'queue_rejected' in rejected_names

    time.sleep(12 * 0.3 + 1)  # let the rest drain before the next test runs


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

    # Wait for the background calculation to complete and release the lane
    assert _wait_until(lambda: main_module.dll_background_lane.try_acquire(), timeout=2.0)
    main_module.dll_background_lane.release()
    # Give the finish phase (including logging) time to complete before test ends
    time.sleep(0.2)


def test_silent_calculate_is_dropped_when_the_background_lane_is_busy(monkeypatch):
    _install_fake_revolution(monkeypatch, delay=0.3)

    c1 = main_module.socketio.test_client(main_module.app)
    # Drain the receive buffer from client connection
    time.sleep(0.1)
    while c1.get_received():
        pass

    assert main_module.dll_background_lane.try_acquire() is True  # simulate in-flight background work
    try:
        payload = _calc_payload()
        payload['silent'] = True
        c1.emit('calculate', payload)
        time.sleep(0.1)
        received = c1.get_received()
        # Dropped silently — no error, no result, no queue event (logs are OK).
        assert not any(m['name'] == 'error' for m in received)
        assert not any(m['name'] == 'queue_status' for m in received)
        assert not any(m['name'] == 'queue_rejected' for m in received)
        assert not any(m['name'] == 'result' for m in received)
    finally:
        main_module.dll_background_lane.release()


def test_silent_calculate_with_invalid_field_does_not_leak_background_lane(monkeypatch):
    """Regression test: a silent calculate with invalid data (e.g. bad tileType)
    must fail validation and return an error, WITHOUT acquiring and leaking the
    background lane. The lane must still be free afterward."""
    _install_fake_revolution(monkeypatch, delay=0.1)

    c1 = main_module.socketio.test_client(main_module.app)
    # Drain the receive buffer from client connection
    time.sleep(0.1)
    while c1.get_received():
        pass

    # Send a silent calculate with an invalid tileType
    payload = _calc_payload()
    payload['silent'] = True
    payload['args']['tileType'] = 'invalid_tile_type'  # This will fail validation

    c1.emit('calculate', payload)
    time.sleep(0.1)

    received = c1.get_received()
    # Must receive an error event (validation failure)
    assert any(m['name'] == 'error' for m in received), "Expected error event for invalid tileType"

    # The critical check: the background lane should NOT be held
    # If the lane was acquired but not released due to validation failure, this will fail
    assert main_module.dll_background_lane.try_acquire() is True, \
        "Background lane is held/leaked! Validation failure must not acquire the lane."
    main_module.dll_background_lane.release()
