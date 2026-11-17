// Scripted benchmark, loaded only for `?bench`. It drives the real interface
// with synthetic input and leaves the numbers in `window.__bench`.
// Run it with `?bench&lang=en&quality=high` (add `=gpu` to include GPU time).

const raf = () => new Promise((resolve) => requestAnimationFrame(resolve));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const round = (value) => Math.round(value * 10) / 10;

function stats(values) {
  if (!values.length) return { avg: 0, p95: 0, max: 0, fps: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    avg: round(avg),
    p95: round(sorted[Math.floor(sorted.length * 0.95)]),
    max: round(sorted[sorted.length - 1]),
    fps: round(1000 / avg)
  };
}

const visible = (element) => element && element.offsetParent !== null;

function field(label) {
  return [...document.querySelectorAll("#studio-body .field")]
    .find((candidate) => visible(candidate) && candidate.querySelector(".field__label")?.textContent === label);
}

async function until(test, timeout = 8000) {
  const started = performance.now();
  while (!test()) {
    if (performance.now() - started > timeout) throw new Error("bench: timed out");
    await wait(50);
  }
}

export async function runBench({ store, engine }) {
  const perf = window.__folioPerf;
  const result = { at: new Date().toISOString(), quality: engine.quality };
  const gl = document.querySelector("#scene").getContext("webgl2");
  const debug = gl?.getExtension("WEBGL_debug_renderer_info");
  result.gpu = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : "unknown";
  result.viewport = `${innerWidth}x${innerHeight}@${devicePixelRatio}`;

  const frameCount = () => perf.snapshot().frames;
  const idle = async (ms) => {
    await wait(700);
    const before = frameCount();
    await wait(ms);
    return frameCount() - before;
  };

  /** Sample rAF intervals while `step(index)` runs once per frame. */
  const drive = async (count, step) => {
    perf.reset();
    const intervals = [];
    let previous = await raf();
    for (let index = 0; index < count; index += 1) {
      step(index);
      const time = await raf();
      intervals.push(time - previous);
      previous = time;
    }
    const snapshot = perf.snapshot();
    return {
      frame: stats(intervals),
      editToPixel: { avg: round(snapshot.latencyAvg), p95: round(snapshot.latencyP95) },
      work: { avg: round(snapshot.workAvg), p95: round(snapshot.workP95) },
      uploads: snapshot.uploads,
      uploadMP: round(snapshot.uploadMegapixels),
      paints: Object.fromEntries(Object.entries(snapshot.paints).map(([name, entry]) => [name, round(entry.avg)]))
    };
  };

  const slide = (input, index, count) => {
    const min = Number(input.min);
    const max = Number(input.max);
    const t = 0.5 - 0.5 * Math.cos((index / count) * Math.PI * 2);
    input.value = String(min + (max - min) * (0.2 + t * 0.6));
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };

  const tab = async (id) => {
    const button = document.querySelector(`#tab-${id}`);
    const started = performance.now();
    button.click();
    const sync = performance.now() - started;
    await raf();
    await raf();
    const toFrame = performance.now() - started;
    await wait(500);
    return { sync: round(sync), toFrame: round(toFrame) };
  };

  // A book to work on.
  if (!store.books.length) {
    document.querySelector("#create-first").click();
    await wait(300);
    document.querySelector("#new-book-name").value = "Bench";
    document.querySelector("#new-book-form button[type=submit]").click();
  } else {
    result.shelfIdleFrames2s = await idle(2000);
    engine.openDetail();
  }
  await until(() => engine.mode === "detail");
  await wait(1500);

  result.detailIdleFrames2s = await idle(2000);

  // Tab switches (twice round: cold, then warm).
  result.tabs = {};
  for (const pass of ["cold", "warm"]) {
    for (const id of ["cover", "spine", "back", "details", "pages", "design"]) {
      result.tabs[`${id}-${pass}`] = await tab(id);
    }
  }

  // Slider that only changes foil material parameters.
  await tab("design");
  result.foilSlider = await drive(90, (index) => slide(field("Metal").querySelector("input"), index, 90));
  await wait(400);

  // Colour picker: repaints all three boards.
  const colour = field("Colour").querySelector("input[type=color]");
  result.materialColour = await drive(90, (index) => {
    const value = Math.round(100 + 60 * Math.sin(index / 9)).toString(16).padStart(2, "0");
    colour.value = `#${value}3a6b`;
    colour.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await wait(600);

  // Slider that repaints the front board.
  await tab("cover");
  result.frontSlider = await drive(90, (index) => slide(field("Size").querySelector("input"), index, 90));
  await wait(600);

  // Camera move with nothing else changing.
  let view = 0;
  const views = ["spine", "back", "details", "front"];
  result.orbit = await drive(150, (index) => {
    if (index % 38 === 0) engine.focusView(views[(view += 1) % views.length]);
  });
  await wait(900);

  // Typing into a chapter.
  await tab("pages");
  await wait(700);
  const chapter = [...document.querySelectorAll("#studio-body .page-item")]
    .find((item) => visible(item) && /Chapter opener/.test(item.textContent));
  chapter?.querySelector(".page-item__main").click();
  await wait(900);
  const area = [...document.querySelectorAll("#studio-body textarea")].find(visible);
  if (area) {
    // Open the book at this chapter so the typing is visible, then type at a
    // steady pace and time how long each keystroke takes to reach the page.
    await wait(600);
    perf.reset();
    const lags = [];
    const intervals = [];
    for (let index = 0; index < 30; index += 1) {
      area.value += index % 6 === 5 ? " " : "abcdefghij"[index % 10];
      const before = perf.snapshot().paints.page?.count || 0;
      const typed = performance.now();
      area.dispatchEvent(new Event("input", { bubbles: true }));
      let previous = typed;
      let shown = 0;
      while (performance.now() - typed < 90) {
        const time = await raf();
        intervals.push(performance.now() - previous);
        previous = performance.now();
        if (!shown && (perf.snapshot().paints.page?.count || 0) > before) shown = performance.now() - typed;
        void time;
      }
      if (shown) lags.push(shown);
    }
    await wait(700);
    const snapshot = perf.snapshot();
    result.typing = {
      frame: stats(intervals),
      keyToPage: stats(lags),
      shownWithin90ms: `${lags.length}/30`,
      pagePaintAvg: round(snapshot.paints.page?.avg || 0),
      pagePaints: snapshot.paints.page?.count || 0,
      paginate: round(snapshot.marks.paginate || 0)
    };
  }

  // Page turns.
  await wait(300);
  result.pageTurns = await drive(150, (index) => {
    if (index % 50 === 5) engine.turnPage(index < 100 ? 1 : -1);
  });

  result.finalIdleFrames2s = await idle(2000);
  const info = perf.snapshot();
  result.renderer = { calls: info.calls, triangles: info.triangles, textures: info.textures, tier: info.tier, pixelRatio: info.pixelRatio };

  // The shelf, last so the numbers above stay comparable: a library of 14,
  // wheeled through end to end (cold: books paint as they arrive; warm), then
  // stepped book by book as with the arrow keys.
  engine.closeDetail();
  await until(() => engine.mode === "hero");
  await wait(900);
  const [{ createBook }, { PRESETS }] = await Promise.all([import("../state/schema.js"), import("../data/presets.js")]);
  for (let index = store.books.length; index < 14; index += 1) {
    const book = createBook({ presetId: PRESETS[index % PRESETS.length].id, title: `Shelf ${index + 1}` });
    store.add(book, store.books.length);
    engine.addBook(book, store.books.length - 1);
  }
  engine.select(0);
  await wait(1600);
  const experience = document.querySelector("#experience");
  const wheel = (deltaY) => experience.dispatchEvent(new WheelEvent("wheel", { deltaY, bubbles: true, cancelable: true }));
  const sweep = (index) => wheel(index < 120 ? 48 : -48);
  result.shelfWheelCold = await drive(240, sweep);
  await wait(900);
  result.shelfWheelWarm = await drive(240, sweep);
  await wait(900);
  result.shelfStep = await drive(200, (index) => {
    if (index % 14 === 0) engine.navigate(index < 100 ? 1 : -1);
  });
  await wait(900);
  result.shelfIdleFrames2s = result.shelfIdleFrames2s ?? await idle(2000);
  window.__bench = result;
  const out = document.createElement("pre");
  out.id = "bench-result";
  out.style.cssText = "position:fixed;right:10px;top:10px;z-index:9999;max-height:90vh;overflow:auto;font:10px/1.4 monospace;background:#101410;color:#dfe;padding:8px;margin:0";
  out.textContent = JSON.stringify(result, null, 1);
  document.body.append(out);
  return result;
}
