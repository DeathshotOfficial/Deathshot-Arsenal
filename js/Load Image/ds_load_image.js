import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";
import { DSIcon } from "../Icons/index.js";
import { installDSUI } from "../UIElements/index.js";
import { Card } from "../UIElements/Core/Card.js";
import { normalizeDSWidgetHost, protectDSResizeCorners } from "../UIElements/Core/system.js";
import { Button } from "../UIElements/Controls/Button.js";

const TYPE = "DS_LoadImage";
const EXT = "DeathshotArsenal.DSLoadImage";
const STATE_WIDGET = "ds_load_image_state";
const STATE_PROP = "ds_load_image_state";
const CSS_ID = "ds-load-image-ui-css";
const CSS_URL = "/extensions/DeathshotArsenal/Load%20Image/ds_load_image.css?v=unified7";
const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "webp", "bmp", "tif", "tiff"]);
const RESAMPLES = ["auto", "nearest", "bilinear", "bicubic", "lanczos"];
const RESAMPLE_NOTES = {
  auto: "Lanczos down · Bilinear up",
  nearest: "Pixel-perfect",
  bilinear: "Fast · smooth",
  bicubic: "Sharp",
  lanczos: "Sharpest",
};
const MODES = [
  ["off", "Off"],
  ["max_mp", "Max MP"],
  ["longest_side", "Longest side"],
  ["scale_factor", "Scale by x"],
];
const PRESETS = {
  max_mp: [0.25, 0.5, 1, 2, 4, 8],
  longest_side: [512, 768, 1024, 1280, 1536, 2048],
  scale_factor: [0.25, 0.5, 1, 2, 3, 4],
};
const SNAP_VALUES = [8, 16, 32, 64];
const MIN_W = 460;
const DEFAULT_W = 490;
const DEFAULT_H = 580;
const WIDGET_START_Y = 142;
const CARD_MARGIN = 5;

const STANDARD_RATIOS = [
  [1, 1],
  [5, 4], [4, 5],
  [4, 3], [3, 4],
  [3, 2], [2, 3],
  [16, 10], [10, 16],
  [5, 3], [3, 5],
  [16, 9], [9, 16],
  [21, 9], [9, 21],
  [2, 1], [1, 2],
  [3, 1], [1, 3],
  [4, 1], [1, 4],
];

const DEFAULT_STATE = {
  version: 1,
  mode: "off",
  max_mp: 2.0,
  longest_side: 1536,
  scale_factor: 2.0,
  snap: 0,
  last_snap: 8,
  resample: "auto",
  allow_upscale: true,
};

const imageCache = new Map();

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function gcd(a, b) {
  a = Math.abs(Math.round(a));
  b = Math.abs(Math.round(b));
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

function approximateFraction(val, maxDenom = 16) {
  let [h0, h1] = [0, 1];
  let [k0, k1] = [1, 0];
  let x = val;
  for (let i = 0; i < 20; i++) {
    const a = Math.floor(x);
    const h2 = a * h1 + h0;
    const k2 = a * k1 + k0;
    if (k2 > maxDenom) break;
    [h0, h1] = [h1, h2];
    [k0, k1] = [k1, k2];
    const diff = x - a;
    if (Math.abs(diff) < 1e-6) break;
    x = 1 / diff;
  }
  return [h1, k1];
}

function ratioText(w, h) {
  if (!(w > 0 && h > 0)) return "—";
  const val = w / h;

  let bestStd = null;
  let bestErr = Infinity;
  for (const [rw, rh] of STANDARD_RATIOS) {
    const target = rw / rh;
    const err = Math.abs(val - target) / target;
    if (err < bestErr) {
      bestErr = err;
      bestStd = `${rw}:${rh}`;
    }
  }
  if (bestErr <= 0.035) return bestStd;

  const g = gcd(w, h);
  const sw = Math.round(w / g);
  const sh = Math.round(h / g);
  if (sw <= 12 && sh <= 12) return `${sw}:${sh}`;

  const [num, den] = approximateFraction(val, 16);
  if (den > 0 && Math.abs(val - num / den) / val < 0.04) {
    return `${num}:${den}`;
  }

  return sw <= 32 && sh <= 32
    ? `${sw}:${sh}`
    : val >= 1
    ? `${val.toFixed(2).replace(/\.00$/, "")}:1`
    : `1:${(1 / val).toFixed(2).replace(/\.00$/, "")}`;
}

function snapDimensions(w, h, divisor) {
  divisor = Math.max(0, Math.round(Number(divisor) || 0));
  if (divisor <= 0) return [Math.round(w), Math.round(h)];
  w = Math.max(1, Math.round(w));
  h = Math.max(1, Math.round(h));
  const rw = Math.max(divisor, Math.round(w / divisor) * divisor);
  const rh = Math.max(divisor, Math.round(h / divisor) * divisor);
  const candidates = [];
  for (const cw of [rw - divisor, rw, rw + divisor]) {
    if (cw < divisor) continue;
    const ch = Math.max(divisor, Math.round(((cw * h) / w) / divisor) * divisor);
    candidates.push([Math.abs(cw - w) + Math.abs(ch - h), cw, ch]);
  }
  for (const ch of [rh - divisor, rh, rh + divisor]) {
    if (ch < divisor) continue;
    const cw = Math.max(divisor, Math.round(((ch * w) / h) / divisor) * divisor);
    candidates.push([Math.abs(cw - w) + Math.abs(ch - h), cw, ch]);
  }
  candidates.sort((a, b) => a[0] - b[0]);
  return [candidates[0][1], candidates[0][2]];
}

function targetDims(w, h, s) {
  if (!(w > 0 && h > 0)) return [0, 0];
  let scale = 1;
  if (s.mode === "max_mp") {
    scale = Math.sqrt((s.max_mp * 1048576) / (w * h));
  } else if (s.mode === "longest_side") {
    scale = s.longest_side / Math.max(w, h);
  } else if (s.mode === "scale_factor") {
    scale = s.scale_factor;
  }
  if (!s.allow_upscale) scale = Math.min(scale, 1);
  let ow = Math.max(1, Math.round(w * scale));
  let oh = Math.max(1, Math.round(h * scale));
  if (s.snap > 0) {
    [ow, oh] = snapDimensions(ow, oh, s.snap);
  }
  return [Math.min(16384, ow), Math.min(16384, oh)];
}

function basename(p) {
  return String(p || "").replace(/\\/g, "/").split("/").pop() || "";
}

function folderOf(p) {
  const s = String(p || "").replace(/\\/g, "/");
  const i = s.lastIndexOf("/");
  return i >= 0 ? s.slice(0, i) : "";
}

function isAbsolutePath(p) {
  if (!p) return false;
  return /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith("/");
}

function imageURL(filename, bust = false) {
  if (!filename) return "";
  const clean = String(filename || "").replace(/\\/g, "/");
  if (isAbsolutePath(clean)) {
    const q = new URLSearchParams({ path: clean });
    if (bust) q.set("t", String(Date.now()));
    return `/ds/image?${q}`;
  }
  const parts = clean.split("/");
  const fn = parts.pop() || "";
  const q = new URLSearchParams({ filename: fn, type: "input" });
  if (parts.length) q.set("subfolder", parts.join("/"));
  if (bust) q.set("t", String(Date.now()));
  try {
    return api.apiURL ? api.apiURL(`/view?${q}`) : `/view?${q}`;
  } catch {
    return `/view?${q}`;
  }
}

function thumbnailURL(filename) {
  if (!filename) return "";
  const clean = String(filename || "").replace(/\\/g, "/");
  if (isAbsolutePath(clean)) {
    const q = new URLSearchParams({ path: clean });
    return `/ds/thumbnail?${q}`;
  }
  return imageURL(filename, false);
}

function getCachedOrLoadImage(fn, onLoaded) {
  if (!fn) {
    onLoaded(null, 0, 0);
    return;
  }
  if (imageCache.has(fn)) {
    const cached = imageCache.get(fn);
    onLoaded(cached.img, cached.iw, cached.ih);
    return;
  }
  const img = new Image();
  img.decoding = "async";
  img.onload = () => {
    const iw = img.naturalWidth || 0;
    const ih = img.naturalHeight || 0;
    imageCache.set(fn, { img, iw, ih });
    onLoaded(img, iw, ih);
  };
  img.onerror = (e) => {
    console.warn("[DS Load Image] Failed to load image:", fn, e);
    onLoaded(null, 0, 0);
  };
  img.src = imageURL(fn, false);
}

function inputFiles(node) {
  const vals = node._dsLIImageWidget?.options?.values;
  return Array.isArray(vals)
    ? vals.filter((v) => IMAGE_EXTS.has(String(v).split(".").pop()?.toLowerCase())).slice()
    : [];
}

function stateOf(node) {
  let raw = node?.properties?.[STATE_PROP];
  if (!raw) {
    const w = node?.widgets?.find((x) => x?.name === STATE_WIDGET);
    if (w?.value) raw = w.value;
  }
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = null;
    }
  }
  const s = {
    ...DEFAULT_STATE,
    ...(raw && typeof raw === "object" ? raw : {}),
  };
  if (!MODES.some((x) => x[0] === s.mode)) s.mode = "off";
  if (!RESAMPLES.includes(s.resample)) s.resample = "auto";
  s.max_mp = clamp(Number(s.max_mp) || 2, 0.01, 64);
  s.longest_side = clamp(Math.round(Number(s.longest_side) || 1536), 8, 16384);
  s.scale_factor = clamp(Number(s.scale_factor) || 2, 0.01, 8);
  s.snap = Number(s.snap) || 0;
  if (![0, 8, 16, 32, 64].includes(s.snap)) s.snap = 0;
  s.last_snap = Number(s.last_snap) || (s.snap > 0 ? s.snap : 8);
  if (![8, 16, 32, 64].includes(s.last_snap)) s.last_snap = 8;
  s.allow_upscale = Boolean(s.allow_upscale);
  return s;
}

function getMinCardHeight(node) {
  const s = stateOf(node);
  return s.mode === "off" ? 248 : 312;
}

function getMinNodeHeight(node) {
  return WIDGET_START_Y + getMinCardHeight(node) + (CARD_MARGIN * 2);
}

function persist(node, patch = {}) {
  const cur = stateOf(node);
  const s = { ...cur, ...patch, version: 1 };
  if (s.snap > 0) {
    s.last_snap = s.snap;
  }
  node.properties = node.properties || {};
  const jsonStr = JSON.stringify(s);
  node.properties[STATE_PROP] = jsonStr;

  let w = node.widgets?.find((x) => x?.name === STATE_WIDGET);
  if (!w && node.addWidget) {
    w = node.addWidget("text", STATE_WIDGET, jsonStr, () => {}, { hidden: true });
    w.hidden = true;
    w.computeSize = () => [0, 0];
    w.type = "hidden";
    if (w.element) w.element.style.display = "none";
  }
  if (w) w.value = jsonStr;

  const imgW = node._dsLIImageWidget;
  if (imgW && node._dsLISelected) {
    imgW.value = node._dsLISelected;
    node.properties["image"] = node._dsLISelected;
  }

  // Ensure node height is at least minimum
  const minH = getMinNodeHeight(node);
  if (node.size[1] < minH) {
    node.size[1] = minH;
  }

  node.setDirtyCanvas?.(true, true);
  app.graph?.setDirtyCanvas?.(true, true);
  refreshPreview(node);
  return s;
}

function refreshPreview(node) {
  const fn = node._dsLIImageWidget?.value || "";
  const s = stateOf(node);
  if (!fn) {
    node._dsLIPreview = null;
    if (node._dsLIController) {
      node._dsLIController.setPreview(null, 0, 0, 0, 0);
    }
    node.setDirtyCanvas?.(true, true);
    return;
  }

  getCachedOrLoadImage(fn, (img, iw, ih) => {
    if (node._dsLIImageWidget?.value !== fn) return;
    if (!img || iw <= 0 || ih <= 0) {
      node._dsLIPreview = null;
      if (node._dsLIController) {
        node._dsLIController.setPreview(null, 0, 0, 0, 0);
      }
      node.setDirtyCanvas?.(true, true);
      return;
    }
    const [ow, oh] = targetDims(iw, ih, s);
    node._dsLIPreview = { img, iw, ih, ow, oh };
    if (node._dsLIController) {
      node._dsLIController.setPreview(img, iw, ih, ow, oh);
    }
    node.setDirtyCanvas?.(true, true);
  });
}

function closePopups() {
  document.querySelectorAll(".ds-li-popup").forEach((x) => x.remove());
}

function formatNumeric(s, mode) {
  const v = Number(s?.[mode]);
  if (!Number.isFinite(v)) return "";
  return mode === "longest_side" ? String(Math.round(v)) : String(Math.round(v * 100) / 100);
}

function loadCSS() {
  if (document.getElementById(CSS_ID)) return;
  const link = document.createElement("link");
  link.id = CSS_ID;
  link.rel = "stylesheet";
  link.href = CSS_URL;
  document.head.appendChild(link);
}

/* ========================================================================= */
/* Canvas HUD Rendering (in empty space beside output sockets)               */
/* ========================================================================= */
function theme() {
  const src = document.documentElement;
  const cs = getComputedStyle(src);
  const body = getComputedStyle(document.body);
  const global = window.DSGlobalTheme;
  const get = (n, f) => {
    try {
      const v = global?.getVar?.(n, "");
      if (v) return String(v).trim();
    } catch {}
    return cs.getPropertyValue(n).trim() || body.getPropertyValue(n).trim() || f;
  };
  const font = global?.getConfig?.()?.font || body.fontFamily || "Inter";
  return {
    bg: get("--ds-color-card", get("--ds-panel", "#12151c")),
    bg2: get("--ds-color-panel-2", get("--ds-panel-2", "#161a23")),
    input: get("--ds-input-bg", "#0e1016"),
    border: get("--ds-color-border", get("--ds-border", "#343a44")),
    text: get("--ds-color-text", get("--ds-text", "#e2e8f0")),
    muted: get("--ds-color-muted-text", get("--ds-text-muted", "#9ca3af")),
    accent: get("--ds-color-accent", get("--ds-accent", "#67e8f9")),
    up: get("--ds-color-success", "#34d399"),
    warm: get("--ds-color-danger", "#f87171"),
    font,
  };
}

function rr(ctx, x, y, w, h, r) {
  const q = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + q, y);
  ctx.arcTo(x + w, y, x + w, y + h, q);
  ctx.arcTo(x + w, y + h, x, y + h, q);
  ctx.arcTo(x, y + h, x, y, q);
  ctx.arcTo(x, y, x + w, y, q);
  ctx.closePath();
}

function fillStroke(ctx, x, y, w, h, r, fill, stroke, lw = 1) {
  rr(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}

function canvasText(ctx, t, x, y, size, color, weight = "700", align = "left") {
  ctx.font = `${weight} ${size}px ${theme()?.font || "Inter"},system-ui,sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(t, x, y);
}

function fitImage(ctx, img, x, y, w, h) {
  if (!img?.naturalWidth || !img?.naturalHeight || w <= 0 || h <= 0) return;
  const sc = Math.min(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * sc;
  const dh = img.naturalHeight * sc;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function drawUpDownArrow(ctx, x, y, dir, color, size = 7, lw = 1.8) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  if (dir === "up") {
    ctx.moveTo(x - size / 2, y + size / 3);
    ctx.lineTo(x, y - size / 3);
    ctx.lineTo(x + size / 2, y + size / 3);
  } else {
    ctx.moveTo(x - size / 2, y - size / 3);
    ctx.lineTo(x, y + size / 3);
    ctx.lineTo(x + size / 2, y - size / 3);
  }
  ctx.stroke();
  ctx.restore();
}

function drawComparison(ctx, node) {
  const t = theme();
  const p = node._dsLIPreview;
  const w = node.size[0];

  const card = 124;
  const bridgeW = 40;
  const totalW = card * 2 + bridgeW;
  const lane = 88;
  const inX = Math.max(10, Math.round((w - lane - totalW) / 2));
  const outX = inX + card + bridgeW;
  const y0 = 8;
  const cx = inX + card + bridgeW / 2;
  const cy = y0 + card / 2;

  // Two independent preview boxes on their respective card, NOT connected to each other
  const cardDraw = (x, label, dw, dh, img, out) => {
    fillStroke(ctx, x, y0, card, card, 8, t.bg, t.border, 1);
    canvasText(ctx, label, x + card / 2, y0 + 14, 9, t.muted, "800", "center");

    const preview = 62;
    const px = x + (card - preview) / 2;
    const py = y0 + 25;
    fillStroke(ctx, px, py, preview, preview, 5, t.input, t.border, 1);
    if (img) fitImage(ctx, img, px + 2, py + 2, preview - 4, preview - 4);

    canvasText(ctx, `${dw || "—"} × ${dh || "—"}`, x + card / 2, y0 + 98, 10, t.text, "850", "center");
    canvasText(ctx, ratioText(dw, dh), x + card / 2, y0 + 114, 8, t.muted, "700", "center");

    if (out && p) {
      const up = p.ow > p.iw || p.oh > p.ih;
      const down = p.ow < p.iw || p.oh < p.ih;
      if (up || down) drawUpDownArrow(ctx, x + card - 11, y0 + 14, up ? "up" : "down", up ? t.up : t.warm, 8, 1.8);
    }
  };

  cardDraw(inX, "IN", p?.iw, p?.ih, p?.img, false);
  cardDraw(outX, "OUT", p?.ow, p?.oh, p?.img, true);

  // Center aligned chevron between the two preview cards
  ctx.save();
  ctx.font = "900 14px Inter, system-ui, sans-serif";
  ctx.fillStyle = t.accent;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("❯❯", cx, cy);
  ctx.restore();
}

/* ========================================================================= */
/* DOM Controller for Node Card                                              */
/* ========================================================================= */
class DSLoadImageController {
  constructor(node) {
    this.node = node;
    this.repeatTimer = null;
    this.repeatInterval = null;

    this.buildDOM();
    this.bindEvents();
    this.syncState();
  }

  buildDOM() {
    this.card = Card({ className: "ds-li-card" });

    // 1. File Selection Row (Upload Button + Prev + Dropdown + Next)
    this.fileRow = document.createElement("div");
    this.fileRow.className = "ds-li-file-row";

    this.uploadBtn = Button({
      icon: "upload",
      label: "Upload Image",
      variant: "primary",
      tooltip: "Upload new image from your computer",
      className: "ds-li-upload-btn",
    });

    this.navGroup = document.createElement("div");
    this.navGroup.className = "ds-li-nav-group";

    this.prevBtn = Button({
      icon: "chevron-left",
      tooltip: "Previous image in folder",
      className: "ds-li-arrow-btn",
    });

    this.filenameBtn = document.createElement("button");
    this.filenameBtn.type = "button";
    this.filenameBtn.className = "ds-li-dropdown-trigger";
    this.filenameBtn.title = "Browse and search images";
    this.filenameBtn.innerHTML = `
      <span class="ds-li-dropdown-label">Choose image…</span>
    `;
    this.filenameBtn.appendChild(DSIcon("chevron-down", { size: 12 }));

    this.nextBtn = Button({
      icon: "chevron-right",
      tooltip: "Next image in folder",
      className: "ds-li-arrow-btn",
    });

    this.navGroup.append(this.prevBtn.root, this.filenameBtn, this.nextBtn.root);
    this.fileRow.append(this.uploadBtn.root, this.navGroup);
    this.card.append(this.fileRow);

    // 2. Mode Buttons Row
    this.modeRow = document.createElement("div");
    this.modeRow.className = "ds-li-mode-row";
    this.modeButtons = {};
    for (const [id, label] of MODES) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ds-ui-btn";
      btn.textContent = label;
      btn.dataset.mode = id;
      this.modeButtons[id] = btn;
      this.modeRow.appendChild(btn);
    }
    this.card.append(this.modeRow);

    // 3. Mode Details: Presets & Stepper
    this.modeDetails = document.createElement("div");
    this.modeDetails.className = "ds-li-mode-details";

    this.presetsRow = document.createElement("div");
    this.presetsRow.className = "ds-li-presets-row";

    this.stepperRow = document.createElement("div");
    this.stepperRow.className = "ds-li-stepper-row";

    this.stepperLabel = document.createElement("span");
    this.stepperLabel.className = "ds-li-stepper-label";
    this.stepperLabel.textContent = "Max Megapixels";

    this.stepper = document.createElement("div");
    this.stepper.className = "ds-li-stepper";

    this.stepDownBtn = document.createElement("button");
    this.stepDownBtn.type = "button";
    this.stepDownBtn.className = "ds-li-stepper-btn";
    this.stepDownBtn.title = "Decrement value";
    this.stepDownBtn.appendChild(DSIcon("minus", { size: 12 }));

    this.stepperInput = document.createElement("input");
    this.stepperInput.type = "text";
    this.stepperInput.className = "ds-li-stepper-input";
    this.stepperInput.spellcheck = false;
    this.stepperInput.autocomplete = "off";

    this.stepUpBtn = document.createElement("button");
    this.stepUpBtn.type = "button";
    this.stepUpBtn.className = "ds-li-stepper-btn";
    this.stepUpBtn.title = "Increment value";
    this.stepUpBtn.appendChild(DSIcon("plus", { size: 12 }));

    this.stepper.append(this.stepDownBtn, this.stepperInput, this.stepUpBtn);
    this.stepperRow.append(this.stepperLabel, this.stepper);
    this.modeDetails.append(this.presetsRow, this.stepperRow);
    this.card.append(this.modeDetails);

    // 4. Snap Row (ZERO SNAP TEXT — Icon-only button + Snap values)
    this.snapRow = document.createElement("div");
    this.snapRow.className = "ds-li-snap-row";

    this.snapToggleBtn = Button({
      icon: "snap",
      className: "ds-ui-btn-icon-only ds-li-snap-toggle",
      tooltip: "Toggle Snap",
    });

    this.snapGroup = document.createElement("div");
    this.snapGroup.className = "ds-li-snap-group";
    this.snapValButtons = {};

    for (const val of SNAP_VALUES) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ds-ui-btn";
      btn.textContent = String(val);
      btn.dataset.snap = String(val);
      this.snapValButtons[val] = btn;
      this.snapGroup.appendChild(btn);
    }

    this.snapRow.append(this.snapToggleBtn.root, this.snapGroup);
    this.card.append(this.snapRow);

    // 5. Resample & Upscale Row
    this.resampleRow = document.createElement("div");
    this.resampleRow.className = "ds-li-resample-row";

    this.resampleSelector = document.createElement("div");
    this.resampleSelector.className = "ds-li-resample-selector";

    this.resPrevBtn = Button({
      icon: "chevron-left",
      tooltip: "Previous filter",
      className: "ds-li-arrow-btn",
    });

    this.resBtn = document.createElement("button");
    this.resBtn.type = "button";
    this.resBtn.className = "ds-li-dropdown-trigger";
    this.resBtn.innerHTML = `<span class="ds-li-dropdown-label">Resample: Auto</span>`;
    this.resBtn.appendChild(DSIcon("chevron-down", { size: 11 }));

    this.resNextBtn = Button({
      icon: "chevron-right",
      tooltip: "Next filter",
      className: "ds-li-arrow-btn",
    });

    this.resampleSelector.append(this.resPrevBtn.root, this.resBtn, this.resNextBtn.root);

    this.upscaleBtn = document.createElement("button");
    this.upscaleBtn.type = "button";
    this.upscaleBtn.className = "ds-ui-btn ds-li-upscale-btn";
    this.upscaleBtn.textContent = "Allow upscale";

    this.resampleRow.append(this.resampleSelector, this.upscaleBtn);
    this.card.append(this.resampleRow);

    // 6. Image Preview (Expands cleanly on vertical resize)
    this.previewContainer = document.createElement("div");
    this.previewContainer.className = "ds-li-preview-container";
    this.previewContainer.title = "Click to select or upload an image";

    this.previewImg = document.createElement("img");
    this.previewImg.className = "ds-li-preview-img";
    this.previewImg.style.display = "none";

    this.previewEmpty = document.createElement("div");
    this.previewEmpty.className = "ds-li-preview-empty";
    this.previewEmpty.innerHTML = `
      <div class="ds-li-preview-empty-title">Drop Image Here</div>
      <div class="ds-li-preview-empty-sub">or click to browse from input folder</div>
    `;

    this.previewBadge = document.createElement("span");
    this.previewBadge.className = "ds-li-preview-badge";
    this.previewBadge.style.display = "none";

    this.previewContainer.append(this.previewImg, this.previewEmpty, this.previewBadge);
    this.card.append(this.previewContainer);
  }

  bindEvents() {
    this.uploadBtn.root.addEventListener("click", (e) => {
      e.stopPropagation();
      this.openFilePicker();
    });

    this.previewContainer.addEventListener("click", (e) => {
      e.stopPropagation();
      this.openFilePicker();
    });

    this.filenameBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.openImageBrowser();
    });

    this.prevBtn.root.addEventListener("click", (e) => {
      e.stopPropagation();
      this.cycleImage(-1);
    });

    this.nextBtn.root.addEventListener("click", (e) => {
      e.stopPropagation();
      this.cycleImage(1);
    });

    // Mode Buttons
    for (const [id, btn] of Object.entries(this.modeButtons)) {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        persist(this.node, { mode: id });
        this.syncState();
      });
    }

    // Stepper Input
    const commitStepper = () => {
      const s = stateOf(this.node);
      const mode = s.mode;
      const limits = {
        max_mp: [0.01, 64, 0.05],
        longest_side: [8, 16384, 8],
        scale_factor: [0.01, 8, 0.05],
      }[mode];
      if (!limits) return;

      const raw = Number(String(this.stepperInput.value).replace(/[^0-9eE+.-]/g, ""));
      if (!Number.isFinite(raw)) {
        this.stepperInput.value = formatNumeric(s, mode);
        return;
      }
      let v = clamp(raw, limits[0], limits[1]);
      v = mode === "longest_side" ? Math.round(v) : Math.round(v * 100) / 100;
      persist(this.node, { [mode]: v });
      this.syncState();
    };

    this.stepperInput.addEventListener("change", commitStepper);
    this.stepperInput.addEventListener("blur", commitStepper);
    this.stepperInput.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        e.preventDefault();
        commitStepper();
        this.stepperInput.blur();
      } else if (e.key === "Escape") {
        e.preventDefault();
        const s = stateOf(this.node);
        this.stepperInput.value = formatNumeric(s, s.mode);
        this.stepperInput.blur();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        this.step(1, e.shiftKey ? 10 : 1);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        this.step(-1, e.shiftKey ? 10 : 1);
      }
    });

    // Stepper Repeat
    const startStep = (dir) => {
      this.step(dir);
      this.repeatTimer = setTimeout(() => {
        this.repeatInterval = setInterval(() => {
          this.step(dir);
        }, 90);
      }, 350);
    };

    const stopStep = () => {
      clearTimeout(this.repeatTimer);
      clearInterval(this.repeatInterval);
      this.repeatTimer = null;
      this.repeatInterval = null;
    };

    this.stepDownBtn.addEventListener("pointerdown", () => startStep(-1));
    this.stepDownBtn.addEventListener("pointerup", stopStep);
    this.stepDownBtn.addEventListener("pointerleave", stopStep);

    this.stepUpBtn.addEventListener("pointerdown", () => startStep(1));
    this.stepUpBtn.addEventListener("pointerup", stopStep);
    this.stepUpBtn.addEventListener("pointerleave", stopStep);

    // Snap Toggle
    this.snapToggleBtn.root.addEventListener("click", (e) => {
      e.stopPropagation();
      const s = stateOf(this.node);
      if (s.snap === 0) {
        const nextSnap = s.last_snap || 8;
        persist(this.node, { snap: nextSnap, last_snap: nextSnap });
      } else {
        persist(this.node, { snap: 0, last_snap: s.snap });
      }
      this.syncState();
    });

    for (const [valStr, btn] of Object.entries(this.snapValButtons)) {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const s = stateOf(this.node);
        if (s.snap === 0) return;
        const val = Number(valStr);
        persist(this.node, { snap: val, last_snap: val });
        this.syncState();
      });
    }

    // Resampling
    this.resPrevBtn.root.addEventListener("click", (e) => {
      e.stopPropagation();
      this.cycleResample(-1);
    });

    this.resNextBtn.root.addEventListener("click", (e) => {
      e.stopPropagation();
      this.cycleResample(1);
    });

    this.resBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.openResampleMenu();
    });

    // Upscale Guard
    this.upscaleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const s = stateOf(this.node);
      persist(this.node, { allow_upscale: !s.allow_upscale });
      this.syncState();
    });
  }

  step(dir, mult = 1) {
    const s = stateOf(this.node);
    const key = s.mode;
    const limits = {
      max_mp: [0.01, 64, 0.05],
      longest_side: [8, 16384, 8],
      scale_factor: [0.01, 8, 0.05],
    }[key];
    if (!limits) return;

    let v = Number(s[key]) + dir * limits[2] * mult;
    v = clamp(v, limits[0], limits[1]);
    v = key === "longest_side" ? Math.round(v) : Math.round(v * 100) / 100;
    persist(this.node, { [key]: v });
    this.syncState();
  }

  cycleResample(dir) {
    const s = stateOf(this.node);
    const i = RESAMPLES.indexOf(s.resample);
    const nextIdx = (i + dir + RESAMPLES.length) % RESAMPLES.length;
    persist(this.node, { resample: RESAMPLES[nextIdx] });
    this.syncState();
  }

  syncState() {
    const s = stateOf(this.node);

    // 1. Sync File selection label
    const fn = this.node._dsLIImageWidget?.value || "";
    this.node._dsLISelected = fn;
    const labelSpan = this.filenameBtn.querySelector(".ds-li-dropdown-label");
    if (labelSpan) {
      labelSpan.textContent = basename(fn) || "Choose image…";
    }

    // 2. Sync Mode buttons
    for (const [id, btn] of Object.entries(this.modeButtons)) {
      const active = s.mode === id;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    }

    // 3. Sync Mode details
    if (s.mode === "off") {
      this.modeDetails.style.display = "none";
    } else {
      this.modeDetails.style.display = "flex";

      const labels = {
        max_mp: "Max Megapixels",
        longest_side: "Longest side (px)",
        scale_factor: "Scale multiplier",
      };
      this.stepperLabel.textContent = labels[s.mode] || "Value";

      // Render preset buttons
      this.presetsRow.replaceChildren();
      const presets = PRESETS[s.mode] || [];
      const curVal = Number(s[s.mode]);
      for (const val of presets) {
        const pBtn = document.createElement("button");
        pBtn.type = "button";
        pBtn.className = "ds-ui-btn";
        pBtn.textContent =
          s.mode === "max_mp" ? `${val} MP` : s.mode === "scale_factor" ? `${val}x` : String(val);
        const active = Math.abs(curVal - val) < 1e-6;
        if (active) {
          pBtn.classList.add("is-active");
          pBtn.setAttribute("aria-pressed", "true");
        }
        pBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          persist(this.node, { [s.mode]: val });
          this.syncState();
        });
        this.presetsRow.appendChild(pBtn);
      }

      // Sync Stepper input
      if (document.activeElement !== this.stepperInput) {
        this.stepperInput.value = formatNumeric(s, s.mode);
      }
    }

    // 4. Sync Snap row (ZERO SNAP TEXT)
    const snapOn = s.snap > 0;
    this.snapToggleBtn.setActive(snapOn);
    this.snapGroup.classList.toggle("is-disabled", !snapOn);

    for (const [valStr, btn] of Object.entries(this.snapValButtons)) {
      const val = Number(valStr);
      btn.disabled = !snapOn;
      const active = snapOn && s.snap === val;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    }

    // 5. Sync Resample & Upscale
    const resName = s.resample[0].toUpperCase() + s.resample.slice(1);
    this.resBtn.querySelector(".ds-li-dropdown-label").textContent = `Resample: ${resName}`;

    this.upscaleBtn.textContent = s.allow_upscale ? "Allow upscale" : "Block upscale";
    this.upscaleBtn.classList.toggle("is-active", s.allow_upscale);

    // Ensure hidden state widget matches state
    const curJson = JSON.stringify(s);
    let sw = this.node.widgets?.find((w) => w?.name === STATE_WIDGET);
    if (!sw && this.node.addWidget) {
      sw = this.node.addWidget("text", STATE_WIDGET, curJson, () => {}, { hidden: true });
      sw.hidden = true;
      sw.computeSize = () => [0, 0];
      sw.type = "hidden";
      if (sw.element) sw.element.style.display = "none";
    }
    if (sw && sw.value !== curJson) {
      sw.value = curJson;
    }

    // Adjust minimum node height if needed
    const minH = getMinNodeHeight(this.node);
    if (this.node.size[1] < minH) {
      this.node.size[1] = minH;
    }
    this.node.setDirtyCanvas?.(true, true);
    refreshPreview(this.node);
  }

  setPreview(img, iw, ih, ow, oh) {
    if (!img || iw <= 0 || ih <= 0) {
      this.previewImg.style.display = "none";
      this.previewEmpty.style.display = "flex";
      this.previewBadge.style.display = "none";
      return;
    }
    this.previewImg.src = img.src;
    this.previewImg.style.display = "block";
    this.previewEmpty.style.display = "none";
    this.previewBadge.style.display = "block";
    this.previewBadge.textContent = `${iw} × ${ih}  →  ${ow} × ${oh} (${ratioText(ow, oh)})`;
  }

  getImagePool() {
    const cur = this.node._dsLIImageWidget?.value || "";
    if (this.node._dsLIFolderFiles?.length) {
      return this.node._dsLIFolderFiles;
    }
    const all = inputFiles(this.node);
    if (all.length) {
      const folder = folderOf(cur);
      const local = all.filter((x) => folderOf(x) === folder);
      return local.length ? local : all;
    }
    return [];
  }

  cycleImage(dir) {
    const pool = this.getImagePool();
    if (!pool.length) return;
    const cur = this.node._dsLIImageWidget?.value || "";
    const i = Math.max(0, pool.indexOf(cur));
    const nextFn = pool[(i + dir + pool.length) % pool.length];
    this.setImage(nextFn);
  }

  setImage(fn) {
    this.node._dsLISelected = fn;
    this.node._dsLILastFolder = folderOf(fn);
    if (isAbsolutePath(fn)) {
      this.node._dsLIFolder = folderOf(fn);
    }
    const w = this.node._dsLIImageWidget;
    if (w) {
      w.options = w.options || {};
      w.options.values = w.options.values || [];
      if (!w.options.values.includes(fn)) {
        w.options.values.push(fn);
      }
      w.value = fn;
      w.callback?.(fn);
    }
    this.node.properties["image"] = fn;
    persist(this.node);
    this.syncState();
  }

  async uploadFile(file) {
    if (!file) return;
    const ext = String(file.name || "").split(".").pop()?.toLowerCase();
    if (!IMAGE_EXTS.has(ext)) throw new Error("Unsupported image format.");

    const cur = this.node._dsLISelected || this.node._dsLIImageWidget?.value || "";
    const curFolder = folderOf(cur) || this.node._dsLILastFolder || "";

    const fd = new FormData();
    fd.append("image", file, file.name || `image-${Date.now()}.png`);
    fd.append("type", "input");
    fd.append("overwrite", "true");
    if (curFolder) {
      fd.append("subfolder", curFolder);
    }

    const res = await api.fetchApi("/upload/image", { method: "POST", body: fd });
    if (!res.ok) throw new Error(`Upload failed (${res.status}).`);
    const data = await res.json();
    if (!data?.name) throw new Error("ComfyUI did not return the uploaded filename.");

    const sub = data.subfolder || curFolder || "";
    const fn = sub ? `${sub}/${data.name}` : data.name;
    this.node._dsLILastFolder = sub;
    imageCache.delete(fn);

    const w = this.node._dsLIImageWidget;
    if (w) {
      w.options = w.options || {};
      w.options.values = w.options.values || [];
      if (!w.options.values.includes(fn)) {
        w.options.values.push(fn);
      }
    }
    this.setImage(fn);
  }

  async openFilePicker() {
    // 1. Try native OS file dialog via DeathshotArsenal backend
    try {
      const cur = this.node._dsLISelected || this.node._dsLIImageWidget?.value || "";
      const curFolder = this.node._dsLIFolder || (isAbsolutePath(cur) ? folderOf(cur) : "");
      const res = await api.fetchApi("/ds/load_image/browse_file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: curFolder }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.cancelled) return;
        if (data.path) {
          const path = String(data.path).replace(/\\/g, "/");
          const folder = String(data.folder || folderOf(path)).replace(/\\/g, "/");
          this.node._dsLIFolder = folder;
          const files = (data.files || []).map((x) => String(x.path || x.name || x).replace(/\\/g, "/"));
          this.node._dsLIFolderFiles = files.length ? files : [path];

          const w = this.node._dsLIImageWidget;
          if (w) {
            w.options = w.options || {};
            w.options.values = w.options.values || [];
            for (const f of this.node._dsLIFolderFiles) {
              if (!w.options.values.includes(f)) w.options.values.push(f);
            }
          }
          this.setImage(path);
          return;
        }
      }
    } catch (e) {
      console.warn("[DS Load Image] Native picker fallback:", e);
    }

    // 2. Fallback: Browser file input
    this.openBrowserFilePicker();
  }

  openBrowserFilePicker() {
    let input = document.getElementById("ds-li-file-picker");
    if (!input) {
      input = document.createElement("input");
      input.id = "ds-li-file-picker";
      input.type = "file";
      input.accept = ".png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff";
      input.style.cssText = "position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0";
      document.body.appendChild(input);
    }
    input.onchange = async () => {
      const f = input.files?.[0];
      input.value = "";
      if (f) {
        try {
          await this.uploadFile(f);
        } catch (e) {
          console.error("[DS Load Image] picker upload failed", e);
        }
      }
    };
    input.click();
  }

  openResampleMenu() {
    closePopups();
    const menu = document.createElement("div");
    menu.className = "ds-li-popup ds-li-resmenu";

    const s = stateOf(this.node);
    for (const id of RESAMPLES) {
      const b = document.createElement("button");
      b.className = id === s.resample ? "is-active" : "";
      b.innerHTML = `
        <b>${id[0].toUpperCase() + id.slice(1)}</b>
        <small>${RESAMPLE_NOTES[id] || ""}</small>
      `;
      b.onclick = (e) => {
        e.stopPropagation();
        persist(this.node, { resample: id });
        this.syncState();
        menu.remove();
      };
      menu.appendChild(b);
    }

    document.body.appendChild(menu);

    const rect = this.resBtn.getBoundingClientRect();
    menu.style.left = `${clamp(rect.left, 6, window.innerWidth - 230)}px`;
    menu.style.top = `${clamp(rect.bottom + 4, 6, window.innerHeight - menu.offsetHeight - 6)}px`;

    setTimeout(() => {
      document.addEventListener(
        "pointerdown",
        function close(e) {
          if (!menu.contains(e.target)) {
            menu.remove();
            document.removeEventListener("pointerdown", close, true);
          }
        },
        { once: true, capture: true }
      );
    }, 0);
  }

  openImageBrowser() {
    closePopups();
    const popup = document.createElement("div");
    popup.className = "ds-li-popup ds-li-browser";

    const curVal = this.node._dsLIImageWidget?.value || "";
    const pool = this.getImagePool();
    const activeFolder = this.node._dsLIFolder || (isAbsolutePath(curVal) ? folderOf(curVal) : "") || folderOf(curVal) || this.node._dsLILastFolder || "";
    const all = inputFiles(this.node);

    // Active folder pool has first priority; append any other input files not in pool
    const poolSet = new Set(pool);
    const otherFiles = all.filter((f) => !poolSet.has(f));
    const combined = [...pool, ...otherFiles];

    popup.innerHTML = `
      <div class="ds-li-browser-head">
        <input placeholder="Search images…" autocomplete="off" spellcheck="false">
        <span></span>
      </div>
      <div class="ds-li-browser-list"></div>
    `;
    document.body.appendChild(popup);

    const rect = this.filenameBtn.getBoundingClientRect();
    popup.style.left = `${clamp(rect.left, 6, window.innerWidth - 450)}px`;
    popup.style.top = `${clamp(rect.bottom + 4, 6, window.innerHeight - 440)}px`;

    const input = popup.querySelector("input");
    const count = popup.querySelector("span");
    const list = popup.querySelector(".ds-li-browser-list");

    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape") {
        e.preventDefault();
        popup.remove();
      }
    });

    const render = () => {
      const q = input.value.trim().toLowerCase();

      const scored = combined
        .map((fn) => {
          const inPool = poolSet.has(fn);
          let score = 0;

          if (q) {
            const base = basename(fn).toLowerCase();
            const full = fn.toLowerCase();
            if (base === q) score = inPool ? 0 : 1;
            else if (base.startsWith(q)) score = inPool ? 2 : 3;
            else if (base.includes(q)) score = inPool ? 4 : 5;
            else if (full.includes(q)) score = inPool ? 6 : 7;
            else score = 99;
          } else {
            // No search: all active folder pool images come first (score 0), other files come next (score 10)
            score = inPool ? 0 : 10;
          }
          return { fn, score, inPool };
        })
        .filter((x) => x.score < 99);

      scored.sort((a, b) => {
        if (a.score !== b.score) return a.score - b.score;
        return a.fn.localeCompare(b.fn, undefined, { numeric: true, sensitivity: "base" });
      });

      count.textContent = `${scored.length} images` + (activeFolder ? ` · 📁 ${basename(activeFolder) || activeFolder}` : "");
      list.replaceChildren();

      // Render all matching images from the folder without arbitrary slice cutoffs
      for (const { fn } of scored) {
        const row = document.createElement("button");
        row.className = "ds-li-browser-row" + (fn === curVal ? " is-active" : "");
        const img = document.createElement("img");
        img.loading = "lazy";
        img.decoding = "async";
        img.src = thumbnailURL(fn);
        img.alt = "";

        const meta = document.createElement("div");
        meta.className = "meta";
        const name = document.createElement("div");
        name.className = "name";
        name.textContent = basename(fn);
        const sub = document.createElement("div");
        sub.className = "sub";
        const fDisplay = isAbsolutePath(fn) ? (basename(folderOf(fn)) || folderOf(fn)) : (folderOf(fn) || "input/");
        sub.textContent = fDisplay;

        img.onload = () => {
          sub.textContent = `${fDisplay} · ${img.naturalWidth || 0} × ${img.naturalHeight || 0}`;
        };

        meta.append(name, sub);
        row.append(img, meta);

        row.onclick = (e) => {
          e.stopPropagation();
          this.setImage(fn);
          popup.remove();
        };

        list.appendChild(row);
      }
    };

    input.oninput = render;
    render();
    setTimeout(() => input.focus(), 20);

    setTimeout(() => {
      document.addEventListener(
        "pointerdown",
        function close(e) {
          if (!popup.contains(e.target)) {
            popup.remove();
            document.removeEventListener("pointerdown", close, true);
          }
        },
        { once: true, capture: true }
      );
    }, 0);
  }
}

function installDrop() {
  if (window.__dsLoadImageDropInstalled) return;
  window.__dsLoadImageDropInstalled = true;

  document.addEventListener(
    "dragover",
    (e) => {
      const n = pointNode(e);
      document.querySelectorAll(".ds-li-drop-outline").forEach((x) => x.remove());
      if (!n || n.type !== TYPE || !e.dataTransfer?.types?.includes("Files")) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      showDropOutline(n, true);
    },
    true
  );

  document.addEventListener(
    "drop",
    async (e) => {
      const n = pointNode(e);
      if (!n || n.type !== TYPE) return;
      const f = e.dataTransfer?.files?.[0];
      if (!f) return;
      e.preventDefault();
      e.stopPropagation();
      showDropOutline(n, false);
      if (n._dsLIController) {
        try {
          await n._dsLIController.uploadFile(f);
        } catch (err) {
          console.error("[DS Load Image] Drop upload error:", err);
        }
      }
    },
    true
  );
}

function pointNode(e) {
  try {
    const p = app.canvas?.convertEventToCanvasOffset?.(e);
    return p ? app.graph?.getNodeOnPos?.(p[0], p[1]) : null;
  } catch {
    return null;
  }
}

function showDropOutline(node, on) {
  if (!node._dsLIDrop && on) {
    const d = document.createElement("div");
    d.className = "ds-li-drop-outline";
    d.textContent = "📂 Drop Image to Load";
    document.body.appendChild(d);
    node._dsLIDrop = d;
    positionDropOutline(node);
  } else if (!on && node._dsLIDrop) {
    node._dsLIDrop.remove();
    node._dsLIDrop = null;
  }
}

function positionDropOutline(node) {
  if (!node._dsLIDrop) return;
  const c = app.canvas?.canvas;
  if (!c) return;
  const ds = app.canvas?.ds;
  const r = c.getBoundingClientRect();
  if (!ds) return;
  const x = r.left + (node.pos[0] + ds.offset[0]) * ds.scale;
  const y = r.top + (node.pos[1] + ds.offset[1]) * ds.scale;
  node._dsLIDrop.style.left = `${x}px`;
  node._dsLIDrop.style.top = `${y}px`;
  node._dsLIDrop.style.width = `${node.size[0] * ds.scale}px`;
  node._dsLIDrop.style.height = `${node.size[1] * ds.scale}px`;
}

function install(node) {
  if (node._dsLIInstalled) return;
  node._dsLIInstalled = true;
  node.resizable = true;
  node.properties = node.properties || {};

  installDSUI();
  loadCSS();

  // Hide default combo and hidden state widgets from native LiteGraph canvas
  const imgW = node.widgets?.find((x) => x?.name === "image");
  node._dsLIImageWidget = imgW;

  let stateWidget = node.widgets?.find((x) => x?.name === STATE_WIDGET);
  if (!stateWidget && node.addWidget) {
    stateWidget = node.addWidget("text", STATE_WIDGET, JSON.stringify(stateOf(node)), () => {}, { hidden: true });
  }

  for (const w of node.widgets || []) {
    if (w.name === STATE_WIDGET || w.name === "image") {
      w.hidden = true;
      w.computeSize = () => [0, 0];
      w.type = "hidden";
      if (w.element) w.element.style.display = "none";
    }
  }

  if (stateWidget && (!stateWidget.value || stateWidget.value === "{}" || stateWidget.value === "")) {
    stateWidget.value = JSON.stringify(stateOf(node));
  }

  // Construct UI Controller & Card
  const controller = new DSLoadImageController(node);
  node._dsLIController = controller;

  // Set initial dimensions with full height & width
  const minH = getMinNodeHeight(node);
  node.min_size = [MIN_W, minH];
  node.size = [
    Math.max(MIN_W, Number(node.size?.[0] || DEFAULT_W)),
    Math.max(minH, Number(node.size?.[1] || DEFAULT_H)),
  ];

  node.computeSize = function () {
    return [MIN_W, getMinNodeHeight(this)];
  };

  node.widgets_start_y = WIDGET_START_Y;

  // Add DOM widget following PRD Rule D (margin: 5, dynamic height stretching to base)
  const domWidget = node.addDOMWidget("ds_ui", "custom", controller.card.root, {
    serialize: false,
    margin: CARD_MARGIN,
    getMinHeight: () => getMinCardHeight(node) + (CARD_MARGIN * 2),
    getMaxHeight: () => {
      const widgetY = Number(domWidget?.y ?? node.widgets_start_y ?? WIDGET_START_Y);
      const nodeHeight = Number(node.size?.[1] ?? 0);
      return Math.max(
        getMinCardHeight(node) + (CARD_MARGIN * 2),
        nodeHeight - widgetY,
      );
    },
  });
  domWidget.y = WIDGET_START_Y;
  node._dsDOMWidget = domWidget;

  normalizeDSWidgetHost(controller.card.root, node, { shell: false });

  // PRD Rule E: Resize-Corner Hit Testing Must Not Change Layout
  const originalGetWidgetOnPos = node.getWidgetOnPos;
  node.getWidgetOnPos = function (canvasX, canvasY, includeDisabled = false) {
    const x = Number(canvasX) - Number(this.pos?.[0] ?? 0);
    const y = Number(canvasY) - Number(this.pos?.[1] ?? 0);
    const w = Number(this.size?.[0] ?? 0);
    const h = Number(this.size?.[1] ?? 0);
    const handle = Number(this.constructor?.resizeHandleSize) || 15;

    const inLeft = x <= handle;
    const inRight = x >= w - handle;
    const inTop = y <= handle;
    const inBottom = y >= h - handle;

    if ((inLeft || inRight) && (inTop || inBottom)) {
      return undefined;
    }

    return originalGetWidgetOnPos
      ? originalGetWidgetOnPos.call(this, canvasX, canvasY, includeDisabled)
      : undefined;
  };

  // Resize bounds: Horizontal AND Vertical resizing freely allowed above floor minimum
  const oldResize = node.onResize;
  node.onResize = function (size) {
    const minHeight = getMinNodeHeight(this);
    size[0] = Math.max(MIN_W, size[0]);
    size[1] = Math.max(minHeight, size[1]);
    this.size[0] = size[0];
    this.size[1] = size[1];
    const r = oldResize?.apply(this, arguments);
    this.setDirtyCanvas?.(true, true);
    return r;
  };

  const oldSetSize = node.setSize;
  node.setSize = function (size) {
    const minHeight = getMinNodeHeight(this);
    size[0] = Math.max(MIN_W, size[0]);
    size[1] = Math.max(minHeight, size[1]);
    const r = oldSetSize ? oldSetSize.call(this, size) : undefined;
    this.size = size;
    this.setDirtyCanvas?.(true, true);
    return r;
  };

  // Node removal cleanup
  const oldRemoved = node.onRemoved;
  node.onRemoved = function () {
    closePopups();
    node._dsLIDrop?.remove();
    node._dsLIDrop = null;
    return oldRemoved?.apply(this, arguments);
  };

  controller.syncState();
  installDrop();
}

async function fetchFolderFiles(node, folder) {
  if (!folder) return;
  try {
    const res = await api.fetchApi("/ds/load_image/folder_files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.files?.length) {
        const files = data.files.map((x) => String(x.path || x.name || x).replace(/\\/g, "/"));
        node._dsLIFolderFiles = files;
        const w = node._dsLIImageWidget;
        if (w) {
          w.options = w.options || {};
          w.options.values = w.options.values || [];
          for (const f of files) {
            if (!w.options.values.includes(f)) w.options.values.push(f);
          }
        }
      }
    }
  } catch (_) {}
}

function patchType(nodeType, nodeData) {
  if (nodeData.name !== TYPE) return;

  nodeType.prototype.computeSize = function () {
    return [MIN_W, getMinNodeHeight(this)];
  };

  const created = nodeType.prototype.onNodeCreated;
  nodeType.prototype.onNodeCreated = function () {
    const r = created?.apply(this, arguments);
    install(this);
    return r;
  };

  const configured = nodeType.prototype.onConfigure;
  nodeType.prototype.onConfigure = function (serialized) {
    const r = configured?.apply(this, arguments);
    install(this);

    if (serialized?.properties?.[STATE_PROP]) {
      this.properties[STATE_PROP] = serialized.properties[STATE_PROP];
    } else {
      const sw = this.widgets?.find((w) => w?.name === STATE_WIDGET);
      if (sw?.value && sw.value !== "{}" && sw.value !== "") {
        this.properties[STATE_PROP] = sw.value;
      }
    }
    if (serialized?.properties?.["image"]) {
      this._dsLISelected = serialized.properties["image"];
      if (this._dsLIImageWidget) this._dsLIImageWidget.value = this._dsLISelected;
      if (isAbsolutePath(this._dsLISelected)) {
        const folder = folderOf(this._dsLISelected);
        this._dsLIFolder = folder;
        fetchFolderFiles(this, folder);
      }
    }

    const curState = stateOf(this);
    const sw = this.widgets?.find((w) => w?.name === STATE_WIDGET);
    if (sw) {
      sw.value = JSON.stringify(curState);
    }

    if (this._dsLIController) {
      this._dsLIController.syncState();
    }
    refreshPreview(this);
    return r;
  };

  const serialize = nodeType.prototype.onSerialize;
  nodeType.prototype.onSerialize = function (o) {
    const r = serialize?.apply(this, arguments);
    o.properties = o.properties || {};
    o.properties[STATE_PROP] = this.properties[STATE_PROP];
    o.properties["image"] = this._dsLISelected || this._dsLIImageWidget?.value || "";
    const sw = this.widgets?.find((w) => w?.name === STATE_WIDGET);
    if (sw && this.properties[STATE_PROP]) {
      sw.value = this.properties[STATE_PROP];
    }
    return r;
  };

  // Draw HUD in the empty canvas space at the top beside output sockets
  const oldDrawForeground = nodeType.prototype.onDrawForeground;
  nodeType.prototype.onDrawForeground = function (ctx) {
    const r = oldDrawForeground?.apply(this, arguments);
    if (!this.flags?.collapsed) {
      drawComparison(ctx, this);
    }
    return r;
  };
}

app.registerExtension({
  name: EXT,
  setup() {
    installDSUI();
    loadCSS();
    installDrop();
  },
  beforeRegisterNodeDef(nodeType, nodeData) {
    patchType(nodeType, nodeData);
  },
});
