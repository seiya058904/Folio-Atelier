// Canvas typesetting: tokenising (Latin words + CJK characters), line
// breaking, tracking, justification and auto-fitting display text.

const CJK = /[⺀-鿿豈-﫿＀-￯　-〿]/;
// Punctuation that must not start a line (kinsoku) – kept with the previous token.
const NO_LINE_START = /^[,.;:!?%)\]}»”’、。，．；：！？）】》」』…—]/;

export const isCjk = (text) => CJK.test(text || "");

/** Split into breakable tokens. `space` marks a token preceded by whitespace. */
export function tokenize(text) {
  const tokens = [];
  let space = false;
  let word = "";
  const flush = () => {
    if (!word) return;
    tokens.push({ text: word, space });
    word = "";
    space = false;
  };
  for (const char of text) {
    if (/\s/.test(char)) {
      flush();
      space = true;
    } else if (CJK.test(char)) {
      flush();
      if (NO_LINE_START.test(char) && tokens.length) {
        tokens[tokens.length - 1].text += char;
      } else {
        tokens.push({ text: char, space });
      }
      space = false;
    } else {
      word += char;
    }
  }
  flush();
  return tokens;
}

export function setTracking(ctx, em, pixelSize) {
  const value = `${((em || 0) * pixelSize).toFixed(2)}px`;
  // Not every engine implements letterSpacing; unsupported ones just ignore it.
  ctx.letterSpacing = value;
}

/**
 * Break one paragraph into lines no wider than `maxWidth`.
 * Returns `[{ tokens, width, last }]` where `last` marks a paragraph's final line.
 */
export function breakParagraph(ctx, paragraph, maxWidth) {
  const tokens = tokenize(paragraph);
  const spaceWidth = ctx.measureText(" ").width;
  const lines = [];
  let current = [];
  let width = 0;
  tokens.forEach((token) => {
    const tokenWidth = ctx.measureText(token.text).width;
    const gap = current.length && token.space ? spaceWidth : 0;
    if (current.length && width + gap + tokenWidth > maxWidth) {
      lines.push({ tokens: current, width, last: false });
      current = [];
      width = 0;
    }
    const lead = current.length && token.space ? spaceWidth : 0;
    current.push({ ...token, width: tokenWidth, lead });
    width += lead + tokenWidth;
  });
  lines.push({ tokens: current, width, last: true });
  return lines;
}

/** Break text with explicit newlines into lines. */
export function breakText(ctx, text, maxWidth) {
  return String(text)
    .split(/\n/)
    .flatMap((paragraph) => breakParagraph(ctx, paragraph, maxWidth));
}

export const lineString = (line) => line.tokens
  .map((token, index) => (index && token.lead ? " " : "") + token.text)
  .join("");

/** Draw one broken line. `justify` stretches gaps to fill `maxWidth`. */
export function drawLine(ctx, line, x, y, { align = "left", maxWidth = 0, justify = false } = {}) {
  if (!line.tokens.length) return;
  const stretch = justify && !line.last && line.tokens.length > 1 && line.width > maxWidth * 0.72;
  if (!stretch) {
    ctx.textAlign = align;
    ctx.fillText(lineString(line), x, y);
    return;
  }
  const extra = (maxWidth - line.width) / (line.tokens.length - 1);
  let cursor = x;
  ctx.textAlign = "left";
  line.tokens.forEach((token, index) => {
    if (index) cursor += token.lead + extra;
    ctx.fillText(token.text, cursor, y);
    cursor += token.width;
  });
}

/**
 * Fit display text into a box by reducing its size until it needs no more
 * than `maxLines` lines and no single token overflows.
 * `setFont(size)` must apply the font for a given pixel size.
 */
export function fitDisplayText(ctx, text, { size, maxWidth, maxLines = 3, minScale = 0.42, setFont }) {
  let current = size;
  let lines = [];
  for (let attempt = 0; attempt < 14; attempt += 1) {
    setFont(current);
    lines = breakText(ctx, text, maxWidth);
    const overflow = lines.some((line) => line.width > maxWidth + 0.5);
    if (!overflow && lines.length <= maxLines) break;
    if (current <= size * minScale) break;
    current = Math.max(size * minScale, current * 0.92);
  }
  return { size: current, lines };
}
