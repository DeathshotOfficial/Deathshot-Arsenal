import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";
import { DSIcon, normalizeDSWidgetHost, protectDSResizeCorners } from "../UIElements/index.js";

const TYPE = "DS_ImageCheckpoint";
const EXT = "DeathshotArsenal.DSImageCheckpoint";
const STATE_PROP = "ds_image_checkpoint_mode";
const DEFAULT_SIZE = [620, 620];
const MIN_SIZE = [420, 380];
const CSS_ID = "ds-image-checkpoint-css-v9";
const HIDDEN_INPUT = "PauseState";

function log(...a) { console.log("[DS Image Checkpoint]", ...a); }
function error(...a) { console.error("[DS Image Checkpoint]", ...a); }
function apiUrl(path) { try { return api.apiURL ? api.apiURL(path) : path; } catch (_) { return path; } }

let cssPromise;
function loadCss() {
  if (cssPromise) return cssPromise;
  cssPromise = new Promise((resolve) => {
    if (document.getElementById(CSS_ID)) return resolve();
    const link = document.createElement("link");
    link.id = CSS_ID;
    link.rel = "stylesheet";
    link.href = "/extensions/DeathshotArsenal/Image Checkpoint/ds_image_checkpoint.css?v=9";
    link.onload = resolve;
    link.onerror = resolve;
    document.head.appendChild(link);
  });
  return cssPromise;
}

function stateOf(node) {
  return node._dsICState || (node._dsICState = {
    mode: node.properties?.[STATE_PROP] === "pass" ? "pass" : "pause",
    status: "ready",
    previewUrl: "",
    width: 0,
    height: 0,
    hasSnapshot: false,
    busy: false,
    flashTimer: null,
    saveConfirmTimer: null,
  });
}
function rootOf(node) { return node._dsICRoot; }
function persist(node) {
  node.properties ??= {};
  node.properties[STATE_PROP] = stateOf(node).mode;
  node.properties.ds_image_checkpoint_version = 4;
}

function getModeHelper(mode) {
  return mode === "pause"
    ? "PAUSE · Run ends here after capturing the image."
    : "PASS · Run complete workflow without stopping here.";
}

function updatePlaceholder(node, isError = false) {
  const s = stateOf(node);
  const root = rootOf(node);
  if (!root) return;
  const ph = root.querySelector(".ds-ic-placeholder");
  if (!ph) return;

  const strong = ph.querySelector("strong");
  const span = ph.querySelector("span");

  if (isError) {
    if (strong) strong.textContent = "PREVIEW UNAVAILABLE";
    if (span) span.textContent = s.mode === "pause"
      ? "Run the workflow to capture and inspect the image."
      : "Run the workflow to inspect the passing image.";
    return;
  }

  if (strong) strong.textContent = "READY";
  if (span) {
    span.textContent = s.mode === "pause"
      ? "Run the workflow to pause and inspect the image here."
      : "Run the workflow to inspect the passing image.";
  }
}

function setStatus(node, status, text) {
  const s = stateOf(node);
  s.status = status;
  const root = rootOf(node);
  if (!root) return;
  const el = root.querySelector(".ds-ic-status");
  if (el) {
    el.dataset.state = status;
    const t = el.querySelector(".ds-ic-status-text");
    if (t) t.textContent = text;
  }
  renderButtons(node);
}

function toast(node, text) {
  const el = rootOf(node)?.querySelector(".ds-ic-toast");
  if (!el) return;
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(stateOf(node).flashTimer);
  stateOf(node).flashTimer = setTimeout(() => el.classList.remove("show"), 1700);
}

function setModeUI(node, mode, save = true) {
  const s = stateOf(node);
  s.mode = mode === "pass" ? "pass" : "pause";
  if (save) persist(node);
  const root = rootOf(node);
  if (!root) return;
  root.querySelectorAll(".ds-ic-tab-btn").forEach(b => {
    const isActive = b.dataset.mode === s.mode;
    b.classList.toggle("active", isActive);
    b.classList.toggle("is-active", isActive);
    b.setAttribute("aria-selected", isActive ? "true" : "false");
  });
  
  // Revert info message to mode helper if no active save confirmation
  if (!s.saveConfirmTimer) {
    const helper = root.querySelector(".ds-ic-helper");
    if (helper) helper.textContent = getModeHelper(s.mode);
  }

  updatePlaceholder(node);

  if (s.mode === "pass" && s.status === "paused") setStatus(node, "ready", "READY");
  renderButtons(node);
  node.setDirtyCanvas?.(true, true);
}

function renderButtons(node) {
  const s = stateOf(node);
  const root = rootOf(node);
  if (!root) return;
  const cont = root.querySelector(".ds-ic-continue");
  const regen = root.querySelector(".ds-ic-regenerate");
  const has = s.hasSnapshot;
  const isPause = s.mode === "pause";

  if (regen) {
    if (s.busy && node._dsICActiveMode === "pause") {
      regen.disabled = false;
      regen.classList.add("is-running");
      regen.classList.remove("is-stopping");
      regen.title = "Regenerating… · Click to Stop";
      regen.replaceChildren(DSIcon("refresh-cw", { size: 14 }));
    } else {
      regen.classList.remove("is-running", "is-stopping");
      regen.disabled = !isPause || s.busy;
      regen.title = "Regenerate";
      regen.replaceChildren(DSIcon("refresh-cw", { size: 14 }));
    }
  }

  if (cont) {
    if (s.busy && node._dsICActiveMode === "continue") {
      cont.disabled = false;
      cont.classList.add("is-running");
      cont.classList.remove("is-stopping");
      cont.title = "Continuing… · Click to Stop";
      cont.replaceChildren(DSIcon("play", { size: 14 }));
    } else {
      cont.classList.remove("is-running", "is-stopping");
      cont.disabled = !isPause || !has || s.busy;
      cont.title = "Continue Execution";
      cont.replaceChildren(DSIcon("play", { size: 14 }));
    }
  }

  const copyBtn = root.querySelector(".ds-ic-copy");
  if (copyBtn) copyBtn.disabled = !has;

  const openBtn = root.querySelector(".ds-ic-open");
  if (openBtn) openBtn.disabled = !has;

  const saveBtn = root.querySelector(".ds-ic-save");
  if (saveBtn && !saveBtn.classList.contains("is-saving")) {
    saveBtn.disabled = !has;
  }
}

function setPreview(node, width, height) {
  const s = stateOf(node);
  s.width = Number(width) || 0;
  s.height = Number(height) || 0;
  s.previewUrl = apiUrl(`/ds/image_checkpoint/preview?node=${encodeURIComponent(node.id)}&t=${Date.now()}`);

  node.properties ??= {};
  node.properties.ds_ic_last_width = s.width;
  node.properties.ds_ic_last_height = s.height;

  const root = rootOf(node);
  if (!root) return;
  const img = root.querySelector(".ds-ic-image");
  const ph = root.querySelector(".ds-ic-placeholder");
  const dims = root.querySelector(".ds-ic-dims");
  if (dims) dims.textContent = s.width && s.height ? `${s.width} × ${s.height}` : "";

  img.onload = () => {
    img.hidden = false;
    ph.hidden = true;
    s.hasSnapshot = true;
    if (s.mode === "pause" && !s.busy) setStatus(node, "paused", "PAUSED · READY");
    else renderButtons(node);
    node.setDirtyCanvas?.(true, true);
  };
  img.onerror = () => {
    img.hidden = true;
    ph.hidden = false;
    updatePlaceholder(node, true);
    s.hasSnapshot = false;
    renderButtons(node);
  };
  img.src = s.previewUrl;
}

function showSaveConfirmation(node, { ok, filename, path, error: errMsg }) {
  const root = rootOf(node);
  if (!root) return;
  const container = root.querySelector(".ds-ic-info-message");
  if (!container) return;
  const s = stateOf(node);

  if (s.saveConfirmTimer) {
    clearTimeout(s.saveConfirmTimer);
    s.saveConfirmTimer = null;
  }

  const safeFile = filename ? String(filename) : (ok ? "image.png" : "file");
  const safePath = path ? String(path) : "";
  const safeErr = errMsg ? String(errMsg) : "Could not save file";

  container.innerHTML = `
    <div class="ds-ic-save-confirm ${ok ? "is-success" : "is-error"}" title="${ok ? (safePath ? `${safeFile} → ${safePath}` : safeFile) : safeErr}">
      <span class="ds-ic-save-confirm-icon">${ok ? "✓" : "✕"}</span>
      <span class="ds-ic-save-confirm-title">${ok ? "Saved" : "Save failed"}</span>
      <span>·</span>
      <span class="ds-ic-save-confirm-name">${ok ? safeFile : safeErr}</span>
      ${ok && safePath ? `<span>·</span><span class="ds-ic-save-confirm-path">${safePath}</span>` : ""}
    </div>
  `;

  s.saveConfirmTimer = setTimeout(() => {
    s.saveConfirmTimer = null;
    container.innerHTML = `<span class="ds-ic-helper">${getModeHelper(s.mode)}</span>`;
  }, 2500);
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
function addAncestors(out, keep) {
  const stack = [...keep];
  while (stack.length) { const cur = stack.pop(); for (const k in (out[cur]?.inputs || {})) { const v = out[cur].inputs[k]; if (!isLink(v)) continue; const o = String(v[0]); if (out[o] && !keep.has(o)) { keep.add(o); stack.push(o); } } }
}
function makeIsOutput() {
  const reg = window.LiteGraph?.registered_node_types; if (!reg) return null;
  return classType => !!(classType && reg[classType]?.nodeData?.output_node);
}
function buildNodeIndex() {
  const index = new Map();
  const visit = graph => { if (!graph) return; for (const n of (graph._nodes || graph.nodes || [])) { if (!n) continue; if (n.comfyClass === TYPE || n.type === TYPE) index.set(String(n.id), n); const inner = n.subgraph || n.graph || n._graph; if (inner && inner !== graph) visit(inner); } };
  visit(app.graph); return index;
}
function findNode(index, id) { const s = String(id); if (index.has(s)) return index.get(s); const tail = s.includes(":") ? s.slice(s.lastIndexOf(":") + 1) : null; return tail && index.has(tail) ? index.get(tail) : null; }
function collectGates(out) {
  const index = buildNodeIndex(), gates = [];
  for (const id in out) {
    const entry = out[id]; if (!entry || entry.class_type !== TYPE) continue;
    const node = findNode(index, id); const oneShot = node?._dsICSubmitMode;
    const mode = oneShot === "continue" || oneShot === "pause" ? oneShot : (node?.properties?.[STATE_PROP] === "pass" ? "pass" : "pause");
    gates.push({ id, entry, mode });
  }
  return gates;
}
function applyGateMode(out, id, entry, mode, isOutput) {
  entry.inputs ??= {};
  const nonce = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  if (mode === "pause") {
    const downstream = collectDownstream(buildConsumers(out), id);
    for (const d of downstream) delete out[d];
    entry.inputs[HIDDEN_INPUT] = JSON.stringify({ mode: "pause", nonce });
    return;
  }
  if (mode === "pass") { entry.inputs[HIDDEN_INPUT] = JSON.stringify({ mode: "pass" }); return; }

  const gateSrc = isLink(entry.inputs.image) ? [String(entry.inputs.image[0]), Number(entry.inputs.image[1])] : null;
  delete entry.inputs.image;
  entry.inputs[HIDDEN_INPUT] = JSON.stringify({ mode: "continue", nonce });
  const consumers = buildConsumers(out), downstream = collectDownstream(consumers, id);
  if (gateSrc) for (const dId of downstream) for (const k in (out[dId]?.inputs || {})) {
    const v = out[dId].inputs[k];
    if (isLink(v) && String(v[0]) === gateSrc[0] && Number(v[1]) === gateSrc[1]) out[dId].inputs[k] = [String(id), 0];
  }
  const keep = new Set(downstream); keep.add(String(id)); addAncestors(out, keep);
  for (const nid of Object.keys(out)) {
    if (!keep.has(String(nid))) {
      delete out[nid];
    }
  }
}

async function queueWithMode(node, mode) {
  const all = app.graph?._nodes || app.graph?.nodes || [];
  for (const n of all) if (n !== node) n._dsICSubmitMode = null;
  node._dsICSubmitMode = mode;
  node._dsICActiveMode = mode;
  const s = stateOf(node);
  s.busy = true;
  setStatus(node, "busy", mode === "continue" ? "CONTINUING…" : "REGENERATING…");
  log("queue", mode, "node", node.id);
  try {
    await app.queuePrompt(0, 1);
  } catch (e) {
    error("queue failed", e);
    toast(node, `Queue failed: ${e.message}`);
    s.busy = false;
    node._dsICActiveMode = null;
    node._dsICSubmitMode = null;
    setStatus(node, s.hasSnapshot ? "paused" : "ready", s.hasSnapshot ? "PAUSED · READY" : "READY");
  } finally {
    node._dsICSubmitMode = null;
  }
}
async function abortExecution(node, actionName) {
  log("aborting", actionName, "node", node?.id);
  try {
    if (typeof api.interrupt === "function") {
      await api.interrupt();
    } else {
      await api.fetchApi("/interrupt", { method: "POST" });
    }
  } catch (e) {
    error("interrupt failed", e);
  }
}
async function continueExecution(node) {
  const s = stateOf(node);
  if (s.mode !== "pause" || !s.hasSnapshot || s.busy) return;
  window._dsCheckpointContinuing = true;
  await queueWithMode(node, "continue");
}
async function regenerate(node) {
  const s = stateOf(node);
  if (s.mode !== "pause" || s.busy) return;
  window._dsCheckpointContinuing = false;
  await queueWithMode(node, "pause");
}
async function copyPreview(node) {
  const s = stateOf(node);
  if (!s.hasSnapshot) return toast(node, "No image yet");
  try {
    const r = await fetch(s.previewUrl, { cache: "no-store" });
    if (!r.ok) throw new Error();
    const blob = await r.blob();
    if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") throw new Error("Clipboard not supported");
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob.type === "image/png" ? blob : new Blob([blob], { type: "image/png" }) })]);
    toast(node, "Copied to clipboard");
  } catch (e) {
    error("copy failed", e);
    toast(node, "Copy failed");
  }
}
function openPreview(node) {
  const s = stateOf(node);
  if (!s.hasSnapshot) return toast(node, "No image yet");
  const w = window.open(s.previewUrl, "_blank", "noopener,noreferrer");
  if (!w) toast(node, "Popup blocked");
}
async function savePreview(node) {
  const s = stateOf(node);
  if (!s.hasSnapshot) return toast(node, "No image yet");
  const root = rootOf(node);
  const saveBtn = root?.querySelector(".ds-ic-save");
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.classList.add("is-saving");
    saveBtn.replaceChildren(DSIcon("refresh-cw", { size: 14 }));
  }
  try {
    const r = await api.fetchApi("/ds/image_checkpoint/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ node_id: String(node.id), filename: `DS_ImageCheckpoint_${node.id}` }),
    });
    const d = await r.json();
    if (!r.ok || !d.ok) {
      throw new Error(d.error || `HTTP ${r.status}`);
    }
    showSaveConfirmation(node, { ok: true, filename: d.filename, path: d.path });
    log("saved", d.path);
  } catch (e) {
    error("save failed", e);
    showSaveConfirmation(node, { ok: false, error: e.message || "Save failed", filename: `DS_ImageCheckpoint_${node.id}` });
  } finally {
    if (saveBtn) {
      saveBtn.classList.remove("is-saving");
      saveBtn.replaceChildren(DSIcon("save", { size: 14 }));
      saveBtn.disabled = !s.hasSnapshot;
    }
  }
}

function buildUI(node) {
  const card = document.createElement("div");
  card.className = "ds-ui-card ds-ic-card";
  card.dataset.dsThemed = "true";

  card.innerHTML = `
    <div class="ds-ic-options-row">
      <div class="ds-ic-tab-group" role="tablist">
        <button type="button" class="ds-ic-tab-btn active is-active" data-mode="pause" role="tab" aria-selected="true" title="Pause mode · Stop run after capturing image"></button>
        <button type="button" class="ds-ic-tab-btn" data-mode="pass" role="tab" aria-selected="false" title="Pass mode · Run complete workflow without stopping"></button>
      </div>
      <button type="button" class="ds-ic-btn ds-ic-regenerate" title="Regenerate"></button>
      <button type="button" class="ds-ic-btn ds-ic-continue" title="Continue" disabled></button>
      <button type="button" class="ds-ic-btn ds-ic-copy" title="Copy image to clipboard" disabled></button>
      <button type="button" class="ds-ic-btn ds-ic-open" title="Open image in new window" disabled></button>
      <button type="button" class="ds-ic-btn ds-ic-save" title="Save output" disabled></button>
    </div>
    <div class="ds-ic-info-row">
      <div class="ds-ic-info-message">
        <span class="ds-ic-helper">PAUSE · Run ends here after capturing the image.</span>
      </div>
      <div class="ds-ic-info-meta">
        <span class="ds-ic-dims"></span>
        <div class="ds-ic-status" data-state="ready"><span class="ds-ic-status-dot"></span><span class="ds-ic-status-text">READY</span></div>
      </div>
    </div>
    <div class="ds-ic-preview">
      <img class="ds-ic-image" alt="Checkpoint preview" hidden draggable="false">
      <div class="ds-ic-placeholder"><strong>READY</strong><span>Run the workflow to pause and inspect the image here.</span></div>
      <div class="ds-ic-toast"></div>
    </div>
  `;

  // Populate Lucide icons via DSIcon
  const pauseBtn = card.querySelector('.ds-ic-tab-btn[data-mode="pause"]');
  if (pauseBtn) pauseBtn.appendChild(DSIcon("pause", { size: 13 }));

  const passBtn = card.querySelector('.ds-ic-tab-btn[data-mode="pass"]');
  if (passBtn) passBtn.appendChild(DSIcon("chevrons-right", { size: 13 }));

  const regenBtn = card.querySelector(".ds-ic-regenerate");
  if (regenBtn) regenBtn.appendChild(DSIcon("refresh-cw", { size: 14 }));

  const contBtn = card.querySelector(".ds-ic-continue");
  if (contBtn) contBtn.appendChild(DSIcon("play", { size: 14 }));

  const copyBtn = card.querySelector(".ds-ic-copy");
  if (copyBtn) copyBtn.appendChild(DSIcon("copy", { size: 14 }));

  const openBtn = card.querySelector(".ds-ic-open");
  if (openBtn) openBtn.appendChild(DSIcon("square-arrow-out-up-right", { size: 14 }));

  const saveBtn = card.querySelector(".ds-ic-save");
  if (saveBtn) saveBtn.appendChild(DSIcon("save", { size: 14 }));

  // Event handlers
  card.querySelectorAll(".ds-ic-tab-btn").forEach(b => {
    b.addEventListener("click", e => {
      e.stopPropagation();
      setModeUI(node, b.dataset.mode, true);
    });
  });

  contBtn.addEventListener("click", e => {
    e.stopPropagation();
    const s = stateOf(node);
    if (s.busy && node._dsICActiveMode === "continue") {
      toast(node, "Aborting continuation…");
      contBtn.classList.remove("is-running");
      contBtn.classList.add("is-stopping");
      contBtn.title = "Stopping…";
      contBtn.replaceChildren(DSIcon("stop", { size: 14 }));
      abortExecution(node, "continue");
      return;
    }
    continueExecution(node);
  });

  regenBtn.addEventListener("click", e => {
    e.stopPropagation();
    const s = stateOf(node);
    if (s.busy && node._dsICActiveMode === "pause") {
      toast(node, "Aborting generation…");
      regenBtn.classList.remove("is-running");
      regenBtn.classList.add("is-stopping");
      regenBtn.title = "Stopping…";
      regenBtn.replaceChildren(DSIcon("stop", { size: 14 }));
      abortExecution(node, "regenerate");
      return;
    }
    regenerate(node);
  });

  copyBtn.addEventListener("click", e => { e.stopPropagation(); copyPreview(node); });
  openBtn.addEventListener("click", e => { e.stopPropagation(); openPreview(node); });
  saveBtn.addEventListener("click", e => { e.stopPropagation(); savePreview(node); });

  return card;
}

function installNode(node) {
  if (node._dsICInstalled) return;
  node._dsICInstalled = true;
  node.resizable = true;
  node.properties ??= {};

  if (!Array.isArray(node.size) || node.size[0] < MIN_SIZE[0] || node.size[1] < MIN_SIZE[1]) {
    node.size = [...DEFAULT_SIZE];
  }

  const s = stateOf(node);
  s.mode = node.properties[STATE_PROP] === "pass" ? "pass" : "pause";
  protectDSResizeCorners(node);

  const card = buildUI(node);
  node._dsICRoot = card;
  normalizeDSWidgetHost(card, node, { shell: false });
  window.DSGlobalTheme?.bindNode?.(card, node);

  const CARD_MARGIN = 5;
  if (typeof node.addDOMWidget === "function") {
    const widget = node.addDOMWidget("ds_image_checkpoint_ui", "custom", card, {
      serialize: false,
      hideOnZoom: false,
      margin: CARD_MARGIN,
      getMinHeight: () => MIN_SIZE[1] - (widget?.y || 45) - CARD_MARGIN,
      getHeight: () => {
        const widgetY = Number(widget?.y ?? 45);
        const nodeHeight = Number(node.size?.[1] ?? DEFAULT_SIZE[1]);
        return Math.max(80, nodeHeight - widgetY - CARD_MARGIN);
      },
    });
    node._dsICWidget = widget;
  }

  setModeUI(node, s.mode, false);
  setStatus(node, "ready", "READY");
  log("node installed", node.id);
}

function onExecutionDone() {
  const all = app.graph?._nodes || app.graph?.nodes || [];
  for (const n of all) {
    if (n.type === TYPE || n.comfyClass === TYPE) {
      const s = stateOf(n);
      if (s.busy) {
        s.busy = false;
        n._dsICActiveMode = null;
        if (s.mode === "pause" && s.hasSnapshot) {
          setStatus(n, "paused", "PAUSED · READY");
        } else {
          setStatus(n, "ready", s.mode === "pass" ? "PASSED" : "READY");
        }
      }
    }
  }
}

app.registerExtension({
  name: EXT,
  async setup() {
    await loadCss();
    api.addEventListener("execution_start", () => {
      const all = app.graph?._nodes || app.graph?.nodes || [];
      for (const n of all) {
        if (n && (n.type === TYPE || n.comfyClass === TYPE)) {
          n._dsICExecutedInRun = false;
        }
      }
    });
    api.addEventListener("executed", e => {
      const d = e.detail, frames = d?.output?.ds_image_checkpoint;
      if (!frames?.length) return;
      let node = app.graph?.getNodeById?.(d.node);
      if (!node) node = (app.graph?._nodes || []).find(n => String(n.id) === String(d.node));
      if (!node || (node.type !== TYPE && node.comfyClass !== TYPE)) return;
      node._dsICExecutedInRun = true;
      const f = frames[0];
      if (f.width && f.height) setPreview(node, f.width, f.height);
      const s = stateOf(node);
      if (f.mode === "continue") {
        setStatus(node, "ready", "CONTINUED");
      } else if (s.mode === "pause") {
        setStatus(node, "paused", "PAUSED · READY");
        window._dsCheckpointActivePause = true;
      } else {
        setStatus(node, "ready", f.mode === "pass" ? "PASSED" : "READY");
      }
      log("executed", { node: d.node, mode: f.mode, width: f.width, height: f.height });
    });
    api.addEventListener("execution_success", onExecutionDone);
    api.addEventListener("execution_error", onExecutionDone);
    api.addEventListener("execution_interrupted", () => {
      onExecutionDone();
      log("execution interrupted");
    });
    api.addEventListener("executing", ({ detail }) => {
      if (detail === null) onExecutionDone();
    });
    log("extension ready");
  },
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== TYPE) return;
    const oldCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const r = oldCreated?.apply(this, arguments);
      installNode(this);
      return r;
    };
    const oldConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
      const r = oldConfigure?.apply(this, arguments);
      if (!this.properties) this.properties = {};
      const s = stateOf(this);
      s.mode = this.properties[STATE_PROP] === "pass" ? "pass" : "pause";
      setModeUI(this, s.mode, false);
      setStatus(this, "ready", "READY");
      const lw = this.properties.ds_ic_last_width;
      const lh = this.properties.ds_ic_last_height;
      if (lw && lh) { setTimeout(() => setPreview(this, lw, lh), 80); }
      return r;
    };
    const oldResize = nodeType.prototype.onResize;
    nodeType.prototype.onResize = function (size) {
      if (size[0] < MIN_SIZE[0]) size[0] = MIN_SIZE[0];
      if (size[1] < MIN_SIZE[1]) size[1] = MIN_SIZE[1];
      return oldResize?.apply(this, arguments);
    };
    const oldRemoved = nodeType.prototype.onRemoved;
    nodeType.prototype.onRemoved = function () {
      clearTimeout(this._dsICState?.flashTimer);
      clearTimeout(this._dsICState?.saveConfirmTimer);
      return oldRemoved?.apply(this, arguments);
    };
  }
});

const originalGraphToPrompt = app.graphToPrompt.bind(app);
app.graphToPrompt = async function (...args) {
  const result = await originalGraphToPrompt(...args);
  try {
    const out = result?.output;
    if (out) for (const g of collectGates(out)) {
      g.entry.inputs ??= {};
      g.entry.inputs[HIDDEN_INPUT] = JSON.stringify({ mode: g.mode, nonce: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}` });
    }
  } catch (e) {
    error("prompt mode injection failed; sending unchanged prompt", e);
  }
  return result;
};

if (!api._dsImageCheckpointQueueWrappedV3) {
  api._dsImageCheckpointQueueWrappedV3 = true;
  const originalQueuePrompt = api.queuePrompt.bind(api);
  api.queuePrompt = async function (...args) {
    try {
      const out = args[1]?.output;
      if (out) {
        const isOutput = makeIsOutput();
        const gates = collectGates(out);
        const rank = { continue: 0, pause: 1, pass: 2 };
        gates.sort((a, b) => rank[a.mode] - rank[b.mode]);
        for (const g of gates) if (out[g.id]) applyGateMode(out, g.id, g.entry, g.mode, isOutput);
      }
    } catch (e) {
      error("submit-time prune failed; sending original prompt", e);
    }
    return originalQueuePrompt(...args);
  };
}
