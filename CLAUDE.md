# Folio Atelier — project notes

A 3D book-making studio remixed from `mengto/complete-shelf`. See `README.md` for the feature list and module map.

## Constraints

- No build step, no npm dependencies. Native ES modules; Three.js 0.165 pinned in the import map in `index.html`. Ask before upgrading Three.js or adding a dependency.
- The interface is bilingual (English and Simplified Chinese). English is the source language in code; every new visible string needs an entry in the `ZH` table in `src/i18n.js`. Book content must keep working with CJK text.
- The original repository has no licence file, but its README invites remixing ("Build or remix it with an agent"). Keep the credit in `README.md` and never add its brand-themed cover artwork or product names. Pushes and deployments still need the user's go-ahead (given for the initial publication on 2026-11-17).
- Preserve the 3D quality of the original (materials, page physics, transitions). Compare against the live original before changing rig, lighting or page motion.

## Run and verify

```bash
python -m http.server 4173   # then http://localhost:4173
node --input-type=module --check < src/engine.js   # syntax check any module
```

There is no test framework. Verify in a real browser: empty shelf on first visit, create a book, edit each studio tab and watch the model update, open and turn pages, reload to confirm it persisted. The console must stay free of errors.

Which browser tool to use:

- **Playwright** — scripted, repeatable checks during iteration: driving a flow, measuring timings, console-error sweeps, rendering-tier and language comparisons.
- **Ego browser** (the `ego-browser` skill) — the broader, real-world pass: whole-product walkthroughs, visual and feel review, and the final check of a finished or deployed build. It is a normal Chromium with real GPU, window focus and user context, so its frame rate and behaviour match what users see. Prefer it for release sign-off.

Roadmap: `docs/ROADMAP.md` (phase status is recorded at the top of it; earlier rounds are in `docs/roadmap-round-1.md` to `docs/roadmap-round-4.md`).

Performance stance: optimise real cost first; where a wait is unavoidable, hide it with cheap, purposeful motion (instant feedback, skeletons, cross-fades, loading choreography). Masking must never be used as a reason to spend more GPU/CPU, and must respect `prefers-reduced-motion`.

When driving the page with Playwright:

- Call `page.bringToFront()` first — an occluded window throttles `requestAnimationFrame` to about 2 fps and transitions appear stuck.
- `python -m http.server` lets the browser reuse stale modules after an edit. Add `await page.route('http://127.0.0.1:4173/**', r => r.continue())` to disable the cache.
- File pickers: the app calls `input.click()`. Stub it for file inputs in the page, click the button, then `page.setInputFiles('#image-file' | '#import-file', …)`.
- Compare rendering tiers with `?quality=high` and `?quality=balanced`.
- `?perf` shows the overlay (frame rate, repaint ms per painter, uploads, edit-to-pixel); `?perf=gpu` waits for the GPU each frame so the numbers include rendering. `?bench&perf&lang=en&quality=high` runs `src/dev/bench.js` and leaves the result in `window.__bench`; run it before and after any change that could cost speed. With `?perf`, `window.__folio` exposes `{ engine, store }` and `engine.debug` has the render-scale hooks.
- A window that is not in front throttles `requestAnimationFrame` (about 3 fps): timings taken there are meaningless, and the engine will lower its moving resolution in response.
- Force a language with `?lang=zh` or `?lang=en`. To find untranslated strings, visit every tab in Chinese and read `(await import('/src/i18n.js')).missing` — colour codes and typeface names are expected there, sentences are not.

## Architecture rules

- A book is one `BookSpec` (`src/state/schema.js`). Change the spec only through `store.update(id, mutate, { dirty })`; the engine repaints from the store's `change` event. `dirty` names what changed: `front`, `spine`, `back`, `material`, `foil`, `details`, `pages`, `interior`, `meta`, `all`.
- Interface text: wrap it in `t("English words")` from `src/i18n.js`. The control builders in `src/ui/controls.js` translate their own labels, hints, placeholders and option labels, so pass them plain English. Two different meanings must not share one English key (for example the page type "Blank" and the preset "Bare"). Words printed inside a book follow `book.interior.labels`, not the interface language (`printed()` in `pages.js`).
- Edits that change what is painted on the boards but live under `details` (stab stitching, corner pieces) must send `dirty: ["details", "material"]`; `details` alone only refreshes endpapers and material parameters.
- All-over patterns are drawn once as a white mask (`patternMask` in `textures/patterns.js`) and stamped per finish; add a pattern there and list it in `PATTERNS` (and `ENDPAPER_PATTERNS` if it suits paper).
- Adding a spec field: give it a default in `schema.js` and make sure `normalizeBook` fills it for stored books.
- Painters in `src/textures/` draw on logical canvases (768 × 1152 covers, 320 × 1536 spine, 512 × 768 pages) and must not depend on canvas pixel size.
- Foil is a mask on the foil layer; print and blind stamping go on the base layer (`withFinish` / `stampFinish` in `faces.js`, which take the element itself). An element with `finish: "foil"` and `leaf: "second"` is drawn magenta (`leafInk`), anything else white; the foil shader (`compileLeaf` in `rig.js`) tints by the green channel with the `leafMain` / `leafSecond` uniforms, so both foil colours change without a repaint. Draw anything new on the foil layer with `leafInk(element)`, never a colour.
- Post-processing is ambient occlusion only (`buildComposer` in `engine.js`). Bloom and depth of field were tried and removed because they blur printed pages; do not re-add them without a side-by-side check.
- Tone mapping is Khronos PBR Neutral (`TONE_MAPPING`, exposure 0.84) so a cloth renders the colour of its swatch; ACES shifted and greyed saturated cloths. The room was tuned under ACES, so `tameRoomForNeutral` scales back the saturation of the walls, floor and lights. Reflections come from a `RoomEnvironment` tinted and dimmed per light preset (`buildEnvironment`, rebuilt only when the light changes; the texture swap keeps every program).
- Each printed leaf face samples its partner's map at (1 − u, v) for show-through (`compileThrough` in `rig.js`, strength per paper stock in `SHOW_THROUGH`); `linkShowThrough` must run whenever a face's map changes.
- Boards of the book in hand cross-fade when repainted (`repaint({ fade })`, `beginSwap` / `stepSwaps` in `rig.js`, `SWAP_*` in `engine.js`): the old picture is copied on the GPU (`snapshotTexture`) and the board and foil shaders mix from it (`swap` uniforms). A material clone made for compilation must keep `userData.swap` as well as `relief` / `leaf` (see `shaderVariants`). Streams of edits (drags, typing) never fade.
- Pointer hit volumes sit on `HIT_LAYER` so they are raycast but never rendered.
- The render loop sleeps. Anything that changes what is on screen must call `requestFrame()`; anything animated must go through the tracked `damp()` or set `motion = true` in its frame, or the loop stops under it. Shadows are redrawn only on frames with `shadowHold > 0`.
- Edits are queued by `refreshBook` and painted once per frame in `flushRepaints`. `rig.repaint()` takes no dirty list: each painter is skipped when its signature (`faceSignatures`, `endpaperSignature`, `pageSignature`) is unchanged, so **a painter that reads a new spec field must add that field to its signature** or the change will not show. Edits with a `key` (drags, typing) and whole-book edits (`all`, `material`) paint at draft resolution and skip boards turned away from the camera; the full-size pass (`settleDrafts`) follows 170 ms after a drag (50 ms after a click) and paints **one board per frame** (`repaint({ budget: 1 })`), facing boards first. Font arrivals and the studio-resolution upgrade on opening go through the same pass. Nothing is painted while a book flies between shelf and studio; its pages are printed after it lands, one leaf per idle moment (`leafQueue`), and at once if the reader opens it first.
- On the shelf, books are made ready in idle time, nearest first (`warmStep`): painted, compiled (`compileQuietly`, which compiles against the composer's target so the programs match) and uploaded. In the studio, `prewarmVariants` compiles stand-ins for every material feature combination (`rig.shaderVariants`). **A new feature a material can switch on or off (any physical property whose setter bumps the material version) must be added to `shaderVariants`**, or editing it compiles a program mid-frame.
- Paint textures upload unflipped (`createPaintTexture`: `flipY = false`, a `repeat.y = -1` transform), opaque layers premultiplied. Anything that samples them must go through a map's UV transform (as the relief does with `vMapUv`).
- The room is the reader's: walls, floor, shelf and lights come from the Room settings (`roomPalette`), not from the book in view, unless the reader turns on "Follow the book" (`room.follow`). The book lends only its foil colour, as `--accent` on `#studio`. The selection follows `targetPosition`, not the animated `position`.
- Chrome rasterises a 2D canvas lazily: a painter's JavaScript time says little; its pixels are paid at the end of the frame (`CanvasRenderingContext2D::FinalizeFrame` in a trace) or when the canvas is next read or drawn. Measure a painter with a forced flush (`getImageData(0, 0, 1, 1)`) inside the timing.
- The material grain never depends on the dye: studio-size grain is cached (`grainCaches` in `surface.js`), and its soft parts (mottling, edge and foot shading) are drawn on a quarter-size sheet. Pages lay down cached paper sheets (`paperSheet` in `pages.js`) instead of drawing fibres per page.
- The grain painter lives in `textures/grain.js` (pure 2D canvas, no Three) so `textures/grain-worker.js` can paint it ahead on an OffscreenCanvas (`prefetchGrain`, via `prefetchBoardGrain` in `faces.js`, which must mirror the `paintMaterialBase` calls in `paintBoard` / `paintSpine`). Ask ahead wherever the next board can be guessed: the book being opened, the shelf selection at rest, a tile under the pointer (`engine.prefetchGrain`).
- Modules are plain files under GitHub Pages' ten-minute cache, so right after a deploy a browser can assemble old and new modules together and fail to link. The boot watchdog in `index.html` heals that once by itself (refetches the page's scripts with `cache: "reload"` and reloads; `folio-atelier-healed` in sessionStorage, cleared by `start()`). Keep it working when changing how the app boots.
- To find stalls, run the stutter census (`.playwright-mcp/w-census.js`): it attributes every frame over 20 ms to the step of a scripted visit and lists long-animation-frame scripts. Compare against the previous release served from a `git worktree` on another port.
- The frame loop absorbs a lone long frame (`typicalGap` in `frame`): animations advance by about one ordinary frame after a spike instead of jumping. Full-size settling waits for the preset rebinding swing (`rebindTime`) and the flight; an empty shelf compiles a stand-in book (`prewarmFirstBook`) so the first book does not compile in its first frame. Pages are printed one side per idle moment (`queueLeaf`).
- Paint textures keep their other size as a spare (`createPaintTexture`): `canvas`, `context` and `texture` name the current size, so whoever samples a target takes `texture` again after a resize (`bindPaintedMaps` in `rig.js`).
- Canvases that feed textures use `paintContext()` (kept in main memory: uploads are several times faster). Studio thumbnails go through `thumb(canvas, key, paint)` and are cached by key; tabs are built once and marked stale rather than rebuilt.
- `engine.js` is one module with shared mutable state on purpose: the interaction and transition code is carried over from the original and relies on it.
- Stamping depth is a third, half-size layer per board (`relief`, mid grey = board level). Foil and blind stamps draw into it through `withFinish` / `stampFinish`; print never does. Its signature is `faceSignatures(...).relief`, and it is skipped while dragging (the board lies flat until the full-size pass). The boards' shader is patched in `compileRelief` because Three ignores a bump map once a normal map is set.
- The book's geometry hangs off `body` inside `motion`. `body` takes the trim size in width and height only; the boards (pivots), leaves, band and pen loop live there, so nothing that rotates is ever scaled unevenly and boards keep their thickness. `block` inside `body` takes the bulk in depth only (page block, spine, headbands, edges, ribbons); `applyStructure` places the boards and leaves for the bulk and stretches the spine to span them. Never scale a parent of a turning part unevenly. The engine owns `root` and `motion` transforms.
- Never add or remove a light at run time: it recompiles every material (seconds on ANGLE). Room presets only retint and rescale the existing lights.
- No native form widgets or popups except the file picker: colours use `openColourPicker` (via `colorField`), sliders `createSlider` (role `slider`, `setValue()` for scripts), lists `select()` from `controls.js` (pass `preview(option)` for a glyph, `face(option)` for a font stack; preview canvases from the studio's thumbnail painters go through `listThumb`). Motion in CSS uses the duration tokens (`--duration-press`, `-quick`, `-base`, `-slow`, `-scene`, `-tint`, `-entrance`) with `--ease-out`, `--ease-spring` (a sampled spring, `linear()`), `--spring-snappy` or `--spring-smooth`; no raw millisecond values.
- Reading mode (`setReadingMode` in `engine.js`) frames the open spread on the whole screen through the projection only (`camera.zoom` and the view offset, see `applyDetailViewOffset`), never by moving the book; phones frame the open book (`readingFit`) and the bottom sheet (`setSheetShare`) the same way. Orbit is off while reading.
- The shelf position rides a critically damped spring (`shelfSpring`); set `targetPosition`, never `position`, except under the hand (`shelfPan`).
- Manuscripts are parsed by `src/state/manuscript.js` (pure, testable in Node); a new book's untouched starter pages (`isStarterPage`) make way for an import.
- Interface strings: check `src/i18n.js` before adding an English key — short words such as "Light", "Crown", "Leaf" are already taken with another meaning.
