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

Roadmap: `docs/ROADMAP.md` (phase status is recorded at the top of it).

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
- Foil is a white-on-transparent mask; print and blind stamping go on the base layer (`withFinish` in `faces.js`).
- Post-processing is ambient occlusion only (`buildComposer` in `engine.js`). Bloom and depth of field were tried and removed because they blur printed pages; do not re-add them without a side-by-side check.
- Pointer hit volumes sit on `HIT_LAYER` so they are raycast but never rendered.
- The render loop sleeps. Anything that changes what is on screen must call `requestFrame()`; anything animated must go through the tracked `damp()` or set `motion = true` in its frame, or the loop stops under it. Shadows are redrawn only on frames with `shadowHold > 0`.
- Edits are queued by `refreshBook` and painted once per frame in `flushRepaints`. `rig.repaint()` takes no dirty list: each painter is skipped when its signature (`faceSignatures`, `endpaperSignature`, `pageSignature`) is unchanged, so **a painter that reads a new spec field must add that field to its signature** or the change will not show. Edits with a `key` (drags, typing) paint at draft resolution and skip boards turned away from the camera; the full-size pass follows 170 ms after the last one.
- Canvases that feed textures use `paintContext()` (kept in main memory: uploads are several times faster). Studio thumbnails go through `thumb(canvas, key, paint)` and are cached by key; tabs are built once and marked stale rather than rebuilt.
- `engine.js` is one module with shared mutable state on purpose: the interaction and transition code is carried over from the original and relies on it.
