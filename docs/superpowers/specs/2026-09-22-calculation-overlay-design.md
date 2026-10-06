# Calculation Overlay — Design Spec

**Date:** 2026-09-22
**Branch:** `queue` (frontend-only; independent of the `background-dll-lane` branch)
**Files affected:** `react_frontend/src/components/ui/CalculationOverlay.tsx` (new), `react_frontend/src/lib/progressDisplay.ts`, `react_frontend/src/pages/ToolPage.tsx`, `react_frontend/src/components/ui/Toolbar.tsx`
**Scope:** Replace the current in-button "Calculating…/Finalizing…" label with a full-screen modal takeover that freezes the rest of the site, shows a fabricated (not percentage-driven) sequence of reassuring phrases, and — as a direct consequence of freezing input — closes off the only reachable trigger for a pre-existing, already-diagnosed frontend bug. Approved interactively via a live HTML mockup (https://claude.ai/artifact/34W8Yt75T76j2Mq4mKi6BL) before this spec was written; this document is the record of what was approved, not a proposal.

---

## Context

Today, clicking **Make Lattice** sets `isCalculating = true` and the button's own label swaps between `calcLabelForUpdate`'s text — including a real DLL-driven percentage (`Calculating… 73%`) capped at 90% to avoid a false "done" signal during the untracked compress/emit tail (`progressDisplay.ts:10`). Nothing else on the page is blocked: the macro-shape construction dropdown, extrude length, and file upload all remain fully interactive during a live calculation.

Two problems were raised against this, independently:

1. **UX**: while waiting for a specific requested result, the viewer can visibly change out from under the user (tile preview, macro-shape preview) — confusing when you don't know which thing you're about to see.
2. **A real, reproducible correctness bug**, already diagnosed earlier in this project's work (see `ToolPage.tsx:150,307,333,418,435` and the "Fix pendingMacroCountRef" discussion in the background-dll-lane session): the frontend's `pendingMacroCountRef` counter was built around a documented server quirk ("calculate emits result twice") that no longer holds — the server sends exactly one `result` per calculate call, confirmed by reading the current backend code. Every silent background macro-preview leaves the counter off by one. Normally harmless — clicking Calculate resets it to 0 — but two specific actions fire a new silent preview **without checking whether a real calculate is already in flight**: uploading a file (`handleFilesAdd`, no guard) and changing calc mode (`handleCalcModeChange`, no guard). If either fires while a real result hasn't arrived yet, the counter is non-zero when it does arrive, and the code silently routes the real result into the "still expecting more preview responses" branch — no error, no result ever displayed, `isCalculating` never clears. One trigger (extrude-length edit, `ToolPage.tsx:333`) already guards against this correctly via `isCalculatingRef` — establishing the pattern this spec extends to the other two.

Freezing all input during a calculation (motivation 1) also eliminates the only reachable trigger for this bug (motivation 2), since the two unguarded actions become physically unreachable while frozen. This spec fixes both: the freeze as defense, and the counter's actual arithmetic as the real fix (belt and suspenders — freezing prevents today's known trigger; fixing the counter closes the bug itself for any future trigger point).

---

## 1. Visual design (as approved in the mockup)

- A scrim (`rgba(4,44,78,0.55)`, tinted navy rather than plain black) covers the full viewport, `position: fixed; inset: 0`, above everything else.
- A centered card: `width: 80%`, `max-width: 420px`, `min-width: 280px`, white background, `border-radius: 14px`, `box-shadow: 1px 2px 9px 0 rgba(0,0,0,0.25)` — same radius/shadow language as the existing `Popup` component (`Popup.tsx:53-54`).
- Inside: a spinning ring (`--blue-bright` on a `--gray-100` track, 900ms linear), a heading, the rotating phrase line, a thin indeterminate progress bar (motion only — **never a measured percentage**), and a small uppercase stage label ("Calculating" / "Finalizing" / "Waiting").
- No close button, no cancel button, no dismiss affordance of any kind. The user waits until the result arrives or an error occurs, however long that takes.
- Design tokens used throughout are the project's real ones (`react_frontend/src/styles/tokens.css`) — no new colors or fonts introduced.

## 2. Phrase sequences (as approved)

Rotate every **2.5 seconds**. Not tied to the DLL's real progress percentage — that percentage-based text (`calcLabelForUpdate`'s `Calculating… NN%` branch, `progressDisplay.ts:16-20`) is retired entirely, along with `DLL_PROGRESS_CAP`. If a phase runs longer than the phrase list, the **last phrase in that phase's list repeats** (no looping back to the first) — writing "still working" text is only reasonable as an endpoint, not something that makes sense to cycle back through.

**Calculating phase:**
1. "Reading your surfaces…"
2. "Setting up the macro shape…"
3. "Building the lattice microstructure…"
4. "Assembling tiles…"
5. "Still working — larger models take a bit longer…" *(steady-state; repeats)*

**Finalizing phase:**
1. "Finalizing your model…"
2. "Compressing the mesh…"
3. "Preparing your preview…" *(steady-state; repeats)*

**Waiting phase** (queued behind another real calculation, not covered by the mockup — see Section 3): shows the **existing real text**, unchanged — `Site is busy — you're #N in line` (`calcLabelForQueueStatus`, `progressDisplay.ts:34-39`) — never a fabricated phrase, since real information is available here and fabricating over it would be actively misleading.

## 3. Phase model (new — needed to drive the above, not covered by the mockup itself)

The mockup only showed two phases. The real app also has a **waiting** sub-state (main queue occupied by another real calculation) that must be represented, since the overlay opens the instant Calculate is clicked — including any time spent waiting in line. Decision: reuse the real waiting-position text for that phase (Section 2) rather than inventing fabricated phrases for it, since it's the one phase where genuinely useful, accurate information already exists.

```ts
type CalcOverlayPhase = 'waiting' | 'calculating' | 'finalizing'
```

Driven by existing server signals, mapped as:

| Signal | New phase |
|---|---|
| `handleCalculate` fires (optimistic default before the first status arrives) | `calculating` |
| `queue_status` with `state: 'waiting'` | `waiting` |
| `queue_status` with `state: 'calculating'` | `calculating` |
| `update` with `type: 'progress_start'` or `'progress_update'` | `calculating` |
| `update` with `type: 'progress_end'` | `finalizing` |

The overlay is open exactly when `isCalculating` is `true` — unchanged from today's gating, so a `queue_rejected` response (which already sets `isCalculating` back to `false` immediately) never opens it.

## 4. Freeze behavior

While `isCalculating` is `true`:
- The entire app content (everything except the overlay itself) becomes non-interactive: unreachable by pointer (the fixed, full-viewport scrim is the topmost hit-test target everywhere) **and** unreachable by keyboard (the content wrapper gets the HTML `inert` attribute, set/cleared imperatively via a ref — not the JSX prop, to avoid depending on `@types/react` having caught up with the `inert` DOM attribute).
- The overlay itself must not be inside the `inert` wrapper (it would make itself non-interactive too) — it renders as a **sibling**, not a descendant, of the wrapped content.
- This is a frontend-only, this-session's-own-controls freeze. It has no effect on, and no relationship to, the backend's two-lane DLL architecture (`background-dll-lane` branch) — that still governs server-side contention between different users/sessions, which this spec doesn't touch.

## 5. The `pendingMacroCountRef` fix (root cause, not just the freeze)

Independent of the freeze — fixes the counter itself so it can't desync even from some future trigger point nobody's added the freeze-guard to yet:

- `ToolPage.tsx:307` and `ToolPage.tsx:335` currently do `pendingMacroCountRef.current += 2`, built around the "server emits result twice" assumption that's no longer true. Change both to `+= 1`, matching the confirmed single-response reality.
- `onResult`'s existing `-= 1` per response (`ToolPage.tsx:238`) is already correct and unchanged.

## Out of scope

- Any backend change — this is 100% frontend. The server already emits every signal the overlay needs.
- Cancelling a calculation mid-flight — explicitly rejected; the overlay has no dismiss affordance, by design.
- Freezing tile-slider interaction specifically was left to implementation discretion in the mockup discussion; resolved here: **tile sliders are covered by the same freeze as everything else**, since the overlay blocks the whole page uniformly — there is no special-cased exception carved out for them, and none was requested.
