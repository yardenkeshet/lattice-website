# Developer Readme
# BACK END:
## Adding new tile types and calculation modes
1. Update the dll.
2. Add the new feartures in `main.py`:
2.a add the new types, for example: 
```
MSDLL_TILE_CROSS          = 0
MSDLL_TILE_DIAGONAL       = 1
MSDLL_TILE_CROSS_DIAGONAL = 2
MSDLL_TILE_NEW_TILE = 3

CALC_MODE_EXTRUSION  = 'extrusion'
CALC_MODE_REVOLUTION = 'revolution'
CALC_MODE_RULING     = 'ruling'
CALC_MODE_NEW_CALCMODE     = 'example'

TILE_TYPE_MAP = {
    "cross":          MSDLL_TILE_CROSS,
    "diagonal":       MSDLL_TILE_DIAGONAL,
    "cross_diagonal": MSDLL_TILE_CROSS_DIAGONAL,
    "new_custom": CALC_MODE_NEW_CALCMODE
}

VALID_CALC_MODES = {CALC_MODE_RULING, CALC_MODE_EXTRUSION, CALC_MODE_REVOLUTION,
    CALC_MODE_NEW_CALCMODE
}
```

# FRONT END:
## Adding new tile types and calculation modes

All tile types and calculation modes are configured in one place: `react_frontend/src/calculation_params.ts`. You don't need to touch any UI components — `LatticeMenu`, `TileMenu`, and `TileCard` all read from these config objects.

### Editing existing calculation modes
Go to `CALC_MODE_DEFS` in `calculation_params.ts` and adjust as you like:
```ts
[YOUR_TILE]: {
    label: 'Your Tile',
    imageUrl: yourTileImg,
    sliders: [
        { label: 'Param Name', min: 0.0, max: 1.0, defaultValue: 0.5, step: 0.01 },
        // one entry per tile parameter, in the order the DLL/backend expects
    ],
},
```

### Adding a new calculation mode

Calculation modes map to the DLL surface functions (`MSDLLMSFromRuling`, `MSDLLMSFromRevolution`, `MSDLLMSFromExtrusion`). To add one:

1. Add a new string constant for the mode key in `react_frontend/src/lib/parameters.ts` (alongside `EXTRUSION`, `REVOLUTION`, `RULING`), and export it.
2. Add an entry to `CALC_MODE_DEFS` in `calculation_params.ts`:

```ts
[YOUR_MODE]: { label: 'Your Mode', requiredFilesCount: 1 },
```

- `label` — display name shown in the UI.
- `requiredFilesCount` — how many STL files the user must upload for this mode (e.g. `2` for Ruling, which needs two surfaces).

3. Make sure the corresponding backend handling exists — the mode key must match what `main.py` / `lattice.py` expect on the `calculate` socket event (see `backend_api.md`).

### Adding a new tile type

Tile types correspond to the DLL's tile enum (`CROSS = 0`, `DIAGONAL = 1`, `CROSS_DIAGONAL = 2`). To add one:

1. Add the tile's preview image to `react_frontend/src/assets/TileTypes/` and import it at the top of `calculation_params.ts`:

```ts
import yourTileImg from './assets/TileTypes/your-tile.png'
```

2. Add a string constant for the tile key in `react_frontend/src/lib/parameters.ts` (alongside `CROSS`, `DIAGONAL`, `CROSS_DIAGONAL`), and export it.
3. Add an entry to `TILE_DEFS` in `calculation_params.ts`:

```ts
[YOUR_TILE]: {
    label: 'Your Tile',
    imageUrl: yourTileImg,
    sliders: [
        { label: 'Param Name', min: 0.0, max: 1.0, defaultValue: 0.5, step: 0.01 },
        // one entry per tile parameter, in the order the DLL/backend expects
    ],
},
```

- `sliders` defines both the UI (shown in `TileMenu`) and the parameter values sent to the backend in `calculateTile` calls — order matters and must match what the backend expects for this tile type.
- The tile key (`YOUR_TILE`) must match the string value the backend/DLL mapping expects (see `backend_api.md` for the tile type → DLL enum mapping).

### Notes

- `CalcMode` and `TileType` are derived automatically from the keys of `CALC_MODE_DEFS` and `TILE_DEFS` (`keyof typeof ...`), so adding a new key automatically extends these types everywhere they're used — no manual type updates needed.
- `TileCard`, `TileMenu`, and `LatticeMenu` iterate over these records generically, so new tiles/modes appear in the UI automatically once added here.
- Double-check `backend_api.md` for the exact string values the backend expects for tile types and calculation modes — the frontend keys must match exactly.
