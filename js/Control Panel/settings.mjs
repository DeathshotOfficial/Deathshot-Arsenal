/**
 * DS Control Panel — Settings Panel & Accent Picker
 */

import { CONTROL_TYPES, TYPE_LABELS, isTypeLocked } from "./core.mjs";

const OPEN_POPUPS = new Map();
let globalsInstalled = false;

function screenRectForNode(app, node) {
  const canvas = app?.canvas?.canvas || document.querySelector("canvas");
  const ds = app?.canvas?.ds;
  if (!canvas || !ds) return null;
  const rect = canvas.getBoundingClientRect();
  const scale = Number(ds.scale) || 1;
  const offset = ds.offset || [0, 0];
  return {
    left: rect.left + (Number(node.pos?.[0] || 0) + Number(offset[0] || 0)) * scale,
    top: rect.top + (Number(node.pos?.[1] || 0) + Number(offset[1] || 0)) * scale,
    width: Number(node.size?.[0] || 260) * scale,
    height: Number(node.size?.[1] || 200) * scale,
  };
}

function position(app, node, popup) {
  const nr = screenRectForNode(app, node);
  if (!nr) return;
  const margin = 10;
  const pw = popup.offsetWidth || 300;
  const ph = popup.offsetHeight || 360;
  let left = nr.left + nr.width + 12;
  if (left + pw > innerWidth - margin) left = nr.left - pw - 12;
  left = Math.max(margin, Math.min(left, innerWidth - pw - margin));
  let top = nr.top;
  if (top + ph > innerHeight - margin) top = innerHeight - ph - margin;
  top = Math.max(margin, top);
  popup.style.left = `${Math.round(left)}px`;
  popup.style.top = `${Math.round(top)}px`;
}

export function closeSettings(node) {
  const item = OPEN_POPUPS.get(node?.id);
  if (!item) return;
  item.popup.remove();
  OPEN_POPUPS.delete(node.id);
}

function themePopup(popup) {
  popup.dataset.dsThemed = "true";
  try {
    const rootStyle = getComputedStyle(document.documentElement);
    for (const key of ["--ds-bg", "--ds-panel", "--ds-panel-2", "--ds-text", "--ds-text-muted", "--ds-border", "--ds-accent", "--ds-font"]) {
      const v = rootStyle.getPropertyValue(key).trim();
      if (v) popup.style.setProperty(key, v);
    }
  } catch (_) {}
}

function field(labelText, inputEl) {
  const wrap = document.createElement("label");
  wrap.className = "ds-cp-settings-field";
  const span = document.createElement("span");
  span.textContent = labelText;
  wrap.append(span, inputEl);
  return wrap;
}

function numberInput(value, onCommit) {
  const input = document.createElement("input");
  input.type = "number";
  input.value = value;
  input.addEventListener("pointerdown", (e) => e.stopPropagation());
  input.addEventListener("change", () => onCommit(Number(input.value)));
  return input;
}

function textInput(value, onCommit) {
  const input = document.createElement("input");
  input.type = "text";
  input.value = value ?? "";
  input.addEventListener("pointerdown", (e) => e.stopPropagation());
  input.addEventListener("change", () => onCommit(input.value));
  return input;
}

const ACCENTS = ["#67e8f9", "#84cc16", "#f97316", "#e879f9", "#f43f5e", "#facc15", "#60a5fa"];

export const CUSTOM_ACCENT_PRESETS = [
  "#67e8f9", "#22d3ee", "#0ea5e9", "#3b82f6", "#6366f1",
  "#8b5cf6", "#a855f7", "#d946ef", "#ec4899", "#f43f5e",
  "#ef4444", "#f97316", "#f59e0b", "#facc15", "#84cc16",
  "#22c55e", "#14b8a6", "#06b6d4", "#94a3b8", "#f8fafc",
];

export const PRESET_NAMES = {
  "#67e8f9": "Cyan",
  "#22d3ee": "Bright Cyan",
  "#0ea5e9": "Sky Blue",
  "#3b82f6": "Blue",
  "#6366f1": "Indigo",
  "#8b5cf6": "Violet",
  "#a855f7": "Purple",
  "#d946ef": "Fuchsia",
  "#ec4899": "Pink",
  "#f43f5e": "Rose",
  "#ef4444": "Red",
  "#f97316": "Orange",
  "#f59e0b": "Amber",
  "#facc15": "Yellow",
  "#84cc16": "Lime",
  "#22c55e": "Green",
  "#14b8a6": "Teal",
  "#06b6d4": "Dark Cyan",
  "#94a3b8": "Slate",
  "#f8fafc": "White",
};

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex(r, g, b) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

function hsvToRgb(h, s, v) {
  h = ((Number(h) % 360) + 360) % 360;
  s = Math.max(0, Math.min(1, Number(s)));
  v = Math.max(0, Math.min(1, Number(v)));
  const i = Math.floor(h / 60);
  const f = h / 60 - i;
  const p = v * (1 - s);
  const q = v * (1 - s * f);
  const t = v * (1 - s * (1 - f));
  const out = [
    [v, t, p], [q, v, p], [p, v, t],
    [p, q, v], [t, p, v], [v, p, q],
  ][i % 6];
  return { r: out[0] * 255, g: out[1] * 255, b: out[2] * 255 };
}

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}

function clampHex(value, fallback = "#67e8f9") {
  const rgb = hexToRgb(value);
  return rgb ? rgbToHex(rgb.r, rgb.g, rgb.b) : fallback;
}

const ACCENT_POPUPS = new Map();

function positionAccentPicker(app, node, popup) {
  const nr = screenRectForNode(app, node);
  if (!nr) return;
  const pw = popup.offsetWidth || 280;
  const ph = popup.offsetHeight || 370;
  const gap = 12;
  let left = nr.left + nr.width + gap;
  if (left + pw > innerWidth - 10) left = nr.left - pw - gap;
  left = Math.max(10, Math.min(left, innerWidth - pw - 10));
  let top = nr.top;
  if (top + ph > innerHeight - 10) top = innerHeight - ph - 10;
  top = Math.max(10, top);
  popup.style.left = `${Math.round(left)}px`;
  popup.style.top = `${Math.round(top)}px`;
}

function setPickerSwatchStyle(el, color) {
  el.style.setProperty("--ds-cp-swatch-color", color);
}

export function closeAccentPicker(node) {
  const item = ACCENT_POPUPS.get(node?.id);
  if (!item) return;
  try { item.popup.remove(); } catch (_) {}
  ACCENT_POPUPS.delete(node.id);
}

export function openAccentPicker(app, node, api) {
  closeAccentPicker(node);

  const popup = document.createElement("div");
  popup.className = "ds-cp-accent-picker";
  popup.dataset.dsThemed = "true";

  const start = clampHex(node?.properties?.ds_cp_accent || "#67e8f9");
  const rgb = hexToRgb(start) || { r: 103, g: 232, b: 249 };
  const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
  let h = hsv.h, sat = hsv.s, val = hsv.v;

  const head = document.createElement("div");
  head.className = "ds-cp-accent-head";
  const title = document.createElement("strong");
  title.textContent = "Custom Accent";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "ds-cp-accent-close";
  close.textContent = "×";
  head.append(title, close);

  const pickerBody = document.createElement("div");
  pickerBody.className = "ds-cp-accent-picker-body";

  const sv = document.createElement("div");
  sv.className = "ds-cp-accent-sv";
  const svCursor = document.createElement("div");
  svCursor.className = "ds-cp-accent-sv-cursor";
  sv.appendChild(svCursor);

  const hue = document.createElement("div");
  hue.className = "ds-cp-accent-hue";
  const hueCursor = document.createElement("div");
  hueCursor.className = "ds-cp-accent-hue-cursor";
  hue.appendChild(hueCursor);

  const preview = document.createElement("div");
  preview.className = "ds-cp-accent-preview";

  const hex = document.createElement("input");
  hex.type = "text";
  hex.className = "ds-cp-accent-hex";
  hex.spellcheck = false;
  hex.maxLength = 7;

  const tools = document.createElement("div");
  tools.className = "ds-cp-accent-tools";
  const copy = document.createElement("button");
  copy.type = "button";
  copy.textContent = "Copy";
  const eye = document.createElement("button");
  eye.type = "button";
  eye.textContent = "Pick";
  eye.title = "Use the browser eyedropper";
  tools.append(copy, eye);

  const controls = document.createElement("div");
  controls.className = "ds-cp-accent-value-row";
  controls.append(preview, hex, tools);

  const presetTitle = document.createElement("div");
  presetTitle.className = "ds-cp-accent-presets-title";
  presetTitle.textContent = "20 PRESETS";

  const presets = document.createElement("div");
  presets.className = "ds-cp-accent-presets";
  for (const color of CUSTOM_ACCENT_PRESETS) {
    const sw = document.createElement("button");
    sw.type = "button";
    sw.className = "ds-cp-accent-preset";
    sw.title = `${PRESET_NAMES[color] || color} (${color})`;
    setPickerSwatchStyle(sw, color);
    sw.addEventListener("pointerdown", (e) => e.stopPropagation());
    sw.addEventListener("click", () => applyHex(color));
    presets.appendChild(sw);
  }

  pickerBody.append(sv, hue, controls, presetTitle, presets);
  popup.append(head, pickerBody);
  document.body.appendChild(popup);
  ACCENT_POPUPS.set(node.id, { node, popup });

  function currentHex() { return rgbToHex(...Object.values(hsvToRgb(h, sat, val))); }

  function applyHex(raw) {
    const color = clampHex(raw, null);
    if (!color) { hex.value = raw; return; }
    const c = hexToRgb(color);
    const next = rgbToHsv(c.r, c.g, c.b);
    h = next.h; sat = next.s; val = next.v;
    render();
    api.setAccent(color);
  }

  function render() {
    const color = currentHex();
    sv.style.background =
      `linear-gradient(to top, #000 0%, transparent 100%),` +
      `linear-gradient(to right, #fff 0%, hsl(${h} 100% 50%) 100%)`;
    svCursor.style.left = `${sat * 100}%`;
    svCursor.style.top = `${(1 - val) * 100}%`;
    hueCursor.style.left = `${(h / 360) * 100}%`;
    preview.style.background = color;
    hex.value = color;
  }

  function pointerSV(e) {
    const r = sv.getBoundingClientRect();
    sat = Math.max(0, Math.min(1, (e.clientX - r.left) / Math.max(1, r.width)));
    val = Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / Math.max(1, r.height)));
    const color = currentHex();
    render();
    api.setAccent(color);
  }

  function pointerHue(e) {
    const r = hue.getBoundingClientRect();
    h = Math.max(0, Math.min(360, ((e.clientX - r.left) / Math.max(1, r.width)) * 360));
    const color = currentHex();
    render();
    api.setAccent(color);
  }

  function dragOn(element, fn) {
    element.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      e.preventDefault();
      element.setPointerCapture?.(e.pointerId);
      fn(e);
      const move = (ev) => fn(ev);
      const end = () => {
        element.removeEventListener("pointermove", move);
        element.removeEventListener("pointerup", end);
        element.removeEventListener("pointercancel", end);
      };
      element.addEventListener("pointermove", move);
      element.addEventListener("pointerup", end);
      element.addEventListener("pointercancel", end);
    });
  }

  dragOn(sv, pointerSV);
  dragOn(hue, pointerHue);

  hex.addEventListener("pointerdown", (e) => e.stopPropagation());
  hex.addEventListener("change", () => applyHex(hex.value.trim()));
  hex.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") { e.preventDefault(); applyHex(hex.value.trim()); }
    if (e.key === "Escape") { hex.value = currentHex(); hex.blur(); }
  });

  copy.addEventListener("pointerdown", (e) => e.stopPropagation());
  copy.addEventListener("click", async () => {
    try { await navigator.clipboard?.writeText(currentHex()); } catch (_) {}
  });

  eye.addEventListener("pointerdown", (e) => e.stopPropagation());
  eye.addEventListener("click", async () => {
    if (!window.EyeDropper) return;
    try {
      const picker = new window.EyeDropper();
      const result = await picker.open();
      if (result?.sRGBHex) applyHex(result.sRGBHex);
    } catch (_) {}
  });

  close.addEventListener("pointerdown", (e) => e.stopPropagation());
  close.addEventListener("click", () => closeAccentPicker(node));
  popup.addEventListener("pointerdown", (e) => e.stopPropagation());
  popup.addEventListener("mousedown", (e) => e.stopPropagation());

  themePopup(popup);
  render();
  requestAnimationFrame(() => positionAccentPicker(app, node, popup));

  if (!globalsInstalled) {
    globalsInstalled = true;
    window.addEventListener("pointerdown", (e) => {
      for (const item of ACCENT_POPUPS.values()) {
        if (!item.popup.contains(e.target)) closeAccentPicker(item.node);
      }
    }, true);
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") for (const item of ACCENT_POPUPS.values()) closeAccentPicker(item.node);
    });
    window.addEventListener("resize", () => {
      for (const item of ACCENT_POPUPS.values()) positionAccentPicker(app, item.node, item.popup);
    });
  }
}

function renderControlEditor(container, node, control, index, api) {
  const card = document.createElement("div");
  card.className = "ds-cp-settings-card";

  const head = document.createElement("div");
  head.className = "ds-cp-settings-card-head";
  const title = document.createElement("strong");
  title.textContent = `#${index + 1} · ${control.type}`;
  head.appendChild(title);

  const actions = document.createElement("div");
  actions.className = "ds-cp-settings-card-actions";
  const up = document.createElement("button"); up.type = "button"; up.textContent = "↑"; up.title = "Move up";
  const down = document.createElement("button"); down.type = "button"; down.textContent = "↓"; down.title = "Move down";
  const del = document.createElement("button"); del.type = "button"; del.textContent = "✕"; del.title = "Delete control"; del.className = "ds-cp-settings-danger";
  [up, down, del].forEach((b) => b.addEventListener("pointerdown", (e) => e.stopPropagation()));
  up.addEventListener("click", () => api.move(index, -1));
  down.addEventListener("click", () => api.move(index, 1));
  del.addEventListener("click", () => api.remove(index));
  actions.append(up, down, del);
  head.appendChild(actions);
  card.appendChild(head);

  const nameField = textInput(control.name, (v) => api.patch(index, { name: v, autoName: false }));
  card.appendChild(field("Name", nameField));

  const locked = isTypeLocked(control);
  if (locked) {
    const badge = document.createElement("span");
    badge.className = "ds-cp-settings-type-lock";
    badge.textContent = `🔒 ${TYPE_LABELS[control.type] || control.type}`;
    badge.title = "Driven by the connected input — disconnect to change.";
    card.appendChild(field("Type", badge));
  } else {
    const select = document.createElement("select");
    for (const t of CONTROL_TYPES) {
      const opt = document.createElement("option");
      opt.value = t;
      opt.textContent = TYPE_LABELS[t] || t;
      if (t === control.type) opt.selected = true;
      select.appendChild(opt);
    }
    select.addEventListener("pointerdown", (e) => e.stopPropagation());
    select.addEventListener("change", () => api.setType(index, select.value));
    card.appendChild(field("Type", select));
  }

  if (control.type === "float" || control.type === "int") {
    card.appendChild(field("Min", numberInput(control.min, (v) => api.patch(index, { min: v }))));
    card.appendChild(field("Max", numberInput(control.max, (v) => api.patch(index, { max: v }))));
    card.appendChild(field("Step", numberInput(control.step, (v) => api.patch(index, { step: v }))));
    card.appendChild(field("Default", numberInput(control.default, (v) => api.patch(index, { default: v }))));
  } else if (control.type === "toggle") {
    card.appendChild(field("On label", textInput(control.onLabel, (v) => api.patch(index, { onLabel: v }))));
    card.appendChild(field("Off label", textInput(control.offLabel, (v) => api.patch(index, { offLabel: v }))));
  } else if (control.type === "combo") {
    if (!locked) {
      const optsField = textInput((control.options || []).join(", "), (v) => {
        const opts = v.split(",").map((s) => s.trim()).filter(Boolean);
        const nextValue = opts.includes(control.value) ? control.value : (opts[0] ?? "");
        api.patch(index, { options: opts, allowedOptions: [], value: nextValue });
      });
      card.appendChild(field("Options (comma-separated)", optsField));
    }
    const list = document.createElement("div");
    list.className = "ds-cp-settings-options";
    for (const opt of control.options || []) {
      const row = document.createElement("label");
      row.className = "ds-cp-settings-option";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      const allowed = control.allowedOptions || [];
      cb.checked = allowed.length === 0 || allowed.includes(opt);
      cb.addEventListener("pointerdown", (e) => e.stopPropagation());
      cb.addEventListener("change", () => {
        let next = (control.allowedOptions || []).slice();
        if (next.length === 0) next = (control.options || []).slice();
        if (cb.checked) { if (!next.includes(opt)) next.push(opt); }
        else { next = next.filter((o) => o !== opt); }
        if (next.length === (control.options || []).length) next = [];
        api.patch(index, { allowedOptions: next });
      });
      const span = document.createElement("span");
      span.textContent = String(opt);
      row.append(cb, span);
      list.appendChild(row);
    }
    card.appendChild(field("Options", list));
  } else if (control.type === "seed") {
    const modeRow = document.createElement("div");
    modeRow.className = "ds-cp-settings-toggle-row";
    for (const m of ["fixed", "random"]) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = m;
      b.className = control.seedMode === m ? "is-active" : "";
      b.addEventListener("pointerdown", (e) => e.stopPropagation());
      b.addEventListener("click", () => api.patch(index, { seedMode: m }));
      modeRow.appendChild(b);
    }
    card.appendChild(field("Mode", modeRow));
  }

  container.appendChild(card);
}

function render(popup, app, node, api) {
  popup.innerHTML = "";

  const head = document.createElement("div");
  head.className = "ds-cp-settings-head";
  head.innerHTML = `<strong>Control Panel</strong><small>Settings</small>`;
  const close = document.createElement("button");
  close.type = "button";
  close.className = "ds-cp-settings-close";
  close.textContent = "×";
  close.addEventListener("pointerdown", (e) => e.stopPropagation());
  close.addEventListener("click", () => closeSettings(node));
  head.appendChild(close);
  popup.appendChild(head);

  const body = document.createElement("div");
  body.className = "ds-cp-settings-body";

  const accentSection = document.createElement("div");
  accentSection.className = "ds-cp-settings-accent";
  const accentLabel = document.createElement("div");
  accentLabel.className = "ds-cp-settings-label";
  accentLabel.textContent = "ACCENT";
  accentSection.appendChild(accentLabel);
  const swatches = document.createElement("div");
  swatches.className = "ds-cp-settings-swatches";
  for (const color of ACCENTS) {
    const sw = document.createElement("button");
    sw.type = "button";
    sw.className = "ds-cp-settings-swatch" + (node.properties?.ds_cp_accent === color ? " is-selected" : "");
    sw.style.setProperty("--ds-cp-swatch-color", color);
    sw.addEventListener("pointerdown", (e) => e.stopPropagation());
    sw.addEventListener("click", () => api.setAccent(color));
    swatches.appendChild(sw);
  }

  const customSw = document.createElement("button");
  customSw.type = "button";
  customSw.className = "ds-cp-settings-swatch ds-cp-swatch-custom";
  customSw.title = "Custom Accent Picker";
  customSw.textContent = "＋";
  customSw.addEventListener("pointerdown", (e) => e.stopPropagation());
  customSw.addEventListener("click", () => openAccentPicker(app, node, api));
  swatches.appendChild(customSw);

  accentSection.appendChild(swatches);
  body.appendChild(accentSection);

  const controls = node._dsControls || [];
  controls.forEach((c, i) => renderControlEditor(body, node, c, i, api));

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "ds-cp-settings-add";
  addBtn.textContent = "+ Add control";
  addBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
  addBtn.addEventListener("click", () => api.add());
  body.appendChild(addBtn);

  popup.appendChild(body);
  themePopup(popup);
  requestAnimationFrame(() => position(app, node, popup));
}

export function openSettings(app, node, api) {
  closeSettings(node);
  const popup = document.createElement("div");
  popup.className = "ds-cp-settings-popup";
  popup.addEventListener("pointerdown", (e) => e.stopPropagation());
  popup.addEventListener("mousedown", (e) => e.stopPropagation());
  document.body.appendChild(popup);
  OPEN_POPUPS.set(node.id, { node, popup });

  node._dsRerenderSettings = () => render(popup, app, node, api);
  render(popup, app, node, api);

  if (!globalsInstalled) {
    globalsInstalled = true;
    window.addEventListener("pointerdown", (e) => {
      for (const [, item] of OPEN_POPUPS) {
        if (!item.popup.contains(e.target)) closeSettings(item.node);
      }
    }, true);
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") for (const item of OPEN_POPUPS.values()) closeSettings(item.node);
    });
    window.addEventListener("resize", () => {
      for (const item of OPEN_POPUPS.values()) position(app, item.node, item.popup);
    });
  }
}

export function isSettingsOpen(node) {
  return OPEN_POPUPS.has(node?.id);
}

export function repositionSettings(app, node) {
  const item = OPEN_POPUPS.get(node?.id);
  if (item) position(app, node, item.popup);
}