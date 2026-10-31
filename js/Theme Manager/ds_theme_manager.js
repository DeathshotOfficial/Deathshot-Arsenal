/**
 * DS Theme Manager — Extension Feature
 * DeathshotArsenal
 *
 * Full-screen modal appearance dashboard, canvas context menu integration,
 * clipboard color utilities, multi-element DS theming, and typography engine.
 */

import { app } from "/scripts/app.js";
import { attachNodeShortcuts } from "../UIElements/shortcuts.js";
import { api } from "/scripts/api.js";
import { Dropdown, Slider, Stepper } from "../UIElements/index.js";
import { ensureFxLayer } from "../UIElements/Theme/fx.js";

// Ensure CSS is loaded — version stamp forces browser to fetch fresh CSS on each ComfyUI restart
const DS_TM_BUILD = "20261012_01";

const CSS_ID = "ds-theme-manager-css";
const _existingTmCss = document.getElementById(CSS_ID);
if (!_existingTmCss || !_existingTmCss.href.includes(DS_TM_BUILD)) {
  if (_existingTmCss) _existingTmCss.remove();
  const link = document.createElement("link");
  link.id = CSS_ID;
  link.rel = "stylesheet";
  link.href = `/extensions/DeathshotArsenal/Theme%20Manager/ds_theme_manager.css?v=${DS_TM_BUILD}`;
  document.head.appendChild(link);
}


// ---------------------------------------------------------------------------
// Storage Keys & Constants
// ---------------------------------------------------------------------------
const STORAGE_CUSTOM_SLOTS = "DS_THEME_CUSTOM_SLOTS";
const STORAGE_DS_SLOTS = "DS_THEME_DS_SLOTS";
const STORAGE_TYPOGRAPHY = "DS_TYPOGRAPHY_CONFIG";
const STORAGE_GRAPH_DEFAULTS = "DS_GRAPH_COLOR_DEFAULTS";
const STORAGE_CLIPBOARD = "DS_CLIPBOARD_NODE_THEME";
const STORAGE_GLOBAL_CONFIG = "DS_THEME_GLOBAL_CONFIG";

// Load the shared DS slider lazily so a slider-module problem can never
// prevent the Theme Manager extension itself from registering.
let DSThemeSlider = null;
let DSThemeSliderPromise = null;
function loadDSThemeSlider() {
  if (DSThemeSlider) return Promise.resolve(DSThemeSlider);
  if (!DSThemeSliderPromise) {
    DSThemeSliderPromise = import("../UIElements/Controls/Slider.js")
      .then(mod => {
        if (typeof mod?.Slider !== "function") throw new Error("Slider export not found");
        DSThemeSlider = mod.Slider;
        return DSThemeSlider;
      });
  }
  return DSThemeSliderPromise;
}

const SVG_ICONS = {
  check: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
  chevronDown: `<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`,
  chevronUp: `<svg viewBox="0 0 24 24" width="8" height="8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>`,
  chevronSmallDown: `<svg viewBox="0 0 24 24" width="8" height="8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`,
  eyedropper: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 22 1-1h3l9-9"/><path d="M16.5 4.5 19.5 7.5"/><path d="m14 7 3 3"/><path d="M19 2a2.828 2.828 0 0 1 4 4l-11 11H8v-4L19 2Z"/></svg>`,
  copy: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,
  paste: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>`,
  export: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>`,
  import: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
};

// ---------------------------------------------------------------------------
// 20 Curated Factory Presets (Tab 1)
// ---------------------------------------------------------------------------
const FACTORY_PRESETS_20 = [
  { name: "Cyberpunk", title: "#ff007f", titleText: "#ffffff", body: "#1a0926", stroke: "#ff007f" },
  { name: "Slate Dark", title: "#1e293b", titleText: "#f8fafc", body: "#0f172a", stroke: "#334155" },
  { name: "Emerald Forest", title: "#064e3b", titleText: "#a7f3d0", body: "#022c22", stroke: "#059669" },
  { name: "Sunset Amber", title: "#78350f", titleText: "#fef3c7", body: "#451a03", stroke: "#d97706" },
  { name: "Vaporwave", title: "#701a75", titleText: "#fdf4ff", body: "#3b0764", stroke: "#d946ef" },
  { name: "Dracula", title: "#44475a", titleText: "#f8f8f2", body: "#282a36", stroke: "#bd93f9" },
  { name: "Nordic Frost", title: "#3b4252", titleText: "#eceff4", body: "#2e3440", stroke: "#88c0d0" },
  { name: "Obsidian", title: "#18181b", titleText: "#fafafa", body: "#09090b", stroke: "#27272a" },
  { name: "Rose Gold", title: "#881337", titleText: "#ffe4e6", body: "#4c0519", stroke: "#fb7185" },
  { name: "Iceberg", title: "#164e63", titleText: "#cffafe", body: "#083344", stroke: "#06b6d4" },
  { name: "Crimson Blood", title: "#7f1d1d", titleText: "#fee2e2", body: "#450a0a", stroke: "#ef4444" },
  { name: "Sandstone", title: "#44403c", titleText: "#f5f5f4", body: "#1c1917", stroke: "#a8a29e" },
  { name: "Midnight Navy", title: "#1e3a8a", titleText: "#dbeafe", body: "#172554", stroke: "#3b82f6" },
  { name: "Mint Fresh", title: "#065f46", titleText: "#d1fae5", body: "#022c22", stroke: "#10b981" },
  { name: "Deep Amethyst", title: "#581c87", titleText: "#f3e8ff", body: "#3b0764", stroke: "#a855f7" },
  { name: "Solarized Dark", title: "#073642", titleText: "#eee8d5", body: "#002b36", stroke: "#2aa198" },
  { name: "Toxic Lime", title: "#3f6212", titleText: "#ecfccb", body: "#1a2e05", stroke: "#84cc16" },
  { name: "Tokyo Night", title: "#1f2335", titleText: "#c0caf5", body: "#1a1b26", stroke: "#7aa2f7" },
  { name: "Warm Espresso", title: "#3e2723", titleText: "#efebe9", body: "#271c19", stroke: "#8d6e63" },
  { name: "Pure Minimal", title: "#262626", titleText: "#ffffff", body: "#171717", stroke: "#404040" },
];

// ---------------------------------------------------------------------------
// Typography Presets (Tab 3)
// ---------------------------------------------------------------------------
const TYPOGRAPHY_PRESETS = [
  { name: "Modern Clean Sans", font: "Inter", size: 14, weight: "500", tracking: "0px" },
  { name: "Cyber Monospace", font: "JetBrains Mono", size: 13, weight: "600", tracking: "0.5px" },
  { name: "Compact Technical", font: "Fira Code", size: 12, weight: "500", tracking: "-0.3px" },
  { name: "Editorial Serif", font: "Merriweather", size: 14, weight: "400", tracking: "0px" },
  { name: "Futuristic Display", font: "Orbitron", size: 13, weight: "700", tracking: "1px" },
];

const STANDARD_FONTS = [
  "Inter", "Roboto", "Open Sans", "Poppins", "Montserrat", "Lato", "Nunito",
  "Ubuntu", "JetBrains Mono", "Fira Code", "Source Sans 3", "Source Code Pro",
  "Noto Sans", "IBM Plex Sans", "IBM Plex Mono", "Merriweather", "Orbitron",
  "Raleway", "Work Sans", "Inconsolata", "Rubik", "Outfit", "Manrope"
];

// ---------------------------------------------------------------------------
// Color Utilities (HSV / RGB / HEX)
// ---------------------------------------------------------------------------
function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function hexToRgb(hex) {
  let c = String(hex || "").trim().replace("#", "");
  if (c.length === 3) c = c.split("").map(x => x + x).join("");
  if (c.length === 4) c = c.split("").map(x => x + x).join("");
  if (c.length === 6) {
    const r = parseInt(c.slice(0, 2), 16) || 0;
    const g = parseInt(c.slice(2, 4), 16) || 0;
    const b = parseInt(c.slice(4, 6), 16) || 0;
    return { r, g, b, a: 1 };
  }
  if (c.length === 8) {
    const r = parseInt(c.slice(0, 2), 16) || 0;
    const g = parseInt(c.slice(2, 4), 16) || 0;
    const b = parseInt(c.slice(4, 6), 16) || 0;
    const a = parseFloat((parseInt(c.slice(6, 8), 16) / 255).toFixed(2)) || 1;
    return { r, g, b, a };
  }
  return { r: 103, g: 232, b: 249, a: 1 };
}

function rgbToHex(r, g, b, a = 1) {
  const to2 = n => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, "0");
  if (a < 1) {
    const a2 = Math.round(clamp(a, 0, 1) * 255).toString(16).padStart(2, "0");
    return `#${to2(r)}${to2(g)}${to2(b)}${a2}`;
  }
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}

function getLuminance(color) {
  const rgb = hexToRgb(color);
  if (!rgb) return 0.2;
  const toLinear = (v) => {
    const val = v / 255;
    return val <= 0.04045 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(rgb.r) + 0.7152 * toLinear(rgb.g) + 0.0722 * toLinear(rgb.b);
}

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;
  if (max !== min) {
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), v: Math.round(v * 100) };
}

function hsvToRgb(h, s, v) {
  h = (h % 360) / 60;
  s = s / 100;
  v = v / 100;
  const i = Math.floor(h);
  const f = h - i;
  const p = v * (1 - s);
  const q = v * (1 - s * f);
  const t = v * (1 - s * (1 - f));
  let r = 0, g = 0, b = 0;
  switch (i) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    default: r = v; g = p; b = q; break;
  }
  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255)
  };
}

// ---------------------------------------------------------------------------
// Helpers for Node Detection & Storage
// ---------------------------------------------------------------------------
function isDSNode(node) {
  return Boolean(
    node?.comfyClass?.startsWith("DS_") ||
    node?.type?.startsWith("DS_") ||
    node?.constructor?.name?.startsWith("DS_") ||
    node?.constructor?.type?.startsWith("DS_")
  );
}

function getSelectedNodes() {
  const canvas = app.canvas;
  if (!canvas) return [];
  if (canvas.selected_nodes && Object.keys(canvas.selected_nodes).length > 0) {
    return Object.values(canvas.selected_nodes).filter(Boolean);
  }
  const graph = canvas.graph || app.graph;
  if (graph?._nodes) {
    return graph._nodes.filter(n => n?.is_selected);
  }
  return [];
}

function dirtyCanvas() {
  app.graph?.setDirtyCanvas?.(true, true);
  app.canvas?.setDirty?.(true, true);
}

function safeLoad(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_) {
    return fallback;
  }
}

function safeSave(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (_) {}
}

function getSmartContrastVars(accentHex, cardHex, bgHex) {
  const accentLum = getLuminance(accentHex || "#67e8f9");
  const cardLum = getLuminance(cardHex || "#12151c");

  const isBrightAccent = accentLum > 0.40;
  const onAccent = isBrightAccent ? "#0a0c10" : "#ffffff";
  const onAccentMuted = isBrightAccent ? "rgba(10, 12, 16, 0.72)" : "rgba(255, 255, 255, 0.75)";
  const onAccentShadow = isBrightAccent ? "0 1px 0 rgba(255, 255, 255, 0.35)" : "0 1px 2px rgba(0, 0, 0, 0.70)";

  const isLightCard = cardLum > 0.45;
  const textColor = isLightCard ? "#0f172a" : "#f1f5f9";
  const textMuted = isLightCard ? "#64748b" : "#94a3b8";

  return {
    onAccent,
    onAccentMuted,
    onAccentShadow,
    textColor,
    textMuted,
  };
}

function applyThemeVariables(target, tokens, themeObj = null) {
  if (!target || !tokens) return;
  const style = target.style || target;
  if (!style || typeof style.setProperty !== "function") return;

  const smart = getSmartContrastVars(tokens.accent, tokens.surface, tokens.headerBg);
  const text = tokens.text || smart.textColor;
  const textMuted = tokens.textMuted || smart.textMuted;
  const btnBg = tokens.btnBg || tokens.surface2 || "#161a23";
  const btnHover = tokens.btnHover || "#1c2130";

  // Modern overhaul design system tokens
  style.setProperty("--ds-color-base", tokens.headerBg);
  style.setProperty("--ds-color-card", tokens.surface);
  style.setProperty("--ds-color-card-border", tokens.border);
  style.setProperty("--ds-color-panel-2", tokens.surface2);
  style.setProperty("--ds-color-accent", tokens.accent);
  style.setProperty("--ds-color-accent-hover", tokens.accent);
  style.setProperty("--ds-color-accent-active", tokens.accent);
  style.setProperty("--ds-color-focus-ring", `color-mix(in srgb, ${tokens.accent} 25%, transparent)`);
  style.setProperty("--ds-color-text", text);
  style.setProperty("--ds-color-muted-text", textMuted);
  style.setProperty("--ds-color-on-accent", smart.onAccent);
  style.setProperty("--ds-color-on-accent-shadow", smart.onAccentShadow);
  style.setProperty("--ds-color-on-panel", smart.textColor);
  style.setProperty("--ds-color-border", tokens.border);
  style.setProperty("--ds-color-border-hover", tokens.borderActive || tokens.accent);
  style.setProperty("--ds-btn-bg", btnBg);
  style.setProperty("--ds-btn-hover", btnHover);
  style.setProperty("--ds-btn-text", text);
  style.setProperty("--ds-btn-border", tokens.border);
  style.setProperty("--ds-input-bg", tokens.surface2);

  // Backward-compatible legacy tokens
  style.setProperty("--ds-bg", tokens.headerBg);
  style.setProperty("--ds-panel", tokens.surface);
  style.setProperty("--ds-panel-2", tokens.surface2);
  style.setProperty("--ds-border", tokens.border);
  style.setProperty("--ds-border-active", tokens.borderActive || tokens.accent);
  style.setProperty("--ds-accent", tokens.accent);
  style.setProperty("--ds-cp-accent", tokens.accent);
  style.setProperty("--ds-text", text);
  style.setProperty("--ds-text-muted", textMuted);
  style.setProperty("--ds-on-accent", smart.onAccent);
  style.setProperty("--ds-on-accent-shadow", smart.onAccentShadow);
  if (tokens.socketFill) style.setProperty("--ds-socket-fill", tokens.socketFill);
  if (tokens.wireAccent) style.setProperty("--ds-wire-accent", tokens.wireAccent);

  // Apply complete set of variables if themeObj provided
  if (themeObj?.vars) {
    for (const [k, v] of Object.entries(themeObj.vars)) {
      style.setProperty(k, v);
    }
  }
}

// Theme-tab color slots and the theme variables they edit. Edits are stored
// as per-theme overrides in the global config (config.custom[themeId]).
const TOKEN_VARS = {
  accent: "--ds-accent",
  surface: "--ds-panel",
  surface2: "--ds-panel-2",
  headerBg: "--ds-bg",
  border: "--ds-border",
  borderActive: "--ds-border-active",
  text: "--ds-text",
  textMuted: "--ds-text-muted",
  btnBg: "--ds-btn-bg",
  btnHover: "--ds-btn-hover",
  socketFill: "--ds-socket-fill",
  wireAccent: "--ds-wire-accent",
};

function tokensFromTheme(theme, fallback) {
  const v = theme?.vars || {};
  const tokens = { ...fallback };
  for (const [key, name] of Object.entries(TOKEN_VARS)) {
    if (v[name]) tokens[key] = v[name];
  }
  tokens.btnBg = v["--ds-btn-bg"] || tokens.surface2;
  tokens.borderActive = v["--ds-border-active"] || tokens.accent;
  tokens.socketFill = v["--ds-socket-fill"] || tokens.accent;
  tokens.wireAccent = v["--ds-wire-accent"] || tokens.accent;
  return tokens;
}

function themeOverrides(themeId, tokens) {
  const base = tokensFromTheme(window.DSGlobalTheme?.getThemes?.()[themeId], tokens);
  const out = {};
  for (const [key, name] of Object.entries(TOKEN_VARS)) {
    if (tokens[key] && String(tokens[key]).toLowerCase() !== String(base[key]).toLowerCase()) {
      out[name] = tokens[key];
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Proprietary Zero-Native HSV Color Picker Component
// ---------------------------------------------------------------------------
class DSHSVColorPicker {
  constructor({ value = "#67e8f9", onChange = null }) {
    this.onChange = onChange;
    const rgb = hexToRgb(value);
    const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
    this.h = hsv.h;
    this.s = hsv.s;
    this.v = hsv.v;
    this.a = rgb.a;
    this.hex = value;

    this.root = document.createElement("div");
    this.root.className = "ds-hsv-picker";
    this._buildUI();
    this._bindEvents();
    this._updateUI(false);
  }

  _buildUI() {
    this.root.innerHTML = `
      <div class="ds-hsv-satval-box" data-el="satvalBox">
        <canvas class="ds-hsv-satval-canvas" data-el="satvalCanvas"></canvas>
        <div class="ds-hsv-satval-pin" data-el="satvalPin"></div>
      </div>
      <div class="ds-hsv-strip-row">
        <div class="ds-hsv-swatch-box">
          <div class="ds-hsv-swatch-fill" data-el="swatchFill"></div>
        </div>
        <div class="ds-hsv-strip-col">
          <div class="ds-hsv-hue-strip" data-el="hueStrip">
            <div class="ds-hsv-strip-thumb" data-el="hueThumb"></div>
          </div>
          <div class="ds-hsv-alpha-strip" data-el="alphaStrip">
            <div class="ds-hsv-alpha-gradient" data-el="alphaGrad"></div>
            <div class="ds-hsv-strip-thumb" data-el="alphaThumb"></div>
          </div>
        </div>
        ${window.EyeDropper ? `<button type="button" class="ds-ui-btn ds-ui-btn-icon-only ds-ui-btn-compact ds-hsv-eyedropper-btn" data-el="eyedropperBtn" title="Pick color from screen">${SVG_ICONS.eyedropper}</button>` : ""}
      </div>
      <div class="ds-hsv-inputs-row">
        <div class="ds-hsv-input-field" style="flex:2;">
          <span class="ds-hsv-input-label">HEX</span>
          <input type="text" class="ds-ui-input ds-tm-input" data-el="hexInput" spellcheck="false" />
        </div>
        <div class="ds-hsv-input-field">
          <span class="ds-hsv-input-label">R</span>
          <input type="number" class="ds-ui-input ds-tm-input" data-el="rInput" min="0" max="255" />
        </div>
        <div class="ds-hsv-input-field">
          <span class="ds-hsv-input-label">G</span>
          <input type="number" class="ds-ui-input ds-tm-input" data-el="gInput" min="0" max="255" />
        </div>
        <div class="ds-hsv-input-field">
          <span class="ds-hsv-input-label">B</span>
          <input type="number" class="ds-ui-input ds-tm-input" data-el="bInput" min="0" max="255" />
        </div>
        <div class="ds-hsv-input-field">
          <span class="ds-hsv-input-label">A%</span>
          <input type="number" class="ds-ui-input ds-tm-input" data-el="aInput" min="0" max="100" />
        </div>
      </div>
      <div class="ds-hsv-quick-swatches" data-el="quickSwatches"></div>
    `;

    this.el = {};
    this.root.querySelectorAll("[data-el]").forEach(e => {
      this.el[e.dataset.el] = e;
    });

    // Swatches palette
    const swatches = [
      "#67e8f9", "#38bdf8", "#818cf8", "#c084fc", "#f472b6", "#fb7185",
      "#34d399", "#a3e635", "#facc15", "#fb923c", "#f87171", "#e5e7eb"
    ];
    swatches.forEach(hex => {
      const s = document.createElement("div");
      s.className = "ds-hsv-quick-swatch";
      s.style.backgroundColor = hex;
      s.title = hex;
      s.addEventListener("click", () => this.setColor(hex, true));
      this.el.quickSwatches.appendChild(s);
    });
  }

  _bindEvents() {
    // 2D Saturation / Value Box drag
    const satvalBox = this.el.satvalBox;
    const handleSatval = (e) => {
      const rect = satvalBox.getBoundingClientRect();
      const x = clamp(e.clientX - rect.left, 0, rect.width);
      const y = clamp(e.clientY - rect.top, 0, rect.height);
      this.s = Math.round((x / rect.width) * 100);
      this.v = Math.round((1 - y / rect.height) * 100);
      this._updateUI(true);
    };

    satvalBox.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      handleSatval(e);
      const onMove = (ev) => handleSatval(ev);
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    });

    // Hue Strip drag
    const hueStrip = this.el.hueStrip;
    const handleHue = (e) => {
      const rect = hueStrip.getBoundingClientRect();
      const x = clamp(e.clientX - rect.left, 0, rect.width);
      this.h = Math.round((x / rect.width) * 360);
      this._updateUI(true);
    };
    hueStrip.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      handleHue(e);
      const onMove = (ev) => handleHue(ev);
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    });

    // Alpha Strip drag
    const alphaStrip = this.el.alphaStrip;
    const handleAlpha = (e) => {
      const rect = alphaStrip.getBoundingClientRect();
      const x = clamp(e.clientX - rect.left, 0, rect.width);
      this.a = parseFloat((x / rect.width).toFixed(2));
      this._updateUI(true);
    };
    alphaStrip.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      handleAlpha(e);
      const onMove = (ev) => handleAlpha(ev);
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    });

    // EyeDropper API
    if (this.el.eyedropperBtn) {
      this.el.eyedropperBtn.addEventListener("click", async () => {
        try {
          const dropper = new window.EyeDropper();
          const result = await dropper.open();
          if (result?.sRGBHex) {
            this.setColor(result.sRGBHex, true);
          }
        } catch (_) {}
      });
    }

    // Explicit Inputs validation & sync
    this.el.hexInput.addEventListener("change", () => {
      let v = this.el.hexInput.value.trim();
      if (!v.startsWith("#")) v = `#${v}`;
      if (/^#[0-9a-fA-F]{6}$/.test(v) || /^#[0-9a-fA-F]{8}$/.test(v)) {
        this.setColor(v, true);
      } else {
        this.el.hexInput.value = this.hex;
      }
    });

    const handleRgbChange = () => {
      const r = clamp(parseInt(this.el.rInput.value, 10) || 0, 0, 255);
      const g = clamp(parseInt(this.el.gInput.value, 10) || 0, 0, 255);
      const b = clamp(parseInt(this.el.bInput.value, 10) || 0, 0, 255);
      const a = clamp(parseInt(this.el.aInput.value, 10) || 100, 0, 100) / 100;
      const hsv = rgbToHsv(r, g, b);
      this.h = hsv.h;
      this.s = hsv.s;
      this.v = hsv.v;
      this.a = a;
      this._updateUI(true);
    };

    [this.el.rInput, this.el.gInput, this.el.bInput, this.el.aInput].forEach(inp => {
      inp.addEventListener("change", handleRgbChange);
    });
  }

  _renderCanvas() {
    const canvas = this.el.satvalCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = (canvas.width = canvas.offsetWidth || 340);
    const h = (canvas.height = canvas.offsetHeight || 150);

    const pureRgb = hsvToRgb(this.h, 100, 100);
    ctx.fillStyle = `rgb(${pureRgb.r}, ${pureRgb.g}, ${pureRgb.b})`;
    ctx.fillRect(0, 0, w, h);

    const gradWhite = ctx.createLinearGradient(0, 0, w, 0);
    gradWhite.addColorStop(0, "rgba(255,255,255,1)");
    gradWhite.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradWhite;
    ctx.fillRect(0, 0, w, h);

    const gradBlack = ctx.createLinearGradient(0, 0, 0, h);
    gradBlack.addColorStop(0, "rgba(0,0,0,0)");
    gradBlack.addColorStop(1, "rgba(0,0,0,1)");
    ctx.fillStyle = gradBlack;
    ctx.fillRect(0, 0, w, h);
  }

  _updateUI(fire = true) {
    this._renderCanvas();

    // Satval pin position
    this.el.satvalPin.style.left = `${this.s}%`;
    this.el.satvalPin.style.top = `${100 - this.v}%`;

    // Hue thumb
    this.el.hueThumb.style.left = `${(this.h / 360) * 100}%`;

    // Alpha thumb & gradient
    const rgb = hsvToRgb(this.h, this.s, this.v);
    this.el.alphaThumb.style.left = `${this.a * 100}%`;
    this.el.alphaGrad.style.background = `linear-gradient(to right, rgba(${rgb.r},${rgb.g},${rgb.b},0), rgba(${rgb.r},${rgb.g},${rgb.b},1))`;

    // Active color string
    this.hex = rgbToHex(rgb.r, rgb.g, rgb.b, this.a);
    this.el.swatchFill.style.backgroundColor = this.hex;

    // Inputs
    this.el.hexInput.value = this.hex.toUpperCase();
    this.el.rInput.value = rgb.r;
    this.el.gInput.value = rgb.g;
    this.el.bInput.value = rgb.b;
    this.el.aInput.value = Math.round(this.a * 100);

    if (fire && this.onChange) {
      this.onChange(this.hex, rgb);
    }
  }

  setColor(hex, fire = true) {
    if (!hex) return;
    const rgb = hexToRgb(hex);
    const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
    this.h = hsv.h;
    this.s = hsv.s;
    this.v = hsv.v;
    this.a = rgb.a;
    this.hex = hex;
    this._updateUI(fire);
  }

  getColor() {
    return this.hex;
  }
}

// ---------------------------------------------------------------------------
// Main DS Theme Manager Dashboard Class
// ---------------------------------------------------------------------------
class DSThemeManagerDashboard {
  constructor() {
    this.isOpen = false;
    this.activeTab = "themes";
    this.activeSubTab = "title";

    // Data State
    this.titleColor = "#1e293b";
    this.titleTextColor = "#f8fafc";
    this.bodyColor = "#0f172a";
    this.strokeColor = "#334155";

    // Micro DS Theming Tokens
    this.dsTokens = {
      accent: "#67e8f9",
      surface: "#12151c",
      surface2: "#161a23",
      headerBg: "#0b0d12",
      btnBg: "#161a23",
      btnHover: "#1c2130",
      border: "#242a36",
      borderActive: "#67e8f9",
      text: "#e5e7eb",
      textMuted: "#9ca3af",
      socketFill: "#a3e635",
      wireAccent: "#67e8f9",
    };

    // Rehydrate from the global theme engine (includes this theme's saved overrides).
    const savedGlobalConfig = safeLoad(STORAGE_GLOBAL_CONFIG, null);
    this.dsTokens = tokensFromTheme(window.DSGlobalTheme?.getTheme?.(savedGlobalConfig?.theme), this.dsTokens);

    const savedTypoConfig = savedGlobalConfig || {};
    this.typoState = {
      font: savedTypoConfig.font || "Inter",
      fontSize: Number(savedTypoConfig.fontSize) || 14,
      fontWeight: savedTypoConfig.fontWeight || "500",
      tracking: savedTypoConfig.tracking || "0px",
      fallback: "Inter, system-ui, sans-serif"
    };

    // rAF token for color-picker drag throttle
    this._pickerRafPending = false;
    this._pickerRafToken = null;

    // Saved slots
    this.customSlots = safeLoad(STORAGE_CUSTOM_SLOTS, new Array(20).fill(null));
    this.dsSlots = safeLoad(STORAGE_DS_SLOTS, new Array(8).fill(null));

    this._built = false;
    this._initModalDOM();
  }

  _initModalDOM() {
    if (this._built) return;
    this._built = true;

    this.overlay = document.createElement("div");
    this.overlay.className = "ds-tm-modal-overlay";
    this.overlay.dataset.dsThemed = "true";

    this.overlay.innerHTML = `
      <div class="ds-tm-window" data-el="window">
        <!-- Window Header -->
        <div class="ds-tm-header">
          <div class="ds-tm-brand">
            <span class="ds-tm-brand-badge">DS</span>
            <span class="ds-tm-brand-title">Theme Manager</span>
          </div>
          <div class="ds-tm-tabs-nav">
            <button type="button" class="ds-ui-btn ds-ui-btn-compact ds-tm-tab-btn active" data-tab="themes">DS Themes (50)</button>
            <button type="button" class="ds-ui-btn ds-ui-btn-compact ds-tm-tab-btn" data-tab="typography">Typography</button>
            <button type="button" class="ds-ui-btn ds-ui-btn-compact ds-tm-tab-btn" data-tab="customization">Canvas / Native Nodes</button>
          </div>
          <button type="button" class="ds-ui-btn ds-ui-btn-icon-only ds-ui-btn-compact ds-tm-close-btn" data-el="closeBtn" title="Close (Esc)">✕</button>
        </div>

        <!-- Target / Scope Bar -->
        <div class="ds-tm-target-bar">
          <div class="ds-tm-target-left">
            <span class="ds-tm-target-pill" data-el="targetPill">
              <span class="ds-tm-target-dot"></span>
              <span data-el="targetText">Target: All DS Nodes on Canvas</span>
            </span>
          </div>
          <div class="ds-tm-target-right">
            <button type="button" class="ds-ui-btn ds-ui-btn-primary ds-tm-scope-btn" data-el="applySelectedBtn">Apply to All DS Nodes</button>
            <button type="button" class="ds-ui-btn ds-tm-scope-btn" data-el="applyGlobalBtn">Set as Default / Global</button>
            <button type="button" class="ds-ui-btn ds-tm-scope-btn" data-el="revertNativeBtn" title="Revert selected node(s) to ComfyUI native styling">Revert to Native</button>
            <button type="button" class="ds-ui-btn ds-ui-btn-danger ds-tm-scope-btn" data-el="resetDefaultsBtn">Reset Tab to Defaults</button>
          </div>
        </div>

        <!-- Content Body (Tabs) -->
        <div class="ds-tm-content-body">
          <!-- TAB 1: CUSTOMIZATION (Native / Canvas) -->
          <div class="ds-tm-tab-panel" data-panel="customization">
            <div class="ds-tm-cust-layout">
              <!-- Left Picker & Presets Column -->
              <div class="ds-tm-cust-left">
                <div class="ds-tm-subtabs">
                  <button type="button" class="ds-ui-btn ds-ui-btn-compact ds-tm-subtab-btn active" data-subtab="title">Title Bar</button>
                  <button type="button" class="ds-ui-btn ds-ui-btn-compact ds-tm-subtab-btn" data-subtab="body">Node Body</button>
                </div>
                <div data-el="custColorPickerContainer"></div>
                <div class="ds-tm-color-pair-inputs" data-el="custPairInputs"></div>

                <!-- 20 Factory Presets Section -->
                <div class="ds-tm-card-section" style="margin-top:2px;">
                  <div class="ds-tm-section-heading">
                    <span>20 Factory Presets</span>
                    <span style="font-size:9px; color:var(--ds-text-muted);">Organized Styles</span>
                  </div>
                  <div class="ds-tm-preset-grid" data-el="factoryPresetGrid"></div>
                </div>
              </div>

              <!-- Right Preview & User Memory Slots Column -->
              <div class="ds-tm-cust-right">
                <!-- Live Mini Mock Node Preview -->
                <div class="ds-tm-node-preview-box">
                  <div class="ds-tm-mock-node" data-el="mockNode">
                    <div class="ds-tm-mock-header" data-el="mockHeader">
                      <div style="display:flex; align-items:center; gap:8px;">
                        <span class="ds-tm-mock-badge-tag">COMFY</span>
                        <span data-el="mockTitle">KSampler (Advanced)</span>
                      </div>
                      <span class="ds-tm-mock-badge-tag" style="opacity:0.75;">#42</span>
                    </div>
                    <div class="ds-tm-mock-body" data-el="mockBody">
                      <div class="ds-tm-mock-slot"><span class="ds-tm-mock-dot" style="background:#67e8f9; box-shadow:0 0 6px #67e8f9;"></span><span>model</span></div>
                      <div class="ds-tm-mock-slot"><span class="ds-tm-mock-dot" style="background:#fbbf24; box-shadow:0 0 6px #fbbf24;"></span><span>positive (conditioning)</span></div>
                      <div class="ds-tm-mock-slot"><span class="ds-tm-mock-dot" style="background:#f87171; box-shadow:0 0 6px #f87171;"></span><span>negative (conditioning)</span></div>
                      <div class="ds-tm-mock-slot"><span class="ds-tm-mock-dot" style="background:#ec4899; box-shadow:0 0 6px #ec4899;"></span><span>latent_image</span></div>
                      
                      <div class="ds-tm-mock-param-pill">
                        <span>steps: 25 &bull; cfg: 7.0 &bull; euler</span>
                        <span style="opacity:0.7;">denoise: 1.0</span>
                      </div>

                      <div class="ds-tm-mock-slot" style="justify-content:flex-end; margin-top:2px;">
                        <span style="color:#ec4899; font-weight:600;">LATENT</span>
                        <span class="ds-tm-mock-dot" style="background:#ec4899; box-shadow:0 0 6px #ec4899;"></span>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- 20 User Memory Slots Section -->
                <div class="ds-tm-card-section">
                  <div class="ds-tm-section-heading">
                    <span>20 User Save Slots</span>
                    <span style="font-size:9px; color:var(--ds-text-muted);">Left-Click: Save/Load • Right-Click: Purge</span>
                  </div>
                  <div class="ds-tm-preset-grid" data-el="userSlotsGrid"></div>
                </div>
              </div>
            </div>
          </div>

          <!-- TAB 2: DS THEMES (Default Tab) -->
          <div class="ds-tm-tab-panel active" data-panel="themes">
            <div class="ds-tm-themes-layout">
              <!-- Left Catalog Column -->
              <div class="ds-tm-theme-catalog">
                <div class="ds-tm-catalog-header">
                  <div class="ds-tm-section-heading" style="margin-bottom:6px;">
                    <span>Theme Library</span>
                    <span style="font-size:9px; color:var(--ds-text-muted);" data-el="themeCountLabel">50 Themes</span>
                  </div>
                  <div class="ds-tm-cat-filter-row">
                    <button type="button" class="ds-ui-btn ds-ui-btn-compact ds-tm-cat-filter-btn active" data-filter="all">All (50)</button>
                    <button type="button" class="ds-ui-btn ds-ui-btn-compact ds-tm-cat-filter-btn" data-filter="animated">✨ Live (10)</button>
                    <button type="button" class="ds-ui-btn ds-ui-btn-compact ds-tm-cat-filter-btn" data-filter="static">🎨 Static (40)</button>
                  </div>
                  <div class="ds-tm-search-wrap">
                    <input type="text" class="ds-ui-input ds-tm-search-input" placeholder="Search themes..." data-el="themeSearchInput" />
                  </div>
                  <div class="ds-tm-cat-filter-row" title="Live theme effects run on the browser compositor. Pausing them during runs keeps the GPU fully free for generation.">
                    <button type="button" class="ds-ui-btn ds-ui-btn-compact ds-tm-cat-filter-btn" data-motion="on">Motion On</button>
                    <button type="button" class="ds-ui-btn ds-ui-btn-compact ds-tm-cat-filter-btn" data-motion="pause_on_run">Pause While Running</button>
                    <button type="button" class="ds-ui-btn ds-ui-btn-compact ds-tm-cat-filter-btn" data-motion="off">Off</button>
                  </div>
                </div>
                <div class="ds-tm-theme-chip-list" data-el="dsThemeCatalog"></div>
              </div>

              <!-- Right Micro-Theming & Mock Surface -->
              <div class="ds-tm-micro-theme-builder">
                <!-- Live DS Node Mock Surface -->
                <div class="ds-tm-ds-mock-card" data-el="dsMockCard">
                  <div class="ds-tm-ds-mock-head" data-el="dsMockHead">
                    <div style="display:flex; align-items:center; gap:6px;">
                      <span class="ds-tm-ds-mock-badge" data-el="dsMockBadge">DS</span>
                      <span class="ds-tm-ds-mock-title">Deathshot Custom Node</span>
                    </div>
                    <span style="font-size:9px; color:var(--ds-text-muted);">Surface Layering</span>
                  </div>
                  <div style="display:flex; flex-direction:column; gap:8px;">
                    <div class="ds-tm-ds-mock-btn-row">
                      <div class="ds-tm-ds-mock-btn active" data-el="dsMockBtnActive">Active Button</div>
                      <div class="ds-tm-ds-mock-btn" data-el="dsMockBtnIdle">Idle Button</div>
                      <div class="ds-tm-ds-mock-btn" style="border-color:var(--ds-accent); color:var(--ds-accent);" data-el="dsMockBtnAccent">Accent</div>
                    </div>
                    <div style="height:6px; background:var(--ds-border); border-radius:3px; overflow:hidden;">
                      <div style="width:60%; height:100%; background:var(--ds-accent);" data-el="dsMockSlider"></div>
                    </div>
                  </div>
                </div>

                <!-- Multi-Element Granular Theming Controls -->
                <div class="ds-tm-card-section">
                  <div class="ds-tm-section-heading">
                    <span>Micro-Element Theming</span>
                    <span style="font-size:9px; color:var(--ds-text-muted);">Proprietary DS Surfaces</span>
                  </div>
                  <div data-el="dsElementRows" style="display:flex; flex-direction:column; gap:6px;"></div>
                </div>

                <!-- DS Themes Save Slots & Import/Export -->
                <div class="ds-tm-card-section">
                  <div class="ds-tm-section-heading">
                    <span>Custom DS Theme Slots</span>
                    <div class="ds-tm-io-row">
                      <button type="button" class="ds-ui-btn ds-ui-btn-compact ds-tm-pill-btn" data-el="exportThemeBtn" title="Export to JSON">${SVG_ICONS.export} Export</button>
                      <button type="button" class="ds-ui-btn ds-ui-btn-compact ds-tm-pill-btn" data-el="importThemeBtn" title="Import from JSON">${SVG_ICONS.import} Import</button>
                      <input type="file" data-el="importFileInput" accept=".json" style="display:none;" />
                    </div>
                  </div>
                  <div class="ds-tm-ds-slots-grid" data-el="dsSlotsGrid"></div>
                </div>
              </div>
            </div>
          </div>

          <!-- TAB 3: TYPOGRAPHY (Overhauled with UI Elements) -->
          <div class="ds-tm-tab-panel" data-panel="typography">
            <div class="ds-tm-typo-layout">
              <!-- Left Font Controls -->
              <div class="ds-tm-typo-left">
                <!-- Typography Preset Pairings -->
                <div class="ds-tm-card-section">
                  <div class="ds-tm-section-heading">
                    <span>Curated Typography Presets</span>
                  </div>
                  <div class="ds-tm-preset-chips-row" data-el="typoPresetList"></div>
                </div>

                <!-- Font Family & Metrics -->
                <div class="ds-tm-card-section">
                  <div class="ds-tm-section-heading">
                    <span>Font Family & Metrics</span>
                  </div>

                  <div class="ds-tm-control-group">
                    <label class="ds-tm-control-label">Font Family</label>
                    <div data-el="fontFamilySlot"></div>
                  </div>

                  <div class="ds-tm-control-group" style="margin-top:8px;">
                    <label class="ds-tm-control-label">Font Weight</label>
                    <div data-el="fontWeightSlot"></div>
                  </div>

                  <div class="ds-tm-control-group" style="margin-top:8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                      <label class="ds-tm-control-label" style="margin:0;">Base Font Size</label>
                      <span class="ds-tm-cyber-slider-val-pill" data-el="fontSizeVal">14px</span>
                    </div>
                    <div class="ds-tm-slider-stepper-row">
                      <div class="ds-tm-slider-cell" data-el="fontSizeSliderSlot"></div>
                      <div class="ds-tm-stepper-cell" data-el="fontSizeStepperSlot"></div>
                    </div>
                    <div class="ds-tm-quick-chips-row" data-el="fontSizeQuickChips"></div>
                  </div>

                  <div class="ds-tm-control-group" style="margin-top:8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                      <label class="ds-tm-control-label" style="margin:0;">Letter Spacing (Tracking)</label>
                      <span class="ds-tm-cyber-slider-val-pill" data-el="trackingVal">0.0px</span>
                    </div>
                    <div class="ds-tm-slider-stepper-row">
                      <div class="ds-tm-slider-cell" data-el="trackingSliderSlot"></div>
                      <div class="ds-tm-stepper-cell" data-el="trackingStepperSlot"></div>
                    </div>
                    <div class="ds-tm-quick-chips-row" data-el="trackingQuickChips"></div>
                  </div>
                </div>

                <!-- Web Font / Google Font Loader -->
                <div class="ds-tm-card-section">
                  <div class="ds-tm-section-heading">
                    <span>Google & Web Font Loader</span>
                    ${window.queryLocalFonts ? `<button type="button" class="ds-ui-btn ds-ui-btn-compact" data-el="queryLocalFontsBtn">System Fonts</button>` : ""}
                  </div>
                  <div class="ds-tm-download-box">
                    <input type="text" class="ds-ui-input ds-tm-input" data-el="webFontInput" placeholder="Font name (e.g. Outfit) or URL" />
                    <button type="button" class="ds-ui-btn ds-ui-btn-primary" data-el="loadWebFontBtn">Load</button>
                  </div>
                  <div class="ds-tm-tag-list" data-el="installedWebFonts" style="margin-top:4px;"></div>
                </div>
              </div>

              <!-- Right Live Specimen Card -->
              <div class="ds-tm-typo-right">
                <div class="ds-tm-specimen-card" data-el="typoLivePreview">
                  <div class="ds-tm-specimen-header">
                    <span style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:var(--ds-color-accent, var(--ds-accent));">Live Typography Specimen</span>
                    <span class="ds-tm-specimen-stack" data-el="fallbackHierarchyText">"Inter", system-ui, sans-serif</span>
                  </div>
                  <div class="ds-tm-specimen-h1" data-el="previewH1">Deathshot Arsenal Pro</div>
                  <div class="ds-tm-specimen-h2" data-el="previewH2">High-Density Workflow Interface & Synthesis Engine</div>
                  <div class="ds-tm-specimen-body" data-el="previewBody">
                    The quick brown fox jumps over the lazy dog. 0123456789.
                    Precision typography across every node surface with real-time font scaling, zero native scrollbar artifacts, and smart contrast tokens.
                  </div>
                  <div class="ds-tm-specimen-code" data-el="previewMono">
                    const theme = window.DSGlobalTheme.getTheme("deathshot_dark");<br/>
                    await engine.render({ seed: 789423589, steps: 30, cfg: 7.0 });
                  </div>
                  <div class="ds-tm-specimen-controls">
                    <button type="button" class="ds-ui-btn ds-ui-btn-primary ds-ui-btn-compact" data-el="specimenBtnPrimary">Execute Queue</button>
                    <button type="button" class="ds-ui-btn ds-ui-btn-compact" data-el="specimenBtnSecondary">Options</button>
                    <div class="ds-tm-specimen-counters">
                      <div class="ds-tm-counter-pill"><span style="color:var(--ds-color-accent, var(--ds-accent));">CFG</span> <span>7.0</span></div>
                      <div class="ds-tm-counter-pill"><span style="color:var(--ds-color-accent, var(--ds-accent));">STEPS</span> <span>30</span></div>
                    </div>
                  </div>
                </div>

                <div class="ds-tm-card-section" style="margin-top:12px;">
                  <div class="ds-tm-section-heading">
                    <span>Typography Hierarchy Guide</span>
                  </div>
                  <div style="font-size:11px; line-height:1.6; color:var(--ds-color-muted-text, var(--ds-text-muted));">
                    <div>• <b>Headers (H1/H2):</b> Scaled automatically from Base Font Size (1.5× and 1.0×).</div>
                    <div>• <b>Card Labels & Text:</b> Rendered at Base Font Size with configured weight.</div>
                    <div>• <b>Tracking:</b> Controls letter spacing for improved high-DPI legibility.</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Floating Toast -->
        <div class="ds-tm-toast" data-el="toast"></div>
      </div>
    `;

    document.body.appendChild(this.overlay);

    this.el = {};
    this.overlay.querySelectorAll("[data-el]").forEach(e => {
      this.el[e.dataset.el] = e;
    });

    this._bindModalEvents();
    this._initCustomizationTab();
    this._initDSThemesTab();
    this._initTypographyTab();
  }

  _bindModalEvents() {
    // Close button & Esc key
    this.el.closeBtn.addEventListener("click", () => this.close());
    this.overlay.addEventListener("pointerdown", (e) => {
      if (e.target === this.overlay) this.close();
    });

    // Window tabs navigation
    this.overlay.querySelectorAll(".ds-tm-tab-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const tab = btn.dataset.tab;
        this.switchTab(tab);
      });
    });

    // Scope Actions
    this.el.applySelectedBtn.addEventListener("click", () => this.applyToActiveSelection());
    this.el.applyGlobalBtn.addEventListener("click", () => this.applyToGlobalDefault());
    this.el.resetDefaultsBtn.addEventListener("click", () => this.resetActiveTabDefaults());
    this.el.revertNativeBtn?.addEventListener("click", () => {
      const selected = getSelectedNodes();
      if (selected.length === 0) {
        this.showToast("Select one or more nodes to revert", "info");
        return;
      }
      resetNodeToNative(selected);
      this.showToast(`Reverted ${selected.length} node(s) to native styling`, "success");
    });
  }

  // -------------------------------------------------------------------------
  // Modal Open / Close / Target State
  // -------------------------------------------------------------------------
  open() {
    this._initModalDOM();
    this._refreshTargetSelection();
    this.overlay.classList.add("open");
    this.isOpen = true;

    // Immediately synchronize modal with active theme upon opening
    const activeId = this.activeThemeId
      || window.DSGlobalTheme?.getConfig?.()?.theme
      || safeLoad("DS_THEME_ACTIVE_ID", "deathshot_dark");
    const activeTheme = this._catalogThemes?.[activeId]
      || window.DSGlobalTheme?.getTheme?.(activeId);
    if (activeTheme) {
      this._applyThemeToPopup(activeTheme, activeId, false);
    } else {
      this._syncMockPreviews();
    }
  }

  close() {
    if (!this.isOpen) return;
    this.overlay.classList.remove("open");
    this.isOpen = false;
    if (this._pendingThemeId) {
      this._persistTheme(this._pendingThemeId);
    }
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  _refreshTargetSelection() {
    const selected = getSelectedNodes();
    const tab = this.activeTab;

    if (selected.length === 1) {
      const name = selected[0].title || selected[0].type || "Node";
      this.el.targetText.textContent = `Target: 1 Node Selected (${name})`;
      if (tab === "themes") {
        this.el.applySelectedBtn.textContent = "Apply to Selected DS Node";
      } else {
        this.el.applySelectedBtn.textContent = "Apply to Selected Node";
      }
      this.el.applySelectedBtn.disabled = false;
    } else if (selected.length > 1) {
      this.el.targetText.textContent = `Target: ${selected.length} Nodes Selected`;
      if (tab === "themes") {
        this.el.applySelectedBtn.textContent = `Apply to ${selected.length} Selected DS Nodes`;
      } else {
        this.el.applySelectedBtn.textContent = `Apply to ${selected.length} Nodes`;
      }
      this.el.applySelectedBtn.disabled = false;
    } else {
      if (tab === "themes") {
        this.el.targetText.textContent = "Target: All DS Nodes on Canvas";
        this.el.applySelectedBtn.textContent = "Apply to All DS Nodes";
      } else if (tab === "typography") {
        this.el.targetText.textContent = "Target: Global Typography";
        this.el.applySelectedBtn.textContent = "Apply Typography Globally";
      } else {
        this.el.targetText.textContent = "Target: Future Nodes (No Selection)";
        this.el.applySelectedBtn.textContent = "Set as Default Colors";
      }
      this.el.applySelectedBtn.disabled = false;
    }
  }

  switchTab(tabId) {
    this.activeTab = tabId;
    this.overlay.querySelectorAll(".ds-tm-tab-btn").forEach(b => {
      b.classList.toggle("active", b.dataset.tab === tabId);
    });
    this.overlay.querySelectorAll(".ds-tm-tab-panel").forEach(p => {
      p.classList.toggle("active", p.dataset.panel === tabId);
    });
    // Refresh the apply button label to reflect the active tab's intent
    this._refreshTargetSelection();
  }

  showToast(msg, type = "") {
    const t = this.el.toast;
    if (!t) return;
    t.textContent = msg;
    t.className = `ds-tm-toast show ${type}`.trim();
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      t.classList.remove("show");
    }, 2800);
  }

  // -------------------------------------------------------------------------
  // Tab 1: Customization Implementation (Native / 3rd Party Nodes)
  // -------------------------------------------------------------------------
  _initCustomizationTab() {
    // Color picker
    this.custPicker = new DSHSVColorPicker({
      value: this.titleColor,
      onChange: (hex) => {
        if (this.activeSubTab === "title") {
          this.titleColor = hex;
        } else {
          this.bodyColor = hex;
        }
        this._updateCustPairInputs();
        this._syncMockPreviews();
        this._debounceApplyToSelection();
      }
    });
    this.el.custColorPickerContainer.appendChild(this.custPicker.root);

    // Sub-tabs: Title vs Body
    this.overlay.querySelectorAll(".ds-tm-subtab-btn").forEach(b => {
      b.addEventListener("click", () => {
        this.activeSubTab = b.dataset.subtab;
        this.overlay.querySelectorAll(".ds-tm-subtab-btn").forEach(x => {
          x.classList.toggle("active", x === b);
        });
        if (this.activeSubTab === "title") {
          this.custPicker.setColor(this.titleColor, false);
        } else {
          this.custPicker.setColor(this.bodyColor, false);
        }
        this._updateCustPairInputs();
      });
    });

    this._updateCustPairInputs();
    this._renderFactoryPresets();
    this._renderUserSlots();
  }

  _updateCustPairInputs() {
    const container = this.el.custPairInputs;
    if (!container) return;

    if (this.activeSubTab === "title") {
      container.innerHTML = `
        <div class="ds-hsv-input-field">
          <span class="ds-hsv-input-label">Title Bar Color</span>
          <input type="text" class="ds-ui-input ds-tm-input" data-el="primaryColorInput" value="${this.titleColor.toUpperCase()}" />
        </div>
        <div class="ds-hsv-input-field">
          <span class="ds-hsv-input-label">Header Text Color</span>
          <input type="text" class="ds-ui-input ds-tm-input" data-el="contrastColorInput" value="${this.titleTextColor.toUpperCase()}" />
        </div>
      `;
    } else {
      container.innerHTML = `
        <div class="ds-hsv-input-field">
          <span class="ds-hsv-input-label">Node Body Fill</span>
          <input type="text" class="ds-ui-input ds-tm-input" data-el="primaryColorInput" value="${this.bodyColor.toUpperCase()}" />
        </div>
        <div class="ds-hsv-input-field">
          <span class="ds-hsv-input-label">Outline Stroke Color</span>
          <input type="text" class="ds-ui-input ds-tm-input" data-el="contrastColorInput" value="${this.strokeColor.toUpperCase()}" />
        </div>
      `;
    }

    const pInput = container.querySelector('[data-el="primaryColorInput"]');
    const cInput = container.querySelector('[data-el="contrastColorInput"]');

    pInput.addEventListener("change", () => {
      let v = pInput.value.trim();
      if (!v.startsWith("#")) v = `#${v}`;
      if (/^#[0-9a-fA-F]{6}$/.test(v) || /^#[0-9a-fA-F]{8}$/.test(v)) {
        if (this.activeSubTab === "title") this.titleColor = v;
        else this.bodyColor = v;
        this.custPicker.setColor(v, false);
        this._syncMockPreviews();
        this._debounceApplyToSelection();
      }
    });

    cInput.addEventListener("change", () => {
      let v = cInput.value.trim();
      if (!v.startsWith("#")) v = `#${v}`;
      if (/^#[0-9a-fA-F]{6}$/.test(v) || /^#[0-9a-fA-F]{8}$/.test(v)) {
        if (this.activeSubTab === "title") this.titleTextColor = v;
        else this.strokeColor = v;
        this._syncMockPreviews();
        this._debounceApplyToSelection();
      }
    });
  }

  _renderFactoryPresets() {
    const grid = this.el.factoryPresetGrid;
    if (!grid) return;
    grid.innerHTML = "";

    FACTORY_PRESETS_20.forEach(preset => {
      const card = document.createElement("div");
      card.className = "ds-tm-preset-card";
      card.title = `${preset.name}\nTitle: ${preset.title}\nBody: ${preset.body}`;
      card.innerHTML = `
        <div class="ds-tm-preset-preview-bar">
          <div class="ds-tm-preset-title-slice" style="background:${preset.title};"></div>
          <div class="ds-tm-preset-body-slice" style="background:${preset.body}; border-left:1px solid ${preset.stroke};"></div>
        </div>
        <span class="ds-tm-preset-name">${preset.name}</span>
      `;
      card.addEventListener("click", () => {
        this.titleColor = preset.title;
        this.titleTextColor = preset.titleText;
        this.bodyColor = preset.body;
        this.strokeColor = preset.stroke;
        if (this.activeSubTab === "title") this.custPicker.setColor(this.titleColor, false);
        else this.custPicker.setColor(this.bodyColor, false);
        this._updateCustPairInputs();
        this._syncMockPreviews();
        this.applyToActiveSelection();
        this.showToast(`Applied preset: ${preset.name}`, "success");
      });
      grid.appendChild(card);
    });
  }

  _renderUserSlots() {
    const grid = this.el.userSlotsGrid;
    if (!grid) return;
    grid.innerHTML = "";

    this.customSlots.forEach((slot, idx) => {
      const card = document.createElement("div");
      card.className = `ds-tm-user-slot ${slot ? "occupied" : ""}`;
      card.dataset.index = idx;

      if (slot) {
        card.innerHTML = `
          <div class="ds-tm-preset-preview-bar">
            <div class="ds-tm-preset-title-slice" style="background:${slot.title};"></div>
            <div class="ds-tm-preset-body-slice" style="background:${slot.body}; border-left:1px solid ${slot.stroke};"></div>
          </div>
          <span class="ds-tm-slot-index">Slot #${idx + 1}</span>
        `;
      } else {
        card.innerHTML = `
          <span class="ds-tm-slot-index">Slot #${idx + 1}</span>
          <span class="ds-tm-slot-empty-label">+ Empty</span>
        `;
      }

      // Left-Click: Save into empty, or Load from populated
      card.addEventListener("click", () => {
        if (!this.customSlots[idx]) {
          // Save current state into slot
          this.customSlots[idx] = {
            title: this.titleColor,
            titleText: this.titleTextColor,
            body: this.bodyColor,
            stroke: this.strokeColor
          };
          safeSave(STORAGE_CUSTOM_SLOTS, this.customSlots);
          this._renderUserSlots();
          this.showToast(`Saved state into Slot #${idx + 1}`, "success");
        } else {
          // Load state from slot
          const s = this.customSlots[idx];
          this.titleColor = s.title;
          this.titleTextColor = s.titleText || "#ffffff";
          this.bodyColor = s.body;
          this.strokeColor = s.stroke || s.title;
          if (this.activeSubTab === "title") this.custPicker.setColor(this.titleColor, false);
          else this.custPicker.setColor(this.bodyColor, false);
          this._updateCustPairInputs();
          this._syncMockPreviews();
          this.applyToActiveSelection();
          this.showToast(`Loaded Slot #${idx + 1}`, "success");
        }
      });

      // Right-Click: Purge slot
      card.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.customSlots[idx]) {
          this.customSlots[idx] = null;
          safeSave(STORAGE_CUSTOM_SLOTS, this.customSlots);
          card.classList.add("ds-tm-slot-flash");
          setTimeout(() => this._renderUserSlots(), 200);
          this.showToast(`Cleared Slot #${idx + 1}`);
        }
      });

      grid.appendChild(card);
    });
  }

  _syncMockPreviews() {
    if (this.el.mockNode) {
      this.el.mockNode.style.border = `1px solid ${this.strokeColor}`;
    }
    if (this.el.mockHeader) {
      this.el.mockHeader.style.backgroundColor = this.titleColor;
      this.el.mockHeader.style.color = this.titleTextColor;
    }
    if (this.el.mockBody) {
      this.el.mockBody.style.backgroundColor = this.bodyColor;
    }

    const smart = getSmartContrastVars(this.dsTokens.accent, this.dsTokens.surface, this.dsTokens.headerBg);

    // Sync DS Mock Card
    if (this.el.dsMockCard) {
      this.el.dsMockCard.style.backgroundColor = this.dsTokens.surface;
      this.el.dsMockCard.style.borderColor = this.dsTokens.border;
      this.el.dsMockCard.style.color = this.dsTokens.text || smart.textColor;
    }
    if (this.el.dsMockBadge) {
      this.el.dsMockBadge.style.backgroundColor = this.dsTokens.accent;
      this.el.dsMockBadge.style.color = smart.onAccent;
      this.el.dsMockBadge.style.textShadow = smart.onAccentShadow;
    }
    if (this.el.dsMockBtnActive) {
      this.el.dsMockBtnActive.style.backgroundColor = this.dsTokens.accent;
      this.el.dsMockBtnActive.style.borderColor = this.dsTokens.accent;
      this.el.dsMockBtnActive.style.color = smart.onAccent;
      this.el.dsMockBtnActive.style.textShadow = smart.onAccentShadow;
      this.el.dsMockBtnActive.style.boxShadow = "none";
    }
    if (this.el.dsMockSlider) {
      this.el.dsMockSlider.style.backgroundColor = this.dsTokens.accent;
    }
  }

  _debounceApplyToSelection() {
    if (this._applyTimer) cancelAnimationFrame(this._applyTimer);
    this._applyTimer = requestAnimationFrame(() => {
      const selected = getSelectedNodes();
      if (selected.length > 0) {
        selected.forEach(node => {
          node.color = this.titleColor;
          delete node.title_color;
          if (node.constructor) {
            delete node.constructor.title_color;
            delete node.constructor.title_text_color;
          }
          node.title_text_color = this.titleTextColor;
          node.bgcolor = this.bodyColor;
          node.boxcolor = this.strokeColor;
          node.setDirtyCanvas?.(true, true);
        });
        dirtyCanvas();
      }
    });
  }

  // -------------------------------------------------------------------------
  // Tab 2: DS Themes Implementation (Deathshot Custom Nodes)
  // -------------------------------------------------------------------------
  async _initDSThemesTab() {
    await this._loadThemesCatalog();
    this._renderMicroElementRows();
    this._renderDSSlots();

    // Export / Import
    this.el.exportThemeBtn.addEventListener("click", () => this._exportCurrentDSTheme());
    this.el.importThemeBtn.addEventListener("click", () => this.el.importFileInput.click());
    this.el.importFileInput.addEventListener("change", (e) => this._importDSTheme(e));

    const motionBtns = this.overlay.querySelectorAll(".ds-tm-cat-filter-btn[data-motion]");
    const syncMotion = (motion) => motionBtns.forEach(b => b.classList.toggle("active", b.dataset.motion === motion));
    syncMotion(window.DSGlobalTheme?.getConfig?.()?.motion || "on");
    motionBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        syncMotion(btn.dataset.motion);
        window.DSGlobalTheme?.apply({ motion: btn.dataset.motion }, { save: true });
      });
    });

    // Category Filter Buttons
    this.overlay.querySelectorAll(".ds-tm-cat-filter-btn[data-filter]").forEach(btn => {
      btn.addEventListener("click", () => {
        this.overlay.querySelectorAll(".ds-tm-cat-filter-btn[data-filter]").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        this._activeThemeFilter = btn.dataset.filter || "all";
        this._renderThemesList();
      });
    });

    // Theme Search Filter
    if (this.el.themeSearchInput) {
      this.el.themeSearchInput.addEventListener("input", (e) => {
        this._themeSearchQuery = (e.target.value || "").toLowerCase().trim();
        this._renderThemesList();
      });
    }
  }

  async _loadThemesCatalog() {
    let themesObj = {};
    if (window.DSGlobalTheme) {
      themesObj = window.DSGlobalTheme.getThemes() || {};
    }
    if (Object.keys(themesObj).length === 0) {
      try {
        const resp = await fetch("/ds/theme/themes");
        if (resp.ok) {
          const data = await resp.json();
          themesObj = data.themes || {};
        }
      } catch (_) {}
    }

    this._catalogThemes = themesObj;
    this._activeThemeFilter = "all";
    this._themeSearchQuery = "";
    this._renderThemesList();

    // Rehydrate and apply active theme immediately to the modal window
    const activeThemeId = window.DSGlobalTheme?.getConfig?.()?.theme
      || safeLoad("DS_THEME_ACTIVE_ID", "deathshot_dark");
    const activeTheme = this._catalogThemes[activeThemeId] || this._catalogThemes.deathshot_dark;
    if (activeTheme) {
      this._applyThemeToPopup(activeTheme, activeThemeId, false);
    }
  }

  _renderThemesList() {
    const container = this.el.dsThemeCatalog;
    if (!container || !this._catalogThemes) return;

    const activeThemeId = this.activeThemeId
      || window.DSGlobalTheme?.getConfig?.()?.theme
      || safeLoad("DS_THEME_ACTIVE_ID", "deathshot_dark");

    const entries = Object.entries(this._catalogThemes);
    const filter = this._activeThemeFilter || "all";
    const q = this._themeSearchQuery || "";

    if (!this._themeRowMap || this._themeRowMap.size === 0) {
      container.innerHTML = "";
      this._themeRowMap = new Map();
      entries.forEach(([id, t]) => {
        const row = document.createElement("div");
        row.className = `ds-tm-theme-chip-row ${id === activeThemeId ? "active" : ""}`;
        row.dataset.themeId = id;
        if (t.animated) row.dataset.animated = "true";
        const v = t.vars || {};
        const swatches = [
          v["--ds-color-base"] || v["--ds-bg"] || "#0b0d12",
          v["--ds-color-accent"] || v["--ds-accent"] || "#67e8f9",
          v["--ds-color-card"] || v["--ds-panel"] || "#12151c",
          v["--ds-color-text"] || v["--ds-text"] || "#e5e7eb",
        ];

        row.innerHTML = `
          <div class="ds-tm-theme-chip-info">
            <span class="ds-tm-theme-chip-name">${t.name || id}</span>
            ${t.animated ? `<span class="ds-tm-chip-anim-badge">✨ LIVE</span>` : ""}
          </div>
          <div class="ds-tm-theme-swatches-mini">
            ${swatches.map(c => `<span style="background:${c};"></span>`).join("")}
          </div>
        `;

        row.addEventListener("click", () => {
          this._themeRowMap.forEach(({ row: r }) => r.classList.remove("active"));
          row.classList.add("active");
          this._applyThemeToPopup(t, id, true);
        });

        container.appendChild(row);
        this._themeRowMap.set(id, { row, t });
      });
    }

    let visibleCount = 0;
    this._themeRowMap.forEach(({ row, t }, id) => {
      let visible = true;
      if (filter === "animated" && !t.animated) visible = false;
      if (filter === "static" && t.animated) visible = false;
      if (visible && q) {
        const name = (t.name || id).toLowerCase();
        const desc = (t.description || "").toLowerCase();
        if (!name.includes(q) && !desc.includes(q) && !id.toLowerCase().includes(q)) {
          visible = false;
        }
      }
      row.style.display = visible ? "" : "none";
      row.classList.toggle("active", id === (this.activeThemeId || activeThemeId));
      if (visible) visibleCount++;
    });

    if (this.el.themeCountLabel) {
      this.el.themeCountLabel.textContent = `${visibleCount} of ${entries.length} Themes`;
    }
  }

  _applyThemeToPopup(t, id, shouldSyncCanvas = true) {
    if (!t) return;
    this.dsTokens = tokensFromTheme(window.DSGlobalTheme?.getTheme?.(id) || t, this.dsTokens);
    this.activeThemeId = id;

    if (this.el.dsMockCard) ensureFxLayer(this.el.dsMockCard, t.fx);
    this._syncMockPreviews();
    this._syncMicroElementRows();

    // The engine repaints :root, every DS node face and the canvas node bases.
    if (shouldSyncCanvas) window.DSGlobalTheme?.preview({ theme: id });

    // Cache pending theme ID for persistence on modal close or explicit apply
    this._pendingThemeId = id;
  }

  _previewTokens() {
    const id = this.activeThemeId;
    if (!id) return;
    const custom = window.DSGlobalTheme?.getConfig?.()?.custom || {};
    window.DSGlobalTheme?.preview({ theme: id, custom: { ...custom, [id]: themeOverrides(id, this.dsTokens) } });
  }

  _persistTheme(themeId) {
    if (!themeId) return;
    safeSave("DS_THEME_ACTIVE_ID", themeId);
    const existingCfg = safeLoad(STORAGE_GLOBAL_CONFIG, {});
    safeSave(STORAGE_GLOBAL_CONFIG, {
      ...existingCfg,
      theme: themeId,
      font: this.typoState.font,
      fontSize: this.typoState.fontSize,
      fontWeight: this.typoState.fontWeight,
      tracking: this.typoState.tracking,
    });
    this._debounceSaveServerConfig(themeId);
  }

  _debounceSaveServerConfig(themeId) {
    if (this._serverSaveTimer) clearTimeout(this._serverSaveTimer);
    this._serverSaveTimer = setTimeout(async () => {
      try {
        if (window.DSGlobalTheme?.apply) {
          const currentConfig = window.DSGlobalTheme.getConfig?.() || {};
          await window.DSGlobalTheme.apply(
            {
              theme: themeId,
              font: this.typoState.font,
              fontSize: this.typoState.fontSize,
              fontWeight: this.typoState.fontWeight,
              tracking: this.typoState.tracking,
              custom: currentConfig.custom || {},
            },
            { save: true }
          );
        } else {
          await fetch("/ds/theme/config", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              config: {
                theme: themeId,
                font: this.typoState.font,
                fontSize: this.typoState.fontSize,
                fontWeight: this.typoState.fontWeight,
                tracking: this.typoState.tracking,
              }
            }),
          });
        }
      } catch (_) {}
    }, 300);
  }

  _renderMicroElementRows() {
    const container = this.el.dsElementRows;
    if (!container) return;
    container.innerHTML = "";

    const elements = [
      { id: "accent",       title: "Accent Color (--ds-color-accent)",           desc: "Active buttons, sliders, focus rings, badges",            color: this.dsTokens.accent },
      { id: "surface",      title: "Card Surface (--ds-color-card)",             desc: "Inner modules, card container panels, widgets",          color: this.dsTokens.surface },
      { id: "surface2",     title: "Secondary Surface (--ds-color-panel-2)",     desc: "Sub-panels, button surfaces, input backdrops",           color: this.dsTokens.surface2 },
      { id: "headerBg",     title: "Base & Header (--ds-color-base)",            desc: "Node title bar background, outer canvas base",           color: this.dsTokens.headerBg },
      { id: "border",       title: "Borders (--ds-color-border)",                desc: "Outer node border stroke, card borders, dividers",       color: this.dsTokens.border },
      { id: "borderActive", title: "Active Border (--ds-color-border-hover)",    desc: "Highlighted border on active/focused elements",          color: this.dsTokens.borderActive },
      { id: "text",         title: "Primary Text (--ds-color-text)",             desc: "Main body text, labels, node content",                  color: this.dsTokens.text },
      { id: "textMuted",    title: "Muted Text (--ds-color-muted-text)",         desc: "Descriptions, placeholders, secondary labels",           color: this.dsTokens.textMuted },
      { id: "btnBg",        title: "Button Background (--ds-btn-bg)",            desc: "Idle button fill, chip backgrounds",                    color: this.dsTokens.btnBg },
      { id: "btnHover",     title: "Button Hover (--ds-btn-hover)",              desc: "Interactive hover state for buttons and chips",         color: this.dsTokens.btnHover },
      { id: "socketFill",   title: "Socket & Pin Highlights",                    desc: "Port accents, data type highlights, connection points",  color: this.dsTokens.socketFill },
      { id: "wireAccent",   title: "Wire / Link Accent",                         desc: "Node connection wire colour",                          color: this.dsTokens.wireAccent },
    ];

    elements.forEach(elem => {
      const row = document.createElement("div");
      row.className = "ds-tm-element-row";
      row.innerHTML = `
        <div class="ds-tm-element-info">
          <span class="ds-tm-element-title">${elem.title}</span>
          <span class="ds-tm-element-desc">${elem.desc}</span>
        </div>
        <div class="ds-tm-element-picker-trigger" data-id="${elem.id}">
          <span class="ds-tm-element-swatch" style="background:${elem.color};"></span>
          <span class="ds-tm-element-hex">${elem.color.toUpperCase()}</span>
        </div>
      `;

      const trigger = row.querySelector(".ds-tm-element-picker-trigger");
      trigger.addEventListener("click", () => {
        this._openElementColorPopover(trigger, elem.id, this.dsTokens[elem.id] || elem.color);
      });

      container.appendChild(row);
    });
  }

  _syncMicroElementRows() {
    const container = this.el.dsElementRows;
    if (!container) return;
    if (container.children.length === 0) {
      this._renderMicroElementRows();
      return;
    }
    const triggers = container.querySelectorAll(".ds-tm-element-picker-trigger");
    triggers.forEach(trigger => {
      const id = trigger.dataset.id;
      if (id && this.dsTokens[id]) {
        const swatch = trigger.querySelector(".ds-tm-element-swatch");
        const hex = trigger.querySelector(".ds-tm-element-hex");
        if (swatch) swatch.style.backgroundColor = this.dsTokens[id];
        if (hex) hex.textContent = String(this.dsTokens[id]).toUpperCase();
      }
    });
  }

  _openElementColorPopover(anchor, elemId, initialColor) {
    document.querySelector(".ds-tm-element-popover")?.remove();

    const popover = document.createElement("div");
    popover.className = "ds-tm-element-popover";
    popover.style.cssText = `
      position: fixed;
      z-index: 100030;
      background: var(--ds-color-card, var(--ds-panel, #12151c));
      border: 1px solid var(--ds-color-border, var(--ds-border, #242a36));
      border-radius: var(--ds-radius-card, 6px);
      padding: 10px;
      box-shadow: 0 16px 40px rgba(0,0,0,0.8);
    `;

    const picker = new DSHSVColorPicker({
      value: initialColor,
      onChange: (hex) => {
        this.dsTokens[elemId] = hex;
        anchor.querySelector(".ds-tm-element-swatch").style.backgroundColor = hex;
        anchor.querySelector(".ds-tm-element-hex").textContent = hex.toUpperCase();
        this._syncMockPreviews();
        // Throttle heavy token application to one rAF per drag frame
        // to prevent UI freeze during continuous color picker drag.
        if (!this._pickerRafPending) {
          this._pickerRafPending = true;
          this._pickerRafToken = requestAnimationFrame(() => {
            this._pickerRafPending = false;
            this._previewTokens();
          });
        }
      }
    });

    popover.appendChild(picker.root);
    document.body.appendChild(popover);

    const rect = anchor.getBoundingClientRect();
    const left = Math.max(10, Math.min(window.innerWidth - 390, rect.right + 10));
    const top = Math.max(10, Math.min(window.innerHeight - 380, rect.top));
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;

    const closeHandler = (e) => {
      if (!popover.contains(e.target) && !anchor.contains(e.target)) {
        popover.remove();
        document.removeEventListener("pointerdown", closeHandler, true);
      }
    };
    setTimeout(() => {
      document.addEventListener("pointerdown", closeHandler, true);
    }, 10);
  }

  _renderDSSlots() {
    const grid = this.el.dsSlotsGrid;
    if (!grid) return;
    grid.innerHTML = "";

    this.dsSlots.forEach((slot, idx) => {
      const card = document.createElement("div");
      card.className = `ds-tm-ds-slot ${slot ? "occupied" : ""}`;
      card.dataset.index = idx;

      if (slot) {
        card.innerHTML = `
          <div style="display:flex; align-items:center; justify-content:space-between; width:100%;">
            <span style="font-size:9px; font-weight:700;">${slot.name || `DS Slot #${idx + 1}`}</span>
            <span style="width:10px; height:10px; border-radius:50%; background:${slot.tokens.accent};"></span>
          </div>
          <span style="font-size:8px; color:var(--ds-text-muted);">Click to load</span>
        `;
      } else {
        card.innerHTML = `
          <span style="font-size:9px; color:var(--ds-text-muted);">DS Slot #${idx + 1}</span>
          <span style="font-size:8px; color:var(--ds-text-muted);">+ Empty</span>
        `;
      }

      card.addEventListener("click", () => {
        if (!this.dsSlots[idx]) {
          this.dsSlots[idx] = {
            name: `Custom DS #${idx + 1}`,
            tokens: { ...this.dsTokens }
          };
          safeSave(STORAGE_DS_SLOTS, this.dsSlots);
          this._renderDSSlots();
          this.showToast(`Saved Theme to DS Slot #${idx + 1}`, "success");
        } else {
          this.dsTokens = { ...this.dsSlots[idx].tokens };
          this._renderMicroElementRows();
          this._syncMockPreviews();
          this._previewTokens();
          this.showToast(`Loaded DS Slot #${idx + 1}`, "success");
        }
      });

      card.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.dsSlots[idx]) {
          this.dsSlots[idx] = null;
          safeSave(STORAGE_DS_SLOTS, this.dsSlots);
          this._renderDSSlots();
          this.showToast(`Cleared DS Slot #${idx + 1}`);
        }
      });

      grid.appendChild(card);
    });
  }

  _exportCurrentDSTheme() {
    const data = {
      source: "DeathshotArsenal",
      version: "2.0.0",
      type: "ds_theme_package",
      timestamp: Date.now(),
      tokens: this.dsTokens
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ds_theme_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    this.showToast("Theme exported to JSON", "success");
  }

  _importDSTheme(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target.result);
        if (json.tokens) {
          this.dsTokens = { ...this.dsTokens, ...json.tokens };
          this._renderMicroElementRows();
          this._syncMockPreviews();
          this._previewTokens();
          this.showToast("Imported DS theme package", "success");
        }
      } catch (err) {
        this.showToast("Failed to parse theme JSON", "error");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  // -------------------------------------------------------------------------
  // Tab 3: Typography Implementation (Redesigned with DS UIElements)
  // -------------------------------------------------------------------------
  _initTypographyTab() {
    this._renderTypographyPresets();

    // 1. Font Family Dropdown
    const fontOptions = STANDARD_FONTS.map(f => ({ id: f, label: f }));
    this.fontFamilyDropdown = Dropdown({
      options: fontOptions,
      value: this.typoState.font || "Inter",
      searchable: true,
      onChange: (val) => {
        this.typoState.font = val;
        this._updateTypoPreview();
      }
    });
    this.el.fontFamilySlot?.replaceChildren(this.fontFamilyDropdown.root);

    // 2. Font Weight Dropdown
    const weightOptions = [
      { id: "300", label: "300 (Light)" },
      { id: "400", label: "400 (Regular)" },
      { id: "500", label: "500 (Medium)" },
      { id: "600", label: "600 (Semi-Bold)" },
      { id: "700", label: "700 (Bold)" },
    ];
    this.fontWeightDropdown = Dropdown({
      options: weightOptions,
      value: String(this.typoState.fontWeight || "500"),
      searchable: false,
      onChange: (val) => {
        this.typoState.fontWeight = val;
        this._updateTypoPreview();
      }
    });
    this.el.fontWeightSlot?.replaceChildren(this.fontWeightDropdown.root);

    // 3. Base Font Size (Slider + Stepper)
    const curSize = clamp(Number(this.typoState.fontSize || 14), 10, 24);
    this.fontSizeSlider = Slider({
      min: 10,
      max: 24,
      step: 1,
      value: curSize,
      label: "SCALE",
      showNumber: false,
      onChange: (val) => {
        const sz = clamp(Math.round(val), 10, 24);
        this.typoState.fontSize = sz;
        if (this.el.fontSizeVal) this.el.fontSizeVal.textContent = `${sz}px`;
        this.fontSizeStepper?.setValue(sz, false);
        this._syncFontSizeChips(sz);
        this._updateTypoPreview();
      }
    });
    this.el.fontSizeSliderSlot?.replaceChildren(this.fontSizeSlider.root);

    this.fontSizeStepper = Stepper({
      min: 10,
      max: 24,
      step: 1,
      value: curSize,
      compact: true,
      onChange: (val) => {
        const sz = clamp(Math.round(val), 10, 24);
        this.typoState.fontSize = sz;
        if (this.el.fontSizeVal) this.el.fontSizeVal.textContent = `${sz}px`;
        this.fontSizeSlider?.setValue(sz, false);
        this._syncFontSizeChips(sz);
        this._updateTypoPreview();
      }
    });
    this.el.fontSizeStepperSlot?.replaceChildren(this.fontSizeStepper.root);
    this._renderFontSizeChips(curSize);

    // 4. Letter Spacing / Tracking (Slider + Stepper)
    const curTracking = parseFloat(this.typoState.tracking) || 0;
    this.trackingSlider = Slider({
      min: -1,
      max: 3,
      step: 0.1,
      value: curTracking,
      label: "SPACING",
      showNumber: false,
      onChange: (val) => {
        const tr = clamp(Math.round(val * 10) / 10, -1, 3);
        const trStr = `${tr >= 0 ? "+" : ""}${tr.toFixed(1)}px`;
        this.typoState.tracking = trStr;
        if (this.el.trackingVal) this.el.trackingVal.textContent = trStr;
        this.trackingStepper?.setValue(tr, false);
        this._syncTrackingChips(tr);
        this._updateTypoPreview();
      }
    });
    this.el.trackingSliderSlot?.replaceChildren(this.trackingSlider.root);

    this.trackingStepper = Stepper({
      min: -1,
      max: 3,
      step: 0.1,
      decimals: 1,
      value: curTracking,
      compact: true,
      onChange: (val) => {
        const tr = clamp(Math.round(val * 10) / 10, -1, 3);
        const trStr = `${tr >= 0 ? "+" : ""}${tr.toFixed(1)}px`;
        this.typoState.tracking = trStr;
        if (this.el.trackingVal) this.el.trackingVal.textContent = trStr;
        this.trackingSlider?.setValue(tr, false);
        this._syncTrackingChips(tr);
        this._updateTypoPreview();
      }
    });
    this.el.trackingStepperSlot?.replaceChildren(this.trackingStepper.root);
    this._renderTrackingChips(curTracking);

    // 5. Web Font Loader
    this.el.loadWebFontBtn?.addEventListener("click", () => this._loadWebFont());
    this.el.webFontInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this._loadWebFont();
    });

    if (this.el.queryLocalFontsBtn) {
      this.el.queryLocalFontsBtn.addEventListener("click", () => this._queryLocalFonts());
    }

    this._updateTypoPreview();
  }

  _renderFontSizeChips(activeSize) {
    const container = this.el.fontSizeQuickChips;
    if (!container) return;
    container.innerHTML = "";
    [11, 12, 13, 14, 16, 18, 20].forEach(sz => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = `ds-ui-btn ds-ui-btn-compact ${sz === activeSize ? "is-active" : ""}`;
      chip.textContent = `${sz}px`;
      chip.dataset.size = sz;
      chip.addEventListener("click", () => {
        this.typoState.fontSize = sz;
        if (this.el.fontSizeVal) this.el.fontSizeVal.textContent = `${sz}px`;
        this.fontSizeSlider?.setValue(sz, false);
        this.fontSizeStepper?.setValue(sz, false);
        this._syncFontSizeChips(sz);
        this._updateTypoPreview();
      });
      container.appendChild(chip);
    });
  }

  _syncFontSizeChips(activeSize) {
    this.el.fontSizeQuickChips?.querySelectorAll(".ds-ui-btn").forEach(chip => {
      chip.classList.toggle("is-active", parseInt(chip.dataset.size, 10) === activeSize);
    });
  }

  _renderTrackingChips(activeTracking) {
    const container = this.el.trackingQuickChips;
    if (!container) return;
    container.innerHTML = "";
    [-0.5, 0, 0.6, 1.2, 2.0].forEach(tr => {
      const chip = document.createElement("button");
      chip.type = "button";
      const isAct = Math.abs(tr - activeTracking) < 0.15;
      chip.className = `ds-ui-btn ds-ui-btn-compact ${isAct ? "is-active" : ""}`;
      chip.textContent = `${tr >= 0 ? "+" : ""}${tr}px`;
      chip.dataset.tracking = tr;
      chip.addEventListener("click", () => {
        const trStr = `${tr >= 0 ? "+" : ""}${tr.toFixed(1)}px`;
        this.typoState.tracking = trStr;
        if (this.el.trackingVal) this.el.trackingVal.textContent = trStr;
        this.trackingSlider?.setValue(tr, false);
        this.trackingStepper?.setValue(tr, false);
        this._syncTrackingChips(tr);
        this._updateTypoPreview();
      });
      container.appendChild(chip);
    });
  }

  _syncTrackingChips(activeTracking) {
    this.el.trackingQuickChips?.querySelectorAll(".ds-ui-btn").forEach(chip => {
      const tr = parseFloat(chip.dataset.tracking);
      chip.classList.toggle("is-active", Math.abs(tr - activeTracking) < 0.15);
    });
  }

  _renderTypographyPresets() {
    const list = this.el.typoPresetList;
    if (!list) return;
    list.innerHTML = "";

    TYPOGRAPHY_PRESETS.forEach(p => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ds-ui-btn ds-ui-btn-compact";
      btn.textContent = p.name;
      btn.addEventListener("click", () => {
        list.querySelectorAll(".ds-ui-btn").forEach(b => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        this.typoState.font = p.font;
        this.typoState.fontWeight = p.weight;
        this.typoState.fontSize = p.size || 14;
        this.typoState.tracking = p.tracking || "0.0px";

        this.fontFamilyDropdown?.setValue(p.font, false);
        this.fontWeightDropdown?.setValue(p.weight, false);

        if (this.fontSizeSlider) this.fontSizeSlider.setValue(this.typoState.fontSize, false);
        if (this.fontSizeStepper) this.fontSizeStepper.setValue(this.typoState.fontSize, false);
        if (this.el.fontSizeVal) this.el.fontSizeVal.textContent = `${this.typoState.fontSize}px`;
        this._syncFontSizeChips(this.typoState.fontSize);

        const trVal = parseFloat(p.tracking) || 0;
        if (this.trackingSlider) this.trackingSlider.setValue(trVal, false);
        if (this.trackingStepper) this.trackingStepper.setValue(trVal, false);
        if (this.el.trackingVal) this.el.trackingVal.textContent = p.tracking;
        this._syncTrackingChips(trVal);

        this._updateTypoPreview();
        this.showToast(`Applied preset: ${p.name}`, "success");
      });
      list.appendChild(btn);
    });
  }

  async _loadWebFont() {
    const raw = (this.el.webFontInput?.value || "").trim();
    if (!raw) return;

    let fontName = raw;
    let url = "";

    if (raw.startsWith("http")) {
      url = raw;
      const m = raw.match(/family=([^:&]+)/);
      if (m) fontName = decodeURIComponent(m[1]).replace(/\+/g, " ");
    } else {
      const param = encodeURIComponent(fontName).replace(/%20/g, "+");
      url = `https://fonts.googleapis.com/css2?family=${param}:wght@300;400;500;600;700&display=swap`;
    }

    try {
      let link = document.getElementById("ds-injected-webfont");
      if (!link) {
        link = document.createElement("link");
        link.id = "ds-injected-webfont";
        link.rel = "stylesheet";
        document.head.appendChild(link);
      }
      link.href = url;

      this.typoState.font = fontName;
      this.fontFamilyDropdown?.setValue(fontName, false);
      if (this.el.webFontInput) this.el.webFontInput.value = "";
      this._updateTypoPreview();
      this.showToast(`Font "${fontName}" loaded`, "success");
    } catch (e) {
      this.showToast("Failed to load font from URL — using system fallback", "error");
    }
  }

  async _queryLocalFonts() {
    if (!window.queryLocalFonts) return;
    try {
      const fonts = await window.queryLocalFonts();
      const unique = Array.from(new Set(fonts.map(f => f.family))).slice(0, 40);
      const newOptions = unique.map(f => ({ id: f, label: `💻 ${f}` }));
      this.fontFamilyDropdown?.setOptions([...(this.fontFamilyDropdown.options || []), ...newOptions]);
      this.showToast(`Loaded ${unique.length} local system fonts`, "success");
    } catch (e) {
      this.showToast("Local font permission denied", "error");
    }
  }

  _updateTypoPreview() {
    const preview = this.el.typoLivePreview;
    if (!preview) return;

    const stack = `"${this.typoState.font}", Inter, system-ui, sans-serif`;
    preview.style.fontFamily = stack;
    preview.style.fontWeight = this.typoState.fontWeight;
    preview.style.letterSpacing = this.typoState.tracking;

    if (this.el.previewH1) {
      this.el.previewH1.style.fontSize = `${Math.round(this.typoState.fontSize * 1.5)}px`;
    }
    if (this.el.previewH2) {
      this.el.previewH2.style.fontSize = `${this.typoState.fontSize}px`;
    }
    if (this.el.previewBody) {
      this.el.previewBody.style.fontSize = `${Math.max(10, this.typoState.fontSize - 2)}px`;
    }

    if (this.el.fallbackHierarchyText) {
      this.el.fallbackHierarchyText.textContent = `"${this.typoState.font}", Inter, system-ui, -apple-system, sans-serif`;
    }
  }

  applyToActiveSelection() {
    const selected = getSelectedNodes();

    if (this.activeTab === "themes") {
      this.applyToGlobalDefault();
      return;
    }

    if (this.activeTab === "typography") {
      this.applyToGlobalDefault();
      return;
    }

    // Customization tab
    if (selected.length === 0) {
      // No selection — just save as the default for future nodes via the global engine
      this.applyToGlobalDefault();
      return;
    }

    // Apply native/3rd-party color customizations to explicitly selected nodes
    selected.forEach(node => {
      node.color = this.titleColor;
      delete node.title_color;
      if (node.constructor) {
        delete node.constructor.title_color;
        delete node.constructor.title_text_color;
      }
      node.title_text_color = this.titleTextColor;
      node.bgcolor = this.bodyColor;
      node.boxcolor = this.strokeColor;
      node.setDirtyCanvas?.(true, true);
    });

    dirtyCanvas();
    this.showToast(`Applied customization to ${selected.length} node(s)`, "success");
  }

  async applyToGlobalDefault() {
    const currentConfig = window.DSGlobalTheme?.getConfig?.() || safeLoad(STORAGE_GLOBAL_CONFIG, {});
    const themeId = this.activeThemeId || currentConfig.theme || "deathshot_dark";
    const custom = { ...(currentConfig.custom || {}) };
    if (this.activeTab === "themes") custom[themeId] = themeOverrides(themeId, this.dsTokens);

    if (window.DSGlobalTheme) {
      const result = await window.DSGlobalTheme.apply({
        theme: themeId,
        font: this.typoState.font,
        fontSize: this.typoState.fontSize,
        fontWeight: this.typoState.fontWeight,
        tracking: this.typoState.tracking,
        custom,
      }, { save: true });
      if (result?.config) safeSave(STORAGE_GLOBAL_CONFIG, result.config);
    }

    this.showToast("Saved as extension global defaults", "success");
  }

  resetActiveTabDefaults() {
    if (this.activeTab === "customization") {
      this.titleColor = "#1e293b";
      this.titleTextColor = "#f8fafc";
      this.bodyColor = "#0f172a";
      this.strokeColor = "#334155";
      if (this.activeSubTab === "title") this.custPicker.setColor(this.titleColor, false);
      else this.custPicker.setColor(this.bodyColor, false);
      this._updateCustPairInputs();
      this._syncMockPreviews();
      this.showToast("Reset Customization tab to defaults");
    } else if (this.activeTab === "themes") {
      this.dsTokens = tokensFromTheme(window.DSGlobalTheme?.getThemes?.()[this.activeThemeId], this.dsTokens);
      this._renderMicroElementRows();
      this._syncMockPreviews();
      this._previewTokens();
      this.showToast("Reset theme colors to defaults");
    } else if (this.activeTab === "typography") {
      this.typoState.font = "Inter";
      this.typoState.fontSize = 14;
      this.typoState.fontWeight = "500";
      this.typoState.tracking = "0px";
      this.fontFamilyDropdown?.setValue("Inter", false);
      this.fontWeightDropdown?.setValue("500", false);
      this.fontSizeSlider?.setValue(14, false);
      this.fontSizeStepper?.setValue(14, false);
      if (this.el.fontSizeVal) this.el.fontSizeVal.textContent = "14px";
      this._syncFontSizeChips(14);
      this.trackingSlider?.setValue(0, false);
      this.trackingStepper?.setValue(0, false);
      if (this.el.trackingVal) this.el.trackingVal.textContent = "0.0px";
      this._syncTrackingChips(0);
      this._updateTypoPreview();
      this.showToast("Reset Typography tab to defaults");
    }
  }
}

// ---------------------------------------------------------------------------
// Extension Clipboard Utilities (Copy / Paste Node Colors)
// ---------------------------------------------------------------------------
let memoryClipboard = safeLoad(STORAGE_CLIPBOARD, null);

function captureNodeColors(node) {
  if (!node) return null;
  const domRoot = node._dsSeedRoot || node.domWidget?.element || node.rootEl || (node.widgets && node.widgets.find(w => w?.element)?.element);
  const domStyle = domRoot && typeof window !== "undefined" ? window.getComputedStyle(domRoot) : null;
  const readVar = (name, fallback) => {
    if (domRoot?.style?.getPropertyValue(name)) {
      return domRoot.style.getPropertyValue(name).trim();
    }
    if (domStyle?.getPropertyValue(name)) {
      return domStyle.getPropertyValue(name).trim();
    }
    return fallback;
  };

  const accent = readVar("--ds-color-accent", readVar("--ds-accent", node.properties?.ds_cp_accent || "#67e8f9"));
  const surface = readVar("--ds-color-card", readVar("--ds-panel", node.properties?.ds_bg_color || node.bgcolor || "#12151c"));
  const surface2 = readVar("--ds-color-panel-2", readVar("--ds-panel-2", "#161a23"));
  const headerBg = readVar("--ds-color-base", readVar("--ds-bg", node.properties?.ds_title_color || node.color || "#0b0d12"));
  const border = readVar("--ds-color-border", readVar("--ds-border", node.boxcolor || "#242a36"));
  const borderActive = readVar("--ds-color-border-hover", readVar("--ds-border-active", accent));
  const text = readVar("--ds-color-text", readVar("--ds-text", node.title_text_color || "#e5e7eb"));
  const textMuted = readVar("--ds-color-muted-text", readVar("--ds-text-muted", "#9ca3af"));
  const btnBg = readVar("--ds-btn-bg", surface2);
  const btnHover = readVar("--ds-btn-hover", "#1c2130");
  const socketFill = readVar("--ds-socket-fill", "#a3e635");
  const wireAccent = readVar("--ds-wire-accent", accent);

  const payload = {
    source: "DeathshotArsenal",
    version: "2.1.0",
    type: "node_color_payload",
    timestamp: Date.now(),
    data: {
      title_color: node.color || headerBg,
      title_text_color: node.title_text_color || text,
      body_color: node.bgcolor || surface,
      stroke_color: node.boxcolor || border,
      tokens: {
        accent,
        surface,
        surface2,
        headerBg,
        border,
        borderActive,
        text,
        textMuted,
        btnBg,
        btnHover,
        socketFill,
        wireAccent
      },
      ds_specific: {
        accent,
        surface,
        title_bg: headerBg
      }
    }
  };
  memoryClipboard = payload;
  safeSave(STORAGE_CLIPBOARD, payload);
  return payload;
}

function pasteNodeColors(targets) {
  if (!memoryClipboard?.data || !targets || targets.length === 0) return false;
  const d = memoryClipboard.data;
  const tokens = d.tokens || {
    accent: d.ds_specific?.accent || "#67e8f9",
    surface: d.ds_specific?.surface || d.body_color || "#12151c",
    surface2: "#161a23",
    headerBg: d.ds_specific?.title_bg || d.title_color || "#0b0d12",
    border: d.stroke_color || "#242a36",
    borderActive: d.ds_specific?.accent || "#67e8f9",
    text: d.title_text_color || "#e5e7eb",
    textMuted: "#9ca3af",
    btnBg: "#161a23",
    btnHover: "#1c2130",
  };

  targets.forEach(node => {
    // Write standard LiteGraph color properties
    node.color = d.title_color || tokens.headerBg;
    delete node.title_color;
    if (node.constructor) {
      delete node.constructor.title_color;
      delete node.constructor.title_text_color;
    }
    node.bgcolor = d.body_color || tokens.surface;
    node.boxcolor = d.stroke_color || tokens.border;
    if (d.title_text_color) {
      node.title_text_color = d.title_text_color;
    }

    // Write full tokens if target is a DS node
    if (isDSNode(node)) {
      node.properties = node.properties || {};
      node.properties.ds_cp_accent = tokens.accent;
      node.properties.ds_bg_color = tokens.surface;
      node.properties.ds_title_color = tokens.headerBg;

      const domRoot = node._dsSeedRoot || node.domWidget?.element || node.rootEl || (node.widgets && node.widgets.find(w => w?.element)?.element);
      if (domRoot) {
        applyThemeVariables(domRoot, tokens);
      }
    }

    node.setDirtyCanvas?.(true, true);
  });

  dirtyCanvas();
  return true;
}

function resetNodeToNative(targets) {
  if (!targets || targets.length === 0) return;
  targets.forEach(node => {
    delete node.color;
    delete node.bgcolor;
    delete node.boxcolor;
    delete node.title_color;
    delete node.title_text_color;
    if (node.constructor) {
      delete node.constructor.title_color;
      delete node.constructor.title_text_color;
      delete node.constructor.color;
      delete node.constructor.bgcolor;
    }
    if (node.properties) {
      delete node.properties.node_color;
      delete node.properties.ds_bg_color;
      delete node.properties.ds_title_color;
      delete node.properties.ds_cp_accent;
    }
    if (isDSNode(node) && window.DSGlobalTheme) {
      window.DSGlobalTheme.applyNodeBase?.(node);
    }
    node.setDirtyCanvas?.(true, true);
  });
  dirtyCanvas();
}

// ---------------------------------------------------------------------------
// Register ComfyUI Extension & Context Menu Hooks
// ---------------------------------------------------------------------------
let dashboardInstance = null;

function getDashboard() {
  if (!dashboardInstance) {
    dashboardInstance = new DSThemeManagerDashboard();
  }
  return dashboardInstance;
}

const DS_THEME_MANAGER_COMMAND_ID = "DeathshotArsenal.ThemeManager.Open";

function openThemeManager() {
  getDashboard().open();
}

function installLegacyCanvasMenuFallback() {
  const canvasProto = globalThis.LiteGraph?.LGraphCanvas?.prototype;
  if (!canvasProto || canvasProto.__dsaThemeManagerLegacyMenuInstalled) return false;

  const originalCanvasMenu = canvasProto.getCanvasMenuOptions;
  if (typeof originalCanvasMenu === "function") {
    canvasProto.getCanvasMenuOptions = function(...args) {
      const options = originalCanvasMenu.apply(this, args);
      if (!Array.isArray(options)) return options;

      const alreadyPresent = options.some(item =>
        item && typeof item === "object" &&
        String(item.content || "").includes("DS Theme Manager")
      );

      if (!alreadyPresent) {
        options.push(null, {
          content: "🎨 DS Theme Manager",
          callback: openThemeManager,
        });
      }

      return options;
    };
  }

  const originalNodeMenu = canvasProto.getNodeMenuOptions;
  if (typeof originalNodeMenu === "function") {
    canvasProto.getNodeMenuOptions = function(...args) {
      const options = originalNodeMenu.apply(this, args);
      if (!Array.isArray(options)) return options;

      const alreadyPresent = options.some(item =>
        item && typeof item === "object" &&
        String(item.content || "").includes("DS Theme Manager")
      );

      if (!alreadyPresent) {
        options.unshift(
          null,
          {
            content: "🎨 DS Theme Manager",
            callback: openThemeManager,
          }
        );
      }

      return options;
    };
  }

  canvasProto.__dsaThemeManagerLegacyMenuInstalled = true;
  return true;
}

function scheduleLegacyCanvasMenuFallback() {
  if (installLegacyCanvasMenuFallback()) return;
  for (const delay of [0, 100, 400, 1000, 2500]) {
    setTimeout(() => {
      installLegacyCanvasMenuFallback();
    }, delay);
  }
}

app.registerExtension({
  name: "DeathshotArsenal.ThemeManager",

  commands: [
    {
      id: DS_THEME_MANAGER_COMMAND_ID,
      label: "DS Theme Manager",
      function: openThemeManager,
    },
  ],

  menuCommands: [
    {
      path: ["DeathshotArsenal"],
      commands: [DS_THEME_MANAGER_COMMAND_ID],
    },
  ],

  async setup() {
    attachNodeShortcuts(null, document.body);
    // Keyboard Shortcut: Alt + T
    window.addEventListener("keydown", (e) => {
      if (e.altKey && (e.key === "t" || e.key === "T")) {
        e.preventDefault();
        e.stopPropagation();
        getDashboard().toggle();
      } else if (e.key === "Escape") {
        if (dashboardInstance?.isOpen) {
          dashboardInstance.close();
        }
      }
    });

    // Keep the manager reachable on both the modern extension-menu path and
    // the legacy LiteGraph canvas menu used by older/current ComfyUI builds.
    scheduleLegacyCanvasMenuFallback();

    window.DSThemeManager = window.DSThemeManager || {};
    window.DSThemeManager.open = openThemeManager;
  },

  // Extension Context Menu Hooks (New ComfyUI Architecture)
  getNodeMenuItems(node) {
    const selected = getSelectedNodes();
    const targets = selected.length > 0 && selected.includes(node) ? selected : [node];
    const suffix = targets.length > 1 ? ` (${targets.length} nodes)` : "";

    const items = [
      null, // separator
      {
        content: `🎨 DS Theme Manager`,
        callback: () => getDashboard().open(),
      },
      {
        content: `📋 Copy Node Colors`,
        callback: () => {
          captureNodeColors(node);
          getDashboard().showToast("Copied node colors to clipboard", "success");
        },
      }
    ];

    if (memoryClipboard) {
      items.push({
        content: `📥 Paste Node Colors${suffix}`,
        callback: () => {
          pasteNodeColors(targets);
          getDashboard().showToast(`Pasted colors to ${targets.length} node(s)`, "success");
        },
      });
    }

    items.push({
      content: `🔄 Reset Node Colors${suffix}`,
      callback: () => {
        resetNodeToNative(targets);
        getDashboard().showToast(`Reset colors for ${targets.length} node(s)`, "success");
      },
    });

    return items;
  },

  getCanvasMenuItems(canvas) {
    const items = [
      null, // separator
      {
        content: `🎨 DS Theme Manager`,
        callback: () => getDashboard().open(),
      }
    ];

    const selected = getSelectedNodes();
    if (selected.length > 0) {
      items.push({
        content: `📋 Copy Node Colors`,
        callback: () => {
          captureNodeColors(selected[0]);
          getDashboard().showToast("Copied node colors to clipboard", "success");
        },
      });

      if (memoryClipboard) {
        items.push({
          content: `📥 Paste Node Colors (${selected.length} nodes)`,
          callback: () => {
            pasteNodeColors(selected);
            getDashboard().showToast(`Pasted colors to ${selected.length} nodes`, "success");
          },
        });
      }

      items.push({
        content: `🔄 Reset Node Colors (${selected.length} nodes)`,
        callback: () => {
          resetNodeToNative(selected);
          getDashboard().showToast(`Reset colors for ${selected.length} nodes`, "success");
        },
      });
    }

    return items;
  }
});
