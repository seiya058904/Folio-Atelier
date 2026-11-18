// Local persistence in IndexedDB: one store for books, one for image blobs.
// Falls back to an in-memory map when IndexedDB is unavailable (private modes),
// so the studio keeps working for the session.

const DB_NAME = "folio-atelier";
const DB_VERSION = 1;
const BOOKS = "books";
const IMAGES = "images";

let dbPromise = null;
let memory = null;
// Called when another tab holds an older version of the database open and the
// upgrade has to wait, and when another tab asks this one to let go of it.
const handlers = { blocked: null, versionchange: null };

export function onStorageEvent(name, handler) {
  handlers[name] = handler;
}

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    let request;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (error) {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(BOOKS)) db.createObjectStore(BOOKS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(IMAGES)) db.createObjectStore(IMAGES, { keyPath: "id" });
    };
    request.onsuccess = () => {
      const db = request.result;
      // A newer version opened in another tab: let it upgrade, and say so here.
      db.onversionchange = () => {
        db.close();
        handlers.versionchange?.();
      };
      resolve(db);
    };
    request.onerror = () => resolve(null);
    // Another tab still has the old version open. Falling back to memory here
    // would lose every edit made in this tab, so wait for it to close.
    request.onblocked = () => handlers.blocked?.();
  }).then((db) => {
    if (!db) memory = { [BOOKS]: new Map(), [IMAGES]: new Map() };
    return db;
  });
  return dbPromise;
}

async function run(storeName, mode, operation) {
  const db = await openDb();
  if (!db) return operation(null, memory[storeName]);
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    let result;
    const request = operation(store, null);
    if (request) request.onsuccess = () => { result = request.result; };
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export const isPersistent = async () => Boolean(await openDb());

/** Ask the browser not to clear the library under storage pressure. Once. */
export async function requestPersistence() {
  try {
    if (!navigator.storage?.persist || await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch (error) {
    return false;
  }
}

export async function loadBooks() {
  const books = await run(BOOKS, "readonly", (store, map) => (
    store ? store.getAll() : [...map.values()]
  ));
  return (books || []).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

export function saveBook(book) {
  return run(BOOKS, "readwrite", (store, map) => (
    store ? store.put(book) : void map.set(book.id, book)
  ));
}

export function deleteBook(id) {
  return run(BOOKS, "readwrite", (store, map) => (
    store ? store.delete(id) : void map.delete(id)
  ));
}

export function saveImage(id, blob) {
  const record = { id, blob, type: blob.type };
  return run(IMAGES, "readwrite", (store, map) => (
    store ? store.put(record) : void map.set(id, record)
  ));
}

export async function loadImage(id) {
  const record = await run(IMAGES, "readonly", (store, map) => (
    store ? store.get(id) : map.get(id)
  ));
  return record?.blob || null;
}

export async function listImageIds() {
  const ids = await run(IMAGES, "readonly", (store, map) => (
    store ? store.getAllKeys() : [...map.keys()]
  ));
  return ids || [];
}

export function deleteImage(id) {
  return run(IMAGES, "readwrite", (store, map) => (
    store ? store.delete(id) : void map.delete(id)
  ));
}
