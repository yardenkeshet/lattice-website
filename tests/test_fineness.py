"""Tessellation fineness: every DLL call must set the requester's own
fineness on that DLL copy immediately before the work call, so one user's
value can never leak into another user's output (fineness is global state
inside each loaded DLL copy)."""
import base64
import io
import os
import time

import pytest

import main as main_module
from dll_instance import DllInstance, DEFAULT_FINENESS

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAIN_DLL_PATH = os.path.join(REPO_ROOT, "gershon", "MSDLL64.dll")
SAMPLE_IGS = os.path.join(REPO_ROOT, "samples", "igs", "ExtrudeSrf.igs")

# Same-path instances share the real DLL's callback registration with
# dll_main — keep them alive for the session (see test_dll_instance.py).
_KEEP_ALIVE: list[DllInstance] = []

OBJ = "v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n"


def _wait_until(predicate, timeout=5.0, interval=0.02):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if predicate():
            return True
        time.sleep(interval)
    return predicate()


# ── parse_fineness ───────────────────────────────────────────────────────────

@pytest.mark.parametrize("raw, expected", [
    (None, DEFAULT_FINENESS), ("", DEFAULT_FINENESS),
    (2, 2), (20, 20), (200, 200), (20.0, 20), ("35", 35),
])
def test_parse_fineness_accepts(raw, expected):
    assert main_module.parse_fineness(raw) == expected


@pytest.mark.parametrize("raw", [0.35, 0, 1, 201, -5, "abc", True, [20]])
def test_parse_fineness_rejects(raw):
    with pytest.raises((ValueError, TypeError)):
        main_module.parse_fineness(raw)


# ── DllInstance sets fineness right before each work call ───────────────────

class _RecordingDll:
    """Stands in for the ctypes module: records every call in order."""
    def __init__(self):
        self.calls = []

        def make(name):
            def fn(*args):
                if name == "MSDLLSetPolyTolerance":
                    self.calls.append((name, args[0].value))
                else:
                    self.calls.append((name,))
                return None
            return fn

        for name in ("MSDLLSetPolyTolerance", "MSDLLGetTile", "MSDLLMSFromRevolution",
                     "MSDLLMSFromExtrusion", "MSDLLMSFromRuling", "MSDLLIGES2OBJ"):
            setattr(self, name, make(name))


@pytest.fixture
def recording_instance():
    instance = DllInstance(MAIN_DLL_PATH, emit=lambda *a: None)
    _KEEP_ALIVE.append(instance)
    real = instance._dll
    instance._dll = _RecordingDll()
    yield instance
    instance._dll = real


@pytest.mark.parametrize("method, args, dll_fn", [
    ("get_tile", (0, None, None, 37, b"o"), "MSDLLGetTile"),
    ("from_revolution", (b"i", None, None, 0, None, b"a", b"b", 37), "MSDLLMSFromRevolution"),
    ("from_extrusion", (b"i", 1.0, None, None, 0, None, b"a", b"b", 37), "MSDLLMSFromExtrusion"),
    ("from_ruling", (b"i", b"j", None, None, 0, None, b"a", b"b", 37), "MSDLLMSFromRuling"),
    ("iges2obj", (b"i", b"o", 37), "MSDLLIGES2OBJ"),
])
def test_every_work_method_sets_fineness_first(recording_instance, method, args, dll_fn):
    assert getattr(recording_instance, method)(*args) is None
    assert recording_instance._dll.calls == [("MSDLLSetPolyTolerance", 37), (dll_fn,)]


def test_dll_rejects_out_of_range_fineness_and_skips_the_work_call():
    instance = DllInstance(MAIN_DLL_PATH, emit=lambda *a: None)
    _KEEP_ALIVE.append(instance)
    err = instance.iges2obj(b"nope.igs", b"nope.obj", 1)
    assert err and "Invalid tolerance" in err


# ── Handlers pass each request's own fineness ───────────────────────────────

def _calc_payload(tolerance=None, silent=False):
    p = {
        'filename': 'part.igs',
        'surface_b64': base64.b64encode(b'dummy surface').decode('ascii'),
        'client_ts': 0,
        'args': {'tileType': 'cross', 'calcMode': 'revolution',
                 'nt1': 2, 'nt2': 2, 'nt3': 2, 'g1': 0.2, 'g2': 1.5,
                 'tileParams': [0.2, 0.0, 0.4]},
        'silent': silent,
    }
    if tolerance is not None:
        p['tolerance'] = tolerance
    return p


@pytest.mark.parametrize("silent", [False, True])
def test_two_clients_each_get_their_own_fineness(monkeypatch, tmp_path, silent):
    monkeypatch.setattr(main_module, 'DATA_DIR', str(tmp_path))
    seen = []

    def _fake(dll_instance, out_folder, igs_path, igs_path2, num_tiles, tile_params,
              grading_params, tile_type_int, extrude_length, fineness):
        seen.append(fineness)
        return OBJ, "MSRevolv.obj", "MSRevolv.igs"

    monkeypatch.setitem(main_module.CALC_MODE_DISPATCH, main_module.CALC_MODE_REVOLUTION, _fake)

    c1 = main_module.socketio.test_client(main_module.app)
    c2 = main_module.socketio.test_client(main_module.app)
    try:
        c1.get_received()
        c2.get_received()
        c1.emit('calculate', _calc_payload(5, silent))
        assert _wait_until(lambda: len(seen) == 1)
        c2.emit('calculate', _calc_payload(None, silent))   # default
        assert _wait_until(lambda: len(seen) == 2)
        c1.emit('calculate', _calc_payload(150, silent))
        assert _wait_until(lambda: len(seen) == 3)
        assert seen == [5, DEFAULT_FINENESS, 150]
    finally:
        c1.disconnect()
        c2.disconnect()


def test_calculate_rejects_invalid_fineness(monkeypatch):
    called = []
    monkeypatch.setitem(main_module.CALC_MODE_DISPATCH, main_module.CALC_MODE_REVOLUTION,
                        lambda *a: called.append(a))
    c = main_module.socketio.test_client(main_module.app)
    try:
        c.get_received()
        c.emit('calculate', _calc_payload(0.35))
        events = c.get_received()
        assert any(e['name'] == 'error' for e in events)
        time.sleep(0.1)
        assert not called
    finally:
        c.disconnect()


def test_calculate_tile_passes_fineness(monkeypatch):
    seen = []
    monkeypatch.setattr(main_module, 'calculate_tile',
                        lambda dll, tp, g, t, fineness, sid: seen.append(fineness))
    c = main_module.socketio.test_client(main_module.app)
    try:
        c.emit('calculate_tile', {'type': 'cross', 'values': [0.2, 0.0, 0.4], 'tolerance': 42})
        c.emit('calculate_tile', {'type': 'cross', 'values': [0.2, 0.0, 0.4]})
        assert _wait_until(lambda: len(seen) == 2)
        assert seen == [42, DEFAULT_FINENESS]
    finally:
        c.disconnect()


def test_convert_igs_to_obj_passes_fineness(monkeypatch):
    seen = []

    def _fake(igs_file, obj_file, fineness):
        seen.append(fineness)
        with open(obj_file.decode('ascii'), 'w') as f:
            f.write(OBJ)
        return None

    monkeypatch.setattr(main_module.dll_background, 'iges2obj', _fake)
    client = main_module.app.test_client()
    for tol in ('64', None):
        data = {'file': (io.BytesIO(b'igs'), 'part.igs')}
        if tol is not None:
            data['tolerance'] = tol
        resp = client.post('/convert_igs_to_obj', data=data, content_type='multipart/form-data')
        assert resp.status_code == 200
    assert seen == [64, DEFAULT_FINENESS]

    resp = client.post('/convert_igs_to_obj',
                       data={'file': (io.BytesIO(b'igs'), 'part.igs'), 'tolerance': '0.5'},
                       content_type='multipart/form-data')
    assert resp.status_code == 400
    assert len(seen) == 2


# ── Real DLL: fineness actually changes the mesh ────────────────────────────

def test_real_dll_fineness_changes_mesh_density(tmp_path):
    instance = DllInstance(MAIN_DLL_PATH, emit=lambda *a: None)
    _KEEP_ALIVE.append(instance)

    def vertex_count(fineness):
        out = str(tmp_path / f"srf_{fineness}.obj")
        assert instance.iges2obj(SAMPLE_IGS.encode('ascii'), out.encode('ascii'), fineness) is None
        with open(out) as f:
            return sum(1 for line in f if line.startswith('v '))

    coarse, fine = vertex_count(5), vertex_count(60)
    assert coarse < fine
    # Setting it back must reproduce the coarse mesh exactly — no leftover state.
    assert vertex_count(5) == coarse
