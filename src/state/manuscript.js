// A manuscript (.txt or .md) turned into pages: headings start parts and
// chapters, everything else flows into their text. Pure: no DOM, no store.

const CJK = /[　-〿㐀-鿿豈-﫿＀-￯]/;
const INDENT = /^(　|\t| {2,})/;

// Plain-text headings: a short line on its own that reads like one.
const PART_LINE = /^(part|book)\s+[\wⅠ-ⅿ]+\b.{0,60}$|^第[\s\d一二三四五六七八九十百千零〇两]+[卷部篇集](\s.*|[:：].*)?$/i;
const CHAPTER_LINE = new RegExp([
  /^(chapter|section)\s+[\wⅠ-ⅿ]+\b.{0,60}$/.source,
  /^第[\s\d一二三四五六七八九十百千零〇两]+[章回节](\s.*|[:：].*)?$/.source,
  /^(prologue|epilogue|preface|foreword|introduction|afterword|interlude)\b.{0,50}$/.source,
  /^(序|序言|序章|前言|楔子|引子|尾声|后记|跋)(\s.*|[:：].*)?$/.source,
  /^[IVXLC]{1,7}\.?$/.source
].join("|"), "i");

/** Join a paragraph's wrapped lines: with a space between Latin words, none in CJK. */
function joinLines(lines) {
  return lines.reduce((text, line) => {
    if (!text) return line;
    const glue = CJK.test(text.slice(-1)) || CJK.test(line[0]) ? "" : " ";
    return text + glue + line;
  }, "");
}

/** Markdown inline marks to plain words. */
function plain(line) {
  return line
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(^|[^\w*])\*(?!\s)([^*]+?)\*(?!\w)/g, "$1$2")
    .replace(/(^|\W)_(?!\s)([^_]+?)_(?!\w)/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s{0,3}>\s?/, "")
    .replace(/^\s*[-*+]\s+/, "• ")
    .replace(/\\([\\`*_{}[\]()#+\-.!])/g, "$1");
}

const isBreak = (line) => /^\s*((\*\s*){3,}|(-\s*){3,}|(_\s*){3,}|[–—]{3,})\s*$/.test(line);

/**
 * How a file breaks its paragraphs, decided once for the whole text:
 * "indent"  a paragraph starts at an indented line (full-width spaces, tabs);
 * "wrapped" lines are wrapped at a width and paragraphs end at blank lines;
 * "lines"   every line is a paragraph (common in Chinese text files).
 * Markdown is "wrapped" (soft line breaks), with list and quote items apart.
 */
function lineStyle(lines, markdown) {
  if (markdown) return "wrapped";
  const filled = lines.filter((line) => line.trim());
  if (!filled.length) return "lines";
  const indented = filled.filter((line) => INDENT.test(line)).length;
  if (indented / filled.length > 0.3) return "indent";
  const width = (line) => [...line.trim()].reduce((sum, char) => sum + (CJK.test(char) ? 2 : 1), 0);
  const sorted = filled.map(width).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  let followed = 0;
  lines.forEach((line, index) => {
    if (line.trim() && lines[index + 1]?.trim()) followed += 1;
  });
  return median >= 50 && followed / filled.length > 0.35 ? "wrapped" : "lines";
}

/** Split the body of a section into paragraphs, joined by blank lines. */
function paragraphs(lines, style, markdown) {
  const out = [];
  let current = [];
  const flush = () => {
    if (current.length) out.push(joinLines(current));
    current = [];
  };
  lines.forEach((raw) => {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) {
      flush();
      return;
    }
    if (isBreak(line)) {
      flush();
      out.push("***");
      return;
    }
    const item = markdown && /^\s*([-*+]|\d+[.)]|>)\s+/.test(line);
    const text = (markdown ? plain(line) : line).replace(/^[　\s]+/, "");
    if (!text) return;
    // A Latin line that carries on a sentence (no closing mark before it,
    // lower case after) is a wrapped line, whatever the file's habit.
    const carriesOn = !item && current.length && /^[a-z(]/.test(text) && !/[.!?:;"”’)\]]$/.test(current[current.length - 1]);
    if (carriesOn) {
      current.push(text);
    } else if (style === "lines" || item) {
      flush();
      current.push(text);
    } else if (style === "indent" && INDENT.test(line)) {
      flush();
      current.push(text);
    } else {
      current.push(text);
    }
  });
  flush();
  // No break at either end, and never two in a row.
  return out
    .filter((paragraph, index) => paragraph !== "***" || (index > 0 && index < out.length - 1 && out[index - 1] !== "***"))
    .join("\n\n");
}

/**
 * Parse a manuscript. Returns `{ sections, title }`: sections are
 * `{ kind: "part" | "chapter" | "body", title, text }` in reading order, and
 * `title` is the book title a Markdown file gave its first heading, if any.
 */
export function parseManuscript(source, { name = "", markdown = null } = {}) {
  const text = String(source || "").replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const lines = text.split("\n");
  const isMarkdown = markdown ?? (/\.(md|markdown)$/i.test(name) || /^#{1,6}\s+\S/m.test(text));
  const fallbackTitle = name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();

  // Find the headings: [line index, level, title].
  const headings = [];
  let fenced = false;
  lines.forEach((line, index) => {
    if (isMarkdown) {
      if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
      if (fenced) return;
      const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
      if (match) headings.push([index, match[1].length, plain(match[2]).trim()]);
      return;
    }
    const trimmed = line.trim();
    if (!trimmed || trimmed.length > 72) return;
    const before = index === 0 || !lines[index - 1].trim();
    const after = index === lines.length - 1 || !lines[index + 1].trim();
    if (!(before && after)) return;
    if (PART_LINE.test(trimmed)) headings.push([index, 1, trimmed]);
    else if (CHAPTER_LINE.test(trimmed)) headings.push([index, 2, trimmed]);
  });

  // Markdown: with two levels, the higher is a part and the next a chapter;
  // a lone top heading over chapters is the book's title.
  let title = "";
  let titleLine = -1;
  const levels = [...new Set(headings.map(([, level]) => level))].sort((a, b) => a - b);
  let partLevel = levels.length > 1 ? levels[0] : 0;
  let chapterLevel = levels.length > 1 ? levels[1] : levels[0];
  // (Also when it heads nothing itself: the next heading is another top one.)
  const lone = headings.filter(([, level]) => level === partLevel).length === 1;
  const headsNothing = headings[1]?.[1] === partLevel;
  if (isMarkdown && partLevel && headings[0][1] === partLevel && (lone || headsNothing)) {
    [titleLine, , title] = headings.shift();
    // Parts remain only if other top headings are left.
    if (!headings.some(([, level]) => level === partLevel)) partLevel = 0;
  }
  if (!isMarkdown) {
    partLevel = headings.some(([, level]) => level === 1) ? 1 : 0;
    chapterLevel = 2;
  }

  const sections = [];
  const style = lineStyle(lines, isMarkdown);
  const bodyOf = (from, to) => paragraphs(lines.slice(from, to), style, isMarkdown);
  const opening = bodyOf(titleLine + 1, headings.length ? headings[0][0] : lines.length);
  if (!headings.length) {
    if (opening) sections.push({ kind: "chapter", title: fallbackTitle, text: opening });
    return { sections, title };
  }
  if (opening) sections.push({ kind: "body", title: "", text: opening });
  headings.forEach(([index, level, heading], position) => {
    const end = position + 1 < headings.length ? headings[position + 1][0] : lines.length;
    const body = bodyOf(index + 1, end);
    if (partLevel && level === partLevel) {
      sections.push({ kind: "part", title: heading, text: body });
    } else if (level <= chapterLevel) {
      sections.push({ kind: "chapter", title: heading, text: body });
    } else {
      // A deeper heading stays in the text, on a line of its own.
      const previous = sections[sections.length - 1];
      if (previous) previous.text = [previous.text, heading, body].filter(Boolean).join("\n\n");
      else sections.push({ kind: "body", title: "", text: [heading, body].filter(Boolean).join("\n\n") });
    }
  });
  return { sections, title };
}
