// Folio Atelier — start-up. Loads the library, starts the 3D engine and
// connects it to the shelf interface and the studio.

import { AUDIO_SOURCES, createAudioSystem } from "./audio.js";
import { engine } from "./engine.js";
import { getLang, localizeDocument, onLang, setLang, t } from "./i18n.js";
import { perf } from "./perf.js";
import { createStore } from "./state/store.js";
import { createLibraryUi } from "./ui/library.js";
import { createStudioUi } from "./ui/studio.js";

async function start() {
  localizeDocument();
  const langToggle = document.querySelector("#lang-toggle");
  const markLang = () => { langToggle.dataset.lang = getLang(); };
  markLang();
  langToggle.addEventListener("click", () => setLang(getLang() === "zh" ? "en" : "zh"));

  const audio = createAudioSystem(AUDIO_SOURCES);
  const store = createStore();
  await store.init();

  let library = null;
  let studio = null;

  const ready = await engine.init({
    audio,
    books: store.books,
    hooks: {
      onSelect: () => library?.renderSelection(),
      onMode: (mode, book) => {
        if (mode === "opening") {
          library.setInteractive(false);
          studio.show(book);
        } else if (mode === "detail") {
          studio.focus();
        } else if (mode === "closing") {
          studio.hide();
        } else if (mode === "hero") {
          library.setInteractive(true);
          library.refresh();
        }
      },
      onPageState: (state) => studio?.renderPageState(state)
    }
  });
  if (!ready) return;

  library = createLibraryUi({ store, engine, audio });
  studio = createStudioUi({ store, engine, audio });
  library.refresh();

  onLang(() => {
    markLang();
    library.relocalize();
    studio.relocalize();
  });

  // Every edit repaints the book it belongs to.
  store.on("change", ({ book, dirty, interactive }) => engine.refreshBook(book, dirty, { interactive }));

  if (perf.enabled) window.__folio = { engine, store };
  if (new URLSearchParams(location.search).has("bench")) {
    import("./dev/bench.js").then(({ runBench }) => runBench({ store, engine })).catch((error) => {
      window.__bench = { error: String(error?.stack || error) };
    });
  }

  window.addEventListener("pagehide", () => store.flush());
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) store.flush();
  });
}

start().catch((error) => {
  console.error(error);
  engine.showFallback(t("The atelier could not be prepared. Reload the page to try again."));
});
