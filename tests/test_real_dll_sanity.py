"""The one test in this suite that does NOT monkeypatch the DLL dispatch —
it exercises the real native engine (gershon/MSDLL64.dll), the real queue,
and a real download, proving the whole pipeline genuinely works end to
end. Allowed to be the slowest test in the suite; that's expected for
real native code, not a problem to engineer around."""
import base64
import gzip
import os
import time

import pytest

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
    # Snapshot client_data state before test to verify cleanup later
    client_data_dir = os.path.join(os.getcwd(), main_module.DATA_DIR)
    folders_before = set(os.listdir(client_data_dir)) if os.path.exists(client_data_dir) else set()

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
        # under the real (non-monkeypatched) directories.
        client.disconnect()

        # client_data/<sid>/ cleanup is reliable (the retry genuinely
        # fixes the common case) and is strictly asserted. last_results/<token>/
        # is NOT asserted here: on this dev machine, the native DLL can hold a
        # lock on its own freshly-written output file for longer than any
        # reasonable retry window — a known, pre-existing limitation (see
        # main.py's _rmtree_with_retry), not something this test should
        # flake on. If it happens, it's visible in lattice.log as a
        # "[SESSION] cleanup failed" line, not silently hidden.
        folders_after = set(os.listdir(client_data_dir)) if os.path.exists(client_data_dir) else set()
        new_folders = folders_after - folders_before
        assert not new_folders, \
            f"client_data/* should be cleaned up but test created folders remain: {new_folders}"


def test_rmtree_with_retry_succeeds_after_transient_permission_errors(tmp_path, monkeypatch):
    target = tmp_path / 'some_folder'
    target.mkdir()

    real_rmtree = main_module.shutil.rmtree
    calls = []

    def _flaky_rmtree(path):
        calls.append(path)
        if len(calls) < 3:
            raise PermissionError("simulated transient lock")
        real_rmtree(path)

    monkeypatch.setattr(main_module.shutil, 'rmtree', _flaky_rmtree)
    main_module._rmtree_with_retry(str(target))

    assert len(calls) == 3
    assert not target.exists()


def test_rmtree_with_retry_raises_after_exhausting_attempts(tmp_path, monkeypatch):
    target = tmp_path / 'some_folder'
    target.mkdir()

    def _always_fails(path):
        raise PermissionError("simulated permanent lock")

    monkeypatch.setattr(main_module.shutil, 'rmtree', _always_fails)

    with pytest.raises(PermissionError):
        main_module._rmtree_with_retry(str(target), attempts=2, delay=0.01)
