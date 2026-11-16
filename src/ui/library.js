// The shelf interface: empty state, selection read-out, navigation markers,
// the "begin a book" dialog, and duplicate / delete / export / import.

import { PRESETS, getPreset } from "../data/presets.js";
import { ensureFonts } from "../data/fonts.js";
import { bookImageIds, getImageBlob, restoreImage } from "../state/images.js";
import {
  bindingLabel,
  coverFontRuns,
  createBook,
  duplicateBook,
  normalizeBook
} from "../state/schema.js";
import { pad, uid } from "../util.js";
import { confirmDialog, downloadBlob, h, pickFile, toast } from "./dom.js";
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
      "aria-label": `Select ${book.title}`,
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
      ? "An empty shelf"
      : `${count} ${count === 1 ? "volume" : "volumes"} on your shelf`;
    bindingLabelElement.textContent = book ? bindingLabel(book) : " ";
    if (!book) return;
    counter.textContent = `${pad(index + 1)} / ${pad(count)}`;
    selectionTitle.textContent = book.title;
    const pages = book.pages.length;
    selectionNote.textContent = [
      book.author ? `by ${book.author}` : null,
      bindingLabel(book),
      `${pages} ${pages === 1 ? "page template" : "page templates"}`
    ].filter(Boolean).join("  ·  ");
    inspectButton.setAttribute("aria-label", `Open ${book.title} in the atelier`);
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
  }

  /* ----- begin a book ----- */

  function sampleBook(presetId) {
    return createBook({
      presetId,
      title: nameInput.value.trim() || "Untitled",
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
    presetNote.textContent = getPreset(id).note;
  }

  function buildPresetGrid() {
    presetGrid.replaceChildren(...PRESETS.map((preset) => {
      const canvas = h("canvas", { class: "tile__art", width: 192, height: 288, dataset: { preset: preset.id } });
      return h("button", {
        type: "button",
        role: "radio",
        class: "tile",
        title: preset.note,
        dataset: { value: preset.id },
        onclick: () => choosePreset(preset.id)
      }, canvas, h("span", { text: preset.label }));
    }));
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
      title: nameInput.value,
      author: authorInput.value
    });
    addToShelf(book, { open: true });
  }

  /** Put a book on the shelf next to the current one and select it. */
  function addToShelf(book, { open = false } = {}) {
    const index = store.books.length ? engine.selectedIndex + 1 : 0;
    store.add(book, index);
    engine.addBook(book, index);
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
    const copy = addToShelf(duplicateBook(book));
    toast(`Made a copy: ${copy.title}`);
  }

  async function deleteSelected() {
    const book = store.books[engine.selectedIndex];
    if (!book || engine.mode !== "hero") return;
    const confirmed = await confirmDialog({
      title: "Delete this book?",
      text: `“${book.title}” will be removed from your shelf, with its cover and all of its pages. This cannot be undone.`,
      accept: "Delete book"
    });
    if (!confirmed) return;
    engine.removeBook(book.id);
    store.remove(book.id);
    refresh();
    toast(`Deleted “${book.title}”.`);
  }

  /* ----- export / import ----- */

  const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

  async function exportSelected() {
    const book = store.books[engine.selectedIndex];
    if (!book) return;
    const images = {};
    for (const id of bookImageIds(book)) {
      const blob = await getImageBlob(id).catch(() => null);
      if (blob) images[id] = await blobToDataUrl(blob);
    }
    const payload = { format: "folio-atelier", version: 1, exportedAt: new Date().toISOString(), book, images };
    const name = (book.title || "book").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "book";
    downloadBlob(new Blob([JSON.stringify(payload)], { type: "application/json" }), `${name}.folio`);
    toast(`Exported ${name}.folio`);
  }

  async function importBook() {
    if (engine.mode !== "hero") return;
    const file = await pickFile(importInput);
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      const source = payload?.format === "folio-atelier" ? payload.book : payload;
      const book = normalizeBook(source);
      if (!book) throw new Error("not a book");
      // Imported books get a fresh identity so they never overwrite an existing one.
      book.id = uid("book");
      book.createdAt = Date.now();
      const remap = new Map();
      for (const [id, dataUrl] of Object.entries(payload.images || {})) {
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
      addToShelf(book);
      toast(`Imported “${book.title}”.`);
    } catch (error) {
      toast("That file is not a Folio Atelier book.");
    }
  }

  /* ----- wiring ----- */

  buildPresetGrid();
  $("#create-first").addEventListener("click", openNewBookDialog);
  $("#new-book").addEventListener("click", openNewBookDialog);
  $("#import-first").addEventListener("click", importBook);
  $("#import-book").addEventListener("click", importBook);
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

  return {
    refresh,
    renderSelection,
    setInteractive(active) {
      browseUi.inert = !active;
      emptyState.inert = !active;
    }
  };
}
