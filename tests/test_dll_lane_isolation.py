"""tests/test_dll_lane_isolation.py — permanent regression guard for the
empirical finding this feature is built on: two independently-loaded
copies of MSDLL64.dll have independent global state, so a background-lane
call can run genuinely concurrently with a main-lane call without
corrupting its output. See
docs/superpowers/specs/2026-09-14-background-dll-lane-design.md.

Slower than the rest of the suite (runs several real lattice
calculations) — kept in its own file so it can be skipped in fast local
loops with `pytest --deselect tests/test_dll_lane_isolation.py` if needed.
"""
import ctypes
import os
import threading
import time

from dll_instance import DllInstance, prepare_background_dll_copy

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAIN_DLL_PATH = os.path.join(REPO_ROOT, "gershon", "MSDLL64.dll")
MAIN_DLL_MANIFEST_PATH = MAIN_DLL_PATH + ".manifest"
SRF_IGS = os.path.join(REPO_ROOT, "Input", "SimpleRevolve.igs").encode("ascii")


def _no_emit(event, sid, payload):
    pass


def _summarize_stl(path: str):
    with open(path, "rb") as f:
        text = f.read().decode(errors="replace")
    return {
        "triangles": text.count("facet normal"),
        "valid": text.strip().startswith("solid") and "endsolid" in text,
    }


def _run_revolution(instance: DllInstance, out_dir: str, tag) -> dict:
    num_tiles = (ctypes.c_int * 3)(2, 2, 2)
    graded = (ctypes.c_double * 2)(0.2, 1.5)
    tile_params = (ctypes.c_double * 3)(0.2, 0.0, 0.4)
    out_igs = os.path.join(out_dir, f"rev_{tag}.igs").encode("ascii")
    out_stl = os.path.join(out_dir, f"rev_{tag}.stl").encode("ascii")
    err = instance.from_revolution(SRF_IGS, num_tiles, graded, 0, tile_params, out_igs, out_stl)
    assert err is None, f"revolution call itself failed: {err}"
    return _summarize_stl(out_stl.decode("ascii"))


def _run_tile(instance: DllInstance, out_dir: str, tag) -> None:
    params = (ctypes.c_double * 2)(0.15, 0.05)
    graded = (ctypes.c_double * 2)(0.2, 1.5)
    out = os.path.join(out_dir, f"tile_{tag}.stl").encode("ascii")
    instance.get_tile(0, params, graded, 0.0, out)  # errors ignored — only used to keep the DLL busy


def test_background_lane_tile_calls_do_not_corrupt_a_concurrent_main_lane_revolution(tmp_path):
    dll_main = DllInstance(MAIN_DLL_PATH, emit=_no_emit)
    background_path = prepare_background_dll_copy(
        MAIN_DLL_PATH, MAIN_DLL_MANIFEST_PATH, dest_dir=str(tmp_path / "dll_background_instance"),
    )
    dll_background = DllInstance(background_path, emit=_no_emit)
    assert dll_main.handle != dll_background.handle

    baseline = _run_revolution(dll_main, str(tmp_path), "baseline")
    assert baseline["valid"] is True
    assert baseline["triangles"] > 0

    stop_flag = threading.Event()

    def tile_hammer():
        i = 0
        while not stop_flag.is_set():
            _run_tile(dll_background, str(tmp_path), f"hammer-{i}")
            i += 1

    results = []

    def revolution_runner():
        for i in range(4):
            results.append(_run_revolution(dll_main, str(tmp_path), f"concurrent-{i}"))

    t_tile = threading.Thread(target=tile_hammer, daemon=True)
    t_rev = threading.Thread(target=revolution_runner)
    t_tile.start()
    t_rev.start()
    t_rev.join(timeout=120)
    stop_flag.set()
    t_tile.join(timeout=10)

    assert len(results) == 4
    for r in results:
        assert r == baseline, (
            "Background-lane tile calls corrupted a concurrent main-lane "
            f"revolution's output: expected {baseline}, got {r}. This means "
            "the two-instance DLL isolation this feature depends on has "
            "regressed — see the design spec's safety caveat."
        )
