# lattice-website

A web application for generating parametric lattice structures from CAD surface files.

## Prerequisites

- Python 3.13
- Node.js (v18+) and npm

---

## Backend Setup

The backend is a Flask + SocketIO server that calls a pre-compiled C++ DLL to compute lattice geometries.

### 1. Create and activate a virtual environment

```bash
python -m venv .venv
```

**Windows:**
```bash
.venv\Scripts\activate
```

**macOS / Linux:**
```bash
source .venv/bin/activate
```

### 2. Install Python dependencies

```bash
pip install -r requirements.txt
```

### 3. Run the backend

```bash
python main.py
```

The server starts at **http://localhost:5003**.

> **Note:** Run from the repo root so the C++ DLL at `gershon/MSDLLD64.dll` resolves correctly.

---

## Frontend Setup

The React + TypeScript frontend lives in `react_frontend/` and is built with Vite.

### 1. Install Node dependencies

```bash
cd react_frontend
npm install
```

### 2. Configure the backend URL

Create `react_frontend/.env` (or confirm it already exists):

```env
VITE_BACKEND_URL=http://localhost:5003
```

### 3. Start the dev server

```bash
npm run dev -- --host
```

The frontend is available at **http://localhost:5173**.

---

## Running Both Together

Open two terminals side by side:

| Terminal 1 — Backend | Terminal 2 — Frontend |
|---|---|
| `python main.py` | `cd react_frontend && npm run dev` |

Then open **http://localhost:5173** in your browser.

---

## Accessing from Another Device on the Same Network

The backend already listens on all interfaces (`0.0.0.0`) and allows all Socket.IO origins, so no server changes are needed.

### 1. Find your machine's LAN IP

```powershell
ipconfig
# look for IPv4 Address under Wi-Fi or Ethernet, e.g. 192.168.1.42
```

### 2. Update the frontend to point to your LAN IP

Edit `react_frontend/.env`:

```env
VITE_BACKEND_URL=http://192.168.1.42:5003
```

### 3. Start the frontend with `--host`

```bash
cd react_frontend && npm run dev -- --host
```

### 4. Open from the other device

Navigate to `http://192.168.1.42:5173` in the browser on the other device.

> **Note:** If your machine's IP changes (e.g. after reconnecting to Wi-Fi), update `VITE_BACKEND_URL` and restart the frontend dev server.

---

## Changing Ports

Both servers accept a `--port` flag at startup so you never need to edit files.

### Backend on a different port

```bash
python main.py --port 5004
```

Then update `react_frontend/.env` so the frontend points to the new port:

```env
VITE_BACKEND_URL=http://localhost:5004
```

### Frontend on a different port

Vite accepts `--port` natively. Pass `--frontend-port` to the backend as well so CORS stays in sync:

```bash
# Terminal 1
python main.py --frontend-port 5174

# Terminal 2
cd react_frontend && npm run dev -- --port 5174
```

> **Warning:** If Vite's default port (5173) is already in use it will silently pick the next free port (e.g. 5174), which will break CORS. Always pass `--port` and `--frontend-port` together instead of relying on auto-increment.

### Free a port instead (find & kill)

**Windows:**
```powershell
netstat -ano | findstr :5003   # find the PID
taskkill /PID <PID> /F
```

**macOS / Linux:**
```bash
lsof -i :5003   # find the PID
kill -9 <PID>
```

---

## Additional Commands

### Storybook (component development)

```bash
cd react_frontend
npm run storybook   # http://localhost:6006
```

### Log viewer

With the backend running, open:
- **http://localhost:5003/viewlog007** — live log tail
- **http://localhost:5003/viewfulllog007** — full log
