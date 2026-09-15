import { app } from "/scripts/app.js";
import { protectDSResizeCorners } from "../Shared/ds_ui_system.js";

const TYPE = "DS_OutpaintStitch";
const CSS = "/extensions/DeathshotArsenal/Outpaint/ds_outpaint_stitch.css";
const UI_KEY = "ds_stitch_state";

const MIN_W = 240;
const DEFAULT_W = 280;
const MIN_H = 130;
const DEFAULT_H = 134;
const WIDGET_H = 68;

if (!document.querySelector(`link[href="${CSS}"]`)) {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = CSS;
  document.head.appendChild(link);
}

function clamp(val, min, max) {
  const n = Number(val);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function snap(v, step) {
  if (!step) return v;
  return Math.round(v / step) * step;
}

function pct(val, min, max) {
  if (!(max > min)) return 0;
  return clamp(((val - min) / (max - min)) * 100, 0, 100);
}

function parseColor(str) {
  if (!str) return null;
  str = String(str).trim();
  if (str.startsWith("#")) {
    let hex = str.slice(1);
    if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
    if (hex.length >= 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
      };
    }
  }
  const rgbMatch = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (rgbMatch) {
    return {
      r: Number(rgbMatch[1]),
      g: Number(rgbMatch[2]),
      b: Number(rgbMatch[3]),
    };
  }
  return null;
}

function getRelativeLuminance(rgb) {
  if (!rgb) return 0;
  const srgb = [rgb.r / 255, rgb.g / 255, rgb.b / 255].map((v) => {
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

export function syncStitchHost(node) {
  const root = node?._dsStitchDOM;
  if (!root) return;

  root.style.borderRadius = "0 0 var(--ds-radius, 8px) var(--ds-radius, 8px)";
  root.style.overflow = "hidden";

  let parent = root.parentElement;
  for (let d = 0; d < 3 && parent; d++) {
    if (parent.id === "graph-canvas" || parent.classList?.contains("litegraph")) break;
    parent.style.borderRadius = "0 0 var(--ds-radius, 8px) var(--ds-radius, 8px)";
    parent.style.overflow = "hidden";
    parent = parent.parentElement;
  }
}

export function updateSmartThemeColors(node) {
  syncStitchHost(node);
  const root = node?._dsStitchDOM;
  if (!root) return;

  if (window.DSGlobalTheme?.applySmartContrast) {
    window.DSGlobalTheme.applySmartContrast(root);
    return;
  }

  const style = window.getComputedStyle(root);
  const accentVal = style.getPropertyValue("--ds-accent")?.trim() || "#67e8f9";
  const bgVal = style.getPropertyValue("--ds-input-bg")?.trim() || style.getPropertyValue("--ds-panel")?.trim() || "#0e1016";
  const textVal = style.getPropertyValue("--ds-text")?.trim() || "#e5e7eb";

  const accentRgb = parseColor(accentVal);
  const bgRgb = parseColor(bgVal);
  const textRgb = parseColor(textVal);

  const accentLum = getRelativeLuminance(accentRgb);
  const bgLum = getRelativeLuminance(bgRgb);

  // When accent is bright (e.g. Cyberpunk yellow, lime, cyan, white), text on the fill MUST be dark
  let fillText = "#ffffff";
  let fillShadow = "0 1px 2px rgba(0, 0, 0, 0.65)";
  if (accentLum > 0.40) {
    fillText = "#0a0c10";
    fillShadow = "0 1px 0 rgba(255, 255, 255, 0.35)";
  }

  // Text on unfilled track background
  let trackText = textVal;
  const textLum = getRelativeLuminance(textRgb);
  if (Math.abs(textLum - bgLum) < 0.25) {
    trackText = bgLum > 0.45 ? "#0a0c10" : "#ffffff";
  }

  root.style.setProperty("--ds-stitch-accent", accentVal);
  root.style.setProperty("--ds-stitch-fill-text", fillText);
  root.style.setProperty("--ds-stitch-fill-shadow", fillShadow);
  root.style.setProperty("--ds-stitch-track-text", trackText);
}

function defaults() {
  return {
    feather: 64,
    color_match: 100,
  };
}

function loadState(node) {
  const p = node?.properties || {};
  const saved = p[UI_KEY] || {};
  return {
    feather: clamp(Number(saved.feather ?? p.feather ?? 64), 0, 2048),
    color_match: clamp(Number(saved.color_match ?? p.color_match ?? 100), 0, 200),
  };
}

function persistState(node, state) {
  if (!node) return;
  node.properties ||= {};
  node.properties[UI_KEY] = { ...state };
  node.properties.feather = state.feather;
  node.properties.color_match = state.color_match;

  // Sync to hidden ComfyUI widgets for prompt execution & workflow serialization
  for (const w of node.widgets || []) {
    if (w.name === "feather") {
      w.value = state.feather;
    } else if (w.name === "color_match") {
      // 0% to 200% maps to 0.0 to 2.0 float
      w.value = Number((state.color_match / 100).toFixed(4));
    }
  }
}

function buildSlider(opts) {
  const root = document.createElement("div");
  root.className = "ds-stitch-slider";
  root.tabIndex = 0;

  const fill = document.createElement("div");
  fill.className = "ds-stitch-fill";

  // Layer 1: text visible over unfilled track
  const trackLayer = document.createElement("div");
  trackLayer.className = "ds-stitch-text-layer ds-stitch-layer-track";
  const lblTrack = document.createElement("span");
  lblTrack.className = "ds-stitch-label";
  lblTrack.textContent = opts.name;
  const valTrack = document.createElement("span");
  valTrack.className = "ds-stitch-value";
  trackLayer.append(lblTrack, valTrack);

  // Layer 2: text visible over active fill (with smart high-contrast coloring)
  const fillLayer = document.createElement("div");
  fillLayer.className = "ds-stitch-text-layer ds-stitch-layer-fill";
  const lblFill = document.createElement("span");
  lblFill.className = "ds-stitch-label";
  lblFill.textContent = opts.name;
  const valFill = document.createElement("span");
  valFill.className = "ds-stitch-value";
  fillLayer.append(lblFill, valFill);

  root.append(fill, trackLayer, fillLayer);

  let current = opts.value ?? opts.min;

  const render = () => {
    const p = pct(current, opts.min, opts.max);
    fill.style.width = `${p}%`;

    // Dynamic dual-layer clipping: seamless split at the exact boundary
    trackLayer.style.clipPath = `inset(0 0 0 ${p}%)`;
    fillLayer.style.clipPath = `inset(0 calc(100% - ${p}%) 0 0)`;

    const formatted = opts.format ? opts.format(current) : `${current}${opts.unit || ""}`;
    valTrack.textContent = formatted;
    valFill.textContent = formatted;
  };

  const update = (v, fire = true) => {
    current = clamp(snap(v, opts.step), opts.min, opts.max);
    render();
    if (fire) opts.onChange?.(current);
  };

  let dragging = false;
  let fineOrigin = null;

  const valueFromClientX = (clientX, fine) => {
    const rect = root.getBoundingClientRect();
    if (fine && fineOrigin) {
      const deltaPx = clientX - fineOrigin.clientX;
      const range = opts.max - opts.min;
      const deltaVal = (deltaPx / Math.max(rect.width, 1)) * range * 0.15;
      return clamp(fineOrigin.value + deltaVal, opts.min, opts.max);
    }
    const ratio = clamp((clientX - rect.left) / Math.max(rect.width, 1), 0, 1);
    return opts.min + ratio * (opts.max - opts.min);
  };

  root.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".ds-stitch-edit-input")) return;
    root.setPointerCapture(e.pointerId);
    dragging = true;
    fineOrigin = { clientX: e.clientX, value: current };
    update(valueFromClientX(e.clientX, e.shiftKey));
  });

  root.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    update(valueFromClientX(e.clientX, e.shiftKey));
  });

  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    try { root.releasePointerCapture(e.pointerId); } catch (_) {}
  };
  root.addEventListener("pointerup", endDrag);
  root.addEventListener("pointercancel", endDrag);

  // Keyboard navigation
  root.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = (e.shiftKey ? (opts.step * 5 || 5) : (opts.step || 1));
      update(current + step);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      const step = (e.shiftKey ? (opts.step * 5 || 5) : (opts.step || 1));
      update(current - step);
    }
  });

  // Double-click to edit directly
  root.addEventListener("dblclick", (e) => {
    e.stopPropagation();
    const input = document.createElement("input");
    input.type = "text";
    input.className = "ds-stitch-edit-input";
    input.value = String(current);
    root.appendChild(input);
    input.focus();
    input.select();

    let done = false;
    const commit = (shouldApply) => {
      if (done) return;
      done = true;
      if (shouldApply) {
        const parsed = Number(input.value.trim().replace(/[^0-9.-]/g, ""));
        if (Number.isFinite(parsed)) update(parsed);
      }
      input.remove();
      render();
    };

    input.addEventListener("keydown", (ie) => {
      ie.stopPropagation();
      if (ie.key === "Enter") commit(true);
      else if (ie.key === "Escape") commit(false);
    });
    input.addEventListener("blur", () => commit(true));
    input.addEventListener("pointerdown", (ie) => ie.stopPropagation());
  });

  render();

  return {
    root,
    setValue: (v) => update(v, false),
    getValue: () => current,
    render,
  };
}

function buildUI(node) {
  const root = document.createElement("div");
  root.className = "ds-stitch-root";
  root.dataset.dsThemed = "true";

  const state = loadState(node);
  node._dsStitchState = state;

  const featherSlider = buildSlider({
    name: "Feather",
    min: 0,
    max: 100,
    step: 1,
    value: state.feather,
    unit: " px",
    onChange: (val) => {
      state.feather = val;
      persistState(node, state);
    },
  });

  const colorMatchSlider = buildSlider({
    name: "Color match",
    min: 0,
    max: 200,
    step: 1,
    value: state.color_match,
    unit: "%",
    onChange: (val) => {
      state.color_match = val;
      persistState(node, state);
    },
  });

  root.append(featherSlider.root, colorMatchSlider.root);

  node._dsStitchSliders = {
    feather: featherSlider,
    colorMatch: colorMatchSlider,
  };

  try {
    window.DSGlobalTheme?.bindNode?.(root, node);
  } catch (_) {}

  window.addEventListener("ds-theme-changed", () => {
    syncStitchHost(node);
    updateSmartThemeColors(node);
  });

  requestAnimationFrame(() => {
    syncStitchHost(node);
    updateSmartThemeColors(node);
  });

  return root;
}

app.registerExtension({
  name: "DeathshotArsenal.DSOutpaintStitch",

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== TYPE) return;

    const originalCreated = nodeType.prototype.onNodeCreated;
    const originalConfigure = nodeType.prototype.onConfigure;
    const originalResize = nodeType.prototype.onResize;
    const originalAdded = nodeType.prototype.onAdded;

    nodeType.prototype.computeSize = function () {
      return [MIN_W, MIN_H];
    };

    nodeType.prototype.onNodeCreated = function () {
      const result = originalCreated ? originalCreated.apply(this, arguments) : undefined;

      this.resizable = true;
      protectDSResizeCorners(this);

      // Hide default native LiteGraph widgets and mark for serialization
      for (const w of this.widgets || []) {
        if (w.name === "feather" || w.name === "color_match") {
          w.hidden = true;
          w.computeSize = () => [0, 0];
          w.serialize = true;
        }
      }

      // Ensure hidden widgets exist so ComfyUI prompt payload always carries them
      let fw = this.widgets?.find((w) => w.name === "feather");
      if (!fw) {
        fw = this.addWidget("number", "feather", 64, () => {}, { min: 0, max: 2048, step: 1 });
        fw.hidden = true;
        fw.computeSize = () => [0, 0];
        fw.serialize = true;
      }

      let cw = this.widgets?.find((w) => w.name === "color_match");
      if (!cw) {
        cw = this.addWidget("number", "color_match", 1.0, () => {}, { min: 0.0, max: 2.0, step: 0.01 });
        cw.hidden = true;
        cw.computeSize = () => [0, 0];
        cw.serialize = true;
      }

      // Build custom DOM controls
      this._dsStitchDOM = buildUI(this);

      this._dsStitchWidget = this.addDOMWidget("ds_stitch_ui", "custom", this._dsStitchDOM, {
        serialize: false,
        hideOnZoom: false,
        margin: 0,
      });

      if (this._dsStitchWidget) {
        this._dsStitchWidget.serialize = false;
        this._dsStitchWidget.computeSize = () => [this.size?.[0] || DEFAULT_W, WIDGET_H];
        if (this._dsStitchWidget.options) {
          this._dsStitchWidget.options.getMinHeight = () => WIDGET_H;
          this._dsStitchWidget.options.getMaxHeight = () => WIDGET_H;
        }
        this._dsStitchWidget.computeLayoutSize = () => ({
          minHeight: WIDGET_H,
          maxHeight: WIDGET_H,
          minWidth: MIN_W,
        });
      }

      // Initialize size
      const currentW = Math.max(MIN_W, Number(this.size?.[0]) || DEFAULT_W);
      const currentH = Math.max(MIN_H, Number(this.size?.[1]) || DEFAULT_H);
      this.size = [currentW, currentH];

      syncStitchHost(this);
      setTimeout(() => syncStitchHost(this), 0);
      requestAnimationFrame(() => syncStitchHost(this));

      persistState(this, this._dsStitchState);
      updateSmartThemeColors(this);
      this.setDirtyCanvas?.(true, true);

      return result;
    };

    nodeType.prototype.onConfigure = function (info) {
      const result = originalConfigure ? originalConfigure.apply(this, arguments) : undefined;
      const state = loadState(this);
      this._dsStitchState = state;

      if (this._dsStitchSliders) {
        this._dsStitchSliders.feather?.setValue(state.feather);
        this._dsStitchSliders.colorMatch?.setValue(state.color_match);
      }

      if (this.size) {
        this.size[0] = Math.max(MIN_W, Number(this.size[0]) || DEFAULT_W);
        if (this.size[1] >= 145 && this.size[1] <= 155) {
          this.size[1] = DEFAULT_H;
        } else {
          this.size[1] = Math.max(MIN_H, Number(this.size[1]) || DEFAULT_H);
        }
      }

      syncStitchHost(this);
      setTimeout(() => syncStitchHost(this), 0);
      persistState(this, state);
      updateSmartThemeColors(this);
      this.setDirtyCanvas?.(true, true);
      return result;
    };

    nodeType.prototype.onResize = function (size) {
      const result = originalResize ? originalResize.apply(this, arguments) : undefined;
      if (this.size) {
        this.size[0] = Math.max(MIN_W, Number(this.size[0]) || DEFAULT_W);
        this.size[1] = Math.max(MIN_H, Number(this.size[1]) || DEFAULT_H);
      }
      syncStitchHost(this);
      return result;
    };

    nodeType.prototype.onAdded = function () {
      const result = originalAdded ? originalAdded.apply(this, arguments) : undefined;
      syncStitchHost(this);
      setTimeout(() => syncStitchHost(this), 0);
      return result;
    };

    nodeType.prototype.onDrawForeground = function () {
      syncStitchHost(this);
      updateSmartThemeColors(this);
    };
  },
});
