import base64
import time

import main as main_module


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

    time.sleep(0.6)  # both jobs finish well within this window

    c2_events = c2.get_received()
    names_in_order = [e['name'] for e in c2_events]

    waiting = next(e for e in c2_events if e['name'] == 'queue_status' and e['args'][0]['state'] == 'waiting')
    calculating = next(e for e in c2_events if e['name'] == 'queue_status' and e['args'][0]['state'] == 'calculating')
    result = next(e for e in c2_events if e['name'] == 'result')

    assert waiting['args'][0]['position'] == 1
    assert names_in_order.index(waiting['name']) < c2_events.index(calculating) < c2_events.index(result)
    assert len(calls) == 2  # c1's job ran, then c2's


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
