import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

const TYPE = "DS_ImageSaveAdvance";
const EXT = "DeathshotArsenal.ImageSaveAdvance";
const PROP = "ds_image_save_advance";
const MIN_W = 340;
const MIN_H = 250;
const DEFAULT_W = 430;
const DEFAULT_H = 420;
const POPUPS = new Map();
let cssLoaded = false;

const ICON = {
  gear: `<svg viewBox="0 0 24 24"><path d="M9.7 2.8h4.6l.7 2.2c.5.2 1 .4 1.4.8l2.2-.6 2.3 4-1.6 1.6c.1.5.1 1 0 1.5l1.6 1.6-2.3 4-2.2-.6c-.4.4-.9.6-1.4.8l-.7 2.2H9.7L9 17.9c-.5-.2-1-.4-1.4-.8l-2.2.6-2.3-4 1.6-1.6c-.1-.5-.1-1 0-1.5l-1.6-1.6 2.3-4 2.2.6c.4-.4.9-.6 1.4-.8l.7-2.2Z"/><circle cx="12" cy="12" r="3.1"/></svg>`,
  chevron: `<svg viewBox="0 0 24 24"><path d="m7 9 5 5 5-5"/></svg>`,
  folder: `<svg viewBox="0 0 24 24"><path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-7l-2-2H5a2 2 0 0 0-2 2Z"/></svg>`,
  open: `<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9"/><path d="M19 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/></svg>`,
  copy: `<svg viewBox="0 0 24 24"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>`,
  close: `<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>`,
};

const DEFAULT = {
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
  ["{input_name}", "+ Input name"], ["{date}", "+ Date"], ["{time}", "+ Time"], ["{counter}", "+ Counter"],
  ["{seed}", "+ Seed"], ["{width}", "+ Width"], ["{height}", "+ Height"], ["{batch}", "+ Batch #"],
  ["{model}", "+ Model"], ["{date_folder}/", "+ Date folder"], ["{input_folder}/", "+ Input folder"],
];

function log(...a) { console.log("[DS Image Save Advance]", ...a); }
function warn(...a) { console.warn("[DS Image Save Advance]", ...a); }
function stop(e) { e?.stopPropagation?.(); }
function url(path) { return typeof api.fileURL === "function" ? api.fileURL(path) : path; }
function unwrap(v) { if (Array.isArray(v)) return v.length ? unwrap(v[0]) : ""; return v ?? ""; }

function loadCSS() {
  if (cssLoaded || document.querySelector('link[data-ds-isa-css]')) return;
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
  if (!s || typeof s !== "object") s = node.properties[PROP] = { ...DEFAULT };
  for (const [k, v] of Object.entries(DEFAULT)) if (s[k] === undefined) s[k] = v;
  s.format = ["png", "jpg", "webp"].includes(s.format) ? s.format : "png";
  s.date_style = ["yyyy-MM-dd", "dd-MM-yyyy", "MM-dd-yyyy"].includes(s.date_style) ? s.date_style : "dd-MM-yyyy";
  s.counter_digits = Math.max(1, Math.min(8, Number(s.counter_digits) || 3));
  s.quality = Math.max(1, Math.min(100, Number(s.quality) || 100));
  s.counter = Math.max(1, Number(s.counter) || 1);
  s.collapsed = !!s.collapsed;
  return s;
}

function syncWidgets(node) {
  const s = state(node);
  const set = (name, value) => { const w = node.widgets?.find(x => x?.name === name); if (w) w.value = String(value ?? ""); };
  set("save_dir", s.save_dir || "");
  set("name", s.input_name || "image");
  set("suffix", ""); set("prefix", "");
  set("config_json", JSON.stringify(s));
}
function persist(node) {
  syncWidgets(node);
  try { app.graph?.setDirtyCanvas?.(true, true); } catch {}
}
function restore(node) {
  const s = state(node);
  const w = node.widgets?.find(x => x?.name === "config_json");
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
  for (const n of ["save_dir", "suffix", "prefix", "config_json", "name"]) hideWidget(node.widgets?.find(w => w?.name === n));
}

function popupPosition(node, popup) {
  const anchor = node._isaSettingsButton?.getBoundingClientRect?.() || node.rootEl?.getBoundingClientRect?.();
  if (!anchor) return;
  const pw = popup.offsetWidth || 390;
  const ph = Math.min(popup.scrollHeight || 600, innerHeight - 16);
  let left = anchor.right + 8;
  if (left + pw > innerWidth - 8) left = anchor.left - pw - 8;
  left = Math.max(8, Math.min(left, innerWidth - pw - 8));
  let top = anchor.top;
  if (top + ph > innerHeight - 8) top = innerHeight - ph - 8;
  top = Math.max(8, top);
  popup.style.left = `${Math.round(left)}px`;
  popup.style.top = `${Math.round(top)}px`;
}
function closePopup(id) {
  const x = POPUPS.get(id); if (!x) return;
  if (x.raf) cancelAnimationFrame(x.raf);
  x.popup.remove(); POPUPS.delete(id);
}

function toggleControl(label, desc, on, callback) {
  const row = document.createElement("button");
  row.type = "button"; row.className = `ds-isa-toggle${on ? " on" : ""}`;
  row.innerHTML = `<span class="ds-isa-toggle-copy"><strong>${label}</strong><small>${desc}</small></span><span class="ds-isa-switch"><span></span></span><span class="ds-isa-toggle-state">${on ? "ON" : "OFF"}</span>`;
  row.addEventListener("pointerdown", stop); row.addEventListener("click", e => { stop(e); callback(); });
  return row;
}
function segment(container, values, active, callback) {
  container.innerHTML = "";
  for (const [value, label] of values) {
    const b = document.createElement("button"); b.type = "button"; b.className = `ds-isa-seg${value === active ? " active" : ""}`; b.textContent = label;
    b.addEventListener("pointerdown", stop); b.addEventListener("click", e => { stop(e); callback(value); }); container.appendChild(b);
  }
}

function openSettings(node) {
  if (POPUPS.has(node.id)) { popupPosition(node, POPUPS.get(node.id).popup); return; }
  for (const id of [...POPUPS.keys()]) closePopup(id);
  const popup = document.createElement("div"); popup.className = "ds-isa-popup"; popup.dataset.dsThemed = "true";
  popup.addEventListener("pointerdown", stop); popup.addEventListener("mousedown", stop); popup.addEventListener("wheel", e => e.stopPropagation(), { passive: true });
  const item = { node, popup, raf: 0 }; POPUPS.set(node.id, item); document.body.appendChild(popup);

  const head = document.createElement("div"); head.className = "ds-isa-popup-head";
  head.innerHTML = `<div class="ds-isa-popup-brand">DS</div><div><div class="ds-isa-popup-title">Image Save Advance</div><div class="ds-isa-popup-sub">Save, naming and metadata options</div></div>`;
  const close = document.createElement("button"); close.className = "ds-isa-popup-close"; close.innerHTML = ICON.close; close.addEventListener("pointerdown", stop); close.addEventListener("click", e => { stop(e); closePopup(node.id); }); head.appendChild(close); popup.appendChild(head);

  const body = document.createElement("div"); body.className = "ds-isa-popup-body";
  const dateSec = document.createElement("section"); dateSec.className = "ds-isa-section";
  dateSec.innerHTML = `<div class="ds-isa-section-label">DATE & COUNTER</div>`;
  const seg = document.createElement("div"); seg.className = "ds-isa-segment";
  segment(seg, [["yyyy-MM-dd", "yyyy-MM-dd"], ["dd-MM-yyyy", "dd-MM-yyyy"], ["MM-dd-yyyy", "MM-dd-yyyy"]], state(node).date_style, v => { state(node).date_style = v; persist(node); renderSettings(item); });
  dateSec.appendChild(seg);
  const counterWrap = document.createElement("div"); counterWrap.className = "ds-isa-slider-block";
  counterWrap.innerHTML = `<div class="ds-isa-slider-head"><span>Counter digits</span><b data-counter-value></b></div><div class="ds-isa-slider-row"><input type="range" min="1" max="8" step="1"><span class="ds-isa-slider-fill"></span></div>`;
  const cr = counterWrap.querySelector("input"), cv = counterWrap.querySelector("[data-counter-value]");
  cr.value = state(node).counter_digits; cv.textContent = String(state(node).counter_digits).padStart(state(node).counter_digits, "0");
  cr.addEventListener("input", () => { state(node).counter_digits = Number(cr.value); cv.textContent = String(state(node).counter_digits).padStart(state(node).counter_digits, "0"); updateSlider(cr); persist(node); });
  dateSec.appendChild(counterWrap); body.appendChild(dateSec);

  const qualitySec = document.createElement("section"); qualitySec.className = "ds-isa-section";
  qualitySec.innerHTML = `<div class="ds-isa-section-label">QUALITY</div>`;
  const qualityWrap = document.createElement("div"); qualityWrap.className = "ds-isa-slider-block";
  qualityWrap.innerHTML = `<div class="ds-isa-slider-head"><span>JPG / WebP Quality</span><b data-quality-value>100</b></div><div class="ds-isa-slider-row"><input type="range" min="1" max="100" step="1"><span class="ds-isa-slider-fill"></span></div><div class="ds-isa-slider-note">Higher values preserve more image detail.</div>`;
  const qr = qualityWrap.querySelector("input"), qv = qualityWrap.querySelector("[data-quality-value]"); qr.value = state(node).quality; qv.textContent = state(node).quality;
  qr.addEventListener("input", () => { state(node).quality = Number(qr.value); qv.textContent = qr.value; updateSlider(qr); persist(node); });
  qualitySec.appendChild(qualityWrap); body.appendChild(qualitySec);

  const toggles = document.createElement("section"); toggles.className = "ds-isa-section ds-isa-toggle-section";
  const s = state(node);
  toggles.appendChild(toggleControl("WebP lossless", "Use lossless WebP encoding when WebP is selected.", s.webp_lossless, () => { s.webp_lossless = !s.webp_lossless; persist(node); renderSettings(item); }));
  toggles.appendChild(toggleControl("Save workflow inside the image", "Embed ComfyUI prompt / workflow metadata when supported.", s.embed_workflow, () => { s.embed_workflow = !s.embed_workflow; persist(node); renderSettings(item); }));
  toggles.appendChild(toggleControl("Add Civitai generation info", "Write generation parameters alongside embedded metadata.", s.civitai, () => { s.civitai = !s.civitai; persist(node); renderSettings(item); }));
  toggles.appendChild(toggleControl("Keep folders from the wired name", "Preserve upstream input folders automatically.", s.keep_input_folders, () => { s.keep_input_folders = !s.keep_input_folders; persist(node); renderSettings(item); }));
  toggles.appendChild(toggleControl("Hide the toolbar when folded", "Leave the action row visible when collapsed.", s.hide_toolbar, () => { s.hide_toolbar = !s.hide_toolbar; persist(node); renderSettings(item); }));
  body.appendChild(toggles); popup.appendChild(body);

  const foot = document.createElement("div"); foot.className = "ds-isa-popup-foot";
  const reset = document.createElement("button"); reset.className = "ds-isa-foot-btn"; reset.textContent = "Reset settings";
  reset.addEventListener("pointerdown", stop); reset.addEventListener("click", e => { stop(e); Object.assign(state(node), DEFAULT); persist(node); render(node); renderSettings(item); });
  const done = document.createElement("button"); done.className = "ds-isa-foot-btn"; done.textContent = "Done";
  done.addEventListener("pointerdown", stop); done.addEventListener("click", e => { stop(e); closePopup(node.id); }); foot.append(reset, done); popup.appendChild(foot);
  try { window.DSGlobalTheme?.bindNode?.(popup, node); } catch {}
  popupPosition(node, popup);
  item.raf = requestAnimationFrame(function loop() { if (!document.body.contains(popup)) return; popupPosition(node, popup); item.raf = requestAnimationFrame(loop); });
}
function renderSettings(item) { const popup = item.popup; popup.innerHTML = ""; closePopup(item.node.id); openSettings(item.node); }
function updateSlider(input) {
  const wrap = input.closest(".ds-isa-slider-block"); if (!wrap) return;
  const min = Number(input.min || 0), max = Number(input.max || 100), val = Number(input.value || 0);
  const pct = ((val - min) / (max - min)) * 100;
  wrap.style.setProperty("--ds-slider-pct", `${pct}%`);
}



// -----------------------------------------------------------------------------
// Runtime token resolution
// -----------------------------------------------------------------------------
// The Python execution payload is not a reliable place to discover the live
// frontend widget values. Pixaroma solves this at graphToPrompt time: inspect
// the actual graph widgets, resolve dynamic filename references, then inject
// the resolved state into the queued node. We do the same for the compact
// {model}/{seed} tokens used by Image Save Advance.
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
  const inp = node?.inputs?.find?.(x => x?.name === inputName);
  if (!inp || inp.link == null) return null;
  const oid = graphLinkOrigin(node.graph || app.graph, inp.link);
  if (oid == null) return null;
  return nodes.find(n => String(n.id) === String(oid)) || null;
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
  const sampler = upstream.find(n => {
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
      const w = n.widgets?.find?.(x => x && keys.includes(x.name));
      const val = cleanModelName(w?.value);
      if (val) return val;
      for (const inp of n.inputs || []) {
        const src = originNode(n, inp.name, nodes);
        if (src && !seen.has(String(src.id))) queue.push(src);
      }
    }
  }
  // If the workflow has no recognizable sampler, use the reachable graph.
  for (const n of upstream) {
    const w = n.widgets?.find?.(x => x && keys.includes(x.name));
    const val = cleanModelName(w?.value);
    if (val) return val;
  }
  // Renderer/subgraph fallback. Never fabricate the literal word "model".
  for (const n of nodes) {
    const w = n.widgets?.find?.(x => x && keys.includes(x.name));
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
    const w = n.widgets?.find?.(x => x && ["seed", "noise_seed", "random_seed", "variation_seed"].includes(x.name));
    if (w && w.value != null && String(w.value).trim() !== "") return String(w.value);
  }
  // Generic graph fallback for custom sampler names.
  for (const n of nodes) {
    const w = n.widgets?.find?.(x => x && ["seed", "noise_seed"].includes(x.name));
    if (w && w.value != null && String(w.value).trim() !== "") return String(w.value);
  }
  return "";
}
function resolveRuntimeTemplate(node, rawConfig) {
  let cfg;
  try { cfg = JSON.parse(rawConfig || "{}"); } catch { cfg = {}; }
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
        const node = nodes.find(n => String(n.id) === String(id));
        if (!node) continue;
        if (entry.inputs.config_json != null) {
          entry.inputs.config_json = resolveRuntimeTemplate(node, entry.inputs.config_json);
        }
        // Keep the explicit name widget synchronized with the visible field.
        if (entry.inputs.name == null || entry.inputs.name === "") {
          entry.inputs.name = state(node).input_name || "image";
        }
      }
    } catch (e) { warn("runtime token resolution failed", e); }
    return result;
  };
}

function buildRoot(node) {
  const root = document.createElement("div"); root.className = "ds-isa-root"; root.dataset.dsThemed = "true";
  root.innerHTML = `<div class="ds-isa-face">
    <div class="ds-isa-top"><div class="ds-isa-brand">DS</div><div class="ds-isa-title">Image Save Advance</div><button class="ds-isa-icon ds-isa-arrow" data-collapse title="Expand / collapse">${ICON.chevron}</button><button class="ds-isa-icon" data-settings title="Settings">${ICON.gear}</button></div>
    <div class="ds-isa-config" data-config>
      <div class="ds-isa-label">OUTPUT FOLDER</div><div class="ds-isa-row"><input class="ds-isa-input" data-dir placeholder="ComfyUI output folder…"><button class="ds-isa-browse" data-browse>Browse</button></div>
      <div class="ds-isa-label">IMAGE NAME</div><input class="ds-isa-input" data-name placeholder="image"><div class="ds-isa-label">FILENAME TEMPLATE</div><input class="ds-isa-input" data-template placeholder="{input_name}_{date}_{time}_{counter}"><div class="ds-isa-inserts" data-inserts></div>
    </div>
    <div class="ds-isa-status" data-status>Automatic save · PNG · batch-safe</div>
    <div class="ds-isa-actions" data-actions-top><button class="ds-isa-action" data-open>${ICON.open}<span>Open</span></button><button class="ds-isa-action" data-copy>${ICON.copy}<span>Copy</span></button><button class="ds-isa-action" data-folder>${ICON.folder}<span>Folder</span></button><button class="ds-isa-action" data-format="png">PNG</button><button class="ds-isa-action" data-format="jpg">JPG</button><button class="ds-isa-action" data-format="webp">WebP</button></div>
    <div class="ds-isa-preview" data-preview><div class="ds-isa-preview-empty">No image saved yet<br><span>Run the workflow to populate the preview.</span></div></div>
  </div>`;

  const inserts = root.querySelector("[data-inserts]");
  for (const [token, label] of INSERTS) { const b = document.createElement("button"); b.className = "ds-isa-insert"; b.textContent = label; b.title = token; b.addEventListener("pointerdown", stop); b.addEventListener("click", e => { stop(e); insertToken(node, token); }); inserts.appendChild(b); }
  const clear = document.createElement("button"); clear.className = "ds-isa-insert"; clear.textContent = "× Clear"; clear.addEventListener("pointerdown", stop); clear.addEventListener("click", e => { stop(e); state(node).template = ""; persist(node); render(node); }); inserts.appendChild(clear);
  const reset = document.createElement("button"); reset.className = "ds-isa-insert"; reset.textContent = "↺ Reset"; reset.addEventListener("pointerdown", stop); reset.addEventListener("click", e => { stop(e); state(node).template = DEFAULT.template; persist(node); render(node); }); inserts.appendChild(reset);

  node.rootEl = root; node.faceEl = root.querySelector(".ds-isa-face"); node._isaSettingsButton = root.querySelector("[data-settings]"); node.dirInput = root.querySelector("[data-dir]"); node.nameInput = root.querySelector("[data-name]"); node.templateInput = root.querySelector("[data-template]"); node.statusEl = root.querySelector("[data-status]"); node.previewEl = root.querySelector("[data-preview]");
  root.querySelector("[data-collapse]").addEventListener("pointerdown", stop); root.querySelector("[data-collapse]").addEventListener("click", e => {
    stop(e);
    const keepSize = Array.isArray(node.size) ? [Number(node.size[0]), Number(node.size[1])] : [DEFAULT_W, DEFAULT_H];
    state(node).collapsed = !state(node).collapsed;
    persist(node);
    render(node);
    requestAnimationFrame(() => {
      if (Array.isArray(node.size) && keepSize[0] > 0 && keepSize[1] > 0) {
        node.size[0] = keepSize[0]; node.size[1] = keepSize[1];
        node.setSize?.([keepSize[0], keepSize[1]]);
        node.setDirtyCanvas?.(true, true);
      }
    });
  });
  root.querySelector("[data-settings]").addEventListener("pointerdown", stop); root.querySelector("[data-settings]").addEventListener("click", e => { stop(e); openSettings(node); });
  root.querySelector("[data-browse]").addEventListener("pointerdown", stop); root.querySelector("[data-browse]").addEventListener("click", e => { stop(e); showBrowser(node); });
  node.dirInput.addEventListener("input", () => { state(node).save_dir = node.dirInput.value; persist(node); });
  node.nameInput.addEventListener("input", () => { state(node).input_name = node.nameInput.value; persist(node); });
  node.templateInput.addEventListener("input", () => { state(node).template = node.templateInput.value; persist(node); });
  root.querySelector("[data-open]").addEventListener("pointerdown", stop); root.querySelector("[data-open]").addEventListener("click", e => { stop(e); openLast(node); });
  root.querySelector("[data-copy]").addEventListener("pointerdown", stop); root.querySelector("[data-copy]").addEventListener("click", e => { stop(e); copyLast(node); });
  root.querySelector("[data-folder]").addEventListener("pointerdown", stop); root.querySelector("[data-folder]").addEventListener("click", e => { stop(e); openFolder(node); });
  root.querySelectorAll("[data-format]").forEach(b => { b.addEventListener("pointerdown", stop); b.addEventListener("click", e => { stop(e); saveManual(node, b.dataset.format); }); });
  return root;
}
function insertToken(node, token) {
  const input = node.templateInput; if (!input) return;
  const a = input.selectionStart ?? input.value.length, b = input.selectionEnd ?? a;
  const before = input.value.slice(0, a);
  const after = input.value.slice(b);
  let glue = "";
  // Token buttons build a readable filename automatically. Do not make the
  // user manually insert separators between every token. Preserve explicit
  // separators, folder slashes, and a width+height pair as 1224x1632.
  if (before && !/[\s_\-./]$/.test(before)) {
    if (token === "{height}" && /\{width\}$/.test(before)) glue = "x";
    else glue = "_";
  }
  if (token === "{date_folder}/" && before && !/[\/\-_.]$/.test(before)) glue = "/";
  const insert = glue + token;
  input.value = before + insert + after;
  const p = a + insert.length; input.focus(); input.setSelectionRange(p, p);
  state(node).template = input.value; persist(node);
}
function render(node) {
  if (!node.rootEl) return;
  const s = state(node);
  node.rootEl.classList.toggle("collapsed", s.collapsed);
  node.rootEl.querySelector("[data-config]")?.classList.toggle("is-collapsed", s.collapsed);
  node.dirInput.value = s.save_dir || ""; node.nameInput.value = s.input_name || "image"; node.templateInput.value = s.template || "";
  node.statusEl.textContent = `Automatic save · ${s.format.toUpperCase()} · batch-safe · counter ${String(s.counter).padStart(s.counter_digits, "0")}`;
  node.rootEl.querySelectorAll("[data-format]").forEach(b => b.classList.toggle("active", b.dataset.format === s.format));
  const hide = s.hide_toolbar && s.collapsed;
  node.rootEl.querySelector(".ds-isa-brand").style.visibility = hide ? "hidden" : "visible";
  node.rootEl.querySelector(".ds-isa-title").style.visibility = hide ? "hidden" : "visible";
  node.rootEl.querySelector("[data-settings]").style.visibility = hide ? "hidden" : "visible";
  updatePreview(node);
  try { window.DSGlobalTheme?.bindNode?.(node.rootEl, node); } catch {}
}
function updatePreview(node) {
  const p = node._isaLastPath;
  if (!node.previewEl) return;
  node.previewEl.innerHTML = "";
  if (!p) { node.previewEl.innerHTML = `<div class="ds-isa-preview-empty">No image saved yet<br><span>Run the workflow to populate the preview.</span></div>`; return; }
  const img = document.createElement("img"); img.alt = "Last saved image"; img.draggable = false; img.src = url(`/ds/image_save_advance/preview?path=${encodeURIComponent(p)}&t=${Date.now()}`);
  img.onerror = () => { node.previewEl.innerHTML = `<div class="ds-isa-preview-empty">Preview unavailable<br><span>The saved file may have moved.</span></div>`; };
  node.previewEl.appendChild(img);
}

async function showBrowser(node) {
  const modal = document.createElement("div"); modal.className = "ds-isa-modal"; modal.addEventListener("pointerdown", e => { if (e.target === modal) modal.remove(); else stop(e); });
  const box = document.createElement("div"); box.className = "ds-isa-browser"; box.innerHTML = `<div class="ds-isa-browser-head"><div class="ds-isa-browser-title">Browse output folders</div><button class="ds-isa-popup-close" data-close>${ICON.close}</button></div><div class="ds-isa-browser-path" data-path></div><div class="ds-isa-dirlist" data-list></div><div class="ds-isa-browser-foot"><button class="ds-isa-foot-btn" data-up>↑ Up</button><button class="ds-isa-foot-btn" data-select>Select this folder</button></div>`; modal.appendChild(box); document.body.appendChild(modal);
  const pathEl = box.querySelector("[data-path]"), list = box.querySelector("[data-list]"); let current = node.dirInput.value || "";
  const load = async () => { try { const r = await fetch(url("/ds/image_save_advance/list_dir"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: current }) }); const d = await r.json(); current = d.current || current; pathEl.textContent = current; list.innerHTML = ""; for (const name of d.dirs || []) { const b = document.createElement("button"); b.className = "ds-isa-dir"; b.textContent = `📁 ${name}`; b.addEventListener("pointerdown", stop); b.addEventListener("click", e => { stop(e); current = `${current.replace(/[\\/]$/, "")}/${name}`; load(); }); list.appendChild(b); } if (!(d.dirs || []).length) list.innerHTML = `<div class="ds-isa-no-dirs">No subfolders</div>`; } catch (e) { warn("browse failed", e); } };
  box.querySelector("[data-close]").addEventListener("pointerdown", stop); box.querySelector("[data-close]").addEventListener("click", e => { stop(e); modal.remove(); });
  box.querySelector("[data-up]").addEventListener("pointerdown", stop); box.querySelector("[data-up]").addEventListener("click", e => { stop(e); const p = current.replace(/[\\/]$/, ""); const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\")); current = i > 1 ? p.slice(0, i) : ""; load(); });
  box.querySelector("[data-select]").addEventListener("pointerdown", stop); box.querySelector("[data-select]").addEventListener("click", e => { stop(e); state(node).save_dir = current; persist(node); render(node); modal.remove(); });
  load();
}
function lastPath(node) { return node._isaLastPath || ""; }
async function openLast(node) { const p = lastPath(node); if (!p) return toast(node, "No saved image yet"); try { const r = await fetch(url("/ds/image_save_advance/open"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: p }) }); const d = await r.json(); if (!d.success) toast(node, d.error || "Open failed"); } catch (e) { warn(e); toast(node, "Open failed"); } }
async function openFolder(node) { const p = lastPath(node) || state(node).save_dir; if (!p) return toast(node, "No output folder"); try { const r = await fetch(url("/ds/image_save_advance/folder"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: p }) }); const d = await r.json(); if (!d.success) toast(node, d.error || "Folder failed"); } catch (e) { warn(e); toast(node, "Folder failed"); } }
async function copyLast(node) { const p = lastPath(node); if (!p) return toast(node, "No saved image yet"); try { await navigator.clipboard.writeText(p); toast(node, "Path copied"); } catch { toast(node, "Clipboard unavailable"); } }
async function saveManual(node, format) { state(node).format = format; persist(node); render(node); const p = lastPath(node); if (!p) return toast(node, `${format.toUpperCase()} selected`); try { const r = await fetch(url("/ds/image_save_advance/convert"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: p, format, quality: state(node).quality, webp_lossless: state(node).webp_lossless }) }); const d = await r.json(); if (d.success) { node._isaLastPath = d.path; updatePreview(node); toast(node, `Saved ${format.toUpperCase()}`); } else toast(node, d.error || "Save failed"); } catch (e) { warn(e); toast(node, "Save failed"); } }
function toast(node, msg) { if (!node.rootEl) return; const old = node.rootEl.querySelector(".ds-isa-toast"); old?.remove(); const t = document.createElement("div"); t.className = "ds-isa-toast"; t.textContent = msg; node.rootEl.appendChild(t); setTimeout(() => t.remove(), 1500); }

function patchNode(node) {
  if (!node || node.type !== TYPE || node._isaPatched) return;
  node._isaPatched = true; loadCSS();
  // Keep ComfyUI's native node shell/base. Do NOT set flags.no_title here:
  // the custom DOM face is inset and the native base remains visible around it.
  node.resizable = true; node.min_size = [MIN_W, MIN_H];
  if (!Array.isArray(node.size) || node.size[0] < MIN_W || node.size[1] < MIN_H) node.size = [DEFAULT_W, DEFAULT_H];
  state(node); node.widgets ||= [];
  for (const [name, def] of [["save_dir", ""], ["suffix", ""], ["prefix", ""], ["config_json", ""], ["name", "image"]]) if (!node.widgets.find(w => w?.name === name)) node.addWidget("text", name, def, () => {}, { hidden: true });
  hideWidgets(node);
  const root = buildRoot(node); const widget = node.addDOMWidget("image_save_advance_ui", "custom", root, {
    serialize: false,
    hideOnZoom: false,
    getValue: () => null,
    setValue: () => {},
  });
  node._isaWidget = widget;
  // Do not let the DOM widget recalculate the node's height when the settings
  // section is folded. The node size belongs to LiteGraph/the user.
  widget.computeLayoutSize = () => ({ minHeight: MIN_H, minWidth: 1 });
  widget.onPointerDown = pointer => { const target = pointer?.eDown?.target; return !!target?.closest?.("button,input,textarea,select,[contenteditable=\"true\"]"); };
  restore(node);
  setTimeout(() => { try { window.DSGlobalTheme?.bindNode?.(root, node); render(node); } catch {} }, 0);
}

app.registerExtension({
  name: EXT,
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData?.name !== TYPE) return;
    const LG = window.LiteGraph || {}; nodeType.title_mode = LG.NORMAL != null ? LG.NORMAL : 0;
    const oldCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () { const r = oldCreated?.apply(this, arguments); patchNode(this); return r; };
    const oldConfigure = nodeType.prototype.configure;
    nodeType.prototype.configure = function (info) { const r = oldConfigure?.apply(this, arguments); setTimeout(() => restore(this), 30); return r; };
    const oldSerialize = nodeType.prototype.serialize;
    nodeType.prototype.serialize = function () { persist(this); return oldSerialize?.apply(this, arguments) || {}; };
    const oldRemoved = nodeType.prototype.onRemoved;
    nodeType.prototype.onRemoved = function () { closePopup(this.id); return oldRemoved?.apply(this, arguments); };
    nodeType.prototype.onExecuted = function (message) {
      const path = unwrap(message?.last_path) || unwrap(message?.paths)?.at?.(-1);
      if (path) this._isaLastPath = String(path);
      const next = Number(unwrap(message?.next_counter)); if (Number.isFinite(next) && next > 0) state(this).counter = next;
      const fmt = unwrap(message?.format); if (fmt) state(this).format = String(fmt);
      const dir = unwrap(message?.dir); if (dir) state(this).save_dir = String(dir);
      persist(this); render(this); this.setDirtyCanvas?.(true, true);
    };
  },
  nodeCreated(node) { patchNode(node); },
  loadedGraphNode(node) { patchNode(node); },
  async setup() {
    loadCSS();
    installRuntimeTokenHook();
    try { window.__DS_IMAGE_SAVE_ADVANCE_THEME__ = await window.DSGlobalTheme?.getTheme?.(); } catch {}
    window.addEventListener("keydown", e => { if (e.key === "Escape") for (const id of [...POPUPS.keys()]) closePopup(id); });
    window.addEventListener("ds-theme-changed", () => { for (const n of app.graph?._nodes || []) if (n?.type === TYPE) render(n); });
    try {
      const r = await fetch(url("/ds/image_save_advance/state")); const saved = await r.json();
      for (const n of app.graph?._nodes || []) if (n?.type === TYPE) {
        const st = saved?.nodes?.[String(n.id)]; if (st?.last_path) n._isaLastPath = st.last_path;
        if (!state(n).save_dir && saved?.default_dir) state(n).save_dir = saved.default_dir;
        render(n); syncWidgets(n);
      }
    } catch (e) { warn("state restore failed", e); }
  }
});
