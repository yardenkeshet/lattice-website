# Logging Gaps — Design Spec

**Date:** 2026-06-09  
**File changed:** `main.py` only  
**Scope:** 4 targeted additions to close identified gaps in operational log coverage

---

## Context

The existing logging in `main.py` is well-structured with `[PREFIX]` tags, `sid` traceability, and timing on all heavy operations. A coverage audit against the stated goals (debugging, usage monitoring, performance) found four small gaps.

---

## Gaps and Fixes

### 1. IP address missing from connect log

**Current:**
```
INFO  Client connected Mc3TJNpacbCCFmeoAAAB
```
**After:**
```
INFO  Client connected Mc3TJNpacbCCFmeoAAAB  ip=127.0.0.1
```
**Change:** In `on_connect()`, move the `ip_address` read above the log call and include it in the message. The value is already present in `request.environ.get('REMOTE_ADDR')`.

---

### 2. `handle_calculate_tile` has no error handling

**Current:** `data['type']` and `data['values']` will raise a bare `KeyError` if the client sends malformed data. No log, no `error` event emitted to the client.

**After:** Wrap the handler body in `try/except Exception`:
```python
except Exception as exc:
    logger.exception(f"[TILE] bad request: {exc}  sid={request.sid}")
    emit('error', {'msg': f'Bad tile request: {exc}'})
```

---

### 3. Successful download not logged

**Current:** `/download-results` logs token errors and missing files but nothing on success, leaving a gap in the usage audit trail.

**After:** One INFO line immediately before `send_file`:
```
INFO  [DOWNLOAD] {filename}  sid={sid}
```

---

### 4. Unknown `file_type` not logged

**Current:** An unsupported `file_type` value returns HTTP 400 silently (no log).

**After:** One WARNING before the 400 return:
```
WARNING  [DOWNLOAD] unknown file_type: {file_type!r}  sid={sid}
```

---

## What is NOT changing

- Log format, level thresholds, and rotation config — unchanged
- No new log prefixes introduced
- All other handlers are already fully covered
