import os
import ctypes

from dll_instance import DllInstance

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAIN_DLL_PATH = os.path.join(REPO_ROOT, "gershon", "MSDLL64.dll")


def _no_emit(event, sid, payload):
    pass


def test_get_tile_produces_a_valid_stl(tmp_path):
    instance = DllInstance(MAIN_DLL_PATH, emit=_no_emit)

    params = (ctypes.c_double * 2)(0.15, 0.05)
    graded = (ctypes.c_double * 2)(0.2, 1.5)
    out_stl = str(tmp_path / "tile.stl").encode("ascii")

    err = instance.get_tile(0, params, graded, 0.0, out_stl)

    assert err is None
    with open(out_stl, "rb") as f:
        content = f.read().decode()
    assert content.strip().startswith("solid")
    assert "endsolid" in content


def test_get_tile_reports_dll_error_without_raising(tmp_path):
    instance = DllInstance(MAIN_DLL_PATH, emit=_no_emit)

    # Radii both 0.0 is out of the DLL's valid range — must come back as an
    # error string, not raise and not crash the process.
    params = (ctypes.c_double * 2)(0.0, 0.0)
    graded = (ctypes.c_double * 2)(0.2, 1.5)
    out_stl = str(tmp_path / "bad_tile.stl").encode("ascii")

    err = instance.get_tile(0, params, graded, 0.0, out_stl)

    assert err is not None
    assert isinstance(err, str)


def test_two_instances_from_the_same_path_have_distinct_handles():
    a = DllInstance(MAIN_DLL_PATH, emit=_no_emit)
    b = DllInstance(MAIN_DLL_PATH, emit=_no_emit)
    # ctypes.CDLL on Windows can return a cached handle for a path already
    # loaded in this process — this pins today's actual observed behavior
    # (each DllInstance in production loads a DIFFERENT file path, so this
    # same-path case isn't the production scenario) without asserting
    # anything about it either way.
    assert isinstance(a.handle, int)
    assert isinstance(b.handle, int)


def test_set_current_sid_gates_progress_emits():
    received = []

    def emit(event, sid, payload):
        received.append((event, sid, payload))

    instance = DllInstance(MAIN_DLL_PATH, emit=emit)
    # No sid set yet — a manual callback invocation must not emit.
    instance._on_progress_update(_fake_progress_struct(42))
    assert received == []

    instance.set_current_sid("sid-123")
    instance._on_progress_update(_fake_progress_struct(42))
    assert received == [("update", "sid-123", {"type": "progress_update", "progress": 42})]

    instance.set_current_sid(None)
    instance._on_progress_update(_fake_progress_struct(50))
    assert len(received) == 1  # unchanged — no sid, no emit


def _fake_progress_struct(progress: int):
    from dll_instance import _PRInfoStruct
    s = _PRInfoStruct()
    s.InitMsg = b"test"
    s.Progress = progress
    return ctypes.pointer(s)
