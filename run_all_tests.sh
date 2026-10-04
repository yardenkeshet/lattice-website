#!/usr/bin/env bash
set -uo pipefail
# Not -e: every layer should run even if an earlier one fails, so the
# summary at the end reports all three results, not just the first failure.

overall_status=0
backend_tests_ran=1

echo "=== Backend (pytest) ==="
if netstat -ano 2>/dev/null | grep -q ":5003.*LISTENING"; then
  echo "⚠️  Skipped — python main.py appears to already be running on :5003."
  echo "    pytest can't run alongside it: every pytest run re-copies the"
  echo "    background-lane DLL at import time (by design, so the two loaded"
  echo "    copies never drift out of sync), which collides with the live"
  echo "    server's own copy via a real Windows file lock. Stop the backend,"
  echo "    rerun this script to include this layer, then start it again for"
  echo "    the end-to-end layer below."
  backend_tests_ran=0
else
  if ! .venv/Scripts/python -m pytest tests/ -v; then
    echo "❌ Backend tests FAILED"
    overall_status=1
  else
    echo "✅ Backend tests passed"
  fi
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
if [ "$backend_tests_ran" -eq 0 ]; then
  echo "ℹ️  Backend pytest layer was skipped (see above) — rerun with python main.py stopped to include it."
fi
if [ "$overall_status" -eq 0 ]; then
  echo "✅ All layers that ran passed."
else
  echo "❌ One or more test layers failed — see above."
fi
exit "$overall_status"
