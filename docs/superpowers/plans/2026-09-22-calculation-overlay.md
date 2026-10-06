# Calculation Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the in-button calculation label with a full-screen modal that freezes the rest of the site, shows a fabricated (non-percentage) phrase sequence per phase, and fixes the `pendingMacroCountRef` bug the freeze also happens to make unreachable.

**Architecture:** One new presentational component (`CalculationOverlay`), a small phase-tracking addition to `ToolPage.tsx`'s existing socket-event state machine, and a two-line arithmetic fix. No backend changes — every signal the overlay needs is already emitted today.

**Tech Stack:** React 18 + TypeScript, Vite, Vitest (`jsdom` unit tests + Storybook component tests), Tailwind (utility classes for a couple of things; inline `React.CSSProperties` objects for everything token-driven, matching this codebase's existing component style).

**Spec:** `docs/superpowers/specs/2026-09-22-calculation-overlay-design.md`

## Global Constraints

- No backend/socket-protocol changes — only consume existing events (`queue_status`, `update`, `result`, `error`, `queue_rejected`).
- No new dependencies.
- Phrase rotation: 2.5s per line, last line of a phase repeats (no looping back to the first).
- Design tokens only from `react_frontend/src/styles/tokens.css` — no new colors/fonts.
- The overlay has no dismiss/cancel affordance of any kind.
- Tile sliders are frozen along with everything else — no special-cased exception.

---

### Task 1: Phase types, phrase constants, and the pure rotation helper

**Files:**
- Modify: `react_frontend/src/lib/progressDisplay.ts`
- Modify: `react_frontend/src/lib/__tests__/progressDisplay.test.ts`

**Interfaces:**
- Produces: `type CalcOverlayPhase = 'waiting' | 'calculating' | 'finalizing'`; `CALCULATING_PHRASES: readonly string[]`; `FINALIZING_PHRASES: readonly string[]`; `OVERLAY_PHRASE_STEP_MS: number`; `overlayPhraseIndex(elapsedMs: number, phraseCount: number, stepMs?: number): number`.
- Removes: `DLL_PROGRESS_CAP`, `calcLabelForUpdate` (both now dead — the percentage-driven label they produced is retired per the spec). `calcLabelForQueueStatus` is kept unchanged — its `waiting` branch is still the real text the overlay shows for that phase.

- [ ] **Step 1: Read the current file and confirm nothing else imports the two functions being removed**

Run: `grep -rn "calcLabelForUpdate\|DLL_PROGRESS_CAP" react_frontend/src`
Expected: only `react_frontend/src/lib/progressDisplay.ts` (definitions) and `react_frontend/src/lib/__tests__/progressDisplay.test.ts` (tests) and `react_frontend/src/pages/ToolPage.tsx` (one call site, removed in Task 3). If anything else turns up, stop and report — the removal plan assumes these are the only call sites.

- [ ] **Step 2: Write the failing tests for the new helper**

```ts
// add to react_frontend/src/lib/__tests__/progressDisplay.test.ts
import { overlayPhraseIndex, CALCULATING_PHRASES, FINALIZING_PHRASES, OVERLAY_PHRASE_STEP_MS } from '../progressDisplay'

describe('overlayPhraseIndex', () => {
  it('starts at the first phrase when no time has elapsed', () => {
    expect(overlayPhraseIndex(0, CALCULATING_PHRASES.length)).toBe(0)
  })

  it('advances one phrase per full step', () => {
    expect(overlayPhraseIndex(OVERLAY_PHRASE_STEP_MS, 5)).toBe(1)
    expect(overlayPhraseIndex(OVERLAY_PHRASE_STEP_MS * 2, 5)).toBe(2)
  })

  it('does not advance again until a full step has elapsed', () => {
    expect(overlayPhraseIndex(OVERLAY_PHRASE_STEP_MS + 100, 5)).toBe(1)
    expect(overlayPhraseIndex(OVERLAY_PHRASE_STEP_MS * 2 - 1, 5)).toBe(1)
  })

  it('caps at the last phrase and never loops back to the first', () => {
    expect(overlayPhraseIndex(OVERLAY_PHRASE_STEP_MS * 4, 5)).toBe(4)
    expect(overlayPhraseIndex(OVERLAY_PHRASE_STEP_MS * 999, 5)).toBe(4)
  })

  it('CALCULATING_PHRASES and FINALIZING_PHRASES are both non-empty', () => {
    expect(CALCULATING_PHRASES.length).toBeGreaterThan(0)
    expect(FINALIZING_PHRASES.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2b: Remove the now-obsolete tests for the functions being deleted**

Delete the existing `describe`/`it` blocks in `progressDisplay.test.ts` that test `calcLabelForUpdate` (including the one asserting the `Calculating… NN%` capped-percentage text) and any reference to `DLL_PROGRESS_CAP`. Leave the `calcLabelForQueueStatus` tests untouched.

- [ ] **Step 3: Run the new tests to verify they fail**

Run: `cd react_frontend && npx vitest run src/lib/__tests__/progressDisplay.test.ts`
Expected: FAIL — `overlayPhraseIndex`/`CALCULATING_PHRASES`/etc. don't exist yet.

- [ ] **Step 4: Update `progressDisplay.ts`**

Replace the whole file with:

```ts
import type { QueueStatusPayload } from '../api/types'

/**
 * Which stage of a real "Calculate" request the full-screen
 * CalculationOverlay is currently representing. Driven entirely by
 * existing server signals — see ToolPage.tsx's socket-event handlers.
 * 'waiting' shows the real queue-position text (calcLabelForQueueStatus);
 * 'calculating'/'finalizing' cycle through a fabricated, non-percentage
 * phrase sequence instead — see the design spec
 * (docs/superpowers/specs/2026-09-22-calculation-overlay-design.md) for why.
 */
export type CalcOverlayPhase = 'waiting' | 'calculating' | 'finalizing'

/** Rotation interval for the overlay's phrase sequence, in milliseconds. */
export const OVERLAY_PHRASE_STEP_MS = 2500

export const CALCULATING_PHRASES = [
  'Reading your surfaces…',
  'Setting up the macro shape…',
  'Building the lattice microstructure…',
  'Assembling tiles…',
  'Still working — larger models take a bit longer…',
] as const

export const FINALIZING_PHRASES = [
  'Finalizing your model…',
  'Compressing the mesh…',
  'Preparing your preview…',
] as const

/**
 * Which phrase (by index into a phase's phrase list) should be showing
 * after `elapsedMs` since that phase began. Advances one phrase per full
 * `stepMs` and then holds on the last phrase — deliberately does not loop
 * back to the first, since the last phrase in each list is written as a
 * steady-state "still working" line, not something that makes sense to
 * cycle back through.
 */
export function overlayPhraseIndex(elapsedMs: number, phraseCount: number, stepMs: number = OVERLAY_PHRASE_STEP_MS): number {
  const raw = Math.floor(elapsedMs / stepMs)
  return Math.min(Math.max(raw, 0), phraseCount - 1)
}

/**
 * Label shown while a calculate request sits ahead of the "calculating"
 * state, waiting in the bounded server-side queue. This is real
 * information (an actual queue position), unlike the fabricated
 * CALCULATING_PHRASES/FINALIZING_PHRASES sequences above, so it's shown
 * verbatim rather than replaced with a generic phrase.
 */
export function calcLabelForQueueStatus(status: QueueStatusPayload): string {
  if (status.state === 'waiting') {
    return `Site is busy — you're #${status.position} in line`
  }
  return 'Calculating…'
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd react_frontend && npx vitest run src/lib/__tests__/progressDisplay.test.ts`
Expected: PASS (all tests, including the retained `calcLabelForQueueStatus` ones)

- [ ] **Step 6: Commit**

```bash
git add react_frontend/src/lib/progressDisplay.ts react_frontend/src/lib/__tests__/progressDisplay.test.ts
git commit -m "feat(frontend): add calculation-overlay phase types and phrase rotation helper

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `CalculationOverlay` component + Storybook stories

**Files:**
- Create: `react_frontend/src/components/ui/CalculationOverlay.tsx`
- Create: `react_frontend/src/components/ui/CalculationOverlay.stories.tsx`
- Modify: `react_frontend/src/index.css` (one small `@keyframes` addition — Tailwind's built-in `animate-spin` covers the ring, but there's no built-in indeterminate-progress-bar animation)

**Interfaces:**
- Consumes: `CalcOverlayPhase`, `CALCULATING_PHRASES`, `FINALIZING_PHRASES`, `overlayPhraseIndex`, `OVERLAY_PHRASE_STEP_MS` (Task 1).
- Produces: `CalculationOverlay` (named export) with props `{ isOpen: boolean; phase: CalcOverlayPhase; waitingText: string }`.

- [ ] **Step 1: Add the indeterminate-bar keyframes to `index.css`**

Add near the end of `react_frontend/src/index.css` (after the existing `:root` block and any other top-level rules already there — append, don't reorder anything existing):

```css
@keyframes overlay-bar-sweep {
  from { transform: translateX(-100%); }
  to   { transform: translateX(360%); }
}
```

- [ ] **Step 2: Write `CalculationOverlay.tsx`**

```tsx
// react_frontend/src/components/ui/CalculationOverlay.tsx
import * as React from 'react'
import {
  type CalcOverlayPhase,
  CALCULATING_PHRASES,
  FINALIZING_PHRASES,
  OVERLAY_PHRASE_STEP_MS,
  overlayPhraseIndex,
} from '../../lib/progressDisplay'

export interface CalculationOverlayProps {
  isOpen: boolean
  phase: CalcOverlayPhase
  /** Real queue-position text (e.g. "Site is busy — you're #2 in line"),
   * shown verbatim when phase === 'waiting'. Ignored for the other phases,
   * which use the fabricated CALCULATING_PHRASES/FINALIZING_PHRASES
   * sequences instead. */
  waitingText: string
}

const PHASE_HEADING: Record<CalcOverlayPhase, string> = {
  waiting: 'Getting in line',
  calculating: 'Building your lattice',
  finalizing: 'Wrapping up',
}

const PHASE_LABEL: Record<CalcOverlayPhase, string> = {
  waiting: 'Waiting',
  calculating: 'Calculating',
  finalizing: 'Finalizing',
}

export const CalculationOverlay: React.FC<CalculationOverlayProps> = ({ isOpen, phase, waitingText }) => {
  const [elapsedMs, setElapsedMs] = React.useState(0)

  // Restart the phrase clock every time the phase itself changes, so
  // 'calculating' and 'finalizing' each begin their own rotation from the
  // first phrase in their list rather than continuing the previous phase's
  // count.
  React.useEffect(() => {
    setElapsedMs(0)
    if (!isOpen || phase === 'waiting') return
    const id = window.setInterval(
      () => setElapsedMs(ms => ms + OVERLAY_PHRASE_STEP_MS),
      OVERLAY_PHRASE_STEP_MS,
    )
    return () => window.clearInterval(id)
  }, [isOpen, phase])

  if (!isOpen) return null

  const phrases = phase === 'finalizing' ? FINALIZING_PHRASES : CALCULATING_PHRASES
  const phraseText = phase === 'waiting' ? waitingText : phrases[overlayPhraseIndex(elapsedMs, phrases.length)]

  return (
    <div style={scrimStyle}>
      <div role="alertdialog" aria-modal="true" aria-label={PHASE_HEADING[phase]} style={cardStyle}>
        <div className="animate-spin" style={ringStyle} />
        <p style={headingStyle}>{PHASE_HEADING[phase]}</p>
        <p style={phraseStyle}>{phraseText}</p>
        <div style={barTrackStyle}>
          <div style={barFillStyle} />
        </div>
        <p style={stageLabelStyle}>{PHASE_LABEL[phase]}</p>
      </div>
    </div>
  )
}

/* ─── Styles — all values reference design tokens ─── */

const scrimStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 2000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  backgroundColor: 'rgba(4, 44, 78, 0.55)',
}

const cardStyle: React.CSSProperties = {
  width: '80%',
  maxWidth: 420,
  minWidth: 280,
  backgroundColor: 'var(--bg-primary)',
  borderRadius: 14,
  boxShadow: '1px 2px 9px 0px rgba(0,0,0,0.25)',
  padding: '36px 32px 30px',
  textAlign: 'center',
}

const ringStyle: React.CSSProperties = {
  width: 52,
  height: 52,
  margin: '0 auto 20px',
  borderRadius: '50%',
  border: '4px solid var(--gray-100)',
  borderTopColor: 'var(--blue-bright)',
}

const headingStyle: React.CSSProperties = {
  fontFamily: 'var(--font-heading)',
  fontWeight: 700,
  fontSize: '1.0625rem',
  color: 'var(--navy-dark)',
  margin: '0 0 10px',
}

const phraseStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontWeight: 500,
  fontSize: '0.9375rem',
  color: 'var(--text-secondary)',
  minHeight: '1.4em',
  margin: '0 0 22px',
}

const barTrackStyle: React.CSSProperties = {
  height: 6,
  borderRadius: 99,
  backgroundColor: 'var(--gray-100)',
  overflow: 'hidden',
}

const barFillStyle: React.CSSProperties = {
  height: '100%',
  width: '38%',
  borderRadius: 99,
  background: 'linear-gradient(90deg, var(--blue-light), var(--blue-bright))',
  animation: 'overlay-bar-sweep 1.6s ease-in-out infinite',
}

const stageLabelStyle: React.CSSProperties = {
  marginTop: 18,
  fontSize: '0.6875rem',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--text-tertiary)',
  fontWeight: 600,
}
```

- [ ] **Step 3: Write `CalculationOverlay.stories.tsx`**

```tsx
// react_frontend/src/components/ui/CalculationOverlay.stories.tsx
import type { Meta, StoryObj } from '@storybook/react'
import { CalculationOverlay } from './CalculationOverlay'

const meta: Meta<typeof CalculationOverlay> = {
  title: 'UI/CalculationOverlay',
  component: CalculationOverlay,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof CalculationOverlay>

export const Waiting: Story = {
  args: {
    isOpen: true,
    phase: 'waiting',
    waitingText: "Site is busy — you're #2 in line",
  },
}

export const Calculating: Story = {
  args: {
    isOpen: true,
    phase: 'calculating',
    waitingText: '',
  },
}

export const Finalizing: Story = {
  args: {
    isOpen: true,
    phase: 'finalizing',
    waitingText: '',
  },
}

export const Closed: Story = {
  args: {
    isOpen: false,
    phase: 'calculating',
    waitingText: '',
  },
}
```

- [ ] **Step 4: Verify visually via Storybook**

Run: `cd react_frontend && npm run storybook` (or, if a headless check is preferred and the project's Storybook-Vitest integration is already configured, `npx vitest run --project storybook -t CalculationOverlay`)
Expected: all four stories render without errors; `Waiting`/`Calculating`/`Finalizing` show the scrim + card; `Closed` renders nothing. Confirm the ring visibly spins and the bar visibly sweeps (Storybook's own preview is a real browser, so both CSS animations are live).

- [ ] **Step 5: Commit**

```bash
git add react_frontend/src/components/ui/CalculationOverlay.tsx react_frontend/src/components/ui/CalculationOverlay.stories.tsx react_frontend/src/index.css
git commit -m "feat(frontend): add CalculationOverlay component

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Wire the overlay into `ToolPage.tsx`

**Files:**
- Modify: `react_frontend/src/pages/ToolPage.tsx`

**Interfaces:**
- Consumes: `CalculationOverlay` (Task 2); `CalcOverlayPhase`, `calcLabelForQueueStatus` (Task 1, already imported today under a different name — see below).

This is the task most likely to have drifted from the line numbers below (this file wasn't touched by the session that produced this plan, but re-verify before editing). Read the current file first and match by the surrounding code shown, not by line number alone.

- [ ] **Step 1: Rename `calcLabel`/`setCalcLabel` state to `queueWaitingLabel`/`setQueueWaitingLabel`, and add `overlayPhase` state**

Find (near `ToolPage.tsx:108-113`):

```tsx
  const [isCalculating, setIsCalculating] = React.useState(false)
  const [calcLabel, setCalcLabel]         = React.useState('Calculating…')
  const [errorMsg, setErrorMsg]           = React.useState<string | null>(null)
  const [queueBusyMsg, setQueueBusyMsg]   = React.useState<string | null>(null)
```

Replace with:

```tsx
  const [isCalculating, setIsCalculating] = React.useState(false)
  const [overlayPhase, setOverlayPhase]   = React.useState<CalcOverlayPhase>('calculating')
  const [queueWaitingLabel, setQueueWaitingLabel] = React.useState('')
  const [errorMsg, setErrorMsg]           = React.useState<string | null>(null)
  const [queueBusyMsg, setQueueBusyMsg]   = React.useState<string | null>(null)
```

Update the import line that currently reads (near the top of the file, alongside the other `../lib/progressDisplay` import — find and update, don't duplicate the import):

```tsx
import { calcLabelForUpdate, calcLabelForQueueStatus } from '../lib/progressDisplay'
```

to:

```tsx
import { type CalcOverlayPhase, calcLabelForQueueStatus } from '../lib/progressDisplay'
```

Add the new component import alongside the other `components/ui` imports:

```tsx
import { CalculationOverlay } from '../components/ui/CalculationOverlay'
```

- [ ] **Step 2: Update the socket-event handlers to also drive `overlayPhase`/`queueWaitingLabel`**

Find the socket-subscription `React.useEffect` (the one with `unsubResult`, `unsubError`, `unsubUpdate`, `unsubQueueStatus`, `unsubQueueRejected`). Within it, make these targeted replacements — every other line in this effect (the `tile_stl` branch, the `pendingResetKey` handling, etc.) stays exactly as it is today:

Replace:
```tsx
        } else {
          setIsCalculating(false)
          setCalcLabel('Calculating…')
          setResultGzB64(payload.stl_gz_b64)
```
with:
```tsx
        } else {
          setIsCalculating(false)
          setOverlayPhase('calculating')
          setResultGzB64(payload.stl_gz_b64)
```

Replace:
```tsx
    const unsubError = socket.onError(err => {
      pendingMacroCountRef.current = 0
      setIsCalculating(false)
      setCalcLabel('Calculating…')
      setErrorMsg(err.message)
    })
    const unsubUpdate = socket.onUpdate(upd => {
      flushSync(() => setCalcLabel(calcLabelForUpdate(upd)))
    })
    const unsubQueueStatus = socket.onQueueStatus(status => {
      if (status.silent) return
      setCalcLabel(calcLabelForQueueStatus(status))
    })
    const unsubQueueRejected = socket.onQueueRejected(rejection => {
      if (rejection.silent) {
        if (pendingMacroCountRef.current > 0) pendingMacroCountRef.current -= 1
        return
      }
      pendingMacroCountRef.current = 0
      setIsCalculating(false)
      setCalcLabel('Calculating…')
      setQueueBusyMsg(rejection.message)
    })
```
with:
```tsx
    const unsubError = socket.onError(err => {
      pendingMacroCountRef.current = 0
      setIsCalculating(false)
      setOverlayPhase('calculating')
      setErrorMsg(err.message)
    })
    const unsubUpdate = socket.onUpdate(upd => {
      flushSync(() => setOverlayPhase(upd.type === 'progress_end' ? 'finalizing' : 'calculating'))
    })
    const unsubQueueStatus = socket.onQueueStatus(status => {
      if (status.silent) return
      setOverlayPhase(status.state === 'waiting' ? 'waiting' : 'calculating')
      setQueueWaitingLabel(calcLabelForQueueStatus(status))
    })
    const unsubQueueRejected = socket.onQueueRejected(rejection => {
      if (rejection.silent) {
        if (pendingMacroCountRef.current > 0) pendingMacroCountRef.current -= 1
        return
      }
      pendingMacroCountRef.current = 0
      setIsCalculating(false)
      setOverlayPhase('calculating')
      setQueueBusyMsg(rejection.message)
    })
```

- [ ] **Step 3: Update `handleCalculate`**

Find (near the start of the `handleCalculate` callback):
```tsx
    pendingResetKey.current = 'calc-' + Date.now()
    setIsCalculating(true)
    setCalcLabel('Calculating…')
```
Replace with:
```tsx
    pendingResetKey.current = 'calc-' + Date.now()
    setIsCalculating(true)
    setOverlayPhase('calculating')
    setQueueWaitingLabel('')
```

`handleCalculate`'s dependency array currently lists `setErrorMsg`/`setQueueBusyMsg` explicitly (setters from `useState` are stable and don't strictly need to be listed, but the existing code already does list a couple — leave the dependency array exactly as it is; nothing new needs to be added to it, since `setOverlayPhase`/`setQueueWaitingLabel` are the same kind of stable setter).

- [ ] **Step 4: Add the `inert`-on-freeze wrapper and render the overlay**

Add near the other top-of-component refs (alongside `viewerSceneRef`/similar — find a sensible spot near the other `React.useRef` declarations):

```tsx
  const appContentRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const el = appContentRef.current
    if (!el) return
    // Imperative attribute, not the JSX `inert` prop — sidesteps any gap in
    // @types/react's DOM attribute typings for `inert`. Freezes both
    // pointer and keyboard access to everything except the overlay itself,
    // which must render OUTSIDE this wrapper (see the return statement) so
    // it isn't made inert along with the rest of the page.
    if (isCalculating) {
      el.setAttribute('inert', '')
    } else {
      el.removeAttribute('inert')
    }
  }, [isCalculating])
```

Find the component's `return` statement:
```tsx
  return (
    <div style={pageStyle}>
      <Banner onClick={() => navigate('/')}/>
```

and its closing:
```tsx
    </div>
  )
}
```
(the final `</div>` that closes the `pageStyle` div, immediately followed by the function's closing `)` and `}`).

Wrap the existing `<div style={pageStyle}>...</div>` in a fragment, attach `appContentRef` to that same `pageStyle` div (don't add a new wrapper div — attach the ref directly to the existing one), and add `<CalculationOverlay>` as a sibling after it:

```tsx
  return (
    <>
      <div ref={appContentRef} style={pageStyle}>
        <Banner onClick={() => navigate('/')}/>
```
… (everything currently between here and the matching closing `</div>` stays completely unchanged) …
```tsx
      </div>
      <CalculationOverlay
        isOpen={isCalculating}
        phase={overlayPhase}
        waitingText={queueWaitingLabel}
      />
    </>
  )
}
```

- [ ] **Step 5: Run the frontend build/typecheck to catch anything missed**

Run: `cd react_frontend && npx tsc --noEmit`
Expected: **exactly one** error, naming `calcLabel` at the `<Toolbar calcLabel={calcLabel} ...>` prop in this same file's return statement — Step 4 renamed that state but this task deliberately does not touch the `<Toolbar>` call site (that's Task 5's job, alongside removing the prop from `Toolbar` itself). Confirm the error is that one specific line and nothing else; any other error means something in Steps 1-4 was missed.

- [ ] **Step 6: Commit**

```bash
git add react_frontend/src/pages/ToolPage.tsx
git commit -m "feat(frontend): wire CalculationOverlay and phase tracking into ToolPage

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Fix the `pendingMacroCountRef` arithmetic

**Files:**
- Modify: `react_frontend/src/pages/ToolPage.tsx`

**Interfaces:** none new — this is a two-line arithmetic correction, independent of Tasks 1-3 (could technically be done first; ordered last here only because it's easiest to verify once the overlay is already wired and the app is in a normally-testable state).

- [ ] **Step 1: Write a regression test proving the old arithmetic was wrong**

This logic lives inline in `ToolPage.tsx`'s socket-effect closures, not in a separately-exported pure function, so a full component-level test isn't practical without a larger testing investment this task doesn't call for. Instead, add a focused unit test that pins down the *contract* the fix depends on — that the server sends exactly one `result` per `calculate` call — as living documentation next to the fix, so a future change to that contract (e.g. reintroducing a second emit) doesn't silently re-break this:

```ts
// add to react_frontend/src/api/__tests__/socketClient.test.ts
it('onResult fires exactly once per raw "result" event from the server', () => {
  // Documents the contract pendingMacroCountRef's += 1 (ToolPage.tsx) relies
  // on: the server emits `result` exactly once per calculate call, not
  // twice. If this ever needs to become 2 again, pendingMacroCountRef's
  // increments in ToolPage.tsx must change back to += 2 to match.
  const client = new LatticeSocketClient('http://example.invalid')
  const handler = vi.fn()
  client.onResult(handler)
  // @ts-expect-error -- reaching into the private handler for this test
  client['handleRawResult']({ kind: 'model_stl', filename: 'x', stl_gz_b64: 'AA==', download_token: 't', timings: {} })
  expect(handler).toHaveBeenCalledTimes(1)
})
```

Check the existing `socketClient.test.ts` file first for how `LatticeSocketClient` is already constructed/tested in that file (there may be an existing helper or mock-socket pattern already in use) and match it rather than introducing a second, inconsistent way of instantiating the client in the same file.

- [ ] **Step 2: Run it to verify it passes as documentation (not a RED/GREEN pair — this test isn't exercising new code, it's pinning an existing contract the fix below depends on)**

Run: `cd react_frontend && npx vitest run src/api/__tests__/socketClient.test.ts`
Expected: PASS.

- [ ] **Step 3: Fix the two unguarded `+= 2` sites**

In `ToolPage.tsx`, find (the auto-trigger-on-upload effect):
```tsx
    pendingMacroCountRef.current += 2
    socket.calculate({
      filename: uploadedFile?.name ?? 'surface.igs',
      surface_b64: uploadedIgsB64,
```
Change `+= 2` to `+= 1`.

Find (the extrude-length-debounce effect):
```tsx
      pendingMacroCountRef.current += 2
      socket.calculate({
        filename: uploadedFile?.name ?? 'surface.igs',
        surface_b64: igsB64,
```
Change `+= 2` to `+= 1`.

Do not change anything else in either effect (the `isCalculatingRef` guard on the second one, the `silent: true` flag, the payload shape — all stay exactly as they are).

- [ ] **Step 4: Manual verification (no automated test can exercise this end-to-end without a running backend + real timing)**

With the dev server running (`npm run dev`) against a real backend: upload a file, then immediately click **Calculate** before the silent macro-preview's response could plausibly have arrived. Confirm the real result still displays normally. This was previously the exact reproduction for the "sometimes no result shows up" bug — with both this fix and Task 3's freeze in place, it should no longer be reproducible via the UI at all (the freeze makes the old trigger sequence unreachable through normal interaction), but the counter itself is now also correct, not just guarded.

- [ ] **Step 5: Commit**

```bash
git add react_frontend/src/pages/ToolPage.tsx react_frontend/src/api/__tests__/socketClient.test.ts
git commit -m "fix(frontend): correct pendingMacroCountRef increment to match the single-response server contract

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Simplify `Toolbar.tsx` — button no longer carries the changing label

**Files:**
- Modify: `react_frontend/src/components/ui/Toolbar.tsx`
- Modify: `react_frontend/src/pages/ToolPage.tsx` (drop the now-removed prop from the `<Toolbar>` call site)
- Check/update: `react_frontend/src/components/ui/Toolbar.stories.tsx` if it references `calcLabel`

**Interfaces:** Removes `calcLabel` from `ToolbarProps`. `isCalculating` stays (still gates `disabled`).

- [ ] **Step 1: Read the current `Toolbar.tsx` and `Toolbar.stories.tsx` in full before editing** — this task's exact diff depends on their current shape; the interface block below is what must be true afterward, not a literal find/replace.

- [ ] **Step 2: Update `ToolbarProps` and the button render**

Remove `calcLabel?: string` from the props interface and its default value (`calcLabel = 'Calculating…'`) from the destructured props. Change the button's label expression from:
```tsx
{isCalculating ? calcLabel : 'Make Lattice'}
```
to simply:
```tsx
Make Lattice
```
`disabled={isCalculating}` stays exactly as it is — the button is still disabled while calculating (defense-in-depth alongside the overlay's own freeze), it just no longer changes its text.

- [ ] **Step 3: Update the `<Toolbar>` call site in `ToolPage.tsx`**

Remove the `calcLabel={calcLabel}` prop from the `<Toolbar ... />` element — this is the exact line Task 3's typecheck step left as a known, expected error (Task 3 renamed the `calcLabel` state but deliberately didn't touch this call site). `isCalculating={isCalculating}` stays.

- [ ] **Step 4: Update `Toolbar.stories.tsx` if it passes `calcLabel` to any story's `args`** — remove that arg from any story that has it; leave everything else in the file untouched.

- [ ] **Step 5: Run the full frontend test suite + typecheck**

Run: `cd react_frontend && npx tsc --noEmit && npx vitest run`
Expected: no TypeScript errors, all tests pass.

- [ ] **Step 6: Commit**

```bash
git add react_frontend/src/components/ui/Toolbar.tsx react_frontend/src/components/ui/Toolbar.stories.tsx react_frontend/src/pages/ToolPage.tsx
git commit -m "refactor(frontend): drop calcLabel from Toolbar now that CalculationOverlay owns progress display

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full suite**

Run: `cd react_frontend && npx tsc --noEmit && npx vitest run`
Expected: all green.

- [ ] **Step 2: Manual verification with a real running backend**

1. `python main.py` (repo root) and `npm run dev` (react_frontend), in this branch (`queue`) — not the `background-dll-lane` worktree, which this plan doesn't depend on or touch.
2. Upload a surface, click **Calculate**. Confirm: overlay opens immediately, scrim dims the rest of the page, nothing behind it responds to clicks (try clicking the tile menu, the macro-shape dropdown, the extrude-length field — none should react), and Tab doesn't move focus into anything behind the overlay.
3. Watch the calculating phrases rotate every 2.5s in the order specified in the spec, holding on the last one if the calculation runs long.
4. Watch it switch to the finalizing phrases once the DLL phase completes.
5. Confirm the overlay closes and the result displays the instant it's ready, with the rest of the page immediately interactive again.
6. Open two browser tabs; start a real Calculate in one, then click Calculate in the other while the first is still running — confirm the second tab's overlay opens immediately in the **waiting** phase, showing the real "you're #N in line" text (not a fabricated phrase), and switches to the calculating phrases once it's actually dispatched.
7. Trigger the old bug's exact former reproduction once more (upload, then click Calculate) and confirm it's no longer reachable — the freeze should make it physically impossible to trigger the unguarded silent-preview path during a real calculation now.
