// The shelf interface: empty state, selection read-out, navigation markers,
// the "begin a book" dialog, and duplicate / delete / export / import.

import { PRESETS, getPreset } from "../data/presets.js";
import { ensureFonts } from "../data/fonts.js";
import { getLang, t } from "../i18n.js";
import { bookImageIds, getImageBlob, restoreImage } from "../state/images.js";
import {
  bindingLabel,
  coverFontRuns,
  createBook,
  duplicateBook,
  normalizeBook
} from "../state/schema.js";
import { pad, uid } from "../util.js";
import { segmented, toggle } from "./controls.js";
import { clearNotice, confirmDialog, downloadBlob, h, notice, pickFile, toast } from "./dom.js";
import { drawCoverThumb } from "./thumbs.js";

const $ = (selector) => document.querySelector(selector);

export function createLibraryUi({ store, engine, audio }) {
  const emptyState = $("#empty-state");
  const browseUi = $("#browse-ui");
  const counter = $("#counter");
  const selectionTitle = $("#selection-title");
  const selectionNote = $("#selection-note");
  const libraryCount = $("#library-count");
  const bindingLabelElement = $("#binding-label");
  const markers = $("#markers");
  const inspectButton = $("#inspect");
  const previousButton = $("#previous");
  const nextButton = $("#next");
  const dialog = $("#new-book-dialog");
  const form = $("#new-book-form");
  const nameInput = $("#new-book-name");
  const authorInput = $("#new-book-author");
  const presetGrid = $("#new-book-presets");
  const presetNote = $("#new-book-note");
  const importInput = $("#import-file");

  let chosenPreset = PRESETS[0].id;
  let thumbTimer = 0;

  /* ----- shelf read-out ----- */

  function renderMarkers() {
    markers.replaceChildren(...store.books.map((book, index) => h("button", {
      class: "marker",
      type: "button",
      role: "tab",
      "aria-label": t("Select {title}", { title: book.title }),
      "aria-selected": String(index === engine.selectedIndex),
      tabIndex: index === engine.selectedIndex ? 0 : -1,
      onclick: (event) => engine.select(index, event.currentTarget)
    })));
  }

  function renderSelection() {
    const count = store.books.length;
    const index = engine.selectedIndex;
    const book = store.books[index];
    const empty = count === 0;
    emptyState.hidden = !empty;
    browseUi.hidden = empty;
    libraryCount.textContent = empty
      ? t("An empty shelf")
      : t(count === 1 ? "1 volume on your shelf" : "{n} volumes on your shelf", { n: count });
    bindingLabelElement.textContent = book ? bindingLabel(book) : " ";
    if (!book) return;
    counter.textContent = `${pad(index + 1)} / ${pad(count)}`;
    selectionTitle.textContent = book.title;
    const pages = book.pages.length;
    selectionNote.textContent = [
      book.author ? t("by {author}", { author: book.author }) : null,
      bindingLabel(book),
      t(pages === 1 ? "1 page template" : "{n} page templates", { n: pages })
    ].filter(Boolean).join("  ·  ");
    inspectButton.setAttribute("aria-label", t("Open {title} in the atelier", { title: book.title }));
    previousButton.disabled = index <= 0;
    nextButton.disabled = index >= count - 1;
    [...markers.children].forEach((marker, markerIndex) => {
      const current = markerIndex === index;
      marker.setAttribute("aria-selected", String(current));
      marker.tabIndex = current ? 0 : -1;
    });
  }

  function refresh() {
    renderMarkers();
    renderSelection();
    renderNotices();
  }

  /* ----- begin a book ----- */

  function sampleBook(presetId) {
    return createBook({
      presetId,
      title: nameInput.value.trim() || t("Untitled"),
      author: authorInput.value.trim()
    });
  }

  function paintPresetThumbs() {
    const samples = [];
    presetGrid.querySelectorAll("canvas").forEach((canvas) => {
      const book = sampleBook(canvas.dataset.preset);
      samples.push(book);
      drawCoverThumb(canvas, book);
    });
    ensureFonts(samples.flatMap(coverFontRuns)).then((loaded) => {
      if (!loaded || !dialog.open) return;
      presetGrid.querySelectorAll("canvas").forEach((canvas) => {
        drawCoverThumb(canvas, sampleBook(canvas.dataset.preset));
      });
    });
  }

  function choosePreset(id) {
    chosenPreset = id;
    presetGrid.querySelectorAll("[role='radio']").forEach((button) => {
      const checked = button.dataset.value === id;
      button.setAttribute("aria-checked", String(checked));
      button.tabIndex = checked ? 0 : -1;
    });
    presetNote.textContent = t(getPreset(id).note);
  }

  function buildPresetGrid() {
    presetGrid.replaceChildren(...PRESETS.map((preset) => {
      const canvas = h("canvas", { class: "tile__art", width: 192, height: 288, dataset: { preset: preset.id } });
      return h("button", {
        type: "button",
        role: "radio",
        class: "tile",
        title: t(preset.note),
        dataset: { value: preset.id },
        onclick: () => choosePreset(preset.id)
      }, canvas, h("span", { text: t(preset.label) }));
    }));
  }

  function wirePresetGrid() {
    presetGrid.addEventListener("keydown", (event) => {
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
      if (!step) return;
      const buttons = [...presetGrid.querySelectorAll("[role='radio']")];
      const index = buttons.indexOf(document.activeElement);
      if (index < 0) return;
      event.preventDefault();
      const next = buttons[(index + step + buttons.length) % buttons.length];
      next.focus();
      next.click();
    });
  }

  function openNewBookDialog() {
    if (engine.mode !== "hero" || dialog.open) return;
    audio.unlock();
    nameInput.value = "";
    choosePreset(chosenPreset);
    dialog.returnValue = "cancel";
    dialog.showModal();
    paintPresetThumbs();
    nameInput.focus();
  }

  function createFromDialog() {
    const book = createBook({
      presetId: chosenPreset,
      title: nameInput.value.trim() || t("Untitled"),
      author: authorInput.value
    });
    addToShelf(book, { open: true });
  }

  /** Put a book on the shelf next to the current one and select it. */
  function addToShelf(book, { open = false, from = null } = {}) {
    const index = store.books.length ? engine.selectedIndex + 1 : 0;
    store.add(book, index);
    engine.addBook(book, index, { from });
    refresh();
    engine.select(index);
    renderSelection();
    if (open) setTimeout(() => engine.openDetail(inspectButton), 620);
    return book;
  }

  /* ----- duplicate / delete ----- */

  function duplicateSelected() {
    const book = store.books[engine.selectedIndex];
    if (!book || engine.mode !== "hero") return;
    const copy = addToShelf(duplicateBook(book), { from: book.id });
    toast(t("Made a copy: {title}", { title: copy.title }));
  }

  async function deleteSelected() {
    const book = store.books[engine.selectedIndex];
    if (!book || engine.mode !== "hero") return;
    const confirmed = await confirmDialog({
      title: t("Delete this book?"),
      text: t("“{title}” will be removed from your shelf, with its cover and all of its pages. This cannot be undone.", { title: book.title }),
      accept: t("Delete book")
    });
    if (!confirmed) return;
    engine.removeBook(book.id);
    store.remove(book.id);
    refresh();
    toast(t("Deleted “{title}”.", { title: book.title }));
  }

  /* ----- export / import ----- */

  const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

  /** A book and the pictures it uses, as data URLs. */
  async function packImages(book) {
    const images = {};
    for (const id of bookImageIds(book)) {
      const blob = await getImageBlob(id).catch(() => null);
      if (blob) images[id] = await blobToDataUrl(blob);
    }
    return images;
  }

  async function exportSelected() {
    const book = store.books[engine.selectedIndex];
    if (!book) return;
    const images = await packImages(book);
    const payload = { format: "folio-atelier", version: 1, exportedAt: new Date().toISOString(), book, images };
    const name = (book.title || "book").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "book";
    downloadBlob(new Blob([JSON.stringify(payload)], { type: "application/json" }), `${name}.folio`);
    toast(t("Exported {name}.folio", { name }));
  }

  /** The whole library in one file: every book, its pictures and the room. */
  async function exportLibrary() {
    if (!store.books.length) return;
    const books = [];
    for (const book of store.books) books.push({ book, images: await packImages(book) });
    const payload = { format: "folio-atelier-library", version: 3, exportedAt: new Date().toISOString(), room: engine.room, books };
    downloadBlob(new Blob([JSON.stringify(payload)], { type: "application/json" }), "folio-library.folio");
    toast(t("Exported {count} books.", { count: books.length }));
    writeBackup({ at: Date.now() });
    renderNotices();
  }

  /* ----- notices: books not being kept, a backup worth making ----- */

  const BACKUP_KEY = "folio-atelier-backup";
  const DAY = 86_400_000;
  const BACKUP_AFTER = 7 * DAY;
  const readBackup = () => {
    try { return JSON.parse(localStorage.getItem(BACKUP_KEY)) || {}; } catch (error) { return {}; }
  };
  const writeBackup = (patch) => {
    try { localStorage.setItem(BACKUP_KEY, JSON.stringify({ ...readBackup(), ...patch })); } catch (error) { /* private mode */ }
  };

  function sinceText(time) {
    const days = Math.max(1, Math.round((Date.now() - time) / DAY));
    try {
      return new Intl.RelativeTimeFormat(getLang() === "zh" ? "zh-CN" : "en", { numeric: "auto" }).format(-days, "day");
    } catch (error) {
      return t("{n} days ago", { n: days });
    }
  }

  function renderNotices() {
    if (store.readError) {
      notice("library", {
        tone: "error",
        text: t("Your library could not be read. Nothing is lost yet: reload to try again."),
        actions: [{ label: t("Reload"), onClick: () => location.reload() }]
      });
    }
    if (!store.persistent) {
      notice("storage", {
        tone: "warn",
        text: t("This browser is not letting the atelier save. Books made now last until the tab closes; export them to keep them."),
        actions: store.books.length ? [{ label: t("Export all"), onClick: exportLibrary }] : []
      });
      return;
    }
    // A gentle reminder once a week of edits has gone by without a backup.
    const backup = readBackup();
    const books = store.books;
    const edited = Math.max(0, ...books.map((book) => book.updatedAt || book.createdAt || 0));
    const since = backup.at || Math.min(...books.map((book) => book.createdAt || Date.now()));
    const due = books.length && !store.readError && edited > (backup.at || 0)
      && Date.now() - since > BACKUP_AFTER && Date.now() > (backup.snooze || 0);
    if (!due) {
      clearNotice("backup");
      return;
    }
    notice("backup", {
      tone: "quiet",
      text: backup.at
        ? t("Your books were last exported {when}. Clearing site data would remove them.", { when: sinceText(backup.at) })
        : t("Your books live only in this browser. Export a copy to keep them safe."),
      actions: [
        { label: t("Export all"), onClick: exportLibrary },
        {
          label: t("Not now"),
          onClick: () => {
            writeBackup({ snooze: Date.now() + 3 * DAY });
            clearNotice("backup");
          }
        }
      ]
    });
  }

  async function importBook() {
    if (engine.mode !== "hero") return;
    const file = await pickFile(importInput);
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      if (payload?.format === "folio-atelier-library" && Array.isArray(payload.books)) {
        let count = 0;
        for (const entry of payload.books) {
          const book = await unpackBook(entry?.book, entry?.images);
          if (book) {
            addToShelf(book);
            count += 1;
          }
        }
        if (!count) throw new Error("no books");
        if (payload.room) {
          engine.setRoom(payload.room);
          saveRoom();
        }
        toast(t("Imported {count} books.", { count }));
        return;
      }
      const source = payload?.format === "folio-atelier" ? payload.book : payload;
      const book = await unpackBook(source, payload.images);
      if (!book) throw new Error("not a book");
      addToShelf(book);
      toast(t("Imported “{title}”.", { title: book.title }));
    } catch (error) {
      toast(t("That file is not a Folio Atelier book."));
    }
  }

  /** Validate an imported book and restore its pictures under fresh ids. */
  async function unpackBook(source, images = {}) {
    const book = normalizeBook(source);
    if (!book) return null;
    // Imported books get a fresh identity so they never overwrite an existing one.
    book.id = uid("book");
    book.createdAt = Date.now();
    const remap = new Map();
    for (const [id, dataUrl] of Object.entries(images || {})) {
      if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) continue;
      const blob = await (await fetch(dataUrl)).blob();
      const nextId = uid("img");
      await restoreImage(nextId, blob);
      remap.set(id, nextId);
    }
    if (book.front.image?.id) {
      if (remap.has(book.front.image.id)) book.front.image.id = remap.get(book.front.image.id);
      else book.front.image = null;
    }
    book.pages.forEach((page) => {
      if (page.image) page.image = remap.get(page.image) || null;
    });
    return book;
  }

  /* ----- find a book: by title, author, series or words inside ----- */

  // Type to find; the shelf glides to each result as it is chosen with the
  // arrow keys, Enter keeps it, Escape goes back to where the reader was.
  const finder = $("#finder");
  const finderInput = $("#finder-input");
  const finderResults = $("#finder-results");
  const finderEmpty = $("#finder-empty");
  const findButton = $("#find-book");
  const finderThumbs = new Map(); // book id -> { stamp, canvas }
  let finderMatches = [];
  let finderActive = 0;
  let finderTimer = 0;
  let finderFrom = -1;

  const fold = (text) => String(text || "").toLowerCase();
  const pageWords = (page) => [page.title, page.heading, page.text, page.caption, page.attribution, page.imprint]
    .filter(Boolean).join("\n");

  function searchBooks(query) {
    const needle = fold(query.trim());
    if (!needle) return [];
    const found = [];
    store.books.forEach((book, index) => {
      const title = fold(book.title);
      let score = title.startsWith(needle) ? 100 : title.includes(needle) ? 80 : 0;
      let snippet = null;
      if (!score && [book.author, book.subtitle, book.series].some((field) => fold(field).includes(needle))) score = 60;
      if (!score) {
        for (const page of book.pages) {
          const words = pageWords(page);
          const at = fold(words).indexOf(needle);
          if (at >= 0) {
            score = 30;
            snippet = { words, at };
            break;
          }
        }
      }
      if (score) found.push({ book, index, score, snippet });
    });
    return found.sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 8);
  }

  /** `text` with the first `needle` marked. */
  function marked(text, needle) {
    const at = fold(text).indexOf(fold(needle));
    if (!needle || at < 0) return [text];
    return [text.slice(0, at), h("mark", { text: text.slice(at, at + needle.length) }), text.slice(at + needle.length)];
  }

  function finderThumb(book) {
    const stamp = book.updatedAt || book.createdAt || 0;
    let entry = finderThumbs.get(book.id);
    if (!entry || entry.stamp !== stamp) {
      const canvas = h("canvas", { width: 60, height: 90, "aria-hidden": "true" });
      drawCoverThumb(canvas, book);
      entry = { stamp, canvas };
      finderThumbs.set(book.id, entry);
    }
    return entry.canvas;
  }

  function renderFinder() {
    const query = finderInput.value;
    finderMatches = searchBooks(query);
    finderActive = 0;
    finderResults.replaceChildren(...finderMatches.map((match, position) => {
      const { book, snippet } = match;
      let meta;
      if (snippet) {
        const start = Math.max(0, snippet.at - 24);
        const piece = snippet.words.slice(start, snippet.at + query.trim().length + 44).replace(/\s+/g, " ");
        meta = [t("In the text"), " · ", start > 0 ? "…" : "", ...marked(piece, query.trim()), "…"];
      } else {
        meta = [...marked([book.author, bindingLabel(book)].filter(Boolean).join("  ·  "), query.trim())];
      }
      return h("li", {
        class: "finder__result",
        id: `finder-option-${position}`,
        role: "option",
        "aria-selected": String(position === 0),
        style: { animationDelay: `calc(var(--stagger) * ${(position * 0.3).toFixed(2)})` },
        onpointerenter: () => setFinderActive(position, false),
        onclick: () => chooseFinder(position)
      },
        finderThumb(book),
        h("div", {},
          h("div", { class: "finder__title" }, ...marked(book.title, snippet ? "" : query.trim())),
          h("div", { class: "finder__meta" }, ...meta)
        ));
    }));
    finderInput.setAttribute("aria-activedescendant", finderMatches.length ? "finder-option-0" : "");
    finderEmpty.hidden = Boolean(finderMatches.length) || !query.trim();
    finderEmpty.textContent = t("No book on the shelf matches “{query}”.", { query: query.trim() });
  }

  function setFinderActive(position, preview = true) {
    if (!finderMatches.length) return;
    finderActive = (position + finderMatches.length) % finderMatches.length;
    finderResults.querySelectorAll("[role='option']").forEach((option, index) => {
      option.setAttribute("aria-selected", String(index === finderActive));
      if (index === finderActive) option.scrollIntoView({ block: "nearest" });
    });
    finderInput.setAttribute("aria-activedescendant", `finder-option-${finderActive}`);
    // The shelf glides to the book under consideration.
    if (preview) engine.select(finderMatches[finderActive].index);
  }

  function chooseFinder(position) {
    const match = finderMatches[position];
    if (!match) return;
    finderFrom = -1;
    closeFinder();
    engine.select(match.index, findButton);
    renderSelection();
  }

  function openFinder() {
    if (engine.mode !== "hero" || !store.books.length || !finder.hidden) return;
    finderFrom = engine.selectedIndex;
    finder.classList.remove("is-leaving");
    finder.hidden = false;
    findButton.setAttribute("aria-expanded", "true");
    finderInput.value = "";
    renderFinder();
    finderInput.focus({ preventScroll: true });
  }

  function closeFinder({ restore = false, refocus = true } = {}) {
    if (finder.hidden || finder.classList.contains("is-leaving")) return;
    if (restore && finderFrom >= 0 && finderFrom !== engine.selectedIndex) engine.select(finderFrom);
    finderFrom = -1;
    findButton.setAttribute("aria-expanded", "false");
    finder.classList.add("is-leaving");
    setTimeout(() => {
      finder.hidden = true;
      finder.classList.remove("is-leaving");
    }, 180);
    if (refocus) findButton.focus({ preventScroll: true });
  }

  finderInput.addEventListener("input", () => {
    clearTimeout(finderTimer);
    finderTimer = setTimeout(renderFinder, 60);
  });
  finderInput.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setFinderActive(finderActive + (event.key === "ArrowDown" ? 1 : -1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      chooseFinder(finderActive);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeFinder({ restore: true });
    }
  });
  findButton.addEventListener("click", () => (finder.hidden ? openFinder() : closeFinder({ restore: true })));
  document.addEventListener("pointerdown", (event) => {
    if (!finder.hidden && !finder.contains(event.target) && event.target !== findButton) closeFinder({ refocus: false });
  });
  document.addEventListener("keydown", (event) => {
    if (event.defaultPrevented || engine.mode !== "hero" || document.querySelector("dialog[open]")) return;
    const typing = event.target instanceof HTMLElement && event.target.closest("input, textarea, [contenteditable='true']");
    const shortcut = (event.key === "/" && !typing) || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k");
    if (!shortcut) return;
    event.preventDefault();
    openFinder();
  });

  /* ----- the room: shelf and light, kept for this library ----- */

  const ROOM_KEY = "folio-atelier-room";
  const roomButton = $("#room-button");
  const roomPanel = $("#room-panel");
  const readRoom = () => {
    try { return JSON.parse(localStorage.getItem(ROOM_KEY)) || {}; } catch (error) { return {}; }
  };
  const saveRoom = () => {
    try { localStorage.setItem(ROOM_KEY, JSON.stringify(engine.room)); } catch (error) { /* private mode */ }
  };
  engine.setRoom(readRoom());

  function renderRoomPanel() {
    roomPanel.replaceChildren(
      segmented({
        label: "Shelf", value: engine.room.shelf,
        options: [
          { id: "walnut", label: "Walnut" }, { id: "oak", label: "Oak" }, { id: "white", label: "Painted" },
          { id: "steel", label: "Steel" }, { id: "ledge", label: "Ledge" }
        ],
        onChange: (value) => { engine.setRoom({ shelf: value }); saveRoom(); }
      }),
      segmented({
        label: "Lighting", value: engine.room.light,
        options: [
          { id: "studio", label: "Studio" }, { id: "morning", label: "Morning" },
          { id: "golden", label: "Golden hour" }, { id: "night", label: "Night" }
        ],
        onChange: (value) => { engine.setRoom({ light: value }); saveRoom(); }
      }),
      toggle({
        label: "Follow the book",
        value: engine.room.follow,
        onChange: (value) => { engine.setRoom({ follow: value }); saveRoom(); }
      }),
      h("p", { class: "room-panel__hint", text: t("When on, the walls and the light take their colours from the book in view.") })
    );
  }

  function setRoomPanel(open) {
    roomPanel.hidden = !open;
    roomButton.setAttribute("aria-expanded", String(open));
    if (open) renderRoomPanel();
  }

  roomButton.addEventListener("click", () => setRoomPanel(roomPanel.hidden));
  document.addEventListener("pointerdown", (event) => {
    if (!roomPanel.hidden && !roomPanel.contains(event.target) && event.target !== roomButton) setRoomPanel(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !roomPanel.hidden) {
      setRoomPanel(false);
      roomButton.focus();
    }
  });

  /* ----- wiring ----- */

  buildPresetGrid();
  wirePresetGrid();
  $("#create-first").addEventListener("click", openNewBookDialog);
  $("#new-book").addEventListener("click", openNewBookDialog);
  $("#import-first").addEventListener("click", importBook);
  $("#import-book").addEventListener("click", importBook);
  $("#export-library").addEventListener("click", exportLibrary);
  $("#duplicate-book").addEventListener("click", duplicateSelected);
  $("#delete-book").addEventListener("click", deleteSelected);
  $("#export-book").addEventListener("click", exportSelected);
  $("#new-book-cancel").addEventListener("click", () => dialog.close("cancel"));
  previousButton.addEventListener("click", () => engine.navigate(-1, previousButton));
  nextButton.addEventListener("click", () => engine.navigate(1, nextButton));
  inspectButton.addEventListener("click", () => engine.openDetail(inspectButton));
  [nameInput, authorInput].forEach((input) => input.addEventListener("input", () => {
    clearTimeout(thumbTimer);
    thumbTimer = setTimeout(paintPresetThumbs, 160);
  }));
  form.addEventListener("submit", (event) => {
    if (event.submitter?.value !== "create") return;
    event.preventDefault();
    dialog.close("create");
    createFromDialog();
  });

  store.on("change", ({ book }) => {
    if (store.books[engine.selectedIndex] === book) renderSelection();
  });

  renderNotices();

  return {
    refresh,
    renderSelection,
    relocalize() {
      renderNotices();
      if (!roomPanel.hidden) renderRoomPanel();
      buildPresetGrid();
      choosePreset(chosenPreset);
      refresh();
    },
    setInteractive(active) {
      browseUi.inert = !active;
      emptyState.inert = !active;
    }
  };
}
