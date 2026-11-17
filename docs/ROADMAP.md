# Folio Atelier — Next iteration roadmap

Outline for the next round, from a code review of `main` (2026-11-17). Once approved, work proceeds phase by phase in this order. Performance claims below come from reading the code; profile with `?perf` (Phase A) before and after each fix.

**Goals:** (1) faster, lighter, more responsive; (2) smoother, richer motion; (3) far deeper DIY; (4) more varied shelves and rooms.

**Principles:** real speed first, masking second — unavoidable waits are hidden with cheap, purposeful motion, never an excuse for more GPU/CPU. Respect `prefers-reduced-motion`. Every new spec field gets a default, `normalizeBook` handling, `ZH` strings and a `dirty` key. Keep no-build, no-dependency.

---

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

- **Hot-stamping:** per-layer foil, stamp depth, multiple foils on one cover, foil textures (matte, brushed, diffraction).
- **Relief and tooling:** deboss/emboss from any mask, gold-tooled borders and corner fleurons, inlay/onlay panels, die-cut window.
- **Materials:** cork, canvas, denim, pebbled/snakeskin leather, wood veneer, acrylic; wear and patina slider.
- **Add-ons:** wax seal, metal nameplate, labels and stickers, embroidered patch, monogram generator, image filters and crop handles, SVG ornament upload.
- **Inside:** marbled/deckle/tooled edges, fore-edge painting, marbled and map endpapers, ruled/dotted/grid notebook pages, tipped-in plates, vellum interleaves.

## Phase D — Structure (DIY depth II)

- **Trim presets** (pocket, A5, B5, square, landscape) with thickness from page count; shelf slots follow the format.
- **Binding styles:** Japanese stab (with visible thread), Coptic, long-stitch, accordion, notebook with elastic.
- **Closures:** elastic band, wrap strap, ribbon tie, clasp.
- **Spine and extras:** raised bands, tooled compartments, headcap; dust jacket with flaps, slipcase, clamshell box.
- Bump `SCHEMA_VERSION`; stay backward compatible.

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
