"""dll_instance.py — wraps one loaded copy of MSDLL64.dll.

Each DllInstance is an independently-loaded ctypes module with its own
progress-report callbacks and its own static/global state inside the DLL
(confirmed empirically: two ctypes.CDLL() loads of the same DLL file from
two different paths get distinct module handles and distinct global state
on Windows — see docs/superpowers/specs/2026-09-14-background-dll-lane-design.md).
Concurrent calls into the SAME instance still corrupt each other — callers
are responsible for serializing access to a given instance (see dll_lane.py
and calc_queue.py). This module has no Flask/SocketIO dependency so it can
be unit-tested standalone; callers supply an `emit(event, sid, payload)`
callback for progress reporting.
"""

import ctypes
import os
import shutil
from ctypes import c_void_p, c_char_p, c_int, c_double, POINTER, Structure, CFUNCTYPE
from typing import Callable


class _PRInfoStruct(Structure):
    _fields_ = [("InitMsg", c_char_p), ("Progress", c_int)]


_PRInfoPtr = POINTER(_PRInfoStruct)
_ProgressCB = CFUNCTYPE(None, _PRInfoPtr)


def _call(fn, *args):
    """Call a DLL function and return its decoded error string (or None)."""
    result = fn(*args)
    if result:
        return result.decode("utf-8", errors="replace")
    return None


class DllInstance:
    def __init__(self, dll_path: str, emit: Callable[[str, str, dict], None]):
        self._emit = emit
        self._current_sid: str | None = None
        self._dll = ctypes.CDLL(dll_path)

        self._dll.MSDLLGetTile.restype = c_char_p
        self._dll.MSDLLGetTile.argtypes = [
            c_int, POINTER(c_double), POINTER(c_double), c_char_p,
        ]
        self._dll.MSDLLMSFromRuling.restype = c_char_p
        self._dll.MSDLLMSFromRuling.argtypes = [
            c_char_p, c_char_p, POINTER(c_int), POINTER(c_double), c_int,
            POINTER(c_double), c_char_p, c_char_p,
        ]
        self._dll.MSDLLMSFromExtrusion.restype = c_char_p
        self._dll.MSDLLMSFromExtrusion.argtypes = [
            c_char_p, c_double, POINTER(c_int), POINTER(c_double), c_int,
            POINTER(c_double), c_char_p, c_char_p,
        ]
        self._dll.MSDLLMSFromRevolution.restype = c_char_p
        self._dll.MSDLLMSFromRevolution.argtypes = [
            c_char_p, POINTER(c_int), POINTER(c_double), c_int,
            POINTER(c_double), c_char_p, c_char_p,
        ]
        self._dll.MSDLLIGES2OBJ.restype = c_char_p
        self._dll.MSDLLIGES2OBJ.argtypes = [c_char_p, c_char_p]
        self._dll.MSDLLSetPolyTolerance.restype = c_char_p
        self._dll.MSDLLSetPolyTolerance.argtypes = [c_int]

        # Kept as attributes, not locals — ctypes does not keep a Python
        # reference to a CFUNCTYPE-wrapped callback alive on its own, and a
        # garbage-collected callback crashes the process the next time the
        # DLL invokes it.
        self._cb_init_c = _ProgressCB(self._on_progress_init)
        self._cb_update_c = _ProgressCB(self._on_progress_update)
        self._cb_done_c = _ProgressCB(self._on_progress_done)
        self._dll.MSDLLSetProgressReportFuncs.restype = None
        self._dll.MSDLLSetProgressReportFuncs.argtypes = [
            _ProgressCB, _ProgressCB, _ProgressCB, c_void_p,
        ]
        self._dll.MSDLLSetProgressReportFuncs(
            self._cb_init_c, self._cb_update_c, self._cb_done_c, None,
        )

    @property
    def handle(self) -> int:
        return self._dll._handle

    def set_current_sid(self, sid: str | None) -> None:
        """Must be set before, and cleared immediately after, every DLL
        call that can trigger progress callbacks — this instance's calls
        are only ever single-flight, so one sid at a time is correct."""
        self._current_sid = sid

    def _on_progress_init(self, pr) -> None:
        if not self._current_sid:
            return
        try:
            msg = pr.contents.InitMsg.decode()
        except Exception:
            return
        self._emit("update", self._current_sid, {"type": "progress_start", "message": f"[DLL] {msg}"})

    def _on_progress_update(self, pr) -> None:
        if not self._current_sid:
            return
        self._emit("update", self._current_sid, {"type": "progress_update", "progress": pr.contents.Progress})

    def _on_progress_done(self, pr) -> None:
        if not self._current_sid:
            return
        self._emit("update", self._current_sid, {"type": "progress_end", "progress": 100})

    def get_tile(self, tile_type, tile_params, graded, tolerance, out_obj_file: bytes):
        # `tolerance` is accepted for caller compatibility but not passed:
        # MSDLLGetTile takes no tolerance. Tessellation fineness is global
        # DLL state — see set_poly_tolerance().
        return _call(self._dll.MSDLLGetTile, tile_type, tile_params, graded, out_obj_file)

    def from_revolution(self, srf_igs: bytes, num_tiles, graded, tile_type, tile_params,
                         out_igs: bytes, out_obj: bytes):
        return _call(self._dll.MSDLLMSFromRevolution,
                     srf_igs, num_tiles, graded, tile_type, tile_params, out_igs, out_obj)

    def from_extrusion(self, srf_igs: bytes, extrude_length: float, num_tiles, graded,
                        tile_type, tile_params, out_igs: bytes, out_obj: bytes):
        return _call(self._dll.MSDLLMSFromExtrusion,
                     srf_igs, c_double(extrude_length), num_tiles, graded,
                     tile_type, tile_params, out_igs, out_obj)

    def from_ruling(self, srf1: bytes, srf2: bytes, num_tiles, graded, tile_type, tile_params,
                     out_igs: bytes, out_obj: bytes):
        return _call(self._dll.MSDLLMSFromRuling,
                     srf1, srf2, num_tiles, graded, tile_type, tile_params, out_igs, out_obj)

    def iges2obj(self, igs_file: bytes, obj_file: bytes, tolerance=None) -> str | None:
        # `tolerance` is accepted for caller compatibility but not passed:
        # MSDLLIGES2OBJ takes only the two file paths. Tessellation fineness
        # is global DLL state — see set_poly_tolerance().
        return _call(self._dll.MSDLLIGES2OBJ, igs_file, obj_file)

    def set_poly_tolerance(self, tolerance: int) -> str | None:
        """Sets the tessellation fineness used by every later OBJ export on
        this instance (MSDLLGetTile, MSDLLMSFrom*, MSDLLIGES2OBJ). The DLL
        accepts integers in [2, 200] and returns an error string otherwise."""
        return _call(self._dll.MSDLLSetPolyTolerance, c_int(tolerance))


def prepare_background_dll_copy(source_dll_path: str, source_manifest_path: str, dest_dir: str) -> str:
    """Copies the DLL (+ its .manifest) to dest_dir, overwriting any
    previous copy there, and returns the copied DLL's path. Called once at
    server startup so the background lane always loads a byte-identical,
    but separately-loaded, copy of the real DLL — never committed to the
    repo, so the two can't drift out of sync with each other."""
    os.makedirs(dest_dir, exist_ok=True)
    dest_dll_path = os.path.join(dest_dir, os.path.basename(source_dll_path))
    shutil.copyfile(source_dll_path, dest_dll_path)
    if os.path.exists(source_manifest_path):
        dest_manifest_path = os.path.join(dest_dir, os.path.basename(source_manifest_path))
        shutil.copyfile(source_manifest_path, dest_manifest_path)
    return dest_dll_path


def assert_distinct_dll_instances(a: "DllInstance", b: "DllInstance") -> None:
    """The whole two-lane design rests on two ctypes.CDLL() loads of the
    same DLL file, from two different paths, getting independent module
    handles (and therefore independent static/global state) on Windows.
    This was confirmed by direct measurement, but refuses to silently run
    in a mode that would reintroduce cross-lane DLL corruption if that
    ever turns out not to hold (a different Windows version, a different
    loader configuration, etc.) — fail loud at startup instead."""
    if a.handle == b.handle:
        raise RuntimeError(
            "dll_main and dll_background share the same loaded module handle "
            f"({a.handle:#x}) — the two-lane DLL design requires independent "
            "module instances. Refusing to start in a configuration that "
            "would let background work corrupt a real calculation's output."
        )
