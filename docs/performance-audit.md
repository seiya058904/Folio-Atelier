# Performance and quality audit

Baseline: `55ed746`. The comparison used Chrome with hardware WebGL (ANGLE D3D11, AMD Radeon RX 7900 XT), Windows, a 1440 × 900 viewport at DPR 1, and the high rendering tier. Each run started in an isolated browser context. The shelf fixture reloads 96 saved volumes and moves across ten shelf positions, including jumps to both ends. The manuscript includes 32 chapters and a long mixed English–Chinese chapter.

| Measurement | Baseline | Updated |
| --- | ---: | ---: |
| Reload until the loading veil is gone | 11.69 s | 3.56 s |
| Longest main-thread task during the reload sample | 9.91 s | 1.76 s |
| Resident book rigs on first view | 96 | 5 |
| Renderer textures after the shelf sweep | 1,087 | 148 |
| Shelf sweep animation-frame interval, p95 | 137.5 ms | 18.8 ms |
| Shelf sweep animation-frame interval, maximum | 1,493.8 ms | 212.4 ms |
| Shelf sweep animation-frame intervals over 50 ms | 40 | 24 |
| Median reflow after each of eight manuscript edits | 3.9 ms | 0.5 ms |
| Chapter entries printed in the contents | 15 | 32 |

The viewport keeps nearby book rigs and disposes distant boards, printed pages and geometry. Linked shader variants keep a material owner without keeping a book's textures. The first scene and distant jumps submit their visible materials for parallel linking before drawing. Small shelves keep their warmed bindings, and long jumps bring in the destination's neighbours without constructing every intervening volume. Large manuscripts reuse unchanged paragraph layout and retain the latest long layout per cached source. Pagination drops outstanding paint jobs when a fresh layout supersedes them.

The browser checks included entering the studio, changing a bilingual title, undo and redo, rapid page turns, editing and reloading saved books, a `.folio` export/import round trip, search, deletion and a Photo Studio PNG export. A 4096 × 3072 transparent cover was stored at 2048 × 1536 and retained its alpha channel before and after reloading. The 390 × 844 Chinese touch viewport kept the import action available with an existing book. Desktop and mobile captures were reviewed for shelf, cover, reading and studio presentation.

## Reproduce

With Chrome and Python Playwright available, serve the baseline and the current checkout on separate local ports. Run each browser command separately so their renderers do not compete for the GPU. Use a new output directory outside the checkout.

```powershell
python -m http.server 4173 --bind 127.0.0.1
# From the baseline checkout, in another terminal
python -m http.server 4174 --bind 127.0.0.1
# From the current checkout
python tools/shelf-stress.py before http://127.0.0.1:4174/ --out "$env:TEMP/folio-audit"
python tools/shelf-stress.py after http://127.0.0.1:4173/ --out "$env:TEMP/folio-audit" --verify
```

The runner writes timing data and screenshots. For the smaller interactive benchmark, open `/?bench&lang=en&quality=high` in a fresh browser context and read `window.__bench` after it completes. Keep the benchmark tab in the foreground. The benchmark creates books in that context.

Timings are individual controlled runs. Texture counts are Three.js object counts. In the 14-volume interactive benchmark, the warm sweep, orbit and page-turn p95 held at 6.3 ms. The first wheel sweep varied between runs. The final run reached 12.5 ms p95 and a 668.8 ms maximum against 6.4 ms and 318.8 ms on the baseline. First-use shader, shadow and post-processing work remains sensitive to scene and driver cache state. The audit used a desktop GPU and an emulated touch viewport. Mobile GPU budgets, measured VRAM bytes, Safari and prolonged sessions remain outside these measurements.
