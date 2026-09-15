/**
 * DS Quick Save
 * Simple, powerful image saver with inline custom UI.
 *
 * - IMAGE input
 * - Save dir + folder browser button (server-side modal)
 * - Suffix (appended after timestamp)
 * - Always PNG (high quality / fast)
 * - Live image preview of last saved
 * - One-click "Delete Last Saved" (for artifact cleanup)
 */

import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

// Inject minimal scoped styles (self-contained colors, no external vars)
const style = document.createElement("style");
style.textContent = `
.ds-qs-root {
  font-family: Inter, system-ui, sans-serif;
  font-size: 13px;
  color: #e5e7eb;
  background: #0b0d12;
  border: 1px solid #242a36;
  border-radius: 10px;
  padding: 6px 8px 6px 8px;
  margin: 0;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 5px;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}
.ds-qs-header {
  font-family: inherit;
  font-weight: 700;
  font-size: 14px;
  color: var(--ds-accent, #67e8f9);
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.ds-qs-header .ds-qs-badge {
  margin-left: auto;
  font-size: 10px;
  font-weight: 500;
  color: #666;
}
.ds-qs-row {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-shrink: 0;
}
.ds-qs-input {
  flex: 1;
  background: #12151c;
  border: 1px solid #242a36;
  color: #e5e7eb;
  padding: 6px 8px;
  border-radius: 6px;
  font-size: 12px;
  outline: none;
  min-width: 0;
}
.ds-qs-input:focus {
  border-color: #67e8f9;
}
.ds-qs-btn {
  background: #12151c;
  border: 1px solid #242a36;
  color: #e5e7eb;
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
  flex-shrink: 0;
}
.ds-qs-btn:hover {
  border-color: #67e8f9;
  color: #67e8f9;
}
.ds-qs-btn.danger {
  color: #f87171;
  border-color: #3a2a2a;
}
.ds-qs-btn.danger:hover {
  background: #2a1f1f;
  border-color: #f87171;
}
.ds-qs-btn.icon-only {
  padding: 0;
  width: 30px;
  height: 30px;
  min-width: 30px;
  justify-content: center;
}
.ds-qs-btn.icon-only svg {
  display: block;
}
.ds-qs-preview {
  background: #0a0c10;
  border: 1px solid #242a36;
  border-radius: 8px;
  flex: 1 1 0;
  min-height: 0;
  overflow: hidden;
  position: relative;
}
.ds-qs-preview-inner {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.ds-qs-preview img {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  object-fit: contain;
  display: block;
}
.ds-qs-preview .empty {
  color: #9ca3af;
  font-size: 11px;
  text-align: center;
  padding: 12px;
  line-height: 1.4;
}
.ds-qs-info {
  font-size: 10px;
  color: #9ca3af;
  word-break: break-all;
  min-height: 12px;
  line-height: 1.2;
  flex-shrink: 0;
  margin: 0;
  padding: 0;
}
.ds-qs-modal {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.75);
  z-index: 999999;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ds-qs-modal-content {
  background: #12151c;
  border: 1px solid #242a36;
  border-radius: 10px;
  width: min(420px, 92vw);
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.ds-qs-modal-header {
  padding: 10px 14px;
  border-bottom: 1px solid #242a36;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
  color: #e5e7eb;
}
.ds-qs-modal-body {
  padding: 10px;
  overflow: auto;
  flex: 1;
  color: #e5e7eb;
}

/* Modern scrollbar + hide arrows for this scroller */
.ds-qs-modal-body::-webkit-scrollbar { width: 6px; height: 6px; }
.ds-qs-modal-body::-webkit-scrollbar-track { background: var(--ds-panel); }
.ds-qs-modal-body::-webkit-scrollbar-thumb { background: var(--ds-scrollbar); border-radius: 3px; }
.ds-qs-modal-body::-webkit-scrollbar-thumb:hover { background: var(--ds-accent); }
.ds-qs-modal-body::-webkit-scrollbar-button,
.ds-qs-modal-body::-webkit-scrollbar-button:single-button {
  display: none !important;
  height: 0 !important;
  width: 0 !important;
  background: transparent !important;
  border: none !important;
}
.ds-qs-modal-body::-webkit-scrollbar-corner { background: transparent; }

.ds-qs-dir-item {
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
  margin-bottom: 2px;
  color: #e5e7eb;
}
.ds-qs-dir-item:hover {
  background: rgba(103,232,249,0.08);
}
`;
document.head.appendChild(style);

// Icons
const ICONS = {
  folder: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-7l-2-2H5a2 2 0 0 0-2 2z"/></svg>`,
  trash: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m-9 0v12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V6"/><path d="M10 11v6M14 11v6"/></svg>`,
};

const MIN_NODE_W = 320;
const MIN_NODE_H = 300;
// Minimum DOM widget body height (preview area); grows when user resizes node taller
const MIN_WIDGET_H = 200;
const QS_PROP_DIR = "qs_save_dir";
const QS_PROP_SUFFIX = "qs_suffix";

// Verbose debug — set false once preview is working
const QS_VERBOSE = false;

function qsLog(label, ...args) {
  if (!QS_VERBOSE) return;
  console.log(`[DS QuickSave][${label}]`, ...args);
}

function qsWarn(label, ...args) {
  console.warn(`[DS QuickSave][${label}]`, ...args);
}

function isQuickSaveNode(node) {
  if (!node) return false;
  return node.comfyClass === "DS_QuickSave" || node.type === "DS_QuickSave";
}

/** Deathshot custom aiohttp routes are at /ds/... — NOT under /api (use fileURL, not apiURL). */
function qsFileUrl(path) {
  const p = path.startsWith("/") ? path : `/${path}`;
  return typeof api.fileURL === "function" ? api.fileURL(p) : p;
}

function qsLogLayout(node, tag = "layout") {
  if (!QS_VERBOSE || !node) return;
  const root = node.root;
  const wrap = root?.parentElement;
  const preview = node.previewContainer;
  qsLog(tag, {
    nodeId: node.id,
    nodeSize: node.size ? [...node.size] : null,
    domWidget: node.domWidget
      ? {
          name: node.domWidget.name,
          y: node.domWidget.y,
          computedHeight: node.domWidget.computedHeight,
          width: node.domWidget.width,
          hasComputeSize: typeof node.domWidget.computeSize === "function",
          hasComputeLayoutSize: typeof node.domWidget.computeLayoutSize === "function",
        }
      : null,
    root: root
      ? {
          clientH: root.clientHeight,
          offsetH: root.offsetHeight,
          scrollH: root.scrollHeight,
          display: getComputedStyle(root).display,
        }
      : null,
    wrapper: wrap
      ? {
          clientH: wrap.clientHeight,
          offsetH: wrap.offsetHeight,
          className: wrap.className,
        }
      : null,
    previewBox: preview
      ? {
          clientH: preview.clientHeight,
          offsetH: preview.offsetHeight,
        }
      : null,
    previewInner: !!node.previewInner,
    imgInPreview: node.previewInner?.querySelector("img")
      ? {
          src: (node.previewInner.querySelector("img").src || "").slice(0, 120),
          naturalW: node.previewInner.querySelector("img").naturalWidth,
          naturalH: node.previewInner.querySelector("img").naturalHeight,
          complete: node.previewInner.querySelector("img").complete,
        }
      : null,
  });
}

/** ComfyUI wraps UI fields in arrays; long strings become per-character arrays over websocket. */
function unwrapUiString(val) {
  if (val == null) return null;
  if (typeof val === "string") return val;
  if (Array.isArray(val)) {
    if (!val.length) return null;
    // Websocket char-split: ["d","a","t","a",...]
    if (typeof val[0] === "string" && val[0].length <= 1) {
      return val.join("");
    }
    return unwrapUiString(val[0]);
  }
  return null;
}

function unwrapUiField(val) {
  if (val == null) return null;
  if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") return val;
  if (Array.isArray(val)) {
    if (!val.length) return null;
    if (typeof val[0] === "string" && val[0].length <= 1) return val.join("");
    return unwrapUiField(val[0]);
  }
  if (typeof val === "object") {
    const out = {};
    for (const [k, v] of Object.entries(val)) {
      out[k] = unwrapUiField(v);
    }
    return out;
  }
  return val;
}

function unwrapUiObject(val) {
  const unwrapped = unwrapUiField(val);
  return unwrapped && typeof unwrapped === "object" && !Array.isArray(unwrapped) ? unwrapped : null;
}

function viewUrlFromImageInfo(info) {
  if (!info?.filename) return null;
  return api.apiURL(
    `/view?filename=${encodeURIComponent(info.filename)}&type=${info.type || "output"}&subfolder=${encodeURIComponent(info.subfolder || "")}&t=${Date.now()}`
  );
}

function dsImageUrlFromPath(path) {
  if (!path) return null;
  return qsFileUrl(`/ds/image?path=${encodeURIComponent(path)}&t=${Date.now()}`);
}

function quicksavePreviewUrl(path) {
  const q = path ? `path=${encodeURIComponent(path)}&` : "";
  return qsFileUrl(`/ds/quicksave/preview?${q}t=${Date.now()}`);
}

/** Build ordered preview URLs to try (most reliable first). */
function previewCandidatesFromMessage(message, preferBase64 = false) {
  const out = [];
  const seen = new Set();
  const add = (url, label) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    out.push({ url, label });
  };

  if (!message) return out;

  const preview = unwrapUiString(message.preview);
  const lastPath = unwrapUiString(message.last_path);
  const info = unwrapUiObject(message.last_image);

  if (preferBase64 && preview?.startsWith("data:")) {
    add(preview, "base64-preview");
  }

  add(viewUrlFromImageInfo(info), "last_image-view");

  const images = message.images;
  if (Array.isArray(images) && images.length) {
    add(viewUrlFromImageInfo(unwrapUiObject(images[images.length - 1])), "images-view");
  }

  if (lastPath) {
    add(dsImageUrlFromPath(lastPath), "ds-image-path");
    add(quicksavePreviewUrl(lastPath), "quicksave-preview-path");
  } else {
    add(quicksavePreviewUrl(), "quicksave-preview-global");
  }

  if (preview && (preview.startsWith("data:") || preview.startsWith("/") || preview.startsWith("http"))) {
    add(preview, "preview-string");
  }

  return out;
}

function previewSrcFromMessage(message, preferBase64 = false) {
  if (!message) {
    qsLog("previewSrc", "no message");
    return null;
  }

  const preview = unwrapUiString(message.preview);
  qsLog("previewSrc", "raw message keys:", Object.keys(message), {
    previewLen: preview?.length ?? 0,
    last_path: unwrapUiString(message.last_path),
    last_image: unwrapUiObject(message.last_image),
    images: message.images,
    preferBase64,
  });

  const candidates = previewCandidatesFromMessage(message, preferBase64);
  if (candidates.length) {
    qsLog("previewSrc", `using ${candidates[0].label}`, candidates[0].url.slice(0, 120));
    return candidates[0].url;
  }

  qsWarn("previewSrc", "NO preview source resolved", message);
  return null;
}

app.registerExtension({
  name: "DeathshotArsenal.QuickSave",

  async beforeRegisterNodeDef(nodeType, nodeData, app) {
    if (nodeData.name !== "DS_QuickSave") return;

    // Prototype-level handlers so previews work even if execution finishes during init
    const origOnExecuted = nodeType.prototype.onExecuted;
    nodeType.prototype.onExecuted = function (message) {
      qsLog("onExecuted", "node", this.id, "message:", message);
      if (origOnExecuted) origOnExecuted.apply(this, arguments);
      this._handleExecutionResult?.(message, "onExecuted");
    };

    const origOnResize = nodeType.prototype.onResize;
    nodeType.prototype.onResize = function (size) {
      try {
        if (this.flags?.dragging) return;
        if (app?.canvas?.draggingNode) return;
      } catch (_) {}

      if (size[0] < MIN_NODE_W) size[0] = MIN_NODE_W;
      if (size[1] < MIN_NODE_H) size[1] = MIN_NODE_H;

      if (origOnResize) origOnResize.apply(this, arguments);
      this.setDirtyCanvas?.(true, true);
    };

    // Proper low-level hooks (more reliable than onConfigure/onSerialize for LiteGraph serialization)
    const origConfigure = nodeType.prototype.configure;
    nodeType.prototype.configure = function (info) {
      if (origConfigure) {
        origConfigure.apply(this, arguments);
      }
      // After Comfy/LiteGraph has applied properties + widgets_values to our hidden widgets,
      // restore the visible custom inputs.
      setTimeout(() => {
        try {
          this._restoreQsState?.();
          this.setDirtyCanvas?.(true, true);
        } catch (_) {}
      }, 50);
    };

    const origSerialize = nodeType.prototype.serialize;
    nodeType.prototype.serialize = function () {
      try {
        this._saveQsState?.();   // make absolutely sure DOM -> hidden + properties before export
      } catch (e) {
        console.warn("[DS QuickSave] serialize sync failed:", e);
      }
      if (origSerialize) {
        return origSerialize.apply(this, arguments);
      }
      // Fallback basic serialize if no original
      return {
        ...this,
      };
    };

    // Keep the older hooks as safety net (some code paths call them)
    const origOnConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
      if (origOnConfigure) origOnConfigure.apply(this, arguments);
      setTimeout(() => {
        this._restoreQsState?.();
        try { this.setDirtyCanvas?.(true, true); } catch (_) {}
      }, 80);
    };

    nodeType.prototype.onSerialize = function () {
      try {
        this._saveQsState?.();
      } catch (e) {
        console.warn("[DS QuickSave] onSerialize safety net failed:", e);
      }
    };

    const onNodeCreated = nodeType.prototype.onNodeCreated;

    nodeType.prototype.onNodeCreated = function () {
      const result = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;

      qsLog("onNodeCreated", "node id", this.id, "type", this.type, "comfyClass", this.comfyClass);

      this._qsPendingPreview = null;
      this.resizable = true;

      if (!this.properties) this.properties = {};
      if (this.properties[QS_PROP_DIR] === undefined) this.properties[QS_PROP_DIR] = "";
      if (this.properties[QS_PROP_SUFFIX] === undefined) this.properties[QS_PROP_SUFFIX] = "";

      if (!this.size || this.size[0] < MIN_NODE_W || this.size[1] < MIN_NODE_H) {
        this.size = [460, 380];
        this.setDirtyCanvas?.(true, true);
      }

      // Create hidden state widgets SYNCHRONOUSLY so ComfyUI can populate their .value
      // from widgets_values during configure() / workflow load. Creating them inside
      // setTimeout causes saved values to be lost on reload (UI shows default, hidden
      // values may or may not match).
      this.widgets = this.widgets || [];

      let dirWidget = this.widgets.find((w) => w && w.name === "save_dir");
      let suffixWidget = this.widgets.find((w) => w && w.name === "suffix");
      const legacyPrefixWidget = this.widgets.find((w) => w && w.name === "prefix");

      if (!dirWidget) {
        dirWidget = this.addWidget("text", "save_dir", "", () => {}, { hidden: true });
      }
      if (!suffixWidget) {
        const legacyVal = legacyPrefixWidget?.value || "";
        suffixWidget = this.addWidget("text", "suffix", legacyVal, () => {}, { hidden: true });
      }

      [dirWidget, suffixWidget, legacyPrefixWidget].forEach((w) => {
        if (!w) return;
        w.hidden = true;
        w.computeSize = () => [0, 0];
        w.draw = () => {};
        if (w.element) {
          w.element.style.display = "none";
          if (w.element.parentNode) w.element.parentNode.style.display = "none";
        }
        if (w.inputEl) {
          w.inputEl.style.display = "none";
          w.inputEl.style.height = "0";
        }
      });

      this.dirWidget = dirWidget;
      this.suffixWidget = suffixWidget;
      this.widgetsByName = this.widgetsByName || {};
      if (dirWidget) this.widgetsByName.save_dir = dirWidget;
      if (suffixWidget) this.widgetsByName.suffix = suffixWidget;

      // Belt-and-suspenders: also patch serialize/configure directly on the instance
      // (some code paths / LiteGraph versions prefer instance methods).
      const self = this;
      const origInstSerialize = this.serialize;
      this.serialize = function () {
        try { self._saveQsState?.(); } catch (_) {}
        return origInstSerialize ? origInstSerialize.apply(this, arguments) : {};
      };

      const origInstConfigure = this.configure;
      this.configure = function (info) {
        const r = origInstConfigure ? origInstConfigure.apply(this, arguments) : undefined;
        setTimeout(() => { try { self._restoreQsState?.(); self.setDirtyCanvas?.(true, true); } catch (_) {} }, 30);
        return r;
      };

      // Build the custom root + DOM widget synchronously (right after hidden widgets)
      // so that _restoreQsState can immediately populate the visible inputs from
      // either properties or the (now early-created) hidden widget values.
      try {
        this.root = this._buildRoot();

        const domWidget = this.addDOMWidget("qs_ui", "div", this.root, {
          serialize: false,
          hideOnZoom: false,
          getMinHeight: () => MIN_WIDGET_H,
        });
        this.domWidget = domWidget;

        try {
          const direct = this.root.parentElement;
          if (direct) {
            direct.style.boxSizing = "border-box";
            direct.style.minHeight = "0";
            direct.style.maxHeight = "100%";
            direct.style.overflow = "hidden";
            direct.style.padding = "0";
            direct.style.margin = "0";
          }
        } catch (_) {}

        // Restore visible fields from persisted state (properties or widget values).
        // Small rAF to ensure the input elements are fully attached in the DOM tree.
        requestAnimationFrame(() => {
          try { this._restoreQsState?.(); } catch (_) {}
        });

        // Non-critical async work
        setTimeout(() => {
          if (window.DSGlobalTheme && this.root) window.DSGlobalTheme.bindNode(this.root, this);
        }, 1);

        this._updatePreviewFromServer();

        if (this._qsPendingPreview) {
          if (this._qsPendingCandidates) {
            this._qsPreviewCandidates = this._qsPendingCandidates;
            this._qsPendingCandidates = null;
          }
          this._setPreview(this._qsPendingPreview);
          this._qsPendingPreview = null;
        }

        qsLog("init", "DOM widget ready", { domWidget: !!this.domWidget, previewInner: !!this.previewInner });
        qsLogLayout(this, "init-done");
        this.setDirtyCanvas?.(true, true);
      } catch (err) {
        console.error("[DS QuickSave] Error during safe node initialization:", err);
      }

      return result;
    };

    nodeType.prototype._handleExecutionResult = function (message, source = "unknown") {
      qsLog("handleResult", `from ${source}`, "node", this.id, "message:", message);

      if (!message) {
        qsWarn("handleResult", "empty message — nothing to show");
        return;
      }

      try {
        const candidates = previewCandidatesFromMessage(message, false);
        const previewSrc = candidates[0]?.url || null;
        if (previewSrc) {
          this._qsPreviewCandidates = candidates;
          if (this.previewInner) {
            qsLog("handleResult", "setting preview", previewSrc.slice(0, 120));
            this._setPreview(previewSrc);
          } else {
            qsWarn("handleResult", "previewInner missing — queueing pending preview");
            this._qsPendingPreview = previewSrc;
            this._qsPendingCandidates = candidates;
          }
          this.setDirtyCanvas?.(true, true);
          qsLogLayout(this, "after-handleResult");
        } else {
          qsWarn("handleResult", "previewSrc was null — check python ui output");
        }

        const lastPath = unwrapUiString(message.last_path);
        if (lastPath) {
          this.lastSavedPath = lastPath;
          this._updateInfo?.();
        }

        const dir = unwrapUiString(message.dir);
        if (dir && this.dirInput) {
          this.dirInput.value = dir;
          if (this.dirWidget) this.dirWidget.value = dir;
          if (!this.properties) this.properties = {};
          this.properties[QS_PROP_DIR] = dir;
          this._saveQsState?.();
          try { app.graph?.setDirtyCanvas?.(true, true); } catch (_) {}
        }

        const suffix = unwrapUiString(message.suffix) || unwrapUiString(message.prefix);
        if (suffix != null && this.suffixInput) {
          this.suffixInput.value = suffix;
          if (this.suffixWidget) this.suffixWidget.value = suffix;
          if (!this.properties) this.properties = {};
          this.properties[QS_PROP_SUFFIX] = suffix;
          this._saveQsState?.();
          try { app.graph?.setDirtyCanvas?.(true, true); } catch (_) {}
        }
      } catch (e) {
        qsWarn("handleResult", "error:", e);
      }
    };

    // Ensure folder/suffix reach hidden widgets before each run
    api.addEventListener("execution_start", () => {
      for (const node of app.graph?._nodes || []) {
        if (isQuickSaveNode(node)) {
          qsLog("execution_start", "syncing hidden widgets node", node.id);
          node._saveQsState?.();
        }
      }
    });

    // Backup: catch executed events from the API in case onExecuted misses
    api.addEventListener("executed", (event) => {
      const { node, output } = event.detail || {};
      qsLog("api.executed", "nodeId", node, "output keys:", output ? Object.keys(output) : null, "output:", output);
      if (!node || !output) {
        qsWarn("api.executed", "missing node id or output");
        return;
      }
      const graphNode = app.graph?.getNodeById?.(node);
      qsLog("api.executed", "graphNode", graphNode?.id, "type", graphNode?.type, "comfyClass", graphNode?.comfyClass);
      if (isQuickSaveNode(graphNode)) {
        graphNode._handleExecutionResult?.(output, "api.executed");
      } else {
        qsWarn("api.executed", "node is not DS_QuickSave or not found in graph");
      }
    });

    nodeType.prototype._buildRoot = function () {
      if (!this || !document) return document.createElement("div");

      const root = document.createElement("div");
      root.className = "ds-qs-root";
      root.dataset.dsThemed = "true";

      root.innerHTML = `
        <div class="ds-qs-header">
          <span>⚡</span>
          <span>Quick Save (PNG)</span>
          <span class="ds-qs-badge">Always PNG</span>
        </div>

        <div class="ds-qs-row">
          <input type="text" class="ds-qs-input" placeholder="Save folder..." data-dir />
          <button class="ds-qs-btn icon-only" data-folder title="Browse folders">${ICONS.folder}</button>
        </div>

        <div class="ds-qs-row">
          <input type="text" class="ds-qs-input" placeholder="Suffix (e.g. Flux2-Klein)..." data-suffix />
          <button class="ds-qs-btn icon-only danger" data-delete title="Delete last saved image">${ICONS.trash}</button>
        </div>

        <div class="ds-qs-preview" data-preview>
          <div class="ds-qs-preview-inner">
            <div class="empty">No preview yet.<br>Connect an image and run the workflow.</div>
          </div>
        </div>

        <div class="ds-qs-info" data-info></div>
      `;

      this.dirInput = root.querySelector("[data-dir]");
      this.suffixInput = root.querySelector("[data-suffix]");
      this.previewContainer = root.querySelector("[data-preview]");
      this.previewInner = root.querySelector(".ds-qs-preview-inner");
      this.infoEl = root.querySelector("[data-info]");
      this.deleteBtn = root.querySelector("[data-delete]");
      this.folderBtn = root.querySelector("[data-folder]");

      const forceSync = () => {
        // Direct push so even aggressive refresh paths see the value
        const d = (this.dirInput?.value ?? "").trim();
        const s = (this.suffixInput?.value ?? "").trim();

        if (this.dirWidget) this.dirWidget.value = d;
        if (this.suffixWidget) this.suffixWidget.value = s;

        if (!this.properties) this.properties = {};
        this.properties[QS_PROP_DIR] = d;
        this.properties[QS_PROP_SUFFIX] = s;

        try { app.graph?.setDirtyCanvas?.(true, true); } catch (_) {}
        // Also run the normal saver
        this._saveQsState?.();
      };

      this.dirInput.addEventListener("input", forceSync);
      this.suffixInput.addEventListener("input", forceSync);
      this.dirInput.addEventListener("change", forceSync);
      this.suffixInput.addEventListener("change", forceSync);

      this.folderBtn.addEventListener("click", () => {
        this._showDirBrowser();
      });

      this.deleteBtn.addEventListener("click", async () => {
        const path = unwrapUiString(this.lastSavedPath);
        if (!path) {
          this._showToast("Nothing to delete");
          return;
        }
        if (!confirm("Delete the last saved image?")) return;

        try {
          const res = await fetch(qsFileUrl("/ds/quicksave/delete_last"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path }),
          });
          const json = await res.json();

          if (json.success) {
            this._setPreview(null);
            this.lastSavedPath = null;
            this._qsPreviewCandidates = null;
            this._updateInfo();
            this.setDirtyCanvas?.(true, true);
            this._showToast("Deleted last image");
          } else {
            this._showToast(json.error || "Nothing to delete");
          }
        } catch (e) {
          qsWarn("delete", "request failed", e);
          this._showToast("Delete failed");
        }
      });

      return root;
    };

    nodeType.prototype._setQsHidden = function (name, val) {
      const str = val == null ? "" : String(val);
      try {
        const w = this.widgetsByName?.[name] || this.widgets?.find((x) => x?.name === name);
        if (w) w.value = str;
      } catch (_) {}
    };

    nodeType.prototype._saveQsState = function () {
      if (!this.properties) this.properties = {};

      const domDir = (this.dirInput?.value ?? "").trim();
      const domSuffix = (this.suffixInput?.value ?? "").trim();

      // Prefer a non-empty DOM value. If DOM is empty/default but we have a widget value
      // (e.g. very early execution_start before inputs fully bound), keep the widget value.
      const widgetDir = (this.dirWidget?.value ?? "").trim();
      const widgetSuffix = (this.suffixWidget?.value ?? "").trim();

      const dir = domDir || widgetDir || "";
      const suffix = domSuffix || widgetSuffix || "";

      qsLog("saveState", { dir, suffix, hadDomDir: !!domDir, hadWidgetDir: !!widgetDir });

      this.properties[QS_PROP_DIR] = dir;
      this.properties[QS_PROP_SUFFIX] = suffix;

      // Keep hidden widgets in sync — these are what the backend receives when queued.
      this._setQsHidden("save_dir", dir);
      this._setQsHidden("suffix", suffix);

      try {
        app.graph?.setDirtyCanvas?.(true, true);
      } catch (_) {}
    };

    nodeType.prototype._restoreQsState = function () {
      if (!this.properties) this.properties = {};

      // Robust restore order for reloads:
      // 1. properties (explicitly saved in workflow JSON via onSerialize/_save)
      // 2. the hidden widget .value (populated by Comfy from widgets_values on configure)
      // 3. legacy prefix widget
      // 4. sensible default
      const fromPropDir = (this.properties[QS_PROP_DIR] ?? "").toString().trim();
      const fromPropSuffix = (this.properties[QS_PROP_SUFFIX] ?? "").toString().trim();

      const fromWidgetDir = (this.dirWidget?.value ?? "").toString().trim();
      const fromWidgetSuffix = (
        (this.suffixWidget?.value ?? "") ||
        (this.widgets?.find((w) => w?.name === "prefix")?.value ?? "")
      ).toString().trim();

      // If properties has a real (non-empty) value prefer it, else fall back to widget value
      // This handles cases where one or the other was populated on load.
      const dir = fromPropDir || fromWidgetDir || "output";
      const suffix = fromPropSuffix || fromWidgetSuffix || "";

      qsLog("restoreState", {
        finalDir: dir,
        finalSuffix: suffix,
        fromPropDir,
        fromWidgetDir,
        nodeId: this.id
      });

      if (this.dirInput) {
        this.dirInput.value = dir;
      }
      if (this.suffixInput) {
        this.suffixInput.value = suffix;
      }

      // Make sure hidden widgets (the ones actually sent on execute) match what the UI shows
      this._setQsHidden("save_dir", dir);
      this._setQsHidden("suffix", suffix);

      // Also mirror back into properties so future serializes are consistent
      this.properties[QS_PROP_DIR] = dir;
      this.properties[QS_PROP_SUFFIX] = suffix;

      // Re-assert hidden in case configure or other code touched them
      [this.dirWidget, this.suffixWidget].forEach((w) => {
        if (!w) return;
        w.hidden = true;
        w.computeSize = () => [0, 0];
        if (w.element) {
          w.element.style.display = "none";
          if (w.element.parentNode) w.element.parentNode.style.display = "none";
        }
      });

      try { app?.graph?.setDirtyCanvas?.(true, true); } catch (_) {}
    };

    nodeType.prototype._setPreview = function (src, candidateIndex = 0) {
      qsLog("setPreview", {
        src: src ? src.slice(0, 120) : null,
        candidateIndex,
        hasPreviewInner: !!this.previewInner,
      });

      if (!this.previewInner) {
        qsWarn("setPreview", "previewInner is null — cannot render");
        return;
      }
      this.previewInner.innerHTML = "";

      if (src) {
        const img = document.createElement("img");
        img.src = src;
        img.alt = "Last saved";
        img.draggable = false;
        img.onload = () => {
          qsLog("setPreview", "img onload OK", {
            naturalW: img.naturalWidth,
            naturalH: img.naturalHeight,
            src: img.src.slice(0, 120),
          });
          qsLogLayout(this, "after-img-load");
        };
        img.onerror = (ev) => {
          qsWarn("setPreview", "img onerror", { src: img.src.slice(0, 120), candidateIndex, ev });
          const candidates = this._qsPreviewCandidates || [];
          const next = candidates[candidateIndex + 1];
          if (next?.url && next.url !== src) {
            qsLog("setPreview", `retrying with ${next.label}`, next.url.slice(0, 120));
            this._setPreview(next.url, candidateIndex + 1);
            return;
          }
          this.previewInner.innerHTML = `<div class="empty">Preview failed to load.<br>Check save folder path.<br><span style="font-size:9px;opacity:.6">See browser console [DS QuickSave]</span></div>`;
          qsLogLayout(this, "after-img-error");
        };
        this.previewInner.appendChild(img);
      } else {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.innerHTML = "No image saved yet.<br>Run the workflow to save.";
        this.previewInner.appendChild(empty);
      }
    };

    nodeType.prototype._updateInfo = function () {
      if (!this.infoEl) return;
      const path = unwrapUiString(this.lastSavedPath);
      if (path) {
        const name = path.split(/[\\/]/).pop();
        this.infoEl.textContent = "Last: " + name;
      } else {
        this.infoEl.textContent = "";
      }
    };

    nodeType.prototype._showToast = function (msg) {
      const t = document.createElement("div");
      t.textContent = msg;
      t.style.cssText = "position:absolute;bottom:6px;left:50%;transform:translateX(-50%);background:#1f2937;color:#fff;padding:2px 10px;border-radius:999px;font-size:11px;white-space:nowrap;z-index:2;";
      this.root.appendChild(t);
      setTimeout(() => t.remove(), 1600);
    };

    nodeType.prototype._updatePreviewFromServer = async function () {
      qsLog("updateFromServer", "fetching /ds/quicksave/last");
      try {
        const res = await fetch(qsFileUrl("/ds/quicksave/last"));
        qsLog("updateFromServer", "status", res.status, res.statusText);
        const data = await res.json();
        qsLog("updateFromServer", "response", {
          path: data.path,
          hasPreview: !!data.preview,
          previewLen: data.preview?.length ?? 0,
          last_image: data.last_image,
        });

        const msg = { preview: data.preview, last_image: data.last_image, last_path: data.path };
        const candidates = previewCandidatesFromMessage(msg, true);
        const src = candidates[0]?.url || null;
        if (src) {
          this._qsPreviewCandidates = candidates;
          this._setPreview(src);
          this.lastSavedPath = unwrapUiString(data.path);
          this._updateInfo();
          this.setDirtyCanvas?.(true, true);
        } else {
          qsWarn("updateFromServer", "no preview src from server state");
        }
      } catch (e) {
        qsWarn("updateFromServer", "fetch failed:", e);
      }
    };

    nodeType.prototype._showDirBrowser = function () {
      const current = (this.dirInput && this.dirInput.value) || "output";

      const modal = document.createElement("div");
      modal.className = "ds-qs-modal";

      modal.innerHTML = `
        <div class="ds-qs-modal-content">
          <div class="ds-qs-modal-header">
            <div>Browse Folders</div>
            <button class="ds-qs-btn" data-close>✕</button>
          </div>
          <div style="padding:10px 12px;border-bottom:1px solid #242a36;font-size:12px;color:#9ca3af;">
            Current: <span class="current-path" style="color:#ddd;word-break:break-all;"></span>
          </div>
          <div class="ds-qs-modal-body" style="min-height:180px;"></div>
          <div style="padding:10px 12px;border-top:1px solid #242a36;display:flex;gap:8px;justify-content:flex-end;">
            <button class="ds-qs-btn" data-up>↑ Up</button>
            <button class="ds-qs-btn" data-select>Select This Folder</button>
          </div>
        </div>
      `;

      const body = modal.querySelector(".ds-qs-modal-body");
      const currentSpan = modal.querySelector(".current-path");
      let activePath = current;

      const render = async (path) => {
        body.innerHTML = `<div style="color:#9ca3af;padding:20px 10px;">Loading...</div>`;

        try {
          const r = await fetch(qsFileUrl("/ds/quicksave/list_dir"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path }),
          });
          const json = await r.json();

          if (json.error) {
            body.innerHTML = `<div style="color:#f87171;padding:10px;">${json.error}</div>`;
            return;
          }

          const actualPath = json.current || path;
          activePath = actualPath;
          currentSpan.textContent = actualPath;

          body.innerHTML = "";

          const list = document.createElement("div");
          (json.dirs || []).forEach((dirName) => {
            const item = document.createElement("div");
            item.className = "ds-qs-dir-item";
            item.textContent = "📁 " + dirName;
            item.onclick = () => {
              const base = actualPath.replace(/[\\/]$/, "");
              const sep = base.includes("\\") ? "\\" : "/";
              const newPath = base + sep + dirName;
              render(newPath.replace(/\\/g, "/"));
            };
            list.appendChild(item);
          });

          if ((json.dirs || []).length === 0) {
            const empty = document.createElement("div");
            empty.style.color = "#9ca3af";
            empty.style.padding = "16px";
            empty.textContent = "No subfolders";
            list.appendChild(empty);
          }

          body.appendChild(list);
        } catch (_) {
          body.innerHTML = `<div style="color:#f87171;padding:10px;">Failed to list directories</div>`;
        }
      };

      modal.querySelector("[data-close]").onclick = () => modal.remove();
      modal.querySelector("[data-up]").onclick = () => {
        const base = activePath || "output";
        const parts = base.split(/[\\/]/).filter(Boolean);
        parts.pop();
        const up = parts.length
          ? (base.startsWith("/") ? "/" : "") + parts.join("/")
          : base.includes(":")
            ? base.split(":")[0] + ":\\"
            : "output";
        render(up);
      };
      modal.querySelector("[data-select]").onclick = () => {
        if (this.dirInput) {
          this.dirInput.value = activePath;
          // Use the same force path as typing
          const d = activePath.trim();
          if (this.dirWidget) this.dirWidget.value = d;
          if (!this.properties) this.properties = {};
          this.properties[QS_PROP_DIR] = d;
          try { app.graph?.setDirtyCanvas?.(true, true); } catch (_) {}
          this._saveQsState?.();
        }
        modal.remove();
      };

      modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
      };

      document.body.appendChild(modal);
      render(activePath);
    };
  },
});