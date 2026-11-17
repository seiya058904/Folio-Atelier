# Folio Atelier — Roadmap, round 2 (Phases G–L)

Round 1 (Phases A–F: speed, motion, decoration, structure, rooms, sharing) is recorded in [roadmap-round-1.md](roadmap-round-1.md).

This round has three sources: the user's review of the deployed build, the parts of round 1 left unfinished (C, D and E were partial), and our own code review. Work goes phase by phase in the order below. Each phase ends with its checks, a status note at the top of this file, and one scoped commit.

**Status:** G, H and I done (2026-11-18); J next.

- **I — done.**
  - The book is split into `body` (trim size, in width and height) and `block` (bulk, in depth). Trim size no longer thickens the boards, and a thick book's cover no longer stretches as it opens. The cause: it turned inside a parent scaled unevenly, and at 160% bulk it stretched to 1.6× its length half-way open.
  - The elastic band has a rounded section and bends round the head and tail with a radius; it is rebuilt for each bulk, with a woven texture and sheen.
  - The pen loop is a flattened woven tube on a cloth tab stitched to the back board.
  - Headbands always show their wound thread, and ribbons end in a swallow tail.
  - The turntable GIF framing now allows for perspective, so large books fit.
  - The sweep and `?bench` are unchanged.
  - Left over: a faint seam where the band's straight strip meets its join; board corners and turn-ins are unchanged.

- **H — done.**
  - Every native `<select>` is replaced by `select()` in `controls.js`: a select-only combobox (keyboard, type-ahead, screen-reader roles) with an animated popover list. Typeface lists set each name in its own face; Frame shows each cover's corner; onlay Shape, Material, endpaper Pattern and page Ornament show their glyphs. It opens in 12 ms, with the first preview at 18 ms.
  - Presses give in 90 ms and spring back. One underline slides between the studio tabs and one pill between segments. Toggles slide on a spring.
  - Dialogs, the room panel and toasts now animate out as well as in.
  - Every CSS duration is a token (`--duration-press … --duration-entrance`).
  - Every `?bench` measure is unchanged or better.

- **G — done.** Measured on an RTX 3070 laptop, `?quality=high`, 1440 × 900, Playwright:
  - First pass along a freshly loaded shelf of 14 books: frame p95 60.6 → 12 ms, worst frame 231 → 13 ms. Cause: each book paid for its painting, its shader variants (100–200 ms each) and its texture uploads on the frame it first scrolled into view. Books now get ready in idle time, nearest first (about 1 s for 14 books).
  - Opening a book: the flight from the shelf had frames of 270–360 ms (studio-resolution repaint, page printing, fonts arriving). Now nothing paints in flight; the worst frame is 86 ms. After landing, the boards sharpen and the leaves print one per frame.
  - Applying a preset in the studio: 300–550 ms → 55–130 ms, and up to 240 ms for the heaviest cover. The edit is drafted at once and sharpened board by board, and shader variants are compiled ahead, so no program compiles mid-edit.
  - Rooms no longer follow the book: the "Follow the book" switch is off by default, and night light gives a dark interface. Colour drags became cheaper as a result: p95 18.3 → 12.1 ms.
  - The band no longer vanishes: a banded book does not crack open on hover, and the band slides off the fore-edge when the cover opens. The turntable sweep (36 views, closed and open) found every part present wherever it faces the camera. Turntable GIFs now frame the whole open book.
  - The "Begin a book" Create button is pinned.
  - The Ego-only report of "a new book opened another book" was traced: the shelf selection followed the animated position, so a slow or throttled window could fall back to the previous book. It now follows the target.
  - Not fixed: the Ego window stays throttled when unfocused (36 ms median frame), so frame rates measured there are not used.
  - Left over: the heaviest cover (midnight) still takes about 150 ms to sharpen at studio resolution; painting off the main thread would be the next step.

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
