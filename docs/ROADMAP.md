# Folio Atelier — Roadmap, round 3 (Phases M–S)

Earlier rounds: [round 1](roadmap-round-1.md) (A–F), [round 2](roadmap-round-2.md) (G–L).

Agreed with the user on 2026-11-18. The aim of this round: nothing lost, nothing stiff. Every motion should hand over to the next one without a seam, every surface should hold up close, and the three reading features the user picked should feel native to the studio.

**Status:** started 2026-11-18.

- **M — done.** Verified in Playwright: with IndexedDB refused, the shelf and the studio say the books are kept for this visit only (before: "Saved", and a reload emptied the shelf). A second tab waits behind "Your library is open in another tab" until the reader takes it over; the first then stops saving and says so. The orphaned picture in the test library (about 1 MB) was swept at start-up. With the CDN refused, the boot watchdog shows a bilingual message and a reload button at once. The backup line shows after a week of edits without an "Export all". `?bench` unchanged.
- **N — done.** Profiled before changing anything (CPU profile, Chrome trace, frame timeline after a preset click), RTX 3070 laptop, high tier:
  - Typing in a 60-paragraph chapter was already smooth (frame p95 6.3 ms, worst 12 ms): left as it was.
  - The worst preset click (Midnight) had a 331 ms task. Three causes, all fixed: the gilt page edges switch off sheen, a material feature missing from `shaderVariants` (160 ms of compiling mid-frame); the seigaiha mask drew each scale with its own composite switch (93 ms at full size; now one tile laid as a pattern, 14 ms, identical look); and every preset reprinted all eight printed pages in one frame even with the book shut (now only the open spread at once, the rest one leaf per quiet moment). Tinted pattern masks are cached, and the relief layer gets a mask at its own size. Longest main-thread task after a preset: 331 → about 50 ms.
  - Flight into the studio: nothing is painted in flight (no long frames during it). The full-size pass after landing still shows 40–60 ms frames whose main-thread share is about 10 ms; the rest is the GPU process taking the uploads, which this trace cannot see. Left for now.
  - Texture memory for a large library: no evidence it hurts on the target devices; repainting far books when they come back would cost smoothness. Not done.
  - `?bench` unchanged within run-to-run noise.
- **O — done.** Each piece checked in Playwright:
  - The shelf can be dragged by hand: on empty wall with a mouse, anywhere with a finger. It follows one to one, carries the hand's speed on release (projected 0.3 s ahead) and settles on a book; past either end it gives with growing resistance and springs back. The shelf now rides a critically damped spring (same settling time as the old easing), so a fling or a new target never jerks it. With a mouse, dragging a book still moves it; on a touch screen a book is lifted by holding it for 380 ms (a short vibration where supported), so a swipe no longer reorders the library by accident. The room shows a grab cursor.
  - Reading: the pointer near the outer edge of an open page lifts that page's corner a little (the corner nearest the pointer first), a cue that it can be turned.
  - Arrival: when the loading veil lifts, the books in view are set down on the shelf one after another from the middle out, and the masthead, title, controls and index come in after them (`is-arriving`, `--stagger`).
  - Camera: view jumps last 0.5–1.05 s depending on how far they swing, and a long swing eases out a little on the way.
  - Phones: an open book was cut off on the left (framed for the shut book). The view now widens and slides to frame the whole spread as the cover opens, and back as it shuts. The studio is a bottom sheet with a grabber: drag it between a peek, half and nearly full height (flicks carry on to the next stop), or tap the grabber; the book is reframed in the room left above it, and the reading bar steps aside when the sheet is raised for writing.
  - The page list glides when pages are moved, copied, added or removed (FLIP), instead of jumping.
  - `?bench` unchanged: the cold shelf sweep, which moved to p95 18 ms in two runs, was checked against the old easing in an A/B run (p95 12.2 ms both; frames here are quantised to 6.1 ms steps).

**Rules (carried over)**
- Real speed first; mask only waits that cannot be removed, with cheap motion that respects `prefers-reduced-motion`.
- `?bench` before and after every phase; no measure may get worse. Turntable sweep after every 3D change. Compare with the original before changing rig, lighting or page motion.
- Every new spec field gets a default, `normalizeBook` handling, `ZH` strings and a `dirty` key. No build step, no dependencies, Three.js stays at 0.165. Never add or remove a light at run time.
- One scoped commit per phase. Pushing and deploying need the user's go-ahead.

---

## Phase M — Nothing is lost

Found in review; each confirmed by reproduction or in the code.
- When IndexedDB cannot be opened the store falls back to memory but still says "Saved to this browser"; a reload empties the shelf. Say so plainly and keep saying it.
- A failed library read shows the first-visit empty shelf. Show the failure with a retry instead.
- `onblocked` (another tab holding an older database version) drops to memory at once. Wait, and ask the reader to close the other tab.
- Ask for persistent storage once the first book exists.
- Remember the last export; after a week of edits without one, a quiet line on the shelf suggests a backup.
- Picture blobs are never deleted (`removeImage` has no caller). Sweep unreferenced ones in idle time after start-up.
- Two tabs editing the same library overwrite each other. Only one tab edits at a time (Web Locks); the other offers to take over.
- A failed module load leaves the loading veil up for ever, in English. A boot watchdog shows a bilingual message and a reload button.

## Phase N — No stutter

Measure first; each item states its number before and after.
- Typing in a long chapter: repaginate and reprint only what changed.
- The heaviest cover takes about 150 ms to sharpen: split the full-size pass so no frame carries more than its share.
- Opening flight: worst frame 86 ms. Target 33 ms.
- Texture memory grows with the library (26 books uploaded about 250 MP): books far from the view keep draft-size boards.
- Target for every interaction: frame p95 ≤ 16.7 ms, worst ≤ 33 ms.

## Phase O — Hand-feel and transitions

- Shelf: trackpad momentum, edge resistance, fling on release, then a soft snap to a book.
- Pages: the corner lifts as the pointer nears it; arrow keys turn pages; a quick flick turns the page.
- Camera: shelf ⇄ studio and view jumps follow an arc with eased field of view, never through the book.
- Interface: one choreography for panels, tabs, lists (FLIP reorder), toasts and dialogs; the shelf reveals itself after loading instead of cutting in; pointer cursors that say what a drag will do.
- Phone: the open book is framed to fit; the panel is a bottom sheet with snap points; touch turns pages.

## Phase P — Light and material

- Tone mapping: compare ACES with Neutral / AgX so cloth colours match their swatches; keep whichever is truer.
- Reflections follow the room's light preset (environment map regenerated once per preset, no new lights).
- Brushed foil with anisotropic highlights; close-range detail for cloth and leather grain; paper fibre and faint show-through; gutter shading.

## Phase Q — Finer models

Turn-ins and the endpaper joint, the French groove, head caps, a concave fore-edge and slightly uneven page edges (optional deckle), and the board squares. Before/after close-ups and a turntable sweep for each.

## Phase R — Reading and writing

Picked by the user from the round-3 outline.
- **Reading mode:** the panel withdraws, the book comes forward to fill the view, keyboard and swipe turn pages, a quiet page counter; leave with Esc.
- **Import a manuscript:** a `.txt` or `.md` file becomes pages: headings start chapters (or parts), the rest flows into body pages.
- **Find on the shelf:** type to find a book by title, author or words inside; the shelf glides to it.
