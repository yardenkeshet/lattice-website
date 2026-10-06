# Sanity / End-to-End Test Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the five zero-coverage backend HTTP routes, add one real-DLL (no monkeypatch) full-pipeline sanity test, add a focused 4-scenario Playwright end-to-end suite, and tie all three layers together behind one `run_all_tests.sh`.

**Architecture:** Backend additions are plain `pytest` files following every existing convention in `tests/` (Flask's in-process `app.test_client()`/`socketio.test_client()` — no running server required). The Playwright suite is new (`react_frontend/e2e/`), built on the `playwright` package already installed for Storybook's browser-mode tests, requiring a new `@playwright/test` devDependency and its own config — it needs both real servers (`python main.py` on :5003, `npm run dev` on :5173) already running, since it drives an actual browser against the real app.

**Tech Stack:** pytest 9.1.1 (existing), Flask-SocketIO 5.6.1 test client (existing), Playwright (already installed) + `@playwright/test` (new), bash (`run_all_tests.sh`).

**Spec:** `docs/superpowers/specs/2026-10-04-sanity-e2e-tests-design.md`

## Global Constraints

- No existing test file is modified — only new files are added.
- Backend sanity tests never require a separately running server — same `app.test_client()`/`socketio.test_client()` pattern as every existing test in `tests/`.
- The Playwright suite's config does **not** start or stop the dev servers itself (per the spec's explicit non-goal) — a connection failure should surface a clear message, not a cryptic timeout.
- The 4 pre-existing, known, unrelated frontend unit-test failures (stale `'stl'`/`'token'` naming in `httpClient.test.ts`/`socketClient.test.ts`) are never silenced, special-cased, or treated as newly broken by any task in this plan.
- `igs/ExtrudeSrf.igs` (2132 bytes, already in the repo) is the one real fixture file used by both the real-DLL backend test and the Playwright happy-path test — no new fixture files are added.
- Real DLL calls are allowed to be the slowest tests in the suite (generous timeouts: 30s backend-side, up to 30s for the Playwright overlay-hidden wait) — this is expected for the one or two tests that deliberately exercise real native code, not a problem to engineer around.

---

### Task 1: Backend HTTP route coverage

**Files:**
- Create: `tests/test_http_routes.py`

**Interfaces:**
- Consumes: `main_module.app`, `main_module.CALC_LOG_IMAGES_DIR`, `main_module.DOWNLOAD_CACHE`, `main_module.LAST_RESULTS_DIR` — all already exist, no production code changes.
- Produces: nothing consumed by later tasks (fully self-contained).

- [ ] **Step 1: Write the test file**

Create `tests/test_http_routes.py`:

```python
"""Coverage for the backend HTTP routes that had zero tests before this
plan: /, /viewlog, /viewfulllog, /calc-log-image/<name>, /download-results.
Every other route and SocketIO handler already has coverage elsewhere in
this directory."""
import os

import main as main_module


def test_index_returns_200():
    client = main_module.app.test_client()
    resp = client.get('/')
    assert resp.status_code == 200
    assert resp.content_type.startswith('text/html')


def test_viewlog_renders_shared_script_with_surface_level_defaults():
    client = main_module.app.test_client()
    resp = client.get('/viewlog')
    assert resp.status_code == 200
    assert resp.content_type.startswith('text/html')
    body = resp.get_data(as_text=True)
    assert 'initLogViewer(' in body
    assert "defaultLevels: ['INFO', 'WARNING', 'ERROR']" in body


def test_viewfulllog_renders_shared_script_with_full_detail_defaults():
    client = main_module.app.test_client()
    resp = client.get('/viewfulllog')
    assert resp.status_code == 200
    body = resp.get_data(as_text=True)
    assert 'initLogViewer(' in body
    assert "defaultLevels: ['INFO', 'DEBUG', 'WARNING', 'ERROR']" in body


def test_calc_log_image_404s_for_missing_file():
    client = main_module.app.test_client()
    resp = client.get('/calc-log-image/does-not-exist.png')
    assert resp.status_code == 404


def test_calc_log_image_400s_for_non_png_name():
    # safe_name != name OR the extension check rejects this — a non-.png
    # name is the simplest, platform-independent way to exercise that
    # guard without relying on how a given OS's os.path.basename treats
    # path separators embedded in a URL segment.
    client = main_module.app.test_client()
    resp = client.get('/calc-log-image/notes.txt')
    assert resp.status_code == 400


def test_calc_log_image_serves_an_existing_png():
    name = 'sanity-test-image.png'
    path = os.path.join(main_module.CALC_LOG_IMAGES_DIR, name)
    png_bytes = b'\x89PNG\r\n\x1a\nnot a real png, just test bytes'
    with open(path, 'wb') as f:
        f.write(png_bytes)
    try:
        client = main_module.app.test_client()
        resp = client.get(f'/calc-log-image/{name}')
        assert resp.status_code == 200
        assert resp.content_type == 'image/png'
        assert resp.get_data() == png_bytes
    finally:
        os.remove(path)


def test_download_results_get_is_405():
    client = main_module.app.test_client()
    resp = client.get('/download-results')
    assert resp.status_code == 405


def test_download_results_invalid_token_is_404():
    client = main_module.app.test_client()
    resp = client.post('/download-results', data={'token': 'not-a-real-token', 'file_type': 'stl'})
    assert resp.status_code == 404


def test_download_results_happy_path(monkeypatch, tmp_path):
    token = 'sanity-test-token'
    out_folder = tmp_path / token
    out_folder.mkdir()
    stl_path = out_folder / 'result.stl'
    stl_path.write_text('solid sanity\nendsolid sanity\n')

    # os.path.join(os.getcwd(), LAST_RESULTS_DIR, token) resets to the
    # absolute tmp_path once LAST_RESULTS_DIR itself is absolute — this is
    # documented os.path.join behavior (a later absolute component discards
    # everything before it), so this monkeypatch correctly redirects the
    # route to tmp_path without needing to also patch os.getcwd().
    monkeypatch.setattr(main_module, 'LAST_RESULTS_DIR', str(tmp_path))
    monkeypatch.setitem(main_module.DOWNLOAD_CACHE, token, {
        'sid': 'sanity-sid', 'out_stl': 'result.stl', 'out_igs': 'result.igs',
    })

    client = main_module.app.test_client()
    resp = client.post('/download-results', data={'token': token, 'file_type': 'stl'})
    assert resp.status_code == 200
    assert resp.mimetype == 'model/stl'
    assert resp.get_data(as_text=True) == 'solid sanity\nendsolid sanity\n'


def test_download_results_unknown_file_type_is_400(monkeypatch, tmp_path):
    token = 'sanity-test-token-2'
    monkeypatch.setattr(main_module, 'LAST_RESULTS_DIR', str(tmp_path))
    monkeypatch.setitem(main_module.DOWNLOAD_CACHE, token, {
        'sid': 'sanity-sid', 'out_stl': 'result.stl', 'out_igs': 'result.igs',
    })

    client = main_module.app.test_client()
    resp = client.post('/download-results', data={'token': token, 'file_type': 'obj'})
    assert resp.status_code == 400
```

- [ ] **Step 2: Run the new tests**

Run: `.venv/Scripts/python -m pytest tests/test_http_routes.py -v`
Expected: 10 passed.

- [ ] **Step 3: Run the full backend suite to confirm nothing else broke**

Run: `.venv/Scripts/python -m pytest tests/ -v`
Expected: all previously-passing tests still pass, plus these 10 new ones.

- [ ] **Step 4: Commit**

```bash
git add tests/test_http_routes.py
git commit -m "test(backend): add coverage for the 5 previously-untested HTTP routes"
```

---

### Task 2: Real-DLL sanity test

**Files:**
- Create: `tests/test_real_dll_sanity.py`

**Interfaces:**
- Consumes: `main_module.app`, `main_module.socketio`, `igs/ExtrudeSrf.igs` (repo-relative path, assumes pytest is invoked from the repo root — the same assumption every existing test and `main.py` itself already makes for `DATA_DIR`/`LAST_RESULTS_DIR`/etc.).
- Produces: nothing consumed by later tasks.

**Important:** unlike every other calculation test in this repo, this test does **not** monkeypatch `CALC_MODE_DISPATCH`. It is allowed to take several real seconds — that's the point.

- [ ] **Step 1: Write the test file**

Create `tests/test_real_dll_sanity.py`:

```python
"""The one test in this suite that does NOT monkeypatch the DLL dispatch —
it exercises the real native engine (gershon/MSDLL64.dll), the real queue,
and a real download, proving the whole pipeline genuinely works end to
end. Allowed to be the slowest test in the suite; that's expected for
real native code, not a problem to engineer around."""
import base64
import gzip
import time

import main as main_module

IGS_PATH = 'igs/ExtrudeSrf.igs'


def _wait_until(predicate, timeout=30.0, interval=0.05):
    """Mirrors the helper of the same name already duplicated across
    tests/test_calc_queue.py and tests/test_calculate_queue_integration.py."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        if predicate():
            return True
        time.sleep(interval)
    return predicate()


def test_real_calculation_through_the_actual_dll_and_download():
    with open(IGS_PATH, 'rb') as f:
        igs_bytes = f.read()

    payload = {
        'filename': 'ExtrudeSrf.igs',
        'surface_b64': base64.b64encode(igs_bytes).decode('ascii'),
        'client_ts': time.time() * 1000,
        'args': {
            'tileType': 'diagonal', 'calcMode': 'extrusion',
            'nt1': 1, 'nt2': 1, 'nt3': 10,
            'g1': 0.2, 'g2': 1.5, 'p1': 0.25, 'p2': 0.25, 'p3': 0.3,
            'extrudeLength': 10.0,
        },
    }

    client = main_module.socketio.test_client(main_module.app)
    try:
        client.get_received()
        client.emit('calculate', payload)

        events = []

        def got_result():
            events.extend(client.get_received())
            return any(e['name'] == 'result' for e in events)

        assert _wait_until(got_result, timeout=30.0), "real DLL calculation did not complete in time"

        result = next(e for e in events if e['name'] == 'result')['args'][0]
        assert result['kind'] == 'model_stl'
        assert result['stl_gz_b64']
        decoded = gzip.decompress(base64.b64decode(result['stl_gz_b64'])).decode('ascii')
        assert 'solid' in decoded and 'endsolid' in decoded

        token = result['download_token']
        assert token

        download_client = main_module.app.test_client()
        resp = download_client.post('/download-results', data={'token': token, 'file_type': 'stl'})
        assert resp.status_code == 200
        downloaded = resp.get_data(as_text=True)
        assert 'solid' in downloaded and 'endsolid' in downloaded
    finally:
        # Disconnecting triggers the real on_disconnect cleanup path
        # (removes client_data/<sid>/ and last_results/<token>/) — the
        # same as a real browser tab closing. This test writes real files
        # under the real (non-monkeypatched) directories and must not
        # leave them behind, pass or fail.
        client.disconnect()
```

- [ ] **Step 2: Run the new test**

Run: `.venv/Scripts/python -m pytest tests/test_real_dll_sanity.py -v`
Expected: 1 passed (takes several real seconds — this is expected).

- [ ] **Step 3: Confirm the real directories were cleaned up**

Run this exact sequence from the repo root to prove the test's `finally: client.disconnect()` block actually removed what it created, not just that the test passed:

```bash
ls client_data/ > /tmp_before_cd.txt 2>/dev/null; ls last_results/ > /tmp_before_lr.txt 2>/dev/null
.venv/Scripts/python -m pytest tests/test_real_dll_sanity.py -v
ls client_data/ > /tmp_after_cd.txt 2>/dev/null; ls last_results/ > /tmp_after_lr.txt 2>/dev/null
diff /tmp_before_cd.txt /tmp_after_cd.txt
diff /tmp_before_lr.txt /tmp_after_lr.txt
```

Expected: both `diff` commands produce no output (identical before/after listings) — confirms no `client_data/<sid>/` or `last_results/<token>/` folder was left behind. If either `diff` shows a new entry, the cleanup isn't working — stop and report this as a BLOCKED/DONE_WITH_CONCERNS condition rather than committing, since it means the test pollutes the repo's real working directories on every run.

- [ ] **Step 4: Run the full backend suite**

Run: `.venv/Scripts/python -m pytest tests/ -v`
Expected: all previously-passing tests plus Task 1's 10 and this task's 1 all pass.

- [ ] **Step 5: Commit**

```bash
git add tests/test_real_dll_sanity.py
git commit -m "test(backend): add a real-DLL (no monkeypatch) full-pipeline sanity test"
```

---

### Task 3: Playwright infrastructure

**Files:**
- Modify: `react_frontend/package.json` (add `@playwright/test` devDependency)
- Create: `react_frontend/playwright.config.ts`
- Modify: `react_frontend/.gitignore` (add Playwright artifact directories)

**Interfaces:**
- Produces: a working `npx playwright test` command in `react_frontend/`, and a `react_frontend/e2e/` directory for Tasks 4-5 to add spec files into.
- Consumes: nothing from earlier tasks.

- [ ] **Step 1: Add the `@playwright/test` devDependency**

In `react_frontend/package.json`, the `devDependencies` block currently has (among others):

```json
    "playwright": "^1.59.1",
```

Add a new line right before it (alphabetical order, matching the rest of the block):

```json
    "@playwright/test": "^1.59.1",
    "playwright": "^1.59.1",
```

Run (from `react_frontend/`): `npm install`
Expected: installs cleanly, no version conflicts (both packages pinned to the same `1.59.x` line as the already-installed `playwright` core).

- [ ] **Step 2: Create the Playwright config**

Create `react_frontend/playwright.config.ts`:

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  // Serial, not parallel: the real-DLL-backed happy-path test shares the
  // same backend DLL slot as any other concurrent calculation — running
  // E2E workers in parallel would introduce queue-contention flakiness
  // that has nothing to do with whether the app actually works.
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
});
```

- [ ] **Step 3: Ignore Playwright's own output directories**

In `react_frontend/.gitignore`, currently ending with:

```
*storybook.log
storybook-static
```

Add after it:

```

# Playwright
/test-results/
/playwright-report/
```

- [ ] **Step 4: Verify the config loads (no spec files exist yet, so this should report "no tests found" rather than erroring)**

Run (from `react_frontend/`): `npx playwright test --list`
Expected: exits cleanly, reports zero tests found (not a config/dependency error) — confirms `@playwright/test` installed correctly and `playwright.config.ts` is valid before Tasks 4-5 add real spec files.

- [ ] **Step 5: Commit**

```bash
git add react_frontend/package.json react_frontend/package-lock.json react_frontend/playwright.config.ts react_frontend/.gitignore
git commit -m "chore(frontend): add Playwright E2E test infrastructure"
```

---

### Task 4: Playwright specs — app loads, log viewer navigation

**Files:**
- Create: `react_frontend/e2e/app-loads.spec.ts`
- Create: `react_frontend/e2e/log-viewer.spec.ts`

**Interfaces:**
- Consumes: Task 3's `playwright.config.ts` (`baseURL: 'http://localhost:5173'`).
- Produces: nothing consumed by later tasks.

**Before running this task's tests:** both `python main.py` (port 5003) and `npm run dev` (port 5173) must already be running — confirm with the implementer brief that they are, or start them, before Step 2/3 below. These tests do not start the servers themselves (Global Constraints).

- [ ] **Step 1: Write the two spec files**

Create `react_frontend/e2e/app-loads.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test('home page loads with no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/');
  await expect(page).toHaveTitle('Lattice Maker');

  expect(errors, `Console/page errors on home page: ${errors.join('; ')}`).toEqual([]);
});

test('tool page loads with no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/tool');
  await expect(page.getByRole('button', { name: 'Make Lattice' })).toBeVisible();

  expect(errors, `Console/page errors on tool page: ${errors.join('; ')}`).toEqual([]);
});
```

Create `react_frontend/e2e/log-viewer.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

const BACKEND_URL = 'http://localhost:5003';

test('viewlog and viewfulllog render and cross-navigate correctly', async ({ page }) => {
  await page.goto(`${BACKEND_URL}/viewlog`);
  await expect(page.locator('h1')).toContainText('Live');
  await expect(page.getByText('Full detail →')).toBeVisible();

  await page.getByText('Full detail →').click();
  await expect(page).toHaveURL(`${BACKEND_URL}/viewfulllog`);
  await expect(page.locator('h1')).toContainText('Full Detail');
  await expect(page.getByText('← Surface view')).toBeVisible();

  await page.getByText('← Surface view').click();
  await expect(page).toHaveURL(`${BACKEND_URL}/viewlog`);
  await expect(page.locator('h1')).toContainText('Live');
});
```

- [ ] **Step 2: Run these two spec files**

Run (from `react_frontend/`, with both servers already running): `npx playwright test app-loads.spec.ts log-viewer.spec.ts`
Expected: 3 passed (2 in app-loads, 1 in log-viewer).

- [ ] **Step 3: Commit**

```bash
git add react_frontend/e2e/app-loads.spec.ts react_frontend/e2e/log-viewer.spec.ts
git commit -m "test(e2e): add app-loads and log-viewer Playwright specs"
```

---

### Task 5: Playwright specs — happy path, error path

**Files:**
- Create: `react_frontend/e2e/happy-path.spec.ts`
- Create: `react_frontend/e2e/error-path.spec.ts`

**Interfaces:**
- Consumes: Task 3's `playwright.config.ts`, `igs/ExtrudeSrf.igs` (repo-root-relative fixture, same file Task 2's backend test uses).
- Produces: nothing consumed by later tasks.

**Before running this task's tests:** both `python main.py` and `npm run dev` must already be running (same as Task 4).

- [ ] **Step 1: Write the two spec files**

Create `react_frontend/e2e/error-path.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test('clicking Make Lattice without an uploaded file shows a visible error', async ({ page }) => {
  await page.goto('/tool');
  await page.getByRole('button', { name: 'Make Lattice' }).click();

  const alert = page.getByRole('alert');
  await expect(alert).toBeVisible();
  await expect(alert).toContainText('Please upload a 3D file first');
});
```

Create `react_frontend/e2e/happy-path.spec.ts`:

```typescript
import path from 'path';
import { test, expect } from '@playwright/test';

const IGS_FIXTURE = path.resolve(__dirname, '../../igs/ExtrudeSrf.igs');

test('upload, calculate, and export a real lattice end to end', async ({ page }) => {
  await page.goto('/tool');

  await page.locator('input[type="file"]').setInputFiles(IGS_FIXTURE);

  const exportButton = page.getByRole('button', { name: 'Export Lattice' });
  await expect(exportButton).toBeDisabled();

  await page.getByRole('button', { name: 'Make Lattice' }).click();

  // The calculation overlay (role="alertdialog") appears, then must
  // disappear once the real DLL finishes — generous timeouts, this is a
  // real native calculation against the real backend, not a mock.
  await expect(page.getByRole('alertdialog')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('alertdialog')).toBeHidden({ timeout: 30_000 });

  await expect(exportButton).toBeEnabled();

  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box?.width).toBeGreaterThan(0);
  expect(box?.height).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run these two spec files**

Run (from `react_frontend/`, with both servers already running): `npx playwright test happy-path.spec.ts error-path.spec.ts`
Expected: 2 passed (happy-path takes several real seconds — the real backend is running a real DLL calculation, same as Task 2's backend test).

- [ ] **Step 3: Commit**

```bash
git add react_frontend/e2e/happy-path.spec.ts react_frontend/e2e/error-path.spec.ts
git commit -m "test(e2e): add happy-path and error-path Playwright specs"
```

---

### Task 6: The single run-everything command, and documenting it

**Files:**
- Create: `run_all_tests.sh` (repo root)
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: every prior task's test files (runs them all).
- Produces: nothing — this is the final integration task.

- [ ] **Step 1: Create the script**

Create `run_all_tests.sh` at the repo root:

```bash
#!/usr/bin/env bash
set -uo pipefail
# Not -e: every layer should run even if an earlier one fails, so the
# summary at the end reports all three results, not just the first failure.

overall_status=0

echo "=== Backend (pytest) ==="
if ! .venv/Scripts/python -m pytest tests/ -v; then
  echo "❌ Backend tests FAILED"
  overall_status=1
else
  echo "✅ Backend tests passed"
fi

echo ""
echo "=== Frontend unit tests (vitest) ==="
if ! (cd react_frontend && npx vitest run --project unit); then
  echo "❌ Frontend unit tests FAILED (note: 4 known pre-existing failures in httpClient.test.ts/socketClient.test.ts are expected here — see CLAUDE.md)"
  overall_status=1
else
  echo "✅ Frontend unit tests passed"
fi

echo ""
echo "=== End-to-end tests (Playwright) — requires python main.py and npm run dev already running ==="
if ! (cd react_frontend && npx playwright test); then
  echo "❌ End-to-end tests FAILED (if these look like connection errors, confirm both servers are running: python main.py on :5003, npm run dev on :5173)"
  overall_status=1
else
  echo "✅ End-to-end tests passed"
fi

echo ""
if [ "$overall_status" -eq 0 ]; then
  echo "✅ All test layers passed."
else
  echo "❌ One or more test layers failed — see above."
fi
exit "$overall_status"
```

- [ ] **Step 2: Make it executable**

Run: `chmod +x run_all_tests.sh`

- [ ] **Step 3: Document it in CLAUDE.md**

In `CLAUDE.md`, immediately after the existing `## Running the Application` section (before `## Architecture`), add a new section:

```markdown
## Testing

Three layers, each runnable independently or all together:

```bash
# Backend (self-contained, no server needs to be running)
.venv/Scripts/python -m pytest tests/ -v

# Frontend unit tests (self-contained, no server needs to be running)
cd react_frontend && npx vitest run --project unit

# End-to-end tests (requires `python main.py` AND `npm run dev` already running in two other terminals)
cd react_frontend && npx playwright test

# Or all three at once:
./run_all_tests.sh
```

`tests/test_real_dll_sanity.py` and `react_frontend/e2e/happy-path.spec.ts` both exercise the real native DLL (not a mock) — expect those two specifically to take several real seconds, unlike the rest of the suite.

Two frontend unit tests in `httpClient.test.ts` and two in `socketClient.test.ts` are known, pre-existing failures (stale `'stl'`/`'token'` result-kind naming vs. the current `'tile_stl'`/`'model_stl'`) — unrelated to this test suite, not something `run_all_tests.sh` fixes or hides.
```

- [ ] **Step 4: Run the whole thing for real**

Start `python main.py` and `npm run dev` in two separate terminals (or background processes), then from the repo root: `./run_all_tests.sh`
Expected: backend layer passes fully; frontend unit layer shows the 4 known pre-existing failures and nothing else; E2E layer passes fully (5 specs: app-loads ×2, log-viewer ×1, error-path ×1, happy-path ×1 — 5 total). Confirm the overall exit code is non-zero *only* because of the 4 known frontend failures (which were already failing before this plan) — if the E2E or backend layers show anything beyond what's described above, stop and report rather than committing.

- [ ] **Step 5: Commit**

```bash
git add run_all_tests.sh CLAUDE.md
git commit -m "feat: add run_all_tests.sh tying backend, frontend, and E2E test layers together"
```

---

## Self-Review Notes (for the plan author, not a task)

- **Spec coverage:** §1 (backend route coverage) → Task 1. §2 (real-DLL sanity) → Task 2. §3 (Playwright suite) → Tasks 3-5. §4 (single command) → Task 6. Every spec section has a task.
- **Task ordering:** Tasks 1-2 (backend) and Tasks 3-5 (frontend/E2E) are independent of each other and could in principle run in either order; Tasks 4 and 5 both depend on Task 3's config/devDependency existing. Task 6 depends on everything existing, since it runs all of it as a final integration check. Dispatch order in this plan (1, 2, 3, 4, 5, 6) satisfies every real dependency.
- **Type/interface consistency checked:** the real-DLL test's payload shape (Task 2) matches `_calc_payload()`'s shape from `tests/test_calculate_queue_integration.py` exactly (same keys: `filename`, `surface_b64`, `client_ts`, `args` with the same sub-keys) — not copied verbatim since it needs the real `igs/ExtrudeSrf.igs` bytes and specific tile params instead of the existing helper's dummy bytes, but the shape is intentionally identical so a reviewer can cross-check it against the established pattern. The exact DOM text asserted in `log-viewer.spec.ts` ("Live" / "Full Detail" / "Full detail →" / "← Surface view") was verified character-for-character against the actual current `templates/log_view.html` / `templates/full_log_view.html` source (not assumed from how the CSS visually renders them in uppercase) — a prior draft of this plan would have gotten this wrong by matching the visual ALL-CAPS rendering instead of the real DOM text content.
