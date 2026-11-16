// Local persistence in IndexedDB: one store for books, one for image blobs.
// Falls back to an in-memory map when IndexedDB is unavailable (private modes),
// so the studio keeps working for the session.

const DB_NAME = "folio-atelier";
const DB_VERSION = 1;
const BOOKS = "books";
const IMAGES = "images";

let dbPromise = null;
let memory = null;

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
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
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

export function deleteImage(id) {
  return run(IMAGES, "readwrite", (store, map) => (
    store ? store.delete(id) : void map.delete(id)
  ));
}
