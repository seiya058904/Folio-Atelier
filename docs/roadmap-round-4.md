# Folio Atelier — Roadmap, round 4 (Phases S–V)

Earlier rounds: [round 1](roadmap-round-1.md) (A–F), [round 2](roadmap-round-2.md) (G–L), [round 3](roadmap-round-3.md) (M–R).

Started 2026-11-18 at the user's request to take the next round as far as it goes. It begins with a real-browser review (Ego, real GPU, DPR 1.5) of everything round 3 built, and with the stalls round 3 left: the frames after a preset or a landing.

**Status:** S, T, U and V done and deployed to GitHub Pages (2026-11-19, `c0c2c64`; live walkthrough in Playwright and Ego passed).

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

- **T — done.** The French groove: a shallow channel along the joint of both boards, 4.6 % of the board in from the spine — a soft trough with a lit far lip on the picture, and pressed into the relief layer where the book has one, so on leather it moves with the light. Stab-bound books (sewn through the board) have none. Checked in close-ups of cloth and debossed leather. Texture only: no geometry on the turning boards. Head caps and turn-ins remain geometry work, still not worth the risk.

## Phase U — One continuous motion

- **U — done.** Recorded the hand-overs as screencasts and read them frame by frame.
  - Entering reading mode, the camera's swing landed in about half a second and the framing then drifted for another 0.8 s (it eased on its own curve). The framing now runs on the camera's timeline — same length, same curve — so the two land together (about 650 ms).
  - Leaving reading mode returns to the view the reader was on (spine, back, edges), not always the front.
  - Correction to S: the wider AO denoise (16 samples × 3 rings) doubled the denoise on every frame and cost the cold shelf sweep a frame step (p95 12.3 → 18.2 ms, found by A/B against round 3 in a separate worktree). It is back to 12 × 2 with a wider radius at the same cost; the distance fall-off, which is what cleaned the page edges, stays. The soft grain sheet is now used only where it pays (studio size, or mottled materials).
  - `?bench` back on the round-3 numbers everywhere; typing keeps S's gain (frame p95 13.4 ms, key to page 15 ms).

## Phase V — Finish

- **V — done.** From the Ego review and a last walk through:
  - In English the seven studio tabs needed 450 px in a 340 px panel: STRUCTURE and PAGES were out of sight with no sign they were there. The tabs are set a little closer (they now fit from a 432 px panel, a 1440 px window); in a narrower panel the strip scrolls sideways, the side with more fades out, a mouse wheel scrolls it, and the open tab is always brought into view. Chinese always fits.
  - Reading is now a visit: leaving it puts back what was there, so a book that was shut when reading began is shut again, and the camera returns to the view it came from (before, a shut book entered from the spine view came back open and seen edge-on). Leaving the studio from reading lets the flight home shut the book, with no separate close on the way.
  - Engine notes for the cached grain, paper sheets and texture spares added to `CLAUDE.md`, with the rule for measuring a 2D painter (force the flush).
  - `?bench`: the machine was noisier on this second day, so the shelf sweep was compared against round 3 in a separate worktree, interleaved: current p95 18.5 ms against 24.2 and 30.2 ms for round 3, average frame equal. No regression.
