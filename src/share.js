// Sharing without dependencies: an animated GIF encoder (median-cut palette,
// LZW) for turntables, and a minimal PDF writer that places one JPEG per page.

/* ---------- GIF ---------- */

/** Build a palette of up to 256 colours from sampled pixels (median cut). */
function medianCut(samples, size = 256) {
  let boxes = [samples];
  while (boxes.length < size) {
    // Split the box with the widest channel range.
    let best = -1;
    let bestRange = -1;
    let bestChannel = 0;
    boxes.forEach((box, index) => {
      if (box.length < 2) return;
      for (let channel = 0; channel < 3; channel += 1) {
        let min = 255;
        let max = 0;
        for (let i = 0; i < box.length; i += 1) {
          const value = (box[i] >> (16 - channel * 8)) & 255;
          if (value < min) min = value;
          if (value > max) max = value;
        }
        if (max - min > bestRange) {
          bestRange = max - min;
          best = index;
          bestChannel = channel;
        }
      }
    });
    if (best < 0 || bestRange <= 0) break;
    const box = boxes[best];
    const shift = 16 - bestChannel * 8;
    box.sort((a, b) => ((a >> shift) & 255) - ((b >> shift) & 255));
    const middle = box.length >> 1;
    boxes.splice(best, 1, box.slice(0, middle), box.slice(middle));
  }
  return boxes.map((box) => {
    let r = 0;
    let g = 0;
    let b = 0;
    box.forEach((colour) => {
      r += (colour >> 16) & 255;
      g += (colour >> 8) & 255;
      b += colour & 255;
    });
    const n = Math.max(1, box.length);
    return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
  });
}

/** Nearest palette entry, cached per 5-bit colour cell. */
function paletteMapper(palette) {
  const cache = new Int16Array(32768).fill(-1);
  return (r, g, b) => {
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    let index = cache[key];
    if (index >= 0) return index;
    let best = Infinity;
    for (let i = 0; i < palette.length; i += 1) {
      const [pr, pg, pb] = palette[i];
      const distance = (pr - r) * (pr - r) * 2 + (pg - g) * (pg - g) * 4 + (pb - b) * (pb - b) * 3;
      if (distance < best) {
        best = distance;
        index = i;
      }
    }
    cache[key] = index;
    return index;
  };
}

/** GIF-flavoured LZW for one frame of palette indices. */
function lzw(indices, minCodeSize) {
  const out = [];
  let buffer = 0;
  let bits = 0;
  const clear = 1 << minCodeSize;
  const end = clear + 1;
  let codeSize = minCodeSize + 1;
  let next = end + 1;
  let table = new Map();
  const emit = (code) => {
    buffer |= code << bits;
    bits += codeSize;
    while (bits >= 8) {
      out.push(buffer & 255);
      buffer >>>= 8;
      bits -= 8;
    }
  };
  emit(clear);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i += 1) {
    const value = indices[i];
    const key = prefix * 256 + value;
    const found = table.get(key);
    if (found !== undefined) {
      prefix = found;
      continue;
    }
    emit(prefix);
    if (next < 4096) {
      table.set(key, next);
      next += 1;
      if (next > (1 << codeSize) && codeSize < 12) codeSize += 1;
    } else {
      emit(clear);
      table = new Map();
      codeSize = minCodeSize + 1;
      next = end + 1;
    }
    prefix = value;
  }
  emit(prefix);
  emit(end);
  if (bits > 0) out.push(buffer & 255);
  return out;
}

/**
 * Encode RGBA frames (ImageData-like: { data, width, height }) as a looping
 * GIF. `delay` is in hundredths of a second.
 */
export function encodeGif(frames, { delay = 6 } = {}) {
  const { width, height } = frames[0];
  // One palette for the whole loop, from a sample of every frame.
  const samples = [];
  frames.forEach((frame) => {
    const data = frame.data;
    for (let i = 0; i < data.length; i += 4 * 7) samples.push((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
  });
  const palette = medianCut(samples, 256);
  while (palette.length < 256) palette.push([0, 0, 0]);
  const nearest = paletteMapper(palette);

  const bytes = [];
  const word = (value) => bytes.push(value & 255, (value >> 8) & 255);
  bytes.push(...[..."GIF89a"].map((c) => c.charCodeAt(0)));
  word(width);
  word(height);
  bytes.push(0xf7, 0, 0); // global colour table of 256 entries
  palette.forEach(([r, g, b]) => bytes.push(r, g, b));
  // Loop for ever.
  bytes.push(0x21, 0xff, 0x0b, ...[..."NETSCAPE2.0"].map((c) => c.charCodeAt(0)), 3, 1, 0, 0, 0);

  frames.forEach((frame) => {
    const data = frame.data;
    const indices = new Uint8Array(width * height);
    for (let p = 0, i = 0; p < indices.length; p += 1, i += 4) indices[p] = nearest(data[i], data[i + 1], data[i + 2]);
    bytes.push(0x21, 0xf9, 4, 0x04);
    word(delay);
    bytes.push(0, 0);
    bytes.push(0x2c);
    word(0);
    word(0);
    word(width);
    word(height);
    bytes.push(0);
    bytes.push(8);
    const data8 = lzw(indices, 8);
    for (let i = 0; i < data8.length; i += 255) {
      const chunk = data8.slice(i, i + 255);
      bytes.push(chunk.length, ...chunk);
    }
    bytes.push(0);
  });
  bytes.push(0x3b);
  return new Blob([new Uint8Array(bytes)], { type: "image/gif" });
}

/* ---------- PDF ---------- */

/**
 * A PDF with one full-bleed JPEG per page. `pages` are
 * `{ jpeg: Uint8Array, width, height }` (pixels); `size` is the page size in
 * points.
 */
export function buildPdf(pages, { size = [420, 630], title = "Folio Atelier" } = {}) {
  const encoder = new TextEncoder();
  const parts = [];
  const offsets = [];
  let length = 0;
  const push = (chunk) => {
    const bytes = typeof chunk === "string" ? encoder.encode(chunk) : chunk;
    parts.push(bytes);
    length += bytes.length;
  };
  const object = (id, body, stream = null) => {
    offsets[id] = length;
    push(`${id} 0 obj\n${body}\n`);
    if (stream) {
      push("stream\n");
      push(stream);
      push("\nendstream\n");
    }
    push("endobj\n");
  };
  const ascii = (text) => text.replace(/[^\x20-\x7e]/g, "?").replace(/[()\\]/g, "\\$&");

  push("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n");
  const [pageWidth, pageHeight] = size;
  const pageIds = pages.map((_, index) => 4 + index * 3);
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`);
  object(3, `<< /Title (${ascii(title)}) /Producer (Folio Atelier) >>`);
  pages.forEach((page, index) => {
    const pageId = pageIds[index];
    const imageId = pageId + 1;
    const contentId = pageId + 2;
    object(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im${index} ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    object(imageId, `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>`, page.jpeg);
    const draw = `q ${pageWidth} 0 0 ${pageHeight} 0 0 cm /Im${index} Do Q`;
    object(contentId, `<< /Length ${draw.length} >>`, encoder.encode(draw));
  });
  const count = 4 + pages.length * 3;
  const xref = length;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let id = 1; id < count; id += 1) push(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts, { type: "application/pdf" });
}
