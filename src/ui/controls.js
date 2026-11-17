// Form controls for the studio. Each builder returns an element and calls
// back with the new value; none of them know about books or the store.

import { t } from "../i18n.js";
import { h } from "./dom.js";

let controlCount = 0;
const nextId = (prefix) => `${prefix}-${(controlCount += 1)}`;

export function group(title, hint, ...children) {
  return h("section", { class: "group" },
    h("div", { class: "group__head" }, h("h3", { class: "group__title", text: t(title) })),
    hint ? h("p", { class: "group__hint", text: t(hint) }) : null,
    h("div", { class: "stack" }, children)
  );
}

export const row = (...children) => h("div", { class: "row" }, children);

export function textField({ label, value = "", placeholder = "", display = false, maxLength = 120, onInput }) {
  const id = nextId("text");
  const input = h("input", {
    id,
    class: `field__input${display ? " field__input--display" : ""}`,
    type: "text",
    value,
    placeholder: t(placeholder),
    maxLength,
    autocomplete: "off",
    spellcheck: false,
    oninput: (event) => onInput(event.target.value)
  });
  return h("div", { class: "field" },
    h("label", { class: "field__label", for: id, text: t(label) }),
    input
  );
}

export function textArea({ label, value = "", placeholder = "", tall = false, onInput }) {
  const id = nextId("area");
  return h("div", { class: "field" },
    h("label", { class: "field__label", for: id, text: t(label) }),
    h("textarea", {
      id,
      class: `field__textarea${tall ? " field__textarea--tall" : ""}`,
      placeholder: t(placeholder),
      value,
      oninput: (event) => onInput(event.target.value)
    })
  );
}

export function slider({ label, value, min, max, step = 0.01, format = (v) => v, onInput }) {
  const id = nextId("range");
  const output = h("span", { class: "field__value", text: format(value) });
  return h("div", { class: "field" },
    h("div", { class: "field__head" },
      h("label", { class: "field__label", for: id, text: t(label) }),
      output
    ),
    h("input", {
      id,
      class: "range",
      type: "range",
      min,
      max,
      step,
      value,
      oninput: (event) => {
        const next = Number(event.target.value);
        output.textContent = format(next);
        onInput(next);
      }
    })
  );
}

/* ----- select: a button and a popover list in the panel's own style ----- */

// One list is open at a time; opening another closes it.
let openSelect = null;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

/**
 * A select-only combobox (WAI-ARIA pattern): the button keeps focus and
 * points at the active option. `preview(option)` may return a small node
 * shown before each option (a swatch, a glyph); `face(option)` a CSS font
 * stack to set the option's name in.
 */
export function select({ label, value, options, onChange, preview = null, face = null }) {
  const id = nextId("select");
  const listId = `${id}-list`;
  const labelId = `${id}-label`;
  let current = String(value);
  const indexOf = (key) => Math.max(0, options.findIndex((option) => String(option.id) === key));

  const text = h("span", { class: "select__text" });
  const button = h("button", {
    id,
    type: "button",
    class: "field__select select",
    role: "combobox",
    "aria-haspopup": "listbox",
    "aria-expanded": "false",
    "aria-controls": listId,
    "aria-labelledby": `${labelId} ${id}`
  }, text);
  const showValue = () => {
    const option = options[indexOf(current)];
    text.textContent = option ? t(option.label) : "";
    text.style.fontFamily = option && face ? face(option) : "";
  };
  showValue();

  let list = null;
  let items = [];
  let active = -1;
  let typed = "";
  let typedAt = 0;

  function setActive(index, scroll = true) {
    if (!items.length) return;
    active = Math.max(0, Math.min(items.length - 1, index));
    items.forEach((item, itemIndex) => item.classList.toggle("is-active", itemIndex === active));
    button.setAttribute("aria-activedescendant", items[active].id);
    if (scroll) items[active].scrollIntoView({ block: "nearest" });
  }

  function place() {
    const box = button.getBoundingClientRect();
    const width = Math.min(Math.max(box.width, 220), innerWidth - 16);
    const below = innerHeight - box.bottom - 12;
    const above = box.top - 12;
    const wanted = Math.min(list.scrollHeight, 340);
    const downward = below >= Math.min(wanted, 220) || below >= above;
    const height = Math.max(120, Math.min(340, downward ? below : above));
    list.style.width = `${width}px`;
    list.style.maxHeight = `${height}px`;
    list.style.left = `${Math.max(8, Math.min(box.left, innerWidth - width - 8))}px`;
    list.style.top = downward ? `${box.bottom + 6}px` : `${box.top - 6 - Math.min(wanted, height)}px`;
    list.dataset.side = downward ? "below" : "above";
  }

  function open() {
    if (list) return;
    openSelect?.close();
    items = options.map((option, index) => h("div", {
      id: `${id}-option-${index}`,
      class: "select__option",
      role: "option",
      "aria-selected": String(String(option.id) === current),
      dataset: { index: String(index) }
    },
      preview ? h("span", { class: "select__preview", "aria-hidden": "true" }, preview(option)) : null,
      h("span", { class: "select__name", text: t(option.label), style: face ? { fontFamily: face(option) } : null })
    ));
    list = h("div", { id: listId, class: "select__list", role: "listbox", "aria-labelledby": labelId }, items);
    list.addEventListener("pointermove", (event) => {
      const item = event.target.closest(".select__option");
      if (item) setActive(Number(item.dataset.index), false);
    });
    list.addEventListener("click", (event) => {
      const item = event.target.closest(".select__option");
      if (item) choose(Number(item.dataset.index));
    });
    // Keep the focus on the button while the pointer works the list.
    list.addEventListener("pointerdown", (event) => event.preventDefault());
    document.body.append(list);
    place();
    setActive(indexOf(current));
    button.setAttribute("aria-expanded", "true");
    button.classList.add("is-open");
    openSelect = { close, owner: button, list };
    requestAnimationFrame(() => list?.classList.add("is-open"));
  }

  function close() {
    if (!list) return;
    const closing = list;
    list = null;
    items = [];
    if (openSelect?.list === closing) openSelect = null;
    button.setAttribute("aria-expanded", "false");
    button.removeAttribute("aria-activedescendant");
    button.classList.remove("is-open");
    closing.classList.remove("is-open");
    if (reducedMotion.matches) closing.remove();
    else setTimeout(() => closing.remove(), 180);
  }

  function choose(index) {
    const option = options[index];
    close();
    button.focus({ preventScroll: true });
    if (!option || String(option.id) === current) return;
    current = String(option.id);
    showValue();
    onChange(current);
  }

  button.addEventListener("click", () => (list ? close() : open()));
  button.addEventListener("blur", () => close());
  button.addEventListener("keydown", (event) => {
    const key = event.key;
    let handled = true;
    if (!list) {
      if (key === "ArrowDown" || key === "ArrowUp" || key === "Enter" || key === " ") open();
      else handled = false;
    } else if (key === "ArrowDown") setActive(active + 1);
    else if (key === "ArrowUp") setActive(active - 1);
    else if (key === "Home") setActive(0);
    else if (key === "End") setActive(items.length - 1);
    else if (key === "PageDown") setActive(active + 8);
    else if (key === "PageUp") setActive(active - 8);
    else if (key === "Enter" || key === " ") choose(active);
    else if (key === "Escape") close();
    else if (key === "Tab") {
      choose(active);
      handled = false;
    } else handled = false;
    // Type to jump to an option, as in a native select.
    if (!handled && key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const now = performance.now();
      typed = now - typedAt < 700 ? typed + key.toLowerCase() : key.toLowerCase();
      typedAt = now;
      const start = list ? active + (typed.length === 1 ? 1 : 0) : indexOf(current) + 1;
      const order = options.map((_, index) => (start + index) % options.length);
      const match = order.find((index) => t(options[index].label).toLowerCase().startsWith(typed));
      if (match !== undefined) {
        if (list) setActive(match);
        else {
          current = String(options[match].id);
          showValue();
          onChange(current);
        }
      }
      handled = true;
    }
    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  });

  return h("div", { class: "field" },
    h("label", { class: "field__label", id: labelId, for: id, text: t(label) }),
    button
  );
}

// An open list follows nothing: a scroll elsewhere, a resize or a press
// outside closes it.
document.addEventListener("pointerdown", (event) => {
  if (!openSelect) return;
  if (openSelect.list.contains(event.target) || openSelect.owner.contains(event.target)) return;
  openSelect.close();
}, true);
document.addEventListener("scroll", (event) => {
  if (openSelect && !openSelect.list.contains(event.target)) openSelect.close();
}, true);
window.addEventListener("resize", () => openSelect?.close());

function radioGroup(container, buttons, value, onChange) {
  const mark = (current) => buttons.forEach((button) => {
    const checked = button.dataset.value === String(current);
    button.setAttribute("aria-checked", String(checked));
    button.tabIndex = checked ? 0 : -1;
  });
  mark(value);
  if (!buttons.some((button) => button.tabIndex === 0) && buttons[0]) buttons[0].tabIndex = 0;
  container.addEventListener("click", (event) => {
    const button = event.target.closest("[role='radio']");
    if (!button || !container.contains(button)) return;
    mark(button.dataset.value);
    onChange(button.dataset.value);
  });
  container.addEventListener("keydown", (event) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    const index = buttons.indexOf(document.activeElement);
    if (index < 0) return;
    event.preventDefault();
    const next = buttons[(index + step + buttons.length) % buttons.length];
    next.focus();
    next.click();
  });
  return mark;
}

export function segmented({ label, value, options, onChange }) {
  const buttons = options.map((option) => h("button", {
    type: "button",
    role: "radio",
    dataset: { value: option.id },
    text: t(option.label),
    title: t(option.note || option.label)
  }));
  // The chosen segment is marked by one pill that slides between them.
  const indicator = h("span", { class: "segmented__indicator", "aria-hidden": "true" });
  const container = h("div", { class: "segmented", role: "radiogroup", "aria-label": t(label) }, indicator, buttons);
  const place = () => {
    const chosen = buttons.find((button) => button.getAttribute("aria-checked") === "true");
    if (!chosen || !chosen.offsetWidth) return;
    container.style.setProperty("--seg-x", `${chosen.offsetLeft}px`);
    container.style.setProperty("--seg-w", `${chosen.offsetWidth}px`);
    if (!container.classList.contains("has-indicator")) {
      container.classList.add("has-indicator");
      requestAnimationFrame(() => container.classList.add("is-placed"));
    }
  };
  radioGroup(container, buttons, value, (next) => {
    requestAnimationFrame(place);
    onChange(next);
  });
  // Measured once laid out (and again whenever its width changes).
  new ResizeObserver(place).observe(container);
  return h("div", { class: "field" },
    label ? h("span", { class: "field__label", text: t(label) }) : null,
    container
  );
}

export function toggle({ label, value, onChange }) {
  return h("label", { class: "toggle" },
    h("span", { class: "field__label", text: t(label) }),
    h("input", { type: "checkbox", checked: Boolean(value), onchange: (event) => onChange(event.target.checked) })
  );
}

/**
 * Colour picker: a row of curated swatches plus a free colour input.
 * `swatches` is a list of hex strings or `{ color, label, value }` (where
 * `value` is what gets reported instead of the colour, e.g. a foil id).
 */
export function colorField({ label, value, swatches = [], metal = false, custom = true, onInput }) {
  const items = swatches.map((swatch) => (typeof swatch === "string" ? { color: swatch, label: swatch, value: swatch } : swatch));
  const buttons = items.map((item) => h("button", {
    type: "button",
    role: "radio",
    class: `swatch${metal || item.metal ? " swatch--metal" : ""}`,
    title: t(item.label),
    "aria-label": t(item.label),
    dataset: { value: item.value },
    style: { "--swatch": item.color }
  }));
  buttons.forEach((button, index) => button.style.setProperty("--swatch", items[index].color));
  const picker = custom ? h("label", { class: "swatch swatch--custom", title: t("Custom colour") },
    h("span", { class: "sr-only", text: `${t(label)}: ${t("Custom colour")}` }),
    h("input", {
      type: "color",
      value: /^#[0-9a-f]{6}$/i.test(value) ? value : "#888888",
      oninput: (event) => {
        mark("");
        onInput(event.target.value, true);
      }
    })
  ) : null;
  const container = h("div", { class: "swatches", role: "radiogroup", "aria-label": t(label) }, buttons, picker);
  const mark = radioGroup(container, buttons, value, (next) => onInput(next, false));
  return h("div", { class: "field" },
    h("span", { class: "field__label", text: t(label) }),
    container
  );
}

/**
 * A grid of picture tiles. `render(option)` returns the art element shown
 * above the label (a canvas, usually).
 */
export function tiles({ label, value, options, render, className = "", onChange }) {
  const buttons = options.map((option) => h("button", {
    type: "button",
    role: "radio",
    class: "tile",
    title: t(option.note || option.label),
    dataset: { value: option.id }
  }, render(option), h("span", { text: t(option.label) })));
  const container = h("div", { class: `tiles ${className}`.trim(), role: "radiogroup", "aria-label": t(label) }, buttons);
  radioGroup(container, buttons, value, onChange);
  return container;
}
