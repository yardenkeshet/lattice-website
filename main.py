# app.py
import os
import shutil
import sys
import time
import base64
import gzip
import json
from threading import Thread
import threading

import logging
from logging.handlers import RotatingFileHandler

from io import BytesIO
import io
import zipfile

#pip install flask flask-socketio
from flask import Flask, render_template, send_file, jsonify, request, session, Response, redirect, url_for
from flask_socketio import SocketIO, emit

#
# =====     For lattice
#
import ctypes, struct
from ctypes import c_void_p, c_char_p, c_int, c_double, POINTER, c_int32, create_string_buffer, cast, string_at
import os

#
# =====     Python lattice wrapp DLL
#
import lattice as lt
from lattice import (MSDLL_TILE_CROSS, MSDLL_TILE_DIAGONAL, MSDLL_TILE_CROSS_DIAGONAL)
import gmsh

TileParams = (c_double * 3)(
    0.2,
    0.0,
    0.4
)
Graded = (c_double * 2)(
    0.2,
    1.5
)

Num_Tiles = (c_int * 3)(2, 2, 2)

#   lattice functions

def do_Ruling(sid, igs_path, num_tiles, tile_params):
    download_token = str(uuid.uuid4())

    # Prepare inputs
    srf1_path = igs_path.encode('ascii')
    srf2_path = igs_path.encode('ascii') # Note: For ruling we might need two different files, but task says "recieve a igs file"
    
    print(f" Num_Tiles : {num_tiles[0]} {num_tiles[1]} {num_tiles[2]}")
    print(f" TileParams : {tile_params[0]} {tile_params[1]} {tile_params[2]}")

    tile_type = MSDLL_TILE_CROSS_DIAGONAL

    new_folder = os.path.join(os.getcwd(), LAST_RESULTS_DIR, sid)
    os.makedirs(new_folder, exist_ok=True)

    out_igs = os.path.join(new_folder, "MSRuled.igs")
    igs = out_igs.encode('ascii')
    out_stl = os.path.join(new_folder, "MSRuled.stl")
    stl = out_stl.encode('ascii')

    # Call function
    result = lt.MSDLLMSFromRuling(
        srf1_path,
        srf2_path,
        num_tiles,
        Graded,
        tile_type,
        tile_params,
        igs,
        stl
    )

    print(f"Result: {result}")
    if result:
        print(f"Message: {result.decode('utf-8', errors='replace')}")

    stl_content = read_ascii_stl_file(out_stl)
    DOWNLOAD_CACHE[download_token] = {
        'sid': sid,  # <--- NEW: Store the sid for folder lookup
        'out_stl': f"MSRuled.stl",
        'out_igs': f"MSRuled.igs"
    }

    print(f" -- Done MSDLLMSFromRuling ")
    return download_token, stl_content
def do_revolution(sid, igs_path, num_tiles, tile_params):
    print(f"Do MSDLLMSFromRevolution")
    download_token = str(uuid.uuid4())

    # Input IGES file (must be bytes for c_char_p)
    srf_file = igs_path.encode('ascii')

    new_folder = os.path.join(os.getcwd(), LAST_RESULTS_DIR, sid)
    os.makedirs(new_folder, exist_ok=True)

    # Output IGES & STL (must be bytes for c_char_p)
    out_igs = os.path.join(new_folder, "MSRevolv.igs")
    igs = out_igs.encode('ascii')
    out_stl = os.path.join(new_folder, "MSRevolv.stl")
    stl = out_stl.encode('ascii')

    # Tile type
    tile_type = MSDLL_TILE_CROSS

    print(f" Num_Tiles : {num_tiles[0]} {num_tiles[1]} {num_tiles[2]}")
    print(f" TileParams : {tile_params[0]} {tile_params[1]} {tile_params[2]}")

    print("Calling DLL...")
    result = lt.MSDLLMSFromRevolution(
        srf_file,
        num_tiles,
        Graded,
        tile_type,
        tile_params,
        igs,
        stl
    )

    stl_content = read_ascii_stl_file(out_stl)
    DOWNLOAD_CACHE[download_token] = {
        'sid': sid,  # <--- NEW: Store the sid for folder lookup
        'out_stl': f"MSRevolv.stl",
        'out_igs': f"MSRevolv.igs"
    }
    print("Result:", result)
    print(f" -- Done MSDLLMSFromRevolution ")
    return download_token, stl_content

def do_extrusion(sid, igs_path, num_tiles, tile_params):
    print(f"🧮 Do MSDLLMSFromExtrusion  sid={sid}  igs={igs_path}")
    download_token = str(uuid.uuid4())

    srf_igs = igs_path.encode('ascii') if isinstance(igs_path, str) else igs_path
    extrude_length = c_double(10.0)
    tile_type = MSDLL_TILE_DIAGONAL

    new_folder = os.path.join(os.getcwd(), LAST_RESULTS_DIR, sid)
    os.makedirs(new_folder, exist_ok=True)

    out_igs = os.path.join(new_folder, "MSExtrd.igs")
    igs = out_igs.encode('ascii')
    out_stl = os.path.join(new_folder, "MSExtrd.stl")
    stl = out_stl.encode('ascii')

    print(f"  num_tiles: {num_tiles[0]} {num_tiles[1]} {num_tiles[2]}")
    print(f"  tile_params: {tile_params[0]} {tile_params[1]} {tile_params[2]}")
    print(f"  extrude_length: {extrude_length.value}")
    graded = (c_double * 2)(0.57, 0.83)

    print(f"  igs file exists: {os.path.exists(igs_path)}")
    print(f"  igs file size: {os.path.getsize(igs_path)} bytes")
    with open(igs_path, 'r', errors='replace') as f:
        print(f"  igs first line: {f.readline().strip()}")
        
    print(f"  srf_igs path: {srf_igs[:600]}")
    with open(srf_igs, 'rb') as f:
        print(f"  file content (first 200 bytes): {f.read(600)}")

    result = lt.MSDLLMSFromExtrusion(
        srf_igs,
        extrude_length,
        num_tiles,        # use the passed-in parameter, not the global
        graded,
        tile_type,
        tile_params,
        igs,
        stl
    )

    print(f"Result: {result}")

    if result== "First input file is not holding a polynomial Bezier surface.":
        logger.warning(f"[EXTRUSION] DLL failed: {result} — returning dummy STL")
        dummy_path = os.path.join(os.path.dirname(__file__), "last_results", "dummyResult.stl")
        print(f"\n {dummy_path}")
        stl_content = read_ascii_stl_file(dummy_path)

    else:
        stl_content = read_ascii_stl_file(out_stl)
    DOWNLOAD_CACHE[download_token] = {
        'sid': sid,
        'out_stl': 'MSExtrd.stl',
        'out_igs': 'MSExtrd.igs'
    }

    print(f" -- Done MSDLLMSFromExtrusion")
    # print(f" -- output {stl_content}")
    return download_token, stl_content

def do_GetTile():

    stl_path = b"data\\TileDiagonal.stl"
    print(f"Call MSDLLGetTile MSDLL_TILE_DIAGONAL")
    err = lt.MSDLLGetTile(
        MSDLL_TILE_DIAGONAL,
        TileParams,
        Graded,
        stl_path
    )
    print(f"---MSDLL_TILE_DIAGONAL ret = {err}")

    TileParams[0] = 0.2
    TileParams[1] = 0.0
    stl_path = b"data\\TileCross.stl"
    print(f"Call MSDLLGetTile MSDLL_TILE_CROSS")
    err = lt.MSDLLGetTile(
        MSDLL_TILE_CROSS,
        TileParams,
        Graded,
        stl_path
    )
    print(f"---MSDLL_TILE_CROSS ret = {err}")

    TileParams[0] = 0.05
    TileParams[1] = 3.5
    stl_path = b"data\\TileCrossDiagonal.stl"
    print(f"Call MSDLLGetTile MSDLL_TILE_CROSS_DIAGONAL")
    err = lt.MSDLLGetTile(
        MSDLL_TILE_CROSS_DIAGONAL,
        TileParams,
        Graded,
        stl_path
    )
    print(f"---MSDLL_TILE_CROSS_DIAGONAL ret = {err}")

#===================
# Handlw queue size one for tile calulation
def worker_loop(state):
    print("Worker started")

    while True:
        # Wait until a value arrives
        state["event"].wait()
        state["event"].clear()

        # Snapshot the latest value
        tile_type = state["tile_type"]
        p1 = state["p1"]
        p2 = state["p2"]
        p3 = state["p3"]

        print(f"Processing value: {tile_type} {p1} {p2} {p3}")


        #result = f"Computed result for {value}"
        #socketio.emit("result", result, to=state["sid"])

#====================
import uuid

# Use eventlet for production-style WebSocket support


app = Flask(__name__)

socketio = SocketIO(
    app,
    async_mode='threading',
    cors_allowed_origins='*',
    max_http_buffer_size=100 * 1024 * 1024,   # 100 MB
    ping_interval=25,   # seconds between pings (default ~25)
    ping_timeout=120    # how long to wait for pong (increase if processing is long)
)
app.config['SECRET_KEY'] = 'secret!'
# Cookies policy
app.config.update(
    SESSION_COOKIE_SAMESITE='Lax',  # 'None' if truly cross-site embedding
    SESSION_COOKIE_SECURE=False     # True when HTTPS; required if SAMESITE='None'
)


#
# Size-based rotation (RotatingFileHandler)
#
LOGFILE = 'lattice.log'
DATA_DIR = 'client_data'
LAST_RESULTS_DIR = 'last_results'
LAST_TILES_RESULTS_DIR = 'last_tiles_results'
os.makedirs(DATA_DIR, exist_ok=True)

# Setup logging to file and console
LOG_FILE_NAME = 'lattice.log'
logger = logging.getLogger('lattice')
logger.setLevel(logging.DEBUG)
fmt = logging.Formatter('%(asctime)s %(levelname)s %(message)s')

unique_file_id = ''

# ------------------------
# Rotating file handler
# ------------------------
# max 5 MB per file, keep 3 backups
fh = RotatingFileHandler(LOGFILE, maxBytes=5*1024*1024, backupCount=3)
fh.setFormatter(fmt)
logger.addHandler(fh)

# ------------------------
# Console output
# ------------------------
ch = logging.StreamHandler()
ch.setFormatter(fmt)
logger.addHandler(ch)

# Background Thread
log_thread = None
thread_stop_event = False
def follow_log(file_name, socketio_instance):
    """
    Tails a file (like 'tail -f') and emits new lines via SocketIO.
    """
    try:
        # Start by opening the file and seeking to the end
        file = open(file_name, 'r')
        file.seek(0, os.SEEK_END)

        while not thread_stop_event:
            line = file.readline()
            if not line:
                # No new line, wait a bit and try again
                socketio_instance.sleep(0.1)  # Use socketio.sleep for async safety
                continue

            # Emit the new log line to all connected clients
            socketio_instance.emit('log_update', {'data': line.strip()})

    except FileNotFoundError:
        print(f"Error: Log file '{file_name}' not found.")
        # Optionally, emit an error to the client
        socketio_instance.emit('log_error', {'data': f"Log file '{file_name}' not found."})
    except Exception as e:
        print(f"An error occurred in log follower: {e}")


log_thread = None
thread_stop_event = False
def get_initial_log_content(file_path, num_lines=50):
    """Reads the last N lines of a file for initial display."""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
            return [line.strip() for line in lines[-num_lines:]]
    except FileNotFoundError:
        return [f"Error: Log file '{LOG_FILE_NAME}' not found."]
    except Exception as e:
        return [f"An error occurred reading initial log: {e}"]


def follow_log(file_name, socketio_instance):
    """
    Tails a file (like 'tail -f') and emits new lines via SocketIO.
    This runs in a background thread.
    """
    try:
        file = open(file_name, 'r')
        file.seek(0, os.SEEK_END)

        while not thread_stop_event:
            line = file.readline()
            if not line:
                socketio_instance.sleep(0.1)
                continue

            # FIX: Use the socketio_instance passed to the thread function
            socketio_instance.emit('log_update', {'data': line.strip()})

    except FileNotFoundError:
        # It's safer to emit errors from the background thread using the instance
        socketio_instance.emit('log_error', {'data': f"Log file '{file_name}' not found during tailing."})
    except Exception as e:
        print(f"An error occurred in log follower: {e}")

@app.route('/viewlog007')  # <-- This is the only line that changed
def view_log():
    return render_template('log_view.html', log_file=LOG_FILE_NAME)


#
# View all log
#
# Add this function to your main.py
@app.route('/viewfulllog007')
def view_full_log():
    """Reads the entire log file content and displays it."""
    log_content = ""
    try:
        # Read the entire log file content
        # Note: Be mindful of very large log files, as this loads the entire file into memory.
        with open(LOG_FILE_NAME, 'r', encoding='utf-8') as f:
            log_content = f.read()
    except FileNotFoundError:
        log_content = f"Error: Log file '{LOG_FILE_NAME}' not found. Please ensure it exists."
    except Exception as e:
        log_content = f"An unexpected error occurred reading the log file: {e}"

    # Pass the file name and the full content to the HTML template
    return render_template('full_log_view.html',
                           log_file=LOG_FILE_NAME,
                           log_content=log_content)

#======================================


@app.route('/')
def index():
    return render_template('index.html')

def parse_ascii_stl(text):
    """
    Very small ASCII STL parser: returns a list of triangles,
    each triangle is list of three vertices, each vertex is tuple(x,y,z).
    """
    triangles = []
    lines = text.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if line.startswith('facet normal'):
            # skip "facet normal ..."
            i += 1
            # expect "outer loop"
            while i < len(lines) and 'outer loop' not in lines[i]:
                i += 1
            verts = []
            for j in range(3):
                i += 1
                if i < len(lines):
                    parts = lines[i].strip().split()
                    if parts[0] == 'vertex':
                        x, y, z = float(parts[1]), float(parts[2]), float(parts[3])
                        verts.append((x, y, z))
            # skip until "endfacet"
            while i < len(lines) and 'endfacet' not in lines[i]:
                i += 1
            if len(verts) == 3:
                triangles.append(verts)
        i += 1
    return triangles

def write_ascii_stl(triangles, name='exported'):
    """
    Build ASCII STL text from triangles list.
    """
    out = []
    out.append(f"solid {name}")
    for tri in triangles:
        # compute simple normal (not normalized)
        (ax,ay,az),(bx,by,bz),(cx,cy,cz) = tri
        ux,uy,uz = bx-ax, by-ay, bz-az
        vx,vy,vz = cx-ax, cy-ay, cz-az
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
    """
    Naive reduction: aim for roughly target_vertices by sampling triangles.
    Each triangle contributes up to 3 vertices (but some vertices may be shared).
    We'll calculate required triangle count and sample every step-th triangle.
    """
    if target_vertices <= 0:
        return triangles
    target_triangles = max(1, target_vertices // 3)
    n = len(triangles)
    if target_triangles >= n:
        return triangles
    step = n / target_triangles
    reduced = []
    idx = 0.0
    while int(idx) < n and len(reduced) < target_triangles:
        reduced.append(triangles[int(idx)])
        idx += step
    return reduced

def twist_mesh(triangles, twist_angle_deg=45, axis='z'):
    """
    Twist mesh around the given axis.
    - triangles: list of [[x,y,z], [x,y,z], [x,y,z]]
    - twist_angle_deg: total angle at top of mesh
    """
    import numpy as np

    # Flatten vertices
    verts = np.array([v for tri in triangles for v in tri])
    # Compute height factor along axis
    axis_idx = {'x': 0, 'y': 1, 'z': 2}[axis]
    min_val = verts[:, axis_idx].min()
    max_val = verts[:, axis_idx].max()
    height_norm = (verts[:, axis_idx] - min_val) / (max_val - min_val + 1e-8)

    angle_rad = np.deg2rad(twist_angle_deg)
    # Compute rotation for each vertex
    rotated_verts = []
    for v, h in zip(verts, height_norm):
        theta = h * angle_rad
        if axis == 'z':
            x, y = v[0], v[1]
            xr = x * np.cos(theta) - y * np.sin(theta)
            yr = x * np.sin(theta) + y * np.cos(theta)
            rotated_verts.append([xr, yr, v[2]])
        elif axis == 'y':
            x, z = v[0], v[2]
            xr = x * np.cos(theta) - z * np.sin(theta)
            zr = x * np.sin(theta) + z * np.cos(theta)
            rotated_verts.append([xr, v[1], zr])
        elif axis == 'x':
            y, z = v[1], v[2]
            yr = y * np.cos(theta) - z * np.sin(theta)
            zr = y * np.sin(theta) + z * np.cos(theta)
            rotated_verts.append([v[0], yr, zr])
    # Rebuild triangles
    new_triangles = [rotated_verts[i:i+3] for i in range(0, len(rotated_verts), 3)]
    return new_triangles

connected_clients = {}
client_state = {}
@socketio.on('connect')
def on_connect():
    logger.info('Client connected')
    sid = request.sid
    print(f"======> connect - id : {request.sid}  ")
    unique_file_id = str(uuid.uuid4())
    print(f"======> Unique ID : {unique_file_id}")

    # For tile
    state = {
        "sid": sid,
        "tile_type": None,
        "p1": None,
        "p2": None,
        "p3": None,
        "event": threading.Event()
    }

    t = threading.Thread(target=worker_loop, args=(state,), daemon=True)
    t.start()

    client_state[sid] = state


    # 1. Essential Information
    ip_address = request.environ.get('REMOTE_ADDR')
    user_agent = request.user_agent.string if request.user_agent else 'Unknown'

    # 2. Additional HTTP Header Information
    real_ip = request.headers.get('X-Forwarded-For', ip_address)
    referrer = request.referrer if request.referrer else 'None'
    preferred_lang = request.accept_languages.best
    protocol = request.scheme

    connected_clients[sid] = {
        'sid': sid,
        'ip_address_reported': ip_address,  # IP seen by Flask (often proxy)
        'real_ip_guess': real_ip,  # Best guess for real client IP
        'user_agent': user_agent,
        'referrer': referrer,
        'language': preferred_lang,
        'protocol': protocol,
        'connected_time': time.time(),
        'last_activity': time.time(),
        'unique_file_id' : unique_file_id
    }
    logger.info(connected_clients[sid])
    print(f"Client connected. SID: {connected_clients[sid]}  connections = {len(connected_clients)}")
    print(f"Client connected. SID:  Nu. connections = {len(connected_clients)}")

    # Handling the log operation
    global log_thread
    logger.info('Client connected')
    sid = request.sid

    # ... (Your existing client tracking and logging setup, simplified here)
    ip_address = request.environ.get('REMOTE_ADDR')
    unique_file_id = str(uuid.uuid4())
    connected_clients[sid] = {
        'sid': sid,
        'ip_address_reported': ip_address,
        'unique_file_id': unique_file_id
        # ... (rest of your client metadata)
    }
    print(f"Client connected. SID: {sid}")

    # === FIX: Log Tailing Setup is now correctly inside the connect handler ===

    # 1. Send Initial Log Content to the connecting client (only)
    initial_lines = get_initial_log_content(LOG_FILE_NAME)
    for line in initial_lines:
        # This 'emit' is CORRECT because it is inside the @socketio.on('connect') handler.
        # It automatically targets the connecting client (request.sid).
        emit('log_update', {'data': line})

    # 2. Start the log follower thread only once for real-time updates
    # The thread will run in the background and broadcast new lines to ALL clients.
    if log_thread is None:
        log_thread = socketio.start_background_task(target=follow_log, file_name=LOG_FILE_NAME,
                                                    socketio_instance=socketio)
    # === END Log Tailing Setup ===
def clean_session(sid):
    if sid in connected_clients:
        del connected_clients[sid]

    folder_to_delete = os.path.join(os.getcwd(), LAST_RESULTS_DIR, sid)

    try:
        # Check if the folder exists (optional, but good practice)
        if os.path.exists(folder_to_delete):
            print(f"Force removing {folder_to_delete}...")

            # Recursively deletes the directory and all its contents
            shutil.rmtree(folder_to_delete)

            print(f"Successfully removed {folder_to_delete}")
        else:
            print(f"Folder {folder_to_delete} does not exist.")

    except Exception as e:
        # Catches permission errors (common on Windows) or other issues
        print(f"Error removing directory {folder_to_delete}: {e}")

@socketio.on('disconnect')
def on_disconnect():
    logger.info('Client disconnected - ')
    sid = request.sid
    clean_session(sid);
import tempfile


def compress_text_to_b64_gz(text: str) -> str:
    buf = BytesIO()
    with gzip.GzipFile(fileobj=buf, mode='wb') as gz:
        gz.write(text.encode('utf-8'))
    return base64.b64encode(buf.getvalue()).decode('ascii')

@socketio.on('calculate')
def handle_calculate(data):
    sid = request.sid
    t_start = time.time()
    logger.info(f"[CALC] == calculate request  sid={sid} =============")
    logger.info(f"[CALC] == calculate request  sid={sid} ==============")
 
    # ── 1. Extract & validate request fields ──────────────────────────
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
 
    tile_type_int = lt.TILE_TYPE_MAP.get(tile_type)
 
    logger.info(f"[CALC]   filename   : {filename}")
    logger.info(f"[CALC]   tileType   : {tile_type!r}  ->  int {tile_type_int}")
    logger.info(f"[CALC]   num_tiles  : ({nt1}, {nt2}, {nt3})")
    logger.info(f"[CALC]   graded     : ({g1}, {g2})")
    logger.info(f"[CALC]   tile_params: ({p1}, {p2}, {p3})")
 
    if tile_type_int is None:
        logger.error(f"[CALC] Unknown tileType: {tile_type!r}")
        emit('error', {'msg': f'Unknown tileType: {tile_type}'})
        return
    
    # ── 2. Decode the incoming IGS payload ────────────────────────────
    igs_b64 = data.get('igs_b64') or data.get('igs_text_b64')
    is_binary = bool(data.get('binary', False))
 
    if not igs_b64:
        logger.error("[CALC] No IGS payload received")
        emit('error', {'msg': 'No IGS payload'})
        return
 
    try:
        igs_bytes = base64.b64decode(igs_b64)
    except Exception as exc:
        logger.exception(f"[CALC] base64 decode failed: {exc}")
        emit('error', {'msg': 'Failed to decode IGS base64'})
        return
 
    logger.info(f"[CALC]   raw payload : {len(igs_bytes):,} bytes  ({len(igs_bytes)/1024:.2f} KB)  binary={is_binary}")
 
    # ── 3. Validate the IGS file ───────────────────────────────────────
    #      (skip full section check for binary IGES, just size-check)
    if not is_binary:
        # validation = validate_igs_bytes(igs_bytes, label=filename)
        # log_igs_validation(validation, sid=sid)
 
        # if not validation["ok"]:
        #     # Soft-fail: warn client but continue if we at least have ASCII content.
        #     # Change to a hard `return` if you want strict enforcement.
        #     if validation["errors"]:
        #         logger.warning(
        #             f"[CALC] IGS validation errors detected – proceeding anyway: "
        #             f"{validation['errors']}"
        #         )
        #         emit('warning', {
        #             'msg': 'IGS file may be malformed',
        #             'details': validation['errors']
        #         })
        print("not is_binary")
    else:
        logger.info(f"[CALC]   binary IGS – skipping text validation  size={len(igs_bytes):,} bytes")
 
    # ── 4. Persist IGS to disk ────────────────────────────────────────
    safe_base = os.path.splitext(os.path.basename(filename))[0] or "upload"
    igs_disk_path = os.path.abspath(os.path.join(DATA_DIR, f"{safe_base}.igs"))
    json_disk_path = os.path.abspath(os.path.join(DATA_DIR, f"{safe_base}.json"))
 
    try:
        with open(igs_disk_path, 'wb') as f:
            f.write(igs_bytes)
        logger.info(f"[CALC] Saved IGS -> {igs_disk_path}  ({len(igs_bytes):,} bytes)")
    except OSError as exc:
        logger.exception(f"[CALC] Failed to save IGS: {exc}")
        emit('error', {'msg': 'Server failed to save IGS file'})
        return
 
    try:
        meta = {'filename': filename, 'args': args, 'sid': sid}
        with open(json_disk_path, 'w', encoding='utf-8') as jf:
            json.dump(meta, jf, indent=2)
        logger.info(f"[CALC] Saved metadata -> {json_disk_path}")
    except OSError:
        logger.warning("[CALC] Could not save JSON metadata (non-fatal)")
 
    # ── 5. Build DLL parameter arrays ────────────────────────────────
    curr_num_tiles  = (c_int * 3)(nt1, nt2, nt3)
    curr_graded     = (c_double * 2)(g1, g2)
    curr_tile_params = (c_double * 3)(p1, p2, p3)
 
    # ── 6. Call DLL ───────────────────────────────────────────────────
    t_dll_start = time.time()
    stl_content = None
    download_token = None
 
    try:
        if tile_type_int == MSDLL_TILE_CROSS:
            logger.info("[CALC] Dispatching -> do_revolution (CROSS)")
            download_token, stl_content = do_revolution(
                sid, igs_disk_path, curr_num_tiles, curr_tile_params
            )
        elif tile_type_int == MSDLL_TILE_DIAGONAL:
            logger.info("[CALC] Dispatching -> do_extrusion (DIAGONAL)")
            download_token, stl_content = do_extrusion(
                sid, igs_disk_path, curr_num_tiles, curr_tile_params
            )
        elif tile_type_int == MSDLL_TILE_CROSS_DIAGONAL:
            logger.info("[CALC] Dispatching -> do_Ruling (CROSS_DIAGONAL)")
            download_token, stl_content = do_Ruling(
                sid, igs_disk_path, curr_num_tiles, curr_tile_params
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
 
    logger.info(f"[CALC] DLL completed in {(t_dll_end - t_dll_start)*1000:.1f} ms  "
                f"STL chars={len(stl_content):,}")
 
    # ── 7. Compress & encode ──────────────────────────────────────────
    try:
        t_comp_start = time.time()
        compressed_b64 = compress_text_to_b64_gz(stl_content)
        t_comp_end = time.time()
        comp_bytes = len(base64.b64decode(compressed_b64))  # actual gzip size
        logger.info(
            f"[CALC] Compressed: {len(stl_content):,} chars -> "
            f"{comp_bytes/1024:.2f} KB gzip  "
            f"({(t_comp_end - t_comp_start)*1000:.1f} ms)"
        )
    except Exception as exc:
        logger.exception(f"[CALC] Compression failed: {exc}")
        emit('error', {'msg': 'Compression failed'})
        return
 
    # ── 8. Emit result ────────────────────────────────────────────────
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

def calculate_tile(TileParams, Graded, tile_type):
    t_recv = time.time()
    tile_type_int = lt.TILE_TYPE_MAP.get(tile_type)
    stl_tile_path = ''
    if tile_type_int == MSDLL_TILE_DIAGONAL:
        stl_tile_path = os.path.join(os.getcwd(), LAST_TILES_RESULTS_DIR, 'TileDiagnoal.stl').encode('utf-8')
        err = lt.MSDLLGetTile(
            MSDLL_TILE_DIAGONAL,
            TileParams,
            Graded,
            stl_tile_path
        )
        print(f"---MSDLL_TILE_DIAGONAL ret = {err}")
    elif tile_type_int == MSDLL_TILE_CROSS:
        stl_tile_path = os.path.join(os.getcwd(), LAST_TILES_RESULTS_DIR, 'TileCross.stl').encode('utf-8')
        err = lt.MSDLLGetTile(
            MSDLL_TILE_CROSS,
            TileParams,
            Graded,
            stl_tile_path
        )
        print(f"---MSDLL_TILE_CROSS ret = {err}")
    elif tile_type_int == MSDLL_TILE_CROSS_DIAGONAL:
        stl_tile_path = os.path.join(os.getcwd(), LAST_TILES_RESULTS_DIR, 'TileCrossDiagnoal.stl').encode('utf-8')
        err = lt.MSDLLGetTile(
            MSDLL_TILE_CROSS_DIAGONAL,
            TileParams,
            Graded,
            stl_tile_path
        )
        print(f"---MSDLL_TILE_CROSS ret = {err}")

    print(f"-- The tile is : {stl_tile_path}")
    t_processed = time.time()
    if os.path.exists(stl_tile_path):
        stl_content = read_ascii_stl_file(stl_tile_path)
        print("[3] Compression: gzipping processed STL")

        try:
            buf = BytesIO()
            with gzip.GzipFile(fileobj=buf, mode='wb') as gz:
                gz.write(stl_content.encode('utf-8'))
            compressed = buf.getvalue()
            t_compressed = time.time()
        except Exception:
            logger.exception("Compression failed")
            print("ERROR: Compression failed")
            emit('error', {'msg': 'Compression failed'})
            return

        comp_mb = len(compressed) / (1024 * 1024)
        logger.info(f"Compressed Tile STL size: {comp_mb:.3f} MB ({len(compressed)} bytes)")
        print(f"Compressed Tile STL size: {comp_mb:.3f} MB ({len(compressed)} bytes)")

        compressed_b64 = base64.b64encode(compressed).decode('ascii')
        t_parsed = time.time()
        timings = {
            'client_to_server_ms': 0,
            'time_parsed_ms': (t_parsed - t_processed) * 1000.0,
            'time_processed_ms': (t_processed - t_recv) * 1000.0,
            'time_compress_ms': (t_parsed - t_processed) * 1000.0,
            'overall_ms': (time.time() - t_recv) * 1000.0
        }

        print(f" sending tile : {stl_tile_path}")
        emit('result', {
            'filename': stl_tile_path,
            'kind': "tile_stl",
            'stl_gz_b64': compressed_b64,
            'timings': timings,
        })
    else:
        print("Error: STL file not found on disk.")

def read_ascii_stl_file(stl_file):
    print(f"Read {stl_file} ")
    try:
        with open(stl_file, 'r', encoding='utf-8') as f:
            stl_content = f.read()
        print(f"Read {len(stl_content)} bytes of STL content.")
        return stl_content
    except FileNotFoundError:
        logger.error(f"STL file not found: {stl_file}")
        return None
    except Exception as e:
        logger.error(f"Error reading STL file {stl_file}: {e}")
        return None


@socketio.on('convert_igs_to_stl')
def handle_convert_igs_to_stl(data):
    print("Received request to convert IGS to STL (Running Dummy Mode)")
    
    igs_text = data.get('data')
    if not igs_text:
        return emit('error', {'msg': 'Empty file data'})
    
    # 1. Define the absolute path to the dummy STL file on your machine
    DUMMY_STL_PATH = r"./models/Elephant.stl"  # For Windows (use r"" prefix)
    # DUMMY_STL_PATH = "/path/to/your/mock_file.stl"  # For macOS/Linux

    try:
        # 2. Verify the dummy file exists
        if not os.path.exists(DUMMY_STL_PATH):
            print(f"Error: Dummy file not found at {DUMMY_STL_PATH}")
            return emit('error', {'msg': 'Server configuration error: Mock file missing.'})

        # 3. Read the file 
        # Using 'rb' (read binary) handles both ASCII and Binary STL formats.
        # Flask-SocketIO natively supports sending binary data.
        with open(DUMMY_STL_PATH, 'rb') as f:
            stl_content = f.read()

        # 4. Emit the data back to the client
        # Change 'conversion_success' to match whatever event your frontend listens for
        gzipped_data = gzip.compress(stl_content)
        b64_string = base64.b64encode(gzipped_data).decode('utf-8')
        emit('result', {'stl_gz_b64': b64_string, 'kind': "model_preview_stl"})
        print("Successfully returned dummy STL file.")

    except Exception as e:
        print(f"Error reading dummy file: {e}")
        emit('error', {'msg': f'Internal server error during mock conversion: {str(e)}'})

@socketio.on('calculate_tile')
def handle_calculate_tile(data):
    # Extract the 3 values
    p1, p2, p3 = data['values']
    tile_type = data['type']

    TileParams = (c_double * 3)(
        0.2,
        0.0,
        0.4
    )
    Graded = (c_double * 2)(
        0.2,
        1.5
    )
    print(f"Backend received: {tile_type} with P1:{p1}, P2:{p2}, P3:{p3}")
    TileParams[0] = p1
    TileParams[1] = p2
    TileParams[2] = p3

    state = client_state[request.sid]
    state = {
        "sid": request.sid,
        "tile_type": None,
        "p1": None,
        "p2": None,
        "p3": None,
        "event": threading.Event()
    }
    state["tile_type"] = tile_type
    state["p1"] = p1
    state["p2"] = p2
    state["p3"] = p3
    #state["event"].set()

    calculate_tile(TileParams, Graded, tile_type)



DOWNLOAD_CACHE = {}
def generate_dummy_files_results(id_folder):
    sid = request.sid
    download_token = str(uuid.uuid4())


    file_size_kb = 5
    data = "A" * (file_size_kb * 1024)

    new_folder = os.path.join(os.getcwd(), LAST_RESULTS_DIR, sid)
    os.makedirs(new_folder, exist_ok=True)

    stl = f"out_{sid}.stl"
    igs = f"out_{sid}.igs"

    DOWNLOAD_CACHE[download_token] = {
        'sid': sid,
        'out_stl': stl,
        'out_igs': igs
    }

    files = [f"{stl}", f"{igs}"]
    for f in files:
        print(f"---- Write dummy {f}")
        file_path = os.path.join(new_folder, f)
        with open(file_path, "w") as f:
            f.write(data)

    print(f" --- Done generating dummy files")
    return download_token

@app.route('/download-results', methods=['POST'])
def download_results():
    print(f" ==== Downloading Working from {os.getcwd()}")
    # 1. Get the token from the POST form data
    token = request.form.get('token')
    print(f" --- token : {token}")

    # 2. Retrieve the mapping from the global cache (and remove it immediately)
    output_map = DOWNLOAD_CACHE.pop(token, None)


    if output_map is None:
        print("Error: Invalid or expired download token (not found in cache).")
        return redirect(url_for('index'))

        # Retrieve the saved sid from the map
    sid_from_map = output_map.get('sid')

    # 1. Create an in-memory buffer (BytesIO)
    memory_file = io.BytesIO()

    out_folder = os.path.join(os.getcwd(), LAST_RESULTS_DIR, sid_from_map)
    # 2. Use the buffer to create the ZIP file
    with zipfile.ZipFile(memory_file, 'w', zipfile.ZIP_DEFLATED) as zf:
        # Define the files you want to include in the ZIP

        print(f"--- DEBUG SESSION VALUE ---")
        print(f"output_map value: {output_map}")
        print(f"output_map type: {type(output_map)}")
        print(f"---------------------------")

        stl = output_map.get('out_stl')
        igs = output_map.get('out_igs')
        files_to_zip = [f"{stl}", f"{igs}"]
        print(f"--- {files_to_zip}")

        for filename in files_to_zip:
            file_path = os.path.join(out_folder, filename)
            # --- START DEBUGGING BLOCK ---
            print(f"DEBUG: Checking path: {file_path}")
            if not os.path.exists(file_path):
                # If the file path is confirmed wrong here, it will exit gracefully
                print(f"ERROR: File does not exist at path: {file_path}")
                return redirect(url_for('index'))
            # --- END DEBUGGING BLOCK ---
            print(f"ZIP {file_path}")
            try:
                # Add the file to the ZIP archive
                # The arcname is the name the file will have *inside* the zip
                zf.write(file_path, arcname=filename)
            except FileNotFoundError:
                # Handle case where a source file is missing
                return f"Error: Source file '{file_path}' not found.", 404

    # 3. Move the file pointer back to the start of the buffer
    memory_file.seek(0)

    # 4. Use send_file to stream the in-memory ZIP file to the client
    return send_file(
        memory_file,
        mimetype='application/zip',
        as_attachment=True,
        download_name='results.zip'  # The name the user will see
    )


#
# netstat -ano | findstr :5000
# taskkill /PID 12345 /F
#
if __name__ == '__main__':
    print("Starting Flask-SocketIO server on http://localhost:5003")
    print('socketio.server =', getattr(socketio, 'server', None))
    socketio.run(app, host='0.0.0.0', port=5003, allow_unsafe_werkzeug=True)
