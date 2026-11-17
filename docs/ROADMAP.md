# Folio Atelier — Roadmap, round 2 (Phases G–L)

Round 1 (Phases A–F: speed, motion, decoration, structure, rooms, sharing) is recorded in [roadmap-round-1.md](roadmap-round-1.md).

This round has three sources: the user's review of the deployed build, the parts of round 1 left unfinished (C, D and E were partial), and our own code review. Work goes phase by phase in the order below. Each phase ends with its checks, a status note at the top of this file, and one scoped commit.

**Status:** not started (planned 2026-11-17).

**Goals, in priority order**
1. Nothing should feel broken or stiff: no stutter, no parts vanishing, no native controls, no abrupt transitions.
2. Finer craft: models and materials that hold up in close-ups.
3. The room belongs to the reader: books no longer recolour it, and shelves and rooms become real places.
4. Finish what round 1 left open in structure, shelves and decoration.

**Rules (unchanged from round 1, plus three)**
- Real speed first; mask only waits that cannot be removed, with cheap motion that respects `prefers-reduced-motion`.
- Run `?bench` before and after every phase; no measure may get worse than the phase before. When a measure moves, bisect by phase before guessing.
- Every new spec field gets a default, `normalizeBook` handling, `ZH` strings (check for key collisions first) and a `dirty` key; no build step, no dependencies, Three.js stays at 0.165.
- New: never add or remove a light, or toggle a material feature, at run time without measuring the recompile; prefer fixed lights at zero intensity only if the per-pixel cost is measured and accepted.
- New: every 3D change is checked with a turntable sweep (36 views of the open and closed book) so nothing disappears at some angle.
- New: Ego checks run with the window in front and cache disabled; a throttled window (about 28 fps) does not count as a measurement.

---

## Phase G — Fix what feels broken (first)

Reported by the user, causes confirmed in the code unless marked *(to measure)*.

**G1. Stutter while moving along the shelf** *(to measure)*
- Baseline first: `?perf` frame times while dragging and wheeling through 12+ books, and a new `?bench` step for it.
- Likely causes: every change of selected book restyles the whole page theme (the same page-wide style recalculation fixed for colour drags); books entering view paint three full-size boards in one frame; the room colour eases with every book.
- Fixes: no interface restyle while moving, one restyle when the shelf rests; paint boards for books about to enter view in idle time, first at draft size; spread first paints over frames.
- Done when: shelf drag frame p95 < 20 ms with no frame over 50 ms, at least as good as round 1 everywhere else.

**G2. Books no longer recolour the room**
- Cause: inherited from The Complete Shelf, each book's palette drives the walls, floor, shelf and lights; the Room panel only settles on top of it.
- Change: the room's colours come from the Room settings alone. A book's palette tints only the book and the studio panel accent. An optional "Follow the book" switch (off by default) keeps the old behaviour.
- Done when: switching books leaves the room unchanged; no room easing work while browsing.

**G3. The closure band vanishes**
- Cause: hovering the book in the studio cracks the cover open by about 9°, and the band hides as soon as the cover opens.
- Change: a banded book does not crack open on hover (the band tugs instead); when the book really opens, the band slides off the fore-edge with a short animation rather than vanishing.

**G4. Nothing vanishes at any angle**
- Audit transparent materials (all book materials are transparent for the shelf fade), draw order, `polygonOffset` and frustum culling of thin parts (foil planes, band, pen loop, ribbons, headbands).
- Add the turntable sweep as a repeatable check: 36 frames each of the closed and open book, every part present in every frame.

**G5. Small fixes found in review**
- The "Begin a book" dialog keeps its Create button pinned at the bottom instead of scrolled out of view.
- Recheck the two Ego-only reports in an unthrottled window: an edit taking 5 s to appear after many changes at once, and a new book where the studio opened another book.

## Phase H — Controls and motion

**H1. A custom select** replacing every native `<select>` (trim, border, shape, material, edge finish, fonts, layouts…): a popover list in the panel's style, keyboard and screen-reader complete, with small previews where they help (border, shape, material, edge, typeface), animated open and close.

**H2. Tactile buttons.** Press and release both eased with `--ease-spring` (today the release snaps back); consistent hover, selected and focus states; a sliding indicator for segmented controls and tabs; toggles that slide rather than jump.

**H3. One motion system.** Every duration and curve comes from `src/motion.js` and its CSS tokens; review all transitions (panel, tabs, toasts, dialogs, room panel, tooltips, page list) for consistency and reduced-motion behaviour.

Done when: no native form popups remain except colour and file pickers; every control answers within one frame; `?bench` tab switch and slider measures unchanged.

## Phase I — Finer models

Compare against the live original before changing rig, lighting or page motion.

- **Closure band:** a real elastic strip with a rounded section, bending round the head and tail with a radius, ends tucked under the back board; a little sheen.
- **Pen loop:** a flattened fabric tube on a cloth tab stitched to the back board, with visible stitching and a woven material.
- **General pass:** board corners, rounded spine and joints, headbands, ribbon ends, turn-ins and the endpaper joint, block thickness. Trim sizes must not thicken the boards: scale the block, keep board thickness.
- Each item gets before/after close-ups and a bench run.

## Phase J — Structure (completing Phase D)

1. **Square and landscape formats:** cover layouts move to proportional coordinates so painters work on any board ratio; geometry per format; shelf slots follow the format.
2. **Dust jacket** (its own design, flaps, removable) and **slipcase** (the book slides out), both shown on the shelf.
3. **Bindings:** Japanese stab (visible thread, 4/5/6-hole and hemp-leaf), soft cover, Coptic (exposed chain stitch, lies flat), accordion (unfolds to a strip). One family at a time.
4. **Practical options:** wrap strap, ribbon tie, metal clasp, inner pocket, rounded corners, thickness from page count.

`SCHEMA_VERSION` bump with full backward compatibility; a Structure tab section per family.

## Phase K — Shelves and rooms (completing Phase E)

1. **Distinct places, not recoloured shelves:** glass cabinet, desk with a modelled lamp, window sill with window light, museum plinth.
2. **Arrangement:** upright, stacked, leaning, face-out, multi-row; bookends and small props; slot widths from each book's trim and thickness.
3. **Drag to reorder** on the shelf, and **collections** shown as separate shelves.
4. **Light:** a real lamp model for night; any extra light is fixed in the scene and measured for its per-pixel cost.

## Phase L — Decoration (completing Phase C)

- Several foils on one cover (a foil per element).
- Fore-edge painting, visible when the pages fan.
- Badges, nameplate, wax seal, stickers; a monogram generator.
- Paste-paper and map endpapers; tipped-in plates; vellum interleaves; footnotes.
- Image filters (duotone, halftone, engraving), crop handles, SVG ornament upload.

---

## Throughout

- **Review:** a code review of each phase's diff before its commit.
- **Bench coverage:** add shelf drag, book switching, custom select and turntable sweep to `?bench`, so regressions show up as numbers.
- **Scale:** first-load time and memory with 30+ books; keep full-size textures only for books near the view if needed.

## Order and size

G → H → I come first: they are what the user feels most directly, and G and H should each fit in one round of work. J and K are the largest (new geometry and layout), L is many small independent pieces.
