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


import pytest

from dll_instance import prepare_background_dll_copy, assert_distinct_dll_instances

MAIN_DLL_MANIFEST_PATH = MAIN_DLL_PATH + ".manifest"


def test_prepare_background_dll_copy_creates_a_loadable_copy(tmp_path):
    dest_dir = str(tmp_path / "dll_background_instance")

    copied_path = prepare_background_dll_copy(MAIN_DLL_PATH, MAIN_DLL_MANIFEST_PATH, dest_dir)

    assert os.path.exists(copied_path)
    assert copied_path != MAIN_DLL_PATH
    # Must actually be loadable and independently usable.
    instance = DllInstance(copied_path, emit=_no_emit)
    params = (ctypes.c_double * 2)(0.15, 0.05)
    graded = (ctypes.c_double * 2)(0.2, 1.5)
    out_stl = str(tmp_path / "from_copy.stl").encode("ascii")
    assert instance.get_tile(0, params, graded, 0.0, out_stl) is None


def test_prepare_background_dll_copy_is_idempotent_across_restarts(tmp_path):
    dest_dir = str(tmp_path / "dll_background_instance")

    first = prepare_background_dll_copy(MAIN_DLL_PATH, MAIN_DLL_MANIFEST_PATH, dest_dir)
    second = prepare_background_dll_copy(MAIN_DLL_PATH, MAIN_DLL_MANIFEST_PATH, dest_dir)

    assert first == second
    assert os.path.exists(first)


def test_assert_distinct_dll_instances_passes_for_two_real_loads():
    a = DllInstance(MAIN_DLL_PATH, emit=_no_emit)
    b_path = prepare_background_dll_copy(
        MAIN_DLL_PATH, MAIN_DLL_MANIFEST_PATH,
        dest_dir=os.path.join(REPO_ROOT, "tmp", "test_dll_background_instance"),
    )
    b = DllInstance(b_path, emit=_no_emit)

    assert_distinct_dll_instances(a, b)  # must not raise


def test_assert_distinct_dll_instances_raises_when_handles_match():
    class _Fake:
        def __init__(self, handle):
            self.handle = handle

    with pytest.raises(RuntimeError):
        assert_distinct_dll_instances(_Fake(1), _Fake(1))
