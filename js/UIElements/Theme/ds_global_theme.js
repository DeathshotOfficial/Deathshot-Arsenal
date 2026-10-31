/**
 * DS Global Theme Engine
 * DeathshotArsenal — centralized appearance manager
 *
 * Applies theme, font, and font-size to all DeathshotArsenal node UIs.
 * Also tints the ComfyUI/LiteGraph node base (title bar, body, border) so
 * custom DOM overlays sit on matching theme colors instead of default gray.
 * Scoped exclusively to DS nodes — never touches ComfyUI core or third-party nodes.
 */

import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";
import {
  normalizeDSWidgetHost,
  protectDSResizeCorners,
  installDSCanvasNavigationBridge,
} from "../Core/system.js";
import { installDSUI } from "../index.js";
import { ensureFxLayer, setFx } from "./fx.js";

const DS_NODE_PREFIX = "DS_";

const DS_SHELL_ROOT_SELECTOR = [
  '[class*="ds-"][class*="-root"]',
  '[class*="ds-"][class*="-wrapper"]',
  ".ds-sysdash-root",
  ".monitor-node-container",
  ".ds-forge-root",
  ".ds-image-saver-ui",
  ".ds-hw-root",
  ".ds-run-timer-root",
].join(", ");

const DS_ROOT_SELECTOR = [
  '[class*="ds-"][class*="-root"]',
  '[class*="ds-"][class*="-wrapper"]',
  ".ds-sysdash-root",
  ".monitor-node-container",
  ".ds-forge-root",
  ".ds-image-saver-ui",
  "#ds-hud-overlay",
  '[data-ds-themed="true"]',
].join(", ");

const DS_TITLE_SELECTOR = [
  '[data-ds-themed="true"] [class*="title"]',
  '[data-ds-themed="true"] [class*="header"]',
  '[data-ds-themed="true"] .ds-drag-handle',
  '[data-ds-themed="true"] .ds-header-left',
  '[data-ds-themed="true"] .ds-node-header',
  '[data-ds-themed="true"] .ds-qs-header',
  '[data-ds-themed="true"] .ds-spec-title',
  '[data-ds-themed="true"] .node-title',
].join(", ");

// custom: per-theme variable overrides, { [themeId]: { "--ds-accent": "#..." } }
// motion: live-theme effects — "on", "pause_on_run" (paused while a prompt runs) or "off"
const DEFAULT_CONFIG = {
  theme: "deathshot_dark",
  font: "Inter",
  fontSize: 14,
  downloadedFonts: [],
  custom: {},
  motion: "on",
};

const GOOGLE_FONT_LINK_ID = "ds-global-font-link";
const LOCAL_FONT_STYLE_ID = "ds-global-font-local";
const GLOBAL_STYLE_ID = "ds-global-theme-style";

let themes = {};
const STORAGE_GLOBAL_CONFIG = "DS_THEME_GLOBAL_CONFIG";

// Older configs stored one flat override map that leaked onto every theme;
// it belongs to the theme that was active when it was saved.
function normalizeConfig(cfg) {
  const merged = { ...DEFAULT_CONFIG, ...(cfg || {}) };
  const custom = merged.custom || {};
  const keys = Object.keys(custom);
  if (keys.length && keys.every((k) => k.startsWith("--"))) {
    merged.custom = { [merged.theme]: custom };
  }
  return merged;
}

let cachedConfig = null;
try {
  const raw = localStorage.getItem(STORAGE_GLOBAL_CONFIG);
  if (raw) cachedConfig = JSON.parse(raw);
} catch (_) {}
let config = normalizeConfig(cachedConfig);
let ready = false;
let observer = null;
let queueRunning = false;
// Theme currently painted on the page; differs from config while previewing.
let appliedTheme = null;
const loadedFontLinks = new Set();

function fontFamilyStack(name) {
  const safe = (name || "Inter").replace(/"/g, "");
  return `"${safe}", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
}

function hexToRgbTriplet(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
  if (!m) return "103, 232, 249";
  return `${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}`;
}

function googleFontParam(name) {
  return encodeURIComponent(name).replace(/%20/g, "+");
}

function getTheme(id, cfg = config) {
  const targetId = id || cfg.theme || "deathshot_dark";
  const base = themes[targetId] || themes.deathshot_dark || null;
  if (!base) return null;
  const custom = cfg.custom?.[targetId];
  if (custom && Object.keys(custom).length > 0) {
    return { ...base, vars: { ...(base.vars || {}), ...custom } };
  }
  return base;
}

function isDSNode(node) {
  const name = String(node?.comfyClass || node?.type || node?.constructor?.name || node?.constructor?.type || "");
  return Boolean(
    name.startsWith(DS_NODE_PREFIX) ||
    name.startsWith("DSGif") ||
    node?.comfyClass?.startsWith(DS_NODE_PREFIX) ||
    node?.type?.startsWith(DS_NODE_PREFIX) ||
    node?.constructor?.name?.startsWith(DS_NODE_PREFIX) ||
    node?.constructor?.type?.startsWith(DS_NODE_PREFIX)
  );
}

function nodeHidesChrome(node) {
  const mode = node?.title_mode;
  if (mode == null) return false;
  const noTitle = typeof LiteGraph !== "undefined" && LiteGraph.NO_TITLE;
  return mode === noTitle || mode === 2 || mode === "none";
}

function isTransparentColor(color) {
  if (color == null) return false;
  if (Array.isArray(color)) return color.length > 3 && Number(color[3]) === 0;
  const s = String(color).trim().toLowerCase();
  if (!s || s === "transparent") return true;
  if (/^#[0-9a-f]{8}$/i.test(s) && s.slice(7, 9) === "00") return true;
  if (s.startsWith("rgba")) {
    const alpha = s.split(",").pop()?.trim().replace(")", "");
    return alpha === "0" || alpha === "0.0";
  }
  return false;
}

// Colors the engine painted itself are remembered in node._dsBaseColors so a
// theme change can repaint them; anything else on the node is the user's.
function hasCustomNodeColors(node) {
  const props = node?.properties || {};
  if (props.node_color || props.ds_bg_color || props.ds_title_color) return true;
  if (!node?.color && !node?.bgcolor) return false;
  const own = node._dsBaseColors;
  if (!own) return true;
  return node.color !== own.color || node.bgcolor !== own.bgcolor;
}

function shouldSkipNodeBase(node) {
  if (!isDSNode(node)) return true;
  if (node._dsNodeBaseOptOut) return true;
  if (hasCustomNodeColors(node)) return true;
  return false;
}

function solidCanvasColor(color, fallback) {
  if (!color) return fallback;
  const s = String(color).trim();
  if (s.startsWith("rgba")) {
    const m = s.match(/rgba?\(\s*([^)]+)\)/i);
    if (m) {
      const parts = m[1].split(",").map((p) => p.trim());
      if (parts.length >= 3) return `rgb(${parts[0]}, ${parts[1]}, ${parts[2]})`;
    }
    return fallback;
  }
  if (/^#[0-9a-f]{8}$/i.test(s)) return s.slice(0, 7);
  return s;
}

function hslToRgb(h, sat, l) {
  const c = (1 - Math.abs(2 * l - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const mVal = l - c / 2;
  let r1 = 0, g1 = 0, b1 = 0;
  if (h < 60) { r1 = c; g1 = x; }
  else if (h < 120) { r1 = x; g1 = c; }
  else if (h < 180) { g1 = c; b1 = x; }
  else if (h < 240) { g1 = x; b1 = c; }
  else if (h < 300) { r1 = x; b1 = c; }
  else { r1 = c; b1 = x; }
  return [
    Math.round((r1 + mVal) * 255),
    Math.round((g1 + mVal) * 255),
    Math.round((b1 + mVal) * 255)
  ];
}

let _scratchCanvasCtx = null;
function getScratchCanvasCtx() {
  if (!_scratchCanvasCtx && typeof document !== "undefined") {
    try {
      const c = document.createElement("canvas");
      c.width = 1;
      c.height = 1;
      _scratchCanvasCtx = c.getContext("2d", { willReadFrequently: true });
    } catch (_) {}
  }
  return _scratchCanvasCtx;
}

function parseCssColor(color) {
  if (!color || typeof color !== "string") return null;
  const s = color.trim();
  if (!s || s === "transparent") return null;

  // 1. 6-digit hex #RRGGBB
  let m = /^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(s);
  if (m) return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];

  // 2. 3-digit hex #RGB
  m = /^#([a-f\d])([a-f\d])([a-f\d])$/i.exec(s);
  if (m) return [parseInt(m[1] + m[1], 16), parseInt(m[2] + m[2], 16), parseInt(m[3] + m[3], 16)];

  // 3. 8-digit hex #RRGGBBAA
  m = /^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})[a-f\d]{2}$/i.exec(s);
  if (m) return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];

  // 4. 4-digit hex #RGBA
  m = /^#([a-f\d])([a-f\d])([a-f\d])[a-f\d]$/i.exec(s);
  if (m) return [parseInt(m[1] + m[1], 16), parseInt(m[2] + m[2], 16), parseInt(m[3] + m[3], 16)];

  // 5. rgb(...) / rgba(...)
  if (s.startsWith("rgb")) {
    const nums = s.match(/[\d.]+/g);
    if (nums && nums.length >= 3) {
      return [Math.round(Number(nums[0])), Math.round(Number(nums[1])), Math.round(Number(nums[2]))];
    }
  }

  // 6. hsl(...) / hsla(...)
  if (s.startsWith("hsl")) {
    const nums = s.match(/[\d.]+/g);
    if (nums && nums.length >= 3) {
      const h = Number(nums[0]) % 360;
      const sat = Number(nums[1]) / 100;
      const l = Number(nums[2]) / 100;
      return hslToRgb(h, sat, l);
    }
  }

  // 7. Common color names
  const lower = s.toLowerCase();
  if (lower === "white" || lower === "snow" || lower === "ivory") return [255, 255, 255];
  if (lower === "black") return [0, 0, 0];
  if (lower === "lightgray" || lower === "lightgrey") return [211, 211, 211];
  if (lower === "gray" || lower === "grey") return [128, 128, 128];
  if (lower === "darkgray" || lower === "darkgrey") return [169, 169, 169];

  // 8. Native canvas parse for any other valid CSS color string
  const scratch = getScratchCanvasCtx();
  if (scratch) {
    try {
      scratch.fillStyle = "#000000";
      scratch.fillStyle = s;
      const computed = scratch.fillStyle;
      if (computed !== "#000000" || lower === "black" || s === "#000" || s === "#000000") {
        if (computed.startsWith("#")) {
          const r = parseInt(computed.slice(1, 3), 16);
          const g = parseInt(computed.slice(3, 5), 16);
          const b = parseInt(computed.slice(5, 7), 16);
          if (!isNaN(r) && !isNaN(g) && !isNaN(b)) return [r, g, b];
        } else if (computed.startsWith("rgb")) {
          const nums = computed.match(/[\d.]+/g);
          if (nums && nums.length >= 3) {
            return [Number(nums[0]), Number(nums[1]), Number(nums[2])];
          }
        }
      }
    } catch (_) {}
  }

  return null;
}

function getRelativeLuminance(color) {
  const rgb = parseCssColor(color);
  if (!rgb) return 0.2;
  const toLinear = (v) => {
    const val = v / 255;
    return val <= 0.04045 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
  };
  const r = toLinear(rgb[0]);
  const g = toLinear(rgb[1]);
  const b = toLinear(rgb[2]);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function getLuminance(color) {
  return getRelativeLuminance(color);
}

function getContrastTextColor(bgColor, darkText = "#111827", lightText = "#ffffff") {
  return getRelativeLuminance(bgColor) > 0.45 ? darkText : lightText;
}

function computeSmartContrastVars(theme) {
  const vars = theme?.vars || {};
  const accent = vars["--ds-accent"] || vars["--accent"] || "#67e8f9";
  const panel = vars["--ds-panel"] || vars["--panel"] || "#12151c";
  const bg = vars["--ds-bg"] || vars["--bg"] || panel;
  const rawText = vars["--ds-text"] || vars["--text"] || "#e5e7eb";

  const accentLum = getRelativeLuminance(accent);
  const panelLum = getRelativeLuminance(panel);
  const bgLum = getRelativeLuminance(bg);
  const textLum = getRelativeLuminance(rawText);

  // When accent is bright (e.g. Cyberpunk yellow, lime, cyan, white), text on accent MUST be dark
  const isBrightAccent = accentLum > 0.40;
  const onAccent = isBrightAccent ? "#0a0c10" : "#ffffff";
  const onAccentMuted = isBrightAccent ? "rgba(10, 12, 16, 0.72)" : "rgba(255, 255, 255, 0.75)";
  const onAccentShadow = isBrightAccent ? "0 1px 0 rgba(255, 255, 255, 0.35)" : "0 1px 2px rgba(0, 0, 0, 0.70)";

  // Ensure readable text on panel & background if default theme text lacks contrast (delta < 0.25)
  let onPanel = rawText;
  if (Math.abs(textLum - panelLum) < 0.25) {
    onPanel = panelLum > 0.45 ? "#0a0c10" : "#ffffff";
  }

  let onBg = rawText;
  if (Math.abs(textLum - bgLum) < 0.25) {
    onBg = bgLum > 0.45 ? "#0a0c10" : "#ffffff";
  }

  return {
    "--ds-on-accent": onAccent,
    "--ds-accent-contrast": onAccent,
    "--ds-accent-text": onAccent,
    "--ds-on-accent-muted": onAccentMuted,
    "--ds-on-accent-shadow": onAccentShadow,
    "--ds-on-panel": onPanel,
    "--ds-on-bg": onBg,
    "--ds-stitch-accent": accent,
    "--ds-stitch-fill-text": onAccent,
    "--ds-stitch-fill-shadow": onAccentShadow,
    "--ds-stitch-track-text": onPanel,
  };
}

function computeOverhaulVars(theme) {
  const vars = theme?.vars || {};
  const accent = vars["--ds-accent"] || vars["--accent"] || "#67e8f9";
  const panel = vars["--ds-panel"] || vars["--panel"] || "#12151c";
  const bg = vars["--ds-bg"] || vars["--bg"] || "#0b0d12";
  const border = vars["--ds-border"] || vars["--border"] || "#242a36";
  const text = vars["--ds-text"] || vars["--text"] || "#e5e7eb";
  const textMuted = vars["--ds-text-muted"] || vars["--text-muted"] || "#9ca3af";
  const panel2 = vars["--ds-panel-2"] || vars["--panel-2"] || "#161a23";
  const btnBg = vars["--ds-btn-bg"] || panel2;
  const btnHover = vars["--ds-btn-hover"] || "#1e2433";
  const danger = vars["--ds-danger"] || "#f87171";
  const success = vars["--ds-success"] || "#34d399";
  const smartVars = computeSmartContrastVars(theme);

  return {
    "--ds-color-base": bg,
    "--ds-color-card": panel,
    "--ds-color-card-border": border,
    "--ds-color-panel-2": panel2,
    "--ds-color-accent": accent,
    "--ds-color-accent-hover": vars["--ds-accent-2"] || accent,
    "--ds-color-accent-active": vars["--ds-active"] || accent,
    "--ds-color-focus-ring": `color-mix(in srgb, ${accent} 25%, transparent)`,
    "--ds-color-text": text,
    "--ds-color-muted-text": textMuted,
    "--ds-color-on-accent": smartVars["--ds-on-accent"] || "#0a0c10",
    "--ds-color-on-accent-shadow": smartVars["--ds-on-accent-shadow"] || "0 1px 0 rgba(255, 255, 255, 0.35)",
    "--ds-color-on-panel": smartVars["--ds-on-panel"] || text,
    "--ds-color-border": border,
    "--ds-color-border-hover": vars["--ds-border-active"] || accent,
    "--ds-color-danger": danger,
    "--ds-color-success": success,
    "--ds-btn-bg": btnBg,
    "--ds-btn-hover": btnHover,
    "--ds-btn-active": vars["--ds-active"] || "#253044",
    "--ds-btn-text": text,
    "--ds-btn-border": border,
    "--ds-input-bg": vars["--ds-input-bg"] || panel2,
    "--ds-scrollbar": vars["--ds-scrollbar"] || border,
    "--ds-selection": vars["--ds-selection"] || `color-mix(in srgb, ${accent} 25%, transparent)`,
    "--ds-shadow": vars["--ds-shadow"] || "0 8px 24px rgba(0, 0, 0, 0.6)",
    "--ds-glow": vars["--ds-glow"] || "none",
    "--ds-fx-a": vars["--ds-fx-a"] || accent,
    "--ds-fx-b": vars["--ds-fx-b"] || vars["--ds-accent-2"] || accent,
  };
}

function resolveVars(theme) {
  return { ...(theme?.vars || {}), ...computeSmartContrastVars(theme), ...computeOverhaulVars(theme) };
}

function getNodeTitleBarBg(node, theme) {
  const candidates = [
    node?._dsTitleBg,
    node?.color,
    node?.renderingColor,
    node?.constructor?.title_color,
    node?.constructor?.color,
    window.LiteGraph?.NODE_DEFAULT_COLOR,
    window.LiteGraph?.NODE_TITLE_COLOR,
    getNodeBasePalette(theme || getTheme(config.theme))?.panel,
    "#12151c",
  ];

  for (const c of candidates) {
    if (!c) continue;
    const val = typeof c === "function" ? "" : String(c).trim();
    if (!val || val === "transparent" || isTransparentColor(val)) continue;
    const rgb = parseCssColor(val);
    if (rgb) return val;
  }
  return "#12151c";
}

function getSmartTitleTextColor(node, isSelected = false, theme = null) {
  const bg = getNodeTitleBarBg(node, theme);
  const lum = getRelativeLuminance(bg);

  if (lum > 0.45) {
    // Light title bar (e.g. ComfyUI Light Theme, Sakura, Frost, Arctic, Minimal Gray, or bright custom node)
    return isSelected ? "#000000" : "#0f172a";
  } else {
    // Dark title bar (e.g. Deathshot Dark, AMOLED, ComfyUI Dark, or dark custom node)
    return isSelected ? "#ffffff" : "#f1f5f9";
  }
}

function truncateTitle(ctx, text, maxWidth) {
  if (maxWidth <= 0) return "";
  if (ctx.measureText(text).width <= maxWidth) return text;
  const ellipsis = "…";
  const ellipsisWidth = ctx.measureText(ellipsis).width;
  if (ellipsisWidth >= maxWidth) return ellipsis;
  let low = 0;
  let high = text.length;
  let best = 0;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const sub = text.substring(0, mid);
    if (ctx.measureText(sub).width + ellipsisWidth <= maxWidth) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return text.substring(0, best) + ellipsis;
}

function drawSmartTitleText(node, ctx, arg2, arg3, arg4, arg5, arg6) {
  if (!node || !ctx) return;

  let titleHeight = window.LiteGraph?.NODE_TITLE_HEIGHT ?? 30;
  let size = node.renderingSize || node.size || [140, 60];
  let scale = 1;
  let fontStyle = node.titleFontStyle;
  let isSelected = Boolean(node.selected);

  if (typeof arg2 === "object" && arg2 !== null) {
    const opts = arg2;
    if (opts.low_quality) return;
    if (opts.title_height != null) titleHeight = opts.title_height;
    if (opts.scale != null) scale = opts.scale;
    if (opts.default_title_color && !node.title_text_color) {
      node.title_text_color = opts.default_title_color;
    }
  } else {
    if (typeof arg2 === "number") titleHeight = arg2;
    if (Array.isArray(arg3)) size = arg3;
    if (typeof arg4 === "number") scale = arg4;
    if (typeof arg5 === "string" && arg5) fontStyle = arg5;
    if (typeof arg6 === "boolean") isSelected = arg6;
  }

  const noTitle = window.LiteGraph?.NO_TITLE ?? 1;
  if (node.title_mode === noTitle || node.title_mode === 2 || node.title_mode === "none") {
    return;
  }

  const rawTitle = (typeof node.getTitle === "function" ? node.getTitle() : node.title) ?? `❌ ${node.type || "Node"}`;
  const fullText = String(rawTitle) + (node.pinned ? " 📌" : "");
  if (!fullText) return;

  let availWidth = (size[0] || 140) - titleHeight * 2;
  if (node._dsAnyPlusHit || node.type?.includes("Switch")) {
    availWidth = Math.min(availWidth, (size[0] || 140) - 52);
  }
  if (node.title_buttons?.length > 0) {
    let btnWidth = 0;
    const savedFont = ctx.font;
    for (const btn of node.title_buttons) {
      if (btn.visible && typeof btn.getWidth === "function") {
        btnWidth += btn.getWidth(ctx) + 2;
      }
    }
    ctx.font = savedFont;
    if (btnWidth > 0) {
      availWidth -= Math.max(0, btnWidth - 20);
    }
  }

  let font = fontStyle || node.titleFontStyle || "12px sans-serif";
  if (isSelected && !/\bbold\b/i.test(font)) {
    font = "bold " + font;
  }
  ctx.font = font;
  ctx.textAlign = "left";

  let displayText = fullText;
  const isCollapsed = Boolean(node.flags?.collapsed || node.collapsed);
  if (isCollapsed) {
    displayText = fullText.length > 20 ? fullText.substring(0, 20) + "…" : fullText;
  } else if (availWidth > 0) {
    displayText = truncateTitle(ctx, fullText, availWidth);
  }

  ctx.fillStyle = getSmartTitleTextColor(node, isSelected);

  const textY = (window.LiteGraph?.NODE_TITLE_TEXT_Y ?? 20) - titleHeight;
  ctx.fillText(displayText, titleHeight, textY);
}

function getNodeBasePalette(theme) {
  const vars = theme?.vars || {};
  const panel = solidCanvasColor(vars["--ds-panel"] || vars["--panel"], "#12151c");
  const bg = solidCanvasColor(vars["--ds-bg"] || vars["--bg"], panel);
  const border = solidCanvasColor(vars["--ds-border"] || vars["--border"], "#242a36");
  const text = solidCanvasColor(vars["--ds-text"] || vars["--text"], "#e5e7eb");
  const accent = solidCanvasColor(vars["--ds-accent"] || vars["--accent"], "#67e8f9");
  const smart = computeSmartContrastVars(theme);
  const onAccent = smart["--ds-on-accent"];
  const onAccentShadow = smart["--ds-on-accent-shadow"];
  const onPanel = smart["--ds-on-panel"];
  const onBg = smart["--ds-on-bg"];
  const titleColor = getContrastTextColor(panel, text, "#ffffff");
  return { panel, bg, border, text, accent, onAccent, onAccentShadow, onPanel, onBg, titleColor };
}

// The node face is the node's first DOM widget. Theme variables reach it by
// inheritance from :root, so it only needs a marker and the effects overlay.
function markNodeFace(node) {
  const el = node?.widgets?.find((w) => w?.element?.nodeType === 1)?.element;
  if (!el) return;
  el.dataset.dsFace = "true";
  const isCard = el.classList.contains("ds-ui-card") || el.dataset.dsUiHost === "true" || el.querySelector(".ds-ui-card");
  const isBare = el.classList.contains("ds-seed-root") || el.dataset.dsTransparent === "true";
  if (!isCard && !isBare) {
    try { normalizeDSWidgetHost(el); } catch (_) {}
  }
  attachFaceFx(el);
}

// The overlay goes in ComfyUI's .dom-widget wrapper, next to the face, so node
// code that rebuilds its own children can never remove it.
function attachFaceFx(faceEl) {
  const host = faceEl.parentElement;
  if (!host?.classList.contains("dom-widget")) return;
  ensureFxLayer(host, appliedTheme?.fx);
}

function syncAllFx(theme) {
  document.querySelectorAll(".ds-fx").forEach((el) => setFx(el, theme?.fx));
}

function applyMotion(cfg = config) {
  const motion = cfg.motion === "off" ? "off" : cfg.motion === "pause_on_run" && queueRunning ? "paused" : "on";
  document.documentElement.dataset.dsMotion = motion;
}

function applyNodeBaseTheme(node, theme = getTheme(config.theme)) {
  if (!isDSNode(node)) return;
  try { protectDSResizeCorners(node); } catch (_) {}
  markNodeFace(node);
  if (!theme || node._dsNodeBaseOptOut) return;

  const palette = getNodeBasePalette(theme);
  const chromeless = nodeHidesChrome(node);

  // Always paint a visible LiteGraph base so DOM nodes don't float on a black hole.
  if (!hasCustomNodeColors(node)) {
    node.bgcolor = palette.bg;
    node.boxcolor = palette.border;
    if (!chromeless) {
      node.color = palette.panel;
    }
    node._dsBaseColors = { color: node.color, bgcolor: node.bgcolor };
  }

  delete node.title_color;
  if (node.constructor) {
    delete node.constructor.title_color;
    delete node.constructor.title_text_color;
  }
  const smartColor = getSmartTitleTextColor(node, false, theme);
  node.title_text_color = smartColor;

  node.onDrawTitleText = function (ctx, titleHeight, size, scale, fontStyle, isSelected) {
    drawSmartTitleText(this, ctx, titleHeight, size, scale, fontStyle, isSelected);
  };
  node.drawTitleText = function (ctx, options) {
    drawSmartTitleText(this, ctx, options);
  };

  // Restore LiteGraph canvas painting when nodes used empty draw overrides for transparency.
  const drawNoop = (fn) => {
    if (typeof fn !== "function") return false;
    const body = fn.toString().replace(/\s+/g, "");
    return (
      body === "function(){}" ||
      body === "function(){};" ||
      body === "function(ctx){return;}" ||
      body === "()=>{}"
    );
  };
  if (drawNoop(node.onDrawBackground)) delete node.onDrawBackground;
  if (drawNoop(node.onDrawTitleBar)) delete node.onDrawTitleBar;
  if (drawNoop(node.onDrawForeground)) delete node.onDrawForeground;

  node._dsThemedBase = true;
  node.setDirtyCanvas?.(true, false);
}

function applyNodeBaseToAll(theme = getTheme(config.theme)) {
  if (!theme || !app.graph?._nodes) return;
  for (const node of app.graph._nodes) {
    applyNodeBaseTheme(node, theme);
  }
  app.graph.setDirtyCanvas?.(true, true);
}

function scheduleNodeBaseApply(node) {
  const run = () => {
    if (!ready || !isDSNode(node)) return;
    applyNodeBaseTheme(node, getTheme(config.theme));
  };
  queueMicrotask(run);
  setTimeout(run, 0);
  setTimeout(run, 120);
}

// Theme-managed node.properties keys that must never be baked into workflow JSON.
// They are always derived at runtime from the active theme.
const DS_THEME_PROPS_TO_STRIP = new Set(["ds_bg_color", "ds_title_color", "ds_cp_accent"]);

/**
 * Strip theme-managed canvas color props from a node so ComfyUI never
 * serializes them into the workflow JSON. Called once per DS node.
 */
function patchNodeSerialize(node) {
  if (node._dsSerializePatched) return;
  node._dsSerializePatched = true;
  const origSerialize = node.serialize?.bind(node);
  if (typeof origSerialize !== "function") return;
  node.serialize = function (...args) {
    const data = origSerialize(...args);
    if (!data) return data;
    // Always strip theme-managed canvas colors from the JSON output unless
    // the node has explicit custom node colors set.
    if (!hasCustomNodeColors(node)) {
      delete data.color;
      delete data.bgcolor;
      delete data.boxcolor;
    }
    // Also strip theme-managed node.properties keys so they don't
    // accumulate across saves and prevent future theme application.
    if (data.properties) {
      for (const key of DS_THEME_PROPS_TO_STRIP) {
        delete data.properties[key];
      }
    }
    return data;
  };
}

function wrapDSNodeCreated(nodeType, nodeData) {
  const name = String(nodeData?.name || "");
  if (!name.startsWith(DS_NODE_PREFIX) && !name.startsWith("DSGif")) return;

  nodeType.prototype.onDrawTitleText = function (ctx, titleHeight, size, scale, fontStyle, isSelected) {
    drawSmartTitleText(this, ctx, titleHeight, size, scale, fontStyle, isSelected);
  };
  nodeType.prototype.drawTitleText = function (ctx, options) {
    drawSmartTitleText(this, ctx, options);
  };

  const origCreated = nodeType.prototype.onNodeCreated;
  nodeType.prototype.onNodeCreated = function (...args) {
    const result = origCreated ? origCreated.apply(this, args) : undefined;
    scheduleNodeBaseApply(this);
    patchNodeSerialize(this);
    return result;
  };

  const origDrawTitleBar = nodeType.prototype.onDrawTitleBar;
  nodeType.prototype.onDrawTitleBar = function (ctx, titleHeight, size, scale, fgColor) {
    if (fgColor) {
      this._dsTitleBg = fgColor;
    }
    const theme = getTheme(config.theme);
    if (theme && isDSNode(this)) {
      this.title_text_color = getSmartTitleTextColor(this, Boolean(this.selected), theme);
    }
    return origDrawTitleBar ? origDrawTitleBar.apply(this, arguments) : undefined;
  };
}

// Theme variables live on :root; marked elements pick up the shared DS
// typography, scrollbar and control rules from the global stylesheet.
function markThemed(el, cfg = config) {
  if (!el) return;
  el.dataset.dsTheme = cfg.theme;
  el.dataset.dsThemed = "true";
}

function applyToAllRoots(cfg = config) {
  const theme = getTheme(cfg.theme, cfg);
  if (!theme) return;
  appliedTheme = theme;

  document.querySelectorAll(DS_ROOT_SELECTOR).forEach((el) => {
    markThemed(el, cfg);
    if (el.matches(DS_SHELL_ROOT_SELECTOR)) {
      try { normalizeDSWidgetHost(el, null, { shell: true }); } catch (_) {}
    }
  });

  updateGlobalStylesheet(theme, cfg);
  syncAllFx(theme);
  applyMotion(cfg);
  applyNodeBaseToAll(theme);
}

function updateGlobalStylesheet(theme, cfg) {
  let style = document.getElementById(GLOBAL_STYLE_ID);
  if (!style) {
    style = document.createElement("style");
    style.id = GLOBAL_STYLE_ID;
  }
  document.head.appendChild(style);

  const vars = theme?.vars || {};
  const allVars = resolveVars(theme);
  if (theme?.glass) {
    allVars["--ds-glass-blur"] = `${theme.glass.blur || 0}px`;
    allVars["--ds-glass-opacity"] = String(theme.glass.opacity ?? 1);
  }

  const decl = Object.entries(allVars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join("\n");

  const stack = fontFamilyStack(cfg.font);
  const accent = vars["--ds-accent"] || vars["--accent"] || "#67e8f9";
  const accentRgb = hexToRgbTriplet(accent);


  // html:root outranks the :root defaults in ds_ui.css regardless of stylesheet order.
  style.textContent = `
    html:root {
${decl}
      --ds-font: ${stack};
      --ds-font-family: ${stack};
      --ds-font-size: ${cfg.fontSize}px;
    }

    ${DS_ROOT_SELECTOR} {
      --font: ${stack};
      --font-size: ${cfg.fontSize}px;
      font-family: ${stack};
      font-size: ${cfg.fontSize}px;
    }

    /* Map legacy per-node vars to global theme */
    .ds-viewer-wrapper,
    .ds-timer-wrapper {
      --ds-node-bg: var(--ds-panel);
      --ds-text-main: var(--ds-text);
      --ds-accent-color: var(--ds-accent);
      --ds-border-color: var(--ds-border);
    }
    .monitor-node-container {
      --bg-glass: var(--ds-panel);
      --bg-header: color-mix(in srgb, var(--ds-panel) 80%, transparent);
      --text-main: var(--ds-text);
      --text-dim: var(--ds-text-muted);
      --border-color: var(--ds-border);
      --bar-track: color-mix(in srgb, var(--ds-border) 60%, transparent);
      --accent-hex: ${accent};
      --accent-rgb: ${accentRgb};
      --font-family: var(--ds-font);
      --font-size: var(--ds-font-size);
    }

    /* Unified title/header typography */
    ${DS_TITLE_SELECTOR} {
      font-family: inherit !important;
    }

    /* Accent-filled badges and pills get readable on-accent text */
    .ds-badge-accent,
    .ds-pill-accent,
    [data-ds-accent-bg="true"] {
      background: var(--ds-color-accent, var(--ds-accent)) !important;
      color: var(--ds-color-on-accent, var(--ds-on-accent, #0a0c10)) !important;
      text-shadow: none !important;
      box-shadow: none !important;
    }

    /* Smart contrast for filled-row sliders & toggles (Stitch, Control Panel, universal rows) */
    .ds-ui-row-text-layer,
    .ds-cp-text-layer,
    .ds-stitch-text-layer {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 8px;
      box-sizing: border-box;
      pointer-events: none;
      z-index: 2;
    }
    .ds-ui-row-layer-track,
    .ds-cp-layer-track,
    .ds-stitch-layer-track {
      color: var(--ds-on-panel, var(--ds-text, #e5e7eb)) !important;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.7) !important;
    }
    .ds-ui-row-layer-fill,
    .ds-cp-layer-fill,
    .ds-stitch-layer-fill {
      color: var(--ds-on-accent) !important;
      font-weight: 700 !important;
      text-shadow: var(--ds-on-accent-shadow) !important;
    }

    /* Scrollbars inside DS surfaces: slim thumb, no arrows, shown only while the area is hovered.
       Only ::-webkit-scrollbar is used; Chromium ignores it once scrollbar-width/color are set. */
    :is([data-ds-face="true"], [data-ds-themed="true"], .ds-ui-popup, .ds-ui-modal)::-webkit-scrollbar,
    :is([data-ds-face="true"], [data-ds-themed="true"], .ds-ui-popup, .ds-ui-modal) ::-webkit-scrollbar {
      width: 6px;
      height: 6px;
      background: transparent;
    }
    :is([data-ds-face="true"], [data-ds-themed="true"], .ds-ui-popup, .ds-ui-modal)::-webkit-scrollbar-button,
    :is([data-ds-face="true"], [data-ds-themed="true"], .ds-ui-popup, .ds-ui-modal) ::-webkit-scrollbar-button {
      display: none;
      width: 0;
      height: 0;
    }
    :is([data-ds-face="true"], [data-ds-themed="true"], .ds-ui-popup, .ds-ui-modal)::-webkit-scrollbar-track,
    :is([data-ds-face="true"], [data-ds-themed="true"], .ds-ui-popup, .ds-ui-modal) ::-webkit-scrollbar-track,
    :is([data-ds-face="true"], [data-ds-themed="true"], .ds-ui-popup, .ds-ui-modal)::-webkit-scrollbar-corner,
    :is([data-ds-face="true"], [data-ds-themed="true"], .ds-ui-popup, .ds-ui-modal) ::-webkit-scrollbar-corner {
      background: transparent;
    }
    :is([data-ds-face="true"], [data-ds-themed="true"], .ds-ui-popup, .ds-ui-modal)::-webkit-scrollbar-thumb,
    :is([data-ds-face="true"], [data-ds-themed="true"], .ds-ui-popup, .ds-ui-modal) ::-webkit-scrollbar-thumb {
      background: transparent;
      border-radius: 3px;
    }
    :is([data-ds-face="true"], [data-ds-themed="true"], .ds-ui-popup, .ds-ui-modal):hover::-webkit-scrollbar-thumb,
    :is([data-ds-face="true"], [data-ds-themed="true"], .ds-ui-popup, .ds-ui-modal) :hover::-webkit-scrollbar-thumb {
      background: color-mix(in srgb, var(--ds-color-text) 25%, transparent);
    }
    :is([data-ds-face="true"], [data-ds-themed="true"], .ds-ui-popup, .ds-ui-modal) ::-webkit-scrollbar-thumb:hover {
      background: var(--ds-color-accent);
    }
    [data-ds-themed="true"] ::selection {
      background: var(--ds-selection);
    }
  `;
}

async function loadFont(cfg = config) {
  const fontName = cfg.font || "Inter";
  const downloaded = (cfg.downloadedFonts || []).find(
    (f) => f.name && f.name.toLowerCase() === fontName.toLowerCase()
  );

  if (downloaded && downloaded.cssPath) {
    let localStyle = document.getElementById(LOCAL_FONT_STYLE_ID);
    if (!localStyle) {
      localStyle = document.createElement("style");
      localStyle.id = LOCAL_FONT_STYLE_ID;
      document.head.appendChild(localStyle);
    }
    try {
      const resp = await fetch(downloaded.cssPath);
      if (resp.ok) {
        localStyle.textContent = await resp.text();
        const link = document.getElementById(GOOGLE_FONT_LINK_ID);
        if (link) link.remove();
        return true;
      }
    } catch (_) { /* fall through to CDN */ }
  }

  const param = googleFontParam(fontName);
  const href = `https://fonts.googleapis.com/css2?family=${param}:wght@300;400;500;600;700&display=swap`;

  if (!loadedFontLinks.has(href)) {
    const link = document.createElement("link");
    link.id = GOOGLE_FONT_LINK_ID;
    link.rel = "stylesheet";
    link.href = href;
    link.onerror = () => {
      console.warn(`[DS Global Theme] Failed to load font: ${fontName}`);
    };
    const existing = document.getElementById(GOOGLE_FONT_LINK_ID);
    if (existing) existing.remove();
    document.head.appendChild(link);
    loadedFontLinks.add(href);
  }

  const localStyle = document.getElementById(LOCAL_FONT_STYLE_ID);
  if (localStyle) localStyle.textContent = "";
  return true;
}

async function fetchThemes() {
  try {
    const resp = await fetch("/ds/theme/themes");
    if (resp.ok) {
      const data = await resp.json();
      themes = data.themes || {};
      return;
    }
  } catch (_) { /* fallback below */ }

  try {
    const resp = await fetch("/extensions/DeathshotArsenal/themes/themes.json");
    if (resp.ok) {
      const data = await resp.json();
      themes = data.themes || {};
    }
  } catch (e) {
    console.warn("[DS Global Theme] Could not load themes:", e);
  }
}

async function fetchConfig() {
  // localStorage is the primary source of truth for theme choice.
  // The server config is only used to fill in fields that are missing from localStorage.
  let lsConfig = null;
  try {
    const raw = localStorage.getItem(STORAGE_GLOBAL_CONFIG);
    if (raw) lsConfig = JSON.parse(raw);
  } catch (_) {}

  try {
    let data = null;
    try {
      const resp = await fetch("/ds/theme/config");
      if (resp.ok) data = await resp.json();
    } catch (_) {}
    if (!data) {
      try {
        const resp = await api.fetchApi("/ds/theme/config");
        if (resp.ok) data = await resp.json();
      } catch (_) {}
    }
    if (data?.config) {
      // Merge: localStorage overrides server for the theme field so a user's
      // last-applied theme is never clobbered by a stale server default.
      const serverConfig = normalizeConfig(data.config);
      if (lsConfig) {
        // Keep localStorage theme + font; only take server values for fields not in localStorage
        config = normalizeConfig({ ...serverConfig, ...lsConfig });
      } else {
        config = serverConfig;
        try { localStorage.setItem(STORAGE_GLOBAL_CONFIG, JSON.stringify(config)); } catch (_) {}
      }
    }
  } catch (e) {
    console.warn("[DS Global Theme] Could not load config:", e);
  }
  return config;
}

async function saveConfig(partial) {
  config = normalizeConfig({ ...config, ...partial });
  config.fontSize = Math.max(10, Math.min(24, Number(config.fontSize) || 14));
  try {
    localStorage.setItem(STORAGE_GLOBAL_CONFIG, JSON.stringify(config));
  } catch (_) {}

  try {
    let saved = false;
    try {
      const resp = await fetch("/ds/theme/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });
      if (resp.ok) saved = true;
    } catch (_) {}
    if (!saved) {
      try {
        const resp = await api.fetchApi("/ds/theme/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ config }),
        });
        if (resp.ok) saved = true;
      } catch (_) {}
    }
  } catch (_) {}

  dispatchChange();
  return { success: true, config };
}

function dispatchChange() {
  window.dispatchEvent(
    new CustomEvent("ds-theme-changed", { detail: { config, theme: getTheme(config.theme) } })
  );
}

async function applyConfig(cfg = config, { save = false } = {}) {
  const prevFont = config.font;
  if (save) {
    const result = await saveConfig(cfg);
    if (!result.success) return result;
    cfg = config;
  } else {
    config = normalizeConfig(cfg);
  }

  const theme = getTheme(config.theme);
  if (!theme) {
    return { success: false, error: `Unknown theme: ${config.theme}` };
  }

  const fontOk = await loadFont(config);
  if (!fontOk && config.font !== prevFont) {
    config.font = prevFont;
    await loadFont(config);
    return { success: false, error: "Font could not be loaded — reverted to previous" };
  }

  applyToAllRoots(config);
  if (!save) dispatchChange();
  return { success: true, config, theme };
}

// DS faces mount into ComfyUI's .dom-widget wrapper after node creation (and
// again when ComfyUI remounts them); give each one its effects overlay.
function startObserver() {
  if (observer) return;
  observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.dataset.dsFace === "true") attachFaceFx(node);
        else node.querySelectorAll?.('[data-ds-face="true"]').forEach(attachFaceFx);
        if (node.matches(DS_ROOT_SELECTOR)) markThemed(node);
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function watchQueue() {
  api.addEventListener("status", ({ detail }) => {
    queueRunning = (detail?.exec_info?.queue_remaining ?? 0) > 0;
    applyMotion();
  });
}

const DSGlobalTheme = {
  getConfig: () => ({ ...config }),
  getThemes: () => ({ ...themes }),
  getTheme,
  apply: (partial, opts) => applyConfig({ ...config, ...partial }, opts),
  applyToElement: (el) => markThemed(el),
  preview: (partial) => {
    const previewCfg = normalizeConfig({ ...config, ...partial });
    const theme = getTheme(previewCfg.theme, previewCfg);
    if (theme) {
      applyToAllRoots(previewCfg);
      if (partial.font) loadFont(previewCfg);
    }
    return previewCfg;
  },
  revertPreview: () => applyConfig(config),
  isReady: () => ready,
  subscribe(fn) {
    const handler = (e) => fn(e.detail);
    window.addEventListener("ds-theme-changed", handler);
    return () => window.removeEventListener("ds-theme-changed", handler);
  },
  bindNode(rootEl, graphNode = null) {
    if (!rootEl) return () => {};
    rootEl.dataset.dsThemed = "true";
    // Only real node faces get the shared shell inset. Popups/modals are
    // independent surfaces and must not inherit node padding.
    const isNodeFace = rootEl.matches?.(DS_SHELL_ROOT_SELECTOR) || Boolean(graphNode && (rootEl === graphNode.dom || rootEl === graphNode.rootEl));
    if (isNodeFace) {
      try { normalizeDSWidgetHost(rootEl, graphNode, { shell: true }); } catch (_) {}
    }
    const apply = () => {
      this.applyToElement(rootEl);
      if (isNodeFace) {
        try { normalizeDSWidgetHost(rootEl, graphNode, { shell: true }); } catch (_) {}
      }
      if (graphNode) applyNodeBaseTheme(graphNode, getTheme(config.theme));
    };
    apply();
    return this.subscribe(apply);
  },
  applyNodeBase: (node) => applyNodeBaseTheme(node, getTheme(config.theme)),
  applyNodeBaseToAll: () => applyNodeBaseToAll(getTheme(config.theme)),
  optOutNodeBase: (node) => {
    if (node) node._dsNodeBaseOptOut = true;
  },
  getVar(name, fallback = "") {
    return resolveVars(appliedTheme || getTheme(config.theme))[name] ?? fallback;
  },
  getRelativeLuminance: (col) => getRelativeLuminance(col),
  getContrastTextColor: (bg, darkText = "#111827", lightText = "#ffffff") => getContrastTextColor(bg, darkText, lightText),
  getOnAccentTextColor: (accent = null) => {
    const col = accent || DSGlobalTheme.getVar("--ds-accent", "#67e8f9");
    return getRelativeLuminance(col) > 0.40 ? "#0a0c10" : "#ffffff";
  },
  getOnAccentShadow: (accent = null) => {
    const col = accent || DSGlobalTheme.getVar("--ds-accent", "#67e8f9");
    return getRelativeLuminance(col) > 0.40 ? "0 1px 0 rgba(255, 255, 255, 0.35)" : "0 1px 2px rgba(0, 0, 0, 0.70)";
  },
  getSmartContrastVars: (theme = null) => computeSmartContrastVars(theme || getTheme(config.theme)),
  applySmartContrast: (el) => {
    if (!el) return;
    const smart = computeSmartContrastVars(getTheme(config.theme));
    Object.entries(smart).forEach(([k, v]) => el.style.setProperty(k, v));
  },
  getSmartPalette: (theme = null) => getNodeBasePalette(theme || getTheme(config.theme)),
  getSmartTitleTextColor: (node, isSelected) => getSmartTitleTextColor(node, isSelected, getTheme(config.theme)),
  drawSmartTitleText: (node, ctx, ...args) => drawSmartTitleText(node, ctx, ...args),
  applyNodeBaseTheme: (node, theme = null) => applyNodeBaseTheme(node, theme || getTheme(config.theme)),
};

window.DSGlobalTheme = DSGlobalTheme;

app.registerExtension({
  name: "DeathshotArsenal.GlobalTheme",

  async beforeRegisterNodeDef(nodeType, nodeData) {
    wrapDSNodeCreated(nodeType, nodeData);
  },

  nodeCreated(node) {
    if (isDSNode(node)) {
      try { protectDSResizeCorners(node); } catch (_) {}
      scheduleNodeBaseApply(node);
      patchNodeSerialize(node);
    }
  },

  // Fires for every node added when a workflow is DRAGGED onto an existing canvas
  // (merge/append path). afterConfigureGraph only fires for full workflow replaces.
  loadedGraphNode(node) {
    if (!ready || !isDSNode(node)) return;
    if (!hasCustomNodeColors(node)) {
      delete node.color;
      delete node.bgcolor;
      delete node.boxcolor;
    }
    patchNodeSerialize(node);
    scheduleNodeBaseApply(node);
  },

  async afterConfigureGraph() {
    if (!ready) return;
    // Clear stale theme colors from nodes that follow the global theme,
    // preserving nodes that have explicit custom colors.
    if (app.graph?._nodes) {
      for (const node of app.graph._nodes) {
        if (isDSNode(node)) {
          if (!hasCustomNodeColors(node)) {
            delete node.color;
            delete node.bgcolor;
            delete node.boxcolor;
          }
          patchNodeSerialize(node);
        }
      }
    }
    applyNodeBaseToAll(getTheme(config.theme));
    // Short delay re-apply catches nodes whose DOM roots finish mounting slightly late
    setTimeout(() => applyNodeBaseToAll(getTheme(config.theme)), 300);
  },

  async setup() {
    try {
      if (globalThis.LiteGraph?.LGraphNode?.prototype) {
        delete globalThis.LiteGraph.LGraphNode.prototype.title_color;
        delete globalThis.LiteGraph.LGraphNode.prototype.title_text_color;
      }
    } catch (_) {}

    // Intercept the raw workflow JSON before LiteGraph applies it.
    const origLoadGraphData = app.loadGraphData?.bind(app);
    if (typeof origLoadGraphData === "function") {
      app.loadGraphData = async function (graphData, ...rest) {
        if (graphData?.nodes && Array.isArray(graphData.nodes)) {
          for (const n of graphData.nodes) {
            if (typeof n.type === "string" && n.type.startsWith("DS_")) {
              if (!n.properties?.node_color) {
                delete n.color;
                delete n.bgcolor;
                delete n.boxcolor;
              }
              // Strip theme-managed properties that are derived at runtime
              if (n.properties) {
                for (const key of DS_THEME_PROPS_TO_STRIP) {
                  delete n.properties[key];
                }
              }
            }
          }
        }
        return origLoadGraphData(graphData, ...rest);
      };
    }

    installDSUI();
    installDSCanvasNavigationBridge();
    await fetchThemes();
    // Always reconcile server config with localStorage. fetchConfig() merges them with
    // local values taking precedence, while the server fills any missing fields.
    // This also repairs older localStorage entries created before full custom-theme
    // persistence was fixed.
    await fetchConfig();
    await loadFont(config);
    applyToAllRoots(config);
    startObserver();
    watchQueue();
    ready = true;
    dispatchChange();
    setTimeout(() => applyNodeBaseToAll(getTheme(config.theme)), 250);
    console.log("[DeathshotArsenal] Global theme engine ready:", config.theme, config.font);
  },
});