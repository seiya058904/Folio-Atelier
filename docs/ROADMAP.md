# Folio Atelier — Roadmap, round 4 (Phases S–V)

Earlier rounds: [round 1](roadmap-round-1.md) (A–F), [round 2](roadmap-round-2.md) (G–L), [round 3](roadmap-round-3.md) (M–R).

Started 2026-11-18 at the user's request to take the next round as far as it goes. It begins with a real-browser review (Ego, real GPU, DPR 1.5) of everything round 3 built, and with the stalls round 3 left: the frames after a preset or a landing.

**Status:** S done (2026-11-18).

**Rules (carried over)**
- Measure first and say what each change bought. `?bench` before and after every phase; turntable sweep after any 3D change; compare with the original before changing rig, lighting or page motion.
- New spec fields get a default, `normalizeBook` handling, `ZH` strings and a `dirty` key. No build step, no dependencies, Three.js stays at 0.165, no lights added at run time.
- One scoped commit per phase. Pushing and deploying need the user's go-ahead.

---

## Phase S — The real cost of a repaint

- **S — done.** Measured on an RTX 3070 laptop, high tier, Playwright; reviewed by eye in Ego.
  - Round 3 put the stalls after a preset down to the GPU. A browser-wide trace showed otherwise: `CanvasRenderingContext2D::FinalizeFrame` (up to 95 ms, 379 ms in all after one click). Chrome rasterises a 2D canvas lazily, so a painter's JavaScript looked cheap (1–3 ms) while its pixels cost 25–66 ms per board at studio size, paid at the end of the frame.
  - Most of it was the material grain. It never depends on the dye, so studio-size grain is now cached like the small sheets (four of them); and its soft parts — leather and velvet mottling, the shading at the board edges and foot — are drawn on a quarter-size sheet and laid on once. A board repaint went from 24–66 ms to 2–9 ms; the first paint of a material from up to 67 ms to 19–32 ms. Checked pixel by pixel against the previous painter: mean difference under 1.2 of 255, at most 7.
  - Each printed page drew its paper (2,400 fibres, 1,200 flecks) afresh, for every page and every keystroke. Four sheets per stock are kept and laid down. Typing: frame p95 25.7 → 13.7 ms, key to page 27 → 15 ms.
  - Board textures keep their other size (draft or studio) as a spare, so going back and forth no longer allocates GPU storage. (It turned out not to be what stalled; kept because it is free.)
  - After a preset (Midnight): long frames 8 → 4, worst 151 → 85 ms (the first full-size board of a new material, once). After landing in the studio: long frames 7 → 2, worst 72 → 36 ms.
  - Real-browser review found grainy ambient occlusion along page edges, worst in reading mode, where the spread is magnified: GTAO now has a short distance fall-off and a wider denoise (shelf contact shadows unchanged, compared side by side), and reading mode lightens it further. Reading mode left too little margin round the spread, and its framing could miss the last frame of the camera's swing: both fixed.
  - `?bench` unchanged elsewhere.

## Phase T — Finer models

Details round 3 left: the French groove along the joint, head caps, the board squares, page edges seen close. Prefer relief and painted detail over new geometry on the turning boards; compare close-ups before and after.

## Phase U — One continuous motion

Walk every hand-over (shelf ⇄ studio, open ⇄ read, tab ⇄ view, panel ⇄ sheet) and remove each seam: timing, easing, what moves first.

## Phase V — Finish

Whatever the reviews turn up; a final Ego walkthrough.
