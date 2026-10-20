# main.py — Lattice website backend: Flask + SocketIO, calling MSDLL64.dll via ctypes.
import os
import argparse
import shutil
import time
import base64
import gzip
import json
import threading
import uuid
import contextlib
import logging
from datetime import datetime, timedelta
from logging.handlers import RotatingFileHandler
from io import BytesIO
from flask_cors import CORS
from dotenv import load_dotenv

from ctypes import c_int, c_double

from calc_queue import CalcQueueManager, Job
from dll_instance import DllInstance, prepare_background_dll_copy, assert_distinct_dll_instances
from dll_lane import BackgroundDllLane

from flask import Flask, render_template, send_file, jsonify, request
from flask_socketio import SocketIO, emit
from werkzeug.exceptions import HTTPException
from werkzeug.middleware.proxy_fix import ProxyFix

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

VALID_CALC_MODES = {
    CALC_MODE_RULING, 
    CALC_MODE_EXTRUSION, 
    CALC_MODE_REVOLUTION
    }

# ──────────────────────────────────────────────────────────────────────────────
# CLI args — parsed early so CORS can use --frontend-port
# Root .env supplies the default port; --port still overrides it.
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env'))
_ap = argparse.ArgumentParser(description='Lattice website backend', add_help=True)
_ap.add_argument('--port', type=int, default=int(os.environ.get('BACKEND_PORT', 5003)),
                 help='Backend listen port (default: BACKEND_PORT from .env, else 5003)')
_ap.add_argument('--host', default=os.environ.get('BACKEND_HOST', '0.0.0.0'),
                 help='Backend bind address (default: BACKEND_HOST from .env, else 0.0.0.0). '
                      'Use 127.0.0.1 behind nginx so the port is reachable only through the proxy.')
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

# Behind nginx, REMOTE_ADDR is always 127.0.0.1 — trust one hop of
# X-Forwarded-For/-Proto/-Host so logs show the real client IP. Applied after
# SocketIO() so it wraps the Socket.IO middleware too (socket handlers read
# request.environ['REMOTE_ADDR']). Without a proxy the headers are absent and
# this is a no-op.
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)


@app.errorhandler(Exception)
def handle_uncaught_http_exception(exc):
    if isinstance(exc, HTTPException):
        return exc
    sid = getattr(request, 'sid', None)
    extra = _log_extra(sid) if sid else _http_log_extra()
    logger.exception(f"[UNCAUGHT] {request.method} {request.path}", extra=extra)
    return jsonify({'error': 'Internal server error'}), 500


@socketio.on_error_default
def handle_uncaught_socketio_exception(exc):
    sid = request.sid if request else None
    logger.exception("[UNCAUGHT] socketio handler failed", extra=_log_extra(sid))


_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MAIN_DLL_PATH = os.path.join(_BASE_DIR, "gershon", "MSDLL64.dll")
MAIN_DLL_MANIFEST_PATH = MAIN_DLL_PATH + ".manifest"


def _emit_queue_event(event: str, sid: str, payload: dict) -> None:
    socketio.emit(event, payload, room=sid)


try:
    dll_main = DllInstance(MAIN_DLL_PATH, emit=_emit_queue_event)
except OSError as _exc:
    raise OSError(
        f"Failed to load DLL at '{MAIN_DLL_PATH}'. "
        f"Check that the file exists and all dependencies are present. "
        f"Original error: {_exc}"
    ) from _exc

_BACKGROUND_DLL_DEST_DIR = os.path.join(os.getcwd(), 'tmp', 'dll_background_instance')
try:
    _background_dll_path = prepare_background_dll_copy(
        MAIN_DLL_PATH, MAIN_DLL_MANIFEST_PATH,
        dest_dir=_BACKGROUND_DLL_DEST_DIR,
    )
except OSError as _exc:
    raise OSError(
        f"Failed to prepare the background DLL copy at '{_BACKGROUND_DLL_DEST_DIR}'. "
        f"This can happen if another instance of this server is already "
        f"running and still has that file open — check for a leftover "
        f"python main.py process and stop it, then retry. "
        f"Original error: {_exc}"
    ) from _exc
dll_background = DllInstance(_background_dll_path, emit=_emit_queue_event)
assert_distinct_dll_instances(dll_main, dll_background)
dll_background_lane = BackgroundDllLane()

LOGFILE               = 'lattice.log'
DATA_DIR              = 'client_data'
LAST_RESULTS_DIR      = 'last_results'
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
        ('user_agent', 'user_agent'),
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

def read_obj_file(path):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return f.read()
    except FileNotFoundError:
        logger.warning(f"OBJ file not found: {path}")
        return None
    except Exception as exc:
        logger.exception(f"Error reading OBJ file {path}: {exc}")
        return None


def compress_text_to_b64_gz(text: str) -> str:
    buf = BytesIO()
    with gzip.GzipFile(fileobj=buf, mode='wb') as gz:
        gz.write(text.encode('utf-8'))
    return base64.b64encode(buf.getvalue()).decode('ascii')


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


def _save_original_upload(sid: str, filename: str, raw_bytes: bytes) -> str:
    """Persist an uploaded surface file under client_data/<sid>/, keyed by a
    UUID prefix so repeat uploads in one session (or Ruling mode's two
    files) never collide. Returns the path a log line can point at, so a
    calculation can be reproduced later from its exact original input.

    `filename` is client-supplied and untrusted — reduced to a single path
    component before use, and the final path is verified to still resolve
    inside session_dir before writing, so a crafted name (e.g. containing
    `../`) can never escape client_data/<sid>/."""
    session_dir = os.path.realpath(os.path.join(DATA_DIR, sid))
    os.makedirs(session_dir, exist_ok=True)
    base = os.path.basename(str(filename).replace('\\', '/').split('/')[-1]).strip()
    if not base or base in ('.', '..'):
        base = 'upload.igs'
    saved_name = f"{uuid.uuid4().hex}_{base}"
    saved_path = os.path.join(session_dir, saved_name)
    if os.path.commonpath([session_dir, os.path.realpath(saved_path)]) != session_dir:
        raise OSError(f"refusing to write outside session dir: {saved_path!r}")
    with open(saved_path, 'wb') as f:
        f.write(raw_bytes)
    return saved_path


DOWNLOAD_CACHE = {}


def do_revolution(dll_instance, out_folder, igs_path, num_tiles, tile_params, grading_params, tile_type_int):
    out_igs = os.path.join(out_folder, "MSRevolv.igs").encode('ascii')
    out_obj = os.path.join(out_folder, "MSRevolv.obj").encode('ascii')
    dll_error = dll_instance.from_revolution(
        igs_path.encode('ascii'),
        num_tiles, grading_params,
        tile_type_int,
        tile_params,
        out_igs, out_obj,
    )
    if dll_error:
        raise RuntimeError(dll_error)
    obj_content = read_obj_file(out_obj.decode('ascii'))
    return obj_content, "MSRevolv.obj", "MSRevolv.igs"


def do_extrusion(dll_instance, out_folder, igs_path, num_tiles, tile_params, grading_params, tile_type_int, extrude_length=10.0):
    out_igs = os.path.join(out_folder, "MSExtrd.igs").encode('ascii')
    out_obj = os.path.join(out_folder, "MSExtrd.obj").encode('ascii')
    dll_error = dll_instance.from_extrusion(
        igs_path.encode('ascii'),
        extrude_length,
        num_tiles, grading_params,
        tile_type_int,
        tile_params,
        out_igs, out_obj,
    )
    if dll_error:
        raise RuntimeError(dll_error)

    obj_content = read_obj_file(out_obj.decode('ascii'))
    return obj_content, "MSExtrd.obj", "MSExtrd.igs"


def do_Ruling(dll_instance, out_folder, igs_path, igs_path2, num_tiles, tile_params, grading_params, tile_type_int):
    out_igs = os.path.join(out_folder, "MSRuled.igs").encode('ascii')
    out_obj = os.path.join(out_folder, "MSRuled.obj").encode('ascii')

    dll_error = dll_instance.from_ruling(
        igs_path.encode('ascii'), igs_path2.encode('ascii'),
        num_tiles, grading_params,
        tile_type_int,
        tile_params,
        out_igs, out_obj,
    )
    if dll_error:
        raise RuntimeError(dll_error)

    obj_content = read_obj_file(out_obj.decode('ascii'))
    return obj_content, "MSRuled.obj", "MSRuled.igs"


CALC_MODE_DISPATCH = {
    CALC_MODE_REVOLUTION: do_revolution,
}



def calculate_tile(dll_instance, tile_params, graded, tile_type_str, tolerance, sid):
    t_recv = time.time()
    tile_type_int = TILE_TYPE_MAP.get(tile_type_str)
    if tile_type_int is None:
        logger.error(f"[TILE] Unknown tile type: {tile_type_str}", extra=_log_extra(sid))
        return

    obj_tile_path = os.path.join(os.getcwd(), TMP_DIR, f"tile_{uuid.uuid4().hex}.obj")
    
    # Actual calculation
    dll_error = dll_instance.get_tile(tile_type_int, tile_params, graded, tolerance, obj_tile_path.encode('utf-8'))
    
    if dll_error:
        emit('error', {'msg': f'Tile generation failed: {dll_error}'})
        return

    t_processed = time.time()
    if not os.path.exists(obj_tile_path):
        logger.error(f"[TILE] OBJ not found: {obj_tile_path}", extra=_log_extra(sid))
        emit('error', {'msg': 'Tile generation produced no output'})
        return

    try:
        obj_content = read_obj_file(obj_tile_path)
        try:
            buf = BytesIO()
            with gzip.GzipFile(fileobj=buf, mode='wb') as gz:
                gz.write(obj_content.encode('utf-8'))
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
            f"  t=({tolerance:.2f})"
            f"  {timings['overall_ms']:.0f}ms",
            extra=_log_extra(sid),
        )
        emit('result', {
            'filename': 'tile.obj',
            'kind': 'tile_obj',
            'obj_gz_b64': compressed_b64,
            'timings': timings,
        })
    finally:
        try:
            os.remove(obj_tile_path)
        except OSError:
            logger.warning(f"[TMP] failed to remove temp file: {obj_tile_path}")


# ──────────────────────────────────────────────────────────────────────────────
# Log tailing
# ──────────────────────────────────────────────────────────────────────────────

log_thread = None
calc_log_thread = None
thread_stop_event = False


def get_initial_log_content(file_path, num_lines=150):
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
            return [line.strip() for line in lines[-num_lines:]]
    except FileNotFoundError:
        return [f"Error: Log file '{file_path}' not found."]
    except Exception as exc:
        return [f"An error occurred reading initial log: {exc}"]


LOG_HISTORY_MAX_LINES = 20000


def _rotated_log_paths(base_path):
    """Files backing one logical log, oldest to newest: RotatingFileHandler
    rolls the active file to `base_path.1` and shifts older backups up
    (`.1` -> `.2`, etc.), so `.1` is the newest backup and the highest
    numbered one present is the oldest. `base_path` itself (the file
    currently being written) is always the newest and comes last. A log
    with no rotation (e.g. calc_log, a plain FileHandler) just yields
    `[base_path]`."""
    backups = []
    n = 1
    while os.path.exists(f"{base_path}.{n}"):
        backups.append(f"{base_path}.{n}")
        n += 1
    paths = list(reversed(backups))
    if os.path.exists(base_path):
        paths.append(base_path)
    return paths


def _parse_log_ts(ts_str):
    try:
        return datetime.strptime(ts_str, '%Y-%m-%d %H:%M:%S,%f')
    except (ValueError, TypeError):
        return None


def read_log_history(base_path, since_seconds=None, limit=LOG_HISTORY_MAX_LINES):
    """Read raw log lines from base_path and its rotated backups (oldest
    file first), optionally kept only from the last `since_seconds`
    (None = no time filter). Returns at most `limit` lines — the most
    recent ones, if more than that were found — so a big "all available"
    request can't load an unbounded amount of log into memory."""
    cutoff = datetime.now() - timedelta(seconds=since_seconds) if since_seconds else None

    lines = []
    for path in _rotated_log_paths(base_path):
        try:
            with open(path, 'r', encoding='utf-8') as f:
                for raw_line in f:
                    line = raw_line.strip()
                    if not line:
                        continue
                    if cutoff is not None:
                        try:
                            ts = _parse_log_ts(json.loads(line).get('ts', ''))
                        except (ValueError, AttributeError):
                            ts = None
                        if ts is not None and ts < cutoff:
                            continue
                    lines.append(line)
        except OSError:
            continue

    if limit is not None and len(lines) > limit:
        lines = lines[-limit:]
    return lines


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


@socketio.on('connect')
def on_connect():
    global log_thread, calc_log_thread
    sid = request.sid
    ip_address = request.environ.get('REMOTE_ADDR')

    client_state[sid] = {"current_token": None}
    connected_clients[sid] = {
        'sid': sid,
        'ip_address_reported': ip_address,
        'user_agent': request.headers.get('User-Agent', '?'),
    }
    logger.info(f'Client connected  ip={ip_address}', extra=_log_extra(sid))

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


def _client_user_agent(sid):
    return (connected_clients.get(sid) or {}).get('user_agent', '?')


def _log_extra(sid):
    return {'sid': sid, 'ip': _client_ip(sid), 'user_agent': _client_user_agent(sid)}


def _http_log_extra():
    """Like _log_extra(sid), but for a plain HTTP route with no SocketIO
    sid — reads ip/user_agent directly from the current request instead of
    looking them up in connected_clients (which only tracks socket sids)."""
    return {'sid': None, 'ip': request.remote_addr or '?', 'user_agent': request.headers.get('User-Agent', '?')}


def _rmtree_with_retry(path, attempts=5, delay=0.3):
    """shutil.rmtree can transiently fail with PermissionError on Windows
    when something else (observed: OneDrive sync) still holds a handle on
    a just-written file. Retry a few times with a short backoff before
    giving up — this is a best-effort cleanup, not a correctness-critical
    path, so a bounded retry catches the quick transient case without
    making every disconnect noticeably slower. It does NOT reliably solve
    a longer-held lock (e.g. the native DLL itself keeping a handle open)
    — that failure still propagates to the caller exactly as before, so
    it stays visible in the log rather than being silently discarded."""
    last_exc = None
    for attempt in range(attempts):
        try:
            shutil.rmtree(path)
            return
        except PermissionError as exc:
            last_exc = exc
            if attempt < attempts - 1:
                time.sleep(delay)
    raise last_exc


def clean_session(sid, token):
    connected_clients.pop(sid, None)
    upload_folder = os.path.join(os.getcwd(), DATA_DIR, sid)
    try:
        if os.path.exists(upload_folder):
            _rmtree_with_retry(upload_folder)
    except Exception as exc:
        logger.exception(f"[SESSION] cleanup failed {upload_folder}: {exc}")
    if not token:
        return
    folder = os.path.join(os.getcwd(), LAST_RESULTS_DIR, token)
    try:
        if os.path.exists(folder):
            _rmtree_with_retry(folder)
    except Exception as exc:
        logger.exception(f"[SESSION] cleanup failed {folder}: {exc}")


@socketio.on('disconnect')
def on_disconnect(reason=None):
    sid = request.sid
    logger.info(f'Client disconnected  ip={_client_ip(sid)}', extra=_log_extra(sid))
    queue_manager.remove_waiting(sid)
    token = (client_state.get(sid) or {}).get('current_token')
    if token:
        DOWNLOAD_CACHE.pop(token, None)
    client_state.pop(sid, None)
    clean_session(sid, token)


@socketio.on('calculate')
def handle_calculate(data):
    sid = request.sid
    t_received = time.time()

    client_ts    = data.get('client_ts')
    filename     = data.get('filename', 'uploaded.igs')
    args         = data.get('args', {})
    surface_b64  = data.get('surface_b64')
    surface2_b64 = data.get('surface2_b64')
    silent       = bool(data.get('silent', False))

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
        extrude_length = float(args.get('extrudeLength', 10.0))
    except (TypeError, ValueError) as exc:
        logger.exception(f"[CALC] Rejected the request — one of the tile/grading numbers wasn't valid: {exc}", extra=_log_extra(sid))
        emit('error', {'msg': f'Invalid numeric argument: {exc}'})
        return

    tile_type_int = TILE_TYPE_MAP.get(tile_type)

    logger.info(
        f"[CALC] Received a calculation request for \"{filename}\" from {_client_ip(sid)} — "
        f"{calc_mode} mode, {tile_type} tiles, grid {nt1}×{nt2}×{nt3}, "
        f"grading ({g1}, {g2}), tile shape ({p1:.2f}, {p2:.2f}, {p3:.2f}).",
        extra=_log_extra(sid),
    )

    if tile_type_int is None:
        logger.error(f"[CALC] Rejected the request — {tile_type!r} isn't a tile type this server recognizes.", extra=_log_extra(sid))
        emit('error', {'msg': f'Unknown tileType: {tile_type}'})
        return

    if calc_mode not in VALID_CALC_MODES:
        logger.error(f"[CALC] Rejected the request — {calc_mode!r} isn't a calculation mode this server recognizes.", extra=_log_extra(sid))
        emit('error', {'msg': f'Unknown calcMode: {calc_mode}'})
        return

    if not surface_b64:
        logger.error("[CALC] Rejected the request — no surface file was included.", extra=_log_extra(sid))
        emit('error', {'msg': 'No surface file provided'})
        return
    try:
        igs_bytes = base64.b64decode(surface_b64)
    except (ValueError, TypeError) as exc:
        logger.exception(f"[CALC] Rejected the request — the surface file data couldn't be decoded: {exc}", extra=_log_extra(sid))
        emit('error', {'msg': f'Invalid surface data: {exc}'})
        return

    igs_bytes2 = None
    if calc_mode == CALC_MODE_RULING:
        if not surface2_b64:
            logger.error("[CALC] Rejected the request — Ruling mode needs a second surface file, which wasn't provided.", extra=_log_extra(sid))
            emit('error', {'msg': 'Ruling mode requires a second surface file'})
            return
        try:
            igs_bytes2 = base64.b64decode(surface2_b64)
        except (ValueError, TypeError) as exc:
            logger.exception(f"[CALC] Rejected the request — the second surface file's data couldn't be decoded: {exc}", extra=_log_extra(sid))
            emit('error', {'msg': f'Invalid second surface data: {exc}'})
            return

    payload = {
        'client_ts': client_ts, 'filename': filename, 'args': args,
        'calc_mode': calc_mode, 'tile_type_int': tile_type_int,
        'nt1': nt1, 'nt2': nt2, 'nt3': nt3, 'g1': g1, 'g2': g2,
        'p1': p1, 'p2': p2, 'p3': p3, 'extrude_length': extrude_length,
        'igs_bytes': igs_bytes, 'igs_bytes2': igs_bytes2,
        't_received': t_received,
    }

    if silent:
        if not dll_background_lane.try_acquire():
            # Background lane busy — drop this preview. A newer trigger
            # (or the next debounce tick) supersedes it; never queues,
            # never surfaces any UI, never touches dll_main.
            return
        try:
            threading.Thread(
                target=_run_silent_calculate, args=(sid, payload),
                daemon=True, name=f'calc-silent-{sid}',
            ).start()
        except Exception as exc:
            dll_background_lane.release()
            logger.exception(f"[CALC] failed to start silent-calculate thread: {exc}", extra=_log_extra(sid))
        return

    # Only a real (non-silent) calculation's inputs are worth keeping —
    # this matches "files uploaded for calculation," not every drag-in or
    # background preview. Saved BEFORE enqueue so the worker thread (which
    # can start reading `payload` the instant enqueue() returns) always
    # sees the final saved_input_paths — never a race where it dequeues
    # before this key is set. If the request turns out to be rejected
    # (queue full), whatever was just saved is deleted immediately below,
    # so a rejected request never leaves an orphan file either. Errors
    # here degrade traceability, never the calculation itself.
    saved_input_paths = []
    try:
        saved_input_paths.append(_save_original_upload(sid, filename, igs_bytes))
        if igs_bytes2 is not None:
            base, ext = os.path.splitext(filename)
            filename2 = f"{base}_surface2{ext or '.igs'}"
            saved_input_paths.append(_save_original_upload(sid, filename2, igs_bytes2))
    except OSError as exc:
        logger.warning(f"[CALC] Couldn't save a copy of the uploaded file for the audit trail (continuing anyway): {exc}", extra=_log_extra(sid))
    payload['saved_input_paths'] = saved_input_paths

    accepted = queue_manager.enqueue(sid, payload, silent=False)
    if not accepted:
        for p in saved_input_paths:
            try:
                os.remove(p)
            except OSError:
                pass
        socketio.emit('queue_rejected', {
            'message': 'Site is too busy right now. Please wait a few minutes and try again.',
            'silent': False,
        }, room=sid)


def _run_calculate_dll_phase(dll_instance, payload: dict, sid: str) -> dict | None:
    """The exclusive part of a calculate request: builds the ctypes args
    and calls the DLL. Emits its own error and returns None on failure.
    Callers release their own lane's DLL slot immediately after this
    returns — nothing below this function touches the DLL."""
    p = payload
    filename       = p['filename']
    calc_mode      = p['calc_mode']
    tile_type_int  = p['tile_type_int']
    nt1, nt2, nt3  = p['nt1'], p['nt2'], p['nt3']
    g1, g2         = p['g1'], p['g2']
    p1, p2, p3     = p['p1'], p['p2'], p['p3']
    extrude_length = p['extrude_length']
    igs_bytes      = p['igs_bytes']
    igs_bytes2     = p['igs_bytes2']

    curr_num_tiles   = (c_int * 3)(nt1, nt2, nt3)
    curr_graded      = (c_double * 2)(g1, g2)
    curr_tile_params = (c_double * 3)(p1, p2, p3)
    inputs_desc = f"{len(igs_bytes)} bytes" if igs_bytes2 is None else f"{len(igs_bytes)}+{len(igs_bytes2)} bytes"
    logger.debug(f"[CALC] Handing the surface ({inputs_desc}) to the native lattice engine…", extra=_log_extra(sid))

    new_token  = str(uuid.uuid4())
    out_folder = os.path.join(os.getcwd(), LAST_RESULTS_DIR, new_token)
    os.makedirs(out_folder, exist_ok=True)

    t_dll_start = time.time()
    dll_instance.set_current_sid(sid)
    try:
        logger.info(
            f"[CALC] Invoking the native engine for \"{filename}\" ({calc_mode} mode). "
            f"Original file(s): {p.get('saved_input_paths', [])}",
            extra=_log_extra(sid),
        )
        with temp_igs_file(igs_bytes) as igs_path:
            if calc_mode == CALC_MODE_RULING:
                with temp_igs_file(igs_bytes2) as igs_path2:
                    obj_content, out_obj_name, out_igs_name = do_Ruling(
                        dll_instance, out_folder, igs_path, igs_path2,
                        curr_num_tiles, curr_tile_params, curr_graded, tile_type_int,
                    )
            elif calc_mode == CALC_MODE_EXTRUSION:
                obj_content, out_obj_name, out_igs_name = do_extrusion(
                    dll_instance, out_folder, igs_path, curr_num_tiles, curr_tile_params, curr_graded, tile_type_int,
                    extrude_length,
                )
            else:
                dispatch_fn = CALC_MODE_DISPATCH[calc_mode]
                obj_content, out_obj_name, out_igs_name = dispatch_fn(
                    dll_instance, out_folder, igs_path, curr_num_tiles, curr_tile_params, curr_graded, tile_type_int
                )
    except FileNotFoundError as exc:
        logger.exception(f"[CALC] The native engine finished but didn't produce the expected output file: {exc}", extra=_log_extra(sid))
        socketio.emit('error', {'msg': f'DLL did not produce output file: {exc}'}, room=sid)
        shutil.rmtree(out_folder, ignore_errors=True)
        return None
    except Exception as exc:
        logger.exception(f"[CALC] The native engine raised an error while processing \"{filename}\": {exc}", extra=_log_extra(sid))
        socketio.emit('error', {'msg': f'Processing error: {exc}'}, room=sid)
        shutil.rmtree(out_folder, ignore_errors=True)
        return None
    finally:
        dll_instance.set_current_sid(None)
    t_dll_end = time.time()
    logger.debug(f"[CALC] Native engine finished in {round((t_dll_end - t_dll_start) * 1000)}ms.", extra=_log_extra(sid))

    if not obj_content:
        logger.error("[CALC] The native engine returned successfully but produced no geometry.", extra=_log_extra(sid))
        socketio.emit('error', {'msg': 'No output produced by DLL'}, room=sid)
        shutil.rmtree(out_folder, ignore_errors=True)
        return None

    return {
        'obj_content': obj_content, 'out_obj_name': out_obj_name, 'out_igs_name': out_igs_name,
        'out_folder': out_folder, 'new_token': new_token,
        't_dll_start': t_dll_start, 't_dll_end': t_dll_end,
    }


def _finish_calculate(payload: dict, sid: str, dll_result: dict) -> None:
    """The non-exclusive tail of a calculate request: disconnect checks,
    compression, DOWNLOAD_CACHE bookkeeping, the result emit. Deliberately
    never touches the DLL — safe to run on its own thread, in parallel
    with the *next* DLL call on either lane. Must use explicit room=sid
    emits (no implicit request context on a spawned thread)."""
    try:
        client_ts          = payload['client_ts']
        filename           = payload['filename']
        args               = payload['args']
        t_received         = payload['t_received']
        saved_input_paths  = payload.get('saved_input_paths', [])

        obj_content  = dll_result['obj_content']
        out_obj_name = dll_result['out_obj_name']
        out_igs_name = dll_result['out_igs_name']
        out_folder   = dll_result['out_folder']
        new_token    = dll_result['new_token']
        t_dll_start  = dll_result['t_dll_start']
        t_dll_end    = dll_result['t_dll_end']
        t_start      = t_dll_start

        # The client may have disconnected while this job was queued/running.
        # Nothing will ever redeem this token — discard the result rather
        # than leaking a last_results/<token>/ folder and a DOWNLOAD_CACHE entry.
        if sid not in connected_clients:
            logger.info("[CALC] The browser disconnected while this was still running — discarding the result, nobody's left to receive it.", extra=_log_extra(sid))
            shutil.rmtree(out_folder, ignore_errors=True)
            return

        logger.debug("[CALC] Compressing the result for transfer…", extra=_log_extra(sid))
        try:
            t_comp_start = time.time()
            compressed_b64 = compress_text_to_b64_gz(obj_content)
            t_comp_end = time.time()
            comp_kb = len(base64.b64decode(compressed_b64)) / 1024
            socketio.emit('update', {'type': 'progress_sending'}, room=sid)
            logger.debug(f"[CALC] Compressed down to {comp_kb:.0f} KB.", extra=_log_extra(sid))
        except Exception as exc:
            logger.exception(f"[CALC] Compressing the result failed: {exc}", extra=_log_extra(sid))
            socketio.emit('error', {'msg': 'Compression failed'}, room=sid)
            shutil.rmtree(out_folder, ignore_errors=True)
            return

        # The client may also have disconnected *during* compression (which
        # can take several seconds for large outputs) — re-check right
        # before registering the download, not just before compression, or
        # we'd leak a DOWNLOAD_CACHE entry and a last_results/<token>/
        # folder that nothing will ever redeem.
        if sid not in connected_clients:
            logger.info("[CALC] The browser disconnected while compressing the result — discarding it, nobody's left to receive it.", extra=_log_extra(sid))
            shutil.rmtree(out_folder, ignore_errors=True)
            return

        # Success — register the new result and retire the previous one for this session.
        DOWNLOAD_CACHE[new_token] = {'sid': sid, 'out_obj': out_obj_name, 'out_igs': out_igs_name}
        old_token = client_state.get(sid, {}).get('current_token')
        if old_token and old_token != new_token:
            DOWNLOAD_CACHE.pop(old_token, None)
            shutil.rmtree(os.path.join(os.getcwd(), LAST_RESULTS_DIR, old_token), ignore_errors=True)
        if sid in client_state:
            client_state[sid]['current_token'] = new_token

        t_total = time.time() - t_start
        timings = {
            'client_to_server_ms': None if client_ts is None else (t_received * 1000 - client_ts),
            'time_dll_ms':         round((t_dll_end - t_dll_start) * 1000),
            'time_compress_ms':    round((t_comp_end - t_comp_start) * 1000),
            'overall_ms':          round(t_total * 1000),
        }

        socketio.emit('result', {
            'filename_reduced': os.path.splitext(os.path.basename(filename))[0] + '_reduced.obj',
            'kind':             'model_obj',
            'obj_gz_b64':       compressed_b64,
            'timings':          timings,
            'args_echo':        args,
            'filename':         filename,
            'download_token':   new_token,
            'saved_input_paths': saved_input_paths,
        }, room=sid)

        logger.info(
            f"[CALC] Done — sent \"{filename}\" back to the browser "
            f"({comp_kb:.0f} KB, {timings['overall_ms']}ms total: "
            f"{timings['time_dll_ms']}ms engine + {timings['time_compress_ms']}ms compression, "
            f"token={new_token}). Original file(s): {saved_input_paths}",
            extra=_log_extra(sid),
        )
    except Exception:
        # This runs on its own thread — an uncaught exception here would
        # otherwise vanish silently instead of failing the request visibly.
        logger.exception("[CALC] Something went wrong wrapping up this calculation that wasn't caught anywhere else — see the traceback below.", extra=_log_extra(sid))


def _run_calculate_job(job: Job) -> None:
    """CalcQueueManager's run_job callback — Lane A (main queue). Runs on
    the queue's dedicated worker thread — never concurrently with another
    call to this function, and never while dll_main is otherwise in use."""
    dll_result = _run_calculate_dll_phase(dll_main, job.payload, job.sid)
    queue_manager.mark_dll_free()
    if dll_result is not None:
        threading.Thread(
            target=_finish_calculate, args=(job.payload, job.sid, dll_result),
            daemon=True, name=f'calc-finish-{job.sid}',
        ).start()


def _run_silent_calculate(sid: str, payload: dict) -> None:
    """Lane B: a silent macro-shape preview. Caller must already hold
    dll_background_lane (a successful try_acquire()) before calling this;
    releases it here, right after the DLL phase, before the (potentially
    slow) finish phase."""
    try:
        dll_result = _run_calculate_dll_phase(dll_background, payload, sid)
    finally:
        dll_background_lane.release()
    if dll_result is not None:
        _finish_calculate(payload, sid, dll_result)


queue_manager = CalcQueueManager(run_job=_run_calculate_job, emit=_emit_queue_event)
queue_manager.start()


@socketio.on('calculate_tile')
def handle_calculate_tile(data):
    logger.debug("[CALCULATE_TILE] request received", extra=_log_extra(request.sid))
    try:
        p1, p2, p3 = data['values']
        tile_type   = data['type']
        tile_params = (c_double * 3)(p1, p2, p3)
        graded1, graded2   = data.get('graded', [1, 1])
        graded  = (c_double * 2)(graded1, graded2)
        tolerance = float(data.get('tolerance', 0.0))

        sid = request.sid
        if not dll_background_lane.try_acquire():
            # Background lane busy with someone else's silent/tile/upload
            # work — skip silently rather than queue or block; the next
            # scrub tick, or the moment the lane frees up, produces a
            # fresh preview normally. Never affected by dll_main.
            return
        dll_background.set_current_sid(sid)
        try:
            calculate_tile(dll_background, tile_params, graded, tile_type, tolerance, sid)
        finally:
            dll_background.set_current_sid(None)
            dll_background_lane.release()
    except Exception as exc:
        logger.exception(f"[TILE] bad request: {exc}", extra={'sid': request.sid})
        emit('error', {'msg': f'Bad tile request: {exc}'})


@app.route('/convert_igs_to_obj', methods=['POST'])
def handle_convert_igs_to_obj():
    logger.debug("[IGS2OBJ] request received", extra=_http_log_extra())
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    igs_bytes = request.files['file'].read()
    tolerance = float(request.form.get('tolerance', 0.0))

    # This route hits the same DLL as calculate_tile / silent calculate (on
    # every file upload, potentially twice concurrently in ruling mode), so
    # it goes through the same background lane. Unlike calculate_tile, a
    # dropped request here is user-visible (the upload just fails), so it
    # waits briefly for the lane rather than skipping silently. No SocketIO
    # request.sid exists for a plain HTTP POST, so dll_background's current
    # sid is deliberately left untouched — its progress callbacks' `if not
    # self._current_sid: return` guard makes that a safe no-op.
    if not dll_background_lane.acquire_blocking(timeout=30.0):
        logger.warning("[IGS2OBJ] DLL busy — timed out waiting for the background lane")
        return jsonify({'error': 'Server busy, please try again shortly'}), 503

    try:
        try:
            with temp_igs_file(igs_bytes) as igs_path:
                obj_path = igs_path[:-4] + '_preview.obj'
                t_igs_start = time.time()
                err = dll_background.iges2obj(igs_path.encode('ascii'),
                                              obj_path.encode('ascii'),
                                              tolerance)
                t_igs_ms = round((time.time() - t_igs_start) * 1000)
                if err:
                    logger.warning(f"[IGS2OBJ] DLL warning: {err}")
                    return jsonify({'error': err or 'IGS conversion failed', 'message' : err or 'IGS conversion failed'}), 500
                if not os.path.exists(obj_path):
                    logger.warning(f"[IGS2OBJ] DLL warning: no file, {err}")
                    return jsonify({'error': err or 'IGS conversion produced no output'}), 500

                try:
                    with open(obj_path, 'rb') as f:
                        obj_content = f.read()
                finally:
                    try:
                        os.remove(obj_path)
                    except OSError:
                        logger.warning(f"[TMP] failed to remove temp file: {obj_path}")

            b64_str = base64.b64encode(obj_content).decode('utf-8')
            logger.info(f"[IGS2OBJ] {len(obj_content) // 1024}KB  {t_igs_ms}ms")
            response = {'obj_b64': b64_str}
            if err:
                response['warning'] = err
            return jsonify(response)

        except Exception as exc:
            logger.exception(f"[IGS2OBJ] {exc}")
            return jsonify({'error': f'Internal server error: {exc}'}), 500
    finally:
        dll_background_lane.release()


def _validate_saved_input_paths(raw_paths) -> list:
    """`saved_input_paths` round-trips server -> browser -> server in the
    /log-calculation POST; the browser is not a trusted source for what
    ends up in the permanent calc_log/log.jsonl audit record. Keep only
    entries that look like paths this server itself would have produced:
    a list of at most 2 short strings, each resolving inside DATA_DIR.

    _save_original_upload returns realpath'd absolute paths, so containment
    must be checked by resolving each candidate the same way (a naive
    p.startswith(DATA_DIR) string check would reject every real path, since
    DATA_DIR itself is a relative name like 'client_data')."""
    if not isinstance(raw_paths, list):
        return []
    data_root = os.path.realpath(DATA_DIR)
    valid = []
    for p in raw_paths[:2]:
        if not (isinstance(p, str) and 0 < len(p) <= 512):
            continue
        try:
            resolved = os.path.realpath(p)
        except (OSError, ValueError):
            continue
        if os.path.commonpath([data_root, resolved]) == data_root:
            valid.append(p)
    return valid


@app.route('/log-calculation', methods=['POST'])
def handle_log_calculation():
    logger.debug("[CALC_LOG] request received", extra=_http_log_extra())
    if 'image' not in request.files:
        return jsonify({'error': 'No image provided'}), 400

    try:
        metadata = json.loads(request.form.get('metadata', '{}'))
    except (TypeError, ValueError):
        metadata = {}
    filename = metadata.get('filename', '')
    args     = metadata.get('args', {})
    raw_saved_paths = metadata.get('saved_input_paths', [])
    saved_input_paths = _validate_saved_input_paths(raw_saved_paths)

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
        f"  p=({args.get('p1')},{args.get('p2')},{args.get('p3')})"
        f"  inputs={saved_input_paths}",
        extra={
            'calc_filename': filename, 'calc_args': args, 'image': f'images/{image_name}',
        },
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
    return send_file(path, mimetype='image/png', max_age=86400)

# ──────────────────────────────────────────────────────────────────────────────
# HTTP routes
# ──────────────────────────────────────────────────────────────────────────────

@app.route('/')
def index():
    # The UI is the React app in react_frontend/ (served by Vite in dev, nginx
    # in production); this backend root is just a health check.
    return jsonify({'service': 'lattice-backend', 'status': 'ok'})


@app.route('/viewlog')
def view_log():
    return render_template('log_view.html', log_file=LOG_FILE_NAME)


@app.route('/viewfulllog')
def view_full_log():
    return render_template('full_log_view.html', log_file=LOG_FILE_NAME)


LOG_HISTORY_FILES = {
    'main': LOG_FILE_NAME,
    'calc': CALC_LOG_FILE,
}


@app.route('/log-history')
def log_history():
    """Backs the log viewer's history filter. ?file=main|calc picks which
    log (the backend's own, or the calculation-history log); ?since=<secs>
    limits it to the last that many seconds, or ?since=all / omitted for
    everything on disk (still capped — see read_log_history).

    Deliberately does not log a "request received" line like the other
    routes do: the log viewer calls this twice per history-window change
    (main + calc), and logging about a request to *view the log* would
    just add more noise to the log you're trying to read."""
    file_key = request.args.get('file', 'main')
    base_path = LOG_HISTORY_FILES.get(file_key)
    if base_path is None:
        return jsonify({'error': f'Unknown file: {file_key!r}. Expected one of {list(LOG_HISTORY_FILES)}.'}), 400

    since_param = request.args.get('since', '').strip()
    since_seconds = None
    if since_param and since_param != 'all':
        try:
            since_seconds = int(since_param)
            if since_seconds <= 0:
                raise ValueError
        except ValueError:
            return jsonify({'error': f'Invalid since value: {since_param!r} (expected a positive integer of seconds, or "all")'}), 400

    lines = read_log_history(base_path, since_seconds=since_seconds)
    return jsonify({'lines': lines})


@app.route('/download-results', methods=['POST'])
def download_results():
    logger.debug("[DOWNLOAD] request received", extra=_http_log_extra())
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

    if file_type == 'obj':
        filename = output_map['out_obj']
        mimetype = 'model/obj'
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
    host, port = _cli_args.host, _cli_args.port
    logger.info(f"Server starting on http://{host}:{port}")
    # allow_unsafe_werkzeug: Flask-SocketIO refuses to start Werkzeug when
    # stdin isn't a TTY (scheduled task, service wrapper, nohup...). We run it
    # deliberately behind nginx, which is the production-facing server.
    socketio.run(app, host=host, port=port, debug=False, use_reloader=False,
                 allow_unsafe_werkzeug=True)