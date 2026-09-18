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
import { installDSUISystem, normalizeDSWidgetHost } from "./ds_ui_system.js";

const DS_NODE_PREFIX = "DS_";
const NODE_BASE_STYLE_ID = "ds-global-node-base-style";

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

const DEFAULT_CONFIG = {
  theme: "deathshot_dark",
  font: "Inter",
  fontSize: 14,
  downloadedFonts: [],
  custom: {},
};

const GOOGLE_FONT_LINK_ID = "ds-global-font-link";
const LOCAL_FONT_STYLE_ID = "ds-global-font-local";
const GLOBAL_STYLE_ID = "ds-global-theme-style";

let themes = {};
let config = { ...DEFAULT_CONFIG };
let ready = false;
let observer = null;
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

function getTheme(id) {
  return themes[id] || themes.deathshot_dark || null;
}

function isDSNode(node) {
  return Boolean(
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

function hasCustomNodeColors(node) {
  const props = node?.properties || {};
  return Boolean(props.node_color || props.ds_bg_color || props.ds_title_color);
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

function styleNodeDomWidgets(node, palette) {
  if (!node?.widgets?.length) return;
  const theme = getTheme(config.theme) || {};
  const vars = theme.vars || {};
  for (const widget of node.widgets) {
    const el = widget?.element;
    if (!el || el.nodeType !== 1) continue;

    if (
      el.classList?.contains("ds-seed-root") ||
      el.dataset?.dsTransparent === "true" ||
      node?.type === "DS_Seed" ||
      node?.comfyClass === "DS_Seed"
    ) {
      el.style.setProperty("background-color", "transparent", "important");
      el.style.setProperty("background", "transparent", "important");
      let parent = el.parentElement;
      for (let depth = 0; depth < 4 && parent; depth += 1) {
        if (parent.id === "graph-canvas" || parent.classList?.contains("litegraph")) break;
        parent.style.setProperty("background-color", "transparent", "important");
        parent.style.setProperty("background", "transparent", "important");
        delete parent.dataset.dsNodeBase;
        parent = parent.parentElement;
      }
      continue;
    }

    el.style.backgroundColor = palette.bg;
    el.style.color = palette.text;
    el.dataset.dsNodeBase = "true";
    try { normalizeDSWidgetHost(el); } catch (_) {}

    // Also set theme vars so scrollbars etc inside widget elements resolve modern styles
    Object.entries(vars).forEach(([k, v]) => {
      try { el.style.setProperty(k, v); } catch (_) {}
    });

    let parent = el.parentElement;
    for (let depth = 0; depth < 4 && parent; depth += 1) {
      if (parent.id === "graph-canvas" || parent.classList?.contains("litegraph")) break;
      parent.style.backgroundColor = palette.bg;
      parent.style.borderRadius = "8px";
      parent.dataset.dsNodeBase = "true";
      Object.entries(vars).forEach(([k, v]) => {
        try { parent.style.setProperty(k, v); } catch (_) {}
      });
      parent = parent.parentElement;
    }
  }
}

function applyNodeBaseTheme(node, theme = getTheme(config.theme)) {
  if (!theme || !isDSNode(node) || node._dsNodeBaseOptOut) return;

  const palette = getNodeBasePalette(theme);
  const chromeless = nodeHidesChrome(node);

  // Always paint a visible LiteGraph base so DOM nodes don't float on a black hole.
  if (!hasCustomNodeColors(node)) {
    node.bgcolor = palette.bg;
    node.boxcolor = palette.border;
    if (!chromeless) {
      node.color = palette.panel;
    }
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

  styleNodeDomWidgets(node, palette);
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

function updateNodeBaseStylesheet(theme) {
  const palette = getNodeBasePalette(theme);
  let style = document.getElementById(NODE_BASE_STYLE_ID);
  if (!style) {
    style = document.createElement("style");
    style.id = NODE_BASE_STYLE_ID;
    document.head.appendChild(style);
  }

  style.textContent = `
    [data-ds-node-base="true"] {
      background-color: ${palette.bg} !important;
      color: ${palette.text} !important;
    }
    .litegraph .litegraph-node[data-ds-node-base="true"],
    div[style*="pointer-events"] [data-ds-node-base="true"] {
      background-color: ${palette.bg} !important;
    }
  `;
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

function wrapDSNodeCreated(nodeType, nodeData) {
  if (!nodeData.name?.startsWith(DS_NODE_PREFIX)) return;

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

function applyVarsToElement(el, theme, cfg) {
  if (!el || !theme) return;
  const vars = theme.vars || {};
  Object.entries(vars).forEach(([k, v]) => {
    el.style.setProperty(k, v);
  });

  const smartVars = computeSmartContrastVars(theme);
  Object.entries(smartVars).forEach(([k, v]) => {
    el.style.setProperty(k, v);
  });

  const stack = fontFamilyStack(cfg.font);
  const sizePx = `${cfg.fontSize}px`;
  el.style.setProperty("--ds-font", stack);
  el.style.setProperty("--ds-font-family", stack);
  el.style.setProperty("--ds-font-size", sizePx);
  el.style.setProperty("--font", stack);
  el.style.setProperty("--font-size", sizePx);
  el.style.fontFamily = stack;
  el.style.fontSize = sizePx;
  el.dataset.dsTheme = cfg.theme;
  el.dataset.dsThemed = "true";

  if (theme.glass) {
    el.style.setProperty("--ds-glass-blur", `${theme.glass.blur || 0}px`);
    el.style.setProperty("--ds-glass-opacity", String(theme.glass.opacity ?? 1));
  }
}

function applyToAllRoots(cfg = config) {
  const theme = getTheme(cfg.theme);
  if (!theme) return;

  document.querySelectorAll(DS_ROOT_SELECTOR).forEach((el) => {
    applyVarsToElement(el, theme, cfg);
    if (el.matches?.(DS_SHELL_ROOT_SELECTOR)) {
      try { normalizeDSWidgetHost(el, null, { shell: true }); } catch (_) {}
    }
  });

  updateGlobalStylesheet(theme, cfg);
  updateNodeBaseStylesheet(theme);
  applyNodeBaseToAll(theme);
}

function updateGlobalStylesheet(theme, cfg) {
  let style = document.getElementById(GLOBAL_STYLE_ID);
  if (!style) {
    style = document.createElement("style");
    style.id = GLOBAL_STYLE_ID;
    document.head.appendChild(style);
  }

  const vars = theme?.vars || {};
  const smartVars = computeSmartContrastVars(theme);
  const allVars = { ...vars, ...smartVars };

  const decl = Object.entries(allVars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join("\n");

  const stack = fontFamilyStack(cfg.font);
  const accent = vars["--ds-accent"] || vars["--accent"] || "#67e8f9";
  const accentRgb = hexToRgbTriplet(accent);

  // Build strong selectors for scrollbar hiding using the same roots the theming uses
  const rootList = DS_ROOT_SELECTOR;
  const roots = rootList.split(", ");
  const sbDirect = roots.map(s => `${s}::-webkit-scrollbar-button, ${s}::-webkit-scrollbar-button:single-button`).join(", ");
  const sbDesc = roots.map(s => `${s} *::-webkit-scrollbar-button, ${s} *::-webkit-scrollbar-button:single-button, ${s} ::-webkit-scrollbar-button, ${s} ::-webkit-scrollbar-button:single-button`).join(", ");
  const sbAll = [sbDirect, sbDesc].join(", ");

  style.textContent = `
    :root,
    ${DS_ROOT_SELECTOR} {
${decl}
      --ds-font: ${stack};
      --ds-font-family: ${stack};
      --ds-font-size: ${cfg.fontSize}px;
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
      --ds-text-muted: var(--ds-text-muted);
      --ds-accent-color: var(--ds-accent);
      --ds-border-color: var(--ds-border);
      --ds-font-family: var(--ds-font);
      --ds-font-size: var(--ds-font-size);
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

    /* Fallback overrides for nodes with hardcoded colors */
    [data-ds-themed="true"] {
      background: var(--ds-bg) !important;
      color: var(--ds-text) !important;
      border-color: var(--ds-border) !important;
      transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
    }
    [data-ds-themed="true"] input,
    [data-ds-themed="true"] textarea,
    [data-ds-themed="true"] select {
      background: var(--ds-input-bg) !important;
      color: var(--ds-text) !important;
      border-color: var(--ds-border) !important;
      font-family: inherit !important;
    }
    [data-ds-themed="true"] input:focus,
    [data-ds-themed="true"] textarea:focus,
    [data-ds-themed="true"] select:focus {
      border-color: var(--ds-accent) !important;
    }
    [data-ds-themed="true"] button:not(.ds-hub-step):not([class*="-step"]) {
      background: var(--ds-btn-bg) !important;
      color: var(--ds-text) !important;
      border-color: var(--ds-border) !important;
      font-family: inherit !important;
    }
    [data-ds-themed="true"] button:not(.ds-hub-step):not([class*="-step"]):hover {
      background: var(--ds-btn-hover) !important;
      border-color: var(--ds-accent) !important;
      color: var(--ds-accent) !important;
    }

    /* Smart contrast for elements with accent backgrounds (buttons, pills, badges, slider fills) */
    [data-ds-themed="true"] button.active,
    [data-ds-themed="true"] button[data-active="true"],
    [data-ds-themed="true"] button[aria-pressed="true"],
    .ds-ui-button.active,
    .ds-ui-button[data-active="true"],
    .ds-ui-button[aria-pressed="true"] {
      background: var(--ds-accent) !important;
      border-color: var(--ds-accent) !important;
      color: var(--ds-on-accent) !important;
      text-shadow: var(--ds-on-accent-shadow) !important;
    }
    .ds-badge-accent,
    .ds-pill-accent,
    [data-ds-accent-bg="true"] {
      background: var(--ds-accent) !important;
      color: var(--ds-on-accent) !important;
      text-shadow: var(--ds-on-accent-shadow) !important;
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

    /* Modern unified scrollbar (thin, themed) — applies to ALL scroll areas inside DS nodes */
    [data-ds-themed="true"],
    [data-ds-themed="true"] *,
    [data-ds-node-base="true"],
    [data-ds-node-base="true"] * {
      scrollbar-width: thin !important;
      scrollbar-color: var(--ds-scrollbar) var(--ds-panel) !important;
    }
    [data-ds-themed="true"]::-webkit-scrollbar,
    [data-ds-themed="true"] *::-webkit-scrollbar,
    [data-ds-node-base="true"]::-webkit-scrollbar,
    [data-ds-node-base="true"] *::-webkit-scrollbar {
      width: 6px !important;
      height: 6px !important;
    }
    [data-ds-themed="true"]::-webkit-scrollbar-track,
    [data-ds-themed="true"] *::-webkit-scrollbar-track,
    [data-ds-node-base="true"]::-webkit-scrollbar-track,
    [data-ds-node-base="true"] *::-webkit-scrollbar-track {
      background: var(--ds-panel) !important;
    }
    [data-ds-themed="true"]::-webkit-scrollbar-thumb,
    [data-ds-themed="true"] *::-webkit-scrollbar-thumb,
    [data-ds-node-base="true"]::-webkit-scrollbar-thumb,
    [data-ds-node-base="true"] *::-webkit-scrollbar-thumb {
      background: var(--ds-scrollbar) !important;
      border-radius: 3px !important;
    }
    [data-ds-themed="true"]::-webkit-scrollbar-thumb:hover,
    [data-ds-themed="true"] *::-webkit-scrollbar-thumb:hover,
    [data-ds-node-base="true"]::-webkit-scrollbar-thumb:hover,
    [data-ds-node-base="true"] *::-webkit-scrollbar-thumb:hover {
      background: var(--ds-accent) !important;
    }

    /* Hide default scrollbar arrows/buttons for clean modern design (no ugly up/down arrows)
       Rely only on mouse wheel or drag the thumb. */
    [data-ds-themed="true"]::-webkit-scrollbar-button,
    [data-ds-themed="true"] *::-webkit-scrollbar-button,
    [data-ds-themed="true"] ::-webkit-scrollbar-button,
    [data-ds-node-base="true"]::-webkit-scrollbar-button,
    [data-ds-node-base="true"] *::-webkit-scrollbar-button,
    [data-ds-node-base="true"] ::-webkit-scrollbar-button,
    [class*="ds-"]::-webkit-scrollbar-button,
    [class*="ds-"] *::-webkit-scrollbar-button,
    [class*="ds-"] ::-webkit-scrollbar-button,
    [class*="ds-"]::-webkit-scrollbar-button:single-button,
    [class*="ds-"] *::-webkit-scrollbar-button:single-button {
      display: none !important;
      height: 0 !important;
      width: 0 !important;
      background: transparent !important;
      border: none !important;
      content: none !important;
      appearance: none !important;
      -webkit-appearance: none !important;
    }
    [data-ds-themed="true"]::-webkit-scrollbar-corner,
    [data-ds-themed="true"] *::-webkit-scrollbar-corner,
    [data-ds-node-base="true"]::-webkit-scrollbar-corner,
    [data-ds-node-base="true"] *::-webkit-scrollbar-corner {
      background: transparent !important;
    }
    [data-ds-themed="true"] ::selection {
      background: var(--ds-selection) !important;
    }

    /* Final aggressive pass using the exact same roots as theming engine */
    ${sbAll},
    [data-ds-node-base="true"]::-webkit-scrollbar-button,
    [data-ds-node-base="true"] *::-webkit-scrollbar-button,
    [data-ds-node-base="true"] ::-webkit-scrollbar-button {
      display: none !important;
      height: 0 !important;
      width: 0 !important;
      background: transparent !important;
      border: none !important;
      content: none !important;
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
  try {
    const resp = await fetch("/ds/theme/config");
    if (resp.ok) {
      const data = await resp.json();
      config = { ...DEFAULT_CONFIG, ...(data.config || {}) };
    }
  } catch (e) {
    console.warn("[DS Global Theme] Could not load config:", e);
  }
  return config;
}

async function saveConfig(partial) {
  const prev = { ...config };
  config = { ...config, ...partial };
  config.fontSize = Math.max(10, Math.min(24, Number(config.fontSize) || 14));

  try {
    const resp = await api.fetchApi("/ds/theme/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config }),
    });
    if (resp.ok) {
      const data = await resp.json();
      if (data.config) config = { ...DEFAULT_CONFIG, ...data.config };
      dispatchChange();
      return { success: true, config };
    }
    config = prev;
    return { success: false, error: "Save failed" };
  } catch (e) {
    config = prev;
    return { success: false, error: e.message };
  }
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
    config = { ...DEFAULT_CONFIG, ...cfg };
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

function startObserver() {
  if (observer) return;
  observer = new MutationObserver((mutations) => {
    const theme = getTheme(config.theme);
    if (!theme) return;
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches?.(DS_ROOT_SELECTOR)) {
          applyVarsToElement(node, theme, config);
        }
        node.querySelectorAll?.(DS_ROOT_SELECTOR).forEach((el) => {
          applyVarsToElement(el, theme, config);
        });
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

const DSGlobalTheme = {
  getConfig: () => ({ ...config }),
  getThemes: () => ({ ...themes }),
  getTheme,
  apply: (partial, opts) => applyConfig({ ...config, ...partial }, opts),
  applyToElement: (el) => applyVarsToElement(el, getTheme(config.theme), config),
  preview: (partial) => {
    const previewCfg = { ...config, ...partial };
    const theme = getTheme(previewCfg.theme);
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
    // Force global stylesheet (including aggressive no-arrow rules) to be present/updated
    const theme = getTheme(config.theme);
    if (theme) {
      updateGlobalStylesheet(theme, config);
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
    const theme = getTheme(config.theme);
    if (theme?.vars?.[name] !== undefined) {
      return theme.vars[name];
    }
    const smart = computeSmartContrastVars(theme);
    if (smart[name] !== undefined) {
      return smart[name];
    }
    return fallback;
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
};

window.DSGlobalTheme = DSGlobalTheme;

app.registerExtension({
  name: "DeathshotArsenal.GlobalTheme",

  async beforeRegisterNodeDef(nodeType, nodeData) {
    wrapDSNodeCreated(nodeType, nodeData);
  },

  nodeCreated(node) {
    if (isDSNode(node)) {
      scheduleNodeBaseApply(node);
    }
  },

  async afterConfigureGraph() {
    if (!ready) return;
    applyNodeBaseToAll(getTheme(config.theme));
  },

  async setup() {
    try {
      localStorage.removeItem("DS_GRAPH_COLOR_DEFAULTS");
      if (globalThis.LiteGraph?.LGraphNode?.prototype) {
        delete globalThis.LiteGraph.LGraphNode.prototype.title_color;
        delete globalThis.LiteGraph.LGraphNode.prototype.title_text_color;
      }
    } catch (_) {}
    installDSUISystem();
    await fetchThemes();
    await fetchConfig();
    await loadFont(config);
    applyToAllRoots(config);
    startObserver();
    ready = true;
    dispatchChange();
    setTimeout(() => applyNodeBaseToAll(getTheme(config.theme)), 250);
    console.log("[DeathshotArsenal] Global theme engine ready:", config.theme, config.font);
  },
});