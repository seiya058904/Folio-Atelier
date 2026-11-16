// The library: an ordered list of books with change events, autosave and
// per-book undo / redo.

import { debounce, deepClone } from "../util.js";
import { normalizeBook } from "./schema.js";
import * as storage from "./storage.js";

const HISTORY_LIMIT = 80;
const COALESCE_MS = 700;

export function createStore() {
  const listeners = new Map();
  const books = [];
  const history = new Map(); // bookId -> { undo: [], redo: [], lastKey, lastAt }
  let saveError = null;

  const emit = (event, payload) => {
    listeners.get(event)?.forEach((listener) => listener(payload));
  };

  const persist = (book) => {
    storage.saveBook(deepClone(book)).then(
      () => {
        if (saveError) {
          saveError = null;
          emit("save-state", { ok: true });
        }
        emit("saved", { book });
      },
      (error) => {
        saveError = error;
        emit("save-state", { ok: false, error });
      }
    );
  };

  const savers = new Map();
  const scheduleSave = (book) => {
    if (!savers.has(book.id)) {
      savers.set(book.id, debounce(() => {
        const current = books.find((candidate) => candidate.id === book.id);
        if (current) persist(current);
      }, 450));
    }
    emit("saving", { book });
    savers.get(book.id)();
  };

  const track = (id) => {
    if (!history.has(id)) history.set(id, { undo: [], redo: [], lastKey: null, lastAt: 0 });
    return history.get(id);
  };

  return {
    books,

    on(event, listener) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(listener);
      return () => listeners.get(event).delete(listener);
    },

    async init() {
      let stored = [];
      try {
        stored = await storage.loadBooks();
      } catch (error) {
        stored = [];
      }
      stored.forEach((value) => {
        const book = normalizeBook(value);
        if (book) books.push(book);
      });
      return books;
    },

    get(id) {
      return books.find((book) => book.id === id) || null;
    },

    indexOf(id) {
      return books.findIndex((book) => book.id === id);
    },

    add(book, index = books.length) {
      books.splice(index, 0, book);
      persist(book);
      emit("add", { book, index });
      return book;
    },

    remove(id) {
      const index = books.findIndex((book) => book.id === id);
      if (index < 0) return null;
      const [book] = books.splice(index, 1);
      history.delete(id);
      savers.delete(id);
      storage.deleteBook(id).catch(() => {});
      emit("remove", { book, index });
      return book;
    },

    /**
     * Mutate a book in place. `dirty` names the parts that changed so the 3D
     * rig repaints only what it must. Edits sharing a `key` within a short
     * window collapse into one undo step (slider drags, typing).
     */
    update(id, mutate, { dirty = ["all"], key = null, record = true } = {}) {
      const book = this.get(id);
      if (!book) return;
      if (record) {
        const entry = track(id);
        const now = performance.now();
        const coalesce = key && entry.lastKey === key && now - entry.lastAt < COALESCE_MS;
        if (!coalesce) {
          entry.undo.push(JSON.stringify(book));
          if (entry.undo.length > HISTORY_LIMIT) entry.undo.shift();
        }
        entry.redo.length = 0;
        entry.lastKey = key;
        entry.lastAt = now;
      }
      mutate(book);
      book.updatedAt = Date.now();
      scheduleSave(book);
      emit("change", { book, dirty });
      emit("history", { id });
    },

    canUndo(id) {
      return Boolean(history.get(id)?.undo.length);
    },

    canRedo(id) {
      return Boolean(history.get(id)?.redo.length);
    },

    step(id, direction) {
      const book = this.get(id);
      const entry = history.get(id);
      if (!book || !entry) return false;
      const from = direction < 0 ? entry.undo : entry.redo;
      const to = direction < 0 ? entry.redo : entry.undo;
      if (!from.length) return false;
      to.push(JSON.stringify(book));
      const snapshot = JSON.parse(from.pop());
      Object.keys(book).forEach((property) => { delete book[property]; });
      Object.assign(book, snapshot);
      entry.lastKey = null;
      scheduleSave(book);
      emit("change", { book, dirty: ["all"], restored: true });
      emit("history", { id });
      return true;
    },

    flush() {
      savers.forEach((saver) => saver.flush());
    }
  };
}
