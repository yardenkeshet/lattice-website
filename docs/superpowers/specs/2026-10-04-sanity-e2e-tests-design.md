# Sanity / End-to-End Test Suite — Design Spec

**Date:** 2026-10-04
**Target branch:** continuing directly on `enhanced-logging` (not a new branch). That branch is still open/unmerged and currently what's running in the live worktree this was brainstormed against — several tests described below (the `/viewlog`/`/viewfulllog` route tests, the `log-viewer.spec.ts` Playwright test) assert on the DEBUG-default/config literals and the shared `log_viewer.js` structure that only exist on `enhanced-logging`, not yet on `queue`. If `enhanced-logging` merges before this is implemented, the same tests apply unchanged on `queue`.
**Files primarily affected:** new test files under `tests/` (backend) and a new `react_frontend/e2e/` directory, plus a new root-level `run_all_tests.sh`

---

## Context

A coverage sweep of the codebase found:

**Backend (`main.py`):** every SocketIO handler (`calculate`, `calculate_tile`, `connect`, `disconnect`) and the queue/DLL-lane machinery around them are already well covered by `tests/test_calc_queue.py`, `tests/test_calculate_queue_integration.py`, `tests/test_dll_*.py`, etc. — but **five HTTP routes have zero test coverage**: `/` (index), `/viewlog`, `/viewfulllog`, `/calc-log-image/<name>`, and `/download-results` (the route every result actually leaves the server through). Additionally, every existing test that exercises the calculation pipeline monkeypatches the DLL dispatch functions for speed and determinism (`_install_fake_revolution` and similar) — there is no test anywhere that proves the real native DLL, wired through the real queue and the real HTTP/SocketIO layer, actually produces a correct result end to end.

**Frontend (`react_frontend/src/`):** unit tests exist for the API layer (`httpClient.ts`, `socketClient.ts`) and a handful of pure-logic `lib/` modules (`cameraFit.ts`, `displayedLayers.ts`, `logViewerShortcut.ts`, `progressDisplay.ts`). The page that orchestrates the entire tool (`ToolPage.tsx`, by far the largest and most stateful file in the frontend) has no tests at all, and neither does any UI component. More importantly: **there is no test anywhere that drives the actual rendered application** — nothing proves the React UI and the Flask backend are correctly wired together, only that each side behaves correctly in isolation.

**No single command runs everything.** `react_frontend/package.json` has no `test` script at all (existing vitest runs have always been invoked directly: `npx vitest run --project unit`). There is no root-level script of any kind. Someone picking up this project cold has no documented way to check "did I break anything."

Per the brainstorming conversation, the goal here is **not** to reach high unit-test coverage of every presentational component — most of `react_frontend/src/components/ui/` is low-risk, mostly-presentational code where a unit test would mainly restate the implementation. The goal is **sanity**: a small number of tests that, if they pass, give real confidence the whole system — real backend, real DLL, real rendered page — actually works, runnable by one command.

## Goals

- Close the five zero-coverage backend HTTP routes with straightforward, fast tests (self-contained, no running server needed — same `app.test_client()`/`socketio.test_client()` pattern every existing backend test already uses).
- Add one backend test that exercises the real, un-mocked native DLL through the real queue and real HTTP/SocketIO surface — upload a real `.igs` file, calculate, download the result — the one test that actually proves the native pipeline works, not just the orchestration around it.
- Add a focused Playwright end-to-end suite (new `@playwright/test` devDependency — `playwright` core is already present for Storybook's browser-mode tests, so this is a thin addition, not a new toolchain) covering four user journeys: the app loads cleanly, the full upload→calculate→result→export happy path, one error path surfaces visibly in the UI, and both log-viewer pages load with working cross-navigation.
- One `run_all_tests.sh` at the repo root that runs all three layers (backend pytest, frontend vitest, Playwright E2E) and reports a clear per-layer and overall pass/fail.

## Non-Goals

- **Not** adding unit tests for every untested React component or for `ToolPage.tsx` itself. That's a legitimate future improvement but a different, much larger effort than "sanity tests" — out of scope here.
- **Not** making the run-everything command start/stop the backend and frontend dev servers itself. Per the brainstorming conversation, the script assumes `python main.py` and `npm run dev` are already running (true for the Playwright layer, which genuinely needs them; the backend pytest and frontend vitest layers don't need either server running at all, since they're self-contained the same way every existing test in this repo already is).
- **Not** replacing or modifying any existing test. This only adds new files.
- **Not** adding CI configuration (GitHub Actions, etc.) — purely a locally-runnable suite, matching what was asked for.

---

## 1. Backend HTTP route coverage

New file: `tests/test_http_routes.py`. Each test follows the exact pattern every existing backend test already uses — `main_module.app.test_client()`, no running server required.

- **`GET /`** — returns 200 and renders `index.html` (content-type `text/html`).
- **`GET /viewlog`** — returns 200, content-type `text/html`, and the response body contains `initLogViewer(` (confirms the shared script is wired in, not just that *some* page rendered) and `defaultLevels: ['INFO', 'WARNING', 'ERROR']` (confirms the surface-level default survived — this is exactly the config this session built and verified live; a test should have caught any regression instead of relying on manual browser checks).
- **`GET /viewfulllog`** — same shape, but asserts the inverse config: `defaultLevels: ['INFO', 'DEBUG', 'WARNING', 'ERROR']`.
- **`GET /calc-log-image/<name>`** — three cases: a `.png` name that doesn't exist on disk returns 404; a name containing `..` or a path separator returns 400 (the existing `safe_name != name` guard); and — reusing the pattern already established in `tests/test_upload_persistence.py` — write a real file into `CALC_LOG_IMAGES_DIR` first, then confirm the route serves it back with `mimetype='image/png'`.
- **`GET /download-results`** — this route is `POST`-only (confirm `GET` returns 405, matching the pattern `tests/test_logging_safety_net.py`'s 405 test already established for a different route); then `POST` with no `token`/`file_type` form fields returns the existing "invalid/expired token" 404 path; then a full happy-path case: monkeypatch `DOWNLOAD_CACHE` with a fabricated entry pointing at a real temp file under `last_results/<token>/`, `POST` with that token and `file_type='stl'`, and confirm the response is a 200 file download with the correct filename and content matching what was written to disk.

## 2. Real-DLL sanity test

New file: `tests/test_real_dll_sanity.py`. Unlike every other calculation test in this repo, this one does **not** monkeypatch `CALC_MODE_DISPATCH` or `do_Ruling` — it lets the real request reach the real `gershon/MSDLL64.dll` through the real `CalcQueueManager` and the real HTTP/SocketIO layer, the same code path a real browser session takes.

- Uses `igs/ExtrudeSrf.igs` (already in the repo, 2 KB) with a small tile grid (`nt1=1, nt2=1, nt3=10`, extrusion mode, diagonal tiles — the exact combination already manually verified live earlier in this session, known to complete in a few seconds) to keep the test fast.
- Drives it through `main_module.socketio.test_client(main_module.app)`, emits a real `calculate` event, waits for the `result` event (reusing the `_wait_until` helper pattern from `tests/test_calculate_queue_integration.py`), with a generous timeout (30s) since this is genuinely invoking the native DLL, not a fake.
- Asserts: the result's `kind` is `'model_stl'`, `stl_gz_b64` is non-empty and actually gzip-decodes to text containing `solid`/`endsolid` (real ASCII STL, not a stub), and `download_token` is present.
- Follows up with a real `POST /download-results` using that token and confirms the downloaded file round-trips correctly — proving the full real pipeline (DLL → compression → socket emit → HTTP download) works, not just one piece of it in isolation.
- This test is allowed to be noticeably slower than the rest of the suite (real native code, real file I/O) — that's expected and fine for one sanity test; it is not a pattern to repeat elsewhere.

## 3. Playwright end-to-end suite

New directory: `react_frontend/e2e/`, new devDependency `@playwright/test` (pinned to `^1.59.1` to match the already-installed `playwright` core), new `react_frontend/playwright.config.ts` with `baseURL: 'http://localhost:5173'` and no `webServer` block (per the non-goal above — it does not start the dev server itself; a failed connection to `:5173` or `:5003` should produce a clear "is the dev server running?" failure message, not a cryptic timeout).

Four spec files, each one focused journey:

- **`e2e/app-loads.spec.ts`** — navigate to `/`, then `/tool`; assert the page title and a known heading element are visible; assert no `console.error` or `pageerror` events fired during either navigation (Playwright's `page.on('console')`/`page.on('pageerror')` listeners, asserted empty at the end).
- **`e2e/happy-path.spec.ts`** — navigate to `/tool`, upload `igs/ExtrudeSrf.igs` via the file input (same fixture file the backend real-DLL test uses — one real input file for the whole suite, not scattered fixtures), click "Make Lattice," wait for the calculation overlay to appear and then disappear (bounded timeout — this is the real backend + real DLL, so budget generously, ~30s), then assert the "Export Lattice" button is enabled and the 3D viewer canvas is present and non-empty (a `<canvas>` element exists and has nonzero width/height — Playwright can't easily assert *rendered pixels* without a visual-diff setup, which is out of scope, but presence + sizing is a real, cheap signal the viewer mounted).
- **`e2e/error-path.spec.ts`** — trigger a validation error visible in the UI (e.g., attempt to calculate before uploading a file, or upload something that fails IGS conversion) and assert the UI's error message area becomes visible with non-empty text.
- **`e2e/log-viewer.spec.ts`** — navigate to `http://localhost:5003/viewlog` directly (cross-origin from the Vite dev server, which is fine — Playwright navigates wherever it's told), assert the page heading and toolbar render; click the "Full detail →" link, assert it lands on `/viewfulllog` with the inverse heading; click "← Surface view," assert it's back on `/viewlog`. This is the exact manual check already performed live in this session — worth having as a permanent regression test given how much the two-page structure was reworked.

## 4. The single run-everything command

New file: `run_all_tests.sh` at the repo root. Plain bash (matches this project's Windows + Git Bash development environment). Structure:

```bash
#!/usr/bin/env bash
set -uo pipefail
# (not -e: we want every layer to run even if an earlier one fails, so the
# summary at the end reports all three results, not just the first failure)

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
  echo "❌ Frontend unit tests FAILED"
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

(The exact venv path, pytest invocation, and vitest project name above already match every example used throughout this session — the implementation plan will confirm each against the actual repo state rather than assume this snippet is final.)

The known-pre-existing 4 frontend unit-test failures (stale `'stl'`/`'token'` naming in `httpClient.test.ts`/`socketClient.test.ts`, present since before this session's work and unrelated to it) are **not** silenced or special-cased here — they'll show up as a failing layer until someone fixes them, which is honest default behavior for a "did I break anything" script. The implementation plan should note this clearly in the script's own output or in accompanying documentation, not paper over it.

---

## Data Flow Summary

```
run_all_tests.sh
  ├─ pytest tests/                           (self-contained, no server needed)
  │    ├─ existing suite (unchanged)
  │    ├─ test_http_routes.py                 (new — closes the 5 zero-coverage routes)
  │    └─ test_real_dll_sanity.py              (new — real DLL, real HTTP, full round trip)
  ├─ npx vitest run --project unit            (self-contained, no server needed)
  │    └─ existing suite (unchanged)
  └─ npx playwright test                       (needs :5003 and :5173 already running)
       ├─ app-loads.spec.ts
       ├─ happy-path.spec.ts
       ├─ error-path.spec.ts
       └─ log-viewer.spec.ts
```

---

## Testing Considerations (for the plan that implements this spec)

- `test_real_dll_sanity.py` and the Playwright `happy-path.spec.ts` both depend on the real DLL being loadable — on a machine without `gershon/MSDLL64.dll` correctly in place (the existing `dll_instance.py` already raises a clear `OSError` at import time if it can't load), the whole backend suite already fails fast with a clear message; no new failure mode is introduced.
- The real-DLL test and the Playwright happy-path test are the two slowest tests in the whole suite by a wide margin (seconds, not milliseconds) — this is expected and acceptable for a sanity suite that runs on demand, not a concern to optimize away.
- Playwright tests should each independently navigate and set up their own state (no dependency between spec files or between tests within a file) so `npx playwright test` can run any subset and still be meaningful.
- The implementation plan should verify the exact current DOM structure/selectors for each Playwright assertion against the real running app (file input ref, "Make Lattice" button, overlay container, "Export Lattice" button, canvas element, error message area) rather than guess at them — this spec describes the behavior to test, not the exact selectors, which the plan must pin down against the real `ToolPage.tsx`/`CalculationOverlay.tsx` markup.
