/**
 * DeathshotArsenal UI — ColorPicker Component
 * Replicated directly from DS Control Panel Accent Picker with side-docking to node.
 */

import { app } from "/scripts/app.js";

export const CUSTOM_ACCENT_PRESETS = [
  "#67e8f9", "#22d3ee", "#0ea5e9", "#3b82f6", "#6366f1",
  "#8b5cf6", "#a855f7", "#d946ef", "#ec4899", "#f43f5e",
  "#ef4444", "#f97316", "#f59e0b", "#facc15", "#84cc16",
  "#22c55e", "#14b8a6", "#06b6d4", "#94a3b8", "#f8fafc",
];

export const DEFAULT_COLOR_PRESETS = CUSTOM_ACCENT_PRESETS;

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

const EYEDROPPER_SVG = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 22 1-1h3l9-9"/><path d="M16.5 4.5 19.5 7.5"/><path d="m14 7 3 3"/><path d="M19 2a2.828 2.828 0 0 1 4 4l-11 11H8v-4L19 2Z"/></svg>`;

export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex(r, g, b) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function hsvToRgb(h, s, v) {
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

export function rgbToHsv(r, g, b) {
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

export function clampHex(value, fallback = "#67e8f9") {
  const rgb = hexToRgb(value);
  return rgb ? rgbToHex(rgb.r, rgb.g, rgb.b) : fallback;
}

export function screenRectForNode(theApp, node) {
  if (!node) return null;

  const appInstance = theApp || window.app;
  const canvasEl = appInstance?.canvas?.canvas || document.querySelector("canvas#graph-canvas") || document.querySelector("canvas");
  const ds = appInstance?.canvas?.ds;
  if (canvasEl && ds && Array.isArray(node.pos) && Array.isArray(node.size)) {
    const cr = canvasEl.getBoundingClientRect();
    const scale = Number(ds.scale) || 1;
    const offset = ds.offset || [0, 0];
    const left = cr.left + (Number(node.pos[0] || 0) + Number(offset[0] || 0)) * scale;
    const top = cr.top + (Number(node.pos[1] || 0) + Number(offset[1] || 0)) * scale;
    const width = Number(node.size[0] || 260) * scale;
    const height = Number(node.size[1] || 200) * scale;
    if (width > 0 && height > 0) {
      return {
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height,
      };
    }
  }

  return null;
}

const ACTIVE_PICKERS = new Map();
let followRaf = null;

function ensureFollowLoop(theApp) {
  if (followRaf != null) return;
  const loop = () => {
    if (ACTIVE_PICKERS.size === 0) {
      followRaf = null;
      return;
    }
    for (const item of ACTIVE_PICKERS.values()) {
      positionColorPicker(theApp, item.node, item.popup, item.trigger);
    }
    followRaf = requestAnimationFrame(loop);
  };
  followRaf = requestAnimationFrame(loop);
}

export function positionColorPicker(theApp, node, popup, triggerEl) {
  if (!popup || !popup.isConnected) return;
  let nr = screenRectForNode(theApp, node);
  if (!nr && triggerEl && triggerEl.isConnected) {
    const tr = triggerEl.getBoundingClientRect();
    nr = { left: tr.left, top: tr.top, right: tr.right, bottom: tr.bottom, width: tr.width, height: tr.height };
  }
  if (!nr) return;

  const parentPopover = triggerEl?.closest?.(".ds-op-settings-popover, .ds-cp-settings-popup, [data-ds-popover]");
  const targetRect = (parentPopover && parentPopover.isConnected)
    ? parentPopover.getBoundingClientRect()
    : nr;

  const rect = popup.getBoundingClientRect();
  const pw = Math.max(rect.width, popup.offsetWidth || 0, 290);
  const ph = Math.max(rect.height, popup.offsetHeight || 0, 360);
  const margin = 12;
  const gap = 12;

  // Strict rule: Color picker loads to NODE SIDE, never on top of the node
  const spaceRight = window.innerWidth - targetRect.right - margin;
  const spaceLeft = targetRect.left - margin;

  let left;
  if (spaceRight >= pw + gap) {
    left = targetRect.right + gap;
  } else if (spaceLeft >= pw + gap) {
    left = targetRect.left - pw - gap;
  } else if (spaceRight >= spaceLeft) {
    left = targetRect.right + gap;
  } else {
    left = targetRect.left - pw - gap;
  }

  let top = targetRect.top;
  if (top + ph > window.innerHeight - margin) {
    top = window.innerHeight - ph - margin;
  }
  top = Math.max(margin, top);

  const newLeft = `${Math.round(left)}px`;
  const newTop = `${Math.round(top)}px`;
  if (popup.style.left !== newLeft) popup.style.left = newLeft;
  if (popup.style.top !== newTop) popup.style.top = newTop;
}

export function closeColorPicker(nodeOrId) {
  const key = typeof nodeOrId === "object" ? nodeOrId?.id : nodeOrId;
  const item = ACTIVE_PICKERS.get(key);
  if (!item) return;
  try { item.popup.remove(); } catch (_) {}
  ACTIVE_PICKERS.delete(key);
}

export function ColorPicker(options = {}) {
  const root = document.createElement("div");
  root.className = "ds-ui-color-picker";
  if (options.className) root.classList.add(...options.className.split(/\s+/).filter(Boolean));

  let currentColor = clampHex(options.value || "#67e8f9");
  let disabled = Boolean(options.disabled);
  const node = options.node || null;
  const pickerId = node?.id ?? (`cp_${Math.random().toString(36).slice(2)}`);

  // Trigger button
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "ds-ui-color-trigger";
  trigger.disabled = disabled;

  const swatch = document.createElement("span");
  swatch.className = "ds-ui-color-swatch-box";
  swatch.style.backgroundColor = currentColor;

  const hexText = document.createElement("span");
  hexText.className = "ds-ui-color-hex-text";
  hexText.textContent = currentColor.toUpperCase();

  trigger.append(swatch, hexText);
  root.appendChild(trigger);

  let activePopup = null;

  function open() {
    if (disabled) return;
    closeColorPicker(pickerId);

    const popup = document.createElement("div");
    popup.className = "ds-cp-accent-picker ds-ui-color-picker-popover";
    popup.dataset.dsThemed = "true";

    const rgb = hexToRgb(currentColor) || { r: 103, g: 232, b: 249 };
    const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
    let h = hsv.h, sat = hsv.s, val = hsv.v;

    // Header
    const head = document.createElement("div");
    head.className = "ds-cp-accent-head";
    const title = document.createElement("strong");
    title.textContent = options.title || "Color Picker";
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "ds-cp-accent-close";
    closeBtn.textContent = "×";
    head.append(title, closeBtn);

    // Body
    const pickerBody = document.createElement("div");
    pickerBody.className = "ds-cp-accent-picker-body";

    // 1. SV Box
    const sv = document.createElement("div");
    sv.className = "ds-cp-accent-sv";
    const svCursor = document.createElement("div");
    svCursor.className = "ds-cp-accent-sv-cursor";
    sv.appendChild(svCursor);

    // 2. Hue Slider
    const hue = document.createElement("div");
    hue.className = "ds-cp-accent-hue";
    const hueCursor = document.createElement("div");
    hueCursor.className = "ds-cp-accent-hue-cursor";
    hue.appendChild(hueCursor);

    // 3. Value controls row
    const controls = document.createElement("div");
    controls.className = "ds-cp-accent-value-row";

    const preview = document.createElement("div");
    preview.className = "ds-cp-accent-preview";
    preview.title = "Current color";

    const hexInput = document.createElement("input");
    hexInput.type = "text";
    hexInput.className = "ds-cp-accent-hex";
    hexInput.spellcheck = false;
    hexInput.maxLength = 7;
    hexInput.title = "Color hex code (#RRGGBB)";

    const eye = document.createElement("button");
    eye.type = "button";
    eye.className = "ds-cp-accent-btn ds-cp-accent-eye";
    eye.innerHTML = EYEDROPPER_SVG;
    eye.title = "Pick color from screen or canvas";

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "ds-cp-accent-btn ds-cp-accent-copy";
    copyBtn.textContent = "Copy";
    copyBtn.title = "Copy hex color to clipboard";

    const pasteBtn = document.createElement("button");
    pasteBtn.type = "button";
    pasteBtn.className = "ds-cp-accent-btn ds-cp-accent-paste";
    pasteBtn.textContent = "Paste";
    pasteBtn.title = "Paste hex color from clipboard";

    controls.append(preview, hexInput, eye, copyBtn, pasteBtn);

    // 4. Presets
    const presetTitle = document.createElement("div");
    presetTitle.className = "ds-cp-accent-presets-title";
    presetTitle.textContent = "20 PRESETS";

    const presets = document.createElement("div");
    presets.className = "ds-cp-accent-presets";
    for (const color of (options.presets || CUSTOM_ACCENT_PRESETS)) {
      const sw = document.createElement("button");
      sw.type = "button";
      sw.className = "ds-cp-accent-preset";
      sw.title = `${PRESET_NAMES[color] || color} (${color})`;
      sw.style.setProperty("--ds-cp-swatch-color", color);
      sw.style.backgroundColor = color;
      sw.addEventListener("pointerdown", (e) => e.stopPropagation());
      sw.addEventListener("click", () => applyHex(color));
      presets.appendChild(sw);
    }

    pickerBody.append(sv, hue, controls, presetTitle, presets);
    popup.append(head, pickerBody);
    document.body.appendChild(popup);

    activePopup = popup;
    ACTIVE_PICKERS.set(pickerId, { node, popup, trigger });

    function currentHexVal() {
      return rgbToHex(...Object.values(hsvToRgb(h, sat, val)));
    }

    function applyHex(raw) {
      const color = clampHex(raw, null);
      if (!color) {
        hexInput.value = raw;
        return;
      }
      const c = hexToRgb(color);
      const next = rgbToHsv(c.r, c.g, c.b);
      h = next.h; sat = next.s; val = next.v;
      render();
      currentColor = color;
      options.onChange?.(color, { picker: api });
    }

    function render() {
      const color = currentHexVal();
      sv.style.background =
        `linear-gradient(to top, #000 0%, transparent 100%),` +
        `linear-gradient(to right, #fff 0%, hsl(${h} 100% 50%) 100%)`;
      svCursor.style.left = `${sat * 100}%`;
      svCursor.style.top = `${(1 - val) * 100}%`;
      hueCursor.style.left = `${(h / 360) * 100}%`;
      preview.style.background = color;
      hexInput.value = color;
      swatch.style.backgroundColor = color;
      hexText.textContent = color.toUpperCase();
    }

    function pointerSV(e) {
      const r = sv.getBoundingClientRect();
      sat = Math.max(0, Math.min(1, (e.clientX - r.left) / Math.max(1, r.width)));
      val = Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / Math.max(1, r.height)));
      const color = currentHexVal();
      render();
      currentColor = color;
      options.onChange?.(color, { picker: api });
    }

    function pointerHue(e) {
      const r = hue.getBoundingClientRect();
      h = Math.max(0, Math.min(360, ((e.clientX - r.left) / Math.max(1, r.width)) * 360));
      const color = currentHexVal();
      render();
      currentColor = color;
      options.onChange?.(color, { picker: api });
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

    hexInput.addEventListener("pointerdown", (e) => e.stopPropagation());
    hexInput.addEventListener("change", () => applyHex(hexInput.value.trim()));
    hexInput.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        e.preventDefault();
        applyHex(hexInput.value.trim());
      }
      if (e.key === "Escape") {
        hexInput.value = currentHexVal();
        hexInput.blur();
      }
    });

    copyBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
    copyBtn.addEventListener("click", async () => {
      try { await navigator.clipboard?.writeText(currentHexVal()); } catch (_) {}
    });

    pasteBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
    pasteBtn.addEventListener("click", async () => {
      try {
        const text = await navigator.clipboard?.readText();
        if (text) applyHex(text.trim());
      } catch (_) {}
    });

    eye.addEventListener("pointerdown", (e) => e.stopPropagation());
    eye.addEventListener("click", async () => {
      if (window.EyeDropper) {
        try {
          const picker = new window.EyeDropper();
          const result = await picker.open();
          if (result?.sRGBHex) applyHex(result.sRGBHex);
          return;
        } catch (_) {}
      }

      // Canvas sample fallback
      const mainCanvas = document.querySelector("#graph-canvas, canvas.litegraph") || document.querySelector("canvas");
      if (!mainCanvas) return;
      document.body.style.cursor = "crosshair";
      const onCanvasPick = (pe) => {
        pe.preventDefault();
        pe.stopPropagation();
        document.body.style.cursor = "";
        document.removeEventListener("pointerdown", onCanvasPick, true);
        try {
          const ctx = mainCanvas.getContext("2d");
          const rect = mainCanvas.getBoundingClientRect();
          const px = pe.clientX - rect.left;
          const py = pe.clientY - rect.top;
          const pixel = ctx.getImageData(px, py, 1, 1).data;
          const toHex = (n) => n.toString(16).padStart(2, "0");
          const sampled = `#${toHex(pixel[0])}${toHex(pixel[1])}${toHex(pixel[2])}`;
          applyHex(sampled);
        } catch (_) {}
      };
      setTimeout(() => {
        document.addEventListener("pointerdown", onCanvasPick, { once: true, capture: true });
      }, 100);
    });

    closeBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
    closeBtn.addEventListener("click", () => close());
    popup.addEventListener("pointerdown", (e) => e.stopPropagation());
    popup.addEventListener("mousedown", (e) => e.stopPropagation());

    render();
    requestAnimationFrame(() => positionColorPicker(app, node, popup, trigger));
    ensureFollowLoop(app);
  }

  function close() {
    closeColorPicker(pickerId);
    activePopup = null;
  }

  trigger.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    if (ACTIVE_PICKERS.has(pickerId)) {
      close();
    } else {
      open();
    }
  });

  const onGlobalPointer = (e) => {
    const item = ACTIVE_PICKERS.get(pickerId);
    if (!item) return;
    if (!item.popup.contains(e.target) && !trigger.contains(e.target)) {
      close();
    }
  };

  const onGlobalKey = (e) => {
    if (e.key === "Escape" && ACTIVE_PICKERS.has(pickerId)) {
      close();
    }
  };

  const onGlobalResize = () => {
    const item = ACTIVE_PICKERS.get(pickerId);
    if (item) {
      positionColorPicker(app, item.node, item.popup, item.trigger);
    }
  };

  window.addEventListener("pointerdown", onGlobalPointer, true);
  window.addEventListener("keydown", onGlobalKey);
  window.addEventListener("resize", onGlobalResize);

  const api = {
    root,
    trigger,
    open,
    close,
    isOpen: () => ACTIVE_PICKERS.has(pickerId),
    getValue: () => currentColor,
    setValue(hex, fire = false) {
      const color = clampHex(hex, currentColor);
      currentColor = color;
      swatch.style.backgroundColor = color;
      hexText.textContent = color.toUpperCase();
      if (activePopup && activePopup.isConnected) {
        const c = hexToRgb(color);
        if (c) {
          const next = rgbToHsv(c.r, c.g, c.b);
          const sv = activePopup.querySelector(".ds-cp-accent-sv");
          const svCursor = activePopup.querySelector(".ds-cp-accent-sv-cursor");
          const hueCursor = activePopup.querySelector(".ds-cp-accent-hue-cursor");
          const preview = activePopup.querySelector(".ds-cp-accent-preview");
          const hexInput = activePopup.querySelector(".ds-cp-accent-hex");
          if (sv) {
            sv.style.background =
              `linear-gradient(to top, #000 0%, transparent 100%),` +
              `linear-gradient(to right, #fff 0%, hsl(${next.h} 100% 50%) 100%)`;
          }
          if (svCursor) {
            svCursor.style.left = `${next.s * 100}%`;
            svCursor.style.top = `${(1 - next.v) * 100}%`;
          }
          if (hueCursor) hueCursor.style.left = `${(next.h / 360) * 100}%`;
          if (preview) preview.style.background = color;
          if (hexInput) hexInput.value = color;
        }
      }
      if (fire) options.onChange?.(color, { picker: api });
    },
    setDisabled(state) {
      disabled = Boolean(state);
      trigger.disabled = disabled;
      if (disabled) close();
    },
    destroy() {
      close();
      window.removeEventListener("pointerdown", onGlobalPointer, true);
      window.removeEventListener("keydown", onGlobalKey);
      window.removeEventListener("resize", onGlobalResize);
      root.remove();
    },
  };

  return api;
}

export function openAccentPicker(appInstance, node, api) {
  const picker = ColorPicker({
    node,
    value: node?.properties?.ds_cp_accent || "#67e8f9",
    onChange: (hex) => api?.setAccent?.(hex),
  });
  picker.open();
  return picker;
}
