# Folio Atelier — project notes

A 3D book-making studio remixed from `mengto/complete-shelf`. See `README.md` for the feature list and module map.

## Constraints

- No build step, no npm dependencies. Native ES modules; Three.js 0.165 pinned in the import map in `index.html`. Ask before upgrading Three.js or adding a dependency.
- The interface is bilingual (English and Simplified Chinese). English is the source language in code; every new visible string needs an entry in the `ZH` table in `src/i18n.js`. Book content must keep working with CJK text.
- The original repository has no licence: keep the credit in `README.md`, never add its brand-themed cover artwork or product names, and do not publish or deploy without the user's explicit go-ahead.
- Preserve the 3D quality of the original (materials, page physics, transitions). Compare against the live original before changing rig, lighting or page motion.

## Run and verify

```bash
python -m http.server 4173   # then http://localhost:4173
node --input-type=module --check < src/engine.js   # syntax check any module
```

There is no test framework. Verify in a real browser: empty shelf on first visit, create a book, edit each studio tab and watch the model update, open and turn pages, reload to confirm it persisted. The console must stay free of errors.

When driving the page with Playwright:

- Call `page.bringToFront()` first — an occluded window throttles `requestAnimationFrame` to about 2 fps and transitions appear stuck.
- `python -m http.server` lets the browser reuse stale modules after an edit. Add `await page.route('http://127.0.0.1:4173/**', r => r.continue())` to disable the cache.
- File pickers: the app calls `input.click()`. Stub it for file inputs in the page, click the button, then `page.setInputFiles('#image-file' | '#import-file', …)`.
- Compare rendering tiers with `?quality=high` and `?quality=balanced`.
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
- `engine.js` is one module with shared mutable state on purpose: the interaction and transition code is carried over from the original and relies on it.
