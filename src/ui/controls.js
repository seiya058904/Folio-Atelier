// Form controls for the studio. Each builder returns an element and calls
// back with the new value; none of them know about books or the store.

import { t } from "../i18n.js";
import { hexToRgb, rgbToHex } from "../util.js";
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
  const labelId = `${id}-label`;
  const output = h("span", { class: "field__value", text: format(value) });
  const control = createSlider({ id, labelledBy: labelId, value, min, max, step, format, onInput: (next) => {
    output.textContent = format(next);
    onInput(next);
  } });
  return h("div", { class: "field" },
    h("div", { class: "field__head" },
      h("span", { class: "field__label", id: labelId, text: t(label) }),
      output
    ),
    control
  );
}

/**
 * The atelier's slider (no browser widget). Press anywhere on the track and
 * the thumb springs there; drag and it follows the finger; move the finger
 * away from the track while dragging and it slows for fine adjustment (a
 * half, then a quarter, as on a phone). The thumb grows and shows its value
 * while held. Arrow keys step, Shift steps ten, Home and End go to the ends.
 * `setValue(v)` on the element sets it as if dragged (used by the bench).
 */
export function createSlider({ id, labelledBy, label = "", value, min, max, step = 0.01, format = (v) => v, onInput, className = "" }) {
  const thumb = h("span", { class: "slider__thumb" }, h("span", { class: "slider__bubble", "aria-hidden": "true" }));
  const fill = h("span", { class: "slider__fill" });
  const root = h("div", {
    id,
    class: `slider ${className}`.trim(),
    role: "slider",
    tabindex: "0",
    "aria-valuemin": String(min),
    "aria-valuemax": String(max),
    "aria-labelledby": labelledBy || null,
    "aria-label": labelledBy ? null : t(label)
  }, h("span", { class: "slider__track" }, fill), thumb);
  const bubble = thumb.firstChild;
  const decimals = Math.max(0, (String(step).split(".")[1] || "").length);
  const snap = (next) => {
    const stepped = Math.round((next - min) / step) * step + min;
    return Number(Math.min(max, Math.max(min, stepped)).toFixed(decimals));
  };
  let current = snap(Number(value));

  function show() {
    const ratio = max > min ? (current - min) / (max - min) : 0;
    root.style.setProperty("--ratio", String(ratio));
    root.setAttribute("aria-valuenow", String(current));
    root.setAttribute("aria-valuetext", String(format(current)));
    bubble.textContent = format(current);
  }

  function set(next) {
    const snapped = snap(next);
    if (snapped === current) return;
    current = snapped;
    show();
    onInput(current);
  }
  show();

  root.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    root.focus({ preventScroll: true, focusVisible: false });
    root.setPointerCapture(event.pointerId);
    const box = root.getBoundingClientRect();
    const onThumb = Math.abs(event.clientX - thumb.getBoundingClientRect().left - thumb.offsetWidth / 2) < 14;
    // A press on the track: the thumb springs to it (the CSS eases --ratio).
    if (!onThumb) {
      root.classList.add("is-jumping");
      set(min + ((event.clientX - box.left) / box.width) * (max - min));
      setTimeout(() => root.classList.remove("is-jumping"), 260);
    }
    root.classList.add("is-held");
    let lastX = event.clientX;
    let exact = current;
    const move = (moveEvent) => {
      root.classList.remove("is-jumping");
      // Further from the track, finer: full speed, a half, a quarter.
      const away = Math.abs(moveEvent.clientY - (box.top + box.height / 2));
      const rate = away > 120 ? 0.25 : away > 60 ? 0.5 : 1;
      root.dataset.rate = String(rate);
      exact = Math.min(max, Math.max(min, exact + ((moveEvent.clientX - lastX) / box.width) * (max - min) * rate));
      lastX = moveEvent.clientX;
      set(exact);
    };
    const end = () => {
      root.classList.remove("is-held");
      delete root.dataset.rate;
      root.removeEventListener("pointermove", move);
      root.removeEventListener("pointerup", end);
      root.removeEventListener("pointercancel", end);
    };
    root.addEventListener("pointermove", move);
    root.addEventListener("pointerup", end);
    root.addEventListener("pointercancel", end);
  });

  root.addEventListener("keydown", (event) => {
    const big = (max - min) / 10;
    const by = {
      ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step,
      PageUp: big, PageDown: -big
    }[event.key];
    let next = null;
    if (by !== undefined) next = current + (event.shiftKey && Math.abs(by) === step ? by * 10 : by);
    else if (event.key === "Home") next = min;
    else if (event.key === "End") next = max;
    if (next === null) return;
    event.preventDefault();
    event.stopPropagation();
    set(next);
  });

  root.setValue = (next) => set(Number(next));
  root.min = min;
  root.max = max;
  return root;
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

  // As in a system menu: press, drag to an option, let go to choose it.
  // (Mouse only; a touch opens on tap and chooses on a second tap.)
  let pressed = null;
  button.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "mouse" || event.button !== 0 || list) return;
    pressed = { x: event.clientX, y: event.clientY, at: performance.now() };
    button.dataset.pressOpened = "1";
    open();
  });
  document.addEventListener("pointerup", (event) => {
    if (!pressed || event.pointerType !== "mouse") return;
    const press = pressed;
    pressed = null;
    const item = event.target.closest?.(".select__option");
    const dragged = Math.hypot(event.clientX - press.x, event.clientY - press.y) > 6 || performance.now() - press.at > 320;
    if (list && item && list.contains(item) && dragged) choose(Number(item.dataset.index));
  });
  button.addEventListener("click", (event) => {
    // The press already opened the list.
    if (event.detail && list && !pressed && openSelect?.owner === button && button.dataset.pressOpened === "1") {
      delete button.dataset.pressOpened;
      return;
    }
    list ? close() : open();
  });
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
  const input = h("input", { type: "checkbox", role: "switch", checked: Boolean(value), onchange: (event) => onChange(event.target.checked) });
  // The knob can be slid as well as tapped: a drag past a few pixels sets the
  // switch to the side it was slid towards.
  let slide = null;
  input.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    slide = { x: event.clientX, to: null };
    input.setPointerCapture(event.pointerId);
  });
  input.addEventListener("pointermove", (event) => {
    if (!slide) return;
    const dx = event.clientX - slide.x;
    if (Math.abs(dx) > 5) slide.to = dx > 0;
  });
  input.addEventListener("click", (event) => {
    const to = slide?.to;
    slide = null;
    if (to === null || to === undefined) return;
    // During the click the box already shows the toggled state. Slid towards
    // the side it is already on: cancel (it stays). Otherwise the toggle is
    // what was asked for.
    if (!input.checked !== to) return;
    event.preventDefault();
  });
  input.addEventListener("pointercancel", () => { slide = null; });
  return h("label", { class: "toggle" },
    h("span", { class: "field__label", text: t(label) }),
    input
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
  // The last swatch opens the atelier's own colour picker (no system dialog).
  let customColour = /^#[0-9a-f]{6}$/i.test(value) ? value : "#888888";
  const picker = custom ? h("button", {
    type: "button",
    class: "swatch swatch--custom",
    title: t("Custom colour"),
    "aria-label": `${t(label)}: ${t("Custom colour")}`,
    "aria-haspopup": "dialog",
    "aria-expanded": "false"
  }) : null;
  if (picker) {
    picker.setColour = (next) => {
      customColour = next;
      mark("");
      onInput(next, true);
    };
  }
  picker?.addEventListener("click", () => {
    openColourPicker(picker, customColour, (next) => {
      customColour = next;
      mark("");
      onInput(next, true);
    });
  });
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

/* ----- colour picker: a popover in the panel's own style ----- */

function hexToHsv(hex) {
  const [r, g, b] = hexToRgb(hex).map((value) => value / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let hue = 0;
  if (d) {
    if (max === r) hue = ((g - b) / d) % 6;
    else if (max === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  return { h: hue, s: max ? d / max : 0, v: max };
}

function hsvToHex({ h: hue, s, v }) {
  const c = v * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] = hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x]
    : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

let openPicker = null;

/**
 * Open the colour picker under `anchor`, starting from `value`. `onInput`
 * receives every colour as it is chosen (a drag streams them, like a slider).
 */
export function openColourPicker(anchor, value, onInput) {
  if (openPicker?.anchor === anchor) {
    openPicker.close();
    return;
  }
  openPicker?.close();
  openSelect?.close();
  const hsv = hexToHsv(value);
  let sent = value.toLowerCase();

  const fieldKnob = h("span", { class: "picker__knob" });
  const field = h("div", {
    class: "picker__field", tabindex: "0", role: "slider",
    "aria-label": t("Saturation and brightness"), "aria-valuemin": "0", "aria-valuemax": "100"
  }, fieldKnob);
  const hueKnob = h("span", { class: "picker__knob" });
  const hue = h("div", {
    class: "picker__hue", tabindex: "0", role: "slider",
    "aria-label": t("Hue"), "aria-valuemin": "0", "aria-valuemax": "360"
  }, hueKnob);
  const chip = h("span", { class: "picker__chip", "aria-hidden": "true" });
  const hex = h("input", {
    class: "picker__hex", type: "text", maxLength: 7, spellcheck: false, autocomplete: "off",
    "aria-label": t("Hex colour")
  });
  const dropper = "EyeDropper" in window ? h("button", {
    type: "button", class: "picker__dropper", title: t("Pick a colour from the screen"), "aria-label": t("Pick a colour from the screen")
  }, h("span", { "aria-hidden": "true" })) : null;
  const panel = h("div", { class: "picker", role: "dialog", "aria-label": t("Custom colour") },
    field, hue, h("div", { class: "picker__row" }, chip, hex, dropper));

  let frame = 0;
  function show({ typing = false } = {}) {
    const colour = hsvToHex(hsv);
    panel.style.setProperty("--hue", String(hsv.h));
    panel.style.setProperty("--colour", colour);
    fieldKnob.style.left = `${hsv.s * 100}%`;
    fieldKnob.style.top = `${(1 - hsv.v) * 100}%`;
    hueKnob.style.left = `${(hsv.h / 360) * 100}%`;
    field.setAttribute("aria-valuenow", String(Math.round(hsv.s * 100)));
    field.setAttribute("aria-valuetext", `${Math.round(hsv.s * 100)}%, ${Math.round(hsv.v * 100)}%`);
    hue.setAttribute("aria-valuenow", String(Math.round(hsv.h)));
    if (!typing) hex.value = colour;
    // One colour per frame however fast the pointer moves.
    if (colour !== sent && !frame) {
      frame = requestAnimationFrame(() => {
        frame = 0;
        const next = hsvToHex(hsv);
        if (next === sent) return;
        sent = next;
        onInput(next);
      });
    }
  }

  function drag(surface, apply) {
    surface.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      surface.focus({ preventScroll: true, focusVisible: false });
      surface.setPointerCapture(event.pointerId);
      surface.classList.add("is-dragging");
      const move = (moveEvent) => {
        const box = surface.getBoundingClientRect();
        apply(
          Math.min(1, Math.max(0, (moveEvent.clientX - box.left) / box.width)),
          Math.min(1, Math.max(0, (moveEvent.clientY - box.top) / box.height))
        );
        show();
      };
      const end = () => {
        surface.classList.remove("is-dragging");
        surface.removeEventListener("pointermove", move);
        surface.removeEventListener("pointerup", end);
        surface.removeEventListener("pointercancel", end);
      };
      surface.addEventListener("pointermove", move);
      surface.addEventListener("pointerup", end);
      surface.addEventListener("pointercancel", end);
      move(event);
    });
  }
  drag(field, (x, y) => { hsv.s = x; hsv.v = 1 - y; });
  drag(hue, (x) => { hsv.h = Math.min(359.9, x * 360); });

  const nudge = (event, horizontal, vertical) => {
    const big = event.shiftKey ? 10 : 1;
    const dx = { ArrowRight: 1, ArrowLeft: -1 }[event.key] || 0;
    const dy = { ArrowUp: 1, ArrowDown: -1 }[event.key] || 0;
    if (!dx && !dy) return;
    event.preventDefault();
    horizontal(dx * big);
    vertical(dy * big);
    show();
  };
  field.addEventListener("keydown", (event) => nudge(event,
    (step) => { hsv.s = Math.min(1, Math.max(0, hsv.s + step / 100)); },
    (step) => { hsv.v = Math.min(1, Math.max(0, hsv.v + step / 100)); }));
  hue.addEventListener("keydown", (event) => nudge(event,
    (step) => { hsv.h = (hsv.h + step + 360) % 360; },
    (step) => { hsv.h = (hsv.h + step + 360) % 360; }));
  hex.addEventListener("input", () => {
    const text = hex.value.trim();
    const full = /^#?[0-9a-f]{6}$/i.test(text) ? `#${text.replace("#", "")}` : null;
    if (!full) return;
    Object.assign(hsv, hexToHsv(full));
    show({ typing: true });
  });
  dropper?.addEventListener("click", async () => {
    try {
      const { sRGBHex } = await new window.EyeDropper().open();
      Object.assign(hsv, hexToHsv(sRGBHex));
      show();
    } catch (error) { /* cancelled */ }
  });

  function place() {
    const box = anchor.getBoundingClientRect();
    const width = 248;
    const height = panel.offsetHeight || 260;
    const below = innerHeight - box.bottom - 12 >= height;
    panel.style.left = `${Math.max(8, Math.min(box.left + box.width / 2 - width / 2, innerWidth - width - 8))}px`;
    panel.style.top = below ? `${box.bottom + 10}px` : `${Math.max(8, box.top - 10 - height)}px`;
    panel.dataset.side = below ? "below" : "above";
    // The panel grows from the swatch that opened it.
    const origin = box.left + box.width / 2 - parseFloat(panel.style.left);
    panel.style.transformOrigin = `${origin}px ${below ? "0" : "100%"}`;
  }

  function close({ restore = false } = {}) {
    if (openPicker?.panel !== panel) return;
    openPicker = null;
    cancelAnimationFrame(frame);
    anchor.setAttribute("aria-expanded", "false");
    panel.classList.remove("is-open");
    if (restore) anchor.focus({ preventScroll: true });
    if (reducedMotion.matches) panel.remove();
    else setTimeout(() => panel.remove(), 200);
  }

  panel.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close({ restore: true });
    }
  });
  document.body.append(panel);
  show();
  place();
  anchor.setAttribute("aria-expanded", "true");
  openPicker = { anchor, panel, close };
  requestAnimationFrame(() => {
    panel.classList.add("is-open");
    field.focus({ preventScroll: true });
  });
}

// Escape closes an open picker or list and goes no further (it must not also
// take the book back to the shelf), wherever the focus happens to be.
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || (!openPicker && !openSelect)) return;
  event.preventDefault();
  event.stopPropagation();
  if (openPicker) openPicker.close({ restore: true });
  else openSelect.close();
}, true);

document.addEventListener("pointerdown", (event) => {
  if (!openPicker) return;
  if (openPicker.panel.contains(event.target) || openPicker.anchor.contains(event.target)) return;
  openPicker.close();
}, true);
document.addEventListener("scroll", (event) => {
  if (openPicker && !openPicker.panel.contains(event.target)) openPicker.close();
}, true);
window.addEventListener("resize", () => openPicker?.close());
