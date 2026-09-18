// Deathshot Arsenal — DS Generation Hub Frontend
import { app } from "/scripts/app.js";
import { protectDSResizeCorners, normalizeDSWidgetHost } from "../Shared/ds_ui_system.js";

const NODE_TYPE = "DS_GenerationHub";
const DEFAULT_W = 390;
const DEFAULT_H = 670;
const MIN_W = 320;
const MIN_H = 220;

const CSS_HREF = "/extensions/DeathshotArsenal/Generation%20Hub/ds_generation_hub.css";
if (!document.querySelector(`link[href="${CSS_HREF}"]`)) {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = CSS_HREF;
  document.head.appendChild(link);
}

const DEFAULT_ASPECT_RATIOS = [
  { name: "1:1", w: 1, h: 1 },
  { name: "4:3", w: 4, h: 3 },
  { name: "3:4", w: 3, h: 4 },
  { name: "16:9", w: 16, h: 9 },
  { name: "9:16", w: 9, h: 16 },
  { name: "21:9", w: 21, h: 9 },
  { name: "9:21", w: 9, h: 21 },
  { name: "32:9", w: 32, h: 9 },
  { name: "9:32", w: 9, h: 32 },
  { name: "5:4", w: 5, h: 4 },
  { name: "4:5", w: 4, h: 5 },
  { name: "3:2", w: 3, h: 2 },
  { name: "2:3", w: 2, h: 3 },
];

const DEFAULT_CATEGORIZED_RES_PRESETS = [
  {
    category: "Square",
    items: [
      { label: "768 × 768", w: 768, h: 768, ar: "1:1" },
      { label: "832 × 832", w: 832, h: 832, ar: "1:1" },
      { label: "896 × 896", w: 896, h: 896, ar: "1:1" },
      { label: "1024 × 1024", w: 1024, h: 1024, ar: "1:1" },
      { label: "1152 × 1152", w: 1152, h: 1152, ar: "1:1" },
      { label: "1280 × 1280", w: 1280, h: 1280, ar: "1:1" },
      { label: "1536 × 1536", w: 1536, h: 1536, ar: "1:1" },
      { label: "2048 × 2048", w: 2048, h: 2048, ar: "1:1" },
    ],
  },
  {
    category: "Landscape — 4:3",
    items: [
      { label: "1024 × 768", w: 1024, h: 768, ar: "4:3" },
      { label: "1152 × 864", w: 1152, h: 864, ar: "4:3" },
      { label: "1280 × 960", w: 1280, h: 960, ar: "4:3" },
      { label: "1440 × 1080", w: 1440, h: 1080, ar: "4:3" },
      { label: "1536 × 1152", w: 1536, h: 1152, ar: "4:3" },
      { label: "1600 × 1200", w: 1600, h: 1200, ar: "4:3" },
      { label: "2048 × 1536", w: 2048, h: 1536, ar: "4:3" },
    ],
  },
  {
    category: "Portrait — 3:4",
    items: [
      { label: "768 × 1024", w: 768, h: 1024, ar: "3:4" },
      { label: "864 × 1152", w: 864, h: 1152, ar: "3:4" },
      { label: "960 × 1280", w: 960, h: 1280, ar: "3:4" },
      { label: "1080 × 1440", w: 1080, h: 1440, ar: "3:4" },
      { label: "1152 × 1536", w: 1152, h: 1536, ar: "3:4" },
      { label: "1200 × 1600", w: 1200, h: 1600, ar: "3:4" },
      { label: "1536 × 2048", w: 1536, h: 2048, ar: "3:4" },
    ],
  },
  {
    category: "Widescreen — 16:9",
    items: [
      { label: "1366 × 768", w: 1366, h: 768, ar: "16:9" },
      { label: "1536 × 864", w: 1536, h: 864, ar: "16:9" },
      { label: "1600 × 900", w: 1600, h: 900, ar: "16:9" },
      { label: "1920 × 1080", w: 1920, h: 1080, ar: "16:9" },
      { label: "2048 × 1152", w: 2048, h: 1152, ar: "16:9" },
      { label: "2560 × 1440", w: 2560, h: 1440, ar: "16:9" },
      { label: "3840 × 2160", w: 3840, h: 2160, ar: "16:9" },
    ],
  },
  {
    category: "Portrait Widescreen — 9:16",
    items: [
      { label: "768 × 1366", w: 768, h: 1366, ar: "9:16" },
      { label: "864 × 1536", w: 864, h: 1536, ar: "9:16" },
      { label: "900 × 1600", w: 900, h: 1600, ar: "9:16" },
      { label: "1080 × 1920", w: 1080, h: 1920, ar: "9:16" },
      { label: "1152 × 2048", w: 1152, h: 2048, ar: "9:16" },
      { label: "1440 × 2560", w: 1440, h: 2560, ar: "9:16" },
      { label: "2160 × 3840", w: 2160, h: 3840, ar: "9:16" },
    ],
  },
  {
    category: "Cinematic — 21:9",
    items: [
      { label: "1792 × 768", w: 1792, h: 768, ar: "21:9" },
      { label: "1920 × 864", w: 1920, h: 864, ar: "21:9" },
      { label: "2048 × 896", w: 2048, h: 896, ar: "21:9" },
      { label: "2560 × 1080", w: 2560, h: 1080, ar: "21:9" },
      { label: "3440 × 1440", w: 3440, h: 1440, ar: "21:9" },
      { label: "3840 × 1600", w: 3840, h: 1600, ar: "21:9" },
    ],
  },
  {
    category: "Cinematic Portrait — 9:21",
    items: [
      { label: "768 × 1792", w: 768, h: 1792, ar: "9:21" },
      { label: "864 × 2016", w: 864, h: 2016, ar: "9:21" },
      { label: "896 × 2048", w: 896, h: 2048, ar: "9:21" },
      { label: "1080 × 2560", w: 1080, h: 2560, ar: "9:21" },
      { label: "1440 × 3360", w: 1440, h: 3360, ar: "9:21" },
      { label: "1600 × 3840", w: 1600, h: 3840, ar: "9:21" },
    ],
  },
  {
    category: "Ultra-Wide — 32:9",
    items: [
      { label: "2560 × 768", w: 2560, h: 768, ar: "32:9" },
      { label: "2880 × 864", w: 2880, h: 864, ar: "32:9" },
      { label: "3200 × 900", w: 3200, h: 900, ar: "32:9" },
      { label: "3840 × 1080", w: 3840, h: 1080, ar: "32:9" },
      { label: "5120 × 1440", w: 5120, h: 1440, ar: "32:9" },
    ],
  },
  {
    category: "Ultra-Wide Portrait — 9:32",
    items: [
      { label: "768 × 2560", w: 768, h: 2560, ar: "9:32" },
      { label: "864 × 3072", w: 864, h: 3072, ar: "9:32" },
      { label: "900 × 3200", w: 900, h: 3200, ar: "9:32" },
      { label: "1080 × 3840", w: 1080, h: 3840, ar: "9:32" },
      { label: "1440 × 5120", w: 1440, h: 5120, ar: "9:32" },
    ],
  },
  {
    category: "Classic — 5:4",
    items: [
      { label: "960 × 768", w: 960, h: 768, ar: "5:4" },
      { label: "1280 × 1024", w: 1280, h: 1024, ar: "5:4" },
      { label: "1600 × 1280", w: 1600, h: 1280, ar: "5:4" },
      { label: "1920 × 1536", w: 1920, h: 1536, ar: "5:4" },
      { label: "2560 × 2048", w: 2560, h: 2048, ar: "5:4" },
    ],
  },
  {
    category: "Portrait — 4:5",
    items: [
      { label: "768 × 960", w: 768, h: 960, ar: "4:5" },
      { label: "1024 × 1280", w: 1024, h: 1280, ar: "4:5" },
      { label: "1280 × 1600", w: 1280, h: 1600, ar: "4:5" },
      { label: "1536 × 1920", w: 1536, h: 1920, ar: "4:5" },
      { label: "2048 × 2560", w: 2048, h: 2560, ar: "4:5" },
    ],
  },
  {
    category: "Social Portrait — 2:3",
    items: [
      { label: "768 × 1152", w: 768, h: 1152, ar: "2:3" },
      { label: "864 × 1296", w: 864, h: 1296, ar: "2:3" },
      { label: "960 × 1440", w: 960, h: 1440, ar: "2:3" },
      { label: "1024 × 1536", w: 1024, h: 1536, ar: "2:3" },
      { label: "1280 × 1920", w: 1280, h: 1920, ar: "2:3" },
      { label: "1536 × 2304", w: 1536, h: 2304, ar: "2:3" },
    ],
  },
  {
    category: "Classic — 3:2",
    items: [
      { label: "1152 × 768", w: 1152, h: 768, ar: "3:2" },
      { label: "1296 × 864", w: 1296, h: 864, ar: "3:2" },
      { label: "1440 × 960", w: 1440, h: 960, ar: "3:2" },
      { label: "1536 × 1024", w: 1536, h: 1024, ar: "3:2" },
      { label: "1920 × 1280", w: 1920, h: 1280, ar: "3:2" },
      { label: "2304 × 1536", w: 2304, h: 1536, ar: "3:2" },
    ],
  },
];

const DEFAULT_MP_PRESETS = [
  { name: "0.75 MP", mp: 0.75 },
  { name: "1.0 MP", mp: 1.0 },
  { name: "1.5 MP", mp: 1.5 },
  { name: "2.0 MP", mp: 2.0 },
  { name: "3.0 MP", mp: 3.0 },
  { name: "4.0 MP", mp: 4.0 },
];

const STORAGE_KEYS = {
  AR: "ds_hub_aspect_ratios_v1",
  RES: "ds_hub_res_presets_v1",
  MP: "ds_hub_mp_presets_v1",
};

function getARPresets() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.AR);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (_) {}
  return JSON.parse(JSON.stringify(DEFAULT_ASPECT_RATIOS));
}

function saveARPresets(list) {
  try {
    localStorage.setItem(STORAGE_KEYS.AR, JSON.stringify(list));
  } catch (_) {}
}

function restoreDefaultARPresets() {
  try {
    localStorage.removeItem(STORAGE_KEYS.AR);
  } catch (_) {}
  return JSON.parse(JSON.stringify(DEFAULT_ASPECT_RATIOS));
}

function getResPresets() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.RES);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (_) {}
  return JSON.parse(JSON.stringify(DEFAULT_CATEGORIZED_RES_PRESETS));
}

function saveResPresets(list) {
  try {
    localStorage.setItem(STORAGE_KEYS.RES, JSON.stringify(list));
  } catch (_) {}
}

function restoreDefaultResPresets() {
  try {
    localStorage.removeItem(STORAGE_KEYS.RES);
  } catch (_) {}
  return JSON.parse(JSON.stringify(DEFAULT_CATEGORIZED_RES_PRESETS));
}

function getMPPresets() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.MP);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (_) {}
  return JSON.parse(JSON.stringify(DEFAULT_MP_PRESETS));
}

function saveMPPresets(list) {
  try {
    localStorage.setItem(STORAGE_KEYS.MP, JSON.stringify(list));
  } catch (_) {}
}

function restoreDefaultMPPresets() {
  try {
    localStorage.removeItem(STORAGE_KEYS.MP);
  } catch (_) {}
  return JSON.parse(JSON.stringify(DEFAULT_MP_PRESETS));
}

function findMatchingResPreset(w, h, resGroups) {
  for (const group of resGroups || []) {
    for (const item of group.items || []) {
      if (item.w === w && item.h === h) {
        return item;
      }
    }
  }
  return null;
}

function getResolutionDisplayLabel(w, h, resGroups) {
  const match = findMatchingResPreset(w, h, resGroups);
  if (match) {
    return match.label;
  }
  return `Custom — ${w} × ${h}`;
}

function findClosestAR(w, h, arList) {
  if (!w || !h || !arList?.length) return "1:1";
  const target = w / h;
  let best = arList[0].name;
  let minDiff = Infinity;
  for (const ar of arList) {
    const ratio = ar.w / ar.h;
    const diff = Math.abs(ratio - target);
    if (diff < minDiff) {
      minDiff = diff;
      best = ar.name;
    }
  }
  return best;
}

let _catalogCache = null;
async function fetchCatalog() {
  if (_catalogCache) return _catalogCache;
  try {
    const res = await fetch("/ds/generation_hub/catalog");
    if (res.ok) {
      _catalogCache = await res.json();
      return _catalogCache;
    }
  } catch (e) {
    console.warn("[DS Generation Hub] Failed to fetch catalog:", e);
  }
  return { models: [], clips: [], vaes: [], loras: [], attentions: ["Default", "SDPA (PyTorch Native)"] };
}

function defaultState() {
  return {
    section_order: ["models", "image_settings", "lora", "prompt"],
    model: "",
    clip: "Auto",
    vae: "Auto",
    attention: "Auto-Detect",
    aspect_ratio: "1:1",
    resolution_preset: "1024 × 1024",
    mp_preset: "1.0 MP",
    width: 1024,
    height: 1024,
    mp: 1.0,
    loras: [],
    prompt: "",
    prompt_height: 90,
  };
}

function getState(node) {
  if (!node._hubState) {
    node.properties = node.properties || {};
    let parsed = null;
    const hw = (node.widgets || []).find(w => w.name === "HubState");
    if (hw && hw.value) {
      try { parsed = JSON.parse(hw.value); } catch (_) {}
    }
    if (!parsed && node.properties.hub_state) {
      try {
        parsed = typeof node.properties.hub_state === "string" 
          ? JSON.parse(node.properties.hub_state) 
          : node.properties.hub_state;
      } catch (_) {}
    }
    node._hubState = Object.assign(defaultState(), parsed || {});
  }
  return node._hubState;
}

function saveState(node) {
  const s = getState(node);
  node.properties = node.properties || {};
  node.properties.hub_state = s;
  const hw = (node.widgets || []).find(w => w.name === "HubState");
  if (hw) {
    hw.value = JSON.stringify(s);
  }
  app.graph?.setDirtyCanvas?.(true, true);
}

// ---------------------------------------------------------------------------
// Architecture & Type Detection
// ---------------------------------------------------------------------------
function detectModelFamily(modelName) {
  const m = (modelName || "").toLowerCase();
  if (m.includes("krea")) return "krea2";
  if (m.includes("flux") || m.includes("klein") || m.includes("dev") || m.includes("schnell")) return "flux";
  if (m.includes("sdxl") || m.includes("xl_") || m.includes("_xl")) return "sdxl";
  if (m.includes("sd3") || m.includes("sd_3")) return "sd3";
  if (m.includes("wan")) return "wan";
  if (m.includes("ltx")) return "ltx";
  if (m.includes("hunyuan")) return "hunyuan";
  if (m.includes("v1-5") || m.includes("1.5") || m.includes("v1.5")) return "sd15";
  return "generic";
}

function getModelFamilyDetails(modelFamily) {
  switch (modelFamily) {
    case "krea2": return "Krea2";
    case "flux": return "FLUX.2 / DiT (Flow Matching)";
    case "sdxl": return "SDXL (Dual Cross-Attention)";
    case "sd3": return "SD3 / SD3.5 (MMDiT)";
    case "wan": return "Wan 2.1 Video / DiT";
    case "ltx": return "LTX-Video (DiT)";
    case "hunyuan": return "Hunyuan Video / DiT";
    case "sd15": return "SD 1.5 (U-Net)";
    default: return "Standard Diffusion Model";
  }
}

function getClipFamilyDetails(clipName, modelFamily) {
  if (clipName && clipName !== "Auto") {
    const low = clipName.toLowerCase();
    if (low.includes("krea") || (modelFamily === "krea2" && low.includes("qwen"))) return "Qwen3-VL (12-Layer / Krea2)";
    if (low.includes("t5")) return "T5-XXL Text Encoder";
    if (low.includes("clip_g")) return "CLIP-G OpenCLIP";
    if (low.includes("clip_l")) return "CLIP-L ViT";
    if (low.includes("umt5")) return "UMT5 Text Encoder";
    return clipName;
  }
  switch (modelFamily) {
    case "krea2": return "Qwen3-VL (12-Layer / Krea2)";
    case "flux": return "Dual Encoder (T5-XXL + CLIP-L)";
    case "sdxl": return "Dual CLIP (CLIP-L + CLIP-G)";
    case "sd3": return "Triple Encoder (T5 + CLIP-L + CLIP-G)";
    case "wan": return "UMT5 Text Encoder";
    case "ltx": return "T5-XXL Text Encoder";
    case "sd15": return "CLIP-L ViT";
    default: return "Auto-Detected Compatible CLIP";
  }
}

function detectAttentionType(modelFamily, catalog) {
  const available = catalog?.attentions || [];
  if (modelFamily === "krea2") {
    if (available.includes("Kitchen Attention")) return "Kitchen Attention";
    return "Kitchen Attention";
  }
  if (["flux", "sd3", "wan", "hunyuan", "ltx"].includes(modelFamily)) {
    if (available.includes("Kitchen Attention")) return "Kitchen Attention";
    if (available.includes("SageAttention")) return "SageAttention";
    if (available.includes("FlashAttention-2")) return "FlashAttention-2";
    return "SDPA (PyTorch Native)";
  }
  if (available.includes("xFormers")) return "xFormers";
  return "SDPA (PyTorch Native)";
}

function filterSuggestedClips(clips, modelFamily) {
  if (!clips || !modelFamily) return [];
  if (modelFamily === "krea2") return clips.filter(c => /krea|qwen3vl/i.test(c));
  if (modelFamily === "flux") return clips.filter(c => /flux|t5|clip_l/i.test(c));
  if (modelFamily === "sdxl") return clips.filter(c => /sdxl|clip_l|clip_g/i.test(c));
  if (modelFamily === "sd3") return clips.filter(c => /sd3|t5|clip_g/i.test(c));
  if (modelFamily === "wan") return clips.filter(c => /wan|umt5/i.test(c));
  return [];
}

function filterSuggestedVaes(vaes, modelFamily) {
  if (!vaes || !modelFamily) return [];
  if (modelFamily === "krea2" || modelFamily === "flux") {
    return vaes.filter(v => /(?:^|[_\-\\/])(ae|flux2?)(?:[_\-\\/.]|$)/i.test(v) || /flux.*vae|vae.*flux/i.test(v));
  }
  if (modelFamily === "sdxl") return vaes.filter(v => /sdxl/i.test(v));
  if (modelFamily === "sd3") return vaes.filter(v => /sd3/i.test(v));
  if (modelFamily === "sd15") return vaes.filter(v => /vae-ft|840000|anime/i.test(v));
  if (modelFamily === "wan") return vaes.filter(v => /wan/i.test(v));
  return [];
}

// ---------------------------------------------------------------------------
// Socket Geometry
// ---------------------------------------------------------------------------
function getElementCenterY(node, el) {
  if (!el || !node._domRoot) return null;
  const w = node._hubWidget;
  const widgetY = Number.isFinite(w?.y) ? w.y : (Number.isFinite(node.widgets_start_y) ? node.widgets_start_y : 2);
  const widgetMargin = Number.isFinite(w?.margin) ? w.margin : (w?.options?.margin ?? 6);

  const rootRect = node._domRoot.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  const scale = app.canvas?.ds?.scale || 1.0;
  if (!rootRect || !elRect || scale <= 0) return null;

  const localCenterY = (elRect.top + elRect.height * 0.5 - rootRect.top) / scale;
  return Math.round(widgetY + widgetMargin + localCenterY);
}

function alignOutputs(node) {
  if (!node || !node.outputs || !node._anchorEls) return;
  const nx = node.size[0];
  const isVue = !!document.querySelector(`.lg-node[data-node-id="${node.id}"]`);
  let nodeEl = null;
  let vueOuts = null;
  if (isVue) {
    nodeEl = document.querySelector(`.lg-node[data-node-id="${node.id}"]`);
    if (nodeEl) vueOuts = nodeEl.querySelectorAll(".lg-slot--output");
  }

  let changed = false;
  // 6 Outputs: 0:MODEL, 1:CLIP, 2:VAE, 3:WIDTH, 4:HEIGHT, 5:PROMPT
  for (let i = 0; i < 6; i++) {
    const out = node.outputs[i];
    const el = node._anchorEls[i];
    if (!out || !el) continue;
    out.label = " "; // Prevent LiteGraph canvas from drawing overlapping text labels

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

function scheduleAlign(node) {
  if (!node || node._dsRemoved) return;
  const run = () => {
    if (!node.graph || node._dsRemoved) return;
    alignOutputs(node);
  };
  requestAnimationFrame(run);
  setTimeout(run, 50);
  setTimeout(run, 180);
}

function watchAlign(node) {
  if (node._dsAlignPoll) return;
  node._dsAlignPoll = setInterval(() => {
    if (!node.graph || node._dsRemoved) {
      unwatchAlign(node);
      return;
    }
    alignOutputs(node);
  }, 250);
}

function unwatchAlign(node) {
  if (node?._dsAlignPoll) {
    clearInterval(node._dsAlignPoll);
    node._dsAlignPoll = null;
  }
}

// ---------------------------------------------------------------------------
// Custom Dropdown Builder
// ---------------------------------------------------------------------------
function createCustomDropdown({ value, options, placeholder = "Select...", onSelect, renderItem, isCategorized = false }) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "ds-hub-select-btn";

  const textSpan = document.createElement("span");
  textSpan.className = "ds-hub-select-text";
  textSpan.textContent = value || placeholder;

  const arrow = document.createElement("span");
  arrow.className = "ds-hub-select-arrow";
  arrow.innerHTML = "&#9662;";

  btn.append(textSpan, arrow);

  let menu = null;
  let outsideHandler = null;

  const closeMenu = () => {
    if (menu) {
      menu.remove();
      menu = null;
      btn.classList.remove("is-open");
    }
    if (outsideHandler) {
      document.removeEventListener("pointerdown", outsideHandler, true);
      outsideHandler = null;
    }
  };

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (menu) {
      closeMenu();
      return;
    }

    btn.classList.add("is-open");
    menu = document.createElement("div");
    menu.className = "ds-hub-dropdown-menu";

    const searchInput = document.createElement("input");
    searchInput.className = "ds-hub-dropdown-search";
    searchInput.placeholder = "Search presets...";

    const optList = document.createElement("div");
    optList.className = "ds-hub-dropdown-options";

    const renderCategorizedOpts = (query = "") => {
      optList.textContent = "";
      const q = query.trim().toLowerCase();

      for (const group of options) {
        const filteredItems = (group.items || []).filter(item => {
          return item.label.toLowerCase().includes(q) || group.category.toLowerCase().includes(q);
        });
        if (!filteredItems.length) continue;

        const catHdr = document.createElement("div");
        catHdr.className = "ds-hub-dropdown-category";
        catHdr.textContent = group.category;
        optList.appendChild(catHdr);

        for (const item of filteredItems) {
          const isSel = item.label === value;
          const optBtn = document.createElement("button");
          optBtn.type = "button";
          optBtn.className = "ds-hub-dropdown-opt" + (isSel ? " is-selected" : "");
          optBtn.textContent = item.label;

          if (isSel) {
            const check = document.createElement("span");
            check.textContent = "✓";
            check.style.color = "var(--ds-accent)";
            optBtn.appendChild(check);
          }

          optBtn.addEventListener("click", (ev) => {
            ev.stopPropagation();
            value = item.label;
            textSpan.textContent = item.label;
            closeMenu();
            onSelect?.(item.label, item);
          });
          optList.appendChild(optBtn);
        }
      }
    };

    const renderFlatOpts = (query = "") => {
      optList.textContent = "";
      const q = query.trim().toLowerCase();
      const filtered = (options || []).filter(o => {
        const str = typeof o === "object" ? (o.label || o.name || "") : String(o);
        return str.toLowerCase().includes(q);
      });

      if (!filtered.length) {
        const empty = document.createElement("div");
        empty.style.padding = "6px 8px";
        empty.style.fontSize = "11px";
        empty.style.color = "var(--ds-text-muted)";
        empty.textContent = "No matches";
        optList.appendChild(empty);
        return;
      }

      for (const opt of filtered) {
        const optVal = typeof opt === "object" ? (opt.value || opt.name) : opt;
        const optLabel = typeof opt === "object" ? (opt.label || opt.name) : opt;
        const isSel = optVal === value;

        const optBtn = document.createElement("button");
        optBtn.type = "button";
        optBtn.className = "ds-hub-dropdown-opt" + (isSel ? " is-selected" : "");
        if (renderItem) {
          renderItem(opt, optBtn);
        } else {
          optBtn.textContent = optLabel;
          if (isSel) {
            const check = document.createElement("span");
            check.textContent = "✓";
            check.style.color = "var(--ds-accent)";
            optBtn.appendChild(check);
          }
        }

        optBtn.addEventListener("click", (ev) => {
          ev.stopPropagation();
          value = optVal;
          textSpan.textContent = optLabel;
          closeMenu();
          onSelect?.(optVal, opt);
        });
        optList.appendChild(optBtn);
      }
    };

    const renderAll = (q = "") => {
      if (isCategorized) renderCategorizedOpts(q);
      else renderFlatOpts(q);
    };

    searchInput.addEventListener("input", () => renderAll(searchInput.value));
    menu.append(searchInput, optList);
    document.body.appendChild(menu);

    const rect = btn.getBoundingClientRect();
    menu.style.width = `${Math.max(rect.width, 240)}px`;
    let left = rect.left;
    let top = rect.bottom + 4;
    if (top + 320 > window.innerHeight - 10) {
      top = Math.max(10, rect.top - 320 - 4);
    }
    if (left + 240 > window.innerWidth - 10) {
      left = Math.max(10, window.innerWidth - 250);
    }
    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;

    renderAll();
    setTimeout(() => searchInput.focus(), 20);

    outsideHandler = (ev) => {
      if (!menu.contains(ev.target) && !btn.contains(ev.target)) {
        closeMenu();
      }
    };
    setTimeout(() => document.addEventListener("pointerdown", outsideHandler, true), 10);
  });

  return {
    el: btn,
    setValue: (newVal, newLabel) => {
      value = newVal;
      textSpan.textContent = newLabel || newVal || placeholder;
    },
    destroy: closeMenu,
  };
}

// ---------------------------------------------------------------------------
// Image Settings Math
// ---------------------------------------------------------------------------
function snapDimension(val, multiple = 16) {
  return Math.max(64, Math.round(val / multiple) * multiple);
}

function recalculateFromAR(node, ratioW, ratioH) {
  const s = getState(node);
  const targetArea = (s.mp || 1.0) * 1000000;
  const ratio = ratioW / ratioH;
  let w = Math.sqrt(targetArea * ratio);
  let h = w / ratio;
  s.width = snapDimension(w, 16);
  s.height = snapDimension(h, 16);
  s.mp = Math.round((s.width * s.height / 1000000) * 10) / 10;
  s.resolution_preset = getResolutionDisplayLabel(s.width, s.height, getResPresets());
  saveState(node);
}

function recalculateFromMP(node, targetMP) {
  const s = getState(node);
  s.mp = Math.max(0.1, Math.round(targetMP * 10) / 10);
  const arList = getARPresets();
  const arObj = arList.find(a => a.name === s.aspect_ratio) || { w: 1, h: 1 };
  recalculateFromAR(node, arObj.w, arObj.h);
}

// ---------------------------------------------------------------------------
// CivitAI Trigger Words Modal
// ---------------------------------------------------------------------------
async function openCivitAIModal(node, loraRow) {
  const overlay = document.createElement("div");
  overlay.className = "ds-hub-modal-overlay";

  const modal = document.createElement("div");
  modal.className = "ds-hub-modal";

  const head = document.createElement("div");
  head.className = "ds-hub-modal-head";
  const title = document.createElement("strong");
  title.textContent = loraRow.name || "LoRA Metadata";
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "ds-hub-icon-btn";
  closeBtn.innerHTML = "×";
  closeBtn.style.fontSize = "16px";
  closeBtn.onclick = () => overlay.remove();
  head.append(title, closeBtn);

  const body = document.createElement("div");
  body.className = "ds-hub-modal-body";

  const status = document.createElement("div");
  status.style.fontSize = "11px";
  status.style.color = "var(--ds-text-muted)";
  status.textContent = "Loading CivitAI metadata & trigger words...";
  body.appendChild(status);

  const tagsContainer = document.createElement("div");
  tagsContainer.className = "ds-hub-chips-wrap";
  tagsContainer.style.marginTop = "8px";

  let triggers = Array.from(loraRow.selectedTriggers || []);

  const renderTags = (availableTags) => {
    tagsContainer.textContent = "";
    if (!availableTags || !availableTags.length) {
      const empty = document.createElement("div");
      empty.style.fontSize = "11px";
      empty.style.color = "var(--ds-text-muted)";
      empty.textContent = "No trigger words found for this LoRA.";
      tagsContainer.appendChild(empty);
      return;
    }

    for (const tag of availableTags) {
      const isSel = triggers.includes(tag);
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "ds-hub-chip" + (isSel ? " is-active" : "");
      chip.textContent = (isSel ? "✓ " : "") + tag;
      chip.onclick = () => {
        if (triggers.includes(tag)) {
          triggers = triggers.filter(t => t !== tag);
        } else {
          triggers.push(tag);
        }
        loraRow.selectedTriggers = triggers;
        saveState(node);
        node._renderUI?.();
        renderTags(availableTags);
      };
      tagsContainer.appendChild(chip);
    }
  };

  body.appendChild(tagsContainer);

  const foot = document.createElement("div");
  foot.className = "ds-hub-modal-foot";
  const doneBtn = document.createElement("button");
  doneBtn.type = "button";
  doneBtn.className = "ds-hub-chip is-active";
  doneBtn.style.padding = "0 14px";
  doneBtn.textContent = "Done";
  doneBtn.onclick = () => {
    loraRow.selectedTriggers = triggers;
    saveState(node);
    node._renderUI?.();
    overlay.remove();
  };
  foot.appendChild(doneBtn);

  modal.append(head, body, foot);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  try {
    const res = await fetch("/ds/lora_metadata", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: loraRow.name, forceOnline: false }),
    });
    if (res.ok) {
      const data = await res.json();
      status.textContent = data.ok ? `Source: ${data.source}` : (data.error || "Offline metadata only");
      const combined = Array.from(new Set([...(data.trainedWords || []), ...triggers]));
      renderTags(combined);
    } else {
      status.textContent = "Metadata lookup unavailable.";
      renderTags(triggers);
    }
  } catch (err) {
    status.textContent = "Metadata request failed.";
    renderTags(triggers);
  }
}

// ---------------------------------------------------------------------------
// Node UI Builder
// ---------------------------------------------------------------------------
function buildRoot(node) {
  const root = document.createElement("div");
  root.className = "ds-hub-container";
  root.dataset.dsThemed = "true";

  node._anchorEls = {};

  const s = getState(node);

  node._renderUI = () => {
    root.textContent = "";
    node._anchorEls = {};

    for (const secKey of s.section_order) {
      if (secKey === "models") {
        root.appendChild(buildModelsSection(node));
      } else if (secKey === "image_settings") {
        root.appendChild(buildImageSettingsSection(node));
      } else if (secKey === "lora") {
        root.appendChild(buildLoRASection(node));
      } else if (secKey === "prompt") {
        root.appendChild(buildPromptSection(node));
      }
    }

    node._dsSyncHubHeight?.();
    scheduleAlign(node);
  };

  return root;
}

// 1. Models Section
function buildModelsSection(node) {
  const s = getState(node);
  const sec = document.createElement("div");
  sec.className = "ds-hub-section";

  const family = detectModelFamily(s.model);
  const familyDetails = getModelFamilyDetails(family);
  const clipDetails = getClipFamilyDetails(s.clip, family);
  const detectedAttn = detectAttentionType(family, node._catalog);

  const head = document.createElement("div");
  head.className = "ds-hub-section-head";
  const title = document.createElement("span");
  title.className = "ds-hub-section-title";
  title.textContent = "MODELS";

  const modelBadge = document.createElement("span");
  modelBadge.className = "ds-hub-detect-badge";
  modelBadge.textContent = familyDetails;

  head.append(title, modelBadge);
  sec.appendChild(head);

  // Model Row (Slot 0)
  const modelRow = document.createElement("div");
  modelRow.className = "ds-hub-row";
  const modelLabel = document.createElement("span");
  modelLabel.className = "ds-hub-label";
  modelLabel.textContent = "Model";

  const modelDropdown = createCustomDropdown({
    value: s.model,
    options: node._catalog?.models || [],
    placeholder: "Select Checkpoint / Diffusion Model...",
    onSelect: (val) => {
      s.model = val;
      const fam = detectModelFamily(val);
      if (s.clip === "Auto" || !s.clip || (fam === "krea2" && !/krea|qwen3vl/i.test(s.clip))) {
        const suggestedClips = filterSuggestedClips(node._catalog?.clips, fam);
        if (suggestedClips.length > 0) s.clip = suggestedClips[0];
      }
      if (s.vae === "Auto" || !s.vae) {
        const suggestedVaes = filterSuggestedVaes(node._catalog?.vaes, fam);
        if (suggestedVaes.length > 0) s.vae = suggestedVaes[0];
      }
      const autoAttn = detectAttentionType(fam, node._catalog);
      if (autoAttn) s.attention = autoAttn;
      saveState(node);
      node._renderUI?.();
    },
  });

  node._anchorEls[0] = modelRow;
  modelRow.append(modelLabel, modelDropdown.el);
  sec.appendChild(modelRow);

  // Clip Row (Slot 1)
  const clipRow = document.createElement("div");
  clipRow.className = "ds-hub-row";
  const clipLabel = document.createElement("span");
  clipLabel.className = "ds-hub-label";
  clipLabel.textContent = "Clip";

  const clipOptions = ["Auto", ...(node._catalog?.clips || [])];
  const clipDropdown = createCustomDropdown({
    value: s.clip || "Auto",
    options: clipOptions,
    placeholder: "Select or Auto...",
    onSelect: (val) => {
      s.clip = val;
      saveState(node);
      node._renderUI?.();
    },
    renderItem: (opt, optEl) => {
      optEl.textContent = opt;
      if (opt === s.clip) optEl.classList.add("is-selected");
    },
  });

  node._anchorEls[1] = clipRow;
  clipRow.append(clipLabel, clipDropdown.el);
  sec.appendChild(clipRow);

  // VAE Row (Slot 2)
  const vaeRow = document.createElement("div");
  vaeRow.className = "ds-hub-row";
  const vaeLabel = document.createElement("span");
  vaeLabel.className = "ds-hub-label";
  vaeLabel.textContent = "VAE";

  const vaeOptions = ["Auto", ...(node._catalog?.vaes || [])];
  const vaeDropdown = createCustomDropdown({
    value: s.vae || "Auto",
    options: vaeOptions,
    placeholder: "Select or Auto...",
    onSelect: (val) => {
      s.vae = val;
      saveState(node);
    },
    renderItem: (opt, optEl) => {
      optEl.textContent = opt;
      if (opt === s.vae) optEl.classList.add("is-selected");
    },
  });

  node._anchorEls[2] = vaeRow;
  vaeRow.append(vaeLabel, vaeDropdown.el);
  sec.appendChild(vaeRow);

  // Attention Row
  const attRow = document.createElement("div");
  attRow.className = "ds-hub-row";
  const attLabel = document.createElement("span");
  attLabel.className = "ds-hub-label";
  attLabel.textContent = "Attention";

  const rawAttns = node._catalog?.attentions || ["Default", "SDPA (PyTorch Native)"];
  const attOptions = ["Auto-Detect", ...rawAttns];
  const attDropdown = createCustomDropdown({
    value: s.attention || "Auto-Detect",
    options: attOptions,
    placeholder: "Select Attention...",
    onSelect: (val) => {
      s.attention = val;
      saveState(node);
      node._renderUI?.();
    },
  });

  attRow.append(attLabel, attDropdown.el);
  sec.appendChild(attRow);

  const attBadgeRow = document.createElement("div");
  attBadgeRow.className = "ds-hub-badge-row";
  const activeAttnLabel = s.attention === "Auto-Detect" ? `Active: ${detectedAttn}` : `Active: ${s.attention}`;
  attBadgeRow.innerHTML = `<span class="ds-hub-detect-badge is-subtle">⚙ ${activeAttnLabel}</span>`;
  sec.appendChild(attBadgeRow);

  return sec;
}

// 2. Image Settings Section
function buildImageSettingsSection(node) {
  const s = getState(node);
  const sec = document.createElement("div");
  sec.className = "ds-hub-section";

  const head = document.createElement("div");
  head.className = "ds-hub-section-head";
  const title = document.createElement("span");
  title.className = "ds-hub-section-title";
  title.textContent = "Image Settings";
  head.appendChild(title);
  sec.appendChild(head);

  const arPresets = getARPresets();
  const resPresets = getResPresets();
  const mpPresets = getMPPresets();

  s.resolution_preset = getResolutionDisplayLabel(s.width, s.height, resPresets);

  // 1. Aspect Ratio Dropdown
  const arRow = document.createElement("div");
  arRow.className = "ds-hub-row";
  const arLabel = document.createElement("span");
  arLabel.className = "ds-hub-label";
  arLabel.textContent = "Aspect Ratio";

  const arDropdown = createCustomDropdown({
    value: s.aspect_ratio || "1:1",
    options: arPresets.map(a => a.name),
    placeholder: "Select Ratio...",
    onSelect: (val) => {
      s.aspect_ratio = val;
      const arObj = arPresets.find(a => a.name === val) || { w: 1, h: 1 };
      recalculateFromAR(node, arObj.w, arObj.h);
      node._renderUI?.();
    },
  });

  arRow.append(arLabel, arDropdown.el);
  sec.appendChild(arRow);

  // 2. Resolution Presets
  const resRow = document.createElement("div");
  resRow.className = "ds-hub-row";
  const resLabel = document.createElement("span");
  resLabel.className = "ds-hub-label";
  resLabel.textContent = "Resolution";

  const resDropdown = createCustomDropdown({
    value: s.resolution_preset,
    options: resPresets,
    isCategorized: true,
    placeholder: "Choose Resolution Preset...",
    onSelect: (val, item) => {
      s.resolution_preset = item.label;
      s.width = item.w;
      s.height = item.h;
      if (item.ar) s.aspect_ratio = item.ar;
      else s.aspect_ratio = findClosestAR(s.width, s.height, arPresets);
      s.mp = Math.round((s.width * s.height / 1000000) * 10) / 10;
      saveState(node);
      node._renderUI?.();
    },
  });

  resRow.append(resLabel, resDropdown.el);
  sec.appendChild(resRow);

  // 3. Megapixel Presets & Custom MP Input
  const mpGroup = document.createElement("div");
  mpGroup.className = "ds-hub-preset-group";
  const mpHeadRow = document.createElement("div");
  mpHeadRow.style.display = "flex";
  mpHeadRow.style.alignItems = "center";
  mpHeadRow.style.justifyContent = "space-between";

  const mpLabel = document.createElement("span");
  mpLabel.className = "ds-hub-preset-label";
  mpLabel.textContent = `Target Megapixels (${Number(s.mp || 1.0).toFixed(1)} MP)`;

  const customMPWrap = document.createElement("div");
  customMPWrap.className = "ds-hub-mp-wrap";
  const mpInput = document.createElement("input");
  mpInput.type = "number";
  mpInput.className = "ds-hub-mp-input";
  mpInput.value = Number(s.mp || 1.0).toFixed(1);
  mpInput.step = "0.1";
  mpInput.title = "Enter custom MP target";
  mpInput.onchange = () => {
    const val = parseFloat(mpInput.value);
    if (Number.isFinite(val) && val > 0) {
      recalculateFromMP(node, val);
      node._renderUI?.();
    }
  };
  const mpUnit = document.createElement("span");
  mpUnit.className = "ds-hub-mp-unit";
  mpUnit.textContent = "MP";
  customMPWrap.append(mpInput, mpUnit);
  mpHeadRow.append(mpLabel, customMPWrap);
  mpGroup.appendChild(mpHeadRow);

  const mpChips = document.createElement("div");
  mpChips.className = "ds-hub-chips-wrap";

  for (const m of mpPresets) {
    const isAct = Math.abs((s.mp || 1.0) - m.mp) < 0.05;
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "ds-hub-chip" + (isAct ? " is-active" : "");
    chip.textContent = m.name;
    chip.onclick = () => {
      s.mp_preset = m.name;
      recalculateFromMP(node, m.mp);
      node._renderUI?.();
    };
    mpChips.appendChild(chip);
  }
  mpGroup.appendChild(mpChips);
  sec.appendChild(mpGroup);

  // Width Row (Slot 3)
  const widthRow = document.createElement("div");
  widthRow.className = "ds-hub-row";
  const wLabel = document.createElement("span");
  wLabel.className = "ds-hub-label";
  wLabel.textContent = "Width";

  const wInput = document.createElement("input");
  wInput.type = "number";
  wInput.className = "ds-hub-input-number";
  wInput.value = s.width || 1024;
  wInput.step = "16";
  wInput.onchange = () => {
    s.width = snapDimension(Number(wInput.value) || 1024, 16);
    s.mp = Math.round((s.width * s.height / 1000000) * 10) / 10;
    s.aspect_ratio = findClosestAR(s.width, s.height, arPresets);
    s.resolution_preset = getResolutionDisplayLabel(s.width, s.height, resPresets);
    saveState(node);
    node._renderUI?.();
  };

  node._anchorEls[3] = widthRow;
  widthRow.append(wLabel, wInput);
  sec.appendChild(widthRow);

  // Height Row (Slot 4)
  const heightRow = document.createElement("div");
  heightRow.className = "ds-hub-row";
  const hLabel = document.createElement("span");
  hLabel.className = "ds-hub-label";
  hLabel.textContent = "Height";

  const hInput = document.createElement("input");
  hInput.type = "number";
  hInput.className = "ds-hub-input-number";
  hInput.value = s.height || 1024;
  hInput.step = "16";
  hInput.onchange = () => {
    s.height = snapDimension(Number(hInput.value) || 1024, 16);
    s.mp = Math.round((s.width * s.height / 1000000) * 10) / 10;
    s.aspect_ratio = findClosestAR(s.width, s.height, arPresets);
    s.resolution_preset = getResolutionDisplayLabel(s.width, s.height, resPresets);
    saveState(node);
    node._renderUI?.();
  };

  node._anchorEls[4] = heightRow;
  heightRow.append(hLabel, hInput);
  sec.appendChild(heightRow);

  return sec;
}

// 3. LoRA Section
function buildLoRASection(node) {
  const s = getState(node);
  const sec = document.createElement("div");
  sec.className = "ds-hub-section";

  const head = document.createElement("div");
  head.className = "ds-hub-section-head";
  const title = document.createElement("span");
  title.className = "ds-hub-section-title";
  title.textContent = `LoRA (${(s.loras || []).length})`;
  head.appendChild(title);
  sec.appendChild(head);

  const lorasList = document.createElement("div");
  lorasList.className = "ds-hub-loras-list";

  (s.loras || []).forEach((row, idx) => {
    const loraRow = document.createElement("div");
    loraRow.className = "ds-hub-lora-row" + (row.enabled ? "" : " is-off");
    loraRow.draggable = true;

    const dragHandle = document.createElement("span");
    dragHandle.className = "ds-hub-drag-handle";
    dragHandle.textContent = "≡";

    const loraSelect = createCustomDropdown({
      value: row.name,
      options: node._catalog?.loras || [],
      placeholder: "Select LoRA...",
      onSelect: (val) => {
        row.name = val;
        row.selectedTriggers = [];
        saveState(node);
        node._renderUI?.();
      },
    });

    const stepperShell = document.createElement("div");
    stepperShell.className = "ds-hub-stepper-shell";

    const strengthInp = document.createElement("input");
    strengthInp.type = "text";
    strengthInp.inputMode = "decimal";
    strengthInp.className = "ds-hub-stepper-input";
    const curStr = Number.isFinite(row.strength) ? Number(row.strength) : 1.0;
    strengthInp.value = curStr.toFixed(1);

    const updateStrength = (newVal) => {
      const clamped = Math.round(Math.min(10.0, Math.max(-10.0, newVal)) * 10) / 10;
      row.strength = clamped;
      strengthInp.value = clamped.toFixed(1);
      saveState(node);
    };

    strengthInp.onchange = () => {
      const val = parseFloat(strengthInp.value);
      updateStrength(Number.isFinite(val) ? val : 1.0);
    };

    const stepperBtns = document.createElement("div");
    stepperBtns.className = "ds-hub-stepper";

    const upBtn = document.createElement("span");
    upBtn.className = "ds-hub-step";
    upBtn.setAttribute("role", "button");
    upBtn.setAttribute("tabindex", "-1");
    upBtn.innerHTML = "&#9650;";
    upBtn.title = "+0.1";
    upBtn.style.setProperty("background", "transparent", "important");
    upBtn.style.setProperty("border", "none", "important");
    upBtn.onclick = (e) => {
      e.stopPropagation();
      const current = parseFloat(strengthInp.value) || 0;
      updateStrength(current + 0.1);
    };

    const downBtn = document.createElement("span");
    downBtn.className = "ds-hub-step";
    downBtn.setAttribute("role", "button");
    downBtn.setAttribute("tabindex", "-1");
    downBtn.innerHTML = "&#9660;";
    downBtn.title = "-0.1";
    downBtn.style.setProperty("background", "transparent", "important");
    downBtn.style.setProperty("border", "none", "important");
    downBtn.onclick = (e) => {
      e.stopPropagation();
      const current = parseFloat(strengthInp.value) || 0;
      updateStrength(current - 0.1);
    };

    stepperBtns.append(upBtn, downBtn);
    stepperShell.append(strengthInp, stepperBtns);

    const infoBtn = document.createElement("button");
    infoBtn.type = "button";
    infoBtn.className = "ds-hub-icon-btn";
    infoBtn.textContent = "i";
    infoBtn.title = "View CivitAI Trigger Words & Metadata";
    infoBtn.onclick = () => openCivitAIModal(node, row);

    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "ds-hub-toggle-btn" + (row.enabled ? " is-on" : "");
    toggleBtn.textContent = row.enabled ? "ON" : "OFF";
    toggleBtn.onclick = () => {
      row.enabled = !row.enabled;
      saveState(node);
      node._renderUI?.();
    };

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "ds-hub-icon-btn";
    delBtn.innerHTML = "×";
    delBtn.title = "Delete LoRA";
    delBtn.onclick = () => {
      s.loras.splice(idx, 1);
      saveState(node);
      node._renderUI?.();
    };

    loraRow.ondragstart = (e) => {
      e.dataTransfer.setData("text/plain", String(idx));
      e.dataTransfer.effectAllowed = "move";
    };
    loraRow.ondragover = (e) => {
      e.preventDefault();
      loraRow.classList.add("is-dragover");
    };
    loraRow.ondragleave = () => loraRow.classList.remove("is-dragover");
    loraRow.ondrop = (e) => {
      e.preventDefault();
      loraRow.classList.remove("is-dragover");
      const fromIdx = parseInt(e.dataTransfer.getData("text/plain"), 10);
      if (Number.isInteger(fromIdx) && fromIdx !== idx) {
        const [moved] = s.loras.splice(fromIdx, 1);
        s.loras.splice(idx, 0, moved);
        saveState(node);
        node._renderUI?.();
      }
    };

    loraRow.append(dragHandle, loraSelect.el, stepperShell, infoBtn, toggleBtn, delBtn);
    lorasList.appendChild(loraRow);
  });

  sec.appendChild(lorasList);

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "ds-hub-add-btn";
  addBtn.innerHTML = "+ ADD LORA";
  addBtn.onclick = () => {
    s.loras = s.loras || [];
    s.loras.push({ name: "", strength: 1.0, enabled: true, selectedTriggers: [] });
    saveState(node);
    node._renderUI?.();
  };
  sec.appendChild(addBtn);

  return sec;
}

// 4. Prompt Section
function buildPromptSection(node) {
  const s = getState(node);
  const sec = document.createElement("div");
  sec.className = "ds-hub-section is-prompt-section";

  const head = document.createElement("div");
  head.className = "ds-hub-section-head has-socket";
  head.style.position = "relative";

  const leftWrap = document.createElement("div");
  leftWrap.style.display = "flex";
  leftWrap.style.alignItems = "center";
  leftWrap.style.gap = "6px";

  const title = document.createElement("span");
  title.className = "ds-hub-section-title";
  title.textContent = "Prompt";

  let activeTriggersCount = 0;
  for (const lora of s.loras || []) {
    if (lora.enabled && lora.selectedTriggers?.length) {
      activeTriggersCount += lora.selectedTriggers.length;
    }
  }

  leftWrap.appendChild(title);
  if (activeTriggersCount > 0) {
    const badge = document.createElement("span");
    badge.className = "ds-hub-triggers-badge";
    badge.textContent = `+${activeTriggersCount} trigger${activeTriggersCount > 1 ? "s" : ""}`;
    leftWrap.appendChild(badge);
  }

  const actions = document.createElement("div");
  actions.className = "ds-hub-prompt-actions";

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "ds-hub-icon-btn";
  copyBtn.title = "Copy Prompt";
  copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-copy preview-icon"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
  copyBtn.onclick = () => {
    navigator.clipboard?.writeText(s.prompt || "");
  };

  const replaceBtn = document.createElement("button");
  replaceBtn.type = "button";
  replaceBtn.className = "ds-hub-icon-btn";
  replaceBtn.title = "Replace Prompt with Clipboard Text";
  replaceBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-refresh-ccw preview-icon"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>`;
  replaceBtn.onclick = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (typeof text === "string") {
        s.prompt = text;
        ta.value = text;
        saveState(node);
      }
    } catch (err) {
      console.warn("[DS Generation Hub] Failed to read clipboard:", err);
    }
  };

  actions.append(copyBtn, replaceBtn);

  // Prompt Socket Anchor (Slot 5)
  node._anchorEls[5] = head;

  head.append(leftWrap, actions);
  sec.appendChild(head);

  const ta = document.createElement("textarea");
  ta.className = "ds-hub-prompt-ta";
  ta.placeholder = "Enter your prompt here...";
  ta.value = s.prompt || "";

  ta.oninput = () => {
    s.prompt = ta.value;
    saveState(node);
  };

  sec.appendChild(ta);
  return sec;
}

// ---------------------------------------------------------------------------
// Toolbar Gear Menu Popover
// ---------------------------------------------------------------------------
let _activeGearPopover = null;

function openGearPopover(node, anchorEl) {
  if (_activeGearPopover) {
    _activeGearPopover.remove();
    _activeGearPopover = null;
  }

  const s = getState(node);

  const popover = document.createElement("div");
  popover.className = "ds-hub-gear-popover";

  const head = document.createElement("div");
  head.className = "ds-hub-gear-head";
  head.innerHTML = `<span>Generation Hub Settings</span>`;
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "ds-hub-icon-btn";
  closeBtn.innerHTML = "×";
  closeBtn.onclick = () => {
    popover.remove();
    _activeGearPopover = null;
  };
  head.appendChild(closeBtn);

  const body = document.createElement("div");
  body.className = "ds-hub-gear-body";

  // SECTION ORDER DRAG & DROP
  const orderTitle = document.createElement("div");
  orderTitle.className = "ds-hub-preset-label";
  orderTitle.textContent = "SECTION ORDER (Drag to reorder)";
  body.appendChild(orderTitle);

  const orderList = document.createElement("div");
  orderList.className = "ds-hub-order-list";

  const sectionLabels = {
    models: "Models",
    image_settings: "Image Settings",
    lora: "LoRA",
    prompt: "Prompt",
  };

  const renderOrderCards = () => {
    orderList.textContent = "";
    s.section_order.forEach((key, idx) => {
      const card = document.createElement("div");
      card.className = "ds-hub-order-card";
      card.draggable = true;
      card.innerHTML = `<span class="ds-hub-drag-handle">☰</span><span>${sectionLabels[key] || key}</span>`;

      card.ondragstart = (e) => {
        e.dataTransfer.setData("text/plain", String(idx));
        e.dataTransfer.effectAllowed = "move";
      };
      card.ondragover = (e) => {
        e.preventDefault();
        card.classList.add("is-dragover");
      };
      card.ondragleave = () => card.classList.remove("is-dragover");
      card.ondrop = (e) => {
        e.preventDefault();
        card.classList.remove("is-dragover");
        const fromIdx = parseInt(e.dataTransfer.getData("text/plain"), 10);
        if (Number.isInteger(fromIdx) && fromIdx !== idx) {
          const [moved] = s.section_order.splice(fromIdx, 1);
          s.section_order.splice(idx, 0, moved);
          saveState(node);
          node._renderUI?.();
          renderOrderCards();
        }
      };

      orderList.appendChild(card);
    });
  };
  renderOrderCards();
  body.appendChild(orderList);

  // 1. ASPECT RATIO PRESETS MANAGER
  const arSec = document.createElement("div");
  arSec.className = "ds-hub-preset-mgr-section";

  const arHead = document.createElement("div");
  arHead.className = "ds-hub-preset-mgr-head";
  const arTitle = document.createElement("span");
  arTitle.className = "ds-hub-preset-mgr-title";
  arTitle.textContent = "Aspect Ratio Presets";

  const arActions = document.createElement("div");
  arActions.className = "ds-hub-preset-mgr-actions";

  const arAddBtn = document.createElement("button");
  arAddBtn.type = "button";
  arAddBtn.className = "ds-hub-btn-xs";
  arAddBtn.textContent = "+ Add";

  const arRestoreBtn = document.createElement("button");
  arRestoreBtn.type = "button";
  arRestoreBtn.className = "ds-hub-btn-danger-xs";
  arRestoreBtn.textContent = "Restore Defaults";

  arActions.append(arAddBtn, arRestoreBtn);
  arHead.append(arTitle, arActions);
  arSec.appendChild(arHead);

  const arAddForm = document.createElement("div");
  arAddForm.className = "ds-hub-preset-add-form";
  arAddForm.style.display = "none";
  arAddForm.innerHTML = `
    <div class="ds-hub-preset-add-inputs">
      <input type="text" class="ds-hub-input-xs ar-name-in" placeholder="Ratio (e.g. 21:9)" />
      <input type="number" class="ds-hub-input-xs ar-w-in" placeholder="W" style="width:50px" />
      <input type="number" class="ds-hub-input-xs ar-h-in" placeholder="H" style="width:50px" />
      <button type="button" class="ds-hub-btn-xs save-ar-btn">Save</button>
      <button type="button" class="ds-hub-btn-danger-xs cancel-ar-btn">✕</button>
    </div>
  `;
  arSec.appendChild(arAddForm);

  const arListEl = document.createElement("div");
  arListEl.className = "ds-hub-preset-mgr-list";

  const renderARList = () => {
    arListEl.textContent = "";
    const list = getARPresets();
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      const row = document.createElement("div");
      row.className = "ds-hub-preset-manage-row";
      row.innerHTML = `<span><strong>${item.name}</strong> <span style="color:var(--ds-text-muted);font-size:10px">(${item.w}:${item.h})</span></span>`;

      const del = document.createElement("button");
      del.type = "button";
      del.className = "ds-hub-icon-btn";
      del.innerHTML = "×";
      del.title = "Delete Preset";
      del.onclick = (e) => {
        e.stopPropagation();
        list.splice(i, 1);
        saveARPresets(list);
        renderARList();
        node._renderUI?.();
      };

      row.appendChild(del);
      arListEl.appendChild(row);
    }
  };

  arAddBtn.onclick = () => {
    arAddForm.style.display = arAddForm.style.display === "none" ? "flex" : "none";
    if (arAddForm.style.display === "flex") {
      arAddForm.querySelector(".ar-name-in")?.focus();
    }
  };

  arAddForm.querySelector(".cancel-ar-btn").onclick = () => {
    arAddForm.style.display = "none";
  };

  arAddForm.querySelector(".save-ar-btn").onclick = () => {
    const nameIn = arAddForm.querySelector(".ar-name-in")?.value.trim();
    let wIn = parseFloat(arAddForm.querySelector(".ar-w-in")?.value);
    let hIn = parseFloat(arAddForm.querySelector(".ar-h-in")?.value);

    if (nameIn && (!wIn || !hIn) && nameIn.includes(":")) {
      const parts = nameIn.split(":");
      wIn = parseFloat(parts[0]);
      hIn = parseFloat(parts[1]);
    }

    if (!nameIn || !wIn || !hIn) {
      alert("Please provide a valid ratio (e.g. 21:9).");
      return;
    }

    const list = getARPresets();
    list.push({ name: nameIn, w: wIn, h: hIn });
    saveARPresets(list);
    arAddForm.style.display = "none";
    arAddForm.querySelector(".ar-name-in").value = "";
    arAddForm.querySelector(".ar-w-in").value = "";
    arAddForm.querySelector(".ar-h-in").value = "";
    renderARList();
    node._renderUI?.();
  };

  arRestoreBtn.onclick = () => {
    restoreDefaultARPresets();
    renderARList();
    node._renderUI?.();
  };

  renderARList();
  arSec.appendChild(arListEl);
  body.appendChild(arSec);

  // 2. RESOLUTION PRESETS MANAGER
  const resSec = document.createElement("div");
  resSec.className = "ds-hub-preset-mgr-section";

  const resHead = document.createElement("div");
  resHead.className = "ds-hub-preset-mgr-head";
  const resTitle = document.createElement("span");
  resTitle.className = "ds-hub-preset-mgr-title";
  resTitle.textContent = "Resolution Presets";

  const resActions = document.createElement("div");
  resActions.className = "ds-hub-preset-mgr-actions";

  const resAddBtn = document.createElement("button");
  resAddBtn.type = "button";
  resAddBtn.className = "ds-hub-btn-xs";
  resAddBtn.textContent = "+ Add";

  const resRestoreBtn = document.createElement("button");
  resRestoreBtn.type = "button";
  resRestoreBtn.className = "ds-hub-btn-danger-xs";
  resRestoreBtn.textContent = "Restore Defaults";

  resActions.append(resAddBtn, resRestoreBtn);
  resHead.append(resTitle, resActions);
  resSec.appendChild(resHead);

  const resAddForm = document.createElement("div");
  resAddForm.className = "ds-hub-preset-add-form";
  resAddForm.style.display = "none";
  resAddForm.innerHTML = `
    <div class="ds-hub-preset-add-inputs">
      <input type="text" class="ds-hub-input-xs res-cat-in" placeholder="Category" style="width:80px" value="Custom" />
      <input type="number" class="ds-hub-input-xs res-w-in" placeholder="Width" style="width:60px" />
      <input type="number" class="ds-hub-input-xs res-h-in" placeholder="Height" style="width:60px" />
      <button type="button" class="ds-hub-btn-xs save-res-btn">Save</button>
      <button type="button" class="ds-hub-btn-danger-xs cancel-res-btn">✕</button>
    </div>
  `;
  resSec.appendChild(resAddForm);

  const resListEl = document.createElement("div");
  resListEl.className = "ds-hub-preset-mgr-list";

  const renderResList = () => {
    resListEl.textContent = "";
    const list = getResPresets();
    for (let gIdx = 0; gIdx < list.length; gIdx++) {
      const group = list[gIdx];
      const catHead = document.createElement("div");
      catHead.style.fontSize = "10px";
      catHead.style.fontWeight = "700";
      catHead.style.color = "var(--ds-accent)";
      catHead.style.padding = "4px 2px 2px 2px";
      catHead.textContent = group.category;
      resListEl.appendChild(catHead);

      for (let j = 0; j < (group.items || []).length; j++) {
        const item = group.items[j];
        const row = document.createElement("div");
        row.className = "ds-hub-preset-manage-row";
        row.innerHTML = `<span><strong>${item.label}</strong> ${item.ar ? `<span style="color:var(--ds-text-muted);font-size:10px">[${item.ar}]</span>` : ""}</span>`;

        const del = document.createElement("button");
        del.type = "button";
        del.className = "ds-hub-icon-btn";
        del.innerHTML = "×";
        del.title = "Delete Preset";
        del.onclick = (e) => {
          e.stopPropagation();
          group.items.splice(j, 1);
          saveResPresets(list);
          renderResList();
          node._renderUI?.();
        };

        row.appendChild(del);
        resListEl.appendChild(row);
      }
    }
  };

  resAddBtn.onclick = () => {
    resAddForm.style.display = resAddForm.style.display === "none" ? "flex" : "none";
    if (resAddForm.style.display === "flex") {
      resAddForm.querySelector(".res-w-in")?.focus();
    }
  };

  resAddForm.querySelector(".cancel-res-btn").onclick = () => {
    resAddForm.style.display = "none";
  };

  resAddForm.querySelector(".save-res-btn").onclick = () => {
    const cat = resAddForm.querySelector(".res-cat-in")?.value.trim() || "Custom";
    const w = parseInt(resAddForm.querySelector(".res-w-in")?.value, 10);
    const h = parseInt(resAddForm.querySelector(".res-h-in")?.value, 10);

    if (!w || !h || w < 64 || h < 64) {
      alert("Please provide valid width and height.");
      return;
    }

    const list = getResPresets();
    let group = list.find(g => g.category.toLowerCase() === cat.toLowerCase());
    if (!group) {
      group = { category: cat, items: [] };
      list.push(group);
    }
    const label = `${w} × ${h}`;
    const ar = findClosestAR(w, h, getARPresets());
    group.items.push({ label, w, h, ar });
    saveResPresets(list);

    resAddForm.style.display = "none";
    resAddForm.querySelector(".res-w-in").value = "";
    resAddForm.querySelector(".res-h-in").value = "";
    renderResList();
    node._renderUI?.();
  };

  resRestoreBtn.onclick = () => {
    restoreDefaultResPresets();
    renderResList();
    node._renderUI?.();
  };

  renderResList();
  resSec.appendChild(resListEl);
  body.appendChild(resSec);

  // 3. MEGAPIXEL PRESETS MANAGER
  const mpSec = document.createElement("div");
  mpSec.className = "ds-hub-preset-mgr-section";

  const mpHead = document.createElement("div");
  mpHead.className = "ds-hub-preset-mgr-head";
  const mpTitle = document.createElement("span");
  mpTitle.className = "ds-hub-preset-mgr-title";
  mpTitle.textContent = "Megapixel Presets";

  const mpActions = document.createElement("div");
  mpActions.className = "ds-hub-preset-mgr-actions";

  const mpAddBtn = document.createElement("button");
  mpAddBtn.type = "button";
  mpAddBtn.className = "ds-hub-btn-xs";
  mpAddBtn.textContent = "+ Add";

  const mpRestoreBtn = document.createElement("button");
  mpRestoreBtn.type = "button";
  mpRestoreBtn.className = "ds-hub-btn-danger-xs";
  mpRestoreBtn.textContent = "Restore Defaults";

  mpActions.append(mpAddBtn, mpRestoreBtn);
  mpHead.append(mpTitle, mpActions);
  mpSec.appendChild(mpHead);

  const mpAddForm = document.createElement("div");
  mpAddForm.className = "ds-hub-preset-add-form";
  mpAddForm.style.display = "none";
  mpAddForm.innerHTML = `
    <div class="ds-hub-preset-add-inputs">
      <input type="number" step="0.1" class="ds-hub-input-xs mp-val-in" placeholder="MP (e.g. 2.5)" />
      <button type="button" class="ds-hub-btn-xs save-mp-btn">Save</button>
      <button type="button" class="ds-hub-btn-danger-xs cancel-mp-btn">✕</button>
    </div>
  `;
  mpSec.appendChild(mpAddForm);

  const mpListEl = document.createElement("div");
  mpListEl.className = "ds-hub-preset-mgr-list";

  const renderMPList = () => {
    mpListEl.textContent = "";
    const list = getMPPresets();
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      const row = document.createElement("div");
      row.className = "ds-hub-preset-manage-row";
      row.innerHTML = `<span><strong>${item.name}</strong> <span style="color:var(--ds-text-muted);font-size:10px">(${item.mp} MP)</span></span>`;

      const del = document.createElement("button");
      del.type = "button";
      del.className = "ds-hub-icon-btn";
      del.innerHTML = "×";
      del.title = "Delete Preset";
      del.onclick = (e) => {
        e.stopPropagation();
        list.splice(i, 1);
        saveMPPresets(list);
        renderMPList();
        node._renderUI?.();
      };

      row.appendChild(del);
      mpListEl.appendChild(row);
    }
  };

  mpAddBtn.onclick = () => {
    mpAddForm.style.display = mpAddForm.style.display === "none" ? "flex" : "none";
    if (mpAddForm.style.display === "flex") {
      mpAddForm.querySelector(".mp-val-in")?.focus();
    }
  };

  mpAddForm.querySelector(".cancel-mp-btn").onclick = () => {
    mpAddForm.style.display = "none";
  };

  mpAddForm.querySelector(".save-mp-btn").onclick = () => {
    const val = parseFloat(mpAddForm.querySelector(".mp-val-in")?.value);
    if (!val || val <= 0) {
      alert("Please provide a valid MP value (e.g. 2.5).");
      return;
    }

    const list = getMPPresets();
    const rounded = Math.round(val * 10) / 10;
    list.push({ name: `${rounded.toFixed(1)} MP`, mp: rounded });
    saveMPPresets(list);

    mpAddForm.style.display = "none";
    mpAddForm.querySelector(".mp-val-in").value = "";
    renderMPList();
    node._renderUI?.();
  };

  mpRestoreBtn.onclick = () => {
    restoreDefaultMPPresets();
    renderMPList();
    node._renderUI?.();
  };

  renderMPList();
  mpSec.appendChild(mpListEl);
  body.appendChild(mpSec);

  popover.append(head, body);
  document.body.appendChild(popover);
  _activeGearPopover = popover;

  const pw = 360;
  popover.style.width = `${pw}px`;
  const ph = popover.offsetHeight || 420;
  if (anchorEl && typeof anchorEl.getBoundingClientRect === "function") {
    const rect = anchorEl.getBoundingClientRect();
    let left = rect.right + 10;
    if (left + pw > window.innerWidth - 10) left = Math.max(10, rect.left - pw - 10);
    let top = Math.max(10, Math.min(rect.top, window.innerHeight - ph - 10));
    popover.style.left = `${Math.round(left)}px`;
    popover.style.top = `${Math.round(top)}px`;
  } else {
    popover.style.left = `${Math.max(10, window.innerWidth - pw - 20)}px`;
    popover.style.top = "60px";
  }

  const outsideHandler = (e) => {
    if (!popover.contains(e.target) && (!anchorEl || !anchorEl.contains(e.target))) {
      popover.remove();
      _activeGearPopover = null;
      document.removeEventListener("pointerdown", outsideHandler);
    }
  };
  setTimeout(() => document.addEventListener("pointerdown", outsideHandler), 10);
}

// ---------------------------------------------------------------------------
// Extension Registration
// ---------------------------------------------------------------------------
app.registerExtension({
  name: "DeathshotArsenal.GenerationHub",

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== NODE_TYPE) return;

    if (window.DSGearMenu?.register) {
      const gearConfig = {
        tooltip: "DS Generation Hub Configuration",
        onClick: (node, canvas, event) => {
          openGearPopover(node, event?.currentTarget || event?.target);
        },
      };
      window.DSGearMenu.register(NODE_TYPE, gearConfig);
      window.DSGearMenu.register("DS Generation Hub", gearConfig);
    }

    const origCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      origCreated?.apply(this, arguments);

      this._dsInitialized = false;
      this._dsUserResized = false;
      this.widgets_start_y = 2;
      this.resizable = true;
      this.shape = LiteGraph.ROUND_SHAPE;
      this.min_size = [MIN_W, MIN_H];
      const initialW = (this.size && this.size[0] >= MIN_W) ? this.size[0] : DEFAULT_W;
      const initialH = (this.size && this.size[1] >= 400) ? this.size[1] : DEFAULT_H;
      this.size = [initialW, initialH];

      this.computeSize = function (out) {
        out = out || [0, 0];
        const isResizing = (this.graph?.canvas?.resizing_node === this || app?.canvas?.resizing_node === this);
        if (isResizing) {
          out[0] = MIN_W;
          out[1] = MIN_H;
          return out;
        }
        if (this._dsUserResized && this.size) {
          out[0] = Math.max(MIN_W, this.size[0]);
          out[1] = Math.max(MIN_H, this.size[1]);
          return out;
        }
        out[0] = DEFAULT_W;
        out[1] = DEFAULT_H;
        return out;
      };

      setTimeout(() => {
        this._dsInitialized = true;
        this._dsConfigured = true;
        if (this.size) {
          this.size[0] = Math.max(MIN_W, this.size[0]);
          if (!this._dsUserResized || this.size[1] < 400) {
            this.size[1] = DEFAULT_H;
          } else {
            this.size[1] = Math.max(MIN_H, this.size[1]);
          }
        }
        this._dsSyncHubHeight?.();
        scheduleAlign(this);
      }, 50);

      this.properties = this.properties || {};
      this.serialize_widgets = true;

      if (this.outputs) {
        for (let i = 0; i < this.outputs.length; i++) {
          if (this.outputs[i]) {
            this.outputs[i].label = " ";
          }
        }
      }

      this.widgets = this.widgets || [];
      let hw = this.widgets.find((w) => w.name === "HubState");
      if (!hw) {
        hw = {
          name: "HubState",
          type: "hidden",
          value: "{}",
          serialize: true,
          computeSize: () => [0, -4],
          draw: () => {},
        };
        this.widgets.push(hw);
      }
      hw.type = "hidden";
      hw.hidden = true;
      hw.computeSize = () => [0, -4];
      hw.draw = () => {};

      const root = buildRoot(this);
      this._domRoot = root;

      this._dsSyncHubHeight = () => {
        const rootEl = this._domRoot;
        if (!rootEl) return;
        const topY = Number.isFinite(this._hubWidget?.y)
          ? this._hubWidget.y
          : 30;
        const nodeH = this.size?.[1] || DEFAULT_H;
        const widgetH = Math.max(100, nodeH - topY - 12);
        rootEl.style.boxSizing = "border-box";
        rootEl.style.width = "100%";
        rootEl.style.height = `${widgetH}px`;
        rootEl.style.maxHeight = `${widgetH}px`;
        if (rootEl.parentElement) {
          rootEl.parentElement.style.height = `${widgetH}px`;
          rootEl.parentElement.style.maxHeight = `${widgetH}px`;
        }
      };

      this._hubWidget = this.addDOMWidget("hub_ui", "custom", root, {
        serialize: false,
        hideOnZoom: false,
        margin: 6,
        getValue: () => null,
        setValue: () => {},
      });
      this._hubWidget.computeSize = () => {
        const topY = Number.isFinite(this._hubWidget?.y)
          ? this._hubWidget.y
          : 30;
        const nodeH = this.size?.[1] || DEFAULT_H;
        const widgetH = Math.max(100, nodeH - topY - 12);
        this._dsSyncHubHeight?.();
        return [
          this.size?.[0] || DEFAULT_W,
          widgetH,
        ];
      };

      normalizeDSWidgetHost(root, this, { shell: true });
      protectDSResizeCorners(this);

      // Connection positioning to row socket slots
      this.getConnectionPos = function (is_input, slot_number, out) {
        out = out || new Float32Array(2);
        if (this.flags?.collapsed) {
          return LiteGraph.LGraphNode.prototype.getConnectionPos.apply(this, arguments);
        }
        if (!is_input && this.outputs?.[slot_number]) {
          const slot = this.outputs[slot_number];
          if (slot.pos && Number.isFinite(slot.pos[0]) && Number.isFinite(slot.pos[1])) {
            out[0] = this.pos[0] + slot.pos[0];
            out[1] = this.pos[1] + slot.pos[1];
            return out;
          }
        }
        return LiteGraph.LGraphNode.prototype.getConnectionPos.apply(this, arguments);
      };

      this._openGenerationHubGearPopover = (anchor) => openGearPopover(this, anchor);

      try {
        window.DSGlobalTheme?.applyNodeBase?.(this);
      } catch (_) {}

      fetchCatalog().then((catalog) => {
        this._catalog = catalog;
        const s = getState(this);
        const fam = detectModelFamily(s.model);
        if (fam === "krea2" && (s.clip === "Auto" || !s.clip || !/krea|qwen3vl/i.test(s.clip))) {
          const suggestedClips = filterSuggestedClips(catalog?.clips, fam);
          if (suggestedClips.length > 0) {
            s.clip = suggestedClips[0];
            saveState(this);
          }
        }
        if (!s.attention || s.attention === "Auto-Detect") {
          const autoAttn = detectAttentionType(fam, catalog);
          if (autoAttn) s.attention = autoAttn;
          saveState(this);
        }
        this._renderUI?.();
        scheduleAlign(this);
      });

      this._renderUI?.();
      watchAlign(this);
      scheduleAlign(this);
    };

    const origConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function (info) {
      this._dsInitialized = true;
      origConfigure?.apply(this, arguments);
      this._dsConfigured = true;
      this.widgets_start_y = 2;
      this._hubState = null;
      if (info?.size && Array.isArray(info.size)) {
        const savedW = Math.max(MIN_W, info.size[0]);
        const savedH = info.size[1];
        if (savedH < 400) {
          this.size = [savedW, DEFAULT_H];
          this._dsUserResized = false;
        } else {
          this.size = [savedW, Math.max(MIN_H, savedH)];
          this._dsUserResized = true;
        }
      }
      this._renderUI?.();
      this._dsSyncHubHeight?.();
      scheduleAlign(this);
    };

    const origResize = nodeType.prototype.onResize;
    nodeType.prototype.onResize = function (size) {
      if (this._dsInitialized) {
        this._dsUserResized = true;
      }
      if (size) {
        this.size[0] = Math.max(MIN_W, size[0]);
        this.size[1] = Math.max(MIN_H, size[1]);
      }
      this._dsSyncHubHeight?.();
      scheduleAlign(this);
      origResize?.apply(this, arguments);
    };

    const origRemoved = nodeType.prototype.onRemoved;
    nodeType.prototype.onRemoved = function () {
      this._dsRemoved = true;
      unwatchAlign(this);
      origRemoved?.apply(this, arguments);
    };
  },
});
