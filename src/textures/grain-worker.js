// Paints a board's grain off the main thread (see `prefetchGrain` in
// surface.js) and returns it as a bitmap. The canvases are kept in main
// memory (`willReadFrequently`), like the boards they are copied onto.

import { paintGrain } from "./grain.js";

const sheet = (width, height) => new OffscreenCanvas(width, height).getContext("2d", { willReadFrequently: true });

self.onmessage = ({ data }) => {
  const { key, pixelWidth, pixelHeight, width, height, kind, thread, seed, spine, flip } = data;
  try {
    const canvas = new OffscreenCanvas(pixelWidth, pixelHeight);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.setTransform(pixelWidth / width, 0, 0, pixelHeight / height, 0, 0);
    paintGrain(ctx, width, height, kind, thread, seed, spine, flip, sheet);
    const bitmap = canvas.transferToImageBitmap();
    self.postMessage({ key, bitmap }, [bitmap]);
  } catch {
    self.postMessage({ key, bitmap: null });
  }
};
