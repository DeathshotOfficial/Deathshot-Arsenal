// DS AI Prompt Sensei — Deathshot Arsenal

import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";
import { normalizeDSWidgetHost, protectDSResizeCorners } from "../Shared/ds_ui_system.js";

const NODE_TYPE = "DS_AIPromptSensei";
const MIN_W = 480;
const MIN_H = 800;
const DEFAULT_W = 540;
const DEFAULT_H = 1105;

// Output slot indices (must match RETURN_NAMES in Python exactly)
const OUT = { image: 0, model: 1, video_vae: 2, audio_vae: 3, text_enc: 4, width: 5, height: 6, duration: 7, fps: 8, prompt: 9 };

// ---------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------
let _cssLoaded = false;
function loadCSS() {
  if (_cssLoaded || document.querySelector("link[data-ds-sensei-css]")) return;
  _cssLoaded = true;
  const lnk = document.createElement("link");
  lnk.rel = "stylesheet"; lnk.dataset.dsSenseiCss = "true";
  lnk.href = new URL("./ds_ai_prompt_sensei.css", import.meta.url).href;
  document.head.appendChild(lnk);
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const DEFAULT_SYSTEM_PROMPT =
  "You are an expert AI cinematographer and prompt engineer specializing in LTX-Video generation. " +
  "Analyze the supplied image and scene context, then write a rich, vivid, cinematic generation prompt. " +
  "Detail the subject, composition, camera perspective, environment, clothing, lighting, motion, " +
  "atmosphere, textures, and temporal continuity. " +
  "Output ONLY the final generation prompt text without conversational preamble.";

const LTX_PRESETS = {
  "16:9": [
    { label: "640 × 352 (0.23 MP)", w: 640, h: 352 },
    { label: "768 × 448 (0.34 MP)", w: 768, h: 448 },
    { label: "832 × 480 (0.40 MP)", w: 832, h: 480 },
    { label: "896 × 512 (0.46 MP)", w: 896, h: 512 },
    { label: "960 × 544 (0.52 MP)", w: 960, h: 544 },
    { label: "1024 × 576 (0.59 MP)", w: 1024, h: 576 },
    { label: "1152 × 640 (0.74 MP)", w: 1152, h: 640 },
    { label: "1280 × 704 (0.90 MP)", w: 1280, h: 704 },
    { label: "1280 × 720 (0.92 MP - 720p)", w: 1280, h: 720 },
    { label: "1344 × 768 (1.03 MP)", w: 1344, h: 768 },
    { label: "1536 × 864 (1.33 MP)", w: 1536, h: 864 },
    { label: "1664 × 928 (1.54 MP)", w: 1664, h: 928 },
    { label: "1920 × 1080 (2.07 MP - 1080p)", w: 1920, h: 1080 },
    { label: "1920 × 1088 (2.09 MP)", w: 1920, h: 1088 },
    { label: "2560 × 1440 (3.69 MP - 2K)", w: 2560, h: 1440 },
    { label: "3840 × 2160 (8.29 MP - 4K)", w: 3840, h: 2160 },
  ],
  "9:16": [
    { label: "352 × 640 (0.23 MP)", w: 352, h: 640 },
    { label: "448 × 768 (0.34 MP)", w: 448, h: 768 },
    { label: "480 × 832 (0.40 MP)", w: 480, h: 832 },
    { label: "512 × 896 (0.46 MP)", w: 512, h: 896 },
    { label: "544 × 960 (0.52 MP)", w: 544, h: 960 },
    { label: "576 × 1024 (0.59 MP)", w: 576, h: 1024 },
    { label: "640 × 1152 (0.74 MP)", w: 640, h: 1152 },
    { label: "704 × 1280 (0.90 MP)", w: 704, h: 1280 },
    { label: "720 × 1280 (0.92 MP - 720p)", w: 720, h: 1280 },
    { label: "768 × 1344 (1.03 MP)", w: 768, h: 1344 },
    { label: "864 × 1536 (1.33 MP)", w: 864, h: 1536 },
    { label: "928 × 1664 (1.54 MP)", w: 928, h: 1664 },
    { label: "1080 × 1920 (2.07 MP - 1080p)", w: 1080, h: 1920 },
    { label: "1088 × 1920 (2.09 MP)", w: 1088, h: 1920 },
    { label: "1440 × 2560 (3.69 MP - 2K)", w: 1440, h: 2560 },
  ],
  "1:1": [
    { label: "384 × 384 (0.15 MP)", w: 384, h: 384 },
    { label: "512 × 512 (0.26 MP)", w: 512, h: 512 },
    { label: "640 × 640 (0.41 MP)", w: 640, h: 640 },
    { label: "768 × 768 (0.59 MP)", w: 768, h: 768 },
    { label: "832 × 832 (0.69 MP)", w: 832, h: 832 },
    { label: "896 × 896 (0.80 MP)", w: 896, h: 896 },
    { label: "960 × 960 (0.92 MP)", w: 960, h: 960 },
    { label: "1024 × 1024 (1.05 MP - 1K)", w: 1024, h: 1024 },
    { label: "1152 × 1152 (1.33 MP)", w: 1152, h: 1152 },
    { label: "1280 × 1280 (1.64 MP)", w: 1280, h: 1280 },
    { label: "1344 × 1344 (1.81 MP)", w: 1344, h: 1344 },
    { label: "1536 × 1536 (2.36 MP - 1.5K)", w: 1536, h: 1536 },
    { label: "2048 × 2048 (4.19 MP - 2K)", w: 2048, h: 2048 },
  ],
  "4:3": [
    { label: "512 × 384 (0.20 MP)", w: 512, h: 384 },
    { label: "640 × 480 (0.31 MP - 480p)", w: 640, h: 480 },
    { label: "768 × 576 (0.44 MP - 576p)", w: 768, h: 576 },
    { label: "896 × 672 (0.60 MP)", w: 896, h: 672 },
    { label: "960 × 704 (0.68 MP)", w: 960, h: 704 },
    { label: "1024 × 768 (0.79 MP)", w: 1024, h: 768 },
    { label: "1152 × 864 (1.00 MP)", w: 1152, h: 864 },
    { label: "1280 × 960 (1.23 MP)", w: 1280, h: 960 },
    { label: "1408 × 1056 (1.49 MP)", w: 1408, h: 1056 },
    { label: "1600 × 1200 (1.92 MP)", w: 1600, h: 1200 },
    { label: "1920 × 1440 (2.76 MP)", w: 1920, h: 1440 },
    { label: "2048 × 1536 (3.15 MP)", w: 2048, h: 1536 },
  ],
  "3:4": [
    { label: "384 × 512 (0.20 MP)", w: 384, h: 512 },
    { label: "480 × 640 (0.31 MP - 480p)", w: 480, h: 640 },
    { label: "576 × 768 (0.44 MP - 576p)", w: 576, h: 768 },
    { label: "672 × 896 (0.60 MP)", w: 672, h: 896 },
    { label: "704 × 960 (0.68 MP)", w: 704, h: 960 },
    { label: "768 × 1024 (0.79 MP)", w: 768, h: 1024 },
    { label: "864 × 1152 (1.00 MP)", w: 864, h: 1152 },
    { label: "960 × 1280 (1.23 MP)", w: 960, h: 1280 },
    { label: "1056 × 1408 (1.49 MP)", w: 1056, h: 1408 },
    { label: "1200 × 1600 (1.92 MP)", w: 1200, h: 1600 },
    { label: "1440 × 1920 (2.76 MP)", w: 1440, h: 1920 },
    { label: "1536 × 2048 (3.15 MP)", w: 1536, h: 2048 },
  ],
  "3:2": [
    { label: "576 × 384 (0.22 MP)", w: 576, h: 384 },
    { label: "672 × 448 (0.30 MP)", w: 672, h: 448 },
    { label: "768 × 512 (0.39 MP)", w: 768, h: 512 },
    { label: "864 × 576 (0.50 MP)", w: 864, h: 576 },
    { label: "960 × 640 (0.61 MP)", w: 960, h: 640 },
    { label: "1056 × 704 (0.74 MP)", w: 1056, h: 704 },
    { label: "1152 × 768 (0.88 MP)", w: 1152, h: 768 },
    { label: "1248 × 832 (1.04 MP)", w: 1248, h: 832 },
    { label: "1344 × 896 (1.20 MP)", w: 1344, h: 896 },
    { label: "1440 × 960 (1.38 MP)", w: 1440, h: 960 },
    { label: "1536 × 1024 (1.57 MP)", w: 1536, h: 1024 },
    { label: "1728 × 1152 (1.99 MP)", w: 1728, h: 1152 },
    { label: "1920 × 1280 (2.46 MP)", w: 1920, h: 1280 },
    { label: "2160 × 1440 (3.11 MP)", w: 2160, h: 1440 },
    { label: "2304 × 1536 (3.54 MP)", w: 2304, h: 1536 },
  ],
  "2:3": [
    { label: "384 × 576 (0.22 MP)", w: 384, h: 576 },
    { label: "448 × 672 (0.30 MP)", w: 448, h: 672 },
    { label: "512 × 768 (0.39 MP)", w: 512, h: 768 },
    { label: "576 × 864 (0.50 MP)", w: 576, h: 864 },
    { label: "640 × 960 (0.61 MP)", w: 640, h: 960 },
    { label: "704 × 1056 (0.74 MP)", w: 704, h: 1056 },
    { label: "768 × 1152 (0.88 MP)", w: 768, h: 1152 },
    { label: "832 × 1248 (1.04 MP)", w: 832, h: 1248 },
    { label: "896 × 1344 (1.20 MP)", w: 896, h: 1344 },
    { label: "960 × 1440 (1.38 MP)", w: 960, h: 1440 },
    { label: "1024 × 1536 (1.57 MP)", w: 1024, h: 1536 },
    { label: "1152 × 1728 (1.99 MP)", w: 1152, h: 1728 },
    { label: "1280 × 1920 (2.46 MP)", w: 1280, h: 1920 },
    { label: "1440 × 2160 (3.11 MP)", w: 1440, h: 2160 },
  ],
  "16:10": [
    { label: "640 × 400 (0.26 MP)", w: 640, h: 400 },
    { label: "768 × 480 (0.37 MP)", w: 768, h: 480 },
    { label: "896 × 560 (0.50 MP)", w: 896, h: 560 },
    { label: "1024 × 640 (0.66 MP)", w: 1024, h: 640 },
    { label: "1152 × 720 (0.83 MP)", w: 1152, h: 720 },
    { label: "1280 × 800 (1.02 MP)", w: 1280, h: 800 },
    { label: "1440 × 900 (1.30 MP)", w: 1440, h: 900 },
    { label: "1680 × 1050 (1.76 MP)", w: 1680, h: 1050 },
    { label: "1920 × 1200 (2.30 MP)", w: 1920, h: 1200 },
    { label: "2560 × 1600 (4.10 MP)", w: 2560, h: 1600 },
  ],
  "10:16": [
    { label: "400 × 640 (0.26 MP)", w: 400, h: 640 },
    { label: "480 × 768 (0.37 MP)", w: 480, h: 768 },
    { label: "560 × 896 (0.50 MP)", w: 560, h: 896 },
    { label: "640 × 1024 (0.66 MP)", w: 640, h: 1024 },
    { label: "720 × 1152 (0.83 MP)", w: 720, h: 1152 },
    { label: "800 × 1280 (1.02 MP)", w: 800, h: 1280 },
    { label: "900 × 1440 (1.30 MP)", w: 900, h: 1440 },
    { label: "1050 × 1680 (1.76 MP)", w: 1050, h: 1680 },
    { label: "1200 × 1920 (2.30 MP)", w: 1200, h: 1920 },
    { label: "1600 × 2560 (4.10 MP)", w: 1600, h: 2560 },
  ],
  "21:9": [
    { label: "896 × 384 (0.34 MP)", w: 896, h: 384 },
    { label: "1024 × 448 (0.46 MP)", w: 1024, h: 448 },
    { label: "1120 × 480 (0.54 MP)", w: 1120, h: 480 },
    { label: "1216 × 512 (0.62 MP)", w: 1216, h: 512 },
    { label: "1344 × 576 (0.77 MP)", w: 1344, h: 576 },
    { label: "1536 × 640 (0.98 MP)", w: 1536, h: 640 },
    { label: "1680 × 720 (1.21 MP)", w: 1680, h: 720 },
    { label: "1792 × 768 (1.38 MP)", w: 1792, h: 768 },
    { label: "2016 × 864 (1.74 MP)", w: 2016, h: 864 },
    { label: "2144 × 928 (1.99 MP)", w: 2144, h: 928 },
    { label: "2560 × 1088 (2.79 MP)", w: 2560, h: 1088 },
    { label: "3440 × 1440 (4.95 MP)", w: 3440, h: 1440 },
  ],
  "9:21": [
    { label: "384 × 896 (0.34 MP)", w: 384, h: 896 },
    { label: "448 × 1024 (0.46 MP)", w: 448, h: 1024 },
    { label: "480 × 1120 (0.54 MP)", w: 480, h: 1120 },
    { label: "512 × 1216 (0.62 MP)", w: 512, h: 1216 },
    { label: "576 × 1344 (0.77 MP)", w: 576, h: 1344 },
    { label: "640 × 1536 (0.98 MP)", w: 640, h: 1536 },
    { label: "720 × 1680 (1.21 MP)", w: 720, h: 1680 },
    { label: "768 × 1792 (1.38 MP)", w: 768, h: 1792 },
    { label: "864 × 2016 (1.74 MP)", w: 864, h: 2016 },
    { label: "928 × 2144 (1.99 MP)", w: 928, h: 2144 },
    { label: "1088 × 2560 (2.79 MP)", w: 1088, h: 2560 },
  ],
};
const AR_LIST = Object.keys(LTX_PRESETS);
const AR_RATIOS = AR_LIST.map((k) => { const [n, d] = k.split(":").map(Number); return { key: k, ratio: n / d }; });

const MP_PRESETS = [
  { label: "0.25 MP", mp: 0.25 },
  { label: "0.36 MP", mp: 0.36 },
  { label: "0.40 MP", mp: 0.40 },
  { label: "0.50 MP", mp: 0.50 },
  { label: "0.60 MP", mp: 0.60 },
  { label: "0.75 MP", mp: 0.75 },
  { label: "0.79 MP", mp: 0.79 },
  { label: "0.92 MP (720p)", mp: 0.92 },
  { label: "1.00 MP", mp: 1.00 },
  { label: "1.25 MP", mp: 1.25 },
  { label: "1.44 MP", mp: 1.44 },
  { label: "1.50 MP", mp: 1.50 },
  { label: "2.00 MP", mp: 2.00 },
  { label: "2.07 MP (1080p)", mp: 2.07 },
  { label: "3.00 MP", mp: 3.00 },
  { label: "4.00 MP", mp: 4.00 },
];
const DURATION_PRESETS = [5, 10, 15, 20, 30];
const FPS_PRESETS = [15, 24, 30, 45, 60];

function calcMP(w, h) { return ((w * h) / 1_000_000).toFixed(2); }
function snap32(v) { return Math.max(64, Math.round(v / 32) * 32); }
function findClosestAR(ratio) {
  let best = "16:9", bd = Infinity;
  for (const a of AR_RATIOS) { const d = Math.abs(ratio - a.ratio); if (d < bd) { bd = d; best = a.key; } }
  return best;
}
function getOriginalDims(s) {
  if (!s?.image_dims) return null;
  const parts = s.image_dims.split(/[\s×x*]+/).map(Number).filter(Boolean);
  if (parts.length >= 2 && parts[0] > 0 && parts[1] > 0) {
    return { w: parts[0], h: parts[1], label: `Original (${parts[0]} × ${parts[1]})` };
  }
  return null;
}
function dimsFromMP(mp, arKey) {
  const ar = AR_RATIOS.find((a) => a.key === arKey) || AR_RATIOS[0];
  const area = Number(mp) * 1_000_000;
  const w = Math.sqrt(area * ar.ratio);
  return { w: snap32(w), h: snap32(w / ar.ratio) };
}
function estimateVRAM(w, h, fps, dur, mn) {
  return Math.round(((w * h / 1e6) * Math.round(fps * dur) * 0.00008 +
    (/(ltx)/i.test(mn) ? 4 : /(hunyuan)/i.test(mn) ? 12 : /(wan)/i.test(mn) ? 8 : 5)) * 10) / 10;
}

// ---------------------------------------------------------------------------
// Model catalog / hardware
// ---------------------------------------------------------------------------
let _cat = null, _catAt = 0;
async function getCatalog() {
  if (_cat && Date.now() - _catAt < 10000) return _cat;
  try { const r = await fetch("/ds/prompt_sensei/models"); if (r.ok) { _cat = await r.json(); _catAt = Date.now(); return _cat; } } catch (_) {}
  return { models: [], vaes: [], clips: [], loras: [], attentions: ["default", "kitchen", "comfy_kitchen", "flash_attn", "sage_attn", "sdpa", "xformers"] };
}
let _hw = null, _hwAt = 0;
async function getHW() {
  if (_hw && Date.now() - _hwAt < 30000) return _hw;
  try { const r = await fetch("/ds/prompt_sensei/hardware"); if (r.ok) { _hw = await r.json(); _hwAt = Date.now(); return _hw; } } catch (_) {}
  return null;
}

// ---------------------------------------------------------------------------
// Dropdown popover
// ---------------------------------------------------------------------------
function openMenu(anchor, items, cur, onPick, onClose) {
  document.querySelectorAll(".ds-sensei-menu-popover").forEach((e) => e.remove());
  const pop = document.createElement("div"); pop.className = "ds-sensei-menu-popover";
  pop.style.zIndex = "100020";
  const sb = document.createElement("div"); sb.className = "ds-sensei-menu-search";
  const si = document.createElement("input"); si.placeholder = "Filter..."; sb.appendChild(si); pop.appendChild(sb);
  const list = document.createElement("div"); list.className = "ds-sensei-menu-list"; pop.appendChild(list);

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    pop.remove();
    window.removeEventListener("pointerdown", close, true);
    window.removeEventListener("keydown", onKeyDown, true);
    onClose?.();
  };

  const render = (f = "") => {
    list.innerHTML = "";
    const filtered = items.filter((x) => !f || (typeof x === "string" ? x : x.label || "").toLowerCase().includes(f.toLowerCase()));
    if (!filtered.length) { const e = document.createElement("div"); e.style.cssText = "padding:8px;color:var(--ds-text-muted);font-size:11px;"; e.textContent = "No matches"; list.appendChild(e); return; }
    filtered.forEach((x) => {
      const v = typeof x === "string" ? x : x.key || x.label || x;
      const l = typeof x === "string" ? x : x.label || x.key || x;
      const el = document.createElement("div"); el.className = "ds-sensei-menu-item";
      if (v === cur) el.classList.add("active");
      el.textContent = l;
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        onPick(v);
        cleanup();
      });
      list.appendChild(el);
    });
  };
  si.addEventListener("input", () => render(si.value)); render();
  const rect = anchor.getBoundingClientRect();
  pop.style.cssText = `z-index:100020;top:${rect.bottom + 4}px;left:${Math.max(10, Math.min(window.innerWidth - 240, rect.left))}px;width:${Math.max(220, rect.width)}px;`;
  document.body.appendChild(pop); si.focus();

  const close = (e) => {
    if (!pop.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) {
      cleanup();
    }
  };
  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      cleanup();
    }
  };
  setTimeout(() => {
    window.addEventListener("pointerdown", close, true);
    window.addEventListener("keydown", onKeyDown, true);
  }, 20);
}

function selDiv(text, onClick) {
  const d = document.createElement("div"); d.className = "ds-sensei-select";
  d.innerHTML = `<span class="ds-sensei-select-text">${text}</span><span class="ds-sensei-select-arrow">▼</span>`;
  d.onclick = onClick; return d;
}
function mkBtn(text, cls, onClick) {
  const b = document.createElement("button"); b.type = "button";
  b.className = `ds-sensei-btn ${cls || ""}`; b.textContent = text; b.onclick = onClick; return b;
}
function mkStepper({ value, min, max, step = 1, decimals = 0, width = "68px", placeholder = "", fallbackValue, onChange }) {
  const wrap = document.createElement("div"); wrap.className = "ds-sensei-stepper"; if (width) wrap.style.width = width;
  const inp = document.createElement("input"); inp.type = "text"; inp.inputMode = "decimal"; inp.className = "ds-sensei-stepper-input";
  if (placeholder) {
    inp.placeholder = placeholder;
    inp.title = placeholder;
  }
  const fmt = (v) => { const n = parseFloat(v); return isNaN(n) ? "" : decimals > 0 ? n.toFixed(decimals) : String(Math.round(n)); };
  inp.value = fmt(value);
  const btns = document.createElement("div"); btns.className = "ds-sensei-stepper-btns";
  const up = document.createElement("button"); up.type = "button"; up.className = "ds-sensei-stepper-btn"; up.setAttribute("tabindex", "-1");
  up.innerHTML = `<svg viewBox="0 0 10 6" width="8" height="5" style="display:block"><path d="M1 5L5 1L9 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`;
  const dn = document.createElement("button"); dn.type = "button"; dn.className = "ds-sensei-stepper-btn"; dn.setAttribute("tabindex", "-1");
  dn.innerHTML = `<svg viewBox="0 0 10 6" width="8" height="5" style="display:block"><path d="M1 1L5 5L9 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`;
  const clamp = (n) => { if (min !== undefined && n < min) n = min; if (max !== undefined && n > max) n = max; return n; };
  const fire = (n) => { inp.value = fmt(n); onChange?.(n); };
  const getBase = () => {
    const parsed = parseFloat(inp.value);
    if (!isNaN(parsed)) return parsed;
    if (fallbackValue !== undefined && fallbackValue !== null && !isNaN(parseFloat(fallbackValue))) return parseFloat(fallbackValue);
    return min ?? 0;
  };
  up.onclick = (e) => { e.stopPropagation(); fire(clamp(+((getBase() + step).toFixed(decimals > 0 ? decimals : 4)))); };
  dn.onclick = (e) => { e.stopPropagation(); fire(clamp(+((getBase() - step).toFixed(decimals > 0 ? decimals : 4)))); };
  inp.onchange = () => { const n = parseFloat(inp.value); fire(isNaN(n) ? (min ?? 0) : clamp(n)); };
  inp.onkeydown = (e) => { if (e.key === "ArrowUp") { e.preventDefault(); up.onclick(e); } else if (e.key === "ArrowDown") { e.preventDefault(); dn.onclick(e); } else if (e.key === "Enter") inp.blur(); };
  btns.append(up, dn); wrap.append(inp, btns);
  return { wrap, setValue: (v) => { inp.value = fmt(v); } };
}

function openSysPromptModal(cur, onSave) {
  document.querySelectorAll(".ds-sensei-modal-backdrop").forEach((e) => e.remove());
  const bd = document.createElement("div"); bd.className = "ds-sensei-modal-backdrop";
  const dlg = document.createElement("div"); dlg.className = "ds-sensei-modal-dialog";
  const title = document.createElement("div"); title.className = "ds-sensei-modal-title"; title.textContent = "System Prompt Editor";
  const ta = document.createElement("textarea"); ta.className = "ds-sensei-textarea"; ta.style.minHeight = "200px"; ta.value = cur || DEFAULT_SYSTEM_PROMPT;
  const footer = document.createElement("div"); footer.className = "ds-sensei-modal-footer";
  footer.append(mkBtn("Reset Default", "", () => { ta.value = DEFAULT_SYSTEM_PROMPT; }), mkBtn("Cancel", "", () => bd.remove()), mkBtn("Save", "ds-sensei-btn-primary", () => { onSave(ta.value.trim()); bd.remove(); }));
  dlg.append(title, ta, footer); bd.appendChild(dlg); document.body.appendChild(bd); ta.focus();
}

// ---------------------------------------------------------------------------
// LM Studio Toolbar Gear Popover & Queue Hooking
// ---------------------------------------------------------------------------

let _activeSenseiGearPopup = null;

function closeSenseiGearConfig() {
  if (_activeSenseiGearPopup) {
    _activeSenseiGearPopup.remove();
    _activeSenseiGearPopup = null;
  }
}

async function fetchLMStudioModels(ip = "127.0.0.1", port = 1234) {
  try {
    const r = await fetch(`/ds/prompt_sensei/lm_studio/models?ip=${encodeURIComponent(ip)}&port=${encodeURIComponent(port)}`);
    if (r.ok) {
      return await r.json();
    }
  } catch (e) {
    console.error("[Sensei] Error fetching LM Studio models:", e);
  }
  return { ok: false, error: "LM Studio unavailable", address: `${ip}:${port}`, models: [] };
}

function openSenseiGearConfig(node, anchorEl) {
  closeSenseiGearConfig();
  if (!node) return;

  const s = node._sstate;
  if (!s.lm_studio) {
    s.lm_studio = { ...defaultState().lm_studio };
  }
  const lm = s.lm_studio;

  const popup = document.createElement("div");
  popup.className = "ds-sensei-gear-popover";
  popup.dataset.dsThemed = "true";
  try { window.DSGlobalTheme?.applyToElement?.(popup); } catch (_) {}

  popup.addEventListener("pointerdown", (e) => e.stopPropagation());
  popup.addEventListener("mousedown", (e) => e.stopPropagation());
  popup.addEventListener("click", (e) => e.stopPropagation());

  const sync = () => {
    node._syncState?.();
    node._renderUI?.();
  };

  const renderContent = () => {
    popup.innerHTML = "";

    // ── Header
    const head = document.createElement("div");
    head.className = "ds-sensei-gear-header";

    const titleWrap = document.createElement("div");
    titleWrap.className = "ds-sensei-gear-title-wrap";
    titleWrap.innerHTML = `
      <span class="ds-sensei-gear-badge">DS</span>
      <div>
        <strong class="ds-sensei-gear-title">DS AI Prompt Sensei</strong>
        <small class="ds-sensei-gear-sub">LM Studio Configuration</small>
      </div>
    `;

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "ds-sensei-gear-close";
    closeBtn.textContent = "×";
    closeBtn.onclick = closeSenseiGearConfig;

    head.append(titleWrap, closeBtn);
    popup.appendChild(head);

    // ── Model (Full Width)
    const modelSec = document.createElement("div");
    modelSec.className = "ds-sensei-gear-field";
    const modelLbl = document.createElement("label");
    modelLbl.className = "ds-sensei-gear-label";
    modelLbl.textContent = "Model";

    const modelSel = selDiv(lm.model || "Select LM Studio Model...", async () => {
      const textSpan = modelSel.querySelector(".ds-sensei-select-text");
      if (textSpan) textSpan.textContent = "Fetching models...";
      const res = await fetchLMStudioModels(lm.ip, lm.port);
      if (textSpan) textSpan.textContent = lm.model || "Select LM Studio Model...";

      if (res.ok && res.models?.length > 0) {
        const llmModels = res.models.filter((m) => !/(embed|nomic-embed|bge-)/i.test(m));
        const displayModels = llmModels.length > 0 ? llmModels : res.models;
        openMenu(
          modelSel,
          displayModels,
          lm.model,
          (selected) => {
            lm.model = selected;
            s.error_msg = null;
            sync();
            renderContent();
          },
          () => {
            if (textSpan) textSpan.textContent = lm.model || "Select LM Studio Model...";
          }
        );
      } else {
        const errToast = document.createElement("div");
        errToast.className = "ds-sensei-gear-err-toast";
        errToast.textContent = res.error || `LM Studio unavailable (${lm.ip}:${lm.port})`;
        popup.appendChild(errToast);
        setTimeout(() => errToast.remove(), 2500);
      }
    });
    modelSel.style.width = "100%";
    modelSec.append(modelLbl, modelSel);
    popup.appendChild(modelSec);

    // ── IP Address & Port (2 Columns)
    const connRow = document.createElement("div");
    connRow.className = "ds-sensei-gear-row-2col";

    const ipField = document.createElement("div");
    ipField.className = "ds-sensei-gear-field";
    ipField.innerHTML = `<label class="ds-sensei-gear-label">IP Address</label>`;
    const ipInp = document.createElement("input");
    ipInp.type = "text";
    ipInp.className = "ds-sensei-input";
    ipInp.value = lm.ip || "127.0.0.1";
    ipInp.onchange = () => {
      lm.ip = ipInp.value.trim() || "127.0.0.1";
      sync();
    };
    ipField.appendChild(ipInp);

    const portField = document.createElement("div");
    portField.className = "ds-sensei-gear-field";
    portField.innerHTML = `<label class="ds-sensei-gear-label">Port</label>`;
    const portInp = document.createElement("input");
    portInp.type = "number";
    portInp.className = "ds-sensei-input";
    portInp.value = lm.port || 1234;
    portInp.onchange = () => {
      lm.port = parseInt(portInp.value) || 1234;
      sync();
    };
    portField.appendChild(portInp);

    connRow.append(ipField, portField);
    popup.appendChild(connRow);

    // ── Sampling (Max Tokens & Temperature)
    const samplingLbl = document.createElement("div");
    samplingLbl.className = "ds-sensei-gear-section-label";
    samplingLbl.textContent = "Sampling";
    popup.appendChild(samplingLbl);

    const samplingRow = document.createElement("div");
    samplingRow.className = "ds-sensei-gear-row-2col";

    const maxTokensField = document.createElement("div");
    maxTokensField.className = "ds-sensei-gear-field";
    maxTokensField.innerHTML = `<label class="ds-sensei-gear-label">Max Tokens</label>`;
    const mtSt = mkStepper({
      value: lm.max_tokens ?? 2048,
      min: 1,
      max: 131072,
      step: 128,
      decimals: 0,
      width: "100%",
      onChange: (v) => {
        lm.max_tokens = parseInt(v) || 2048;
        sync();
      },
    });
    maxTokensField.appendChild(mtSt.wrap);

    const tempField = document.createElement("div");
    tempField.className = "ds-sensei-gear-field";
    tempField.innerHTML = `<label class="ds-sensei-gear-label">Temperature</label>`;
    const tempSt = mkStepper({
      value: lm.temperature ?? 0.7,
      min: 0.0,
      max: 2.0,
      step: 0.05,
      decimals: 2,
      width: "100%",
      onChange: (v) => {
        lm.temperature = parseFloat(v) ?? 0.7;
        sync();
      },
    });
    tempField.appendChild(tempSt.wrap);

    samplingRow.append(maxTokensField, tempField);
    popup.appendChild(samplingRow);

    // ── Seed & Timeout
    const seedTimeoutRow = document.createElement("div");
    seedTimeoutRow.className = "ds-sensei-gear-row-2col";

    const seedField = document.createElement("div");
    seedField.className = "ds-sensei-gear-field";

    const seedHdr = document.createElement("div");
    seedHdr.style.cssText = "display:flex;justify-content:space-between;align-items:center;width:100%;";
    const seedLbl = document.createElement("label");
    seedLbl.className = "ds-sensei-gear-label";
    seedLbl.textContent = "Seed";
    const diceBtn = document.createElement("button");
    diceBtn.type = "button";
    diceBtn.className = "ds-sensei-btn-compact";
    diceBtn.style.cssText = "height:16px;line-height:16px;padding:0 5px;font-size:10px;font-weight:700;color:var(--ds-accent,#67e8f9);background:rgba(103,232,249,0.12);border:none;border-radius:3px;cursor:pointer;";
    diceBtn.title = "Roll new random seed";
    diceBtn.textContent = "🎲 Roll";
    seedHdr.append(seedLbl, diceBtn);
    seedField.appendChild(seedHdr);

    const seedInp = document.createElement("input");
    seedInp.type = "number";
    seedInp.className = "ds-sensei-input";
    seedInp.style.cssText = "width:100%;box-sizing:border-box;min-width:0;";
    seedInp.value = lm.seed ?? 123456;
    seedInp.onchange = () => {
      lm.seed = parseInt(seedInp.value) || 0;
      sync();
    };
    diceBtn.onclick = () => {
      const r = Math.floor(Math.random() * 2147483647);
      lm.seed = r;
      seedInp.value = r;
      sync();
    };
    seedField.appendChild(seedInp);

    const timeoutField = document.createElement("div");
    timeoutField.className = "ds-sensei-gear-field";
    const timeoutHdr = document.createElement("div");
    timeoutHdr.style.cssText = "display:flex;align-items:center;height:16px;";
    const timeoutLbl = document.createElement("label");
    timeoutLbl.className = "ds-sensei-gear-label";
    timeoutLbl.textContent = "Timeout (s)";
    timeoutHdr.appendChild(timeoutLbl);
    timeoutField.appendChild(timeoutHdr);

    const timeoutInp = document.createElement("input");
    timeoutInp.type = "number";
    timeoutInp.className = "ds-sensei-input";
    timeoutInp.style.cssText = "width:100%;box-sizing:border-box;min-width:0;";
    timeoutInp.value = lm.timeout ?? 300;
    timeoutInp.onchange = () => {
      lm.timeout = Math.max(5, parseInt(timeoutInp.value) || 300);
      sync();
    };
    timeoutField.appendChild(timeoutInp);

    seedTimeoutRow.append(seedField, timeoutField);
    popup.appendChild(seedTimeoutRow);

    // ── Behavior Settings
    const behaviorLbl = document.createElement("div");
    behaviorLbl.className = "ds-sensei-gear-section-label";
    behaviorLbl.textContent = "Behavior Settings";
    popup.appendChild(behaviorLbl);

    const behaviorBox = document.createElement("div");
    behaviorBox.className = "ds-sensei-gear-behavior-box";

    // Randomize seed each gen toggle
    const isRand = lm.randomize_seed !== false;
    const randRow = document.createElement("div");
    randRow.className = "ds-sensei-gear-toggle-row";
    randRow.innerHTML = `<span class="ds-sensei-gear-toggle-text">Randomize seed each gen</span>`;
    const randBtn = mkBtn(
      isRand ? "ON" : "OFF",
      `ds-sensei-gear-toggle-btn ${isRand ? "active" : ""}`,
      () => {
        lm.randomize_seed = !isRand;
        sync();
        renderContent();
      }
    );
    randRow.appendChild(randBtn);
    behaviorBox.appendChild(randRow);

    // Unload LLM toggle
    const unloadRow = document.createElement("div");
    unloadRow.className = "ds-sensei-gear-toggle-row";
    unloadRow.innerHTML = `<span class="ds-sensei-gear-toggle-text">Unload LLM after run</span>`;
    const unloadBtn = mkBtn(
      lm.unload_after_run ? "ON" : "OFF",
      `ds-sensei-gear-toggle-btn ${lm.unload_after_run ? "active" : ""}`,
      () => {
        lm.unload_after_run = !lm.unload_after_run;
        s.auto_unload = lm.unload_after_run;
        sync();
        renderContent();
      }
    );
    unloadRow.appendChild(unloadBtn);
    behaviorBox.appendChild(unloadRow);

    // Pause to edit prompt toggle
    const pauseRow = document.createElement("div");
    pauseRow.className = "ds-sensei-gear-toggle-row";
    pauseRow.innerHTML = `<span class="ds-sensei-gear-toggle-text">Pause to edit prompt</span>`;
    const pauseBtn = mkBtn(
      lm.pause_to_edit ? "ON" : "OFF",
      `ds-sensei-gear-toggle-btn ${lm.pause_to_edit ? "active" : ""}`,
      () => {
        lm.pause_to_edit = !lm.pause_to_edit;
        sync();
        renderContent();
      }
    );
    pauseRow.appendChild(pauseBtn);
    behaviorBox.appendChild(pauseRow);

    popup.appendChild(behaviorBox);
  };

  renderContent();
  document.body.appendChild(popup);
  _activeSenseiGearPopup = popup;

  // Auto-detect and populate loaded model if not set
  if (!lm.model) {
    fetchLMStudioModels(lm.ip, lm.port).then((res) => {
      if (res.ok && res.models?.length > 0) {
        const llmModels = res.models.filter((m) => !/(embed|nomic-embed|bge-)/i.test(m));
        const activeModel = llmModels[0] || res.models[0];
        if (!lm.model && activeModel) {
          lm.model = activeModel;
          s.error_msg = null;
          sync();
          renderContent();
        }
      }
    });
  }

  // Position popup next to node on its side
  const pw = popup.offsetWidth || 330;
  const ph = popup.offsetHeight || 420;
  let placed = false;

  if (node && node.pos && app.canvas?.ds) {
    try {
      const ds = app.canvas.ds;
      const canvasEl = app.canvas.canvas;
      const cRect = canvasEl ? canvasEl.getBoundingClientRect() : { left: 0, top: 0 };

      // Convert node canvas coordinates to client screen coordinates
      const screenX = cRect.left + (node.pos[0] + ds.offset[0]) * ds.scale;
      const screenY = cRect.top + (node.pos[1] + ds.offset[1]) * ds.scale;
      const nodeW = (node.size ? node.size[0] : 420) * ds.scale;

      // Position on the RIGHT side of the node
      let left = screenX + nodeW + 16;
      let top = Math.max(10, Math.min(screenY, window.innerHeight - ph - 10));

      // If overflowing viewport on the right, place on the LEFT side of the node
      if (left + pw > window.innerWidth - 10) {
        if (screenX - pw - 16 >= 10) {
          left = screenX - pw - 16;
        } else {
          left = Math.max(10, window.innerWidth - pw - 10);
        }
      }

      popup.style.left = `${Math.round(left)}px`;
      popup.style.top = `${Math.round(top)}px`;
      placed = true;
    } catch (_) {}
  }

  if (!placed) {
    if (anchorEl && typeof anchorEl.getBoundingClientRect === "function") {
      const rect = anchorEl.getBoundingClientRect();
      let left = rect.right + 12;
      if (left + pw > window.innerWidth - 10) left = Math.max(10, rect.left - pw - 12);
      let top = Math.max(10, Math.min(rect.top, window.innerHeight - ph - 10));
      popup.style.left = `${Math.round(left)}px`;
      popup.style.top = `${Math.round(top)}px`;
    } else {
      popup.style.left = `${Math.max(10, window.innerWidth - pw - 20)}px`;
      popup.style.top = `60px`;
    }
  }

  const onOutside = (e) => {
    if (e.target.closest?.(".ds-sensei-menu-popover")) return;
    if (!popup.contains(e.target) && (!anchorEl || !anchorEl.contains(e.target))) {
      closeSenseiGearConfig();
      document.removeEventListener("pointerdown", onOutside);
    }
  };
  setTimeout(() => {
    document.addEventListener("pointerdown", onOutside);
  }, 10);
}

function registerGearMenu() {
  if (!window.DSGearMenu?.register) return;
  const config = {
    tooltip: "DS AI Prompt Sensei Configuration",
    onClick: (node, canvas, event) => {
      openSenseiGearConfig(node, event?.currentTarget || event?.target);
    },
  };
  window.DSGearMenu.register(NODE_TYPE, config);
  window.DSGearMenu.register("DS AI Prompt Sensei", config);
}

function isLink(v) {
  return Array.isArray(v) && v.length === 2 && (typeof v[0] === "string" || typeof v[0] === "number") && typeof v[1] === "number";
}

function buildConsumers(out) {
  const c = new Map();
  for (const id in out) for (const k in (out[id]?.inputs || {})) {
    const v = out[id].inputs[k]; if (!isLink(v)) continue;
    const origin = String(v[0]); if (!c.has(origin)) c.set(origin, new Set()); c.get(origin).add(String(id));
  }
  return c;
}

function collectDownstream(consumers, startId) {
  const seen = new Set(), stack = [String(startId)];
  while (stack.length) { const cur = stack.pop(); for (const n of (consumers.get(cur) || [])) if (!seen.has(n)) { seen.add(n); stack.push(n); } }
  return seen;
}

async function resumeSenseiWorkflow(node) {
  const all = app.graph?._nodes || app.graph?.nodes || [];
  for (const n of all) if (n !== node) n._dsSenseiSubmitMode = null;
  node._dsSenseiSubmitMode = "continue";
  node._dsSenseiActiveMode = "continue";
  try {
    if (typeof app.queuePrompt === "function") {
      await app.queuePrompt(0, 1);
    } else {
      const qBtn = document.getElementById("queue-button") || document.querySelector(".comfy-queue-btn");
      if (qBtn) qBtn.click();
    }
  } catch (e) {
    console.warn("[Sensei] app.queuePrompt failed, attempting fallback to queue button:", e);
    try {
      const qBtn = document.getElementById("queue-button") || document.querySelector(".comfy-queue-btn");
      if (qBtn) qBtn.click();
    } catch (_) {}
    node._dsSenseiActiveMode = null;
  } finally {
    setTimeout(() => { node._dsSenseiSubmitMode = null; }, 500);
  }
}

let _senseiQueueWrapped = false;
let _isSenseiExecuting = false;

function installSenseiQueueHooks() {
  if (_senseiQueueWrapped || !api?.queuePrompt) return;
  _senseiQueueWrapped = true;

  const origQueuePrompt = api.queuePrompt.bind(api);
  api.queuePrompt = async function (...args) {
    try {
      const promptObj = args[1]?.output || args[1];
      if (promptObj && typeof promptObj === "object") {
        const allNodes = app.graph?._nodes || app.graph?.nodes || [];
        for (const n of allNodes) {
          if (n.type === NODE_TYPE || n.comfyClass === NODE_TYPE) {
            const isPauseMode = Boolean(n._sstate?.lm_studio?.pause_to_edit);
            const submitMode = n._dsSenseiSubmitMode;
            if (isPauseMode && submitMode !== "continue") {
              const consumers = buildConsumers(promptObj);
              const downstream = collectDownstream(consumers, n.id);
              for (const d of downstream) {
                delete promptObj[d];
              }
              n._dsSenseiActiveMode = "pause";
            } else if (submitMode === "continue") {
              n._dsSenseiActiveMode = "continue";
            }
            n._dsSenseiSubmitMode = null;
          }
        }
      }
    } catch (e) {
      console.error("[Sensei] Queue hook error:", e);
    }
    return origQueuePrompt(...args);
  };

  const triggerSenseiNodeUpdates = () => {
    const allNodes = app.graph?._nodes || app.graph?.nodes || [];
    for (const n of allNodes) {
      if (n.type === NODE_TYPE || n.comfyClass === NODE_TYPE) {
        n._renderUI?.();
      }
    }
  };

  const onExecutionDone = () => {
    _isSenseiExecuting = false;
    const allNodes = app.graph?._nodes || app.graph?.nodes || [];
    for (const n of allNodes) {
      if (n.type === NODE_TYPE || n.comfyClass === NODE_TYPE) {
        if (n._dsSenseiActiveMode === "pause") {
          n._sstate.status = "paused";
          n._dsSenseiActiveMode = null;
          n._renderUI?.();
        } else if (n._dsSenseiActiveMode === "continue") {
          n._sstate.status = "completed";
          n._dsSenseiActiveMode = null;
          n._renderUI?.();
        }
      }
    }
    triggerSenseiNodeUpdates();
  };

  api.addEventListener("execution_start", () => {
    _isSenseiExecuting = true;
    triggerSenseiNodeUpdates();
  });
  api.addEventListener("execution_success", onExecutionDone);
  api.addEventListener("execution_error", onExecutionDone);
  api.addEventListener("execution_interrupted", onExecutionDone);
  api.addEventListener("executing", ({ detail }) => {
    _isSenseiExecuting = detail !== null;
    if (detail === null) onExecutionDone();
    else triggerSenseiNodeUpdates();
  });

  api.addEventListener("ds_sensei_executed", ({ detail }) => {
    if (!detail) return;
    const allNodes = app.graph?._nodes || app.graph?.nodes || [];
    for (const n of allNodes) {
      if (n.type === NODE_TYPE || n.comfyClass === NODE_TYPE) {
        if (detail.prompt) {
          n._sstate.generated_prompt = detail.prompt;
          if (detail.speed && detail.elapsed) {
            n._sstate.telemetry = {
              tokens: detail.tokens || n._sstate.telemetry?.tokens || 0,
              speed: detail.speed,
              elapsed: detail.elapsed,
              model: detail.model || n._sstate.telemetry?.model || "LM Studio"
            };
          }
          n._sstate.status = "completed";
          n._sstate.error_msg = null;
          n._syncState?.();
          n._renderUI?.();
        }
      }
    }
  });

  api.addEventListener("executed", ({ detail }) => {
    if (!detail) return;
    const allNodes = app.graph?._nodes || app.graph?.nodes || [];
    for (const n of allNodes) {
      if ((n.type === NODE_TYPE || n.comfyClass === NODE_TYPE) && String(n.id) === String(detail.node)) {
        const promptText = detail.output?.prompt?.[0];
        if (promptText) {
          n._sstate.generated_prompt = promptText;
          const newSpeed = detail.output.speed?.[0];
          const newElapsed = detail.output.elapsed?.[0];
          if (newSpeed && newElapsed) {
            n._sstate.telemetry = {
              tokens: detail.output.tokens?.[0] || n._sstate.telemetry?.tokens || 0,
              speed: newSpeed,
              elapsed: newElapsed,
              model: detail.output.model?.[0] || n._sstate.telemetry?.model || "LM Studio"
            };
          }
          n._sstate.status = "completed";
          n._sstate.error_msg = null;
          n._syncState?.();
          n._renderUI?.();
        }
      }
    }
  });
}

function defaultState() {
  return {
    image_path: "", image_dims: null, ar_source: "manual", img_expanded: false,
    prompt_height: null, notes_height: null,
    telemetry: { tokens: 0, speed: 0, elapsed: 0, model: "LM Studio" },
    hardware: null,
    lm_studio: {
      model: "",
      ip: "127.0.0.1",
      port: 1234,
      max_tokens: 2048,
      temperature: 0.7,
      seed: 123456,
      randomize_seed: true,
      timeout: 300,
      unload_after_run: false,
      pause_to_edit: false,
    },
    models: { model: "", video_vae: "", audio_vae: "", text_enc: "", attention: "default" },
    loras: [{ name: "", strength: 1.0, enabled: true }],
    lora_expanded: false,
    video: { aspect_ratio: "16:9", size_mode: "res", res_preset: "1280 × 720", mp_preset: 0.92, width: 1280, height: 720, mp: 0.92, duration: 5.0, fps: 24.0 },
    scene_notes: "", system_prompt: DEFAULT_SYSTEM_PROMPT, generated_prompt: "", auto_unload: false, status: "idle",
    error_msg: null,
  };
}

function isVueNodes() {
  return !!(
    window.LiteGraph?.vueNodesMode ||
    document.querySelector(".lg-node") ||
    document.querySelector(".vue-canvas")
  );
}

function getElementTopInRoot(el, root) {
  let top = 0;
  let curr = el;
  while (curr && curr !== root) {
    top += curr.offsetTop || 0;
    curr = curr.offsetParent;
  }
  return top;
}

function getElementCenterY(node, el) {
  if (!el || !node._domRoot) return null;
  const w = node._senseiWidget;
  const widgetY = Number.isFinite(w?.y) ? w.y : (Number.isFinite(node.widgets_start_y) ? node.widgets_start_y : 2);
  const widgetMargin = Number.isFinite(w?.margin) ? w.margin : (w?.options?.margin ?? 10);
  const rootOffsetTop = node._domRoot.offsetTop || 4;
  const top = getElementTopInRoot(el, node._domRoot);
  const rowH = el.offsetHeight || (el === node._anchorEls?.[0] ? 64 : 28);
  return Math.round(widgetY + widgetMargin + rootOffsetTop + top + rowH * 0.5);
}

function alignOutputs(node) {
  if (!node || !node.outputs || !node._anchorEls) return;

  const nx = node.size[0];
  const isVue = isVueNodes();
  let nodeEl = null;
  let vueOuts = null;

  if (isVue) {
    nodeEl = document.querySelector(`.lg-node[data-node-id="${node.id}"]`);
    if (nodeEl) vueOuts = nodeEl.querySelectorAll(".lg-slot--output");
  }

  let changed = false;

  for (let i = 0; i < 10; i++) {
    const out = node.outputs[i];
    const el = node._anchorEls[i];
    if (!out || !el) continue;

    const targetY = getElementCenterY(node, el);
    if (!Number.isFinite(targetY)) continue;

    if (!out.pos || Math.abs(out.pos[0] - nx) > 0.5 || Math.abs(out.pos[1] - targetY) > 0.5) {
      out.pos = [nx, targetY];
      changed = true;
    }

    if (isVue && nodeEl && vueOuts && vueOuts[i]) {
      vueOuts[i].style.position = "absolute";
      vueOuts[i].style.right = "0px";
      vueOuts[i].style.top = `${targetY}px`;
      vueOuts[i].style.transform = "translateY(-50%)";
      vueOuts[i].style.pointerEvents = "auto";
    }
  }

  if (changed) {
    node.setDirtyCanvas?.(true, true);
  }
}

function fitNode(node) {
  if (!node) return;
  const contentH = Math.ceil(node._domRoot?.offsetHeight || node._domRoot?.scrollHeight || 0);
  const targetH = Math.max(MIN_H, contentH > 0 ? contentH + 16 : DEFAULT_H);
  const targetW = Math.max(MIN_W, Number(node.size?.[0]) || DEFAULT_W);
  if (!node.size || node.size[0] !== targetW || Math.abs(node.size[1] - targetH) > 2) {
    node.size = [targetW, targetH];
    node.setDirtyCanvas?.(true, true);
  }
}

function scheduleAlign(node) {
  if (!node || node._dsRemoved) return;
  const run = () => {
    if (!node.graph || node._dsRemoved) return;
    alignOutputs(node);
  };
  requestAnimationFrame(run);
  setTimeout(run, 80);
}

function watchAlign(node) {
  if (node._dsAlignPoll) return;
  node._dsAlignPoll = setInterval(() => {
    if (!node.graph || node._dsRemoved) {
      unwatchAlign(node);
      return;
    }
    alignOutputs(node);
  }, 300);
  scheduleAlign(node);
}

function unwatchAlign(node) {
  if (node?._dsAlignPoll) {
    clearInterval(node._dsAlignPoll);
    node._dsAlignPoll = null;
  }
}

// ---------------------------------------------------------------------------
// Build DOM UI
// ---------------------------------------------------------------------------

function mksec(title) {
  const el = document.createElement("div"); el.className = "ds-sensei-section";
  const hdr = document.createElement("div"); hdr.className = "ds-sensei-section-header-wrap";
  const h = document.createElement("div"); h.className = "ds-sensei-section-header"; h.textContent = title;
  const actions = document.createElement("div"); actions.className = "ds-sensei-section-actions";
  hdr.append(h, actions); el.appendChild(hdr);
  const body = document.createElement("div"); body.className = "ds-sensei-section-body"; el.appendChild(body);
  return { el, hdr, actions, body };
}

function mkrow(label) {
  const row = document.createElement("div"); row.className = "ds-sensei-row";
  if (label) { const l = document.createElement("span"); l.className = "ds-sensei-row-label"; l.textContent = label; row.appendChild(l); }
  return row;
}

function renderHW(container, s) {
  container.innerHTML = "";
  const hw = s.hardware; if (!hw?.has_gpu) return;
  const est = estimateVRAM(s.video.width, s.video.height, s.video.fps, s.video.duration, s.models.model);
  const avail = hw.available_vram_mb / 1024, total = hw.total_vram_mb / 1024;
  if (est > avail * 0.85) {
    const w = document.createElement("div"); w.className = "ds-sensei-hw-warning";
    w.innerHTML = `<span class="ds-sensei-hw-warning-icon">⚠</span><span class="ds-sensei-hw-warning-text">~${est.toFixed(1)} GB est — ${avail.toFixed(1)} / ${total.toFixed(1)} GB (${hw.gpu_name})</span>`;
    container.appendChild(w);
  } else {
    const ok = document.createElement("div"); ok.className = "ds-sensei-hw-ok";
    ok.textContent = `✓ ${hw.gpu_name} — ${avail.toFixed(1)} GB available`;
    container.appendChild(ok);
  }
}

function buildRoot(node) {
  const root = document.createElement("div");
  root.className = "ds-sensei-root";
  root.dataset.dsThemed = "true";
  root.style.cssText = "overflow:visible;width:100%;height:auto;min-height:0;box-sizing:border-box;";

  const anchorEls = new Array(10).fill(null);

  const sync = () => {
    const s = node._sstate;
    const curNotes = root.querySelector(".ds-sensei-notes-area");
    if (curNotes && curNotes.style.height) {
      s.notes_height = curNotes.style.height;
    }
    const curPrompt = root.querySelector(".ds-sensei-prompt-area");
    if (curPrompt && curPrompt.style.height) {
      s.prompt_height = curPrompt.style.height;
    }
    const wgt = node.widgets?.find((w) => w.name === "SenseiState");
    const jsonStr = JSON.stringify(s);
    if (wgt) wgt.value = jsonStr;
    node.properties = node.properties || {};
    node.properties.ds_sensei_state = s;
    if (app.graph) {
      app.graph._version = (app.graph._version || 0) + 1;
      app.graph.setDirtyCanvas?.(true, true);
    }
  };
  node._syncState = sync;

  const rerender = () => {
    const curNotes = root.querySelector(".ds-sensei-notes-area");
    if (curNotes && curNotes.style.height) {
      node._sstate.notes_height = curNotes.style.height;
    }
    const curPrompt = root.querySelector(".ds-sensei-prompt-area");
    if (curPrompt && curPrompt.style.height) {
      node._sstate.prompt_height = curPrompt.style.height;
    }
    sync();

    root.innerHTML = "";
    buildInner(root, node, node._sstate, sync, rerender, anchorEls);
    try { window.DSGlobalTheme?.bindNode?.(root, node); } catch (_) {}
    fitNode(node);
    scheduleAlign(node);
  };
  node._renderUI = rerender;
  node._anchorEls = anchorEls;

  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => {
      fitNode(node);
      scheduleAlign(node);
    });
    ro.observe(root);
    node._senseiRo = ro;
  }

  buildInner(root, node, node._sstate, sync, rerender, anchorEls);
  fitNode(node);
  return root;
}

function buildInner(root, node, s, sync, rerender, anchorEls) {
  // ── TELEMETRY BAR
  const tbar = document.createElement("div"); tbar.className = "ds-sensei-telemetry-bar";
  const tel = s.telemetry || {};
  tbar.innerHTML = `<span class="ds-sensei-telemetry-badge">⚡ ${tel.model || s.lm_studio?.model || "LM Studio"}</span><div class="ds-sensei-telemetry-stats"><span><b>${tel.tokens || 0}</b> Tks</span><span class="ds-sensei-telemetry-dot">·</span><span><b>${tel.speed || 0}</b> Tk/s</span><span class="ds-sensei-telemetry-dot">·</span><span><b>${tel.elapsed ? tel.elapsed + "s" : "—"}</b></span></div>`;
  root.appendChild(tbar);

  // ── IMAGE (slot 0)
  const imgSec = mksec("Image");
  imgSec.actions.appendChild(mkBtn(s.img_expanded ? "Collapse" : "Expand", `ds-sensei-btn-compact ${s.img_expanded ? "active" : ""}`, () => { s.img_expanded = !s.img_expanded; sync(); rerender(); }));
  const fileInp = document.createElement("input"); fileInp.type = "file"; fileInp.accept = "image/*"; fileInp.style.display = "none";
  const handleFile = async (file) => {
    if (!file) return;
    const fd = new FormData(); fd.append("image", file);
    try {
      const r = await fetch("/upload/image", { method: "POST", body: fd }); if (!r.ok) return;
      const d = await r.json(); s.image_path = d.name;
      const img = new Image();
      img.onload = () => {
        s.image_dims = `${img.naturalWidth} × ${img.naturalHeight}`;
        const ar = findClosestAR(img.naturalWidth / img.naturalHeight);
        s.video.aspect_ratio = ar;
        s.ar_source = "locked";

        const origLabel = `Original (${img.naturalWidth} × ${img.naturalHeight})`;

        if (s.video.size_mode === "mp") {
          // Recalculate dimensions for new aspect ratio
          const targetMP = parseFloat(s.video.mp_preset || s.video.mp || 1.0);
          const d = dimsFromMP(targetMP, ar);
          s.video.width = d.w;
          s.video.height = d.h;
          s.video.mp = targetMP;
          s.video.res_preset = "";
        } else {
          const wasOriginal = !s.video.res_preset || s.video.res_preset.startsWith("Original");
          if (wasOriginal) {
            s.video.width = img.naturalWidth;
            s.video.height = img.naturalHeight;
            s.video.res_preset = origLabel;
            s.video.mp = parseFloat(calcMP(img.naturalWidth, img.naturalHeight));
            s.video.mp_preset = s.video.mp;
          } else {
            // Match closest preset in new aspect ratio
            const curMP = parseFloat(s.video.mp) || 1.0;
            const newPresets = LTX_PRESETS[ar] || LTX_PRESETS["16:9"];
            let closest = newPresets[0];
            let minDiff = Infinity;
            for (const p of newPresets) {
              const pMP = (p.w * p.h) / 1_000_000;
              const diff = Math.abs(pMP - curMP);
              if (diff < minDiff) {
                minDiff = diff;
                closest = p;
              }
            }
            s.video.width = closest.w;
            s.video.height = closest.h;
            s.video.res_preset = closest.label;
            s.video.mp = parseFloat(calcMP(closest.w, closest.h));
          }
        }
        sync();
        rerender();
      };
      img.src = `/view?filename=${encodeURIComponent(d.name)}&type=${d.type || "input"}`;
    } catch (e) { console.error("[Sensei] Upload:", e); }
  };
  fileInp.onchange = (e) => handleFile(e.target.files[0]);

  const imgAnchorRow = document.createElement("div"); imgAnchorRow.style.cssText = "width:100%;";

  if (s.image_path) {
    const prevBox = document.createElement("div"); prevBox.className = `ds-sensei-preview-container ${s.img_expanded ? "expanded" : ""}`;
    const imgEl = document.createElement("img"); imgEl.className = "ds-sensei-preview-img";
    imgEl.onload = () => { fitNode(node); scheduleAlign(node); };
    imgEl.src = `/view?filename=${encodeURIComponent(s.image_path)}&type=input`;
    prevBox.appendChild(imgEl); prevBox.onclick = () => fileInp.click();
    imgAnchorRow.appendChild(prevBox);
    const rbar = document.createElement("div"); rbar.className = "ds-sensei-res-bar";
    const dspan = document.createElement("span"); dspan.textContent = s.image_dims || "Loaded"; rbar.appendChild(dspan);
    rbar.append(mkBtn("Remove", "ds-sensei-btn-compact ds-sensei-btn-danger", (e) => {
      e.stopPropagation();
      s.image_path = "";
      s.image_dims = null;
      s.ar_source = "manual";
      if (s.video.size_mode === "mp") {
        const targetMP = parseFloat(s.video.mp_preset || s.video.mp || 0.92);
        const d = dimsFromMP(targetMP, s.video.aspect_ratio);
        s.video.width = d.w;
        s.video.height = d.h;
        s.video.res_preset = "";
        s.video.mp = targetMP;
      } else {
        const pList = LTX_PRESETS[s.video.aspect_ratio] || LTX_PRESETS["16:9"];
        const p = pList.find(x => x.label.includes("720p")) || pList[0];
        s.video.width = p.w;
        s.video.height = p.h;
        s.video.res_preset = p.label;
        s.video.mp = parseFloat(calcMP(p.w, p.h));
        s.video.mp_preset = s.video.mp;
      }
      sync();
      rerender();
    }));
    imgAnchorRow.appendChild(rbar);
  } else {
    const dz = document.createElement("div"); dz.className = "ds-sensei-dropzone";
    dz.innerHTML = `<div style="font-weight:600;color:var(--ds-accent);">Upload Image</div><div class="ds-sensei-dropzone-text">Click or drag & drop — auto-detects AR</div>`;
    dz.onclick = () => fileInp.click();
    dz.ondragover = (e) => { e.preventDefault(); dz.classList.add("drag-over"); };
    dz.ondragleave = () => dz.classList.remove("drag-over");
    dz.ondrop = (e) => { e.preventDefault(); dz.classList.remove("drag-over"); if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]); };
    imgAnchorRow.appendChild(dz);
  }
  imgSec.body.append(imgAnchorRow, fileInp);
  anchorEls[OUT.image] = imgAnchorRow;
  root.appendChild(imgSec.el);

  // ── MODELS (slots 1–4: model, video_vae, audio_vae, text_enc)
  const modelSec = mksec("Models");
  const mdefs = [
    { key: "model",     label: "Model",     cat: "models",     slot: OUT.model },
    { key: "video_vae", label: "Video VAE", cat: "vaes",       slot: OUT.video_vae },
    { key: "audio_vae", label: "Audio VAE", cat: "vaes",       slot: OUT.audio_vae },
    { key: "text_enc",  label: "Text Enc",  cat: "clips",      slot: OUT.text_enc },
    { key: "attention", label: "Attention", cat: "attentions", slot: -1 },
  ];
  mdefs.forEach((m) => {
    const row = mkrow(m.label);
    if (m.slot >= 0) anchorEls[m.slot] = row;
    const cur = s.models[m.key] || (m.key === "attention" ? "default" : "None");
    const sel = selDiv(cur, async () => {
      const cat = await getCatalog();
      openMenu(sel, cat[m.cat] || [], s.models[m.key], (v) => { s.models[m.key] = v; sync(); rerender(); });
    });
    row.appendChild(sel); modelSec.body.appendChild(row);
  });
  root.appendChild(modelSec.el);

  // ── LORAS
  const loraSec = mksec("LoRA Loader");
  loraSec.actions.appendChild(mkBtn(s.lora_expanded ? "Collapse" : "Expand", `ds-sensei-btn-compact ${s.lora_expanded ? "active" : ""}`, () => { s.lora_expanded = !s.lora_expanded; sync(); rerender(); }));
  if (!s.loras?.length) s.loras = [defaultState().loras[0]];
  const loraList = document.createElement("div"); loraList.className = `ds-sensei-lora-list ${s.lora_expanded ? "expanded" : ""}`;
  s.loras.forEach((lora, idx) => {
    const lr = document.createElement("div"); lr.className = "ds-sensei-lora-row";
    // LoRA selector
    const lSel = selDiv(lora.name || "Select LoRA...", async () => {
      const cat = await getCatalog();
      openMenu(lSel, cat.loras || [], lora.name, (v) => { lora.name = v; sync(); rerender(); });
    }); lSel.style.cssText = "flex:1;min-width:0;";

    // Strength stepper
    const strGroup = document.createElement("div"); strGroup.className = "ds-sensei-lora-str-group";
    const lbl = document.createElement("span"); lbl.className = "ds-sensei-lora-tag"; lbl.textContent = "Str";
    const st = mkStepper({ value: lora.strength ?? 1.0, step: 0.05, decimals: 2, width: "60px", onChange: (v) => { lora.strength = v; sync(); } });
    strGroup.append(lbl, st.wrap);

    // Toggle & delete
    const enT = mkBtn(lora.enabled !== false ? "ON" : "OFF", `ds-sensei-lora-toggle ${lora.enabled !== false ? "active" : ""}`, () => { lora.enabled = !lora.enabled; sync(); rerender(); });
    const delB = mkBtn("×", "ds-sensei-btn-danger", () => { s.loras.splice(idx, 1); if (!s.loras.length) s.loras.push(defaultState().loras[0]); sync(); rerender(); });
    enT.style.cssText = "min-width:32px;padding:0 4px;"; delB.style.cssText = "min-width:24px;padding:0;";

    lr.append(lSel, strGroup, enT, delB);
    loraList.appendChild(lr);
  });
  loraSec.body.appendChild(loraList);
  loraSec.body.appendChild(mkBtn("+ Add LoRA", "", () => { s.loras.push(defaultState().loras[0]); sync(); rerender(); }));
  root.appendChild(loraSec.el);

  // ── VIDEO SETTINGS
  const vidSec = mksec("Video Settings");

  // Aspect ratio
  const arRow = mkrow("Aspect Ratio");
  const hasImage = Boolean(s.image_path);
  const arSel = selDiv(s.video.aspect_ratio, () => {
    if (hasImage) return;
    openMenu(arSel, AR_LIST, s.video.aspect_ratio, (v) => {
      s.video.aspect_ratio = v; s.ar_source = "manual";
      const pList = LTX_PRESETS[v] || LTX_PRESETS["16:9"];
      const p = pList[0];
      s.video.width = p.w; s.video.height = p.h; s.video.res_preset = p.label; s.video.mp = parseFloat(calcMP(p.w, p.h));
      sync(); rerender();
    });
  });
  if (hasImage) {
    arSel.style.opacity = "0.8";
    arSel.style.cursor = "default";
    arSel.title = "Aspect ratio is locked to the uploaded image. Remove image to change.";
  }
  const arBadge = document.createElement("span");
  arBadge.className = `ds-sensei-ar-badge ${hasImage ? "auto" : (s.ar_source === "auto" ? "auto" : "manual")}`;
  arBadge.textContent = hasImage ? "🔒 Locked" : (s.ar_source === "auto" ? "Auto" : "Manual");
  if (hasImage) arBadge.title = "Aspect ratio is locked to the uploaded image";
  arRow.append(arSel, arBadge); vidSec.body.appendChild(arRow);

  // Size mode Res/MP
  const sizeRow = mkrow("Size");
  const seg = document.createElement("div"); seg.className = "ds-sensei-segmented";
  seg.append(
    mkBtn("Res", s.video.size_mode === "res" ? "active" : "", () => { s.video.size_mode = "res"; sync(); rerender(); }),
    mkBtn("MP", s.video.size_mode === "mp" ? "active" : "", () => { s.video.size_mode = "mp"; sync(); rerender(); })
  );

  let sizeSel;
  let mpBadge = null;
  let mpSt = null;

  if (s.video.size_mode === "res") {
    const rawPresets = LTX_PRESETS[s.video.aspect_ratio] || LTX_PRESETS["16:9"];
    const origDims = getOriginalDims(s);
    let pList = [...rawPresets];
    if (origDims) {
      pList = [origDims, ...rawPresets.filter((p) => !(p.w === origDims.w && p.h === origDims.h))];
    }
    const currentPreset = pList.find((p) => p.label === s.video.res_preset || (p.w === s.video.width && p.h === s.video.height));
    const dispText = currentPreset?.label || (s.video.res_preset ? s.video.res_preset : `${s.video.width} × ${s.video.height}`);

    sizeSel = selDiv(dispText, () => {
      openMenu(sizeSel, pList.map((p) => p.label), dispText, (v) => {
        const found = pList.find((p) => p.label === v);
        if (found) {
          s.video.width = found.w;
          s.video.height = found.h;
          s.video.res_preset = found.label;
          s.video.mp = parseFloat(calcMP(found.w, found.h));
        }
        sync();
        rerender();
      });
    });
    mpBadge = document.createElement("span");
    mpBadge.className = "ds-sensei-ar-badge manual";
    mpBadge.style.cssText = "font-variant-numeric: tabular-nums; min-width: 58px; text-align: center;";
    mpBadge.textContent = `${calcMP(s.video.width, s.video.height)} MP`;
    sizeRow.append(seg, sizeSel, mpBadge);
  } else {
    const curMP = parseFloat(s.video.mp || calcMP(s.video.width, s.video.height)) || 0.92;
    const dispMP = `${Number(s.video.mp_preset || curMP).toFixed(2)} MP`;
    sizeSel = selDiv(dispMP, () => {
      openMenu(sizeSel, MP_PRESETS.map((m) => m.label), dispMP, (v) => {
        const found = MP_PRESETS.find((m) => m.label === v);
        if (found) {
          s.video.mp_preset = found.mp;
          s.video.mp = found.mp;
          const d = dimsFromMP(found.mp, s.video.aspect_ratio);
          s.video.width = d.w;
          s.video.height = d.h;
          sync();
          rerender();
        }
      });
    });
    mpSt = mkStepper({
      value: curMP,
      min: 0.1,
      max: 16.0,
      step: 0.05,
      decimals: 2,
      width: "78px",
      onChange: (v) => {
        if (!v || v <= 0) return;
        s.video.mp = v;
        s.video.mp_preset = v;
        const d = dimsFromMP(v, s.video.aspect_ratio);
        s.video.width = d.w;
        s.video.height = d.h;
        sync();
        rerender();
      },
    });
    sizeRow.append(seg, sizeSel, mpSt.wrap);
  }
  vidSec.body.appendChild(sizeRow);

  // Width (slot 5)
  const widthRow = mkrow("Width");
  anchorEls[OUT.width] = widthRow;
  const wSt = mkStepper({
    value: s.video.width || 1280, step: 32, min: 64, max: 8192, decimals: 0, width: "100%",
    onChange: (v) => {
      s.video.width = v;
      const newMP = parseFloat(calcMP(v, s.video.height));
      s.video.mp = newMP;
      if (mpBadge) mpBadge.textContent = `${newMP.toFixed(2)} MP`;
      if (mpSt) mpSt.setValue(newMP);
      sync();
    },
  });
  widthRow.appendChild(wSt.wrap);
  vidSec.body.appendChild(widthRow);

  // Height (slot 6)
  const heightRow = mkrow("Height");
  anchorEls[OUT.height] = heightRow;
  const hSt = mkStepper({
    value: s.video.height || 720, step: 32, min: 64, max: 8192, decimals: 0, width: "100%",
    onChange: (v) => {
      s.video.height = v;
      const newMP = parseFloat(calcMP(s.video.width, v));
      s.video.mp = newMP;
      if (mpBadge) mpBadge.textContent = `${newMP.toFixed(2)} MP`;
      if (mpSt) mpSt.setValue(newMP);
      sync();
    },
  });
  heightRow.appendChild(hSt.wrap);
  vidSec.body.appendChild(heightRow);

  const hwDiv = document.createElement("div"); hwDiv.className = "ds-sensei-hw-container";
  if (s.hardware) renderHW(hwDiv, s);
  vidSec.body.appendChild(hwDiv);

  // Duration (slot 7)
  const durRow = mkrow("Duration"); anchorEls[OUT.duration] = durRow;
  const dGrp = document.createElement("div"); dGrp.className = "ds-sensei-btn-group";
  DURATION_PRESETS.forEach((d) => dGrp.appendChild(mkBtn(String(d), s.video.duration === d ? "active" : "", () => { s.video.duration = d; sync(); rerender(); })));
  const isCustomDur = !DURATION_PRESETS.includes(s.video.duration);
  const durSt = mkStepper({
    value: isCustomDur ? s.video.duration : "",
    placeholder: "Custom",
    fallbackValue: s.video.duration,
    step: 0.5,
    min: 0.5,
    decimals: 1,
    width: null,
    onChange: (v) => { if (v && v > 0) { s.video.duration = v; sync(); rerender(); } }
  });
  if (isCustomDur) durSt.wrap.classList.add("active");
  dGrp.appendChild(durSt.wrap);
  durRow.appendChild(dGrp); vidSec.body.appendChild(durRow);

  // FPS (slot 8)
  const fpsRow = mkrow("FPS"); anchorEls[OUT.fps] = fpsRow;
  const fGrp = document.createElement("div"); fGrp.className = "ds-sensei-btn-group";
  FPS_PRESETS.forEach((f) => fGrp.appendChild(mkBtn(String(f), s.video.fps === f ? "active" : "", () => { s.video.fps = f; sync(); rerender(); })));
  const isCustomFps = !FPS_PRESETS.includes(s.video.fps);
  const fpsSt = mkStepper({
    value: isCustomFps ? s.video.fps : "",
    placeholder: "Custom",
    fallbackValue: s.video.fps,
    step: 1,
    min: 1,
    decimals: 0,
    width: null,
    onChange: (v) => { if (v && v > 0) { s.video.fps = v; sync(); rerender(); } }
  });
  if (isCustomFps) fpsSt.wrap.classList.add("active");
  fGrp.appendChild(fpsSt.wrap);
  fpsRow.appendChild(fGrp); vidSec.body.appendChild(fpsRow);
  root.appendChild(vidSec.el);

  // Hardware check
  let _hwTimer; clearTimeout(_hwTimer);
  _hwTimer = setTimeout(async () => { const hw = await getHW(); if (!hw) return; s.hardware = hw; sync(); renderHW(hwDiv, s); }, 600);

  // ── SCENE NOTES
  const notesSec = mksec("Scene Notes");
  const notesTA = document.createElement("textarea"); notesTA.className = "ds-sensei-textarea ds-sensei-notes-area";
  notesTA.placeholder = "Describe what you want. Uploaded image is analyzed automatically.";
  notesTA.value = s.scene_notes || "";
  if (s.notes_height) notesTA.style.height = s.notes_height;
  notesTA.oninput = () => { s.scene_notes = notesTA.value; sync(); };

  let _skipNotesInit = true;
  if (window.ResizeObserver) {
    const notesRo = new ResizeObserver(() => {
      if (_skipNotesInit) {
        _skipNotesInit = false;
        return;
      }
      if (notesTA.style.height && notesTA.style.height !== s.notes_height) {
        s.notes_height = notesTA.style.height;
        sync();
        fitNode(node);
        scheduleAlign(node);
      }
    });
    notesRo.observe(notesTA);
  }

  notesTA.addEventListener("pointerdown", () => {
    const onEnd = () => {
      window.removeEventListener("pointerup", onEnd, true);
      window.removeEventListener("mouseup", onEnd, true);
      if (notesTA.style.height && notesTA.style.height !== s.notes_height) {
        s.notes_height = notesTA.style.height;
        sync();
        fitNode(node);
        scheduleAlign(node);
      }
    };
    window.addEventListener("pointerup", onEnd, true);
    window.addEventListener("mouseup", onEnd, true);
  });
  notesSec.body.appendChild(notesTA);
  const notesBar = document.createElement("div"); notesBar.style.cssText = "display:flex;gap:6px;width:100%;margin-top:2px;";
  const isAutoUnload = Boolean(s.lm_studio?.unload_after_run ?? s.auto_unload);
  notesBar.append(
    mkBtn("System Prompt", "", () => openSysPromptModal(s.system_prompt, (v) => { s.system_prompt = v; sync(); })),
    mkBtn("Kill LLM", "ds-sensei-btn-danger", async () => {
      try {
        await fetch("/ds/prompt_sensei/kill", { method: "POST" });
        s.status = "cancelled";
        sync();
        rerender();
      } catch (_) {}
    }),
    mkBtn(isAutoUnload ? "Auto Unload ✓" : "Auto Unload", isAutoUnload ? "active" : "", function () {
      const next = !Boolean(s.lm_studio?.unload_after_run ?? s.auto_unload);
      s.auto_unload = next;
      if (!s.lm_studio) s.lm_studio = { ...defaultState().lm_studio };
      s.lm_studio.unload_after_run = next;
      this.textContent = next ? "Auto Unload ✓" : "Auto Unload";
      this.className = `ds-sensei-btn ${next ? "active" : ""}`;
      sync();
    })
  );
  notesSec.body.appendChild(notesBar);
  root.appendChild(notesSec.el);

  // ── GENERATED PROMPT (slot 9)
  const genSec = mksec("Generated Prompt");
  anchorEls[OUT.prompt] = genSec.hdr;
  if (s.image_path) {
    const ind = document.createElement("span"); ind.className = "ds-sensei-img-prompt-indicator"; ind.textContent = "🖼 Image-informed";
    genSec.hdr.querySelector(".ds-sensei-section-header").appendChild(ind);
  }

  // Error Banner
  if (s.error_msg) {
    const errBox = document.createElement("div");
    errBox.className = "ds-sensei-error-banner";
    const parts = String(s.error_msg).split("\n");
    const errTitle = parts[0] || "Generation Error";
    const errSub = parts.slice(1).join("\n");

    const errTextDiv = document.createElement("div");
    errTextDiv.className = "ds-sensei-error-text";
    errTextDiv.innerHTML = `<strong>⚠️ ${errTitle}</strong>${errSub ? `<span class="ds-sensei-error-sub">${errSub}</span>` : ""}`;
    errBox.appendChild(errTextDiv);

    const errActions = document.createElement("div");
    errActions.className = "ds-sensei-error-actions";

    if (errTitle.includes("LM Studio unavailable")) {
      const startBtn = mkBtn("🚀 Start Server", "ds-sensei-btn-sm active", async () => {
        startBtn.textContent = "Starting...";
        startBtn.disabled = true;
        try {
          const r = await fetch("/ds/prompt_sensei/start_lm_server", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ port: s.lm_studio?.port || 1234 }),
          });
          const d = await r.json();
          if (d.ok) {
            s.error_msg = null;
            await fetchLMStudioModels(s.lm_studio?.ip, s.lm_studio?.port);
          } else {
            s.error_msg = `LM Studio start failed\n${d.message || d.error || "Please launch LM Studio manually"}`;
          }
        } catch (e) {
          s.error_msg = `Error starting server\n${e?.message}`;
        }
        sync();
        rerender();
      });

      const retryBtn = mkBtn("Retry Connection", "ds-sensei-btn-sm", async () => {
        const res = await fetchLMStudioModels(s.lm_studio?.ip, s.lm_studio?.port);
        if (res.ok) {
          s.error_msg = null;
        }
        sync();
        rerender();
      });
      errActions.append(startBtn, retryBtn);
    } else if (errTitle.includes("Model unavailable")) {
      const gearBtn = mkBtn("⚙ Settings", "ds-sensei-btn-sm", (e) => {
        openSenseiGearConfig(node, e.currentTarget || errBox);
      });
      const reloadBtn = mkBtn("Reload Models", "ds-sensei-btn-sm", async () => {
        const res = await fetchLMStudioModels(s.lm_studio?.ip, s.lm_studio?.port);
        if (res.ok && s.lm_studio?.model && res.models?.includes(s.lm_studio.model)) {
          s.error_msg = null;
        }
        sync();
        rerender();
      });
      errActions.append(gearBtn, reloadBtn);
    } else {
      const dismissBtn = mkBtn("Dismiss", "ds-sensei-btn-sm", () => {
        s.error_msg = null;
        sync();
        rerender();
      });
      errActions.appendChild(dismissBtn);
    }
    errBox.appendChild(errActions);
    genSec.body.appendChild(errBox);
  }

  const promptTA = document.createElement("textarea"); promptTA.className = "ds-sensei-textarea ds-sensei-prompt-area";
  promptTA.placeholder = "Generated prompt. Edit freely before clicking Continue.";
  promptTA.value = s.generated_prompt || "";
  if (s.prompt_height) promptTA.style.height = s.prompt_height;
  promptTA.oninput = () => { s.generated_prompt = promptTA.value; sync(); };

  let _skipPromptInit = true;
  if (window.ResizeObserver) {
    const promptRo = new ResizeObserver(() => {
      if (_skipPromptInit) {
        _skipPromptInit = false;
        return;
      }
      if (promptTA.style.height && promptTA.style.height !== s.prompt_height) {
        s.prompt_height = promptTA.style.height;
        sync();
        fitNode(node);
        scheduleAlign(node);
      }
    });
    promptRo.observe(promptTA);
  }

  promptTA.addEventListener("pointerdown", () => {
    const onEnd = () => {
      window.removeEventListener("pointerup", onEnd, true);
      window.removeEventListener("mouseup", onEnd, true);
      if (promptTA.style.height && promptTA.style.height !== s.prompt_height) {
        s.prompt_height = promptTA.style.height;
        sync();
        fitNode(node);
        scheduleAlign(node);
      }
    };
    window.addEventListener("pointerup", onEnd, true);
    window.addEventListener("mouseup", onEnd, true);
  });
  genSec.body.appendChild(promptTA);

  const statBar = document.createElement("div"); statBar.className = "ds-sensei-status-bar";
  let statLabel = (s.status || "idle").toUpperCase();
  if (s.status === "generating") statLabel = "Generating prompt...";
  else if (s.status === "paused") statLabel = "PAUSED · READY";
  const statTag = document.createElement("span");
  statTag.className = `ds-sensei-status-tag ds-sensei-status-${s.status || "idle"}`;
  statTag.textContent = statLabel;
  const wc = document.createElement("span"); wc.textContent = `${(s.generated_prompt || "").trim().split(/\s+/).filter(Boolean).length} words`;
  statBar.append(statTag, wc); genSec.body.appendChild(statBar);

  const actRow = document.createElement("div"); actRow.style.cssText = "display:flex;gap:8px;width:100%;margin-top:4px;";
  const rerollBtn = document.createElement("button"); rerollBtn.type = "button"; rerollBtn.className = "ds-sensei-btn";
  rerollBtn.style.cssText = "flex:1;min-width:0;height:32px;font-size:12px;";
  rerollBtn.textContent = s.status === "generating" ? "Generating..." : "🎲 Reroll";
  rerollBtn.disabled = s.status === "generating";
  rerollBtn.onclick = async () => {
    s.status = "generating";
    s.error_msg = null;
    if (s.lm_studio?.randomize_seed !== false) {
      s.lm_studio.seed = Math.floor(Math.random() * 2147483647);
    }
    sync();
    statTag.className = "ds-sensei-status-tag ds-sensei-status-generating";
    statTag.textContent = "Generating prompt...";
    rerollBtn.disabled = true;
    rerollBtn.textContent = "Generating...";
    try {
      const r = await fetch("/ds/prompt_sensei/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scene_notes: s.scene_notes,
          system_prompt: s.system_prompt,
          image_path: s.image_path,
          auto_unload: Boolean(s.lm_studio?.unload_after_run ?? s.auto_unload),
          lm_studio: s.lm_studio,
          context: {
            aspect_ratio: s.video.aspect_ratio,
            width: s.video.width,
            height: s.video.height,
            duration: s.video.duration,
            fps: s.video.fps,
            models: s.models,
            has_image: Boolean(s.image_path)
          }
        }),
      });
      if (r.ok) {
        const d = await r.json();
        if (d.status === "cancelled") {
          s.status = "cancelled";
        } else if (d.status === "failed") {
          s.status = "failed";
          s.error_msg = d.error || "Generation failed";
        } else {
          s.generated_prompt = d.prompt || "";
          s.status = "completed";
          s.error_msg = null;
          if (d.seed !== undefined && d.seed !== null) {
            s.lm_studio.seed = d.seed;
          }
          s.telemetry = {
            tokens: d.tokens || 0,
            speed: d.speed || 0,
            elapsed: d.elapsed || 0,
            model: d.model || s.lm_studio?.model || "LM Studio"
          };
        }
      } else {
        s.status = "failed";
        s.error_msg = "Server error generating prompt";
      }
    } catch (e) {
      s.status = "failed";
      s.error_msg = e?.message || "Generation error";
    }
    sync();
    rerender();
  };

  const isExecutingWorkflow = _isSenseiExecuting || s.status === "generating";
  const continueBtn = document.createElement("button");
  continueBtn.type = "button";
  continueBtn.style.cssText = "flex:1;min-width:0;height:32px;font-size:12px;";

  if (isExecutingWorkflow) {
    continueBtn.className = "ds-sensei-btn ds-sensei-btn-danger";
    continueBtn.textContent = "⏹ Abort";
    continueBtn.title = "Stop the running ComfyUI workflow and LLM generation";
    continueBtn.onclick = async () => {
      continueBtn.disabled = true;
      continueBtn.textContent = "Aborting...";
      try { await fetch("/interrupt", { method: "POST" }); } catch (_) {}
      try { await fetch("/ds/prompt_sensei/kill", { method: "POST" }); } catch (_) {}
      _isSenseiExecuting = false;
      s.status = "cancelled";
      sync();
      rerender();
    };
  } else {
    continueBtn.className = "ds-sensei-btn ds-sensei-btn-continue";
    continueBtn.textContent = "Continue ➔";
    continueBtn.title = "Apply edited prompt and continue workflow";
    continueBtn.onclick = async () => {
      continueBtn.disabled = true;
      const origText = continueBtn.textContent;
      continueBtn.textContent = "Queueing...";
      try {
        s.generated_prompt = promptTA.value.trim();
        if (notesTA) {
          if (notesTA.value !== undefined) s.scene_notes = notesTA.value;
          if (notesTA.style.height) s.notes_height = notesTA.style.height;
        }
        if (promptTA.style.height) s.prompt_height = promptTA.style.height;
        sync();
        app.graph?.setDirtyCanvas?.(true, true);
        await resumeSenseiWorkflow(node);
      } catch (e) {
        console.error("[Sensei] Continue button error:", e);
      } finally {
        setTimeout(() => {
          continueBtn.disabled = false;
          continueBtn.textContent = origText;
        }, 800);
      }
    };
  }

  actRow.append(rerollBtn, continueBtn); genSec.body.appendChild(actRow);
  root.appendChild(genSec.el);
}

// ---------------------------------------------------------------------------
// Extension registration
// ---------------------------------------------------------------------------
app.registerExtension({
  name: "DeathshotArsenal.AIPromptSensei",

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== NODE_TYPE) return;

    const origCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      origCreated?.apply(this, arguments);
      loadCSS();
      registerGearMenu();
      installSenseiQueueHooks();

      this.widgets_start_y = 2;
      this.resizable = true;
      this.shape = LiteGraph.ROUND_SHAPE;
      this.min_size = [MIN_W, MIN_H];
      if (!this.size || this.size[0] < MIN_W || this.size[1] < MIN_H) {
        this.size = [DEFAULT_W, DEFAULT_H];
      }
      this.computeSize = function () {
        const contentH = Math.ceil(this._domRoot?.offsetHeight || this._domRoot?.scrollHeight || 0);
        return [MIN_W, Math.max(MIN_H, contentH > 0 ? contentH + 16 : DEFAULT_H)];
      };
      this.properties = this.properties || {};
      this.serialize_widgets = true;
      this._sstate = defaultState();

      if (this.outputs) {
        for (let i = 0; i < this.outputs.length; i++) {
          if (this.outputs[i]) {
            this.outputs[i].label = " ";
            this.outputs[i].pos = [this.size[0], 40 + i * 30];
          }
        }
      }

      this.widgets = this.widgets || [];
      let hw = this.widgets.find((w) => w.name === "SenseiState");
      if (!hw) { hw = { name: "SenseiState", type: "hidden", value: "{}", serialize: true, computeSize: () => [0, -4], draw: () => {} }; this.widgets.push(hw); }
      hw.type = "hidden"; hw.hidden = true; hw.computeSize = () => [0, -4]; hw.draw = () => {};

      const root = buildRoot(this);
      this._domRoot = root;
      this._senseiWidget = this.addDOMWidget("sensei_ui", "custom", root, { serialize: false, hideOnZoom: false, margin: 10, getValue: () => null, setValue: () => {} });
      this._senseiWidget.computeSize = () => [this.size?.[0] || DEFAULT_W, Math.max(100, (this.size?.[1] || DEFAULT_H) - 16)];

      normalizeDSWidgetHost(root, this, { shell: true });
      protectDSResizeCorners(this);

      this.getConnectionPos = function (is_input, slot_number, out) {
        out = out || new Float32Array(2);
        if (this.flags?.collapsed) {
          return LiteGraph.LGraphNode.prototype.getConnectionPos.apply(this, arguments);
        }
        if (!is_input && this.outputs?.[slot_number]) {
          const slot = this.outputs[slot_number];
          const nx = this.size[0];
          if (slot.pos && Number.isFinite(slot.pos[1])) {
            out[0] = this.pos[0] + nx;
            out[1] = this.pos[1] + slot.pos[1];
            return out;
          }
          if (this._anchorEls?.[slot_number]) {
            const ny = getElementCenterY(this, this._anchorEls[slot_number]);
            if (Number.isFinite(ny)) {
              out[0] = this.pos[0] + nx;
              out[1] = this.pos[1] + ny;
              return out;
            }
          }
        }
        return LiteGraph.LGraphNode.prototype.getConnectionPos.apply(this, arguments);
      };

      try { window.DSGlobalTheme?.applyNodeBase?.(this); } catch (_) {}
      getCatalog().then(() => {
        this._renderUI?.();
        fitNode(this);
        scheduleAlign(this);
      });
      fitNode(this);
      watchAlign(this);
      scheduleAlign(this);
    };

    const origConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function (info) {
      origConfigure?.apply(this, arguments);
      this.widgets_start_y = 2;
      this.shape = LiteGraph.ROUND_SHAPE;
      this.min_size = [MIN_W, MIN_H];
      if (!this.size || this.size[0] < MIN_W || this.size[1] < MIN_H) {
        this.size = [DEFAULT_W, DEFAULT_H];
      }
      this.computeSize = function () {
        const contentH = Math.ceil(this._domRoot?.offsetHeight || this._domRoot?.scrollHeight || 0);
        return [MIN_W, Math.max(MIN_H, contentH > 0 ? contentH + 16 : DEFAULT_H)];
      };
      if (this._senseiWidget) {
        this._senseiWidget.computeSize = () => [this.size?.[0] || DEFAULT_W, Math.max(100, (this.size?.[1] || DEFAULT_H) - 16)];
      }
      if (this.outputs) {
        for (let i = 0; i < this.outputs.length; i++) {
          if (this.outputs[i]) {
            this.outputs[i].label = " ";
            this.outputs[i].pos = [this.size[0], 40 + i * 30];
          }
        }
      }
      let raw = info?.properties?.ds_sensei_state;
      if (!raw && info?.widgets_values && Array.isArray(this.widgets)) {
        const idx = this.widgets.findIndex((w) => w.name === "SenseiState");
        if (idx !== -1 && info.widgets_values[idx]) {
          raw = info.widgets_values[idx];
        }
      }
      if (!raw) {
        raw = this.widgets?.find((w) => w.name === "SenseiState")?.value;
      }
      if (raw) {
        try {
          const loaded = typeof raw === "string" ? JSON.parse(raw) : raw;
          if (loaded && typeof loaded === "object") {
            this._sstate = {
              ...defaultState(),
              ...loaded,
              video: { ...defaultState().video, ...(loaded.video || {}) },
              models: { ...defaultState().models, ...(loaded.models || {}) },
              lm_studio: { ...defaultState().lm_studio, ...(loaded.lm_studio || {}) },
              telemetry: { ...defaultState().telemetry, ...(loaded.telemetry || {}) },
            };
            if (loaded.notes_height) this._sstate.notes_height = loaded.notes_height;
            if (loaded.prompt_height) this._sstate.prompt_height = loaded.prompt_height;
            if (Array.isArray(loaded.loras)) {
              this._sstate.loras = loaded.loras.map((lora) => ({
                name: lora.name || "",
                strength: lora.strength !== undefined ? lora.strength : 1.0,
                enabled: lora.enabled !== false,
              }));
            }
            if (!this._sstate.video.size_mode) this._sstate.video.size_mode = "res";
            if (!LTX_PRESETS[this._sstate.video?.aspect_ratio]) this._sstate.video.aspect_ratio = "16:9";
          }
        } catch (e) {
          console.error("[Sensei] Error parsing configure state:", e);
        }
      }
      try { window.DSGlobalTheme?.applyNodeBase?.(this); } catch (_) {}
      this._syncState?.();
      this._renderUI?.();
      fitNode(this);
      watchAlign(this);
      scheduleAlign(this);
    };

    const origExtraMenu = nodeType.prototype.getExtraMenuOptions;
    nodeType.prototype.getExtraMenuOptions = function (_, options) {
      origExtraMenu?.apply(this, arguments);
      options.push({
        content: "⚙ LM Studio & Sensei Settings",
        callback: () => {
          openSenseiGearConfig(this, null);
        },
      });
    };

    const origResize = nodeType.prototype.onResize;
    nodeType.prototype.onResize = function (size) {
      size[0] = Math.max(MIN_W, size[0]);
      size[1] = Math.max(MIN_H, size[1]);
      origResize?.apply(this, arguments);
      alignOutputs(this);
      scheduleAlign(this);
    };

    const origArrange = nodeType.prototype.arrange;
    nodeType.prototype.arrange = function () {
      alignOutputs(this);
      return origArrange?.apply(this, arguments);
    };

    const origRemoved = nodeType.prototype.onRemoved;
    nodeType.prototype.onRemoved = function () {
      origRemoved?.apply(this, arguments);
      unwatchAlign(this);
      this._senseiRo?.disconnect?.();
      this._domRoot?.remove();
    };

    const origExecuted = nodeType.prototype.onExecuted;
    nodeType.prototype.onExecuted = function (output) {
      origExecuted?.apply(this, arguments);
      const promptText = output?.prompt?.[0];
      if (promptText) {
        this._sstate.generated_prompt = promptText;
        const newSpeed = output.speed?.[0];
        const newElapsed = output.elapsed?.[0];
        if (newSpeed && newElapsed) {
          this._sstate.telemetry = {
            tokens: output.tokens?.[0] || this._sstate.telemetry?.tokens || 0,
            speed: newSpeed,
            elapsed: newElapsed,
            model: output.model?.[0] || this._sstate.telemetry?.model || "LM Studio"
          };
        }
        this._sstate.status = "completed";
        this._sstate.error_msg = null;
        this._syncState?.();
        this._renderUI?.();
      }
    };

    const origSerialize = nodeType.prototype.serialize;
    nodeType.prototype.serialize = function () {
      this._syncState?.();
      const o = origSerialize?.apply(this, arguments) || {};
      o.properties = o.properties || {};
      o.properties.ds_sensei_state = JSON.parse(JSON.stringify(this._sstate));
      if (o.widgets_values && Array.isArray(this.widgets)) {
        const idx = this.widgets.findIndex((w) => w.name === "SenseiState");
        if (idx !== -1) {
          o.widgets_values[idx] = JSON.stringify(this._sstate);
        }
      }
      if (o?.outputs) {
        for (const out of o.outputs) {
          if (out) delete out.pos;
        }
      }
      return o;
    };
  },

  async setup() {
    registerGearMenu();
    installSenseiQueueHooks();
  },
});
