import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";
import { DSIcon, normalizeDSWidgetHost, protectDSResizeCorners } from "../UIElements/index.js";

const TYPE = "DS_ImagePreview";
const EXT = "DeathshotArsenal.DSImagePreview";
const MODE_PROP = "ds_image_preview_mode";
const DEFAULT_SIZE = [620, 650];
const MIN_SIZE = [400, 360];
const CSS_ID = "ds-image-preview-css-v7";

function log(...args) { console.log("[DS Image Preview]", ...args); }
function error(...args) { console.error("[DS Image Preview]", ...args); }
function url(path) { try { return api.apiURL ? api.apiURL(path) : path; } catch { return path; } }

let cssPromise;
function loadCss() {
  if (cssPromise) return cssPromise;
  cssPromise = new Promise((resolve) => {
    if (document.getElementById(CSS_ID)) return resolve();
    const link = document.createElement("link");
    link.id = CSS_ID;
    link.rel = "stylesheet";
    link.href = "/extensions/DeathshotArsenal/Image Preview/ds_image_preview.css?v=7";
    link.onload = resolve;
    link.onerror = resolve;
    document.head.appendChild(link);
  });
  return cssPromise;
}

function state(node) {
  return node._dsImagePreviewState || (node._dsImagePreviewState = {
    mode: node.properties?.[MODE_PROP] === "save" ? "save" : "preview",
    file: "",
    width: 0,
    height: 0,
    count: 0,
    busy: false,
    toastTimer: null,
    saveConfirmTimer: null,
  });
}

function cleanupNode(node) {
  if (Array.isArray(node.inputs)) {
    for (let i = node.inputs.length - 1; i >= 0; i--) {
      const inp = node.inputs[i];
      if (inp.name !== "image") {
        node.removeInput(i);
      } else {
        inp.type = "IMAGE";
      }
    }
  }
  if (Array.isArray(node.widgets)) {
    for (let i = node.widgets.length - 1; i >= 0; i--) {
      if (node.widgets[i].name === "SaveMode") {
        node.widgets.splice(i, 1);
      }
    }
  }
  if (Array.isArray(node.outputs)) {
    for (let i = node.outputs.length - 1; i >= 0; i--) {
      const out = node.outputs[i];
      if (out.name !== "image") {
        node.removeOutput(i);
      } else {
        out.type = "IMAGE";
      }
    }
  }
}

function persist(node) {
  node.properties ??= {};
  node.properties[MODE_PROP] = state(node).mode;
  node.properties.ds_image_preview_version = 3;
}

function getModeHelper(mode) {
  return mode === "save"
    ? "SAVE · Every queued image is written as a separate PNG."
    : "PREVIEW · Inspect the image without creating output files.";
}

function updatePlaceholder(node, isError = false) {
  const s = state(node);
  const root = node._dsImagePreviewRoot;
  if (!root) return;
  const ph = root.querySelector(".ds-ip-placeholder");
  if (!ph) return;

  const strong = ph.querySelector("strong");
  const span = ph.querySelector("span");

  if (isError) {
    if (strong) strong.textContent = "PREVIEW UNAVAILABLE";
    if (span) span.textContent = s.mode === "save"
      ? "Run the workflow to save and preview the image."
      : "Run the workflow to preview the image here.";
    return;
  }

  if (strong) strong.textContent = "READY";
  if (span) {
    span.textContent = s.mode === "save"
      ? "Run the workflow to save and preview the image here."
      : "Run the workflow to preview the image here.";
  }
}

function toast(node, text) {
  const root = node._dsImagePreviewRoot;
  const el = root?.querySelector(".ds-ip-toast");
  if (!el) return;
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(state(node).toastTimer);
  state(node).toastTimer = setTimeout(() => el.classList.remove("show"), 1600);
}

function renderMode(node) {
  const s = state(node), root = node._dsImagePreviewRoot;
  if (!root) return;
  root.querySelectorAll(".ds-ip-tab-btn").forEach((b) => {
    const isActive = b.dataset.mode === s.mode;
    b.classList.toggle("active", isActive);
    b.classList.toggle("is-active", isActive);
    b.setAttribute("aria-selected", isActive ? "true" : "false");
  });
  if (!s.saveConfirmTimer) {
    const note = root.querySelector(".ds-ip-helper");
    if (note) note.textContent = getModeHelper(s.mode);
  }
}

function setMode(node, mode) {
  state(node).mode = mode === "save" ? "save" : "preview";
  persist(node);
  renderMode(node);
  updatePlaceholder(node);
  node.setDirtyCanvas?.(true, true);
  log("mode", state(node).mode, "node", node.id);
}

function setImage(node, info) {
  const s = state(node), root = node._dsImagePreviewRoot;
  if (!root || !info?.file) return;
  s.file = info.file;
  s.width = Number(info.width) || 0;
  s.height = Number(info.height) || 0;
  s.count = Number(info.count) || 1;
  node.properties ??= {};
  node.properties.ds_ip_last_file = s.file;
  node.properties.ds_ip_last_width = s.width;
  node.properties.ds_ip_last_height = s.height;
  const img = root.querySelector(".ds-ip-image");
  const ph = root.querySelector(".ds-ip-placeholder");
  const dims = root.querySelector(".ds-ip-dims");
  if (dims) dims.textContent = `${s.width} × ${s.height}${s.count > 1 ? ` · ${s.count} images` : ""}`;
  if (img) {
    img.onload = () => { img.hidden = false; if (ph) ph.hidden = true; };
    img.onerror = () => {
      img.hidden = true;
      if (ph) {
        ph.hidden = false;
        updatePlaceholder(node, true);
      }
    };
    img.src = url(`/ds/image_preview/preview?file=${encodeURIComponent(s.file)}&t=${Date.now()}`);
  }
  if (ph && img.hidden) {
    updatePlaceholder(node);
  }
  if (s.mode === "save" && info.saved?.length) {
    showSaveConfirmation(node, {
      ok: true,
      filename: info.saved[0],
      path: info.saved_paths?.[0] || "",
    });
  }
  node.setDirtyCanvas?.(true, true);
}

function showSaveConfirmation(node, { ok, filename, path, error: errMsg }) {
  const root = node._dsImagePreviewRoot;
  if (!root) return;
  const container = root.querySelector(".ds-ip-info-message");
  if (!container) return;
  const s = state(node);

  if (s.saveConfirmTimer) {
    clearTimeout(s.saveConfirmTimer);
    s.saveConfirmTimer = null;
  }

  const safeFile = filename ? String(filename) : (ok ? "image.png" : "file");
  const safePath = path ? String(path) : "";
  const safeErr = errMsg ? String(errMsg) : "Could not save file";

  container.innerHTML = `
    <div class="ds-ip-save-confirm ${ok ? "is-success" : "is-error"}" title="${ok ? (safePath ? `${safeFile} → ${safePath}` : safeFile) : safeErr}">
      <span class="ds-ip-save-confirm-icon">${ok ? "✓" : "✕"}</span>
      <span class="ds-ip-save-confirm-title">${ok ? "Saved" : "Save failed"}</span>
      <span>·</span>
      <span class="ds-ip-save-confirm-name">${ok ? safeFile : safeErr}</span>
      ${ok && safePath ? `<span>·</span><span class="ds-ip-save-confirm-path">${safePath}</span>` : ""}
    </div>
  `;

  s.saveConfirmTimer = setTimeout(() => {
    s.saveConfirmTimer = null;
    container.innerHTML = `<span class="ds-ip-helper">${getModeHelper(s.mode)}</span>`;
  }, 2500);
}

async function copyImage(node) {
  const s = state(node);
  if (!s.file) return toast(node, "No image yet");
  try {
    const r = await fetch(url(`/ds/image_preview/preview?file=${encodeURIComponent(s.file)}`), { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const blob = await r.blob();
    if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") throw new Error("Clipboard image API unavailable");
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    toast(node, "Copied image");
  } catch (e) {
    error("copy failed", e);
    toast(node, "Copy failed");
  }
}

function openImage(node) {
  const s = state(node);
  if (!s.file) return toast(node, "No image yet");
  const w = window.open(url(`/ds/image_preview/preview?file=${encodeURIComponent(s.file)}&t=${Date.now()}`), "_blank");
  if (!w) toast(node, "Popup blocked");
}

async function saveImage(node) {
  const s = state(node);
  if (!s.file) return toast(node, "No image yet");
  const root = node._dsImagePreviewRoot;
  const saveBtn = root?.querySelector(".ds-ip-save");
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.classList.add("is-saving");
    saveBtn.replaceChildren(DSIcon("refresh-cw", { size: 14 }));
  }
  try {
    const r = await api.fetchApi("/ds/image_preview/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file: s.file, node_id: String(node.id) }),
    });
    const d = await r.json();
    if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
    showSaveConfirmation(node, { ok: true, filename: d.filename, path: d.path });
    log("manual save", d.path);
  } catch (e) {
    error("save failed", e);
    showSaveConfirmation(node, { ok: false, error: e.message || "Save failed", filename: s.file });
  } finally {
    if (saveBtn) {
      saveBtn.classList.remove("is-saving");
      saveBtn.replaceChildren(DSIcon("save", { size: 14 }));
      saveBtn.disabled = !s.file;
    }
  }
}

function buildUI(node) {
  const card = document.createElement("div");
  card.className = "ds-ui-card ds-ip-card";
  card.dataset.dsThemed = "true";

  card.innerHTML = `
    <div class="ds-ip-options-row">
      <div class="ds-ip-tab-group" role="tablist">
        <button type="button" class="ds-ip-tab-btn active is-active" data-mode="preview" role="tab" aria-selected="true" title="Preview mode · Inspect without saving"></button>
        <button type="button" class="ds-ip-tab-btn" data-mode="save" role="tab" aria-selected="false" title="Save mode · Write every queued image to disk"></button>
      </div>
      <button type="button" class="ds-ip-btn ds-ip-copy" title="Copy image to clipboard"></button>
      <button type="button" class="ds-ip-btn ds-ip-open" title="Open image in new window"></button>
      <button type="button" class="ds-ip-btn ds-ip-save" title="Save output"></button>
    </div>
    <div class="ds-ip-info-row">
      <div class="ds-ip-info-message">
        <span class="ds-ip-helper">PREVIEW · Inspect the image without creating output files.</span>
      </div>
      <div class="ds-ip-info-meta">
        <span class="ds-ip-dims"></span>
        <div class="ds-ip-status"><span class="ds-ip-dot"></span><span class="ds-ip-status-text">READY</span></div>
      </div>
    </div>
    <div class="ds-ip-preview">
      <img class="ds-ip-image" alt="Image preview" hidden draggable="false">
      <div class="ds-ip-placeholder"><strong>READY</strong><span>Run the workflow to preview the image here.</span></div>
      <div class="ds-ip-toast"></div>
    </div>
  `;

  // Attach DSIcons
  const prevBtn = card.querySelector('.ds-ip-tab-btn[data-mode="preview"]');
  if (prevBtn) prevBtn.appendChild(DSIcon("eye", { size: 13 }));

  const saveTabBtn = card.querySelector('.ds-ip-tab-btn[data-mode="save"]');
  if (saveTabBtn) saveTabBtn.appendChild(DSIcon("download", { size: 13 }));

  const copyBtn = card.querySelector(".ds-ip-copy");
  if (copyBtn) copyBtn.appendChild(DSIcon("copy", { size: 14 }));

  const openBtn = card.querySelector(".ds-ip-open");
  if (openBtn) openBtn.appendChild(DSIcon("square-arrow-out-up-right", { size: 14 }));

  const saveBtn = card.querySelector(".ds-ip-save");
  if (saveBtn) saveBtn.appendChild(DSIcon("save", { size: 14 }));

  // Event handlers
  card.querySelectorAll(".ds-ip-tab-btn").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); setMode(node, b.dataset.mode); }));
  copyBtn.addEventListener("click", (e) => { e.stopPropagation(); copyImage(node); });
  openBtn.addEventListener("click", (e) => { e.stopPropagation(); openImage(node); });
  saveBtn.addEventListener("click", (e) => { e.stopPropagation(); saveImage(node); });

  return card;
}

function install(node) {
  if (node._dsImagePreviewInstalled) return;
  node._dsImagePreviewInstalled = true;
  node.resizable = true;
  node.properties ??= {};

  if (!Array.isArray(node.size) || node.size[0] < MIN_SIZE[0] || node.size[1] < MIN_SIZE[1]) {
    node.size = [...DEFAULT_SIZE];
  }
  state(node).mode = node.properties[MODE_PROP] === "save" ? "save" : "preview";

  cleanupNode(node);
  protectDSResizeCorners(node);

  const card = buildUI(node);
  node._dsImagePreviewRoot = card;
  normalizeDSWidgetHost(card, node, { shell: false });
  window.DSGlobalTheme?.bindNode?.(card, node);

  const CARD_MARGIN = 5;
  if (typeof node.addDOMWidget === "function") {
    node._dsImagePreviewWidget = node.addDOMWidget("ds_image_preview_ui", "custom", card, {
      serialize: false,
      hideOnZoom: false,
      margin: CARD_MARGIN,
      getMinHeight: () => MIN_SIZE[1] - (node._dsImagePreviewWidget?.y || 42) - CARD_MARGIN,
      getHeight: () => {
        const widgetY = Number(node._dsImagePreviewWidget?.y ?? 42);
        const nodeHeight = Number(node.size?.[1] ?? DEFAULT_SIZE[1]);
        return Math.max(80, nodeHeight - widgetY - CARD_MARGIN);
      },
    });
  }
  cleanupNode(node);
  renderMode(node);
  log("node installed", node.id);
}

function installPromptHook() {
  if (app._dsImagePreviewGraphToPromptHook) return;
  app._dsImagePreviewGraphToPromptHook = true;
  const original = app.graphToPrompt?.bind(app);
  if (!original) return;
  app.graphToPrompt = async function (...args) {
    const result = await original(...args);
    try {
      const out = result?.output || {};
      for (const id in out) {
        const entry = out[id];
        if (!entry || entry.class_type !== TYPE || !entry.inputs) continue;
        let node = app.graph?.getNodeById?.(id);
        if (!node) node = (app.graph?._nodes || []).find((n) => String(n.id) === String(id));
        if (!node) continue;
        entry.inputs.SaveMode = state(node).mode || "preview";
      }
    } catch (e) {
      error("graphToPrompt error", e);
    }
    return result;
  };
}

app.registerExtension({
  name: EXT,
  async setup() {
    await loadCss();
    installPromptHook();
    api.addEventListener("executed", (e) => {
      const data = e.detail;
      const frames = data?.output?.ds_image_preview;
      if (!frames?.length) return;
      let node = app.graph?.getNodeById?.(data.node);
      if (!node) node = (app.graph?._nodes || []).find((n) => String(n.id) === String(data.node));
      if (!node || node.type !== TYPE) return;
      setImage(node, frames[0]);
      const status = node._dsImagePreviewRoot?.querySelector(".ds-ip-status-text");
      if (status) status.textContent = state(node).mode === "save" ? "SAVED" : "PREVIEW";
      log("executed", { node: data.node, mode: frames[0].mode, count: frames[0].count });
    });
    log("extension ready");
  },
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== TYPE) return;
    const oldCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const result = oldCreated?.apply(this, arguments);
      install(this);
      return result;
    };
    const oldConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
      const result = oldConfigure?.apply(this, arguments);
      if (!this.properties) this.properties = {};
      const s = state(this);
      const loadedMode = this.properties[MODE_PROP] === "save" ? "save" : "preview";
      s.mode = loadedMode;
      this.properties[MODE_PROP] = loadedMode;
      cleanupNode(this);
      renderMode(this);
      const lastFile = this.properties.ds_ip_last_file;
      if (lastFile) {
        setTimeout(() => setImage(this, {
          file: lastFile,
          width: this.properties.ds_ip_last_width || 0,
          height: this.properties.ds_ip_last_height || 0,
          count: 1,
        }), 80);
      }
      return result;
    };
    const oldResize = nodeType.prototype.onResize;
    nodeType.prototype.onResize = function (size) {
      if (size[0] < MIN_SIZE[0]) size[0] = MIN_SIZE[0];
      if (size[1] < MIN_SIZE[1]) size[1] = MIN_SIZE[1];
      return oldResize?.apply(this, arguments);
    };
    const oldRemoved = nodeType.prototype.onRemoved;
    nodeType.prototype.onRemoved = function () {
      clearTimeout(this._dsImagePreviewState?.toastTimer);
      clearTimeout(this._dsImagePreviewState?.saveConfirmTimer);
      return oldRemoved?.apply(this, arguments);
    };
  },
});
