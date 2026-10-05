import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";
import {
  normalizeDSWidgetHost,
  protectDSResizeCorners,
  Toggle,
  Slider,
  DSIcon,
} from "../UIElements/index.js";

const TYPE = "DS_ImageSaveAdvance";
const DISPLAY_NAME = "DS Image Save Advance";
const EXT = "DeathshotArsenal.ImageSaveAdvance";
const PROP = "ds_image_save_advance";

const MIN_W = 340;
const MIN_H_COLLAPSED = 230;
const MIN_H_EXPANDED = 390;
const DEFAULT_W = 420;
const DEFAULT_H = 430;

const ACTIVE_POPUPS = new Map();
let cssLoaded = false;

const DEFAULT_STATE = {
  save_dir: "",
  template: "{input_name}_{date}_{time}_{counter}",
  date_style: "dd-MM-yyyy",
  counter_digits: 3,
  quality: 100,
  webp_lossless: false,
  embed_workflow: true,
  civitai: false,
  keep_input_folders: false,
  hide_toolbar: false,
  format: "png",
  counter: 1,
  input_name: "image",
  collapsed: false,
};

const INSERTS = [
  ["{input_name}", "+ Input name"],
  ["{date}", "+ Date"],
  ["{time}", "+ Time"],
  ["{counter}", "+ Counter"],
  ["{seed}", "+ Seed"],
  ["{width}", "+ Width"],
  ["{height}", "+ Height"],
  ["{batch}", "+ Batch #"],
  ["{model}", "+ Model"],
  ["{date_folder}/", "+ Date folder"],
  ["{input_folder}/", "+ Input folder"],
];

function stop(e) {
  e?.stopPropagation?.();
}

function url(path) {
  return typeof api.fileURL === "function" ? api.fileURL(path) : path;
}

function unwrap(v) {
  if (Array.isArray(v)) return v.length ? unwrap(v[0]) : "";
  return v ?? "";
}

function loadCSS() {
  if (cssLoaded || document.querySelector("link[data-ds-isa-css]")) return;
  cssLoaded = true;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.dataset.dsIsaCss = "true";
  link.href = new URL("./ds_image_save_advance.css", import.meta.url).href;
  document.head.appendChild(link);
}

function state(node) {
  node.properties ||= {};
  let s = node.properties[PROP];
  if (!s || typeof s !== "object") {
    s = node.properties[PROP] = { ...DEFAULT_STATE };
  }
  for (const [k, v] of Object.entries(DEFAULT_STATE)) {
    if (s[k] === undefined) s[k] = v;
  }
  s.format = ["png", "jpg", "webp"].includes(s.format) ? s.format : "png";
  s.date_style = ["yyyy-MM-dd", "dd-MM-yyyy", "MM-dd-yyyy"].includes(s.date_style)
    ? s.date_style
    : "dd-MM-yyyy";
  s.counter_digits = Math.max(1, Math.min(8, Number(s.counter_digits) || 3));
  s.quality = Math.max(1, Math.min(100, Number(s.quality) || 100));
  s.counter = Math.max(1, Number(s.counter) || 1);
  s.collapsed = Boolean(s.collapsed);
  return s;
}

function syncWidgets(node) {
  const s = state(node);
  const set = (name, value) => {
    const w = node.widgets?.find((x) => x?.name === name);
    if (w) w.value = String(value ?? "");
  };
  set("save_dir", s.save_dir || "");
  set("name", s.input_name || "image");
  set("suffix", "");
  set("prefix", "");
  set("config_json", JSON.stringify(s));
}

function persist(node) {
  syncWidgets(node);
  try {
    app.graph?.setDirtyCanvas?.(true, true);
  } catch {}
}

function restore(node) {
  const s = state(node);
  const w = node.widgets?.find((x) => x?.name === "config_json");
  if (w?.value) {
    try {
      const raw = Array.isArray(w.value) ? w.value.join("") : String(w.value);
      const saved = JSON.parse(raw);
      if (saved && typeof saved === "object") Object.assign(s, saved);
    } catch {}
  }
  syncWidgets(node);
  render(node);
}

function hideWidget(w) {
  if (!w) return;
  w.hidden = true;
  w.computeSize = () => [0, 0];
  w.draw = () => {};
  if (w.element) w.element.style.display = "none";
}

function hideWidgets(node) {
  for (const n of ["save_dir", "suffix", "prefix", "config_json", "name"]) {
    hideWidget(node.widgets?.find((w) => w?.name === n));
  }
}

function bodyTop(node) {
  const slotH = globalThis.LiteGraph?.NODE_SLOT_HEIGHT ?? 20;
  const inputs = (node.inputs ?? []).filter((i) => !i.widget).length;
  const outputs = (node.outputs ?? []).length;
  const rows = Math.max(inputs, outputs);
  return rows ? rows * slotH + (node.constructor.slot_start_y || 0) : 0;
}

function minContentHeight(node) {
  const s = state(node);
  const top = bodyTop(node);
  const baseCardH = s.collapsed ? 150 : 310;
  return top + baseCardH + 10;
}

/**
 * Screen rectangle of node on graph canvas.
 */
function getNodeScreenRect(node) {
  if (!node) return null;
  const canvas = app.canvas;
  const canvasEl =
    canvas?.canvas ||
    document.querySelector("canvas#graph-canvas") ||
    document.querySelector("canvas");
  const ds = canvas?.ds;
  if (!canvasEl || !ds || !Array.isArray(node.pos) || !Array.isArray(node.size)) {
    return null;
  }
  const cr = canvasEl.getBoundingClientRect();
  const scale = Number(ds.scale) || 1;
  const offset = ds.offset || [0, 0];
  const left = cr.left + (Number(node.pos[0] || 0) + Number(offset[0] || 0)) * scale;
  const top = cr.top + (Number(node.pos[1] || 0) + Number(offset[1] || 0)) * scale;
  const width = Number(node.size[0] || DEFAULT_W) * scale;
  const height = Number(node.size[1] || DEFAULT_H) * scale;
  return { left, top, width, height, right: left + width, bottom: top + height };
}

/**
 * Positions settings popup on side of node, never on top.
 */
function positionSettingsPopup(node, popup) {
  const nr = getNodeScreenRect(node);
  if (!nr) return;
  const pw = Math.max(popup.offsetWidth || 0, 360);
  const ph = Math.max(popup.offsetHeight || 0, 420);
  const margin = 12;
  const gap = 10;

  const spaceRight = window.innerWidth - nr.right - margin;
  const spaceLeft = nr.left - margin;

  let left;
  if (spaceRight >= pw + gap) {
    left = nr.right + gap;
  } else if (spaceLeft >= pw + gap) {
    left = nr.left - pw - gap;
  } else if (spaceRight >= spaceLeft) {
    left = nr.right + gap;
  } else {
    left = nr.left - pw - gap;
  }

  left = Math.max(margin, Math.min(left, window.innerWidth - pw - margin));

  let top = nr.top;
  if (top + ph > window.innerHeight - margin) {
    top = window.innerHeight - ph - margin;
  }
  top = Math.max(margin, top);

  popup.style.left = `${Math.round(left)}px`;
  popup.style.top = `${Math.round(top)}px`;
}

function closeSettingsPopup(id) {
  const item = ACTIVE_POPUPS.get(id);
  if (!item) return;
  if (item.raf) cancelAnimationFrame(item.raf);
  item.popup.remove();
  ACTIVE_POPUPS.delete(id);
}

function openSettings(node) {
  if (ACTIVE_POPUPS.has(node.id)) {
    positionSettingsPopup(node, ACTIVE_POPUPS.get(node.id).popup);
    return;
  }
  for (const id of [...ACTIVE_POPUPS.keys()]) closeSettingsPopup(id);

  const popup = document.createElement("div");
  popup.className = "ds-isa-popup";
  popup.dataset.dsThemed = "true";
  popup.addEventListener("pointerdown", stop);
  popup.addEventListener("mousedown", stop);
  popup.addEventListener("wheel", (e) => e.stopPropagation(), { passive: true });

  const item = { node, popup, raf: 0 };
  ACTIVE_POPUPS.set(node.id, item);
  document.body.appendChild(popup);

  // Popup Header
  const head = document.createElement("div");
  head.className = "ds-isa-popup-head";
  head.innerHTML = `
    <div class="ds-isa-popup-brand">DS</div>
    <div class="ds-isa-popup-titles">
      <div class="ds-isa-popup-title">Image Save Advance Settings</div>
      <div class="ds-isa-popup-sub">Save, naming, compression & metadata options</div>
    </div>
  `;

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "ds-isa-popup-close";
  closeBtn.title = "Close";
  closeBtn.appendChild(DSIcon("x", { size: 14 }));
  closeBtn.addEventListener("click", (e) => {
    stop(e);
    closeSettingsPopup(node.id);
  });
  head.appendChild(closeBtn);
  popup.appendChild(head);

  // Popup Body
  const body = document.createElement("div");
  body.className = "ds-isa-popup-body";
  const s = state(node);

  // Section: Date & Counter
  const dateSec = document.createElement("div");
  dateSec.className = "ds-isa-section";
  const dateLabel = document.createElement("div");
  dateLabel.className = "ds-isa-section-label";
  dateLabel.textContent = "Date Style & Counter Digits";
  dateSec.appendChild(dateLabel);

  const segGroup = document.createElement("div");
  segGroup.className = "ds-isa-seg-group";
  const dateFormats = ["yyyy-MM-dd", "dd-MM-yyyy", "MM-dd-yyyy"];
  dateFormats.forEach((fmt) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `ds-isa-seg-btn${s.date_style === fmt ? " is-active" : ""}`;
    btn.textContent = fmt;
    btn.addEventListener("click", (e) => {
      stop(e);
      s.date_style = fmt;
      segGroup.querySelectorAll(".ds-isa-seg-btn").forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      persist(node);
      render(node);
    });
    segGroup.appendChild(btn);
  });
  dateSec.appendChild(segGroup);

  const counterSlider = Slider({
    label: "Counter digits",
    min: 1,
    max: 8,
    step: 1,
    value: s.counter_digits,
    onChange: (val) => {
      s.counter_digits = Math.round(val);
      persist(node);
      render(node);
    },
  });
  dateSec.appendChild(counterSlider.root);
  body.appendChild(dateSec);

  // Section: Quality
  const qualitySec = document.createElement("div");
  qualitySec.className = "ds-isa-section";
  const qualityLabel = document.createElement("div");
  qualityLabel.className = "ds-isa-section-label";
  qualityLabel.textContent = "JPG / WebP Quality";
  qualitySec.appendChild(qualityLabel);

  const qualitySlider = Slider({
    label: "Quality",
    min: 1,
    max: 100,
    step: 1,
    value: s.quality,
    onChange: (val) => {
      s.quality = Math.round(val);
      persist(node);
      render(node);
    },
  });
  qualitySec.appendChild(qualitySlider.root);
  body.appendChild(qualitySec);

  // Section: Metadata & Options
  const toggleSec = document.createElement("div");
  toggleSec.className = "ds-isa-section";
  const toggleLabel = document.createElement("div");
  toggleLabel.className = "ds-isa-section-label";
  toggleLabel.textContent = "Saving Options";
  toggleSec.appendChild(toggleLabel);

  const toggles = [
    {
      key: "webp_lossless",
      label: "WebP lossless",
      desc: "Use lossless WebP compression.",
    },
    {
      key: "embed_workflow",
      label: "Embed workflow",
      desc: "Embed ComfyUI prompt & workflow metadata in image.",
    },
    {
      key: "civitai",
      label: "Civitai generation info",
      desc: "Include Civitai/A1111 compatible generation parameters.",
    },
    {
      key: "keep_input_folders",
      label: "Keep input folders",
      desc: "Preserve subfolders from upstream input paths.",
    },
  ];

  toggles.forEach(({ key, label, desc }) => {
    const t = Toggle({
      label,
      description: desc,
      checked: Boolean(s[key]),
      onChange: (val) => {
        s[key] = val;
        persist(node);
        render(node);
      },
    });
    toggleSec.appendChild(t.root);
  });
  body.appendChild(toggleSec);
  popup.appendChild(body);

  // Popup Footer
  const foot = document.createElement("div");
  foot.className = "ds-isa-popup-foot";

  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "ds-isa-foot-btn";
  resetBtn.textContent = "Reset to Defaults";
  resetBtn.addEventListener("click", (e) => {
    stop(e);
    Object.assign(state(node), DEFAULT_STATE);
    persist(node);
    render(node);
    closeSettingsPopup(node.id);
    openSettings(node);
  });

  const doneBtn = document.createElement("button");
  doneBtn.type = "button";
  doneBtn.className = "ds-isa-foot-btn ds-isa-btn-primary";
  doneBtn.textContent = "Done";
  doneBtn.addEventListener("click", (e) => {
    stop(e);
    closeSettingsPopup(node.id);
  });

  foot.append(resetBtn, doneBtn);
  popup.appendChild(foot);

  positionSettingsPopup(node, popup);

  // Follow loop tracking canvas pan / zoom / drag
  item.raf = requestAnimationFrame(function loop() {
    if (!document.body.contains(popup)) return;
    positionSettingsPopup(node, popup);
    item.raf = requestAnimationFrame(loop);
  });
}

function toggleSettings(node) {
  if (ACTIVE_POPUPS.has(node.id)) {
    closeSettingsPopup(node.id);
  } else {
    openSettings(node);
  }
}

// -----------------------------------------------------------------------------
// Runtime token resolution
// -----------------------------------------------------------------------------
function collectGraphNodes() {
  const root = app.graph?.rootGraph || app.graph;
  const out = [];
  const seen = new Set();
  const walk = (g) => {
    if (!g || seen.has(g)) return;
    seen.add(g);
    for (const n of g._nodes || g.nodes || []) {
      if (!n) continue;
      out.push(n);
      const inner = n.subgraph || n.graph || n._graph;
      if (inner && inner !== g) walk(inner);
    }
  };
  walk(root);
  return out;
}

function graphLinkOrigin(graph, linkId) {
  if (linkId == null) return null;
  try {
    const links = graph?.links;
    const link = links?.get ? links.get(linkId) : links?.[linkId];
    if (link) return link.origin_id ?? link.originId ?? null;
  } catch {}
  return null;
}

function originNode(node, inputName, nodes) {
  const inp = node?.inputs?.find?.((x) => x?.name === inputName);
  if (!inp || inp.link == null) return null;
  const oid = graphLinkOrigin(node.graph || app.graph, inp.link);
  if (oid == null) return null;
  return nodes.find((n) => String(n.id) === String(oid)) || null;
}

function upstreamFromImage(node, nodes) {
  const queue = [];
  const first = originNode(node, "image", nodes);
  if (first) queue.push(first);
  const seen = new Set();
  const out = [];
  while (queue.length && out.length < 1000) {
    const cur = queue.shift();
    if (!cur || seen.has(String(cur.id))) continue;
    seen.add(String(cur.id));
    out.push(cur);
    for (const inp of cur.inputs || []) {
      const src = originNode(cur, inp.name, nodes);
      if (src && !seen.has(String(src.id))) queue.push(src);
    }
  }
  return out;
}

function cleanModelName(value) {
  let v = value == null ? "" : String(value).trim().replace(/\\/g, "/");
  if (!v) return "";
  v = v.split("/").pop();
  v = v.replace(/\.(safetensors|ckpt|pt|pth|bin)$/i, "");
  return v;
}

function findModelValue(node, nodes) {
  const keys = ["ckpt_name", "unet_name", "model_name", "model_path", "checkpoint", "checkpoint_name"];
  const upstream = upstreamFromImage(node, nodes);
  const modelInputs = new Set(["model", "unet", "base_model", "diffusion_model", "guider"]);
  const sampler = upstream.find((n) => {
    const type = String(n?.type || n?.comfyClass || "").toLowerCase();
    return type.includes("sampler") && !type.includes("samplerselect");
  });
  if (sampler) {
    const queue = [];
    for (const inp of sampler.inputs || []) {
      if (!modelInputs.has(inp.name)) continue;
      const src = originNode(sampler, inp.name, nodes);
      if (src) queue.push(src);
    }
    const seen = new Set();
    while (queue.length) {
      const n = queue.shift();
      if (!n || seen.has(String(n.id))) continue;
      seen.add(String(n.id));
      const w = n.widgets?.find?.((x) => x && keys.includes(x.name));
      const val = cleanModelName(w?.value);
      if (val) return val;
      for (const inp of n.inputs || []) {
        const src = originNode(n, inp.name, nodes);
        if (src && !seen.has(String(src.id))) queue.push(src);
      }
    }
  }
  for (const n of upstream) {
    const w = n.widgets?.find?.((x) => x && keys.includes(x.name));
    const val = cleanModelName(w?.value);
    if (val) return val;
  }
  for (const n of nodes) {
    const w = n.widgets?.find?.((x) => x && keys.includes(x.name));
    const val = cleanModelName(w?.value);
    if (val) return val;
  }
  return "";
}

function findSeedValue(node, nodes) {
  const upstream = upstreamFromImage(node, nodes);
  for (const n of upstream) {
    const type = String(n.type || n.comfyClass || "").toLowerCase();
    if (!type.includes("sampler") || type.includes("samplerselect")) continue;
    const w = n.widgets?.find?.((x) => x && ["seed", "noise_seed", "random_seed", "variation_seed"].includes(x.name));
    if (w && w.value != null && String(w.value).trim() !== "") return String(w.value);
  }
  for (const n of nodes) {
    const w = n.widgets?.find?.((x) => x && ["seed", "noise_seed"].includes(x.name));
    if (w && w.value != null && String(w.value).trim() !== "") return String(w.value);
  }
  return "";
}

function resolveRuntimeTemplate(node, rawConfig) {
  let cfg;
  try {
    cfg = JSON.parse(rawConfig || "{}");
  } catch {
    cfg = {};
  }
  if (!cfg || typeof cfg !== "object") cfg = {};
  const nodes = collectGraphNodes();
  const model = findModelValue(node, nodes);
  const seed = findSeedValue(node, nodes);
  let template = String(cfg.template || "");
  template = template.replace(/\{model\}/g, model || "model");
  template = template.replace(/\{seed\}/g, seed || "0");
  cfg.template = template;
  cfg._runtime = { model, seed };
  return JSON.stringify(cfg);
}

function installRuntimeTokenHook() {
  if (app._dsIsaRuntimeTokenHook) return;
  app._dsIsaRuntimeTokenHook = true;
  const original = app.graphToPrompt?.bind(app);
  if (!original) return;
  app.graphToPrompt = async function (...args) {
    const result = await original(...args);
    try {
      const out = result?.output || {};
      const nodes = collectGraphNodes();
      for (const id in out) {
        const entry = out[id];
        if (!entry || entry.class_type !== TYPE || !entry.inputs) continue;
        const node = nodes.find((n) => String(n.id) === String(id));
        if (!node) continue;
        if (entry.inputs.config_json != null) {
          entry.inputs.config_json = resolveRuntimeTemplate(node, entry.inputs.config_json);
        }
        if (entry.inputs.name == null || entry.inputs.name === "") {
          entry.inputs.name = state(node).input_name || "image";
        }
      }
    } catch (e) {
      console.warn("[DS Image Save Advance] runtime token resolution error:", e);
    }
    return result;
  };
}

/**
 * Builds the Card element which acts directly as the DOM widget root.
 * Hierarchy: Node Base -> Card (5px margin) -> UI (10px padding).
 */
function buildCard(node) {
  const card = document.createElement("div");
  card.className = "ds-ui-card ds-isa-card";
  card.dataset.dsThemed = "true";

  // 1. Header (Gear icon is removed from node face; exists in toolbar gear menu)
  const header = document.createElement("div");
  header.className = "ds-isa-header";

  const leftGroup = document.createElement("div");
  leftGroup.className = "ds-isa-header-left";

  const brand = document.createElement("div");
  brand.className = "ds-isa-brand";
  brand.textContent = "DS";

  const title = document.createElement("div");
  title.className = "ds-isa-title";
  title.textContent = "Image Save Advance";

  leftGroup.append(brand, title);

  const rightGroup = document.createElement("div");
  rightGroup.className = "ds-isa-header-actions";

  const collapseBtn = document.createElement("button");
  collapseBtn.type = "button";
  collapseBtn.className = "ds-isa-collapse-btn";
  collapseBtn.title = "Expand / Collapse Settings";
  collapseBtn.appendChild(DSIcon("chevron-down", { size: 14 }));
  collapseBtn.addEventListener("pointerdown", stop);
  collapseBtn.addEventListener("click", (e) => {
    stop(e);
    toggleCollapse(node);
  });

  rightGroup.appendChild(collapseBtn);
  header.append(leftGroup, rightGroup);
  card.appendChild(header);

  // 2. Collapsible Config Section
  const configSec = document.createElement("div");
  configSec.className = "ds-isa-config";
  configSec.dataset.config = "true";

  // Output folder row
  const folderGroup = document.createElement("div");
  folderGroup.className = "ds-isa-field-group";
  const folderLabel = document.createElement("div");
  folderLabel.className = "ds-isa-label";
  folderLabel.textContent = "Output Folder";

  const folderRow = document.createElement("div");
  folderRow.className = "ds-isa-input-row";

  const dirInput = document.createElement("input");
  dirInput.className = "ds-isa-input";
  dirInput.placeholder = "ComfyUI output folder...";
  dirInput.addEventListener("input", () => {
    state(node).save_dir = dirInput.value;
    persist(node);
  });

  const browseBtn = document.createElement("button");
  browseBtn.type = "button";
  browseBtn.className = "ds-isa-browse-btn";
  browseBtn.textContent = "Browse";
  browseBtn.addEventListener("pointerdown", stop);
  browseBtn.addEventListener("click", (e) => {
    stop(e);
    showBrowser(node);
  });

  folderRow.append(dirInput, browseBtn);
  folderGroup.append(folderLabel, folderRow);
  configSec.appendChild(folderGroup);

  // Image name row
  const nameGroup = document.createElement("div");
  nameGroup.className = "ds-isa-field-group";
  const nameLabel = document.createElement("div");
  nameLabel.className = "ds-isa-label";
  nameLabel.textContent = "Image Name";

  const nameInput = document.createElement("input");
  nameInput.className = "ds-isa-input";
  nameInput.placeholder = "image";
  nameInput.addEventListener("input", () => {
    state(node).input_name = nameInput.value;
    persist(node);
  });

  nameGroup.append(nameLabel, nameInput);
  configSec.appendChild(nameGroup);

  // Filename template row
  const templateGroup = document.createElement("div");
  templateGroup.className = "ds-isa-field-group";
  const templateLabel = document.createElement("div");
  templateLabel.className = "ds-isa-label";
  templateLabel.textContent = "Filename Template";

  const templateInput = document.createElement("input");
  templateInput.className = "ds-isa-input";
  templateInput.placeholder = "{input_name}_{date}_{time}_{counter}";
  templateInput.addEventListener("input", () => {
    state(node).template = templateInput.value;
    persist(node);
  });

  templateGroup.append(templateLabel, templateInput);
  configSec.appendChild(templateGroup);

  // Insert token chips
  const insertsWrap = document.createElement("div");
  insertsWrap.className = "ds-isa-inserts";

  INSERTS.forEach(([token, label]) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "ds-isa-insert-btn";
    chip.textContent = label;
    chip.title = token;
    chip.addEventListener("pointerdown", stop);
    chip.addEventListener("click", (e) => {
      stop(e);
      insertToken(node, token);
    });
    insertsWrap.appendChild(chip);
  });

  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className = "ds-isa-insert-btn ds-isa-insert-clear";
  clearBtn.textContent = "Clear";
  clearBtn.addEventListener("pointerdown", stop);
  clearBtn.addEventListener("click", (e) => {
    stop(e);
    state(node).template = "";
    persist(node);
    render(node);
  });
  insertsWrap.appendChild(clearBtn);

  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "ds-isa-insert-btn";
  resetBtn.textContent = "Reset";
  resetBtn.addEventListener("pointerdown", stop);
  resetBtn.addEventListener("click", (e) => {
    stop(e);
    state(node).template = DEFAULT_STATE.template;
    persist(node);
    render(node);
  });
  insertsWrap.appendChild(resetBtn);

  configSec.appendChild(insertsWrap);
  card.appendChild(configSec);

  // 3. Status Bar (Outside collapsible config)
  const statusEl = document.createElement("div");
  statusEl.className = "ds-isa-status";
  statusEl.textContent = "Automatic save · PNG · batch-safe";
  card.appendChild(statusEl);

  // 4. Action Row (Outside collapsible config)
  const actionsRow = document.createElement("div");
  actionsRow.className = "ds-isa-actions";

  const openBtn = document.createElement("button");
  openBtn.type = "button";
  openBtn.className = "ds-isa-action-btn";
  openBtn.appendChild(DSIcon("external-link", { size: 12 }));
  openBtn.append("Open");
  openBtn.addEventListener("pointerdown", stop);
  openBtn.addEventListener("click", (e) => {
    stop(e);
    openLast(node);
  });

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "ds-isa-action-btn";
  copyBtn.appendChild(DSIcon("copy", { size: 12 }));
  copyBtn.append("Copy");
  copyBtn.addEventListener("pointerdown", stop);
  copyBtn.addEventListener("click", (e) => {
    stop(e);
    copyLast(node);
  });

  const folderBtn = document.createElement("button");
  folderBtn.type = "button";
  folderBtn.className = "ds-isa-action-btn";
  folderBtn.appendChild(DSIcon("folder", { size: 12 }));
  folderBtn.append("Folder");
  folderBtn.addEventListener("pointerdown", stop);
  folderBtn.addEventListener("click", (e) => {
    stop(e);
    openFolder(node);
  });

  actionsRow.append(openBtn, copyBtn, folderBtn);

  ["png", "jpg", "webp"].forEach((fmt) => {
    const fmtBtn = document.createElement("button");
    fmtBtn.type = "button";
    fmtBtn.className = "ds-isa-action-btn";
    fmtBtn.dataset.format = fmt;
    fmtBtn.textContent = fmt.toUpperCase();
    fmtBtn.addEventListener("pointerdown", stop);
    fmtBtn.addEventListener("click", (e) => {
      stop(e);
      saveManual(node, fmt);
    });
    actionsRow.appendChild(fmtBtn);
  });

  card.appendChild(actionsRow);

  // 5. Image Preview Area (NOT inside collapsible menu, grows to fill card)
  const previewEl = document.createElement("div");
  previewEl.className = "ds-isa-preview";
  previewEl.innerHTML = `
    <div class="ds-isa-preview-empty">
      No image saved yet
      <span>Run the workflow to populate the preview.</span>
    </div>
  `;
  card.appendChild(previewEl);

  // Store element references on node
  node.cardEl = card;
  node.configSec = configSec;
  node.dirInput = dirInput;
  node.nameInput = nameInput;
  node.templateInput = templateInput;
  node.statusEl = statusEl;
  node.previewEl = previewEl;
  node.actionsRow = actionsRow;

  return card;
}

function insertToken(node, token) {
  const input = node.templateInput;
  if (!input) return;
  const a = input.selectionStart ?? input.value.length;
  const b = input.selectionEnd ?? a;
  const before = input.value.slice(0, a);
  const after = input.value.slice(b);
  let glue = "";
  if (before && !/[\s_\-./]$/.test(before)) {
    if (token === "{height}" && /\{width\}$/.test(before)) glue = "x";
    else glue = "_";
  }
  if (token === "{date_folder}/" && before && !/[\/\-_.]$/.test(before)) glue = "/";
  const insert = glue + token;
  input.value = before + insert + after;
  const p = a + insert.length;
  input.focus();
  input.setSelectionRange(p, p);
  state(node).template = input.value;
  persist(node);
}

function toggleCollapse(node) {
  const s = state(node);
  s.collapsed = !s.collapsed;
  persist(node);
  render(node);

  // Sizing invariant: collapsing must NEVER shrink the node height.
  // Expanding ensures minimum height is respected so expanded content is never clipped.
  if (!s.collapsed) {
    const minH = minContentHeight(node);
    if (node.size && node.size[1] < minH) {
      node.size[1] = minH;
      node.setSize?.([node.size[0], minH]);
      node.setDirtyCanvas?.(true, true);
    }
  }
}

function render(node) {
  if (!node.cardEl) return;
  const s = state(node);

  node.cardEl.classList.toggle("is-collapsed", s.collapsed);
  if (node.dirInput) node.dirInput.value = s.save_dir || "";
  if (node.nameInput) node.nameInput.value = s.input_name || "image";
  if (node.templateInput) node.templateInput.value = s.template || "";

  if (node.statusEl) {
    const ctr = String(s.counter).padStart(s.counter_digits, "0");
    node.statusEl.textContent = `Automatic save · ${s.format.toUpperCase()} · batch-safe · counter ${ctr}`;
  }

  if (node.actionsRow) {
    node.actionsRow.querySelectorAll("[data-format]").forEach((b) => {
      b.classList.toggle("is-active", b.dataset.format === s.format);
    });
  }

  updatePreview(node);
}

function updatePreview(node) {
  const p = node._isaLastPath;
  if (!node.previewEl) return;
  node.previewEl.innerHTML = "";
  if (!p) {
    node.previewEl.innerHTML = `
      <div class="ds-isa-preview-empty">
        No image saved yet
        <span>Run the workflow to populate the preview.</span>
      </div>
    `;
    return;
  }
  const img = document.createElement("img");
  img.alt = "Last saved image";
  img.draggable = false;
  img.src = url(`/ds/image_save_advance/preview?path=${encodeURIComponent(p)}&t=${Date.now()}`);
  img.onerror = () => {
    node.previewEl.innerHTML = `
      <div class="ds-isa-preview-empty">
        Preview unavailable
        <span>The saved file may have moved or was deleted.</span>
      </div>
    `;
  };
  node.previewEl.appendChild(img);
}

async function showBrowser(node) {
  const modal = document.createElement("div");
  modal.className = "ds-isa-modal";
  modal.addEventListener("pointerdown", (e) => {
    if (e.target === modal) modal.remove();
    else stop(e);
  });

  const box = document.createElement("div");
  box.className = "ds-isa-browser";
  box.innerHTML = `
    <div class="ds-isa-browser-head">
      <div class="ds-isa-browser-title">Browse Output Folders</div>
      <button class="ds-isa-popup-close" data-close title="Close"></button>
    </div>
    <div class="ds-isa-browser-path" data-path></div>
    <div class="ds-isa-dirlist" data-list></div>
    <div class="ds-isa-browser-foot">
      <button class="ds-isa-foot-btn" data-up>↑ Up</button>
      <button class="ds-isa-foot-btn ds-isa-btn-primary" data-select>Select This Folder</button>
    </div>
  `;
  modal.appendChild(box);
  document.body.appendChild(modal);

  const closeBtn = box.querySelector("[data-close]");
  closeBtn.appendChild(DSIcon("x", { size: 14 }));

  const pathEl = box.querySelector("[data-path]");
  const list = box.querySelector("[data-list]");
  let current = node.dirInput?.value || "";

  const load = async () => {
    try {
      const r = await fetch(url("/ds/image_save_advance/list_dir"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: current }),
      });
      const d = await r.json();
      current = d.current || current;
      pathEl.textContent = current;
      list.innerHTML = "";
      for (const name of d.dirs || []) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "ds-isa-dir";
        b.textContent = `📁 ${name}`;
        b.addEventListener("pointerdown", stop);
        b.addEventListener("click", (e) => {
          stop(e);
          current = `${current.replace(/[\\/]$/, "")}/${name}`;
          load();
        });
        list.appendChild(b);
      }
      if (!(d.dirs || []).length) {
        list.innerHTML = `<div class="ds-isa-no-dirs">No subfolders found</div>`;
      }
    } catch (e) {
      console.warn("[DS Image Save Advance] browse failed:", e);
    }
  };

  closeBtn.addEventListener("pointerdown", stop);
  closeBtn.addEventListener("click", (e) => {
    stop(e);
    modal.remove();
  });

  box.querySelector("[data-up]").addEventListener("pointerdown", stop);
  box.querySelector("[data-up]").addEventListener("click", (e) => {
    stop(e);
    const p = current.replace(/[\\/]$/, "");
    const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
    current = i > 1 ? p.slice(0, i) : "";
    load();
  });

  box.querySelector("[data-select]").addEventListener("pointerdown", stop);
  box.querySelector("[data-select]").addEventListener("click", (e) => {
    stop(e);
    state(node).save_dir = current;
    persist(node);
    render(node);
    modal.remove();
  });

  load();
}

function lastPath(node) {
  return node._isaLastPath || "";
}

async function openLast(node) {
  const p = lastPath(node);
  if (!p) return toast(node, "No saved image yet");
  try {
    const r = await fetch(url("/ds/image_save_advance/open"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: p }),
    });
    const d = await r.json();
    if (!d.success) toast(node, d.error || "Open failed");
  } catch (e) {
    console.warn(e);
    toast(node, "Open failed");
  }
}

async function openFolder(node) {
  const p = lastPath(node) || state(node).save_dir;
  if (!p) return toast(node, "No output folder set");
  try {
    const r = await fetch(url("/ds/image_save_advance/folder"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: p }),
    });
    const d = await r.json();
    if (!d.success) toast(node, d.error || "Folder open failed");
  } catch (e) {
    console.warn(e);
    toast(node, "Folder open failed");
  }
}

async function copyLast(node) {
  const p = lastPath(node);
  if (!p) return toast(node, "No saved image yet");
  try {
    await navigator.clipboard.writeText(p);
    toast(node, "File path copied");
  } catch {
    toast(node, "Clipboard access unavailable");
  }
}

async function saveManual(node, format) {
  state(node).format = format;
  persist(node);
  render(node);
  const p = lastPath(node);
  if (!p) return toast(node, `Format changed to ${format.toUpperCase()}`);
  try {
    const r = await fetch(url("/ds/image_save_advance/convert"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: p,
        format,
        quality: state(node).quality,
        webp_lossless: state(node).webp_lossless,
      }),
    });
    const d = await r.json();
    if (d.success) {
      node._isaLastPath = d.path;
      updatePreview(node);
      toast(node, `Saved ${format.toUpperCase()}`);
    } else {
      toast(node, d.error || "Save failed");
    }
  } catch (e) {
    console.warn(e);
    toast(node, "Save failed");
  }
}

function toast(node, msg) {
  if (!node.cardEl) return;
  const old = node.cardEl.querySelector(".ds-isa-toast");
  old?.remove();
  const t = document.createElement("div");
  t.className = "ds-isa-toast";
  t.textContent = msg;
  node.cardEl.appendChild(t);
  setTimeout(() => t.remove(), 1600);
}

function patchNode(node) {
  if (!node || node.type !== TYPE || node._isaPatched) return;
  node._isaPatched = true;
  loadCSS();

  node.resizable = true;
  node.min_size = [MIN_W, MIN_H_COLLAPSED];
  if (!Array.isArray(node.size) || node.size[0] < MIN_W || node.size[1] < MIN_H_COLLAPSED) {
    node.size = [DEFAULT_W, DEFAULT_H];
  }

  state(node);
  node.widgets ||= [];
  for (const [name, def] of [
    ["save_dir", ""],
    ["suffix", ""],
    ["prefix", ""],
    ["config_json", ""],
    ["name", "image"],
  ]) {
    if (!node.widgets.find((w) => w?.name === name)) {
      node.addWidget("text", name, def, () => {}, { hidden: true });
    }
  }
  hideWidgets(node);

  // Build the Card as the DOM widget root
  const card = buildCard(node);
  const widget = node.addDOMWidget("image_save_advance_ui", "custom", card, {
    margin: 5,
    serialize: false,
    hideOnZoom: false,
    getValue: () => null,
    setValue: () => {},
  });
  node._isaWidget = widget;

  normalizeDSWidgetHost(card, node, { shell: false });
  protectDSResizeCorners(node);

  // Position card 5px below node header/sockets
  Object.defineProperty(node, "widgets_start_y", {
    configurable: true,
    get() {
      return bodyTop(this);
    },
    set() {},
  });

  // Calculate minimum size so LiteGraph clamp respects content
  const baseComputeSize = node.computeSize;
  node.computeSize = function (out) {
    const size = baseComputeSize ? baseComputeSize.call(this, out) : [MIN_W, MIN_H_COLLAPSED];
    size[0] = Math.max(size[0], MIN_W);
    const minH = minContentHeight(this);
    size[1] = Math.max(size[1], minH);
    return size;
  };

  // Canvas hit testing delegation: empty card area and corners belong to canvas
  const baseGetWidgetOnPos = node.getWidgetOnPos;
  node.getWidgetOnPos = function (canvasX, canvasY, includeDisabled = false) {
    const localX = canvasX - this.pos[0];
    const localY = canvasY - this.pos[1];
    const w = this.size[0];
    const h = this.size[1];

    if (
      (localX >= w - 24 && localY >= h - 24) ||
      (localX <= 24 && localY >= h - 24) ||
      localY >= h - 14
    ) {
      return undefined;
    }

    const hit = baseGetWidgetOnPos
      ? baseGetWidgetOnPos.call(this, canvasX, canvasY, includeDisabled)
      : undefined;
    return hit === widget ? undefined : hit;
  };

  restore(node);
}

app.registerExtension({
  name: EXT,

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData?.name !== TYPE) return;

    const LG = window.LiteGraph || {};
    nodeType.title_mode = LG.NORMAL != null ? LG.NORMAL : 0;

    const oldCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const r = oldCreated?.apply(this, arguments);
      patchNode(this);
      return r;
    };

    const oldConfigure = nodeType.prototype.configure;
    nodeType.prototype.configure = function () {
      const r = oldConfigure?.apply(this, arguments);
      setTimeout(() => restore(this), 30);
      return r;
    };

    const oldSerialize = nodeType.prototype.serialize;
    nodeType.prototype.serialize = function () {
      persist(this);
      return oldSerialize?.apply(this, arguments) || {};
    };

    const oldRemoved = nodeType.prototype.onRemoved;
    nodeType.prototype.onRemoved = function () {
      closeSettingsPopup(this.id);
      return oldRemoved?.apply(this, arguments);
    };

    nodeType.prototype.onExecuted = function (message) {
      const path = unwrap(message?.last_path) || unwrap(message?.paths)?.at?.(-1);
      if (path) this._isaLastPath = String(path);
      const next = Number(unwrap(message?.next_counter));
      if (Number.isFinite(next) && next > 0) state(this).counter = next;
      const fmt = unwrap(message?.format);
      if (fmt) state(this).format = String(fmt);
      const dir = unwrap(message?.dir);
      if (dir) state(this).save_dir = String(dir);
      persist(this);
      render(this);
      this.setDirtyCanvas?.(true, true);
    };

    // Register popover triggers for toolbar gear menu
    nodeType.prototype._openImageSaveAdvanceGearPopover = function () {
      openSettings(this);
    };

    nodeType.prototype._toggleImageSaveAdvanceGearPopover = function () {
      toggleSettings(this);
    };

    // Context menu entry for settings
    const origGetExtraMenuOptions = nodeType.prototype.getExtraMenuOptions;
    nodeType.prototype.getExtraMenuOptions = function (canvas, options) {
      origGetExtraMenuOptions?.apply(this, arguments);
      options.unshift({
        content: "⚙️ Image Save Advance Settings",
        callback: () => {
          openSettings(this);
        },
      });
    };
  },

  nodeCreated(node) {
    patchNode(node);
  },

  loadedGraphNode(node) {
    patchNode(node);
  },

  async setup() {
    loadCSS();
    installRuntimeTokenHook();

    // Register with floating toolbar gear menu (window.DSGearMenu)
    if (typeof window !== "undefined" && window.DSGearMenu?.register) {
      const gearConfig = {
        tooltip: "DS Image Save Advance Settings",
        onClick: (node) => {
          const targetNode = node || app?.canvas?.current_node;
          if (targetNode) {
            toggleSettings(targetNode);
          }
        },
      };
      window.DSGearMenu.register(TYPE, gearConfig);
      window.DSGearMenu.register(DISPLAY_NAME, gearConfig);
    }

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        for (const id of [...ACTIVE_POPUPS.keys()]) closeSettingsPopup(id);
      }
    });

    try {
      const r = await fetch(url("/ds/image_save_advance/state"));
      const saved = await r.json();
      for (const n of app.graph?._nodes || []) {
        if (n?.type === TYPE) {
          const st = saved?.nodes?.[String(n.id)];
          if (st?.last_path) n._isaLastPath = st.last_path;
          if (!state(n).save_dir && saved?.default_dir) {
            state(n).save_dir = saved.default_dir;
          }
          render(n);
          syncWidgets(n);
        }
      }
    } catch (e) {
      console.warn("[DS Image Save Advance] state restore failed:", e);
    }
  },
});
