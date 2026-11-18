// User-supplied images (cover art, plates). Stored as blobs in IndexedDB and
// decoded once into ImageBitmaps / <img> elements that the painters can draw.

import { uid } from "../util.js";
import { deleteImage, listImageIds, loadImage, saveImage } from "./storage.js";

const cache = new Map(); // id -> HTMLImageElement | "loading" | null
const waiters = new Map(); // id -> Set<fn>

const MAX_EDGE = 2048;

function decode(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    // The object URL is kept: the interface shows the same image as a thumbnail.
    image.onload = () => resolve(image);
    image.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    image.src = url;
  });
}

/** Downscale very large uploads so storage and GPU memory stay reasonable. */
async function shrink(file) {
  const image = await decode(file);
  if (!image) return null;
  const scale = Math.min(1, MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
  if (scale === 1 && file.size < 1_500_000) return { blob: file, image };
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
  return blob ? { blob, image } : { blob: file, image };
}

/** Store an uploaded file. Resolves with the new image id, or null if unreadable. */
export async function addImage(file) {
  if (!file || !file.type.startsWith("image/")) return null;
  const result = await shrink(file);
  if (!result) return null;
  const id = uid("img");
  cache.set(id, result.image);
  await saveImage(id, result.blob);
  return id;
}

/**
 * Synchronous lookup for painters. Returns the decoded image when ready,
 * otherwise null and starts loading; `onReady` fires once it can be drawn.
 */
export function getImage(id, onReady) {
  if (!id) return null;
  const cached = cache.get(id);
  if (cached && cached !== "loading") return cached;
  if (cached === null) return null;
  if (onReady) {
    if (!waiters.has(id)) waiters.set(id, new Set());
    waiters.get(id).add(onReady);
  }
  if (cached !== "loading") {
    cache.set(id, "loading");
    loadImage(id)
      .then((blob) => (blob ? decode(blob) : null))
      .catch(() => null)
      .then((image) => {
        cache.set(id, image);
        const callbacks = waiters.get(id);
        waiters.delete(id);
        if (image) callbacks?.forEach((callback) => callback());
      });
  }
  return null;
}

export async function getImageBlob(id) {
  return loadImage(id);
}

export async function restoreImage(id, blob) {
  await saveImage(id, blob);
  cache.delete(id);
}

export function removeImage(id) {
  const cached = cache.get(id);
  if (cached && cached !== "loading") URL.revokeObjectURL(cached.src);
  cache.delete(id);
  return deleteImage(id);
}

/**
 * Delete stored pictures no book refers to any more (replaced covers, removed
 * plates, deleted books). Run once at start-up, before anything can add one:
 * undo history lives only for a visit, so nothing else can still need them.
 * Copies of a book share their pictures, which is why this goes by reference
 * rather than deleting with a book. Resolves with the number removed.
 */
export async function sweepImages(books) {
  const used = new Set(books.flatMap(bookImageIds));
  const stored = await listImageIds();
  const unused = stored.filter((id) => !used.has(id) && !cache.has(id));
  for (const id of unused) await deleteImage(id);
  return unused.length;
}

/** Every image id a book refers to. Keep in step with every field that holds one. */
export function bookImageIds(book) {
  const ids = new Set();
  if (book.front?.image?.id) ids.add(book.front.image.id);
  book.pages?.forEach((page) => { if (page.image) ids.add(page.image); });
  return [...ids];
}
