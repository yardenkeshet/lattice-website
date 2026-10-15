# Lattice Maker Server Runbook

Last updated: 2026-10-15

## Overview

Lattice Maker (<https://lattice.cs.technion.ac.il>) runs as two processes behind nginx. nginx serves the built React app as static files and forwards Socket.IO and API calls to the Flask backend on port 5003. The Vite dev server (`npm run dev`) is **not** part of production.

```
                                      files  ┌───────────────────────────────┐
                                   ┌───────► │ React build (dist folder)     │
┌──────────┐  HTTPS  ┌───────────┐ │         │ /, /tool, /assets, other pages│
│ Browser  │ ──────► │ nginx :443│─┤         └───────────────────────────────┘
└──────────┘         └───────────┘ │  proxy  ┌───────────────────────────────┐
                                   └───────► │ Flask + Socket.IO :5003       │
                                             │ /socket.io, API, MSDLL64.dll  │
                                             └───────────────────────────────┘
```

Only nginx faces the internet. Page files come straight from disk; live calculation traffic goes to Flask.

| Part | Folder | Port | What runs it |
| --- | --- | --- | --- |
| nginx (HTTPS, both sites) | `C:\SitesHub\nginx-1.28.2` | 443 | `start nginx` |
| Flask + Socket.IO backend | `C:\SitesHub\prodution\LatticeMaker\lattice-website` | 5003 (localhost only) | `python main.py` |
| React frontend (static build) | `...\lattice-website\react_frontend\dist` | served by nginx | `npm run build` (once per change) |
| TLS certificate + key | `C:\SitesHub\prodution\lattice_p\cert.pem`, `key_nopass.key` | | referenced by nginx.conf |

What nginx sends where, for `lattice.cs.technion.ac.il`:

| URL path | Goes to |
| --- | --- |
| `/socket.io/` | Flask on 127.0.0.1:5003 (WebSocket upgrade) |
| `/convert_igs_to_obj`, `/download-results`, `/log-calculation`, `/calc-log-image`, `/viewlog`, `/viewfulllog`, `/static` | Flask on 127.0.0.1:5003 |
| `/assets/...` | files in `dist/assets` (cached 1 year; names are hashed) |
| everything else (`/`, `/tool`, ...) | files in `dist`, falling back to `dist/index.html` so React routing works |

The source code is on GitHub: `https://github.com/yardenkeshet/lattice-website.git`. Production runs the `main` branch.

## Everyday operations

The site is up when nginx is running and `python main.py` is running. Nothing else needs to stay open. Use a normal CMD window for these commands.

**Check what is running**

```
tasklist /fi "imagename eq nginx.exe"
netstat -ano | findstr "LISTENING" | findstr ":443 :5003"
```

You should see two `nginx.exe` processes and listeners on ports 443 and 5003.

**Start the site**

1. Start nginx if it is not running:

   ```
   cd C:\SitesHub\nginx-1.28.2
   start nginx
   ```

2. Start the backend in its own CMD window and leave it open:

   ```
   cd C:\SitesHub\prodution\LatticeMaker\lattice-website
   python main.py --host 127.0.0.1
   ```

   `--host 127.0.0.1` means only nginx can reach port 5003. You can put `BACKEND_HOST=127.0.0.1` in `.env` instead.

3. Open <https://lattice.cs.technion.ac.il> and load the Tool page.

**Stop or restart the backend**: press Ctrl+C in its CMD window, then run `python main.py --host 127.0.0.1` again. If the window is lost, find the PID with `netstat -ano | findstr :5003` and run `taskkill /pid <PID> /f`.

**Stop or reload nginx** (run from `C:\SitesHub\nginx-1.28.2`): `nginx -s reload` applies config changes without dropping the site; `nginx -s stop` stops it. Reload or stop affects the CDML site too.

## After changing something

What you must redo depends on what changed. Pull the code first (`git pull` in `lattice-website`).

| What changed | What to do | Downtime |
| --- | --- | --- |
| React code (`react_frontend/src`, `public`, `.env.production`) | `cd react_frontend`, then `npm install` if `package.json` changed, then `npm run build` | None; nginx serves the new `dist` at once. Users refresh the page. |
| Python backend (`main.py`, `*.py`, `gershon\MSDLL64.dll`) | `pip install -r requirements.txt` if it changed, then restart `python main.py` | A few seconds; open sessions reconnect |
| nginx.conf | `nginx -t`, then `nginx -s reload` (from `C:\SitesHub\nginx-1.28.2`) | None if `-t` passed |
| TLS certificate | Replace the files in `C:\SitesHub\prodution\lattice_p`, then `nginx -t` and `nginx -s reload` | None |
| New Flask HTTP route | Add the path to the Flask `location ~ ^/(...)` line in nginx.conf, then reload nginx | None |

Two rules for the frontend build:

- Keep `VITE_BACKEND_URL` blank in `react_frontend/.env.production`. Blank means the browser talks to the same address that served the page, and nginx forwards it. A `localhost` value would point each visitor at their own computer.
- If `npm run build` fails, the old `dist` folder may be left half-written. Fix the error and build again before telling users the site is updated.

## When the site is down

The symptom usually tells you which part failed. Work down this list.

| Symptom in the browser | Likely cause | Fix |
| --- | --- | --- |
| Page does not load at all, or a connection error | nginx not running, or port 443 blocked | `tasklist /fi "imagename eq nginx.exe"`; if empty, `start nginx` from `C:\SitesHub\nginx-1.28.2`. Check `logs\error.log` if it exits right away. |
| `502 Bad Gateway` on `/`, `/tool` | nginx.conf still points `location /` at the Vite dev server (port 5173) | Use the reference config below (`root ...\dist` + `try_files`), then `nginx -t` and `nginx -s reload` |
| `404` or `403` on `/` | `react_frontend\dist` missing or empty | `cd react_frontend`, `npm install`, `npm run build` |
| Page loads but nothing calculates, or "disconnected" | Flask backend not running | `netstat -ano \| findstr :5003`; if nothing, start `python main.py --host 127.0.0.1` and read its output for errors |
| `502` only on `/socket.io/` or downloads | Backend crashed or is on another port | Restart the backend; check `BACKEND_PORT` in `.env` matches the 5003 in nginx.conf |
| Upload fails with `413` | File larger than `client_max_body_size` | Keep it at `100M` in the lattice server block |
| Browser certificate warning | Certificate expired or wrong file | Replace the files in `lattice_p`, then reload nginx |
| `start nginx` does nothing, `bind() ... failed` in error.log | Another program holds port 443 or 80 | `netstat -ano \| findstr :443`, then `tasklist /fi "pid eq <PID>"` to see who; `taskkill /f /im nginx.exe` clears stuck nginx copies |

Quick end-to-end check from the server itself, in CMD or PowerShell. Type `curl.exe`, not `curl`: in PowerShell plain `curl` is an alias for Invoke-WebRequest and fails.

```
curl.exe -sk -o NUL -w "%{http_code}" https://lattice.cs.technion.ac.il/
curl.exe -sk -o NUL -w "%{http_code}" "https://lattice.cs.technion.ac.il/socket.io/?EIO=4&transport=polling"
```

Both should print `200`.

After a reboot nothing starts by itself. Start nginx and the backend as in Everyday operations.

## Setting up a new server

A new Windows server needs four installs, a clone, a build and an nginx block. The DNS name `lattice.cs.technion.ac.il` must point at the new machine, and ports 80 and 443 must be open in its firewall.

1. **Install the tools**
   - Python 3.12 or newer (tick "Add to PATH")
   - Node.js 24 LTS (includes npm)
   - Git
   - nginx for Windows: unzip `nginx-1.28.2.zip` to `C:\SitesHub\nginx-1.28.2`
2. **Get the code**

   ```
   mkdir C:\SitesHub\prodution\LatticeMaker
   cd C:\SitesHub\prodution\LatticeMaker
   git clone https://github.com/yardenkeshet/lattice-website.git
   cd lattice-website
   ```

3. **Backend dependencies**

   ```
   python -m venv .venv
   .\.venv\Scripts\python.exe -m pip install -r requirements.txt
   ```

   `gershon\MSDLL64.dll` comes with the repo; no C++ build is needed.
4. **Backend settings**: create `.env` in `lattice-website` with:

   ```
   BACKEND_PORT=5003
   BACKEND_HOST=127.0.0.1
   ```

5. **Build the frontend**

   ```
   cd react_frontend
   npm install
   npm run build
   ```

   Check `react_frontend\.env.production` has `VITE_BACKEND_URL=` blank.
6. **Certificate**: copy `cert.pem` and `key_nopass.key` to `C:\SitesHub\prodution\lattice_p`. The key must have no passphrase, because nginx on Windows cannot prompt for one.
7. **nginx**: paste the reference server block (next section) inside the `http { }` block of `C:\SitesHub\nginx-1.28.2\conf\nginx.conf`. Fix the `root` path if the repo lives elsewhere.
8. **Start nginx**

   ```
   cd C:\SitesHub\nginx-1.28.2
   nginx -t
   start nginx
   ```

9. **Start the backend (python main.py)** in its own window and leave it open:

   ```
   cd C:\SitesHub\prodution\LatticeMaker\lattice-website
   .\.venv\Scripts\python.exe main.py --host 127.0.0.1
   ```

   No venv on this machine? Use `python main.py --host 127.0.0.1` instead. The site does not work until this is running.
10. **Test**: run the curl checks from When the site is down, then do one real calculation on the Tool page.

Optional: to survive reboots without someone logging in, register nginx and the backend as Windows services (for example with NSSM) or as Task Scheduler tasks set to "At startup".

## Reference nginx config

This is the server block live on 2026-10-15 in `C:\SitesHub\nginx-1.28.2\conf\nginx.conf`. The previous version is saved as `nginx.conf.bak-2026-10-15`.

```nginx
server {
    listen 443 ssl;
    server_name lattice.cs.technion.ac.il;

    ssl_certificate "C:/SitesHub/prodution/lattice_p/cert.pem";
    ssl_certificate_key "C:/SitesHub/prodution/lattice_p/key_nopass.key";

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Matches SocketIO's max_http_buffer_size in main.py
    client_max_body_size 100M;

    # Production build of the React app (npm run build in react_frontend)
    root "C:/SitesHub/prodution/LatticeMaker/lattice-website/react_frontend/dist";
    index index.html;

    # React SPA: unknown paths (e.g. /tool) fall back to index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Vite's hashed bundles never change content under the same name
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Socket.IO -> Flask (5003)
    location /socket.io/ {
        proxy_pass http://127.0.0.1:5003;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_buffering off;
    }

    # Flask HTTP routes (see main.py)
    location ~ ^/(convert_igs_to_obj|download-results|log-calculation|calc-log-image|viewlog|viewfulllog|static)(/|$) {
        proxy_pass http://127.0.0.1:5003;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 600s;
    }
}
```

Optional: add a port-80 block that redirects plain `http://` visitors to HTTPS:

```nginx
server {
    listen 80;
    server_name lattice.cs.technion.ac.il;
    return 301 https://$host$request_uri;
}
```

## nginx commands

Run these from `C:\SitesHub\nginx-1.28.2`. The `-s` commands only work while nginx is running.

| Command | What it does |
| --- | --- |
| `start nginx` | Start nginx in the background |
| `nginx -t` | Test nginx.conf for errors; always run before a reload |
| `nginx -s reload` | Apply config changes without dropping connections |
| `nginx -s stop` | Stop now |
| `nginx -s quit` | Stop after current requests finish |
| `nginx -v` | Show the version |
| `tasklist /fi "imagename eq nginx.exe"` | Is nginx running? (expect 2 processes) |
| `taskkill /f /im nginx.exe` | Force-kill all nginx copies (when `-s stop` fails) |

| File | Path |
| --- | --- |
| Config | `conf\nginx.conf` |
| Access log | `logs\access.log` |
| Error log | `logs\error.log` |
| PID file | `logs\nginx.pid` |

## CDML site

The same nginx also serves <https://cdml-public.technion.ac.il>. It forwards everything to a Python app on port 8444, so reloading or stopping nginx affects both sites.

| | |
| --- | --- |
| Folder | `C:\SitesHub\prodution\imageTechnion_p` |
| Start | `cd C:\SitesHub\prodution\imageTechnion_p`, then `python app.py` |
| Port | 8444 (nginx proxies 443 to it) |
| Certificate | `Cert_cdml.pem` and `private_nopass_cdml.pem` in the same folder |

## Logs

The backend log is the first place to look when calculations fail.

| Log | Location | How to view |
| --- | --- | --- |
| Backend (rotating, 5 MB x 3) | `lattice-website\lattice.log` | Browser: [/viewlog](https://lattice.cs.technion.ac.il/viewlog) (live tail) or [/viewfulllog](https://lattice.cs.technion.ac.il/viewfulllog) |
| Calculation history | `lattice-website\calc_log\log.jsonl` and `calc_log\images` | Any text viewer |
| nginx errors | `C:\SitesHub\nginx-1.28.2\logs\error.log` | Any text viewer |
| nginx requests | `C:\SitesHub\nginx-1.28.2\logs\access.log` | Any text viewer |

Desktop viewers for large logs:

- **toolong** (terminal): `pip install toolong`, then `tl lattice.log`
- **Tailviewer** (Windows app): [kittyfisto.github.io/Tailviewer](https://kittyfisto.github.io/Tailviewer/)
- **Log Voyager** (in the browser, opens a local file): [logvoyager.cc](https://www.logvoyager.cc/)

## Windows helpers

| Command | What it shows |
| --- | --- |
| `netstat -ano \| findstr :443` | What is using port 443 (last column = PID) |
| `netstat -ano \| findstr :5003` | Is the Flask backend listening |
| `netstat -ano \| findstr LISTENING` | All listening ports |
| `netstat -an -p tcp` / `-p udp` | TCP or UDP connections only |
| `netstat -ab` | Connections with program names (run CMD as Administrator) |
| `tasklist /fi "pid eq 1234"` | Which program has PID 1234 |
| `taskkill /pid 1234 /f` | Kill PID 1234 |
| `ncpa.cpl` | Network adapters; Properties, then Internet Protocol Version 4 (TCP/IPv4) for the DMZ IP settings |

nginx also shows in Task Manager under Background processes.
