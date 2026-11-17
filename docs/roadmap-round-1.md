# Folio Atelier — Roadmap, round 1 (Phases A–F, done)

Kept for history. The current roadmap is [ROADMAP.md](ROADMAP.md).

Outline for the next round, from a code review of `main` (2026-11-17). Once approved, work proceeds phase by phase in this order. Performance claims below come from reading the code; profile with `?perf` (Phase A) before and after each fix.

**Status:** Phases A–F done (C, D and E partly; see each note below). Phase A done (2026-11-17). Measured with `?bench` on an RTX 3070 laptop, 1440 × 900, high tier, before → after: front-board slider drag 2.8 → 82 fps (edit-to-pixel 378 → 13 ms); cloth colour drag 2.2 → 56 fps (479 → 20 ms); frames while idle 330 per 2 s → 0 (after a 9 s ambient fade at 30 fps); warm tab switch ≤ 21 ms; keystroke to printed page ≥ 140 → 31 ms.

Phase B done (2026-11-17). Shared motion vocabulary (`src/motion.js` + CSS tokens); cover opens on a spring with a slight overshoot; ribbon sways on open, close and page turns; foil glints after a stamping change; duplicates slide out of their source, deleted books lift and fade while neighbours close the gap; tabs settle in group by group, thumbnails breathe as placeholders and fade in, pressed controls answer in the same frame; loading veil waits (≤ 1.4 s) for the cover fonts and lifts as the mark closes; the next tab is built in idle time, and recycled leaves and the page-list follow are printed in idle time (page-turn click 9 → 0.3 ms with the Pages tab open). All motion is skipped under `prefers-reduced-motion`. Bench unchanged from Phase A (front-board drag 78 fps, foil 165 fps, orbit and page turns 160+ fps, typing 35 ms); frames in the 2 s after page turns 211 → 64 (ambient fade only), shelf idle 0. Not done: low-res → full-res texture cross-fade (the foil glint marks the full-size pass instead) and reshaping the shelf ⇄ studio camera path (carried over from the original; left as is).

**Goals:** (1) faster, lighter, more responsive; (2) smoother, richer motion; (3) far deeper DIY; (4) more varied shelves and rooms.

**Principles:** real speed first, masking second — unavoidable waits are hidden with cheap, purposeful motion, never an excuse for more GPU/CPU. Respect `prefers-reduced-motion`. Every new spec field gets a default, `normalizeBook` handling, `ZH` strings and a `dirty` key. Keep no-build, no-dependency.

---

Phase C done (2026-11-17). C1: relief layer per board (debossed / flat / embossed, depth) added over the cloth normal map by a shared shader patch, skipped while dragging; foil leaf polished / matte / brushed; tooled fillets, leaf roll, corner fleurons, tooled spine compartments with raised cords. C2: leather onlay (laid on, raised) and inlay (set flush) in five shapes. C3: canvas, denim, cork, snakeskin, wood veneer, acrylic; Age (wear, sun-fading, foil flaking). C4: marbled, paste and gauffered edges; notebook pages (lined, dot grid, squared). Fresh-book bench, Phase B vs C (two runs each): colour drag 66 vs 64 fps, front slider 127 vs 121 fps, within run-to-run noise; everything else equal. Not done: multiple foils per cover, die-cut window, patches / nameplate / wax seal / stickers / monogram generator, pebbled-leather variant, fore-edge painting, paste-paper and map endpapers, tipped-in plates, vellum interleaves, footnotes, image filters and crop handles, SVG upload.

Phase D (partial, 2026-11-17). A Structure tab: trim sizes pocket / crown octavo / standard / large (uniform scale, standing on the shelf line), thickness 55–160 %, an elastic closure band that slips off when the book opens, and a pen loop on the back board; all in `book.structure`, untouched by binding presets. Trims keep the 2 : 3 board because every cover painter is laid out on it: square and landscape formats need per-format painter layouts and geometry and are left for later, as are the construction families (Japanese stab, Coptic, long-stitch, accordion, soft cover), wrap strap, ribbon tie, clasp, inner pocket, bookmark charm, corner rounding, dust jacket, slipcase and clamshell box, and thickness derived from page count.

Phase E (partial, 2026-11-17). A Room panel on the shelf: walnut, oak, painted white, black steel or a frameless ledge, and studio, morning, golden-hour or night light (the softbox, warmed, plays the lamp; no light is added, so nothing recompiles). Saved per library in localStorage; each book still tints the room with its palette and the room settles on top. Not done: glass cabinet, desk, window sill, plinth; stacks, leaning, face-out, multi-row, bookends, drag-to-reorder, shelf per collection.

Phase F done (2026-11-17). Design tab → Share: a PNG of the current view, a 36-frame turntable GIF (360 px, own median-cut + LZW encoder in `src/share.js`, about 1 s) and a PDF of every printed page (one JPEG per page at 2×, own minimal writer). Shelf → Export all writes `folio-library.folio` (format `folio-atelier-library`, version 3: every book with its pictures, plus the room); Import reads it as well as single-book v1 files. Checked by decoding all 36 GIF frames and every PDF xref offset with an independent script.

Follow-up (2026-11-17): after Phase F the colour drag measured about 8 % below Phase B. A per-phase bisect showed the 3D path unchanged; the cost was the page-wide style recalculation when the interface theme follows the book colour, which grew with the studio's DOM. The interface now restyles once a drag rests (a single swatch click still restyles at once): colour drag 64 → 87 fps and edit-to-pixel 14.6 → 9.1 ms against Phase B.

## Phase A — Speed (do first)

Causes found: every `oninput` repaints cover/spine/back/endpaper synchronously (up to 1536×2304 plus mipmaps and upload); `front` edits also repaint spine and endpaper; tab switches rebuild the whole panel and repaint all thumbnails; the render loop never idles (GTAO + 4× MSAA every frame); quality only steps down once.

1. `?perf` overlay: frame time, repaint ms per painter, texture uploads. Baseline numbers first.
2. Coalesce edits: merge `dirty` sets and repaint once per `requestAnimationFrame`; paint at reduced resolution while dragging, full resolution on release.
3. Narrow the dirty → painter map in `rig.repaint`.
4. On-demand render loop: render only while something moves; idle = no frames.
5. Panel: build each tab once and show/hide; thumbnail cache keyed by spec fields; paint only visible tiles.
6. Adaptive quality: lower pixel ratio and AO while orbiting, restore at rest; make `watchFrameBudget` continuous (down and up); consider half-res GTAO and 2× MSAA.
7. Page refresh: longer debounce while typing; cache text measurement; defer audio and non-visible fonts until after first paint.

**Done when:** slider drag ≥ 50 fps, control-to-pixel < 50 ms, tab switch < 100 ms, idle GPU ≈ 0, console clean.

## Phase B — Motion and perceived speed

- One shared easing/spring helper for CSS and 3D tweens.
- Instant feedback on every control (press state within one frame), heavy work deferred.
- Panel and tab transitions (stagger, cross-fade), tile hover lift, skeleton thumbnails that fade in.
- Repaint cross-fades (low-res → full-res, old page texture → new) and a foil-glint on change.
- Book life: create (drop in), duplicate (slides out), delete (lifts, fades), neighbours shift; shelf ⇄ studio camera path with eased legs; opening overshoot; ribbon sway; idle dust in light.
- Loading intro (a book closing/binding) covering engine and font setup; idle pre-painting of the next spread; prefetch for the likely next tab.

**Rules:** masks ≤ ~600 ms, never block input, verified with `?perf` not to lower fps.
**Done when:** every state change animates and unavoidable waits are masked.

## Phase C — Decoration (DIY depth I)

Researched against bookbinding references (tooling, onlay/inlay, blocking, edge decoration). Ordered by visual payoff per effort; fits the existing mask + foil-layer pipeline.

**C1 — Stamping and relief (core, do first)**
- **Three stamp modes per layer:** foil, *blind* (heat-pressed, no colour — the oldest decoration, and the usual first step before gilding), and ink. Add stamp depth so blind/foil/ink can sit debossed or embossed (normal-map relief from the same mask).
- **Foil-embossed combo** (foil plus raised relief) and **multiple foils** on one cover; foil textures: matte, brushed, diffraction.
- **Hand-tooling kit:** gold-tooled fillets (lines), rolls, corner fleurons, panel frames and spine compartments, drawn from the existing border/ornament painters.

**C2 — Inlay and onlay**
- **Onlay** (contrasting leather laid on top, in relief) and **inlay** (flush piece set into a cut-out) as a "panel" layer with its own material and colour; window die-cut showing the endpaper beneath.
- Stitched/embroidered patch, metal nameplate, wax seal, label and sticker set, monogram generator.

**C3 — Materials and age**
- New grains: cork, canvas, denim, pebbled and snakeskin leather, wood veneer, acrylic.
- Wear/patina sliders: scuffing at corners and spine, edge rub, foil wear, sun-fading, optional stains.

**C4 — Inside the book**
- **Edges:** marbled, German-paste (brushed paste patterns), sprayed/stencilled, gauffered (gilt edge tooled with repeating patterns), and **fore-edge painting** — an image visible only when the pages are fanned (single and double variants; a great 3D showpiece).
- **Endpapers:** marbled, paste paper, map and photo prints; printed hinges.
- **Pages:** ruled/dotted/grid notebook pages, tipped-in plates, vellum interleaves, running heads, footnotes.
- Image tools: duotone/halftone/engraving filters, crop handles, SVG ornament upload.

## Phase D — Structure (DIY depth II)

Researched against hand-binding and commercial journal/notebook options.

**D1 — Format and construction**
- **Trim presets** (pocket, A5, B5, square, landscape, tall) with thickness from page count; shelf slots follow the format.
- **Construction families:**
  - *Case binding* (hardcover — current default), with rounded or square spine, flexible or hard cover.
  - *Japanese stab* — visible side thread, 4/5/6-hole and hemp-leaf patterns; doesn't open flat.
  - *Coptic* — exposed chain stitch on the spine, lies flat when open.
  - *Long-stitch* — exposed stitching across a soft wrap cover.
  - *Accordion* (leporello) — unfolds into a strip.
  - *Soft-cover notebook* with sewn or glued spine.

**D2 — Journal-style practical options** (what notebook makers commonly offer)
- **Closures:** elastic band (colour-matched), wrap strap, ribbon tie, clasp.
- **Pen loop**, **inner pocket** / expandable back pocket, second ribbon, bookmark charm, corner rounding.
- **Spine extras:** raised bands, tooled compartments, headcap and tailband styles.

**D3 — Protective extras**
- Dust jacket with flaps (separately designable), slipcase, clamshell box; each gets its own cover painter and appears on the shelf.

**Notes:** structure changes touch rig geometry, shelf spacing, thumbnails and page layout, so build one family at a time (order: trim presets → closures/pen loop/pocket → Coptic and Japanese stab → accordion → jacket and slipcase). Bump `SCHEMA_VERSION`; stay backward compatible. Add a "Structure" tab to the studio rather than growing Details.

**Sources:** [Morgan Library on tooling](https://www.themorgan.org/book/export/html/1180291), [Adelaide: hand tooling](https://www.adelaide.edu.au/library/special/exhibitions/cover-to-cover/hand-tooling/), [Adelaide: edge decoration](https://adelaide.edu.au/library/special/exhibitions/cover-to-cover/edge-decoration), [AIC book decoration](https://www.conservation-wiki.com/wiki/Book_Decoration), [Friesens: deboss/emboss](https://www.friesens.com/books/specialty-options/specialty-finishes/debossemboss/), [Tiny Workshops: binding techniques](https://tinyworkshops.com/bookbinding-techniques/), [Vistaprint journal options](https://www.vistaprint.com/promotional-products/writing-office/padfolio-notebooks).

## Phase E — Shelves and rooms

- Shelf styles: oak, painted white, black steel, floating ledge, glass cabinet, desk with lamp, window sill, museum plinth.
- Arrangements: stacks, leaning, face-out, multi-row; bookends and props; drag-to-reorder; shelf per collection.
- Lighting: morning, golden hour, night with lamp; per-library choice saved.

## Phase F — Share

PNG / turntable GIF export, print-ready PDF of pages, whole-library import/export (`.folio` v3).

---

## Verification

- **Playwright** each phase: scripted flows, timings from `?perf`, console-error sweep, tier and language checks.
- **Ego browser** at the end of each phase and before release: full walkthrough on the real GPU and the deployed Pages build.
- Compare with the live original before touching rig, lighting or page motion.
- Each phase ends with a scoped commit; pushing and deploying need the user's go-ahead.
