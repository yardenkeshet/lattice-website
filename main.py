# app.py
import os
import shutil
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

def do_Ruling(id_folder):
    sid = request.sid
    download_token = str(uuid.uuid4())

    # Prepare inputs
    srf1_path = b"Input\\RuledSrf1.igs"
    srf2_path = b"Input\\RuledSrf2.igs"
    Num_Tiles[0] = Num_Tiles[1] = Num_Tiles[2] = 2
    TileParams[0] = 0.05
    TileParams[1] = 3.5

    print(f" Num_Tiles : {Num_Tiles[0]} {Num_Tiles[1]} {Num_Tiles[2]}")
    print(f" TileParams : {TileParams[0]} {TileParams[2]} {TileParams[2]}")

    tile_type = MSDLL_TILE_CROSS_DIAGONAL

    new_folder = os.path.join(os.getcwd(), LAST_RESULTS_DIR, sid)
    os.makedirs(new_folder, exist_ok=True)

    out_igs =os.path.join(new_folder, "MSRuled.igs")
    igs = out_igs.encode('ascii')  # or .encode('utf-8')
    out_stl = os.path.join(new_folder, "MSRuled.stl")
    stl = out_stl.encode('ascii')  # or .encode('utf-8')

    # Call function
    result = lt.MSDLLMSFromRuling(
        srf1_path,
        srf2_path,
        Num_Tiles,
        Graded,
        tile_type,
        TileParams,
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
def do_revolution(id_folder):
    print(f"Do MSDLLMSFromRevolution")
    sid = request.sid
    download_token = str(uuid.uuid4())

    # Input IGES file (must be bytes for c_char_p)
    srf_file = b"Input\\RevolveSrf.igs"

    new_folder = os.path.join(os.getcwd(), LAST_RESULTS_DIR, sid)
    os.makedirs(new_folder, exist_ok=True)

    # Output IGES & STL (must be bytes for c_char_p)
    out_igs = b"Data\\MSRevolv.igs"
    out_stl = b"Data\\MSRevolv.stl"

    out_igs = os.path.join(new_folder, "MSRevolv.igs")
    igs = out_igs.encode('ascii')  # or .encode('utf-8')
    out_stl = os.path.join(new_folder, "MSRevolv.stl")
    stl = out_stl.encode('ascii')  # or .encode('utf-8')

    # Tile type
    tile_type = MSDLL_TILE_CROSS

    Num_Tiles[0] = Num_Tiles[1] = 2
    TileParams[0] = 0.2
    TileParams[1] = 0.0

    print(f" Num_Tiles : {Num_Tiles[0]} {Num_Tiles[1]} {Num_Tiles[2]}")
    print(f" TileParams : {TileParams[0]} {TileParams[2]} {TileParams[2]}")

    print("Calling DLL...")
    result = lt.MSDLLMSFromRevolution(
        srf_file,
        Num_Tiles,
        Graded,
        tile_type,
        TileParams,
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
def do_extrusion(id_folder):
    print(f"Do MSDLLMSFromExtrusion")
    sid = request.sid
    download_token = str(uuid.uuid4())

    # Prepare inputs
    srf_igs = b"Input\\ExtrudeSrf.igs"
    extrude_length = c_double(10.0)
    Num_Tiles[0] = Num_Tiles[1] = Num_Tiles[2] = 4
    tile_type = MSDLL_TILE_DIAGONAL

    TileParams[0] = 0.2
    TileParams[1] = 0.1
    TileParams[2] = 0.4

    new_folder = os.path.join(os.getcwd(), LAST_RESULTS_DIR, sid)
    os.makedirs(new_folder, exist_ok=True)

    out_igs = b"Data\\MSExtrd.igs"
    out_stl = b"Data\\MSExtrd.stl"

    out_igs = os.path.join(new_folder, "MSExtrd.igs")
    igs = out_igs.encode('ascii')  # or .encode('utf-8')
    out_stl = os.path.join(new_folder, "MSExtrd.stl")
    stl = out_stl.encode('ascii')  # or .encode('utf-8')

    # Call function
    result = lt.MSDLLMSFromExtrusion(
        srf_igs,
        extrude_length,
        Num_Tiles,
        Graded,
        tile_type,
        TileParams,
        igs,
        stl
    )

    print(f"Result: {result}")
    if result:
        print(f"Message: {result.decode('utf-8', errors='replace')}")

    stl_content = read_ascii_stl_file(out_stl)
    DOWNLOAD_CACHE[download_token] = {
        'sid': sid,  # <--- NEW: Store the sid for folder lookup
        'out_stl': f"MSExtrd.stl",
        'out_igs': f"MSExtrd.igs"
    }

    print("Result:", result)
    print(f" -- Done MSDLLMSFromExtrusion ")
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

@socketio.on('calculate')
def handle_calculate(data):
    sid = request.sid
    print(f"======> calculate - id : {sid}  ")
    start_total = time.time()
    client_ts = data.get('client_ts')
    filename = data.get('filename', 'uploaded.stl')
    args = data.get('args', {})

    tile_type = args.get('tileType')
    nt1 = int(args.get('nt1', 0))
    nt2 = int(args.get('nt2', 0))
    nt3 = int(args.get('nt3', 0))

    g1 = float(args.get('g1', 0.0))
    g2 = float(args.get('g2', 0.0))


    print(f"✅ Extracted Params:")
    print(f"  tileType: {tile_type}")
    print(f"  nt1  {nt1}, nt2 : {nt2}, nt3 : {nt3}")
    print(f"  g1 : {g1}, g2 : {g2}")

    tile_type_int = lt.TILE_TYPE_MAP.get(tile_type)

    #print(f" args : {args}")

    # 1. GET THE STL
    logger.info(f"[1] get the STL: {filename}")
    print(f"[1] get the STL: {filename}")

    stl_b64_ascii = data.get('stl_text_b64')
    stl_b64 = data.get('stl_b64', stl_b64_ascii)
    is_binary = bool(data.get('binary', False))

    if not stl_b64:
        logger.error("No STL payload in request")
        print("ERROR: No STL payload in request")
        emit('error', {'msg': 'No STL payload'})
        return

    # decode base64
    try:
        stl_bytes = base64.b64decode(stl_b64)
    except Exception as e:
        logger.exception("Failed to base64-decode incoming STL")
        print("ERROR: Failed to decode STL")
        emit('error', {'msg': 'Failed to decode STL b64'})
        return

    # ---------------------------------------------------------------
    # 🔵 ADD A: STL original size logging
    stl_size_mb = len(stl_bytes) / (1024 * 1024)
    logger.info(f"Original STL size: {stl_size_mb:.3f} MB ({len(stl_bytes)} bytes)")
    print(f"Original STL size: {stl_size_mb:.3f} MB ({len(stl_bytes)} bytes)")
    # ---------------------------------------------------------------

    # Save STL
    last_results_stl_path=""
    if filename is not None:
        safe_base = os.path.splitext(os.path.basename(filename))[0]
        stl_path = os.path.join(DATA_DIR, f"{safe_base}.stl")
        json_path = os.path.join(DATA_DIR, f"{safe_base}.json")
        last_results_stl_path = os.path.join(LAST_RESULTS_DIR, f"{safe_base}.stl")
    else:
        stl_path = os.path.join(DATA_DIR, f"none.stl")
        json_path = os.path.join(DATA_DIR, f"none.json")
        last_results_stl_path = LAST_RESULTS_DIR
        safe_base = "none"

    print(f" safe_base = {safe_base}")

#saved results path

    print(f"--- Saved : \n\t STL : {stl_path} \n\t : {json_path} ")
    try:
        if is_binary:
            with open(stl_path, 'wb') as f:
                f.write(stl_bytes)
            logger.info(f"Saved binary STL to {stl_path}")
            print(f"Saved binary STL to {stl_path}")
            stl_text = None
        else:
            stl_text = stl_bytes.decode('utf-8', errors='ignore')
            with open(stl_path, 'w', encoding='utf-8') as f:
                f.write(stl_text)
            logger.info(f"Saved ASCII STL to {stl_path}")
            print(f"Saved ASCII STL to {stl_path}")
    except Exception:
        logger.exception("Failed to save STL")
        print("ERROR: Failed to save STL")
        emit('error', {'msg': 'Failed to save STL'})
        return

    # Save JSON
    try:
        with open(json_path, 'w', encoding='utf-8') as jf:
            json.dump({'filename': filename, 'args': args}, jf, indent=2)
        logger.info(f"Saved JSON metadata to {json_path}")
        print(f"Saved JSON metadata to {json_path}")
    except Exception:
        logger.exception("Failed to save JSON metadata")
        print("ERROR: Failed to save JSON metadata")

    # 2. PROCESS

    t_recv = time.time()
    processed_stl_text = None

    if tile_type_int is not None:
        print(f"Incoming tile_type string: '{tile_type}' maps to integer: {tile_type_int}")
        # Example comparison using the integer value:
        if tile_type_int == MSDLL_TILE_CROSS:
            print("Tile type is CROSS ")
            download_token, stl_content = do_revolution(sid)
        elif tile_type_int == MSDLL_TILE_DIAGONAL:
            print("Tile type is DIAGONAL ")
            download_token, stl_content = do_extrusion(sid)
        elif tile_type_int == MSDLL_TILE_CROSS_DIAGONAL:
            print("Tile type is CROSS_DIAGONAL .")
            download_token, stl_content = do_Ruling(sid)

    else:
        print(f"Error: Unknown tile_type string received: {tile_type}")

    t_processed = time.time()

    # download_token = generate_dummy_files_results(sid)
    # 3. COMPRESSION
    logger.info("[3] Compression: gzipping processed STL")
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

    t_parsed = time.time()
    # ---------------------------------------------------------------
    # 🔵 ADD B: Compressed STL size logging
    comp_mb = len(compressed) / (1024 * 1024)
    logger.info(f"Compressed STL size: {comp_mb:.3f} MB ({len(compressed)} bytes)")
    print(f"Compressed STL size: {comp_mb:.3f} MB ({len(compressed)} bytes)")
    # ---------------------------------------------------------------

    # 4. SEND TO CLIENT
    logger.info("[4] Sending: emitting compressed STL to client")
    print("[4] Sending: emitting compressed STL to client")

    compressed_b64 = base64.b64encode(compressed).decode('ascii')

    timings = {
        'client_to_server_ms': None if client_ts is None else (t_recv*1000.0 - client_ts),
        'time_parsed_ms': (t_parsed - t_processed)*1000.0,
        'time_processed_ms': (t_processed - t_recv)*1000.0,
        'time_compress_ms': (t_compressed - t_processed)*1000.0,
        'overall_ms': (time.time() - start_total)*1000.0
    }


    emit('result', {
        'filename': safe_base + "_reduced.stl",
        'stl_gz_b64': compressed_b64,
        'timings': timings,
        'args_echo': args
    })


    emit('result', {
        'filename': filename,
        'download_token': download_token  # <-- Send the token to the client
    })

    logger.info(f"Finished sending {filename}. Timings: {timings}")
    print(f"Finished sending {filename}. Timings: {timings}")

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
            'stl_gz_b64': compressed_b64,
            'timings': timings,
        })
    else:
        print("Error: STL file not found on disk.")

def read_ascii_stl_file(stl_file):
    print(f"Read {stl_file} ")
    try:
        # 1. Read the ASCII STL file
        # Use 'r' for reading and 'utf-8' encoding for ASCII text files.
        with open(stl_file, 'r', encoding='utf-8') as f:
            stl_content = f.read()

        print(f"Sent {len(stl_content)} bytes of STL content.")

    except FileNotFoundError:
        error_msg = f"Error: STL ascii file not found at {stl_file}"
        print(error_msg)
        emit('error', {'message': error_msg})
    except Exception as e:
        error_msg = f"An error occurred while reading the atl acii file: {e}"
        print(error_msg)
        emit('error', {'message': error_msg})

    return stl_content

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
    state["p1"] = p2
    state["p1"] = p3
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

