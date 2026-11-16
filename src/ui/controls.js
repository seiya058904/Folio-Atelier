// Form controls for the studio. Each builder returns an element and calls
// back with the new value; none of them know about books or the store.

import { h } from "./dom.js";

let controlCount = 0;
const nextId = (prefix) => `${prefix}-${(controlCount += 1)}`;

export function group(title, hint, ...children) {
  return h("section", { class: "group" },
    h("div", { class: "group__head" }, h("h3", { class: "group__title", text: title })),
    hint ? h("p", { class: "group__hint", text: hint }) : null,
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
    placeholder,
    maxLength,
    autocomplete: "off",
    spellcheck: false,
    oninput: (event) => onInput(event.target.value)
  });
  return h("div", { class: "field" },
    h("label", { class: "field__label", for: id, text: label }),
    input
  );
}

export function textArea({ label, value = "", placeholder = "", tall = false, onInput }) {
  const id = nextId("area");
  return h("div", { class: "field" },
    h("label", { class: "field__label", for: id, text: label }),
    h("textarea", {
      id,
      class: `field__textarea${tall ? " field__textarea--tall" : ""}`,
      placeholder,
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
      h("label", { class: "field__label", for: id, text: label }),
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

export function select({ label, value, options, onChange }) {
  const id = nextId("select");
  const element = h("select", {
    id,
    class: "field__select",
    onchange: (event) => onChange(event.target.value)
  }, options.map((option) => h("option", { value: option.id, text: option.label, selected: option.id === value })));
  return h("div", { class: "field" },
    h("label", { class: "field__label", for: id, text: label }),
    element
  );
}

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
    text: option.label,
    title: option.label
  }));
  const container = h("div", { class: "segmented", role: "radiogroup", "aria-label": label }, buttons);
  radioGroup(container, buttons, value, onChange);
  return h("div", { class: "field" },
    label ? h("span", { class: "field__label", text: label }) : null,
    container
  );
}

export function toggle({ label, value, onChange }) {
  return h("label", { class: "toggle" },
    h("span", { class: "field__label", text: label }),
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
    title: item.label,
    "aria-label": item.label,
    dataset: { value: item.value },
    style: { "--swatch": item.color }
  }));
  buttons.forEach((button, index) => button.style.setProperty("--swatch", items[index].color));
  const picker = custom ? h("label", { class: "swatch swatch--custom", title: "Custom colour" },
    h("span", { class: "sr-only", text: `${label}: custom colour` }),
    h("input", {
      type: "color",
      value: /^#[0-9a-f]{6}$/i.test(value) ? value : "#888888",
      oninput: (event) => {
        mark("");
        onInput(event.target.value, true);
      }
    })
  ) : null;
  const container = h("div", { class: "swatches", role: "radiogroup", "aria-label": label }, buttons, picker);
  const mark = radioGroup(container, buttons, value, (next) => onInput(next, false));
  return h("div", { class: "field" },
    h("span", { class: "field__label", text: label }),
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
    title: option.note || option.label,
    dataset: { value: option.id }
  }, render(option), h("span", { text: option.label })));
  const container = h("div", { class: `tiles ${className}`.trim(), role: "radiogroup", "aria-label": label }, buttons);
  radioGroup(container, buttons, value, onChange);
  return container;
}
