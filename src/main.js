// Folio Atelier — start-up. Loads the library, starts the 3D engine and
// connects it to the shelf interface and the studio.

import { AUDIO_SOURCES, createAudioSystem } from "./audio.js";
import { engine } from "./engine.js";
import { getLang, localizeDocument, onLang, setLang, t } from "./i18n.js";
import { perf } from "./perf.js";
import { sweepImages } from "./state/images.js";
import { onStorageEvent, requestPersistence } from "./state/storage.js";
import { createStore } from "./state/store.js";
import { interrupt } from "./ui/dom.js";
import { createLibraryUi } from "./ui/library.js";
import { createStudioUi } from "./ui/studio.js";

const LOCK = "folio-atelier-library";
const TAKE_OVER = "folio-atelier-take-over";

/**
 * Hold the library lock for the life of the page. Resolves with whether it was
 * granted; `onLost` runs if another tab later takes it over.
 */
function holdLibrary(options, onLost) {
  return new Promise((resolve) => {
    navigator.locks.request(LOCK, options, (lock) => {
      resolve(Boolean(lock));
      return lock ? new Promise(() => {}) : undefined;
    }).catch((error) => {
      if (error?.name === "AbortError") onLost();
      resolve(false);
    });
  });
}

/**
 * One tab edits the library at a time, or two tabs would each save their own
 * copy of a book over the other's. A second tab waits until the reader
 * chooses to use it instead; the first then stops saving and says so.
 */
async function claimLibrary(onLost) {
  if (!navigator.locks?.request) return;
  let takeOver = false;
  try {
    takeOver = sessionStorage.getItem(TAKE_OVER) === "1";
    sessionStorage.removeItem(TAKE_OVER);
  } catch (error) {
    // Without session storage the reader is simply asked again.
  }
  if (await holdLibrary(takeOver ? { steal: true } : { ifAvailable: true }, onLost)) return;
  await new Promise((resolve) => {
    const lift = interrupt({
      title: t("Your library is open in another tab"),
      text: t("Only one tab can edit your books at a time, so that neither saves over the other."),
      action: t("Use it here"),
      onAction: () => holdLibrary({ steal: true }, onLost).then(() => {
        lift();
        resolve();
      })
    });
  });
}

/**
 * The thread under the loading mark follows the real stages (modules,
 * library, room); the engine draws it out to the end once the covers' type
 * is in and lifts the veil.
 */
function loadingStage(amount) {
  document.querySelector("#loading")?.style.setProperty("--progress", String(amount));
}

async function start() {
  window.__folioStarted = true;
  loadingStage(0.28);
  clearTimeout(window.__folioBootTimer);
  document.querySelector("#interrupt").hidden = true;
  localizeDocument();
  const langToggle = document.querySelector("#lang-toggle");
  const markLang = () => { langToggle.dataset.lang = getLang(); };
  markLang();
  langToggle.addEventListener("click", () => setLang(getLang() === "zh" ? "en" : "zh"));

  const audio = createAudioSystem(AUDIO_SOURCES);
  const store = createStore();

  const lost = () => {
    store.freeze();
    interrupt({
      title: t("Your library moved to another tab"),
      text: t("Your books are being edited in another tab now. Nothing more is saved from this one."),
      action: t("Use it here"),
      onAction: () => {
        try { sessionStorage.setItem(TAKE_OVER, "1"); } catch (error) { /* asked again */ }
        location.reload();
      }
    });
  };
  await claimLibrary(lost);

  // An older copy of the atelier in another tab can hold the database back.
  let liftBlocked = null;
  onStorageEvent("blocked", () => {
    liftBlocked = interrupt({
      title: t("Waiting for another tab"),
      text: t("Close the other Folio Atelier tab and your library will open here.")
    });
  });
  onStorageEvent("versionchange", () => {
    store.freeze();
    interrupt({
      title: t("Folio Atelier was updated in another tab"),
      text: t("Reload to keep working with the new version. Your books are saved."),
      action: t("Reload"),
      onAction: () => location.reload()
    });
  });
  await store.init();
  loadingStage(0.55);
  liftBlocked?.();
  // Pictures no book uses any more (replaced, removed, deleted with a book).
  if (store.persistent && !store.readError) sweepImages(store.books).catch(() => {});
  // Ask the browser to keep the library through storage pressure, once there is one.
  if (store.books.length) requestPersistence();
  else {
    const stop = store.on("add", () => {
      stop();
      requestPersistence();
    });
  }

  let library = null;
  let studio = null;

  const ready = await engine.init({
    audio,
    books: store.books,
    hooks: {
      onSelect: () => library?.renderSelection(),
      onMove: (id, index) => {
        store.move(id, index);
        library?.refresh();
      },
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
      onPageState: (state) => studio?.renderPageState(state),
      onReadingMode: (on) => studio?.renderReading(on)
    }
  });
  if (!ready) return;
  loadingStage(0.86);

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
