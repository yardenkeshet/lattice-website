# main2.py — same endpoints as main.py, but calls MSDLL64.dll directly via ctypes.
import os
import shutil
import time
import base64
import gzip
import json
from threading import Thread
import threading
import uuid
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
        print(f"DLL [{fn.__name__}] returned: {decoded}")
        return decoded
    return None


def _dll_get_tile(tile_type, tile_params, graded, out_stl_file: bytes):
    print(f"MSDLLGetTile  type={tile_type}  params={list(tile_params[:3])}  graded={list(graded[:2])}")
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
    print(f"MSDLLMSFromRuling  \nsrf1={srf1} \n srf2={srf2} \n num_tiles={num_tiles}  graded={graded}  tile_type={tile_type}  tile_params={tile_params}  out_igs={out_igs}  out_stl={out_stl}")
    srf2 = b'C:\\Users\\yaniv\\Uni\\Sem 6\\Lattice Project\\lattice-website\\client_data\\RuledSrf2.igs'
    return _call(_dll.MSDLLMSFromRuling,
                 srf1, srf2, num_tiles, graded, tile_type, tile_params, out_igs, out_stl)


def _dll_iges2stl(igs_file: bytes, stl_file: bytes, tolerance: float = 0.0) -> str | None:
    return _call(_dll.MSDLLIGES2STL, igs_file, stl_file, c_float(tolerance))



# ──────────────────────────────────────────────────────────────────────────────
# Flask / SocketIO setup
# ──────────────────────────────────────────────────────────────────────────────

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": ["http://localhost:5173", "http://localhost"]}})

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

logger = logging.getLogger('lattice2')
logger.setLevel(logging.DEBUG)
fmt = logging.Formatter('%(asctime)s %(levelname)s %(message)s')
fh = RotatingFileHandler(LOGFILE, maxBytes=5 * 1024 * 1024, backupCount=3)
fh.setFormatter(fmt)
logger.addHandler(fh)
ch = logging.StreamHandler()
ch.setFormatter(fmt)
logger.addHandler(ch)


# ──────────────────────────────────────────────────────────────────────────────
# Utility functions
# ──────────────────────────────────────────────────────────────────────────────

def read_ascii_stl_file(path):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return f.read()
    except FileNotFoundError:
        logger.error(f"STL file not found: {path}")
        return None
    except Exception as exc:
        logger.error(f"Error reading STL file {path}: {exc}")
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

DOWNLOAD_CACHE = {}


def do_revolution(sid, igs_path, num_tiles, tile_params, grading_params):
    print("Do MSDLLMSFromRevolution")
    download_token = str(uuid.uuid4())

    new_folder = os.path.join(os.getcwd(), LAST_RESULTS_DIR, sid)
    os.makedirs(new_folder, exist_ok=True)

    out_igs = os.path.join(new_folder, "MSRevolv.igs").encode('ascii')
    out_stl = os.path.join(new_folder, "MSRevolv.stl").encode('ascii')

    print(f"  Num_Tiles : {num_tiles[0]} {num_tiles[1]} {num_tiles[2]}")
    print(f"  TileParams: {tile_params[0]} {tile_params[1]} {tile_params[2]}")

    _dll_from_revolution(
        igs_path.encode('ascii'),
        num_tiles, grading_params,
        MSDLL_TILE_CROSS,
        tile_params,
        out_igs, out_stl,
    )

    stl_content = read_ascii_stl_file(out_stl.decode('ascii'))
    DOWNLOAD_CACHE[download_token] = {
        'sid': sid, 'out_stl': 'MSRevolv.stl', 'out_igs': 'MSRevolv.igs'
    }
    print("-- Done MSDLLMSFromRevolution")
    return download_token, stl_content


def do_extrusion(sid, igs_path, num_tiles, tile_params, grading_params):
    print(f"Do MSDLLMSFromExtrusion  sid={sid}  igs={igs_path}")
    download_token = str(uuid.uuid4())

    new_folder = os.path.join(os.getcwd(), LAST_RESULTS_DIR, sid)
    os.makedirs(new_folder, exist_ok=True)

    out_igs = os.path.join(new_folder, "MSExtrd.igs").encode('ascii')
    out_stl = os.path.join(new_folder, "MSExtrd.stl").encode('ascii')

    print(f"  num_tiles : {num_tiles[0]} {num_tiles[1]} {num_tiles[2]}")
    print(f"  tile_params: {tile_params[0]} {tile_params[1]} {tile_params[2]}")

    result = _dll_from_extrusion(
        igs_path.encode('ascii') if isinstance(igs_path, str) else igs_path,
        10.0,
        num_tiles, grading_params,
        MSDLL_TILE_DIAGONAL,
        tile_params,
        out_igs, out_stl,
    )

    if result == "First input file is not holding a polynomial Bezier surface.":
        logger.warning("[EXTRUSION] DLL failed — returning dummy STL")
        dummy_path = os.path.join(os.path.dirname(__file__), "last_results", "dummyResult.stl")
        stl_content = read_ascii_stl_file(dummy_path)
    else:
        stl_content = read_ascii_stl_file(out_stl.decode('ascii'))

    DOWNLOAD_CACHE[download_token] = {
        'sid': sid, 'out_stl': 'MSExtrd.stl', 'out_igs': 'MSExtrd.igs'
    }
    # for c in DOWNLOAD_CACHE:
    #     print(f"cache: {c}")
    print("-- Done MSDLLMSFromExtrusion")
    return download_token, stl_content


def do_Ruling(sid, igs_path, num_tiles, tile_params, grading_params):
    download_token = str(uuid.uuid4())

    new_folder = os.path.join(os.getcwd(), LAST_RESULTS_DIR, sid)
    os.makedirs(new_folder, exist_ok=True)

    out_igs = os.path.join(new_folder, "MSRuled.igs").encode('ascii')
    out_stl = os.path.join(new_folder, "MSRuled.stl").encode('ascii')

    srf_path = igs_path.encode('ascii')
    print(f"  Num_Tiles : {num_tiles[0]} {num_tiles[1]} {num_tiles[2]}")
    print(f"  TileParams: {tile_params[0]} {tile_params[1]} {tile_params[2]}")

    _dll_from_ruling(
        srf_path, srf_path,
        num_tiles, grading_params,
        MSDLL_TILE_CROSS_DIAGONAL,
        tile_params,
        out_igs, out_stl,
    )

    stl_content = read_ascii_stl_file(out_stl.decode('ascii'))
    DOWNLOAD_CACHE[download_token] = {
        'sid': sid, 'out_stl': 'MSRuled.stl', 'out_igs': 'MSRuled.igs'
    }
    print("-- Done MSDLLMSFromRuling")
    return download_token, stl_content


def calculate_tile(tile_params, graded, tile_type_str):
    t_recv = time.time()
    tile_type_int = TILE_TYPE_MAP.get(tile_type_str)

    tile_filename_map = {
        MSDLL_TILE_DIAGONAL:       'TileDiagnoal.stl',
        MSDLL_TILE_CROSS:          'TileCross.stl',
        MSDLL_TILE_CROSS_DIAGONAL: 'TileCrossDiagnoal.stl',
    }
    stl_filename = tile_filename_map.get(tile_type_int)
    if stl_filename is None:
        print(f"Unknown tile type: {tile_type_str}")
        return

    stl_tile_path = os.path.join(os.getcwd(), LAST_TILES_RESULTS_DIR, stl_filename)
    _dll_get_tile(tile_type_int, tile_params, graded, stl_tile_path.encode('utf-8'))

    t_processed = time.time()
    if os.path.exists(stl_tile_path):
        stl_content = read_ascii_stl_file(stl_tile_path)
        try:
            buf = BytesIO()
            with gzip.GzipFile(fileobj=buf, mode='wb') as gz:
                gz.write(stl_content.encode('utf-8'))
            compressed = buf.getvalue()
        except Exception:
            logger.exception("Tile compression failed")
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
        emit('result', {
            'filename': stl_tile_path,
            'kind': 'tile_stl',
            'stl_gz_b64': compressed_b64,
            'timings': timings,
        })
    else:
        print("Error: Tile STL file not found on disk.")


# ──────────────────────────────────────────────────────────────────────────────
# Log tailing
# ──────────────────────────────────────────────────────────────────────────────

log_thread = None
thread_stop_event = False


def get_initial_log_content(file_path, num_lines=50):
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
            return [line.strip() for line in lines[-num_lines:]]
    except FileNotFoundError:
        return [f"Error: Log file '{LOG_FILE_NAME}' not found."]
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
        print(f"Log follower error: {exc}")


# ──────────────────────────────────────────────────────────────────────────────
# SocketIO event handlers
# ──────────────────────────────────────────────────────────────────────────────

connected_clients = {}
client_state = {}


def worker_loop(state):
    print("Worker started")
    while True:
        state["event"].wait()
        state["event"].clear()
        tile_type = state["tile_type"]
        p1, p2, p3 = state["p1"], state["p2"], state["p3"]
        print(f"Processing value: {tile_type} {p1} {p2} {p3}")


@socketio.on('connect')
def on_connect():
    global log_thread
    logger.info('Client connected')
    sid = request.sid

    state = {
        "sid": sid,
        "tile_type": None, "p1": None, "p2": None, "p3": None,
        "event": threading.Event(),
    }
    t = threading.Thread(target=worker_loop, args=(state,), daemon=True)
    t.start()
    client_state[sid] = state

    ip_address = request.environ.get('REMOTE_ADDR')
    unique_file_id = str(uuid.uuid4())
    connected_clients[sid] = {
        'sid': sid,
        'ip_address_reported': ip_address,
        'unique_file_id': unique_file_id,
    }
    print(f"Client connected. SID: {sid}")

    for line in get_initial_log_content(LOG_FILE_NAME):
        emit('log_update', {'data': line})

    if log_thread is None:
        log_thread = socketio.start_background_task(
            target=follow_log, file_name=LOG_FILE_NAME, socketio_instance=socketio
        )


def clean_session(sid):
    connected_clients.pop(sid, None)
    folder = os.path.join(os.getcwd(), LAST_RESULTS_DIR, sid)
    try:
        if os.path.exists(folder):
            shutil.rmtree(folder)
    except Exception as exc:
        print(f"Error removing directory {folder}: {exc}")


@socketio.on('disconnect')
def on_disconnect():
    logger.info('Client disconnected')
    clean_session(request.sid)


@socketio.on('calculate')
def handle_calculate(data):
    sid = request.sid
    t_start = time.time()
    logger.info(f"[CALC] == calculate request  sid={sid} ==")

    client_ts = data.get('client_ts')
    filename  = data.get('filename', 'uploaded.igs')
    args      = data.get('args', {})

    tile_type = args.get('tileType')
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
        logger.error(f"[CALC] Bad numeric argument: {exc}")
        emit('error', {'msg': f'Invalid numeric argument: {exc}'})
        return

    tile_type_int = TILE_TYPE_MAP.get(tile_type)
    logger.info(f"[CALC]   filename   : {filename}")
    logger.info(f"[CALC]   tileType   : {tile_type!r}  ->  int {tile_type_int}")
    logger.info(f"[CALC]   num_tiles  : ({nt1}, {nt2}, {nt3})")
    logger.info(f"[CALC]   graded     : ({g1}, {g2})")
    logger.info(f"[CALC]   tile_params: ({p1}, {p2}, {p3})")

    if tile_type_int is None:
        logger.error(f"[CALC] Unknown tileType: {tile_type!r}")
        emit('error', {'msg': f'Unknown tileType: {tile_type}'})
        return

    safe_base      = os.path.splitext(os.path.basename(filename))[0] or "upload"
    igs_disk_path  = os.path.abspath(os.path.join(DATA_DIR, f"{safe_base}.igs"))
    json_disk_path = os.path.abspath(os.path.join(DATA_DIR, f"{safe_base}.json"))

    if not os.path.exists(igs_disk_path):
        logger.error(f"[CALC] IGS file not found on disk: {igs_disk_path}")
        emit('error', {'msg': 'IGS file not found — upload it first via convert_igs_to_stl'})
        return

    logger.info(f"[CALC] Using pre-saved IGS -> {igs_disk_path}")

    try:
        with open(json_disk_path, 'w', encoding='utf-8') as jf:
            json.dump({'filename': filename, 'args': args, 'sid': sid}, jf, indent=2)
    except OSError:
        logger.warning("[CALC] Could not save JSON metadata (non-fatal)")

    curr_num_tiles   = (c_int * 3)(nt1, nt2, nt3)
    curr_graded      = (c_double * 2)(g1, g2)
    curr_tile_params = (c_double * 3)(p1, p2, p3)

    t_dll_start = time.time()
    stl_content = download_token = None

    try:
        if tile_type_int == MSDLL_TILE_CROSS:
            logger.info("[CALC] Dispatching -> do_revolution (CROSS)")
            download_token, stl_content = do_revolution(
                sid, igs_disk_path, curr_num_tiles, curr_tile_params, curr_graded
            )
        elif tile_type_int == MSDLL_TILE_DIAGONAL:
            logger.info("[CALC] Dispatching -> do_extrusion (DIAGONAL)")
            download_token, stl_content = do_extrusion(
                sid, igs_disk_path, curr_num_tiles, curr_tile_params, curr_graded
            )
        elif tile_type_int == MSDLL_TILE_CROSS_DIAGONAL:
            logger.info("[CALC] Dispatching -> do_Ruling (CROSS_DIAGONAL)")
            download_token, stl_content = do_Ruling(
                sid, igs_disk_path, curr_num_tiles, curr_tile_params, curr_graded
            )
    except FileNotFoundError as exc:
        logger.exception(f"[CALC] DLL output file not found: {exc}")
        emit('error', {'msg': f'DLL did not produce output file: {exc}'})
        return
    except Exception as exc:
        logger.exception(f"[CALC] DLL call failed: {exc}")
        emit('error', {'msg': f'Processing error: {exc}'})
        return

    t_dll_end = time.time()

    if not stl_content:
        logger.error("[CALC] No STL content produced after DLL call")
        emit('error', {'msg': 'No output produced by DLL'})
        return

    try:
        t_comp_start = time.time()
        compressed_b64 = compress_text_to_b64_gz(stl_content)
        t_comp_end = time.time()
        comp_bytes = len(base64.b64decode(compressed_b64))
        logger.info(
            f"[CALC] Compressed: {len(stl_content):,} chars -> "
            f"{comp_bytes / 1024:.2f} KB gzip  "
            f"({(t_comp_end - t_comp_start) * 1000:.1f} ms)"
        )
    except Exception as exc:
        logger.exception(f"[CALC] Compression failed: {exc}")
        emit('error', {'msg': 'Compression failed'})
        return

    t_total = time.time() - t_start
    timings = {
        'client_to_server_ms': None if client_ts is None else (t_dll_start * 1000 - client_ts),
        'time_dll_ms':         round((t_dll_end - t_dll_start) * 1000, 1),
        'time_compress_ms':    round((t_comp_end - t_comp_start) * 1000, 1),
        'overall_ms':          round(t_total * 1000, 1),
    }

    emit('result', {
        'filename_reduced': safe_base + '_reduced.stl',
        'kind':             'model_stl',
        'stl_gz_b64':       compressed_b64,
        'timings':          timings,
        'args_echo':        args,
        'filename':         filename,
        'download_token':   download_token,
    })

    logger.info(
        f"[CALC] == Done  overall={timings['overall_ms']} ms  "
        f"dll={timings['time_dll_ms']} ms  "
        f"compress={timings['time_compress_ms']} ms =="
    )

@socketio.on('calculate_tile')
def handle_calculate_tile(data):
    p1, p2, p3 = data['values']
    tile_type   = data['type']

    tile_params = (c_double * 3)(p1, p2, p3)
    graded      = (c_double * 2)(0.2, 1.5)

    calculate_tile(tile_params, graded, tile_type)


@app.route('/convert_igs_to_stl', methods=['POST'])
def handle_convert_igs_to_stl():
    print("Received request to convert IGS to STL")

    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    igs_file  = request.files['file']
    safe_base = os.path.splitext(os.path.basename(igs_file.filename))[0] or uuid.uuid4().hex

    try:
        igs_bytes = igs_file.read()
        igs_disk  = os.path.abspath(os.path.join(DATA_DIR, f"{safe_base}.igs"))
        stl_disk  = os.path.abspath(os.path.join(DATA_DIR, f"{safe_base}_preview.stl"))

        with open(igs_disk, 'wb') as f:
            f.write(igs_bytes)

        err = _dll_iges2stl(igs_disk.encode('ascii'), stl_disk.encode('ascii'), 0.0)
        if err:
            logger.warning(f"[IGS2STL] DLL warning: {err}")

        if not os.path.exists(stl_disk):
            return jsonify({'error': 'IGS conversion produced no output'}), 500

        with open(stl_disk, 'rb') as f:
            stl_content = f.read()

        b64_str = base64.b64encode(stl_content).decode('utf-8')
        print("IGS -> STL conversion succeeded.")
        print(f"Returning : {b64_str[0:30]}")
        return jsonify({'stl_b64': b64_str})

    except Exception as exc:
        logger.exception(f"[IGS2STL] {exc}")
        return jsonify({'error': f'Internal server error: {exc}'}), 500

# ──────────────────────────────────────────────────────────────────────────────
# HTTP routes
# ──────────────────────────────────────────────────────────────────────────────

@app.route('/')
def index():
    return render_template('index.html')


@app.route('/viewlog007')
def view_log():
    return render_template('log_view.html', log_file=LOG_FILE_NAME)


@app.route('/viewfulllog007')
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
    print(f"==== Downloading from {os.getcwd()}")
    token     = request.form.get('token')
    file_type = request.form.get('file_type')

    # if token in DOWNLOAD_CACHE:
    #     print("FOUND!")
    # else:
    #     print("NOT FOUND!!")
    output_map = DOWNLOAD_CACHE.pop(token, None)
    if output_map is None:
        logger.error(f"[DOWNLOAD] invalid/expired token: {token}")
        return jsonify({'error': 'Invalid or expired download token'}), 404

    out_folder = os.path.join(os.getcwd(), LAST_RESULTS_DIR, output_map['sid'])

    if file_type == 'stl':
        filename = output_map['out_stl']
        mimetype = 'model/stl'
    elif file_type == 'igs':
        filename = output_map['out_igs']
        mimetype = 'application/octet-stream'
    else:
        return jsonify({'error': f'Unknown file_type: {file_type}'}), 400

    file_path = os.path.join(out_folder, filename)
    if not os.path.exists(file_path):
        logger.error(f"[DOWNLOAD] file not found: {file_path}")
        return jsonify({'error': 'Result file not found'}), 404
    # print(f"Return the file in pat {file_path}, {mimetype}, {filename}")
    return send_file(file_path, mimetype=mimetype, as_attachment=True, download_name=filename)


# ──────────────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    print("Starting Flask-SocketIO server on http://localhost:5003")
    socketio.run(app, host='0.0.0.0', port=5003, allow_unsafe_werkzeug=True)