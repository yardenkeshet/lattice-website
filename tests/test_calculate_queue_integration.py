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

    def _fake(out_folder, igs_path, num_tiles, tile_params, grading_params, tile_type_int):
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
