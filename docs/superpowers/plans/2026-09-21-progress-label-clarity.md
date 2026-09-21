# Progress Label Clarity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the vague `'Finalizing…'` calc-button label with an accurate `'Compressing…'` label for the server-side gzip step, and add a genuine `'Unzipping…'` label for the client-side decode step that currently runs invisibly after the button has already reverted.

**Architecture:** Both changes are pure frontend label/timing tweaks in `react_frontend/src/`. No backend changes, no new socket events. Task 1 renames a string in `progressDisplay.ts`. Task 2 changes state-update ordering in `ToolPage.tsx`'s `onResult` handler so `calcLabel` shows `'Unzipping…'` for one extra animation frame before `isCalculating` flips to `false`.

**Tech Stack:** React 18, TypeScript, Vitest (`react_frontend/src/lib/__tests__/`).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-21-progress-label-clarity-design.md`
- Server-side compression label text must be exactly `'Compressing…'` (not "Zipping…" — user explicitly corrected this during design review).
- Client-side decode label text must be exactly `'Unzipping…'`.
- No new backend/socket events — `progress_end` already fires at the right moment (right before `main.py`'s `compress_text_to_b64_gz` call).
- No change to the `'Sending…'` label or send-time flow (out of scope per spec).
- No change to `calcLabelForQueueStatus` (queue-wait labels).

---

### Task 1: Rename "Finalizing…" to "Compressing…"

**Files:**
- Modify: `react_frontend/src/lib/progressDisplay.ts:21-22`
- Test: `react_frontend/src/lib/__tests__/progressDisplay.test.ts:28-30`

**Interfaces:**
- Consumes: nothing new — `calcLabelForUpdate(update: UpdatePayload): string` already exists and is called from `ToolPage.tsx:265` (`socket.onUpdate(upd => flushSync(() => setCalcLabel(calcLabelForUpdate(upd))))`). Signature is unchanged.
- Produces: `calcLabelForUpdate({ type: 'progress_end', ... })` now returns `'Compressing…'` instead of `'Finalizing…'`. No other file reads this literal string directly (confirmed via grep — only the test file references `'Finalizing…'`).

- [ ] **Step 1: Update the failing test first**

Edit `react_frontend/src/lib/__tests__/progressDisplay.test.ts`, replacing the test at lines 28-30:

```ts
  it('shows an indeterminate Compressing state on progress_end, not 100%', () => {
    expect(calcLabelForUpdate({ type: 'progress_end', progress: 100 })).toBe('Compressing…')
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd react_frontend && npx vitest run src/lib/__tests__/progressDisplay.test.ts`
Expected: FAIL — the `progress_end` case still returns `'Finalizing…'`, so the assertion `toBe('Compressing…')` fails.

- [ ] **Step 3: Update the implementation**

In `react_frontend/src/lib/progressDisplay.ts`, change:

```ts
    case 'progress_end':
      return 'Finalizing…'
```

to:

```ts
    case 'progress_end':
      return 'Compressing…'
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd react_frontend && npx vitest run src/lib/__tests__/progressDisplay.test.ts`
Expected: PASS (all 8 tests in the file).

- [ ] **Step 5: Commit**

```bash
git add react_frontend/src/lib/progressDisplay.ts react_frontend/src/lib/__tests__/progressDisplay.test.ts
git commit -m "fix(frontend): rename post-DLL progress label to Compressing…"
```

---

### Task 2: Show "Unzipping…" during client-side result decode

**Files:**
- Modify: `react_frontend/src/pages/ToolPage.tsx:243-255` (the `model_stl` success branch inside `onResult`)
- Test: `react_frontend/src/pages/__tests__/ToolPage.progressLabel.test.tsx` (new file)

**Interfaces:**
- Consumes: `setCalcLabel: React.Dispatch<React.SetStateAction<string>>` and `setIsCalculating: React.Dispatch<React.SetStateAction<boolean>>`, both already declared in `ToolPage.tsx` (`const [calcLabel, setCalcLabel] = React.useState('Calculating…')` at line 111; `isCalculating` state declared nearby — confirm exact line via the existing `setIsCalculating(false)` call at line 244 before editing). Also consumes the global `requestAnimationFrame` browser API — no import needed.
- Produces: no new exports. Behavior change only: on a successful `model_stl` result, `calcLabel` transitions `'Calculating…' → 'Unzipping…' → (button hidden once isCalculating is false)` instead of jumping straight to hidden.

This task touches actual UI timing (`requestAnimationFrame`), which is awkward to unit-test deterministically and low-value to test in isolation — the existing codebase has no component-level tests for `ToolPage.tsx` (verified: no `ToolPage` test file exists under `react_frontend/src/pages/__tests__/` or elsewhere). Rather than inventing a new test harness for one interaction, verify this task manually in the browser per the Manual Verification step below, matching how the rest of `ToolPage.tsx`'s socket-driven UI is currently verified in this codebase.

- [ ] **Step 1: Read the current onResult success branch exactly**

Open `react_frontend/src/pages/ToolPage.tsx` and re-read lines 235-256 to get exact current text before editing (line numbers may have shifted slightly from Task 1's file since it's a different file; re-read before editing regardless):

```tsx
      } else {
        // model_stl — either a macro shape preview or a real calculation result
        if (pendingMacroCountRef.current > 0) {
          pendingMacroCountRef.current -= 1
          if (payload.stl_gz_b64) {
            setMacroShapeGzB64(payload.stl_gz_b64)
          }
          // else: more responses still expected — intermediate response discarded silently
        } else {
          setIsCalculating(false)
          setCalcLabel('Calculating…')
          setResultGzB64(payload.stl_gz_b64)
          setDownloadToken(payload.download_token)
          if (payload.args_echo) {
            pendingSnapshotRef.current = { filename: payload.filename, args: payload.args_echo }
          }
          if (pendingResetKey.current !== null) {
            setViewerResetKey(pendingResetKey.current)
            pendingResetKey.current = null
          }
        }
      }
```

- [ ] **Step 2: Replace the real-result branch**

Replace the `else` block (the one starting `setIsCalculating(false)` — the real-calculation-result path, not the macro-preview path) with:

```tsx
        } else {
          setCalcLabel('Unzipping…')
          setResultGzB64(payload.stl_gz_b64)
          setDownloadToken(payload.download_token)
          if (payload.args_echo) {
            pendingSnapshotRef.current = { filename: payload.filename, args: payload.args_echo }
          }
          if (pendingResetKey.current !== null) {
            setViewerResetKey(pendingResetKey.current)
            pendingResetKey.current = null
          }
          requestAnimationFrame(() => {
            setIsCalculating(false)
            setCalcLabel('Calculating…')
          })
        }
```

The key change: `setIsCalculating(false)` moves from immediate (line 1 of the branch) to inside a `requestAnimationFrame` callback scheduled after `calcLabel` is set to `'Unzipping…'` and `resultGzB64` is updated. This guarantees at least one paint with the button showing "Unzipping…" (since `Toolbar` renders `calcLabel` only while `isCalculating` is `true`) before the button reverts to "Make Lattice". `resultGzB64`'s update triggers `useStlBlobUrl`'s decode effect (`stl.ts`) in the same commit, so the decode work genuinely happens during the frame the label is visible.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd react_frontend && npx tsc -b --noEmit`
Expected: no new errors introduced by this change.

- [ ] **Step 4: Manual verification in the browser**

Run: `cd react_frontend && npm run dev` (also start the backend per repo root `python main.py` if not already running, from the repo root in a separate terminal).

In the browser at `http://localhost:5173/tool`:
1. Upload a surface file (or two, for Ruling mode) and click "Make Lattice".
2. Watch the button label sequence: `Sending…` → `[DLL] …` messages → `Calculating… N%` → `Compressing…` → briefly `Unzipping…` → reverts to `Make Lattice` with the result rendered in the viewer.
3. Confirm the result mesh renders correctly (proves the decode still works, not just the label).

This step cannot be automated in this session — report the observed label sequence and confirm the mesh rendered.

- [ ] **Step 5: Commit**

```bash
git add react_frontend/src/pages/ToolPage.tsx
git commit -m "feat(frontend): show Unzipping… label while decoding calc result"
```

---

## Self-Review Notes

- **Spec coverage:** Spec's two changes (§1 server label rename, §2 client decode label) map 1:1 to Task 1 and Task 2. Spec's "out of scope" items (Sending label, new server events, queue-wait labels) are untouched by both tasks — confirmed no task modifies `calcLabelForQueueStatus` or the `'Sending…'` call site at `ToolPage.tsx:518`.
- **No placeholders:** all steps show exact diffs/code, not descriptions.
- **Type consistency:** `calcLabelForUpdate` signature and `setCalcLabel`/`setIsCalculating` types are unchanged from what's already in the codebase — no new types introduced.
