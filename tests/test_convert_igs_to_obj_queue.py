"""Finding 1 (whole-branch review): /convert_igs_to_obj must go through
CalcQueueManager's DLL slot like calculate/calculate_tile do, and must
release that slot on every exit path."""
import io
import threading
import time

import main as main_module


def _post(client, **overrides):
    data = {'file': (io.BytesIO(b'dummy igs bytes'), 'part.igs')}
    data.update(overrides.pop('extra_form', {}))
    return client.post('/convert_igs_to_obj', data=data, content_type='multipart/form-data')


def _fake_dll_success(obj_bytes=b'v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n'):
    def _fake(igs_file, obj_file, tolerance):
        obj_path = obj_file.decode('ascii')
        with open(obj_path, 'wb') as f:
            f.write(obj_bytes)
        return None
    return _fake


def test_success_releases_dll_slot(monkeypatch):
    monkeypatch.setattr(main_module.dll_background, 'iges2obj', _fake_dll_success())
    client = main_module.app.test_client()

    resp = _post(client)

    assert resp.status_code == 200
    assert 'obj_b64' in resp.get_json()
    # Slot must be free again — provably released, not just "probably".
    assert main_module.dll_background_lane.try_acquire() is True
    main_module.dll_background_lane.release()


def test_dll_error_releases_dll_slot(monkeypatch):
    def _fake(igs_file, obj_file, tolerance):
        return "DLL said no"
    monkeypatch.setattr(main_module.dll_background, 'iges2obj', _fake)
    client = main_module.app.test_client()

    resp = _post(client)

    assert resp.status_code == 500
    assert main_module.dll_background_lane.try_acquire() is True
    main_module.dll_background_lane.release()


def test_missing_output_releases_dll_slot(monkeypatch):
    def _fake(igs_file, obj_file, tolerance):
        return None  # "succeeds" but never writes obj_file
    monkeypatch.setattr(main_module.dll_background, 'iges2obj', _fake)
    client = main_module.app.test_client()

    resp = _post(client)

    assert resp.status_code == 500
    assert main_module.dll_background_lane.try_acquire() is True
    main_module.dll_background_lane.release()


def test_internal_exception_releases_dll_slot(monkeypatch):
    def _fake(igs_file, obj_file, tolerance):
        raise RuntimeError('boom')
    monkeypatch.setattr(main_module.dll_background, 'iges2obj', _fake)
    client = main_module.app.test_client()

    resp = _post(client)

    assert resp.status_code == 500
    assert main_module.dll_background_lane.try_acquire() is True
    main_module.dll_background_lane.release()


def test_returns_503_when_slot_cannot_be_acquired_in_time(monkeypatch):
    monkeypatch.setattr(main_module.dll_background, 'iges2obj', _fake_dll_success())
    monkeypatch.setattr(main_module.dll_background_lane, 'acquire_blocking', lambda timeout: False)
    client = main_module.app.test_client()

    resp = _post(client)

    assert resp.status_code == 503
    assert 'busy' in resp.get_json()['error'].lower()


def test_request_blocks_then_succeeds_once_slot_frees(monkeypatch):
    """Real end-to-end proof of the blocking-with-timeout wiring: hold the
    DLL slot from this thread, fire the request on a background thread, and
    confirm it stays pending until another thread releases the slot — then
    completes well before the 30s route timeout."""
    monkeypatch.setattr(main_module.dll_background, 'iges2obj', _fake_dll_success())
    client = main_module.app.test_client()

    assert main_module.dll_background_lane.try_acquire() is True  # simulate an in-flight holder

    def release_soon():
        time.sleep(0.3)
        main_module.dll_background_lane.release()

    threading.Thread(target=release_soon).start()

    start = time.time()
    resp = _post(client)
    elapsed = time.time() - start

    assert resp.status_code == 200
    assert elapsed >= 0.3  # actually waited for the release, didn't skip
    assert elapsed < 10.0  # nowhere near the 30s route timeout
    assert main_module.dll_background_lane.try_acquire() is True
    main_module.dll_background_lane.release()


def test_entry_is_logged_at_debug_level(monkeypatch, caplog):
    import logging as _logging
    monkeypatch.setattr(main_module.dll_background, 'iges2obj', _fake_dll_success())
    client = main_module.app.test_client()

    with caplog.at_level(_logging.DEBUG, logger='lattice'):
        _post(client)

    assert any('[IGS2OBJ] request received' in r.message for r in caplog.records)
