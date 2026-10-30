import { app } from "/scripts/app.js";
import { attachNodeShortcuts } from "../UIElements/shortcuts.js";
import { api } from "/scripts/api.js";
import {
  normalizeDSWidgetHost,
  protectDSResizeCorners,
  Toggle,
  Slider,
  Button,
  Input,
  InputRow,
  Modal,
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

// Shared DS button that keeps its press away from the canvas.
function btn(options) {
  const b = Button(options);
  b.root.addEventListener("pointerdown", stop);
  return b;
}

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

  const closeBtn = btn({
    icon: "x",
    compact: true,
    tooltip: "Close",
    onClick: (e) => {
      stop(e);
      closeSettingsPopup(node.id);
    },
  });
  head.appendChild(closeBtn.root);
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
  segGroup.className = "ds-ui-btn-group ds-isa-seg-group";
  const dateBtns = ["yyyy-MM-dd", "dd-MM-yyyy", "MM-dd-yyyy"].map((fmt) => btn({
    label: fmt,
    active: s.date_style === fmt,
    onClick: (e, b) => {
      stop(e);
      s.date_style = fmt;
      dateBtns.forEach((other) => other.setActive(other === b));
      persist(node);
      render(node);
    },
  }));
  segGroup.append(...dateBtns.map((b) => b.root));
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

  const resetBtn = btn({
    label: "Reset to Defaults",
    onClick: (e) => {
      stop(e);
      Object.assign(state(node), DEFAULT_STATE);
      persist(node);
      render(node);
      closeSettingsPopup(node.id);
      openSettings(node);
    },
  });
  const doneBtn = btn({
    label: "Done",
    variant: "primary",
    onClick: (e) => {
      stop(e);
      closeSettingsPopup(node.id);
    },
  });
  foot.append(resetBtn.root, doneBtn.root);
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

  const deleteBtn = btn({
    icon: "trash-2",
    compact: true,
    tooltip: "Delete last saved image",
    className: "ds-isa-delete-btn",
    onClick: (e) => {
      stop(e);
      deleteLast(node);
    },
  });
  const collapseBtn = btn({
    icon: "chevron-down",
    compact: true,
    tooltip: "Expand / Collapse Settings",
    className: "ds-isa-collapse-btn",
    onClick: (e) => {
      stop(e);
      toggleCollapse(node);
    },
  });
  rightGroup.append(deleteBtn.root, collapseBtn.root);
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

  const folderRow = InputRow({
    placeholder: "ComfyUI output folder...",
    actions: [btn({
      label: "Browse",
      compact: true,
      onClick: (e) => {
        stop(e);
        showBrowser(node);
      },
    })],
  });
  const dirInput = folderRow.input;
  const cleanDirInput = () => {
    let val = dirInput.value.trim();
    while (
      val.length >= 2 &&
      ((val[0] === '"' && val[val.length - 1] === '"') ||
        (val[0] === "'" && val[val.length - 1] === "'") ||
        (val[0] === "`" && val[val.length - 1] === "`"))
    ) {
      val = val.slice(1, -1).trim();
    }
    val = val.replace(/^["'`]+|["'`]+$/g, "").trim();
    if (dirInput.value !== val) {
      dirInput.value = val;
    }
    state(node).save_dir = val;
    persist(node);
  };
  dirInput.addEventListener("input", () => {
    state(node).save_dir = dirInput.value;
    persist(node);
  });
  dirInput.addEventListener("change", cleanDirInput);
  dirInput.addEventListener("paste", () => setTimeout(cleanDirInput, 0));

  folderGroup.append(folderLabel, folderRow.root);
  configSec.appendChild(folderGroup);

  // Image name row
  const nameGroup = document.createElement("div");
  nameGroup.className = "ds-isa-field-group";
  const nameLabel = document.createElement("div");
  nameLabel.className = "ds-isa-label";
  nameLabel.textContent = "Image Name";

  const nameInput = Input({
    placeholder: "image",
    onInput: (val) => {
      state(node).input_name = val;
      persist(node);
    },
  }).root;

  nameGroup.append(nameLabel, nameInput);
  configSec.appendChild(nameGroup);

  // Filename template row
  const templateGroup = document.createElement("div");
  templateGroup.className = "ds-isa-field-group";
  const templateLabel = document.createElement("div");
  templateLabel.className = "ds-isa-label";
  templateLabel.textContent = "Filename Template";

  const templateInput = Input({
    placeholder: "{input_name}_{date}_{time}_{counter}",
    onInput: (val) => {
      state(node).template = val;
      persist(node);
    },
  }).root;

  templateGroup.append(templateLabel, templateInput);
  configSec.appendChild(templateGroup);

  // Insert token chips
  const insertsWrap = document.createElement("div");
  insertsWrap.className = "ds-isa-inserts";

  const chip = (label, tooltip, onClick) => btn({
    label,
    tooltip,
    compact: true,
    onClick: (e) => {
      stop(e);
      onClick();
    },
  }).root;
  INSERTS.forEach(([token, label]) => {
    insertsWrap.appendChild(chip(label, token, () => insertToken(node, token)));
  });
  insertsWrap.appendChild(chip("Clear", "Clear template", () => {
    state(node).template = "";
    persist(node);
    render(node);
  }));
  insertsWrap.appendChild(chip("Reset", "Reset template", () => {
    state(node).template = DEFAULT_STATE.template;
    persist(node);
    render(node);
  }));

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

  const action = (options, onClick) => btn({
    ...options,
    compact: true,
    onClick: (e) => {
      stop(e);
      onClick();
    },
  }).root;
  actionsRow.append(
    action({ icon: "external-link", label: "Open" }, () => openLast(node)),
    action({ icon: "copy", label: "Copy" }, () => copyLast(node)),
    action({ icon: "folder", label: "Folder" }, () => openFolder(node)),
  );
  ["png", "jpg", "webp"].forEach((fmt) => {
    const fmtBtn = action({ label: fmt.toUpperCase() }, () => saveManual(node, fmt));
    fmtBtn.dataset.format = fmt;
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
  const modal = Modal({ title: "Browse Output Folders", icon: "folder", width: 420 });
  modal.root.addEventListener("pointerdown", stop);

  const pathEl = document.createElement("div");
  pathEl.className = "ds-isa-browser-path";
  const list = document.createElement("div");
  list.className = "ds-isa-dirlist";
  modal.body.append(pathEl, list);

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
      list.replaceChildren();
      for (const name of d.dirs || []) {
        list.appendChild(btn({
          icon: "folder",
          label: name,
          variant: "ghost",
          className: "ds-isa-dir",
          onClick: (e) => {
            stop(e);
            current = `${current.replace(/[\\/]$/, "")}/${name}`;
            load();
          },
        }).root);
      }
      if (!(d.dirs || []).length) {
        const empty = document.createElement("div");
        empty.className = "ds-isa-no-dirs";
        empty.textContent = "No subfolders found";
        list.appendChild(empty);
      }
    } catch (e) {
      console.warn("[DS Image Save Advance] browse failed:", e);
    }
  };

  const spacer = document.createElement("span");
  spacer.style.flex = "1";
  modal.footer.append(
    btn({
      icon: "chevron-up",
      label: "Up",
      onClick: (e) => {
        stop(e);
        const p = current.replace(/[\\/]$/, "");
        const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
        current = i > 1 ? p.slice(0, i) : "";
        load();
      },
    }).root,
    spacer,
    btn({
      label: "Select This Folder",
      variant: "primary",
      onClick: (e) => {
        stop(e);
        state(node).save_dir = current;
        persist(node);
        render(node);
        modal.close();
      },
    }).root,
  );

  modal.open();
  load();
}

function lastPath(node) {
  return node._isaLastPath || "";
}

async function deleteLast(node) {
  const p = lastPath(node);
  if (!p) return toast(node, "No saved image to delete");
  try {
    const r = await fetch(url("/ds/image_save_advance/delete"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: p, node_id: node.id }),
    });
    const d = await r.json();
    if (d.success || r.status === 404) {
      const paths = node._isaLastPaths || [];
      const idx = paths.indexOf(p);
      if (idx !== -1) paths.splice(idx, 1);
      const prevPath = paths.length ? paths[paths.length - 1] : "";
      node._isaLastPath = prevPath;
      if (!paths.length && state(node).counter > 1) {
        state(node).counter = Math.max(1, Number(state(node).counter) - 1);
      }
      persist(node);
      render(node);
      updatePreview(node);
      toast(node, d.success ? "Image deleted" : "File removed");
    } else {
      toast(node, d.error || "Delete failed");
    }
  } catch (e) {
    console.warn("[DS Image Save Advance] delete failed:", e);
    toast(node, "Delete failed");
  }
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
  const p = lastPath(node) || node._isaLastDir || state(node).save_dir || "";
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
      attachNodeShortcuts(this);
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
      const rawPaths = unwrap(message?.paths);
      if (Array.isArray(rawPaths)) this._isaLastPaths = [...rawPaths];
      else if (path) this._isaLastPaths = [String(path)];
      const next = Number(unwrap(message?.next_counter));
      if (Number.isFinite(next) && next > 0) state(this).counter = next;
      const fmt = unwrap(message?.format);
      if (fmt) state(this).format = String(fmt);
      const dir = unwrap(message?.dir);
      if (dir) this._isaLastDir = String(dir);
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
    attachNodeShortcuts(node);
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
          if (Array.isArray(st?.last_paths)) n._isaLastPaths = [...st.last_paths];
          render(n);
          syncWidgets(n);
        }
      }
    } catch (e) {
      console.warn("[DS Image Save Advance] state restore failed:", e);
    }
  },
});
