# Folio Atelier

**A personal 3D bookmaking studio.** *Craft a book that is entirely yours.*

Start from an empty shelf. Choose a cloth, press a title in foil, set the pages inside, then open the book and turn them. Every book you make is kept on your own shelf, in your browser.

## What you can do

- **Begin from nothing.** The first visit shows an empty walnut shelf and one invitation: create your first book.
- **Work in English or Chinese.** Switch the interface with the `EN / 中` control; each book also chooses the language of its own printed labels (“Chapter I” or “第一章”).
- **Design the binding.** Twenty-two starting bindings; nine covering materials (bookcloth, buckram, linen, silk, leather, suede, vellum, paper, velvet); full, quarter or half binding in two colours; sixteen foils including holographic and pearl, with adjustable metal, polish and iridescence.
- **Lay a pattern over the boards.** Seventeen all-over patterns — stripes, harlequin, wave scales, linked circles, fret, clouds, sprigs, marbling and more — stamped in foil, printed, or pressed blind, optionally carried across the spine.
- **Compose the cover, spine and back.** Eight cover layouts (two of them set the title vertically), fourteen border styles, thirty-three ornaments, your own artwork as a full cover or inset plate, and lettering lines with typeface, size, weight, tracking, position, direction and finish. Twenty-one typefaces, five of them Chinese.
- **Finish the details.** Gilt, stained, sprinkled or ombré page edges; metal corner pieces; stab stitching in four or six holes; a pasted spine label; patterned endpapers; one or two ribbons; plain or striped headbands; seven paper stocks.
- **Write the inside.** Thirteen page templates — half-title, title page, dedication, epigraph, contents, part title, chapter opener, body text, verse, pull quote, plate, colophon, blank. Long text flows onto as many pages as it needs; the contents page builds itself; `***` on its own line sets a section break. Choose leading, chapter-opening style, page-number position and ink colour. Latin and CJK text are both typeset.
- **Handle the book.** Orbit, zoom, open the cover, drag pages with curved page-turn physics, and jump the camera to the front, spine, back or edges.
- **Keep a library.** Books save automatically. Duplicate, delete, export to a `.folio` file and import it elsewhere. Undo and redo while editing.

## Run locally

The page uses JavaScript modules, so serve it over HTTP:

```bash
python -m http.server 4173
```

Then open <http://localhost:4173>. There is no install or build step. An internet connection is needed for the pinned Three.js modules and the web fonts.

## How it is made

No framework, bundler or backend: native ES modules, [Three.js](https://threejs.org/) 0.165 from a CDN, and IndexedDB for storage.

```text
index.html            Page shell, import map
styles/app.css        Interface
assets/               Walnut texture, ambient score and Foley
src/
  main.js             Start-up; connects store, engine and interface
  i18n.js             English / Chinese interface strings
  engine.js           Room, shelf, cameras, shelf <-> studio state machine, page interaction
  book/rig.js         The hardcover: boards, rounded spine, hinges, leaves, edges, foil layers
  scene/quality.js    Rendering tiers
  textures/           Procedural painters: materials, covers, patterns, ornaments, typesetting, pages
  state/              BookSpec schema, store with undo, IndexedDB, images
  data/               Presets, layouts, foils, ornaments, typefaces
  ui/                 Shelf interface, studio workbench, controls
  audio.js            Music and interaction sounds
```

Each book is one serialisable `BookSpec` (`src/state/schema.js`). The rig paints every surface from that spec onto canvases — a base layer for dyed material and print, and a white mask that the metallic foil material uses — so any edit repaints only the surfaces it touches while the model stays on screen. Only four leaves carry printed pages; as you read through a longer book, the leaf at the bottom of one pile is moved under the other and printed with the pages about to come into view.

### Rendering quality

Three tiers, chosen from the device and stepped down automatically if the first seconds run below about 30 fps. Force one with `?quality=high`, `?quality=balanced` or `?quality=lite`.

| Tier | Textures | Shadows | Extras |
| --- | --- | --- | --- |
| `high` | 2× covers and pages | 4096 | Ambient occlusion, 4× MSAA, page-turn shadows |
| `balanced` | 1.5× | 2048 | Page-turn shadows |
| `lite` | 1× | 1024 | — |

Bloom and depth of field were tried and removed: both softened printed text.

Books are stored only in the browser that made them. Export a `.folio` file to back one up or move it.

## Credits

Folio Atelier is a remix of [**The Complete Shelf**](https://github.com/mengto/complete-shelf) by Meng To. The hardcover construction, page-turn physics, shelf-to-detail transitions, room and lighting, walnut texture, soundtrack and Foley come from that project; its seven bindings live on here as de-branded colour, foil and ornament presets. The original cover artwork and product names are not included.

The original repository does not state a licence. Treat this remix as a personal study, and ask the original author before publishing or redistributing it.
