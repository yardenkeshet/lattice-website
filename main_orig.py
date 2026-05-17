# app.py
import os
import shutil
import time
import base64
import gzip
import json
import logging
from logging.handlers import RotatingFileHandler
from io import BytesIO
import io
import zipfile

#pip install flask flask-socketio
from flask import Flask, render_template, send_file, jsonify, request, session, Response, redirect, url_for
from flask_socketio import SocketIO, emit

import uuid

# Use eventlet for production-style WebSocket support


app = Flask(__name__)

socketio = SocketIO(
    app,
    async_mode='eventlet',
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


# Use eventlet for production-style WebSocket support

#
# Size-based rotation (RotatingFileHandler)
#
LOGFILE = 'lattice.log'
DATA_DIR = 'client_data'
LAST_RESULTS_DIR = 'last_results'
os.makedirs(DATA_DIR, exist_ok=True)

# Setup logging to file and console
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
@socketio.on('connect')
def on_connect():
    logger.info('Client connected')
    sid = request.sid
    print(f"======> connect - id : {request.sid}  ")
    unique_file_id = str(uuid.uuid4())
    print(f"======> Unique ID : {unique_file_id}")
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
    safe_base = os.path.splitext(os.path.basename(filename))[0]
    stl_path = os.path.join(DATA_DIR, f"{safe_base}.stl")
    json_path = os.path.join(DATA_DIR, f"{safe_base}.json")

#saved results path
    last_results_stl_path = os.path.join(LAST_RESULTS_DIR, f"{safe_base}.stl")
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
    logger.info("[2] Process: parsing and reducing STL")
    print("[2] Process: parsing and reducing STL")

    t_recv = time.time()
    t_parsed = t_recv
    t_processed = t_recv

    processed_stl_text = None

    if not is_binary:
        try:
            triangles = parse_ascii_stl(stl_text)
            t_parsed = time.time()
            logger.info(f"Parsed {len(triangles)} triangles")
            print(f"Parsed {len(triangles)} triangles")
        except Exception:
            logger.exception("Failed to parse ASCII STL")
            print("ERROR: Failed to parse ASCII STL")
            triangles = []

        try:
            target_vertices = int(args.get('distance', 0))
        except:
            target_vertices = 0

        logger.info(f"Reducing mesh to approx {target_vertices} vertices")
        print(f"Reducing mesh to approx {target_vertices} vertices")

#        reduced_tris = reduce_triangles(triangles, target_vertices)
        reduced_tris = twist_mesh(triangles, target_vertices)
        processed_stl_text = write_ascii_stl(reduced_tris, name=safe_base + "_reduced")
        t_processed = time.time()

        logger.info(f"Processed ASCII STL -> {len(reduced_tris)} triangles")
        print(f"Processed ASCII STL -> {len(reduced_tris)} triangles")

    else:
        try:
            import trimesh
            mesh = trimesh.load(io.BytesIO(stl_bytes), file_type='stl')
            target_vertices = int(args.get('distance', 0)) if args.get('distance') else None
            if target_vertices:
                try:
                    mesh = mesh.simplify_quadratic_decimation(max(target_vertices // 3, 1))
                except:
                    pass
            processed_stl_text = mesh.export(file_type='stl')
            if isinstance(processed_stl_text, bytes):
                processed_stl_text = processed_stl_text.decode('utf-8', errors='ignore')
            t_parsed = time.time()
            t_processed = time.time()
            logger.info("Processed binary STL via trimesh")
            print("Processed binary STL via trimesh")
        except Exception:
            logger.exception("trimesh failed; sending placeholder")
            print("WARNING: trimesh failed; placeholder returned")
            processed_stl_text = f"solid {safe_base}_binary_received\nendsolid"
            t_parsed = time.time()
            t_processed = time.time()

    # 3. COMPRESSION
    logger.info("[3] Compression: gzipping processed STL")
    print("[3] Compression: gzipping processed STL")

    try:
        buf = BytesIO()
        with gzip.GzipFile(fileobj=buf, mode='wb') as gz:
            gz.write(processed_stl_text.encode('utf-8'))
        compressed = buf.getvalue()
        t_compressed = time.time()
    except Exception:
        logger.exception("Compression failed")
        print("ERROR: Compression failed")
        emit('error', {'msg': 'Compression failed'})
        return

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
        'time_parsed_ms': (t_parsed - t_recv)*1000.0,
        'time_processed_ms': (t_processed - t_parsed)*1000.0,
        'time_compress_ms': (t_compressed - t_processed)*1000.0,
        'overall_ms': (time.time() - start_total)*1000.0
    }

    emit('result', {
        'filename': safe_base + "_reduced.stl",
        'stl_gz_b64': compressed_b64,
        'timings': timings,
        'args_echo': args
    })

    download_token = generate_dummy_files_results(sid)
    emit('result', {
        'filename': filename,
        'download_token': download_token  # <-- Send the token to the client
    })

    logger.info(f"Finished sending {filename}. Timings: {timings}")
    print(f"Finished sending {filename}. Timings: {timings}")

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
        'sid': sid,  # <--- NEW: Store the sid for folder lookup
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

if __name__ == '__main__':
    print("Starting Flask-SocketIO server on http://0.0.0.0:5000")
    print('socketio.server =', getattr(socketio, 'server', None))
    socketio.run(app, host='0.0.0.0', port=5000)
