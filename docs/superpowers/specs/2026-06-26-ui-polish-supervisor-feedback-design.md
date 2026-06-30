# UI Polish — Supervisor Feedback
**Date:** 2026-06-26  
**Branch:** `feature/ui-polish-supervisor-feedback` (from `feature/file-handling-redesign`)

## Overview

A set of UI changes requested by the project supervisor, covering structural removals, label renames, toolbar reorganisation, and a new custom `Tooltip` component applied site-wide. All changes are in the React frontend (`react_frontend/`).

---

## 1. New Branch

```
git checkout -b feature/ui-polish-supervisor-feedback
```

---

## 2. Structural Removals & Fixes

### 2.1 Both menus always open

**LatticeMenu** (left panel) and **TileMenu** (right panel) must always be visible — remove all open/close toggle logic.

- **ToolPage.tsx:** Remove `isLatticeMenuOpen` and `isTileMenuOpen` state. Always render both panels.
- **LatticeMenu.tsx:** Remove `isOpen` and `onToggle` props. Remove the collapsed-state rendering (the hamburger icon branch). The component always renders its full 300px panel.
- **TileMenu.tsx:** Remove `onClose` prop. Remove the × close button from the TileMenu header.

### 2.2 Remove "Lattice Tile" section from LatticeMenu

The tile mini-preview section at the top of LatticeMenu (thumbnail + "Open Tile Menu" button, controlled by `onOpenTileMenu`) must be removed entirely. Remove `onOpenTileMenu` and `tilePreviewUrl` props.

### 2.3 Remove tile count upper limit

The `nt1`, `nt2`, `nt3` NumberInputs in LatticeMenu currently have `max={10}`. Remove the `max` constraint. Keep `min={1}`.

### 2.4 Remove × clear button from ViewerScene

The circular × button (top-right of the viewer canvas, shown when content is loaded) must be removed. Remove the button element and its `onClear` prop entirely. Users can no longer clear the viewer by clicking ×.

### 2.5 Remove "Add Files" button from Toolbar

The `+` icon button at the far-left of the Toolbar must be removed. File loading is handled exclusively through the "Load surfaces as IGES Files" section in LatticeMenu. Remove `onFilesAdd` and `fileNames` props from Toolbar, and remove the file input element.

### 2.6 Move Export button from LatticeMenu to Toolbar

- Remove the Export button/popup from LatticeMenu.
- Add an "Export Lattice" button to the Toolbar, placed **to the left of the "Make Lattice" button**.
- The button is **disabled** when no lattice result is currently displayed (i.e. when `resultGzB64` is null/empty).
- On click it opens the same export popup (STL / IGS options) that previously lived in LatticeMenu.
- Pass `onExportStl`, `onExportIgs`, and `canExport` as new props to Toolbar.

---

## 3. Renames

| Old label | New label | Location |
|-----------|-----------|----------|
| "Calculation Mode" | "Macro-shape Construction" | LatticeMenu section heading |
| "Add Files" | "Load surfaces as IGES Files" | LatticeMenu section heading |
| "Export" | "Export Lattice" | Toolbar button (see §2.6) |
| "Calculate" | "Make Lattice" | Toolbar button |
| Page `<title>` "react_frontend" | "Lattice Maker" | `react_frontend/index.html` line 7 |

---

## 4. Custom Tooltip Component

### 4.1 Component: `src/components/ui/Tooltip.tsx`

A reusable hover tooltip that wraps any child element. Characteristics:
- Appears above the child by default; flips below if the child is near the top of the viewport.
- Dark semi-transparent background (`var(--bg-secondary)` or similar site token), white text, small font, rounded corners, subtle shadow — matching the site's existing panel/card style.
- No external library dependency (pure CSS + React state / `onMouseEnter` / `onMouseLeave`).
- `maxWidth: 320px` with `white-space: pre-line` so multi-line tooltip text renders correctly.
- Props: `content: string` (the tooltip text), `children: React.ReactNode`.

```tsx
// Usage
<Tooltip content="Some tooltip text">
  <SomeElement />
</Tooltip>
```

### 4.2 Tooltip placements

| Target element | Tooltip text |
|----------------|-------------|
| LatticeMenu panel title/header | "The lattice maker's main widget" |
| Tiles Counts section heading / inputs | "Number of tiles to place along the two (XY) axes of the parametric domain of the input surfaces and Z (out of the two surfaces). Must be a number between 1 and 10, in each axis." |
| Macro-shape Construction dropdown | "Three types of volumetric macro-shape volumetric (trivariate) construction are supported:\n1. Extrusion – the input IGES surface is extruded in +Z by a desired extrusion length.\n2. Revolution – the input IGES surface is revolved around the +Z axis.\n3. Ruling – the two input IGES surfaces are ruled in between.\nEach IGES file should contain either a single tensor-product Bezier surface or a single tensor-product B-spline surface, with no interior knots. UV/degrees could be anything." |
| Load surfaces as IGES Files section heading | "The Extrusion and Revolution constructors of the macro-shape require that one IGES file surface be specified here. The Ruling constructor requires two IGES file surfaces. Each IGES file should contain either a single tensor-product Bezier surface or a single tensor-product B-spline surface with no interior knots. U/V degrees could be anything." |
| Camera mode toggle (Toolbar) | "Toggles between perspective and orthographic views." |
| TileMenu panel title | "Tile selection. Three types of tiles are supported here – a 6-arms 3D cross tile, an 8-arms diagonal tile, and a tile with 14 arms, cross and diagonal. The parameters of the arms and core sizes could be set below." |
| Tile type cards (the grid of 3 cards) | "The three tile types to select from." |
| Tile param sliders | "Tile-specific parameters, controlling arm thicknesses, etc." |
| Grading sliders (G1, G2) | "A linear grading control over the thickness of the arm in the tiles, along the third, Z, direction. Values between zero and one." |
| Mesh Color picker | "The colors of the foreground objects (tiles, lattice, etc.) in the graphics display." |
| Background Color picker | "The background color of the graphics display." |

---

## 5. Files Changed

| File | Changes |
|------|---------|
| `react_frontend/index.html` | Update `<title>` to "Lattice Maker" |
| `react_frontend/src/pages/ToolPage.tsx` | Remove `isLatticeMenuOpen`, `isTileMenuOpen` state; always render both panels; pass new Toolbar props |
| `react_frontend/src/components/ui/LatticeMenu.tsx` | Remove `isOpen`, `onToggle`, `onOpenTileMenu`, `tilePreviewUrl` props; remove collapsed branch; remove tile preview section; remove max on tile counts; remove Export button; rename section headings |
| `react_frontend/src/components/ui/TileMenu.tsx` | Remove `onClose` prop and × button from header; add Tooltip to title and sections |
| `react_frontend/src/components/ui/Toolbar.tsx` | Remove file-add button; add Export Lattice button left of Make Lattice; rename Calculate → Make Lattice; add `onExportStl`, `onExportIgs`, `canExport` props; add Tooltip to camera toggle |
| `react_frontend/src/components/ViewerScene.tsx` | Remove × clear button and `onClear` prop |
| `react_frontend/src/components/ui/Tooltip.tsx` | New component |
| `react_frontend/src/components/ui/Tooltip.stories.tsx` | Storybook story for Tooltip |

---

## 6. Out of Scope

- Backend changes (none required).
- Legacy `static/client.js` frontend (not touched).
- Any other LatticeMenu or TileMenu behaviour not listed above.
