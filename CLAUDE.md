# Folio Atelier

Interactive 3D bookbinding studio (`README.md` has full overview; `docs/ROADMAP.md` & `docs/roadmap-round-1.md`–`4.md` hold active roadmap).

## Hard Constraints
- No build step, no npm dependencies, Three.js `0.165` pinned in `index.html`.
- Bilingual EN/ZH: English source with `ZH` table in `src/i18n.js`; book content supports CJK.
- **Licensing**: original repo license applies (`README.md` credits); strictly no brand cover artwork or product names.
- Match or beat current visual/motion quality when touching rig, lighting, or page motion. Optimize real cost first (masking must not add GPU/CPU cost); respect `prefers-reduced-motion`.

## Run & Smoke Check
```bash
python -m http.server 4173
node --input-type=module --check < src/engine.js   # matches .github/workflows/pages.yml
```
- No test framework: verify affected flows in a real browser (load, customize, flip pages, switch books, reload persistence, zero console errors). For Playwright perf/debug recipes (`?perf`, `?bench`, `?quality=`, `bringToFront`, file-input stubbing) and deep rig/shader architecture, read `.claude/skills/folio-atelier-webgl-qa/SKILL.md`.

## Non-Obvious Architecture Invariants
- **State & persistence**: mutate `BookSpec` (`src/state/schema.js`) only via `store.update(id, mutate, { dirty })`; new fields require defaults + `normalizeBook` for IndexedDB compatibility.
- **i18n**: use `t()` (`src/i18n.js`); `controls.js` auto-translates labels/hints/placeholders/options; never reuse one English key for distinct meanings (e.g., `Blank`/`Bare`, `Light`/`Crown`/`Leaf`); printed-page text uses `printed()` (`src/textures/pages.js`).
- **Repaint & shader safety**:
  - `rig.repaint()` keys off `faceSignatures`/`endpaperSignature`/`pageSignature` — any painter reading a new spec field MUST include it in its signature (pages print one **side** per idle moment via `queueLeaf`).
  - Any switchable material property that bumps material version MUST be registered in `rig.shaderVariants` (preserving `userData.swap`, `relief`, `leaf`, `grainScale`).
  - Foil mask uses `leafInk(element)` + `compileLeaf` — never paint color directly onto foil. Keep AO-only post-processing (no bloom/DoF).
  - **Never add or remove a light at runtime** (recompiles all shaders on ANGLE; only retint/rescale existing lights).
  - **Never scale a parent of a turning part unevenly** (`engine` owns `root`/`motion`, `body` trim W/H, `block` bulk depth).
- **Render loop & boot**: sleeping loop requires `requestFrame()`, tracked `damp()`, or `motion = true` (`shadowHold > 0` redraws shadows). Preserve `index.html` GitHub Pages 10-min cache boot watchdog (`folio-atelier-healed` cleared in `src/main.js:start()`). `src/engine.js` is intentionally one module with shared mutable state.
- **UI**: no native form widgets/popups except file pickers (use `controls.js` builders); use CSS duration/spring tokens in `styles/app.css`, never raw `ms`.
