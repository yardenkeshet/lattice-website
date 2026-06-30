# main2.py — same endpoints as main.py, but calls MSDLL64.dll directly via ctypes.
import os
import argparse
import shutil
import time
import base64
import gzip
import json
from threading import Thread
import threading
import uuid
import contextlib
import logging
from logging.handlers import RotatingFileHandler
from io import BytesIO
from flask_cors import CORS
from flask_socketio import SocketIO

import ctypes
from ctypes import (
    c_void_p, c_char_p, c_int, c_float, c_double, POINTER, Structure, CFUNCTYPE
)

from flask import Flask, render_template, send_file, jsonify, request, Response
from flask_socketio import SocketIO, emit

# ──────────────────────────────────────────────────────────────────────────────
# DLL — load and configure signatures
# ──────────────────────────────────────────────────────────────────────────────

_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
_DLL_PATH = os.path.join(_BASE_DIR, "gershon", "MSDLL64.dll")

try:
    _dll = ctypes.CDLL(_DLL_PATH)
except OSError as _exc:
    raise OSError(
        f"Failed to load DLL at '{_DLL_PATH}'. "
        f"Check that the file exists and all dependencies are present. "
        f"Original error: {_exc}"
    ) from _exc

# ── Progress-report callbacks ─────────────────────────────────────────────────

class IritMiscProgressReportStruct(Structure):
    _fields_ = [
        ("InitMsg",  c_char_p),
        ("Progress", c_int),
    ]

_PRInfoPtr = POINTER(IritMiscProgressReportStruct)
_ProgressCB = CFUNCTYPE(None, _PRInfoPtr)

def _cb_init(pr):
    try:
        msg = pr.contents.InitMsg.decode()
        print(f"[DLL] {msg}     ", end='', flush=True)
        emit('update', {'type': 'progress_start', 'message': f'[DLL] {msg}'})
    except Exception:
        pass

def _cb_update(pr):
    try:
        progress = pr.contents.Progress
        print(f"\b\b\b{progress:3d}", end='', flush=True)
        emit('update', {'type': 'progress_update', 'progress': progress})
    except Exception:
        pass

def _cb_done(pr):
    print("\b\b\b100\n", end='', flush=True)
    try:
        emit('update', {'type': 'progress_end', 'progress': 100})
    except Exception:
        pass

_cb_init_c   = _ProgressCB(_cb_init)
_cb_update_c = _ProgressCB(_cb_update)
_cb_done_c   = _ProgressCB(_cb_done)

_dll.MSDLLSetProgressReportFuncs.restype  = None
_dll.MSDLLSetProgressReportFuncs.argtypes = [_ProgressCB, _ProgressCB, _ProgressCB, c_void_p]
_dll.MSDLLSetProgressReportFuncs(_cb_init_c, _cb_update_c, _cb_done_c, None)

# ── Function signatures ───────────────────────────────────────────────────────

_dll.MSDLLGetTile.restype  = c_char_p
_dll.MSDLLGetTile.argtypes = [
    c_int,
    POINTER(c_double),  # Params
    POINTER(c_double),  # Graded
    c_char_p,           # MSSTLFile
]

_dll.MSDLLMSFromRuling.restype  = c_char_p
_dll.MSDLLMSFromRuling.argtypes = [
    c_char_p,
    c_char_p,
    POINTER(c_int),     # NumTiles[3]
    POINTER(c_double),  # Graded[2]
    c_int,
    POINTER(c_double),  # TileParams
    c_char_p,           # MSIGSFilee (typo in DLL author's name)
    c_char_p,           # MSTLSFile
]

_dll.MSDLLMSFromExtrusion.restype  = c_char_p
_dll.MSDLLMSFromExtrusion.argtypes = [
    c_char_p,
    c_double,           # ExtrudeLength
    POINTER(c_int),     # NumTiles[3]
    POINTER(c_double),  # Graded[2]
    c_int,
    POINTER(c_double),  # TileParams
    c_char_p,           # MSIGSFile
    c_char_p,           # MSTLSFile
]

_dll.MSDLLMSFromRevolution.restype  = c_char_p
_dll.MSDLLMSFromRevolution.argtypes = [
    c_char_p,
    POINTER(c_int),     # NumTiles[3]
    POINTER(c_double),  # Graded[2]
    c_int,
    POINTER(c_double),  # TileParams
    c_char_p,           # MSIGSFile
    c_char_p,           # MSTLSFile
]

# Tolerance is c_float (4-byte), not c_double — confirmed by reference lattice.py
_dll.MSDLLIGES2STL.restype  = c_char_p
_dll.MSDLLIGES2STL.argtypes = [c_char_p, c_char_p, c_float]


# ──────────────────────────────────────────────────────────────────────────────
# Tile-type constants and map
# ──────────────────────────────────────────────────────────────────────────────

MSDLL_TILE_CROSS          = 0
MSDLL_TILE_DIAGONAL       = 1
MSDLL_TILE_CROSS_DIAGONAL = 2

CALC_MODE_EXTRUSION  = 'extrusion'
CALC_MODE_REVOLUTION = 'revolution'
CALC_MODE_RULING     = 'ruling'

TILE_TYPE_MAP = {
    "cross":          MSDLL_TILE_CROSS,
    "diagonal":       MSDLL_TILE_DIAGONAL,
    "cross_diagonal": MSDLL_TILE_CROSS_DIAGONAL,
}


# ──────────────────────────────────────────────────────────────────────────────
# Direct DLL wrapper helpers
# ──────────────────────────────────────────────────────────────────────────────

def _call(fn, *args):
    """Call a DLL function and return decoded error string (or None)."""
    result = fn(*args)
    if result:
        decoded = result.decode("utf-8", errors="replace")
        logger.warning(f"[DLL] {fn.__name__} returned: {decoded}")
        return decoded
    return None


def _dll_get_tile(tile_type, tile_params, graded, out_stl_file: bytes):
    return _call(_dll.MSDLLGetTile, tile_type, tile_params, graded, out_stl_file)


def _dll_from_revolution(srf_igs: bytes, num_tiles, graded, tile_type, tile_params,
                          out_igs: bytes, out_stl: bytes):
    return _call(_dll.MSDLLMSFromRevolution,
                 srf_igs, num_tiles, graded, tile_type, tile_params, out_igs, out_stl)


def _dll_from_extrusion(srf_igs: bytes, extrude_length: float, num_tiles, graded,
                         tile_type, tile_params, out_igs: bytes, out_stl: bytes):
    return _call(_dll.MSDLLMSFromExtrusion,
                 srf_igs, c_double(extrude_length), num_tiles, graded,
                 tile_type, tile_params, out_igs, out_stl)


def _dll_from_ruling(srf1: bytes, srf2: bytes, num_tiles, graded, tile_type, tile_params,
                      out_igs: bytes, out_stl: bytes):
    logger.debug(f"[DLL] FromRuling srf1={srf1}  srf2={srf2}")
    return _call(_dll.MSDLLMSFromRuling,
                 srf1, srf2, num_tiles, graded, tile_type, tile_params, out_igs, out_stl)


def _dll_iges2stl(igs_file: bytes, stl_file: bytes, tolerance: float = 0.0) -> str | None:
    return _call(_dll.MSDLLIGES2STL, igs_file, stl_file, c_float(tolerance))



# ──────────────────────────────────────────────────────────────────────────────
# CLI args — parsed early so CORS can use --frontend-port
_ap = argparse.ArgumentParser(description='Lattice website backend', add_help=True)
_ap.add_argument('--port', type=int, default=5003, help='Backend listen port (default: 5003)')
_ap.add_argument('--frontend-port', type=int, default=5173, help='Frontend dev server port for CORS (default: 5173)')
_cli_args, _ = _ap.parse_known_args()

# Flask / SocketIO setup
# ──────────────────────────────────────────────────────────────────────────────

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

app.config['SECRET_KEY'] = 'secret!'
app.config.update(
    SESSION_COOKIE_SAMESITE='Lax',
    SESSION_COOKIE_SECURE=False,
)

socketio = SocketIO(
    app,
    async_mode='threading',
    cors_allowed_origins='*',
    max_http_buffer_size=100 * 1024 * 1024,
    ping_interval=25,
    ping_timeout=120,
)

LOGFILE               = 'lattice.log'
DATA_DIR              = 'client_data'
LAST_RESULTS_DIR      = 'last_results'
LAST_TILES_RESULTS_DIR = 'last_tiles_results'
LOG_FILE_NAME         = LOGFILE

os.makedirs(DATA_DIR, exist_ok=True)

class _JsonFormatter(logging.Formatter):
    # Maps output JSON key -> the attribute read off the LogRecord.
    # 'filename' and 'args' are also *standard* logging.LogRecord attributes
    # (source filename / %-format args) present on every record regardless
    # of `extra=`. Reading them under their own names via getattr() would
    # leak e.g. record.filename ("main.py") into every existing log line
    # that never opted in. To keep this a strictly additive change for
    # existing logger.info(...) calls, calc-log callers pass their custom
    # data under non-colliding attribute names ('calc_filename', 'calc_args')
    # via extra=, which are then surfaced under the desired 'filename'/'args'
    # JSON keys here.
    EXTRA_FIELDS = (
        ('sid', 'sid'),
        ('ip', 'ip'),
        ('filename', 'calc_filename'),
        ('args', 'calc_args'),
        ('image', 'image'),
    )

    def format(self, record):
        record.message = record.getMessage()
        obj = {'ts': self.formatTime(record), 'level': record.levelname, 'msg': record.message}
        for json_key, attr_name in self.EXTRA_FIELDS:
            value = getattr(record, attr_name, None)
            if value:
                obj[json_key] = value
        if record.exc_info:
            obj['exc'] = self.formatException(record.exc_info)
        return json.dumps(obj)

class _TextFormatter(logging.Formatter):
    def format(self, record):
        s = super().format(record)
        sid = getattr(record, 'sid', None)
        ip  = getattr(record, 'ip', None)
        if sid:
            s += f'  sid={sid}'
        if ip:
            s += f'  ip={ip}'
        return s

_use_json = True #os.environ.get('LOG_FORMAT') == 'json'
fmt = _JsonFormatter() if _use_json else _TextFormatter('%(asctime)s %(levelname)-8s %(message)s')

logger = logging.getLogger('lattice')
logger.setLevel(logging.DEBUG)
fh = RotatingFileHandler(LOGFILE, maxBytes=5 * 1024 * 1024, backupCount=3)
fh.setFormatter(fmt)
logger.addHandler(fh)
ch = logging.StreamHandler()
ch.setFormatter(fmt)
logger.addHandler(ch)

CALC_LOG_DIR        = 'calc_log'
CALC_LOG_IMAGES_DIR = os.path.join(CALC_LOG_DIR, 'images')
CALC_LOG_FILE       = os.path.join(CALC_LOG_DIR, 'log.jsonl')
os.makedirs(CALC_LOG_IMAGES_DIR, exist_ok=True)

calc_logger = logging.getLogger('lattice.calc')
calc_logger.setLevel(logging.INFO)
calc_fh = logging.FileHandler(CALC_LOG_FILE, encoding='utf-8')
calc_fh.setFormatter(fmt)
calc_logger.addHandler(calc_fh)
calc_logger.propagate = False


# ──────────────────────────────────────────────────────────────────────────────
# Utility functions
# ──────────────────────────────────────────────────────────────────────────────

def read_ascii_stl_file(path):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return f.read()
    except FileNotFoundError:
        logger.warning(f"STL file not found: {path}")
        return None
    except Exception as exc:
        logger.exception(f"Error reading STL file {path}: {exc}")
        return None


def compress_text_to_b64_gz(text: str) -> str:
    buf = BytesIO()
    with gzip.GzipFile(fileobj=buf, mode='wb') as gz:
        gz.write(text.encode('utf-8'))
    return base64.b64encode(buf.getvalue()).decode('ascii')


def parse_ascii_stl(text):
    triangles = []
    lines = text.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if line.startswith('facet normal'):
            i += 1
            while i < len(lines) and 'outer loop' not in lines[i]:
                i += 1
            verts = []
            for _ in range(3):
                i += 1
                if i < len(lines):
                    parts = lines[i].strip().split()
                    if parts[0] == 'vertex':
                        verts.append((float(parts[1]), float(parts[2]), float(parts[3])))
            while i < len(lines) and 'endfacet' not in lines[i]:
                i += 1
            if len(verts) == 3:
                triangles.append(verts)
        i += 1
    return triangles


def write_ascii_stl(triangles, name='exported'):
    out = [f"solid {name}"]
    for tri in triangles:
        (ax, ay, az), (bx, by, bz), (cx, cy, cz) = tri
        ux, uy, uz = bx - ax, by - ay, bz - az
        vx, vy, vz = cx - ax, cy - ay, cz - az
        nx = uy * vz - uz * vy
        ny = uz * vx - ux * vz
        nz = ux * vy - uy * vx
        out.append(f"  facet normal {nx:.6f} {ny:.6f} {nz:.6f}")
        out.append("    outer loop")
        for v in tri:
            out.append(f"      vertex {v[0]:.6f} {v[1]:.6f} {v[2]:.6f}")
        out.append("    endloop")
        out.append("  endfacet")
    out.append(f"endsolid {name}")
    return "\n".join(out)


def reduce_triangles(triangles, target_vertices):
    if target_vertices <= 0:
        return triangles
    target_triangles = max(1, target_vertices // 3)
    n = len(triangles)
    if target_triangles >= n:
        return triangles
    step = n / target_triangles
    reduced, idx = [], 0.0
    while int(idx) < n and len(reduced) < target_triangles:
        reduced.append(triangles[int(idx)])
        idx += step
    return reduced


def twist_mesh(triangles, twist_angle_deg=45, axis='z'):
    import numpy as np
    verts = np.array([v for tri in triangles for v in tri])
    axis_idx = {'x': 0, 'y': 1, 'z': 2}[axis]
    min_val = verts[:, axis_idx].min()
    max_val = verts[:, axis_idx].max()
    height_norm = (verts[:, axis_idx] - min_val) / (max_val - min_val + 1e-8)
    angle_rad = np.deg2rad(twist_angle_deg)
    rotated_verts = []
    for v, h in zip(verts, height_norm):
        theta = h * angle_rad
        if axis == 'z':
            xr = v[0] * np.cos(theta) - v[1] * np.sin(theta)
            yr = v[0] * np.sin(theta) + v[1] * np.cos(theta)
            rotated_verts.append([xr, yr, v[2]])
        elif axis == 'y':
            xr = v[0] * np.cos(theta) - v[2] * np.sin(theta)
            zr = v[0] * np.sin(theta) + v[2] * np.cos(theta)
            rotated_verts.append([xr, v[1], zr])
        elif axis == 'x':
            yr = v[1] * np.cos(theta) - v[2] * np.sin(theta)
            zr = v[1] * np.sin(theta) + v[2] * np.cos(theta)
            rotated_verts.append([v[0], yr, zr])
    return [rotated_verts[i:i + 3] for i in range(0, len(rotated_verts), 3)]


# ──────────────────────────────────────────────────────────────────────────────
# DLL surface-type dispatch functions
# ──────────────────────────────────────────────────────────────────────────────

TMP_DIR = 'tmp'
os.makedirs(TMP_DIR, exist_ok=True)


@contextlib.contextmanager
def temp_igs_file(igs_bytes: bytes):
    """Write igs_bytes to a uniquely-named temp .igs file; delete it on exit."""
    path = os.path.join(os.getcwd(), TMP_DIR, f"{uuid.uuid4().hex}.igs")
    with open(path, 'wb') as f:
        f.write(igs_bytes)
    try:
        yield path
    finally:
        try:
            os.remove(path)
        except OSError:
            logger.warning(f"[TMP] failed to remove temp file: {path}")


DOWNLOAD_CACHE = {}


def do_revolution(out_folder, igs_path, num_tiles, tile_params, grading_params, tile_type_int):
    out_igs = os.path.join(out_folder, "MSRevolv.igs").encode('ascii')
    out_stl = os.path.join(out_folder, "MSRevolv.stl").encode('ascii')
    _dll_from_revolution(
        igs_path.encode('ascii'),
        num_tiles, grading_params,
        tile_type_int,
        tile_params,
        out_igs, out_stl,
    )
    stl_content = read_ascii_stl_file(out_stl.decode('ascii'))
    return stl_content, "MSRevolv.stl", "MSRevolv.igs"


def do_extrusion(out_folder, igs_path, num_tiles, tile_params, grading_params, tile_type_int):
    out_igs = os.path.join(out_folder, "MSExtrd.igs").encode('ascii')
    out_stl = os.path.join(out_folder, "MSExtrd.stl").encode('ascii')
    result = _dll_from_extrusion(
        igs_path.encode('ascii'),
        10.0,
        num_tiles, grading_params,
        tile_type_int,
        tile_params,
        out_igs, out_stl,
    )

    if result == "First input file is not holding a polynomial Bezier surface.":
        logger.warning("[EXTRUSION] DLL failed — returning dummy STL")
        dummy_path = os.path.join(os.path.dirname(__file__), "last_results", "dummyResult.stl")
        stl_content = read_ascii_stl_file(dummy_path)
    else:
        stl_content = read_ascii_stl_file(out_stl.decode('ascii'))

    return stl_content, "MSExtrd.stl", "MSExtrd.igs"


def do_Ruling(out_folder, igs_path, igs_path2, num_tiles, tile_params, grading_params, tile_type_int):
    out_igs = os.path.join(out_folder, "MSRuled.igs").encode('ascii')
    out_stl = os.path.join(out_folder, "MSRuled.stl").encode('ascii')

    _dll_from_ruling(
        igs_path.encode('ascii'), igs_path2.encode('ascii'),
        num_tiles, grading_params,
        tile_type_int,
        tile_params,
        out_igs, out_stl,
    )

    stl_content = read_ascii_stl_file(out_stl.decode('ascii'))
    return stl_content, "MSRuled.stl", "MSRuled.igs"


CALC_MODE_DISPATCH = {
    CALC_MODE_EXTRUSION:  do_extrusion,
    CALC_MODE_REVOLUTION: do_revolution,
}


def calculate_tile(tile_params, graded, tile_type_str, sid):
    t_recv = time.time()
    tile_type_int = TILE_TYPE_MAP.get(tile_type_str)
    if tile_type_int is None:
        logger.error(f"[TILE] Unknown tile type: {tile_type_str}", extra=_log_extra(sid))
        return

    stl_tile_path = os.path.join(os.getcwd(), TMP_DIR, f"tile_{uuid.uuid4().hex}.stl")
    _dll_get_tile(tile_type_int, tile_params, graded, stl_tile_path.encode('utf-8'))

    t_processed = time.time()
    if not os.path.exists(stl_tile_path):
        logger.error(f"[TILE] STL not found: {stl_tile_path}", extra=_log_extra(sid))
        return

    try:
        stl_content = read_ascii_stl_file(stl_tile_path)
        try:
            buf = BytesIO()
            with gzip.GzipFile(fileobj=buf, mode='wb') as gz:
                gz.write(stl_content.encode('utf-8'))
            compressed = buf.getvalue()
        except Exception:
            logger.exception("Tile compression failed", extra=_log_extra(sid))
            emit('error', {'msg': 'Compression failed'})
            return

        compressed_b64 = base64.b64encode(compressed).decode('ascii')
        t_done = time.time()
        timings = {
            'client_to_server_ms': 0,
            'time_processed_ms': (t_processed - t_recv) * 1000.0,
            'time_compress_ms': (t_done - t_processed) * 1000.0,
            'overall_ms': (t_done - t_recv) * 1000.0,
        }
        logger.info(
            f"[TILE] {tile_type_str}"
            f"  p=({tile_params[0]:.2f},{tile_params[1]:.2f},{tile_params[2]:.2f})"
            f"  g=({graded[0]:.2f},{graded[1]:.2f})"
            f"  {timings['overall_ms']:.0f}ms",
            extra=_log_extra(sid),
        )
        emit('result', {
            'filename': 'tile.stl',
            'kind': 'tile_stl',
            'stl_gz_b64': compressed_b64,
            'timings': timings,
        })
    finally:
        try:
            os.remove(stl_tile_path)
        except OSError:
            logger.warning(f"[TMP] failed to remove temp file: {stl_tile_path}")


# ──────────────────────────────────────────────────────────────────────────────
# Log tailing
# ──────────────────────────────────────────────────────────────────────────────

log_thread = None
calc_log_thread = None
thread_stop_event = False


def get_initial_log_content(file_path, num_lines=50):
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
            return [line.strip() for line in lines[-num_lines:]]
    except FileNotFoundError:
        return [f"Error: Log file '{file_path}' not found."]
    except Exception as exc:
        return [f"An error occurred reading initial log: {exc}"]


def follow_log(file_name, socketio_instance):
    try:
        with open(file_name, 'r') as f:
            f.seek(0, os.SEEK_END)
            while not thread_stop_event:
                line = f.readline()
                if not line:
                    socketio_instance.sleep(0.1)
                    continue
                socketio_instance.emit('log_update', {'data': line.strip()})
    except FileNotFoundError:
        socketio_instance.emit('log_error', {'data': f"Log file '{file_name}' not found."})
    except Exception as exc:
        logger.exception(f"Log follower error: {exc}")


# ──────────────────────────────────────────────────────────────────────────────
# SocketIO event handlers
# ──────────────────────────────────────────────────────────────────────────────

connected_clients = {}
client_state = {}


def worker_loop(state):
    logger.debug("[WORKER] started", extra={'sid': state['sid']})
    while True:
        state["event"].wait()
        state["event"].clear()
        tile_type = state["tile_type"]
        p1, p2, p3 = state["p1"], state["p2"], state["p3"]
        logger.debug(f"[WORKER] processing tile_type={tile_type} p=({p1},{p2},{p3})", extra={'sid': state['sid']})


@socketio.on('connect')
def on_connect():
    global log_thread, calc_log_thread
    sid = request.sid
    ip_address = request.environ.get('REMOTE_ADDR')
    logger.info(f'Client connected  ip={ip_address}', extra=_log_extra(sid))

    state = {
        "sid": sid,
        "tile_type": None, "p1": None, "p2": None, "p3": None,
        "event": threading.Event(),
        "current_token": None,
    }
    t = threading.Thread(target=worker_loop, args=(state,), daemon=True)
    t.start()
    client_state[sid] = state
    unique_file_id = str(uuid.uuid4())
    connected_clients[sid] = {
        'sid': sid,
        'ip_address_reported': ip_address,
        'unique_file_id': unique_file_id,
    }

    for line in get_initial_log_content(LOG_FILE_NAME):
        emit('log_update', {'data': line})

    if log_thread is None:
        log_thread = socketio.start_background_task(
            target=follow_log, file_name=LOG_FILE_NAME, socketio_instance=socketio
        )

    for line in get_initial_log_content(CALC_LOG_FILE):
        emit('log_update', {'data': line})

    if calc_log_thread is None:
        calc_log_thread = socketio.start_background_task(
            target=follow_log, file_name=CALC_LOG_FILE, socketio_instance=socketio
        )


def _client_ip(sid):
    return (connected_clients.get(sid) or {}).get('ip_address_reported', '?')


def _log_extra(sid):
    return {'sid': sid, 'ip': _client_ip(sid)}


def clean_session(sid, token):
    connected_clients.pop(sid, None)
    if not token:
        return
    folder = os.path.join(os.getcwd(), LAST_RESULTS_DIR, token)
    try:
        if os.path.exists(folder):
            shutil.rmtree(folder)
    except Exception as exc:
        logger.exception(f"[SESSION] cleanup failed {folder}: {exc}")


@socketio.on('disconnect')
def on_disconnect():
    sid = request.sid
    logger.info(f'Client disconnected  ip={_client_ip(sid)}', extra=_log_extra(sid))
    token = (client_state.get(sid) or {}).get('current_token')
    if token:
        DOWNLOAD_CACHE.pop(token, None)
    client_state.pop(sid, None)
    clean_session(sid, token)


@socketio.on('calculate')
def handle_calculate(data):
    sid = request.sid
    t_start = time.time()

    client_ts    = data.get('client_ts')
    filename     = data.get('filename', 'uploaded.igs')
    args         = data.get('args', {})
    surface_b64  = data.get('surface_b64')
    surface2_b64 = data.get('surface2_b64')

    tile_type = args.get('tileType')
    calc_mode = args.get('calcMode')
    try:
        nt1 = int(args.get('nt1', 2))
        nt2 = int(args.get('nt2', 2))
        nt3 = int(args.get('nt3', 2))
        g1  = float(args.get('g1', 0.2))
        g2  = float(args.get('g2', 1.5))
        p1  = float(args.get('p1', 0.2))
        p2  = float(args.get('p2', 0.0))
        p3  = float(args.get('p3', 0.4))
    except (TypeError, ValueError) as exc:
        logger.exception(f"[CALC] Bad numeric argument: {exc}", extra=_log_extra(sid))
        emit('error', {'msg': f'Invalid numeric argument: {exc}'})
        return

    tile_type_int = TILE_TYPE_MAP.get(tile_type)
    logger.info(
        f"[CALC] {filename}  mode={calc_mode}  tile={tile_type}  tiles=({nt1},{nt2},{nt3})  g=({g1},{g2})  p=({p1:.2f},{p2:.2f},{p3:.2f})  ip={_client_ip(sid)}",
        extra=_log_extra(sid),
    )

    if tile_type_int is None:
        logger.error(f"[CALC] Unknown tileType: {tile_type!r}", extra=_log_extra(sid))
        emit('error', {'msg': f'Unknown tileType: {tile_type}'})
        return

    if calc_mode != CALC_MODE_RULING and calc_mode not in CALC_MODE_DISPATCH:
        logger.error(f"[CALC] Unknown calcMode: {calc_mode!r}", extra=_log_extra(sid))
        emit('error', {'msg': f'Unknown calcMode: {calc_mode}'})
        return

    if not surface_b64:
        logger.error("[CALC] No surface_b64 in payload", extra=_log_extra(sid))
        emit('error', {'msg': 'No surface file provided'})
        return
    try:
        igs_bytes = base64.b64decode(surface_b64)
    except (ValueError, TypeError) as exc:
        logger.exception(f"[CALC] Bad surface_b64: {exc}", extra=_log_extra(sid))
        emit('error', {'msg': f'Invalid surface data: {exc}'})
        return

    igs_bytes2 = None
    if calc_mode == CALC_MODE_RULING:
        if not surface2_b64:
            logger.error("[CALC] Ruling mode requires surface2_b64", extra=_log_extra(sid))
            emit('error', {'msg': 'Ruling mode requires a second surface file'})
            return
        try:
            igs_bytes2 = base64.b64decode(surface2_b64)
        except (ValueError, TypeError) as exc:
            logger.exception(f"[CALC] Bad surface2_b64: {exc}", extra=_log_extra(sid))
            emit('error', {'msg': f'Invalid second surface data: {exc}'})
            return

    curr_num_tiles   = (c_int * 3)(nt1, nt2, nt3)
    curr_graded      = (c_double * 2)(g1, g2)
    curr_tile_params = (c_double * 3)(p1, p2, p3)

    new_token  = str(uuid.uuid4())
    out_folder = os.path.join(os.getcwd(), LAST_RESULTS_DIR, new_token)
    os.makedirs(out_folder, exist_ok=True)

    t_dll_start = time.time()
    try:
        logger.info(f"[CALC] -> {calc_mode}  filename={filename}", extra=_log_extra(sid))
        with temp_igs_file(igs_bytes) as igs_path:
            if calc_mode == CALC_MODE_RULING:
                with temp_igs_file(igs_bytes2) as igs_path2:
                    stl_content, out_stl_name, out_igs_name = do_Ruling(
                        out_folder, igs_path, igs_path2,
                        curr_num_tiles, curr_tile_params, curr_graded, tile_type_int,
                    )
            else:
                dispatch_fn = CALC_MODE_DISPATCH[calc_mode]
                stl_content, out_stl_name, out_igs_name = dispatch_fn(
                    out_folder, igs_path, curr_num_tiles, curr_tile_params, curr_graded, tile_type_int
                )
    except FileNotFoundError as exc:
        logger.exception(f"[CALC] DLL output file not found: {exc}", extra=_log_extra(sid))
        emit('error', {'msg': f'DLL did not produce output file: {exc}'})
        shutil.rmtree(out_folder, ignore_errors=True)
        return
    except Exception as exc:
        logger.exception(f"[CALC] DLL call failed: {exc}", extra=_log_extra(sid))
        emit('error', {'msg': f'Processing error: {exc}'})
        shutil.rmtree(out_folder, ignore_errors=True)
        return

    t_dll_end = time.time()

    if not stl_content:
        logger.error("[CALC] No STL content produced after DLL call", extra=_log_extra(sid))
        emit('error', {'msg': 'No output produced by DLL'})
        shutil.rmtree(out_folder, ignore_errors=True)
        return

    try:
        t_comp_start = time.time()
        compressed_b64 = compress_text_to_b64_gz(stl_content)
        t_comp_end = time.time()
        comp_kb = len(base64.b64decode(compressed_b64)) / 1024
    except Exception as exc:
        logger.exception(f"[CALC] Compression failed: {exc}", extra=_log_extra(sid))
        emit('error', {'msg': 'Compression failed'})
        shutil.rmtree(out_folder, ignore_errors=True)
        return

    # Success — register the new result and retire the previous one for this session.
    DOWNLOAD_CACHE[new_token] = {'sid': sid, 'out_stl': out_stl_name, 'out_igs': out_igs_name}
    old_token = client_state.get(sid, {}).get('current_token')
    if old_token and old_token != new_token:
        DOWNLOAD_CACHE.pop(old_token, None)
        shutil.rmtree(os.path.join(os.getcwd(), LAST_RESULTS_DIR, old_token), ignore_errors=True)
    if sid in client_state:
        client_state[sid]['current_token'] = new_token

    t_total = time.time() - t_start
    timings = {
        'client_to_server_ms': None if client_ts is None else (t_dll_start * 1000 - client_ts),
        'time_dll_ms':         round((t_dll_end - t_dll_start) * 1000),
        'time_compress_ms':    round((t_comp_end - t_comp_start) * 1000),
        'overall_ms':          round(t_total * 1000),
    }

    emit('result', {
        'filename_reduced': os.path.splitext(os.path.basename(filename))[0] + '_reduced.stl',
        'kind':             'model_stl',
        'stl_gz_b64':       compressed_b64,
        'timings':          timings,
        'args_echo':        args,
        'filename':         filename,
        'download_token':   new_token,
    })

    logger.info(
        f"[CALC] done  {comp_kb:.0f}KB"
        f"  overall={timings['overall_ms']}ms"
        f"  dll={timings['time_dll_ms']}ms"
        f"  compress={timings['time_compress_ms']}ms"
        f"  token={new_token}",
        extra=_log_extra(sid),
    )

@socketio.on('calculate_tile')
def handle_calculate_tile(data):
    try:
        p1, p2, p3 = data['values']
        tile_type   = data['type']
        tile_params = (c_double * 3)(p1, p2, p3)
        graded1, graded2   = data.get('graded', [1, 1])
        graded  = (c_double * 2)(graded1, graded2)
        print("calculate with " +  str(graded[0])+" "+ str(graded[1]))

        calculate_tile(tile_params, graded, tile_type, request.sid)
    except Exception as exc:
        logger.exception(f"[TILE] bad request: {exc}", extra={'sid': request.sid})
        emit('error', {'msg': f'Bad tile request: {exc}'})


@app.route('/convert_igs_to_stl', methods=['POST'])
def handle_convert_igs_to_stl():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    igs_bytes = request.files['file'].read()

    try:
        with temp_igs_file(igs_bytes) as igs_path:
            stl_path = igs_path[:-4] + '_preview.stl'
            t_igs_start = time.time()
            err = _dll_iges2stl(igs_path.encode('ascii'), stl_path.encode('ascii'), 0.0)
            t_igs_ms = round((time.time() - t_igs_start) * 1000)
            if err:
                logger.warning(f"[IGS2STL] DLL warning: {err}")

            if not os.path.exists(stl_path):
                return jsonify({'error': 'IGS conversion produced no output'}), 500

            try:
                with open(stl_path, 'rb') as f:
                    stl_content = f.read()
            finally:
                try:
                    os.remove(stl_path)
                except OSError:
                    logger.warning(f"[TMP] failed to remove temp file: {stl_path}")

        b64_str = base64.b64encode(stl_content).decode('utf-8')
        logger.info(f"[IGS2STL] {len(stl_content) // 1024}KB  {t_igs_ms}ms")
        return jsonify({'stl_b64': b64_str})

    except Exception as exc:
        logger.exception(f"[IGS2STL] {exc}")
        return jsonify({'error': f'Internal server error: {exc}'}), 500


@app.route('/log-calculation', methods=['POST'])
def handle_log_calculation():
    if 'image' not in request.files:
        return jsonify({'error': 'No image provided'}), 400

    try:
        metadata = json.loads(request.form.get('metadata', '{}'))
    except (TypeError, ValueError):
        metadata = {}
    filename = metadata.get('filename', '')
    args     = metadata.get('args', {})

    entry_id   = uuid.uuid4().hex
    image_name = f'{entry_id}.png'
    image_disk = os.path.join(CALC_LOG_IMAGES_DIR, image_name)
    try:
        request.files['image'].save(image_disk)
    except OSError as exc:
        logger.warning(f"[CALC_LOG] failed to save snapshot: {exc}")
        return jsonify({'error': 'Failed to save snapshot'}), 500

    calc_logger.info(
        f"[CALC_LOG] {filename}"
        f"  tile={args.get('tileType')}  mode={args.get('calcMode')}"
        f"  tiles=({args.get('nt1')},{args.get('nt2')},{args.get('nt3')})"
        f"  g=({args.get('g1')},{args.get('g2')})"
        f"  p=({args.get('p1')},{args.get('p2')},{args.get('p3')})",
        extra={'calc_filename': filename, 'calc_args': args, 'image': f'images/{image_name}'},
    )
    return jsonify({'ok': True})


@app.route('/calc-log-image/<name>')
def calc_log_image(name):
    safe_name = os.path.basename(name)
    if safe_name != name or not safe_name.lower().endswith('.png'):
        return jsonify({'error': 'Invalid image name'}), 400
    path = os.path.join(CALC_LOG_IMAGES_DIR, safe_name)
    if not os.path.exists(path):
        return jsonify({'error': 'Image not found'}), 404
    return send_file(path, mimetype='image/png')

# ──────────────────────────────────────────────────────────────────────────────
# HTTP routes
# ──────────────────────────────────────────────────────────────────────────────

@app.route('/')
def index():
    return render_template('index.html')


@app.route('/viewlog')
def view_log():
    return render_template('log_view.html', log_file=LOG_FILE_NAME)


@app.route('/viewfulllog')
def view_full_log():
    try:
        with open(LOG_FILE_NAME, 'r', encoding='utf-8') as f:
            log_content = f.read()
    except FileNotFoundError:
        log_content = f"Error: Log file '{LOG_FILE_NAME}' not found."
    except Exception as exc:
        log_content = f"An unexpected error occurred: {exc}"
    return render_template('full_log_view.html', log_file=LOG_FILE_NAME, log_content=log_content)


@app.route('/download-results', methods=['POST'])
def download_results():
    token     = request.form.get('token')
    file_type = request.form.get('file_type')

    output_map = DOWNLOAD_CACHE.get(token)
    if output_map is None:
        logger.error(
            f"[DOWNLOAD] invalid/expired token: {token!r}  file_type={file_type}  ip={request.remote_addr}"
        )
        return jsonify({'error': 'Invalid or expired download token'}), 404

    sid        = output_map['sid']
    out_folder = os.path.join(os.getcwd(), LAST_RESULTS_DIR, token)

    if file_type == 'stl':
        filename = output_map['out_stl']
        mimetype = 'model/stl'
    elif file_type == 'igs':
        filename = output_map['out_igs']
        mimetype = 'application/octet-stream'
    else:
        logger.warning(
            f"[DOWNLOAD] unknown file_type: {file_type!r}  token={token}  folder={out_folder}",
            extra=_log_extra(sid),
        )
        return jsonify({'error': f'Unknown file_type: {file_type}'}), 400

    file_path = os.path.join(out_folder, filename)
    if not os.path.exists(file_path):
        logger.error(f"[DOWNLOAD] file not found: {file_path}", extra=_log_extra(sid))
        return jsonify({'error': 'Result file not found'}), 404

    file_kb = os.path.getsize(file_path) / 1024
    logger.info(f"[DOWNLOAD] {file_type}  path={file_path}  size={file_kb:.0f}KB", extra=_log_extra(sid))
    return send_file(file_path, mimetype=mimetype, as_attachment=True, download_name=filename)


# ──────────────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    logging.getLogger('werkzeug').setLevel(logging.ERROR)
    logger.info(f"Server starting on http://localhost:{5003}")
    socketio.run(app, host='0.0.0.0', port=5003, debug=False, use_reloader=False)