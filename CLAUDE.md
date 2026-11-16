# Folio Atelier — project notes

A 3D book-making studio remixed from `mengto/complete-shelf`. See `README.md` for the feature list and module map.

## Constraints

- No build step, no npm dependencies. Native ES modules; Three.js 0.165 pinned in the import map in `index.html`. Ask before upgrading Three.js or adding a dependency.
- Interface language is English. Book content must keep working with CJK text.
- The original repository has no licence: keep the credit in `README.md`, never add its brand-themed cover artwork or product names, and do not publish or deploy without the user's explicit go-ahead.
- Preserve the 3D quality of the original (materials, page physics, transitions). Compare against the live original before changing rig, lighting or page motion.

## Run and verify

```bash
python -m http.server 4173   # then http://localhost:4173
node --input-type=module --check < src/engine.js   # syntax check any module
```

There is no test framework. Verify in a real browser: empty shelf on first visit, create a book, edit each studio tab and watch the model update, open and turn pages, reload to confirm it persisted. The console must stay free of errors.

When driving the page with Playwright, call `page.bringToFront()` first — an occluded window throttles `requestAnimationFrame` to about 2 fps and transitions appear stuck.

## Architecture rules

- A book is one `BookSpec` (`src/state/schema.js`). Change the spec only through `store.update(id, mutate, { dirty })`; the engine repaints from the store's `change` event. `dirty` names what changed: `front`, `spine`, `back`, `material`, `foil`, `details`, `pages`, `interior`, `meta`, `all`.
- Adding a spec field: give it a default in `schema.js` and make sure `normalizeBook` fills it for stored books.
- Painters in `src/textures/` draw on logical canvases (768 × 1152 covers, 320 × 1536 spine, 512 × 768 pages) and must not depend on canvas pixel size.
- Foil is a white-on-transparent mask; print and blind stamping go on the base layer (`withFinish` in `faces.js`).
- `engine.js` is one module with shared mutable state on purpose: the interaction and transition code is carried over from the original and relies on it.
