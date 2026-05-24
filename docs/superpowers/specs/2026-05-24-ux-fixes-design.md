# UX Fixes Design — 2026-05-24

Four targeted UX improvements to the React frontend.

---

## Fix 1 — Lattice Tile section is fully clickable

### What changes

**`LatticeMenu.tsx`**

The entire "Lattice Tile" section (the `div` between the two `<Divider />`s that contains the mini TileCard, tile name, and plus icon) becomes a single clickable region:

- `onClick={onOpenTileMenu}` added to the section container div.
- `cursor: pointer` added to the section container style.
- A subtle hover background tint (`var(--bg-tertiary)` at reduced opacity, or a dedicated `--hover-tint` token) applied on `:hover` via an inline `onMouseEnter/onMouseLeave` pair or a CSS class, to signal interactivity.
- The `+` (PlusIcon) button **loses its own `onClick`** — it becomes purely decorative. The entire band is the tap target; no double-event needed.

### What does NOT change

- `onOpenTileMenu` prop signature is unchanged.
- No other sections in `LatticeMenu` are affected.

---

## Fix 2 — Inner radius validation + generic validation system

### New type

In `react_frontend/src/api/types.ts`, add:

```ts
export interface ValidationError {
  message: string
}
```

### Generic validation pattern

Components that can produce validation errors accept:

```ts
onValidationChange?: (source: string, errors: ValidationError[]) => void
```

`ToolPage` holds a `validationErrors` record keyed by source:

```ts
const [validationErrors, setValidationErrors] = React.useState<Record<string, ValidationError[]>>({})

const handleValidationChange = (source: string, errors: ValidationError[]) => {
  setValidationErrors(prev => ({ ...prev, [source]: errors }))
}
```

At the top of `handleCalculate`, before any socket call:

```ts
const allErrors = Object.values(validationErrors).flat()
if (allErrors.length > 0) {
  setErrorMsg(allErrors[0].message)
  return
}
```

The existing file-upload checks (`!uploadedFile`, ruling mode missing files) remain as inline guards immediately after — they are not yet folded into the `validationErrors` map, but can be in a future pass.

### TileMenu changes

**`TileMenu.tsx`**

- `onValidationChange?: (source: string, errors: ValidationError[]) => void` added to `TileMenuProps`.
- Inner Radius `max` is **fixed at `0.5`** (same range as Outer Radius). The `null` sentinel in `TILE_PARAMS.cross` is replaced with `0.5`.
- The clamp in `buildNext` that reduces Inner Radius when Outer Radius decreases is **removed**. Each slider changes independently.
- Error flag computed inside the component:
  ```ts
  const innerRadiusError = tileType === 'cross' && sliderValues[1] >= sliderValues[0]
  ```
- A `useEffect` fires `onValidationChange` whenever `innerRadiusError` or `tileType` changes:
  ```ts
  React.useEffect(() => {
    if (tileType === 'cross' && innerRadiusError) {
      onValidationChange?.('tile', [{ message: 'Inner radius must be less than outer radius' }])
    } else {
      onValidationChange?.('tile', [])
    }
  }, [innerRadiusError, tileType])
  ```
- The Inner Radius `<Slider>` receives `error={innerRadiusError}`.

### Slider changes

**`Slider.tsx`**

- New optional `error?: boolean` prop.
- When `error` is `true`, the label text and value badge text colour switch to `var(--text-error)` (the same red used in the existing error bar).
- No change to the slider track or thumb — only the label and badge colour change.

### ToolPage wiring

- `<TileMenu onValidationChange={handleValidationChange} … />`

---

## Fix 3 — Clear view button inside each viewer panel

### Design

- When a panel has content (a file or a result STL), a **dashed border** frames the content area.
- A small circular **✕ button** is positioned at the **top-right corner** of the dashed frame — absolutely positioned with a negative offset (e.g., `top: -10px; right: -10px`) so it sits on the frame edge.
- The button is only rendered when there is content. When the panel is empty it reverts to the existing plain drop-zone appearance (no dashed border, no button).
- Clicking ✕ clears the panel's file state completely — the file is forgotten and Calculate will require a new upload.

### ViewerScene changes

**`ViewerScene.tsx`**

- New prop: `onClear?: () => void`.
- When `uploadedFile` or `resultStlGzB64` is non-null:
  - Wrap content in a container with `border: 2px dashed var(--border-base); border-radius: 8px; position: relative`.
  - Render the circular ✕ button absolutely at `top: -10px; right: -10px`.
- Button click fires `onClear?.()`.

### DualViewerLayout changes

**`DualViewerLayout.tsx`**

- New props: `onClear1?: () => void`, `onClear2?: () => void`.
- Each panel independently shows the dashed frame + ✕ button when its file is present.

### ToolPage wiring

Three clear handlers:

```ts
const handleClearSingle = () => {
  setUploadedFile(null)
  setUploadedB64(null)
  setResultGzB64(null)
  setDownloadToken(null)
}

const handleClear1 = () => {
  setUploadedFile(null)
  setUploadedB64(null)
}

const handleClear2 = () => {
  setUploadedFile2(null)
}
```

Wired to `ViewerScene onClear={handleClearSingle}` and `DualViewerLayout onClear1={handleClear1} onClear2={handleClear2}`.

---

## Fix 4 — Remove Navbar; TAMC logo navigates home; CTA on HomePage

### Banner changes

**`Banner.tsx`**

- New optional prop: `onLeftLogoClick?: () => void`.
- The TAMC logo `<img>` is wrapped in a `<button type="button">` styled as `background: none; border: none; cursor: pointer; padding: 0` (preserves existing `labLogoStyle` dimensions).
- `title="Go to home"` on the button for accessibility.
- When `onLeftLogoClick` is undefined the logo renders as a plain `<img>` (no behaviour change for pages that don't pass the prop).

### ToolPage changes

- `<Navbar>` import and render removed.
- `<Banner onLeftLogoClick={() => navigate('/')} />`.

### HomePage changes

- `<Navbar>` import and render removed.
- `<Banner />` without `onLeftLogoClick` (already on the home page — no-op is correct).
- A **CTA section** is added immediately after `<Carousel>` and before `<Footer>`:

```tsx
/* ── CTA ── */
<div style={ctaSectionStyle}>
  <p style={ctaTitleStyle}>Ready to build a lattice structure?</p>
  <p style={ctaSubtitleStyle}>
    Upload your surface file and generate a parametric lattice in seconds.
  </p>
  <Button variant="primary" onClick={() => navigate('/tool')} style={ctaButtonStyle}>
    Open Lattice Maker →
  </Button>
</div>
```

Styles:

```ts
const ctaSectionStyle: React.CSSProperties = {
  backgroundColor: 'var(--navy-primary)',
  padding: '40px 32px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 16,
  textAlign: 'center',
}

const ctaTitleStyle: React.CSSProperties = {
  fontFamily: 'var(--font-heading)',
  fontSize: 22,
  fontWeight: 700,
  color: 'var(--text-on-brand)',
  margin: 0,
}

const ctaSubtitleStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 13,
  color: 'rgba(255,255,255,0.7)',
  margin: 0,
}

const ctaButtonStyle: React.CSSProperties = {
  padding: '16px 48px',
  fontSize: 18,
  fontWeight: 700,
  marginTop: 8,
}
```

---

## Files touched

| File | Change |
|------|--------|
| `react_frontend/src/api/types.ts` | Add `ValidationError` type |
| `react_frontend/src/components/ui/LatticeMenu.tsx` | Section clickable, plus button loses onClick |
| `react_frontend/src/components/ui/TileMenu.tsx` | Fixed inner radius max, remove clamp, error flag, onValidationChange |
| `react_frontend/src/components/ui/Slider.tsx` | Add `error` prop, red label/badge on error |
| `react_frontend/src/components/ViewerScene.tsx` | Dashed frame + onClear button when content present |
| `react_frontend/src/components/DualViewerLayout.tsx` | Per-panel dashed frame + onClear1/onClear2 |
| `react_frontend/src/components/ui/Banner.tsx` | onLeftLogoClick prop, TAMC logo becomes button |
| `react_frontend/src/pages/ToolPage.tsx` | Remove Navbar, wire Banner click, wire clear handlers, wire validation |
| `react_frontend/src/pages/HomePage.tsx` | Remove Navbar, add CTA section below Carousel |

## Out of scope

- Storybook story updates (can follow in a separate pass).
- Folding file-upload validation into the `validationErrors` map (existing guards remain inline).
- Any visual change to the empty-state drop-zone appearance (unchanged).
