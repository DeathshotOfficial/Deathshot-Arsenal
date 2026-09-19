import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

const TYPE = "DS_ImagePreview";
const EXT = "DeathshotArsenal.DSImagePreview";
const MODE_PROP = "ds_image_preview_mode";
const DEFAULT_SIZE = [620, 650];
const MIN_SIZE = [440, 430];
const CSS_ID = "ds-image-preview-css-v2";

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
    link.href = "/extensions/DeathshotArsenal/Image Preview/ds_image_preview.css?v=2";
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

function modeWidget(node) {
  return (node.widgets || []).find((w) => w.name === "SaveMode");
}

function syncModeWidget(node) {
  const w = modeWidget(node);
  if (w) w.value = state(node).mode;
}

function hideModeWidget(node) {
  const w = modeWidget(node);
  if (!w) return;
  // Keep a real serialized widget in the node, but remove its native visual footprint.
  w.hidden = true;
  w.computeSize = () => [0, 0];
  w.serializeValue = () => state(node).mode;
}

function persist(node) {
  node.properties ??= {};
  node.properties[MODE_PROP] = state(node).mode;
  node.properties.ds_image_preview_version = 2;
  syncModeWidget(node);
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
  root.querySelectorAll(".ds-ip-mode").forEach((b) => b.classList.toggle("active", b.dataset.mode === s.mode));
  const note = root.querySelector(".ds-ip-mode-note");
  if (note) note.textContent = s.mode === "save"
    ? "SAVE · preview shown and every queued image is written as a separate PNG."
    : "PREVIEW · inspect the image without creating output files.";
}

function setMode(node, mode) {
  state(node).mode = mode === "save" ? "save" : "preview";
  persist(node);
  syncModeWidget(node);
  renderMode(node);
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
  // Persist so the image can be restored after switching workflows
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
    img.onerror = () => { img.hidden = true; if (ph) { ph.hidden = false; ph.querySelector("strong").textContent = "PREVIEW UNAVAILABLE"; } };
    img.src = url(`/ds/image_preview/preview?file=${encodeURIComponent(s.file)}&t=${Date.now()}`);
  }
  if (ph) {
    ph.querySelector("strong").textContent = "READY";
    ph.querySelector("span").textContent = s.mode === "save" ? "Image saved and ready to inspect." : "Run the workflow to preview the image here.";
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
  const root = node._dsImagePreviewRoot; if (!root) return;
  const container = root.querySelector(".ds-ip-actions"); if (!container) return;
  const s = state(node);
  if (s.saveConfirmTimer) {
    clearTimeout(s.saveConfirmTimer);
    s.saveConfirmTimer = null;
  }
  const old = container.querySelector(".ds-save-confirm");
  if (old) old.remove();

  const overlay = document.createElement("div");
  overlay.className = `ds-save-confirm ${ok ? "ds-save-confirm-success" : "ds-save-confirm-error"}`;
  try { window.DSGlobalTheme?.applyToElement?.(overlay); } catch (_) {}

  const safeFile = filename ? String(filename) : (ok ? "image.png" : "file");
  const safePath = path ? String(path) : "";
  const safeErr = errMsg ? String(errMsg) : "Could not save file";

  if (ok) {
    overlay.title = safePath ? `${safeFile} → ${safePath}` : safeFile;
    overlay.innerHTML = `
      <span class="ds-save-confirm-icon">✓</span>
      <span class="ds-save-confirm-title">Saved</span>
      <span class="ds-save-confirm-sep">·</span>
      <span class="ds-save-confirm-name" title="${safeFile}">${safeFile}</span>
      ${safePath ? `<span class="ds-save-confirm-sep">·</span><span class="ds-save-confirm-path" title="${safePath}">${safePath}</span>` : ""}
    `;
  } else {
    overlay.title = safeErr;
    overlay.innerHTML = `
      <span class="ds-save-confirm-icon">✕</span>
      <span class="ds-save-confirm-title">Save failed</span>
      <span class="ds-save-confirm-sep">·</span>
      <span class="ds-save-confirm-name" title="${safeErr}">${safeErr}</span>
    `;
  }

  container.appendChild(overlay);
  s.saveConfirmTimer = setTimeout(() => {
    overlay.remove();
    s.saveConfirmTimer = null;
  }, 2000);
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
    saveBtn.textContent = "SAVING…";
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
      saveBtn.disabled = !s.file;
      saveBtn.textContent = "SAVE OUTPUT";
    }
  }
}

function buildUI(node) {
  const root = document.createElement("div");
  root.className = "ds-ip-root";
  root.dataset.dsThemed = "true";
  root.innerHTML = `
    <div class="ds-ip-top">
      <div class="ds-ip-heading">
        <span class="ds-ip-mark">DS</span>
        <strong>IMAGE PREVIEW</strong>
      </div>
      <div class="ds-ip-status"><span class="ds-ip-dot"></span><span class="ds-ip-status-text">READY</span></div>
    </div>
    <div class="ds-ip-modebar">
      <button class="ds-ip-mode active" data-mode="preview">PREVIEW</button>
      <button class="ds-ip-mode" data-mode="save">SAVE</button>
    </div>
    <div class="ds-ip-mode-note">PREVIEW · inspect the image without creating output files.</div>
    <div class="ds-ip-actions">
      <button class="ds-ip-action ds-ip-copy">COPY</button>
      <button class="ds-ip-action ds-ip-open">OPEN</button>
      <button class="ds-ip-action ds-ip-save">SAVE OUTPUT</button>
    </div>
    <div class="ds-ip-preview">
      <img class="ds-ip-image" alt="Image preview" hidden draggable="false">
      <div class="ds-ip-placeholder"><strong>READY</strong><span>Run the workflow to preview the image here.</span></div>
      <div class="ds-ip-meta"><span class="ds-ip-dims"></span></div>
      <div class="ds-ip-toast"></div>
    </div>
  `;
  root.querySelectorAll(".ds-ip-mode").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); setMode(node, b.dataset.mode); }));
  root.querySelector(".ds-ip-copy").addEventListener("click", (e) => { e.stopPropagation(); copyImage(node); });
  root.querySelector(".ds-ip-open").addEventListener("click", (e) => { e.stopPropagation(); openImage(node); });
  root.querySelector(".ds-ip-save").addEventListener("click", (e) => { e.stopPropagation(); saveImage(node); });
  return root;
}

function install(node) {
  if (node._dsImagePreviewInstalled) return;
  node._dsImagePreviewInstalled = true;
  node.resizable = true;
  node.properties ??= {};
  if (!Array.isArray(node.size) || node.size[0] < MIN_SIZE[0] || node.size[1] < MIN_SIZE[1]) node.size = [...DEFAULT_SIZE];
  state(node).mode = node.properties[MODE_PROP] === "save" ? "save" : "preview";

  const root = buildUI(node);
  node._dsImagePreviewRoot = root;
  window.DSGlobalTheme?.bindNode?.(root, node);

  hideModeWidget(node);

  if (typeof node.addDOMWidget === "function") {
    node._dsImagePreviewWidget = node.addDOMWidget("ds_image_preview_ui", "div", root, {
      serialize: false,
      hideOnZoom: false,
      margin: 4,
      getMinHeight: () => MIN_SIZE[1] - 42,
      getHeight: () => Math.max(1, (Number(node.size?.[1]) || DEFAULT_SIZE[1]) - 42),
    });
  }
  hideModeWidget(node);
  renderMode(node);
  log("node installed", node.id);
}

app.registerExtension({
  name: EXT,
  async setup() {
    await loadCss();
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
      const w = modeWidget(this);
      const loadedMode = w?.value === "save" || this.properties[MODE_PROP] === "save" ? "save" : "preview";
      s.mode = loadedMode;
      this.properties[MODE_PROP] = loadedMode;
      hideModeWidget(this);
      syncModeWidget(this);
      renderMode(this);
      // Restore last-shown image if we have a saved file reference from before workflow switch
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
