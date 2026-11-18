// Tiny DOM helpers shared by the interface modules.

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Create an element. `props` may hold attributes, `class`, `text`, `dataset`,
 * `style` (object) and `on*` listeners. Children may be nodes, strings or
 * nested arrays; null / false children are skipped.
 */
export function h(tag, props = {}, ...children) {
  const element = document.createElement(tag);
  Object.entries(props || {}).forEach(([key, value]) => {
    if (value === null || value === undefined || value === false) return;
    if (key === "class") element.className = value;
    else if (key === "text") element.textContent = value;
    else if (key === "dataset") Object.assign(element.dataset, value);
    else if (key === "style") Object.assign(element.style, value);
    else if (key.startsWith("on") && typeof value === "function") {
      element.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key in element && key !== "list" && key !== "form") {
      try { element[key] = value; } catch (error) { element.setAttribute(key, value); }
    } else {
      element.setAttribute(key, value === true ? "" : value);
    }
  });
  append(element, children);
  return element;
}

function append(parent, children) {
  children.forEach((child) => {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) append(parent, child);
    else parent.append(child);
  });
}

/** Inline stroke icon from one or more path strings on a 16 px grid. */
export function icon(paths, className = "") {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  if (className) svg.setAttribute("class", className);
  [].concat(paths).forEach((d) => {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    svg.append(path);
  });
  return svg;
}

export const ICONS = {
  chevron: "m6 3.5 4.5 4.5L6 12.5",
  up: "M8 12.5v-9M4.5 7 8 3.5 11.5 7",
  down: "M8 3.5v9M4.5 9 8 12.5 11.5 9",
  copy: ["M5.5 5.5h7v7h-7z", "M10.5 5.5v-2h-7v7h2"],
  trash: ["M3.5 4.5h9", "M6.5 4.5v-1.5h3v1.5", "M4.7 4.5l.6 8h5.4l.6-8"],
  plus: "M8 3v10M3 8h10"
};

let toastTimer = 0;

export function toast(message, duration = 2600) {
  const element = document.querySelector("#toast");
  if (!element) return;
  element.hidden = true;
  element.classList.remove("is-leaving");
  // Restart the entry animation for back-to-back messages.
  void element.offsetWidth;
  element.textContent = message;
  element.hidden = false;
  clearTimeout(toastTimer);
  // It fades away rather than vanishing.
  toastTimer = setTimeout(() => {
    element.classList.add("is-leaving");
    toastTimer = setTimeout(() => {
      element.hidden = true;
      element.classList.remove("is-leaving");
    }, 220);
  }, duration);
}

/** Promise-based confirmation using the shared <dialog>. */
export function confirmDialog({ title, text, accept }) {
  const dialog = document.querySelector("#confirm-dialog");
  dialog.querySelector("#confirm-title").textContent = title;
  dialog.querySelector("#confirm-text").textContent = text;
  dialog.querySelector("#confirm-accept").textContent = accept;
  return new Promise((resolve) => {
    dialog.returnValue = "cancel";
    dialog.addEventListener("close", () => resolve(dialog.returnValue === "confirm"), { once: true });
    dialog.showModal();
  });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = h("a", { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function pickFile(input) {
  return new Promise((resolve) => {
    input.value = "";
    const done = () => {
      input.removeEventListener("change", done);
      input.removeEventListener("cancel", done);
      resolve(input.files?.[0] || null);
    };
    input.addEventListener("change", done);
    input.addEventListener("cancel", done);
    input.click();
  });
}

/**
 * A full-screen pause for something the reader must deal with before going on
 * (another tab owns the library, the database is waiting on an old tab).
 * Returns a function that lifts it again.
 */
export function interrupt({ title, text, action = null, onAction = null }) {
  const element = document.querySelector("#interrupt");
  if (!element) return () => {};
  element.querySelector("#interrupt-title").textContent = title;
  element.querySelector("#interrupt-text").textContent = text;
  const button = element.querySelector("#interrupt-action");
  button.hidden = !action;
  button.textContent = action || "";
  button.onclick = onAction;
  element.classList.remove("is-leaving");
  element.hidden = false;
  if (action) button.focus({ preventScroll: true });
  return () => {
    if (element.hidden) return;
    element.classList.add("is-leaving");
    setTimeout(() => {
      element.hidden = true;
      element.classList.remove("is-leaving");
    }, 320);
  };
}

/*
 * Notices: quiet, lasting lines on the shelf for things that stay true until
 * the reader acts (books not being saved, a backup worth making). One shows at
 * a time; a more urgent one takes the place of a quieter one.
 */
const notices = new Map(); // key -> { text, tone, actions, rank }
const NOTICE_RANK = { error: 2, warn: 1, quiet: 0 };

function renderNotice() {
  const element = document.querySelector("#notice");
  if (!element) return;
  const top = [...notices.entries()].sort((a, b) => b[1].rank - a[1].rank)[0];
  if (!top) {
    if (element.hidden || element.classList.contains("is-leaving")) return;
    element.classList.add("is-leaving");
    clearTimeout(renderNotice.timer);
    renderNotice.timer = setTimeout(() => {
      element.hidden = true;
      element.classList.remove("is-leaving");
    }, 220);
    return;
  }
  clearTimeout(renderNotice.timer);
  const [key, entry] = top;
  element.classList.remove("is-leaving");
  element.dataset.tone = entry.tone;
  element.dataset.key = key;
  element.replaceChildren(
    h("span", { class: "notice__dot", "aria-hidden": "true" }),
    h("span", { class: "notice__text", text: entry.text }),
    ...entry.actions.map((item) => h("button", {
      class: "notice__action",
      type: "button",
      text: item.label,
      onclick: item.onClick
    }))
  );
  element.hidden = false;
}

export function notice(key, { text, tone = "quiet", actions = [] }) {
  notices.set(key, { text, tone, actions, rank: NOTICE_RANK[tone] ?? 0 });
  renderNotice();
}

export function clearNotice(key) {
  if (notices.delete(key)) renderNotice();
}
