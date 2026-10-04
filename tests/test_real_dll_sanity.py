"""The one test in this suite that does NOT monkeypatch the DLL dispatch —
it exercises the real native engine (gershon/MSDLL64.dll), the real queue,
and a real download, proving the whole pipeline genuinely works end to
end. Allowed to be the slowest test in the suite; that's expected for
real native code, not a problem to engineer around."""
import base64
import gzip
import time

import main as main_module

IGS_PATH = 'igs/ExtrudeSrf.igs'


def _wait_until(predicate, timeout=30.0, interval=0.05):
    """Mirrors the helper of the same name already duplicated across
    tests/test_calc_queue.py and tests/test_calculate_queue_integration.py."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        if predicate():
            return True
        time.sleep(interval)
    return predicate()


def test_real_calculation_through_the_actual_dll_and_download():
    with open(IGS_PATH, 'rb') as f:
        igs_bytes = f.read()

    payload = {
        'filename': 'ExtrudeSrf.igs',
        'surface_b64': base64.b64encode(igs_bytes).decode('ascii'),
        'client_ts': time.time() * 1000,
        'args': {
            'tileType': 'diagonal', 'calcMode': 'extrusion',
            'nt1': 1, 'nt2': 1, 'nt3': 10,
            'g1': 0.2, 'g2': 1.5, 'p1': 0.25, 'p2': 0.25, 'p3': 0.3,
            'extrudeLength': 10.0,
        },
    }

    client = main_module.socketio.test_client(main_module.app)
    try:
        client.get_received()
        client.emit('calculate', payload)

        events = []

        def got_result():
            events.extend(client.get_received())
            return any(e['name'] == 'result' for e in events)

        assert _wait_until(got_result, timeout=30.0), "real DLL calculation did not complete in time"

        result = next(e for e in events if e['name'] == 'result')['args'][0]
        assert result['kind'] == 'model_stl'
        assert result['stl_gz_b64']
        decoded = gzip.decompress(base64.b64decode(result['stl_gz_b64'])).decode('ascii')
        assert 'solid' in decoded and 'endsolid' in decoded

        token = result['download_token']
        assert token

        download_client = main_module.app.test_client()
        resp = download_client.post('/download-results', data={'token': token, 'file_type': 'stl'})
        assert resp.status_code == 200
        downloaded = resp.get_data(as_text=True)
        assert 'solid' in downloaded and 'endsolid' in downloaded
    finally:
        # Disconnecting triggers the real on_disconnect cleanup path
        # (removes client_data/<sid>/ and last_results/<token>/) — the
        # same as a real browser tab closing. This test writes real files
        # under the real (non-monkeypatched) directories and must not
        # leave them behind, pass or fail.
        client.disconnect()
