# Folio Atelier — Roadmap, round 5 (Phases W–Z)

Earlier rounds: [round 1](roadmap-round-1.md) (A–F), [round 2](roadmap-round-2.md) (G–L), [round 3](roadmap-round-3.md) (M–R), [round 4](roadmap-round-4.md) (S–V).

Started 2026-11-19 at the user's request: a flagship pass on smoothness and motion. Whatever stalls can be removed is removed; whatever wait remains is carried by purposeful motion, so the reader feels no hitch. Every press, drag, scroll and selection should answer like a system interface (immediate, follows the hand, interruptible, settles with its momentum), every control should belong to the theme (no browser-default widgets), and the model should be made more real by refining what is there, not by adding more.

**Status:** W done (2026-11-19). X, Y, Z next.

**Rules (carried over)**
- Measure first and say what each change bought. `?bench` before and after every phase, and the stutter census (`.playwright-mcp/w-census.js`: a whole visit, every long frame attributed to its step, long-animation-frame scripts) against the previous round served from a worktree.
- Masking never pays for extra GPU/CPU and never stands in for a cost that can be removed. `prefers-reduced-motion` gets a fade or a cut.
- No build step, no dependencies, Three.js stays at 0.165, no lights added at run time. New strings get `ZH` entries. One scoped commit per phase; pushing and deploying need the user's go-ahead.

## Phase W — Stutter census and real costs

Census of a whole visit (first visit, create, every tab, ten presets, every covering, every paper, manuscript import, reading and turning, back to the shelf, a second book, shelf drag, find, delete), same script against round 4:

| | Round 4 | W |
| --- | --- | --- |
| Frames over 33 ms | 96 | 36 |
| Frames over 50 ms | 43 | 14 |
| Worst frame | 1371 ms (first book) | 249 ms (boot, under the veil) |

- **First book: 1.4–1.8 s frozen frame gone.** On an empty shelf nothing was compiled, so the first book paid for every program in the frame it appeared. A stand-in binding (`prewarmFirstBook`) is compiled in idle time after the room comes in, and again as soon as the new-book dialog opens; it is never drawn and is let go once the real book holds the same programs.
- **New-book dialog: 160–190 ms → instant.** The preset covers were all painted when it opened; now they are painted in idle time after boot, two at most per quiet moment.
- **Board grain off the main thread.** `paintGrain` moved to `textures/grain.js` (pure 2D canvas); `textures/grain-worker.js` paints it on an OffscreenCanvas and hands back a bitmap for the grain cache (`prefetchGrain`). It is asked for ahead of need: the book resting in front on the shelf, the book being opened (during the flight), and the preset or covering under the pointer (draft and studio size). The worker's pixels are identical to the main thread's; a cached board copies in 2 ms instead of 20–45.
- **Covering maps prepared in studio idle time** (`getMaterialMaps`, about 20 ms each the first time).
- **Pages printed one side per idle moment** (`queueLeaf`), not a whole leaf (50–80 ms) at once.
- **Sharpening waits for the rebinding swing** of a preset: the draft carries the swing, full-size boards are painted once the book is still.
- **Spike absorption.** A lone long frame advances motion by about one ordinary frame instead of the whole gap (`typicalGap` in `frame`), so an animation never jumps; a steadily slow device keeps real time.

Bench at parity or better (cold shelf wheel p95 18.1 → 12.3 ms in the same session).

Left for X: the click frame of a whole-book change (draft paint and upload, 50–70 ms) and the full-size boards after it (30–45 ms each, rasterising and uploading) are real work; they now land when the book is still, and X carries the change with motion.

## Phase X — Carry the remaining waits

Cross-fade from the previous board to the new one (draft → sharp, preset, material, font arrival) instead of a pop; the rebinding swing timed with it; a new book that takes form on the shelf; skeleton rows and inked-in pages for imports; a boot veil tied to the real loading stages.

## Phase Y — System-grade interaction

One spring vocabulary (`src/ui/motion.js`: interruptible, velocity-carrying springs and `linear()` CSS tokens); unified press feedback; theme-native colour picker, slider and switch in place of browser widgets; popovers, dialogs and the sheet with springs and gesture velocity; directional tab transitions; inertia for the 3D view.

## Phase Z — Detail and modelling fidelity

Close-up turntable review against the original; refine the 3–5 least convincing parts (board edges and corners, fore-edge, headbands, turn-ins, leaf bend, contact shadow) through textures, normals and parameters only.
