---
name: folio-atelier-webgl-qa
description: Use when running Playwright visual/performance benchmarks (?perf, ?bench, ?quality=, file-input stubbing) or editing Three.js lighting, shaders, textures, grain workers, shelf spring, or reading mode in Folio-Atelier.
---

# Folio Atelier WebGL QA & Subsystem Reference

## 1. Playwright & Perf Harness Recipes
- Always call `bringToFront()` before timing/rendering checks — occluded/background tabs throttle `rAF` (~2–3 fps), invalidating timings and moving scale.
- Bypass HTTP cache with `page.route` when iterating; stub hidden file inputs (`#image-file`, `#import-file`, `#manuscript-file`, driven by `pickFile()` in `src/ui/dom.js`).
- Debug queries & globals: `?quality=high|balanced|lite`, `?perf`, `?perf=gpu`, `?bench`, `?lang=en|zh`, `window.__folio`, `engine.debug`, `i18n.missing` (`src/perf.js`, `src/main.js`, `src/engine.js`).
- Chrome lazy 2D canvas rasterization gotcha: call `getImageData(0, 0, 1, 1)` when forcing immediate rasterization during profiling.

## 2. Updated Subsystem Architecture (Post-`f05c688`)
- **Lighting & environment**: procedural `createAtelierEnvironmentScene(look)` + `ENVIRONMENTS` presets (`studio`/`morning`/`golden`/`night`) via `THREE.PMREMGenerator` (`src/engine.js:534-653`, `NeutralToneMapping`, exposure `0.84`) — `RoomEnvironment` is retired.
- **Materials & shaders**: `compileThrough`/`SHOW_THROUGH`/`linkShowThrough` (show-through), `compileRelief` (3rd half-size relief layer), `beginSwap`/`stepSwaps`/`snapshotTexture` (board cross-fade; `shaderVariants` preserves `userData.swap`, `relief`, `leaf`, `grainScale`).
- **Textures & patterns**: `PATTERNS`/`ENDPAPER_PATTERNS` live in `src/data/presets.js`; `patternMask` in `src/textures/patterns.js`; painters must stay resolution-independent (`FACE_SIZE`/`PAGE_SIZE`); `grainCaches` (`surface.js`), `paperSheet` (`pages.js`), `grain-worker.js` / `prefetchBoardGrain` mirror `paintMaterialBase`.
- **Scheduling & UI**: `queueLeaf` prints one **side** per idle moment (`drainLeafQueue`), shelf idle warmup (`warmStep`/`compileQuietly`/`prewarmVariants`), `typicalGap`/`rebindTime`/`prewarmFirstBook`, `thumb(canvas, key, paint)` in `src/ui/studio.js`, room palette (`room.follow`/`--accent`), reading mode (`setReadingMode`/`applyDetailViewOffset`), `shelfSpring`, and pure Node-testable `src/state/manuscript.js` + `isStarterPage`.
