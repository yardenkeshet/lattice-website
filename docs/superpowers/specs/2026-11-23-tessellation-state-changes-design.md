# Tessellation fineness (design)

## Why
The Tessellation slider currently does nothing: the server never calls
`MSDLLSetPolyTolerance`. Tessellation must affect every calculation, and one
user's value must never affect another user's output. The user decided each
moment the value changes or is used. `gershon/` is not modified.

## The value
- Whole number 2–200, higher = finer (exactly what `MSDLLSetPolyTolerance`
  accepts). Default 20. Slider step 1. — user
- Sent as `tolerance` on `calculate`, `calculate_tile` and
  `POST /convert_igs_to_obj`. Missing → 20. Not a whole number in range → the
  request is rejected with the usual error. — builder's call
- Affects OBJ meshes only. The exported IGS is exact.

## Isolation (server)
Fineness is global state inside each loaded DLL copy (`dll_main`,
`dll_background`), and each copy already runs one call at a time
(`calc_queue.py`, `dll_lane.py`). So `DllInstance` sets the request's fineness
immediately before every DLL work call (`get_tile`, `from_*`, `iges2obj`),
inside that exclusive section. The server stores no per-user fineness. A value
left behind by one user is always overwritten before the next call runs.

## State changes

| Moment | Behaviour | Decided by |
|---|---|---|
| Page load / reload | Always 20, not remembered | user |
| Calc-mode switch | Value kept | user |
| "Reset Display Settings" | Leaves fineness alone | user |
| Slider released, no calculated lattice on screen | Re-convert surfaces, recalc tile, re-run macro-shape preview | builder |
| Slider released, calculated lattice on screen | Recalculate the lattice automatically (real calculation through the queue, normal overlay) | user |
| …that recalculation uses | The settings the shown lattice was made with; only fineness changes. Unsaved edits wait for Make Lattice | user |
| Slider during a calculation | Not possible — the page is locked while calculating | user |
| Upload / tile change / Make Lattice | Use the current value | builder |

Builder's calls:
- A release at the same value the shown lattice was made with doesn't recalculate it.
- An auto-recalc skips the macro-shape preview. Both come back as `model_obj`
  and are routed by a counter, so running both at once could misroute them.
- If the auto-recalc fails or is rejected, the old lattice stays, the usual
  message shows, and the slider keeps its new value.
- The camera doesn't reset on a fineness-only recalc.

## Approaches
1. **Per-call set inside `DllInstance` + frontend snapshot (chosen).** The
   server applies each request's value right before each DLL call. ToolPage
   keeps the exact `calculate` payload behind the lattice on screen and
   re-sends it with the new `tolerance`.
2. Per-user fineness stored on the server. Rejected: shared DLL state plus
   per-user server state is exactly where leaks between users come from.
3. Recalculate with the current settings. Rejected by the user.
