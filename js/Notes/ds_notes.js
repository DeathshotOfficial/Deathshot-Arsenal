/* ============================================================
   DS Notes - Deathshot Arsenal
   Feature-Rich Rich-Text Document Editor with Popup Workspace
   ============================================================ */

import { app } from "/scripts/app.js";
import { protectDSResizeCorners } from "../Shared/ds_ui_system.js";

// Ensure stylesheet is loaded
const CSS_ID = "ds-notes-css";
if (!document.getElementById(CSS_ID)) {
  const link = document.createElement("link");
  link.id = CSS_ID;
  link.rel = "stylesheet";
  link.href = "/extensions/DeathshotArsenal/Notes/ds_notes.css";
  document.head.appendChild(link);
}

// Curated SVG Icons (Local, strictly stroked to avoid dead black silhouettes)
const ICONS = {
  notes: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
  edit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
  bold: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/></svg>`,
  italic: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg>`,
  underline: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3"/><line x1="4" y1="21" x2="20" y2="21"/></svg>`,
  strike: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.3 4.9c-2.3-.6-4.4-1-6.2-.9-2.7.2-5 1.7-5 4.3 0 2.2 1.6 3.6 4.3 4.2"/><path d="M6.7 19.1c2.3.6 4.4 1 6.2.9 2.7-.2 5-1.7 5-4.3 0-2.2-1.6-3.6-4.3-4.2"/><line x1="3" y1="12" x2="21" y2="12"/></svg>`,
  clear: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12"/><path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/></svg>`,
  ul: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1.5" fill="currentColor"/><circle cx="4" cy="12" r="1.5" fill="currentColor"/><circle cx="4" cy="18" r="1.5" fill="currentColor"/></svg>`,
  ol: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/></svg>`,
  link: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
  code: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
  hr: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="2" y1="12" x2="22" y2="12"/><line x1="5" y1="6" x2="19" y2="6" stroke-dasharray="2 2"/><line x1="5" y1="18" x2="19" y2="18" stroke-dasharray="2 2"/></svg>`,
  grid: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/><path d="M15 3v18"/></svg>`,
  icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 4.24 4.24"/><path d="m14.83 9.17 4.24-4.24"/><path d="m14.83 14.83 4.24 4.24"/><path d="m9.17 14.83-4.24 4.24"/><circle cx="12" cy="12" r="4"/></svg>`,
  button: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="12" rx="3"/><circle cx="8" cy="12" r="1"/></svg>`,
  folder: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
  youtube: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"/><polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" fill="currentColor"/></svg>`,
  discord: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18.9 4.3A17.9 17.9 0 0 0 14.6 3a.1.1 0 0 0-.1.1 12.3 12.3 0 0 0-.5 1.1 16.5 16.5 0 0 0-5 0 11 11 0 0 0-.5-1.1.1.1 0 0 0-.1-.1 17.8 17.8 0 0 0-4.3 1.3.1.1 0 0 0-.1.1A19.8 19.8 0 0 0 1 17.8a.1.1 0 0 0 0 .1 18 18 0 0 0 5.5 2.8.1.1 0 0 0 .1 0 13 13 0 0 0 1.2-1.9.1.1 0 0 0-.1-.1 11.8 11.8 0 0 1-1.7-.8.1.1 0 0 1 0-.2c.1-.1.2-.2.4-.3a12.8 12.8 0 0 0 11.2 0c.1.1.2.2.4.3a.1.1 0 0 1 0 .2 11.4 11.4 0 0 1-1.7.8.1.1 0 0 0-.1.1 14 14 0 0 0 1.2 1.9.1.1 0 0 0 .1 0 18 18 0 0 0 5.5-2.8.1.1 0 0 0 0-.1 19.8 19.8 0 0 0-2.8-13.4.1.1 0 0 0-.1-.1ZM8.5 14.5c-1 0-1.8-.9-1.8-2s.8-2 1.8-2c1 0 1.9.9 1.8 2 0 1.1-.8 2-1.8 2Zm7 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2c1 0 1.9.9 1.8 2 0 1.1-.8 2-1.8 2Z" fill="currentColor"/></svg>`,
  callout: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  undo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>`,
  redo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"/></svg>`,
  download: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
  externalLink: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`,
  star: `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  flame: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>`,
  info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
  alert: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  heart: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`,
  zap: `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
};

const DEFAULT_DOC = {
  version: 1,
  settings: {
    bgColor: "",
  },
  html: `<h1>Welcome to Deathshot Arsenal</h1>
<p>This is <strong>DS Notes</strong> — your rich-text workflow documentation and guide node.</p>
<div class="ds-notes-callout ds-notes-callout-tip" contenteditable="false">
  <div class="ds-notes-callout-icon">${ICONS.info}</div>
  <div class="ds-notes-callout-content">
    <div class="ds-notes-callout-title">PRO TIP</div>
    <div class="ds-notes-callout-body" contenteditable="true">Click <strong>Edit Note</strong> to open the full-screen modal editor with custom dividers, code blocks, tables, YouTube cards, and Discord invites.</div>
  </div>
  <button type="button" class="ds-notes-block-delete-btn" title="Delete block">×</button>
</div>
<hr class="ds-notes-sep ds-notes-sep-glow">
<p>Use the buttons below to document your checkpoints, prompts, and settings.</p>`,
};

function sanitizeDoc(doc) {
  if (!doc || typeof doc !== "object") {
    return JSON.parse(JSON.stringify(DEFAULT_DOC));
  }
  return {
    version: doc.version || 1,
    settings: {
      bgColor: doc.settings?.bgColor || "",
    },
    html: typeof doc.html === "string" ? doc.html : DEFAULT_DOC.html,
  };
}

function saveSelection(container) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  if (!container || !container.contains(range.commonAncestorContainer)) return null;
  return range.cloneRange();
}

function restoreSelection(range) {
  if (!range) return;
  const sel = window.getSelection();
  if (!sel) return;
  sel.removeAllRanges();
  sel.addRange(range);
}

function closeAllPopups() {
  document.querySelectorAll(".ds-notes-menu-popup").forEach((el) => el.remove());
}

function hexToRgb(hex) {
  hex = (hex || "").replace("#", "").trim();
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  if (hex.length !== 6) return { r: 103, g: 232, b: 249 };
  const num = parseInt(hex, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
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
  return { h: Math.round(h * 360), s, v };
}

function hsvToRgb(h, s, v) {
  h = (h % 360) / 60;
  const c = v * s;
  const x = c * (1 - Math.abs((h % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h >= 0 && h < 1) { r = c; g = x; b = 0; }
  else if (h >= 1 && h < 2) { r = x; g = c; b = 0; }
  else if (h >= 2 && h < 3) { r = 0; g = c; b = x; }
  else if (h >= 3 && h < 4) { r = 0; g = x; b = c; }
  else if (h >= 4 && h < 5) { r = x; g = 0; b = c; }
  else if (h >= 5 && h < 6) { r = c; g = 0; b = x; }
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

function rgbToHex(r, g, b) {
  return "#" + [r, g, b].map((x) => Math.max(0, Math.min(255, x)).toString(16).padStart(2, "0")).join("");
}

app.registerExtension({
  name: "DeathshotArsenal.Notes",

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== "DS_Notes") return;

    const origCreated = nodeType.prototype.onNodeCreated;
    const origConfigure = nodeType.prototype.onConfigure;
    const origSerialize = nodeType.prototype.serialize;
    const origOnSerialize = nodeType.prototype.onSerialize;
    const origRemoved = nodeType.prototype.onRemoved;
    const origResize = nodeType.prototype.onResize;

    nodeType.prototype.onNodeCreated = function () {
      const res = origCreated ? origCreated.apply(this, arguments) : undefined;

      this.resizable = true;
      this.shape = "round";
      protectDSResizeCorners(this);

      // Clean default size on canvas
      const curSize = Array.isArray(this.size) ? this.size : [400, 240];
      this.size = [
        Math.max(Number(curSize[0]) || 400, 320),
        Math.max(Number(curSize[1]) || 240, 160),
      ];

      this.properties = this.properties || {};
      if (!this.properties.ds_notes_data) {
        this.properties.ds_notes_data = JSON.parse(JSON.stringify(DEFAULT_DOC));
      }

      this._dsDoc = sanitizeDoc(this.properties.ds_notes_data);

      // DOM Root for in-node canvas preview
      const root = document.createElement("div");
      root.className = "ds-notes-root";
      root.dataset.dsThemed = "true";
      this._dsRoot = root;

      // Mount DOM Widget on canvas
      this._dsNotesWidget = this.addDOMWidget("ds_notes_ui", "div", root, {
        serialize: false,
        hideOnZoom: false,
        getMinHeight: () => 140,
        getHeight: () => Math.max(100, (Number(this.size?.[1]) || 240) - 22),
      });

      this._dsSyncHostHeight = () => {
        const nodeHeight = Math.max(140, Number(this.size?.[1]) || 240);
        const widgetHeight = Math.max(100, nodeHeight - 22);
        if (this._dsNotesWidget) {
          this._dsNotesWidget.computedHeight = widgetHeight;
        }
        root.style.height = `${widgetHeight}px`;
        root.style.maxHeight = `${widgetHeight}px`;
      };
      this._dsSyncHostHeight();

      // Render the in-node canvas preview
      this._dsRenderCanvasPreview();

      // Theme Integration
      setTimeout(() => {
        try {
          if (window.DSGlobalTheme) {
            window.DSGlobalTheme.bindNode?.(root, this);
            window.DSGlobalTheme.applyNodeBase?.(this);
          }
        } catch (_) {}
        this.setDirtyCanvas(true, true);
      }, 0);

      return res;
    };

    nodeType.prototype.onConfigure = function (info) {
      const res = origConfigure ? origConfigure.apply(this, arguments) : undefined;
      const props = info?.properties || this.properties || {};
      if (props.ds_notes_data) {
        this._dsDoc = sanitizeDoc(props.ds_notes_data);
        this.properties.ds_notes_data = this._dsDoc;
      }
      this._dsRenderCanvasPreview();
      return res;
    };

    nodeType.prototype.serialize = function () {
      const res = origSerialize ? origSerialize.apply(this, arguments) : {};
      this.properties = this.properties || {};
      this.properties.ds_notes_data = this._dsDoc;
      return res;
    };

    nodeType.prototype.onSerialize = function (info) {
      origOnSerialize?.apply(this, arguments);
      info.properties = info.properties || {};
      info.properties.ds_notes_data = this._dsDoc;
    };

    nodeType.prototype.onResize = function (size) {
      origResize?.apply(this, arguments);
      this._dsSyncHostHeight?.();
    };

    nodeType.prototype.onRemoved = function () {
      closeAllPopups();
      this._dsCloseEditorModal?.(true);
      origRemoved?.apply(this, arguments);
    };

    // -------------------------------------------------------------
    // CANVAS PREVIEW RENDERER (Clean, Compact, In-Node)
    // -------------------------------------------------------------
    nodeType.prototype._dsRenderCanvasPreview = function () {
      const root = this._dsRoot;
      if (!root) return;
      root.innerHTML = "";

      const shell = document.createElement("div");
      shell.className = "ds-notes-preview-shell";

      // Header Bar
      const header = document.createElement("div");
      header.className = "ds-notes-preview-header";
      header.innerHTML = `
        <div class="ds-notes-brand">
          ${ICONS.notes}
          <span>DS NOTES</span>
        </div>
        <button class="ds-notes-preview-edit-btn" type="button" data-open-editor title="Open Fullscreen Rich Editor">
          Edit Note
        </button>
      `;

      header.querySelector("[data-open-editor]").addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._dsOpenEditorModal();
      });

      // Preview Body
      const body = document.createElement("div");
      body.className = "ds-notes-preview-body";
      if (this._dsDoc.settings?.bgColor) {
        body.style.backgroundColor = this._dsDoc.settings.bgColor;
      }
      body.innerHTML = this._dsDoc.html || "";

      // Interactive copy code buttons in preview
      body.querySelectorAll("[data-copy-code]").forEach((btn) => {
        btn.addEventListener("click", async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const block = btn.closest(".ds-notes-code-block");
          const codeEl = block ? block.querySelector("code") : null;
          const text = codeEl ? codeEl.innerText : "";
          if (navigator.clipboard) {
            await navigator.clipboard.writeText(text);
            const orig = btn.innerText;
            btn.innerText = "Copied!";
            setTimeout(() => { btn.innerText = orig; }, 1400);
          }
        });
      });

      shell.appendChild(header);
      shell.appendChild(body);
      root.appendChild(shell);
    };

    // -------------------------------------------------------------
    // POPUP MODAL EDITOR (Large, Spacious, Dedicated Window)
    // -------------------------------------------------------------
    nodeType.prototype._dsOpenEditorModal = function () {
      this._dsCloseEditorModal?.(true);

      // Snapshot original document
      this._dsSavedSnapshot = JSON.stringify(this._dsDoc);
      // Clone isolated draft
      this._dsDraftDoc = JSON.parse(this._dsSavedSnapshot);
      this._dsEditorTab = "edit";
      this._dsSavedRange = null;
      this._dsHistory = [this._dsDraftDoc.html || ""];
      this._dsHistoryIndex = 0;

      // Fullscreen Backdrop
      const backdrop = document.createElement("div");
      backdrop.className = "ds-notes-editor-backdrop";
      this._dsModalBackdrop = backdrop;

      // Modal Card
      const modal = document.createElement("div");
      modal.className = "ds-notes-editor-modal";
      backdrop.appendChild(modal);

      // Top Bar (Tabs: Editor, Code View, Live Preview + Title + Close)
      const topbar = document.createElement("div");
      topbar.className = "ds-notes-modal-topbar";

      const titleWrap = document.createElement("div");
      titleWrap.className = "ds-notes-modal-title-wrap";
      titleWrap.innerHTML = `
        <div class="ds-notes-modal-title">
          ${ICONS.notes}
          <span>DS Notes Document Editor</span>
        </div>
      `;

      const tabsGroup = document.createElement("div");
      tabsGroup.className = "ds-notes-view-tabs";

      const tabEdit = document.createElement("button");
      tabEdit.className = "ds-notes-tab-btn is-active";
      tabEdit.textContent = "Editor";
      tabEdit.addEventListener("click", () => this._dsSwitchModalTab("edit"));

      const tabCode = document.createElement("button");
      tabCode.className = "ds-notes-tab-btn";
      tabCode.textContent = "Code View";
      tabCode.addEventListener("click", () => this._dsSwitchModalTab("code"));

      const tabPreview = document.createElement("button");
      tabPreview.className = "ds-notes-tab-btn";
      tabPreview.textContent = "Live Preview";
      tabPreview.addEventListener("click", () => this._dsSwitchModalTab("preview"));

      tabsGroup.append(tabEdit, tabCode, tabPreview);
      this._dsModalTabs = { tabEdit, tabCode, tabPreview };

      const closeBtn = document.createElement("button");
      closeBtn.className = "ds-notes-btn ds-notes-btn-icon";
      closeBtn.type = "button";
      closeBtn.title = "Close Editor";
      closeBtn.innerHTML = ICONS.close;
      closeBtn.addEventListener("click", () => this._dsRequestCancel());

      topbar.append(titleWrap, tabsGroup, closeBtn);
      modal.appendChild(topbar);

      // Toolbar (Strict uniform 28px height on every button)
      const toolbar = this._dsBuildModalToolbar();
      this._dsModalToolbar = toolbar;
      modal.appendChild(toolbar);

      // Body Container
      const bodyContainer = document.createElement("div");
      bodyContainer.className = "ds-notes-body-container";

      // 1. WYSIWYG Contenteditable
      const editScroll = document.createElement("div");
      editScroll.className = "ds-notes-editor-scroll";
      if (this._dsDraftDoc.settings?.bgColor) {
        editScroll.style.backgroundColor = this._dsDraftDoc.settings.bgColor;
      }

      const editor = document.createElement("div");
      editor.className = "ds-notes-contenteditable";
      editor.contentEditable = "true";
      editor.spellcheck = false;
      editor.setAttribute("data-placeholder", "Write documentation, guides, changelogs, or workflow instructions...");
      editor.innerHTML = this._dsDraftDoc.html || "";
      this._dsModalEditorEl = editor;
      this._dsModalEditScroll = editScroll;

      // Ensure trailing paragraph cushion so user can always click below to type
      this._dsEnsureTrailingParagraph(editor);

      editor.addEventListener("input", () => {
        this._dsDraftDoc.html = editor.innerHTML;
        this._dsPushHistory();
        this._dsUpdateStats();
      });
      editor.addEventListener("keyup", () => {
        this._dsSavedRange = saveSelection(editor);
        this._dsUpdateStats();
      });
      editor.addEventListener("mouseup", () => {
        this._dsSavedRange = saveSelection(editor);
      });

      // Clicking empty space in editScroll puts caret at the bottom
      editScroll.addEventListener("click", (e) => {
        if (e.target === editScroll || e.target === editor) {
          this._dsEnsureTrailingParagraph(editor);
          const lastP = editor.lastElementChild;
          if (lastP) {
            const range = document.createRange();
            const sel = window.getSelection();
            range.selectNodeContents(lastP);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
            editor.focus();
          }
        }
      });

      // Handle block delete button clicks and double-clicks
      editor.addEventListener("click", (e) => {
        const delBtn = e.target.closest(".ds-notes-block-delete-btn");
        if (delBtn) {
          e.preventDefault();
          e.stopPropagation();
          const block = delBtn.closest(".ds-notes-callout, .ds-notes-code-block, .ds-notes-table-wrap, .ds-notes-folder-hint, .ds-notes-youtube-card, .ds-notes-youtube-embed-wrap, .ds-notes-discord-card");
          if (block) {
            block.remove();
            this._dsEnsureTrailingParagraph(editor);
            this._dsDraftDoc.html = editor.innerHTML;
            this._dsPushHistory();
            this._dsUpdateStats();
          }
        }
      });

      // Double-click to edit elements
      editor.addEventListener("dblclick", (e) => {
        const linkEl = e.target.closest("a");
        if (linkEl && !linkEl.classList.contains("ds-notes-doc-btn") && !linkEl.classList.contains("ds-notes-youtube-card") && !linkEl.classList.contains("ds-notes-discord-card")) {
          e.preventDefault();
          this._dsPromptEditLink(linkEl);
          return;
        }
        const btnEl = e.target.closest(".ds-notes-doc-btn");
        if (btnEl) {
          e.preventDefault();
          this._dsPromptEditButton(btnEl);
          return;
        }
        const folderEl = e.target.closest(".ds-notes-folder-hint");
        if (folderEl) {
          e.preventDefault();
          this._dsPromptEditFolderHint(folderEl);
          return;
        }
        const ytEl = e.target.closest(".ds-notes-youtube-card");
        if (ytEl) {
          e.preventDefault();
          this._dsPromptEditYouTube(ytEl);
          return;
        }
        const discordEl = e.target.closest(".ds-notes-discord-card");
        if (discordEl) {
          e.preventDefault();
          this._dsPromptEditDiscord(discordEl);
          return;
        }
      });

      editScroll.appendChild(editor);
      bodyContainer.appendChild(editScroll);

      // 2. Code View Textarea
      const codeTextarea = document.createElement("textarea");
      codeTextarea.className = "ds-notes-code-textarea";
      codeTextarea.spellcheck = false;
      codeTextarea.style.display = "none";
      codeTextarea.value = this._dsDraftDoc.html || "";
      codeTextarea.addEventListener("input", () => {
        this._dsDraftDoc.html = codeTextarea.value;
        this._dsUpdateStats();
      });
      this._dsModalCodeEl = codeTextarea;
      bodyContainer.appendChild(codeTextarea);

      // 3. Live Preview View
      const previewArea = document.createElement("div");
      previewArea.className = "ds-notes-preview-body";
      previewArea.style.display = "none";
      if (this._dsDraftDoc.settings?.bgColor) {
        previewArea.style.backgroundColor = this._dsDraftDoc.settings.bgColor;
      }
      this._dsModalPreviewEl = previewArea;
      bodyContainer.appendChild(previewArea);

      modal.appendChild(bodyContainer);

      // Bottom Bar (Stats, Cancel, Save)
      const bottombar = document.createElement("div");
      bottombar.className = "ds-notes-bottombar";

      const statsEl = document.createElement("div");
      statsEl.className = "ds-notes-bottom-stats";
      this._dsModalStatsEl = statsEl;

      const actions = document.createElement("div");
      actions.style.display = "flex";
      actions.style.gap = "8px";

      const cancelBtn = document.createElement("button");
      cancelBtn.className = "ds-notes-btn";
      cancelBtn.type = "button";
      cancelBtn.textContent = "Cancel";
      cancelBtn.addEventListener("click", () => this._dsRequestCancel());

      const saveBtn = document.createElement("button");
      saveBtn.className = "ds-notes-btn ds-notes-btn-save";
      saveBtn.type = "button";
      saveBtn.textContent = "Save Changes";
      saveBtn.addEventListener("click", () => this._dsCommitSave());

      actions.append(cancelBtn, saveBtn);
      bottombar.append(statsEl, actions);
      modal.appendChild(bottombar);

      // Modal keyboard shortcuts
      modal.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          const dialog = document.querySelector(".ds-notes-dialog-overlay");
          if (dialog) {
            dialog.remove();
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          if (document.querySelector(".ds-notes-menu-popup") || document.querySelector(".ds-ui-color-popup")) {
            closeAllPopups();
            document.querySelectorAll(".ds-ui-color-popup").forEach((p) => p.remove());
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          e.preventDefault();
          this._dsRequestCancel();
          return;
        }

        // Ctrl+S / Cmd+S -> Save
        if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
          e.preventDefault();
          e.stopPropagation();
          this._dsCommitSave();
          return;
        }

        // Undo / Redo
        if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) {
          e.preventDefault();
          e.stopPropagation();
          if (e.shiftKey) this._dsRedo();
          else this._dsUndo();
          return;
        }
        if ((e.ctrlKey || e.metaKey) && (e.key === "y" || e.key === "Y")) {
          e.preventDefault();
          e.stopPropagation();
          this._dsRedo();
          return;
        }
      });

      document.body.appendChild(backdrop);
      this._dsUpdateStats();

      setTimeout(() => {
        editor.focus();
      }, 60);
    };

    // -------------------------------------------------------------
    // MODAL TOOLBAR BUILDER (Using Deathshot createColorPicker!)
    // -------------------------------------------------------------
    nodeType.prototype._dsBuildModalToolbar = function () {
      const tb = document.createElement("div");
      tb.className = "ds-notes-toolbar";

      const makeToolBtn = (iconSvg, title, onClick, extraClass = "") => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `ds-notes-btn ds-notes-btn-icon ${extraClass}`.trim();
        btn.title = title;
        btn.innerHTML = iconSvg;
        btn.addEventListener("mousedown", (e) => e.preventDefault());
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          onClick(e, btn);
        });
        return btn;
      };

      const makeTextBtn = (label, title, onClick, extraClass = "") => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `ds-notes-btn ${extraClass}`.trim();
        btn.title = title;
        btn.innerHTML = label;
        btn.addEventListener("mousedown", (e) => e.preventDefault());
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          onClick(e, btn);
        });
        return btn;
      };

      const makeDivider = () => {
        const d = document.createElement("div");
        d.className = "ds-notes-divider";
        return d;
      };

      // 1. Text Style
      const gStyle = document.createElement("div");
      gStyle.className = "ds-notes-tool-group";
      gStyle.append(
        makeToolBtn(ICONS.bold, "Bold (Ctrl+B)", () => this._dsExec("bold")),
        makeToolBtn(ICONS.italic, "Italic (Ctrl+I)", () => this._dsExec("italic")),
        makeToolBtn(ICONS.underline, "Underline (Ctrl+U)", () => this._dsExec("underline")),
        makeToolBtn(ICONS.strike, "Strikethrough", () => this._dsExec("strikeThrough")),
        makeToolBtn(ICONS.clear, "Clear Formatting", () => this._dsExec("removeFormat"))
      );
      tb.appendChild(gStyle);
      tb.appendChild(makeDivider());

      // 2. Headings (Strictly 28px height)
      const gHead = document.createElement("div");
      gHead.className = "ds-notes-tool-group";
      gHead.append(
        makeTextBtn("H1", "Heading 1", () => this._dsExecFormatBlock("<h1>")),
        makeTextBtn("H2", "Heading 2", () => this._dsExecFormatBlock("<h2>")),
        makeTextBtn("H3", "Heading 3", () => this._dsExecFormatBlock("<h3>"))
      );
      tb.appendChild(gHead);
      tb.appendChild(makeDivider());

      // 3. Tabbed Zero-Native Deathshot Color Picker (Text, Highlight, Page BG in ONE single menu button)
      const gColors = document.createElement("div");
      gColors.className = "ds-notes-tool-group";

      const dotColor = this._dsLastTextColor || "#67e8f9";
      const colorBtn = makeTextBtn(
        `<span class="ds-notes-color-swatch-dot" style="background:${dotColor}"></span> <span>Color ▾</span>`,
        "Text, Highlight & Page Background Colors",
        (e, btn) => this._dsOpenColorPopover(btn)
      );
      this._dsColorBtn = colorBtn;
      gColors.appendChild(colorBtn);
      tb.appendChild(gColors);
      tb.appendChild(makeDivider());

      // 4. Lists
      const gLists = document.createElement("div");
      gLists.className = "ds-notes-tool-group";
      gLists.append(
        makeToolBtn(ICONS.ul, "Bulleted List", () => this._dsExec("insertUnorderedList")),
        makeToolBtn(ICONS.ol, "Numbered List", () => this._dsExec("insertOrderedList"))
      );
      tb.appendChild(gLists);
      tb.appendChild(makeDivider());

      // 5. Variety: Separator Dropdown
      const gSep = document.createElement("div");
      gSep.className = "ds-notes-tool-group";
      const sepTrigger = makeTextBtn(
        `<span style="font-weight:bold;font-size:13px;line-height:1;">—</span> <span>Sep ▾</span>`,
        "Insert Decorative Separator",
        (e, b) => this._dsOpenSeparatorMenu(b)
      );
      gSep.appendChild(sepTrigger);
      tb.appendChild(gSep);
      tb.appendChild(makeDivider());

      // 6. Insert (Link, Callout, Code, Table, Icon)
      const gInsert = document.createElement("div");
      gInsert.className = "ds-notes-tool-group";
      gInsert.append(
        makeToolBtn(ICONS.link, "Insert Hyperlink", () => this._dsPromptInsertLink()),
        makeToolBtn(ICONS.callout, "Insert Callout / Alert Box", (e, b) => this._dsOpenCalloutMenu(b)),
        makeToolBtn(ICONS.code, "Insert Code Block", () => this._dsPromptCodeBlock()),
        makeToolBtn(ICONS.grid, "Insert Table / Grid", () => this._dsPromptTableMatrix()),
        makeToolBtn(ICONS.icon, "Insert Icon", () => this._dsPromptInsertIcon())
      );
      tb.appendChild(gInsert);
      tb.appendChild(makeDivider());

      // 7. Components (Button Menu, Folder Hint, YouTube, Discord Menu)
      const gComponents = document.createElement("div");
      gComponents.className = "ds-notes-tool-group";

      const btnMenuTrigger = makeTextBtn(
        `<span>Button ▾</span>`,
        "Insert Styled Button",
        (e, b) => this._dsOpenButtonMenu(b)
      );

      const folderBtn = makeToolBtn(ICONS.folder, "Insert Folder Hint", () => this._dsPromptFolderHint());
      const ytBtn = makeToolBtn(ICONS.youtube, "Insert YouTube Video / Embed", () => this._dsPromptYouTube());

      const discordMenuTrigger = makeTextBtn(
        `<span>Discord ▾</span>`,
        "Insert Discord Card",
        (e, b) => this._dsOpenDiscordMenu(b)
      );

      gComponents.append(btnMenuTrigger, folderBtn, ytBtn, discordMenuTrigger);
      tb.appendChild(gComponents);
      tb.appendChild(makeDivider());

      // 8. History
      const gHistory = document.createElement("div");
      gHistory.className = "ds-notes-tool-group";
      gHistory.append(
        makeToolBtn(ICONS.undo, "Undo (Ctrl+Z)", () => this._dsUndo()),
        makeToolBtn(ICONS.redo, "Redo (Ctrl+Y)", () => this._dsRedo())
      );
      tb.appendChild(gHistory);

      return tb;
    };

    // -------------------------------------------------------------
    // TRAILING PARAGRAPH HELPER (Ensures clicking below always works)
    // -------------------------------------------------------------
    nodeType.prototype._dsEnsureTrailingParagraph = function (editor) {
      if (!editor) return;
      let last = editor.lastElementChild;
      if (!last || last.tagName !== "P" || last.getAttribute("contenteditable") === "false" || last.classList.contains("ds-notes-callout")) {
        const p = document.createElement("p");
        p.innerHTML = "<br>";
        editor.appendChild(p);
      }
    };

    // -------------------------------------------------------------
    // MODAL TAB SWITCHER (Editor, Code View, Live Preview)
    // -------------------------------------------------------------
    nodeType.prototype._dsSwitchModalTab = function (tab) {
      if (this._dsEditorTab === tab) return;

      // Sync active view back to draft HTML
      if (this._dsEditorTab === "edit" && this._dsModalEditorEl) {
        this._dsDraftDoc.html = this._dsModalEditorEl.innerHTML;
      } else if (this._dsEditorTab === "code" && this._dsModalCodeEl) {
        this._dsDraftDoc.html = this._dsModalCodeEl.value;
      }

      this._dsEditorTab = tab;

      const { tabEdit, tabCode, tabPreview } = this._dsModalTabs;
      tabEdit.classList.toggle("is-active", tab === "edit");
      tabCode.classList.toggle("is-active", tab === "code");
      tabPreview.classList.toggle("is-active", tab === "preview");

      if (tab === "edit") {
        this._dsModalToolbar.style.display = "flex";
        this._dsModalEditScroll.style.display = "block";
        this._dsModalCodeEl.style.display = "none";
        this._dsModalPreviewEl.style.display = "none";
        this._dsModalEditorEl.innerHTML = this._dsDraftDoc.html || "";
        this._dsEnsureTrailingParagraph(this._dsModalEditorEl);
        setTimeout(() => this._dsModalEditorEl.focus(), 30);
      } else if (tab === "code") {
        this._dsModalToolbar.style.display = "none";
        this._dsModalEditScroll.style.display = "none";
        this._dsModalCodeEl.style.display = "block";
        this._dsModalPreviewEl.style.display = "none";
        this._dsModalCodeEl.value = this._dsDraftDoc.html || "";
        setTimeout(() => this._dsModalCodeEl.focus(), 30);
      } else if (tab === "preview") {
        this._dsModalToolbar.style.display = "none";
        this._dsModalEditScroll.style.display = "none";
        this._dsModalCodeEl.style.display = "none";
        this._dsModalPreviewEl.style.display = "block";
        this._dsModalPreviewEl.innerHTML = this._dsDraftDoc.html || "";
      }

      this._dsUpdateStats();
    };

    // -------------------------------------------------------------
    // STATS COUNTER
    // -------------------------------------------------------------
    nodeType.prototype._dsUpdateStats = function () {
      if (!this._dsModalStatsEl) return;
      const text = this._dsModalEditorEl?.innerText || "";
      const words = text.trim() ? text.trim().split(/\s+/).length : 0;
      const chars = text.length;
      const readingTime = Math.max(1, Math.ceil(words / 200));
      this._dsModalStatsEl.textContent = `${words} words · ${chars} chars · ~${readingTime} min read`;
    };

    // -------------------------------------------------------------
    // CANCEL & SAVE LOGIC (WITH ACCIDENTAL LOSS WARNING!)
    // -------------------------------------------------------------
    nodeType.prototype._dsRequestCancel = function () {
      if (this._dsEditorTab === "edit" && this._dsModalEditorEl) {
        this._dsDraftDoc.html = this._dsModalEditorEl.innerHTML;
      } else if (this._dsEditorTab === "code" && this._dsModalCodeEl) {
        this._dsDraftDoc.html = this._dsModalCodeEl.value;
      }

      const isModified = JSON.stringify(this._dsDraftDoc) !== this._dsSavedSnapshot;

      if (isModified) {
        this._dsOpenConfirmDialog({
          title: "Discard Unsaved Changes?",
          message: "You have made changes to this note that will be permanently lost if you cancel.",
          confirmText: "Discard Changes",
          cancelText: "Keep Editing",
          onConfirm: () => {
            this._dsCloseEditorModal(false);
          },
        });
      } else {
        this._dsCloseEditorModal(false);
      }
    };

    nodeType.prototype._dsCommitSave = function () {
      if (this._dsEditorTab === "edit" && this._dsModalEditorEl) {
        this._dsDraftDoc.html = this._dsModalEditorEl.innerHTML;
      } else if (this._dsEditorTab === "code" && this._dsModalCodeEl) {
        this._dsDraftDoc.html = this._dsModalCodeEl.value;
      }

      this._dsDoc = JSON.parse(JSON.stringify(this._dsDraftDoc));
      this.properties = this.properties || {};
      this.properties.ds_notes_data = JSON.parse(JSON.stringify(this._dsDoc));

      this._dsRenderCanvasPreview();
      this.setDirtyCanvas(true, true);

      this._dsCloseEditorModal(false);
    };

    nodeType.prototype._dsCloseEditorModal = function (force = false) {
      if (this._dsModalBackdrop) {
        this._dsModalBackdrop.remove();
        this._dsModalBackdrop = null;
      }
      closeAllPopups();
      document.querySelectorAll(".ds-ui-color-popup").forEach((p) => p.remove());
    };

    // -------------------------------------------------------------
    // ACCIDENTAL CANCEL CONFIRMATION DIALOG
    // -------------------------------------------------------------
    nodeType.prototype._dsOpenConfirmDialog = function ({ title, message, confirmText, cancelText, onConfirm }) {
      const overlay = document.createElement("div");
      overlay.className = "ds-notes-dialog-overlay";

      const card = document.createElement("div");
      card.className = "ds-notes-dialog-card ds-notes-confirm-modal";

      card.innerHTML = `
        <div class="ds-notes-dialog-head" style="color:#f87171;">
          <span>${title}</span>
        </div>
        <div class="ds-notes-dialog-body">
          <p class="ds-notes-confirm-msg">${message}</p>
        </div>
        <div class="ds-notes-dialog-foot">
          <button type="button" class="ds-notes-btn" data-confirm-cancel>${cancelText || "Cancel"}</button>
          <button type="button" class="ds-notes-btn ds-notes-btn-danger" data-confirm-ok>${confirmText || "Confirm"}</button>
        </div>
      `;

      const close = () => overlay.remove();
      card.querySelector("[data-confirm-cancel]").addEventListener("click", close);
      card.querySelector("[data-confirm-ok]").addEventListener("click", () => {
        close();
        onConfirm();
      });

      overlay.appendChild(card);
      document.body.appendChild(overlay);
    };

    // -------------------------------------------------------------
    // COMMAND EXECUTION & EDITING
    // -------------------------------------------------------------
    nodeType.prototype._dsExec = function (cmd, val = null) {
      if (!this._dsModalEditorEl) return;
      this._dsModalEditorEl.focus();
      restoreSelection(this._dsSavedRange);
      document.execCommand(cmd, false, val);
      this._dsSavedRange = saveSelection(this._dsModalEditorEl);
      this._dsDraftDoc.html = this._dsModalEditorEl.innerHTML;
      this._dsPushHistory();
      this._dsUpdateStats();
    };

    nodeType.prototype._dsExecFormatBlock = function (tag) {
      if (!this._dsModalEditorEl) return;
      this._dsModalEditorEl.focus();
      restoreSelection(this._dsSavedRange);
      document.execCommand("formatBlock", false, tag);
      this._dsSavedRange = saveSelection(this._dsModalEditorEl);
      this._dsDraftDoc.html = this._dsModalEditorEl.innerHTML;
      this._dsPushHistory();
      this._dsUpdateStats();
    };

    nodeType.prototype._dsInsertHTML = function (html) {
      if (!this._dsModalEditorEl) return;
      this._dsModalEditorEl.focus();
      restoreSelection(this._dsSavedRange);

      const sel = window.getSelection();
      if (sel && sel.rangeCount) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        const fragment = range.createContextualFragment(html);
        const lastChild = fragment.lastChild;
        range.insertNode(fragment);
        if (lastChild) {
          range.setStartAfter(lastChild);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      } else {
        this._dsModalEditorEl.innerHTML += html;
      }

      this._dsEnsureTrailingParagraph(this._dsModalEditorEl);
      this._dsSavedRange = saveSelection(this._dsModalEditorEl);
      this._dsDraftDoc.html = this._dsModalEditorEl.innerHTML;
      this._dsPushHistory();
      this._dsUpdateStats();
    };

    // -------------------------------------------------------------
    // MODAL INNER DIALOG HELPER
    // -------------------------------------------------------------
    nodeType.prototype._dsOpenInnerDialog = function ({ title, bodyContent, confirmText = "Insert", onConfirm }) {
      closeAllPopups();
      this._dsSavedRange = saveSelection(this._dsModalEditorEl);

      const overlay = document.createElement("div");
      overlay.className = "ds-notes-dialog-overlay";

      const card = document.createElement("div");
      card.className = "ds-notes-dialog-card";

      card.innerHTML = `
        <div class="ds-notes-dialog-head">
          <span>${title}</span>
          <button type="button" class="ds-notes-btn ds-notes-btn-icon" data-dialog-close>
            ${ICONS.close}
          </button>
        </div>
        <div class="ds-notes-dialog-body"></div>
        <div class="ds-notes-dialog-foot">
          <button type="button" class="ds-notes-btn" data-dialog-cancel>Cancel</button>
          <button type="button" class="ds-notes-btn ds-notes-btn-save" data-dialog-confirm>${confirmText}</button>
        </div>
      `;

      const bodyEl = card.querySelector(".ds-notes-dialog-body");
      if (typeof bodyContent === "string") {
        bodyEl.innerHTML = bodyContent;
      } else if (bodyContent instanceof HTMLElement) {
        bodyEl.appendChild(bodyContent);
      }

      const close = () => overlay.remove();
      card.querySelector("[data-dialog-close]").addEventListener("click", close);
      card.querySelector("[data-dialog-cancel]").addEventListener("click", close);
      card.querySelector("[data-dialog-confirm]").addEventListener("click", () => {
        const ok = onConfirm(card);
        if (ok !== false) close();
      });

      overlay.appendChild(card);
      overlay.addEventListener("pointerdown", (e) => {
        if (e.target === overlay) close();
      });

      document.body.appendChild(overlay);

      setTimeout(() => {
        const firstInput = card.querySelector("input");
        if (firstInput) firstInput.focus();
      }, 40);
    };

    // -------------------------------------------------------------
    // CHIP SELECTOR HELPER (NO NATIVE DROPDOWNS!)
    // -------------------------------------------------------------
    nodeType.prototype._dsCreateChipSelector = function (options, defaultValue, onSelect) {
      const group = document.createElement("div");
      group.className = "ds-notes-chip-group";
      let activeVal = defaultValue || options[0]?.id;

      options.forEach((opt) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `ds-notes-chip-btn ${opt.id === activeVal ? "is-active" : ""}`;
        btn.textContent = opt.label;
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          group.querySelectorAll(".ds-notes-chip-btn").forEach((b) => b.classList.remove("is-active"));
          btn.classList.add("is-active");
          activeVal = opt.id;
          onSelect?.(opt.id);
        });
        group.appendChild(btn);
      });

      return {
        element: group,
        getValue: () => activeVal,
      };
    };

    // -------------------------------------------------------------
    // ZERO-NATIVE TABBED COLOR PICKER (Text, Highlight, Page BG)
    // -------------------------------------------------------------
    nodeType.prototype._dsOpenColorPopover = function (anchor) {
      closeAllPopups();
      this._dsSavedRange = saveSelection(this._dsModalEditorEl);

      const popover = document.createElement("div");
      popover.className = "ds-notes-menu-popup ds-notes-color-popover";

      let currentTab = this._dsLastColorTab || "text";

      const tabColors = {
        text: this._dsLastTextColor || "#67e8f9",
        highlight: this._dsLastHlColor || "#facc15",
        bg: this._dsDraftDoc.settings?.bgColor || "#0b0f17",
      };

      // Header
      const head = document.createElement("div");
      head.className = "ds-notes-color-popover-head";
      head.innerHTML = `
        <span class="ds-notes-color-popover-title">Color Palette</span>
        <button type="button" class="ds-notes-btn ds-notes-btn-icon" style="width:20px;height:20px;min-width:20px;line-height:18px;" data-color-close>
          ${ICONS.close}
        </button>
      `;

      // Tabs
      const tabs = document.createElement("div");
      tabs.className = "ds-notes-color-tabs";

      const tabDefs = [
        { id: "text", label: "Text" },
        { id: "highlight", label: "Highlight" },
        { id: "bg", label: "Page BG" },
      ];

      const tabButtons = {};
      tabDefs.forEach((t) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `ds-notes-color-tab ${t.id === currentTab ? "is-active" : ""}`;
        btn.textContent = t.label;
        btn.addEventListener("click", () => {
          currentTab = t.id;
          this._dsLastColorTab = currentTab;
          Object.values(tabButtons).forEach((b) => b.classList.remove("is-active"));
          btn.classList.add("is-active");
          colorEngine.setColor(tabColors[currentTab], false);
        });
        tabButtons[t.id] = btn;
        tabs.appendChild(btn);
      });

      // 2D Sat/Val Box + Canvas
      const satValBox = document.createElement("div");
      satValBox.className = "ds-notes-satval-box";

      const satValCanvas = document.createElement("canvas");
      satValCanvas.className = "ds-notes-satval-canvas";
      satValCanvas.width = 264;
      satValCanvas.height = 124;

      const satValPin = document.createElement("div");
      satValPin.className = "ds-notes-satval-pin";
      satValBox.append(satValCanvas, satValPin);

      // Hue Strip
      const hueStrip = document.createElement("div");
      hueStrip.className = "ds-notes-hue-strip";
      const hueThumb = document.createElement("div");
      hueThumb.className = "ds-notes-hue-thumb";
      hueStrip.appendChild(hueThumb);

      // 4x9 Swatches Palette
      const swatchesGrid = document.createElement("div");
      swatchesGrid.className = "ds-notes-swatches-grid";
      const SWATCHES_4X9 = [
        ["#ffffff", "#f3f4f6", "#e5e7eb", "#d1d5db", "#9ca3af", "#6b7280", "#4b5563", "#1f2937", "#000000"],
        ["#ef4444", "#f97316", "#f59e0b", "#10b981", "#06b6d4", "#3b82f6", "#6366f1", "#8b5cf6", "#ec4899"],
        ["#fca5a5", "#fdba74", "#fcd34d", "#6ee7b7", "#67e8f9", "#93c5fd", "#a5b4fc", "#c4b5fd", "#f472b6"],
        ["#7f1d1d", "#7c2d12", "#78350f", "#064e3b", "#164e63", "#1e3a8a", "#312e81", "#4c1d95", "#831843"],
      ];
      SWATCHES_4X9.forEach((row) => {
        row.forEach((hex) => {
          const cell = document.createElement("div");
          cell.className = "ds-notes-swatch-cell";
          cell.style.backgroundColor = hex;
          cell.title = hex.toUpperCase();
          cell.addEventListener("click", () => {
            colorEngine.setColor(hex, true);
          });
          swatchesGrid.appendChild(cell);
        });
      });

      // Bottom Controls
      const bottomRow = document.createElement("div");
      bottomRow.className = "ds-notes-color-bottom-row";

      const activeSwatch = document.createElement("div");
      activeSwatch.className = "ds-notes-color-active-swatch";

      const hexInput = document.createElement("input");
      hexInput.type = "text";
      hexInput.className = "ds-notes-color-hex-input";
      hexInput.maxLength = 7;
      hexInput.spellcheck = false;

      bottomRow.append(activeSwatch, hexInput);

      if (window.EyeDropper) {
        const eyeBtn = document.createElement("button");
        eyeBtn.type = "button";
        eyeBtn.className = "ds-notes-btn ds-notes-btn-icon";
        eyeBtn.title = "Pick color from screen";
        eyeBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m14 2 6 6-1.5 1.5-6-6Z"/><path d="m9 7-7 7 4 4 7-7"/><path d="m17 11 3 3"/><path d="m11 17 3 3"/><path d="m2 22 3-3"/></svg>`;
        eyeBtn.addEventListener("click", async () => {
          try {
            const dropper = new window.EyeDropper();
            const res = await dropper.open();
            if (res?.sRGBHex) colorEngine.setColor(res.sRGBHex, true);
          } catch (_) {}
        });
        bottomRow.appendChild(eyeBtn);
      }

      const resetBtn = document.createElement("button");
      resetBtn.type = "button";
      resetBtn.className = "ds-notes-btn";
      resetBtn.textContent = "Reset";
      resetBtn.style.padding = "0 8px";
      resetBtn.style.fontSize = "11px";
      resetBtn.title = "Reset to default for this tab";
      resetBtn.addEventListener("click", () => {
        const defaults = { text: "#67e8f9", highlight: "#facc15", bg: "#0b0f17" };
        colorEngine.setColor(defaults[currentTab], true);
      });
      bottomRow.appendChild(resetBtn);

      popover.append(head, tabs, satValBox, hueStrip, swatchesGrid, bottomRow);

      // Color Engine Logic
      const ctx = satValCanvas.getContext("2d");
      let hsv = { h: 187, s: 0.58, v: 0.98 };

      const renderSatVal = () => {
        const w = satValCanvas.width;
        const h = satValCanvas.height;
        ctx.fillStyle = `hsl(${hsv.h}, 100%, 50%)`;
        ctx.fillRect(0, 0, w, h);

        const whiteGrad = ctx.createLinearGradient(0, 0, w, 0);
        whiteGrad.addColorStop(0, "rgba(255,255,255,1)");
        whiteGrad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = whiteGrad;
        ctx.fillRect(0, 0, w, h);

        const blackGrad = ctx.createLinearGradient(0, 0, 0, h);
        blackGrad.addColorStop(0, "rgba(0,0,0,0)");
        blackGrad.addColorStop(1, "rgba(0,0,0,1)");
        ctx.fillStyle = blackGrad;
        ctx.fillRect(0, 0, w, h);
      };

      const syncUI = (fire = true) => {
        renderSatVal();

        const boxW = satValBox.clientWidth || 264;
        const boxH = satValBox.clientHeight || 124;

        satValPin.style.left = `${Math.round(hsv.s * boxW)}px`;
        satValPin.style.top = `${Math.round((1 - hsv.v) * boxH)}px`;

        const hueW = hueStrip.clientWidth || 264;
        hueThumb.style.left = `${Math.round((hsv.h / 360) * hueW)}px`;

        const curRgb = hsvToRgb(hsv.h, hsv.s, hsv.v);
        const hex = rgbToHex(curRgb.r, curRgb.g, curRgb.b);

        activeSwatch.style.backgroundColor = hex;
        hexInput.value = hex.toUpperCase();
        tabColors[currentTab] = hex;

        if (this._dsColorBtn) {
          const dot = this._dsColorBtn.querySelector(".ds-notes-color-swatch-dot");
          if (dot) dot.style.backgroundColor = hex;
        }

        if (fire) {
          if (currentTab === "text") {
            this._dsLastTextColor = hex;
            this._dsExec("foreColor", hex);
          } else if (currentTab === "highlight") {
            this._dsLastHlColor = hex;
            this._dsExec("hiliteColor", hex);
          } else if (currentTab === "bg") {
            this._dsDraftDoc.settings.bgColor = hex;
            if (this._dsModalEditScroll) this._dsModalEditScroll.style.backgroundColor = hex;
            if (this._dsModalPreviewEl) this._dsModalPreviewEl.style.backgroundColor = hex;
          }
        }
      };

      const colorEngine = {
        setColor: (hex, fire = true) => {
          const rgb = hexToRgb(hex);
          hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
          syncUI(fire);
        },
      };

      // Pointer drag handlers for 2D Sat/Val
      let isDraggingSatVal = false;
      const onSatValMove = (e) => {
        const rect = satValBox.getBoundingClientRect();
        const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
        const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
        hsv.s = x / rect.width;
        hsv.v = 1 - (y / rect.height);
        syncUI(true);
      };

      satValBox.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        isDraggingSatVal = true;
        satValBox.setPointerCapture(e.pointerId);
        onSatValMove(e);
      });
      satValBox.addEventListener("pointermove", (e) => {
        if (isDraggingSatVal) onSatValMove(e);
      });
      const endSatVal = (e) => {
        isDraggingSatVal = false;
        try { satValBox.releasePointerCapture(e.pointerId); } catch (_) {}
      };
      satValBox.addEventListener("pointerup", endSatVal);
      satValBox.addEventListener("pointercancel", endSatVal);

      // Pointer drag handlers for Hue
      let isDraggingHue = false;
      const onHueMove = (e) => {
        const rect = hueStrip.getBoundingClientRect();
        const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
        hsv.h = Math.round((x / rect.width) * 360);
        syncUI(true);
      };

      hueStrip.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        isDraggingHue = true;
        hueStrip.setPointerCapture(e.pointerId);
        onHueMove(e);
      });
      hueStrip.addEventListener("pointermove", (e) => {
        if (isDraggingHue) onHueMove(e);
      });
      const endHue = (e) => {
        isDraggingHue = false;
        try { hueStrip.releasePointerCapture(e.pointerId); } catch (_) {}
      };
      hueStrip.addEventListener("pointerup", endHue);
      hueStrip.addEventListener("pointercancel", endHue);

      // Hex input typing
      hexInput.addEventListener("input", (e) => {
        let val = e.target.value.trim();
        if (!val.startsWith("#")) val = `#${val}`;
        if (/^#[0-9a-fA-F]{6}$/.test(val)) {
          colorEngine.setColor(val, true);
        }
      });

      // Close button
      head.querySelector("[data-color-close]").addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        popover.remove();
      });

      document.body.appendChild(popover);

      // Initial color render
      colorEngine.setColor(tabColors[currentTab], false);

      // Position below anchor
      const rect = anchor.getBoundingClientRect();
      popover.style.left = `${Math.max(10, Math.min(window.innerWidth - 305, rect.left))}px`;
      popover.style.top = `${rect.bottom + 6}px`;

      // Outside click dismissal
      setTimeout(() => {
        const onOutside = (e) => {
          if (!popover.contains(e.target) && !anchor.contains(e.target)) {
            popover.remove();
            document.removeEventListener("pointerdown", onOutside, true);
          }
        };
        document.addEventListener("pointerdown", onOutside, true);
      }, 0);
    };

    // -------------------------------------------------------------
    // VARIETY: SEPARATOR DROPDOWN (7 Distinct Styles!)
    // -------------------------------------------------------------
    nodeType.prototype._dsOpenSeparatorMenu = function (anchor) {
      closeAllPopups();
      this._dsSavedRange = saveSelection(this._dsModalEditorEl);

      const menu = document.createElement("div");
      menu.className = "ds-notes-menu-popup";
      menu.style.width = "230px";

      const sepTypes = [
        { label: "── Solid Line", html: `<hr class="ds-notes-sep ds-notes-sep-solid"><p><br></p>` },
        { label: "- - Dashed Line", html: `<hr class="ds-notes-sep ds-notes-sep-dashed"><p><br></p>` },
        { label: "··· Dotted Line", html: `<hr class="ds-notes-sep ds-notes-sep-dotted"><p><br></p>` },
        { label: "✨ Gradient Glow Line", html: `<hr class="ds-notes-sep ds-notes-sep-glow"><p><br></p>` },
        { label: "══ Double Line", html: `<hr class="ds-notes-sep ds-notes-sep-double"><p><br></p>` },
        {
          label: "⭐ Star Center Divider",
          html: `<div class="ds-notes-sep-icon-wrap" contenteditable="false"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">${ICONS.star}</svg></div><p><br></p>`,
        },
        {
          label: "⚡ Zap Center Divider",
          html: `<div class="ds-notes-sep-icon-wrap" contenteditable="false"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">${ICONS.zap}</svg></div><p><br></p>`,
        },
        {
          label: "🏷️ Section Text Divider...",
          isCustomText: true,
        },
      ];

      sepTypes.forEach((item) => {
        const row = document.createElement("div");
        row.className = "ds-notes-menu-item";
        row.textContent = item.label;
        row.addEventListener("click", (e) => {
          e.preventDefault();
          menu.remove();
          if (item.isCustomText) {
            this._dsPromptTextDivider();
          } else {
            this._dsInsertHTML(item.html);
          }
        });
        menu.appendChild(row);
      });

      document.body.appendChild(menu);
      const rect = anchor.getBoundingClientRect();
      menu.style.left = `${Math.max(10, Math.min(window.innerWidth - 240, rect.left))}px`;
      menu.style.top = `${rect.bottom + 6}px`;

      setTimeout(() => {
        const onOutside = (e) => {
          if (!menu.contains(e.target) && !anchor.contains(e.target)) {
            menu.remove();
            document.removeEventListener("pointerdown", onOutside, true);
          }
        };
        document.addEventListener("pointerdown", onOutside, true);
      }, 0);
    };

    nodeType.prototype._dsPromptTextDivider = function () {
      const body = `
        <div class="ds-notes-form-row">
          <span class="ds-notes-form-label">Divider Section Text</span>
          <input type="text" class="ds-notes-form-input" data-div-text value="SECTION OVERVIEW">
        </div>
      `;
      this._dsOpenInnerDialog({
        title: "Insert Text Divider",
        bodyContent: body,
        onConfirm: (card) => {
          const text = card.querySelector("[data-div-text]").value.trim() || "SECTION";
          this._dsInsertHTML(`<div class="ds-notes-sep-text-wrap" contenteditable="false"><span>${text}</span></div><p><br></p>`);
          return true;
        },
      });
    };

    // -------------------------------------------------------------
    // VARIETY: CALLOUT / ALERT BOXES (With Delete [×] and editable text)
    // -------------------------------------------------------------
    nodeType.prototype._dsOpenCalloutMenu = function (anchor) {
      closeAllPopups();
      this._dsSavedRange = saveSelection(this._dsModalEditorEl);

      const menu = document.createElement("div");
      menu.className = "ds-notes-menu-popup";
      menu.style.width = "200px";

      const callouts = [
        { type: "tip", label: "💡 Tip / Hint", title: "PRO TIP", icon: ICONS.info },
        { type: "note", label: "📌 Note / Reference", title: "NOTE", icon: ICONS.notes },
        { type: "warning", label: "⚠️ Warning / Heads Up", title: "WARNING", icon: ICONS.alert },
        { type: "danger", label: "🚨 Caution / Danger", title: "CAUTION", icon: ICONS.flame },
        { type: "success", label: "✅ Important / Success", title: "IMPORTANT", icon: ICONS.check },
      ];

      callouts.forEach((item) => {
        const row = document.createElement("div");
        row.className = "ds-notes-menu-item";
        row.textContent = item.label;
        row.addEventListener("click", (e) => {
          e.preventDefault();
          menu.remove();
          const html = `
<div class="ds-notes-callout ds-notes-callout-${item.type}" contenteditable="false">
  <div class="ds-notes-callout-icon">${item.icon}</div>
  <div class="ds-notes-callout-content">
    <div class="ds-notes-callout-title">${item.title}</div>
    <div class="ds-notes-callout-body" contenteditable="true">Write your note, instructions, or caveats here...</div>
  </div>
  <button type="button" class="ds-notes-block-delete-btn" title="Delete block">×</button>
</div><p><br></p>`;
          this._dsInsertHTML(html);
        });
        menu.appendChild(row);
      });

      document.body.appendChild(menu);
      const rect = anchor.getBoundingClientRect();
      menu.style.left = `${Math.max(10, Math.min(window.innerWidth - 210, rect.left))}px`;
      menu.style.top = `${rect.bottom + 6}px`;

      setTimeout(() => {
        const onOutside = (e) => {
          if (!menu.contains(e.target) && !anchor.contains(e.target)) {
            menu.remove();
            document.removeEventListener("pointerdown", onOutside, true);
          }
        };
        document.addEventListener("pointerdown", onOutside, true);
      }, 0);
    };

    // -------------------------------------------------------------
    // VARIETY: CODE BLOCKS (With Chip Group - NO NATIVE DROPDOWN!)
    // -------------------------------------------------------------
    nodeType.prototype._dsPromptCodeBlock = function () {
      const container = document.createElement("div");
      container.className = "ds-notes-form-row";

      const label = document.createElement("span");
      label.className = "ds-notes-form-label";
      label.textContent = "Select Language / Syntax";
      container.appendChild(label);

      const languages = [
        { id: "python", label: "Python" },
        { id: "javascript", label: "JavaScript" },
        { id: "bash", label: "Bash / Shell" },
        { id: "json", label: "JSON" },
        { id: "prompt", label: "Prompt / Text" },
        { id: "code", label: "Generic Code" },
      ];

      const chipSelector = this._dsCreateChipSelector(languages, "python");
      container.appendChild(chipSelector.element);

      this._dsOpenInnerDialog({
        title: "Insert Code Block",
        bodyContent: container,
        onConfirm: () => {
          const lang = chipSelector.getValue();
          const html = `
<div class="ds-notes-code-block" contenteditable="false">
  <div class="ds-notes-code-header">
    <span class="ds-notes-code-lang">${lang}</span>
    <div style="display:flex;align-items:center;gap:6px;">
      <button type="button" class="ds-notes-btn" style="height:22px;padding:0 8px;font-size:11px;" data-copy-code>Copy</button>
      <button type="button" class="ds-notes-block-delete-btn" style="opacity:1;" title="Delete code block">×</button>
    </div>
  </div>
  <pre class="ds-notes-code-pre" contenteditable="true"><code># Paste or write your ${lang} code here...</code></pre>
</div><p><br></p>`;
          this._dsInsertHTML(html);
          return true;
        },
      });
    };

    // -------------------------------------------------------------
    // VARIETY: INTERACTIVE TABLE PICKER MATRIX (Hover Grid Selector)
    // -------------------------------------------------------------
    nodeType.prototype._dsPromptTableMatrix = function () {
      let selRows = 3;
      let selCols = 3;

      const container = document.createElement("div");
      container.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:10px;";

      const infoText = document.createElement("div");
      infoText.style.cssText = "font-weight:750;font-size:13px;color:var(--ds-accent,#67e8f9);";
      infoText.textContent = "3 × 3 Table";

      const matrix = document.createElement("div");
      matrix.className = "ds-notes-table-picker-matrix";

      const cells = [];
      for (let r = 1; r <= 8; r++) {
        for (let c = 1; c <= 8; c++) {
          const cell = document.createElement("div");
          cell.className = "ds-notes-matrix-cell";
          cell.dataset.r = r;
          cell.dataset.c = c;

          cell.addEventListener("mouseenter", () => {
            selRows = r;
            selCols = c;
            infoText.textContent = `${selRows} × ${selCols} Table`;
            cells.forEach((cl) => {
              const cr = parseInt(cl.dataset.r);
              const cc = parseInt(cl.dataset.c);
              cl.classList.toggle("is-selected", cr <= selRows && cc <= selCols);
            });
          });

          matrix.appendChild(cell);
          cells.push(cell);
        }
      }

      // Pre-select 3x3
      cells.forEach((cl) => {
        const cr = parseInt(cl.dataset.r);
        const cc = parseInt(cl.dataset.c);
        cl.classList.toggle("is-selected", cr <= 3 && cc <= 3);
      });

      container.append(infoText, matrix);

      this._dsOpenInnerDialog({
        title: "Insert Table / Grid",
        bodyContent: container,
        onConfirm: () => {
          let tableHtml = '<div class="ds-notes-table-wrap" contenteditable="false"><button type="button" class="ds-notes-block-delete-btn" style="position:absolute;top:6px;right:6px;z-index:2;" title="Delete table">×</button><table class="ds-notes-table"><thead><tr>';
          for (let c = 1; c <= selCols; c++) {
            tableHtml += `<th contenteditable="true">Header ${c}</th>`;
          }
          tableHtml += '</tr></thead><tbody>';
          for (let r = 1; r <= selRows; r++) {
            tableHtml += '<tr>';
            for (let c = 1; c <= selCols; c++) {
              tableHtml += `<td contenteditable="true">Data ${r},${c}</td>`;
            }
            tableHtml += '</tr>';
          }
          tableHtml += '</tbody></table></div><p><br></p>';
          this._dsInsertHTML(tableHtml);
          return true;
        },
      });
    };

    // -------------------------------------------------------------
    // VARIETY: YOUTUBE (Chip Group for Format - NO NATIVE DROPDOWN!)
    // -------------------------------------------------------------
    nodeType.prototype._dsPromptYouTube = function () {
      const container = document.createElement("div");
      container.style.cssText = "display:flex;flex-direction:column;gap:12px;";

      container.innerHTML = `
        <div class="ds-notes-form-row">
          <span class="ds-notes-form-label">YouTube URL</span>
          <input type="text" class="ds-notes-form-input" data-yt-url placeholder="https://www.youtube.com/watch?v=...">
        </div>
        <div class="ds-notes-form-row">
          <span class="ds-notes-form-label">Video Title</span>
          <input type="text" class="ds-notes-form-input" data-yt-title value="Featured Video">
        </div>
        <div class="ds-notes-form-row">
          <span class="ds-notes-form-label">Subtitle / Description</span>
          <input type="text" class="ds-notes-form-input" data-yt-desc value="Click to watch video">
        </div>
      `;

      const formatRow = document.createElement("div");
      formatRow.className = "ds-notes-form-row";
      const formatLabel = document.createElement("span");
      formatLabel.className = "ds-notes-form-label";
      formatLabel.textContent = "Display Format";
      formatRow.appendChild(formatLabel);

      const formatModes = [
        { id: "card", label: "🎴 Video Card (External Tab)" },
        { id: "embed", label: "📺 Embedded Player (Watch In-Note)" },
      ];
      const formatChips = this._dsCreateChipSelector(formatModes, "card");
      formatRow.appendChild(formatChips.element);
      container.appendChild(formatRow);

      this._dsOpenInnerDialog({
        title: "Insert YouTube Video",
        bodyContent: container,
        onConfirm: (card) => {
          const url = card.querySelector("[data-yt-url]").value.trim();
          if (!url) return false;

          const title = card.querySelector("[data-yt-title]").value.trim() || "Featured Video";
          const desc = card.querySelector("[data-yt-desc]").value.trim() || "";
          const mode = formatChips.getValue();

          let videoId = "";
          const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
          if (match && match[1]) videoId = match[1];

          if (mode === "embed" && videoId) {
            const embedHtml = `
<div class="ds-notes-youtube-embed-wrap" contenteditable="false">
  <button type="button" class="ds-notes-block-delete-btn" style="position:absolute;top:6px;right:6px;z-index:2;" title="Delete embed">×</button>
  <iframe src="https://www.youtube-nocookie.com/embed/${videoId}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
</div><p><br></p>`;
            this._dsInsertHTML(embedHtml);
          } else {
            const cardHtml = `
<a href="${url}" target="_blank" rel="noopener noreferrer" class="ds-notes-youtube-card" contenteditable="false">
  <div class="ds-notes-youtube-header">${ICONS.youtube} <span>YouTube Video</span> <button type="button" class="ds-notes-block-delete-btn" title="Delete card">×</button></div>
  <div class="ds-notes-youtube-body">
    <div class="ds-notes-youtube-play">▶</div>
    <div class="ds-notes-youtube-info">
      <div class="ds-notes-youtube-title">${title}</div>
      ${desc ? `<div class="ds-notes-youtube-desc">${desc}</div>` : ""}
      <div class="ds-notes-youtube-url">${url}</div>
    </div>
  </div>
</a><p><br></p>`;
            this._dsInsertHTML(cardHtml);
          }
          return true;
        },
      });
    };

    // -------------------------------------------------------------
    // VARIETY: BUTTONS (Download, View, Read, GitHub, Sponsor, Plain)
    // -------------------------------------------------------------
    nodeType.prototype._dsOpenButtonMenu = function (anchor) {
      closeAllPopups();
      this._dsSavedRange = saveSelection(this._dsModalEditorEl);

      const menu = document.createElement("div");
      menu.className = "ds-notes-menu-popup";
      menu.style.width = "210px";

      const btnStyles = [
        { type: "download", label: "📥 Download Model/File", def: "Download Model" },
        { type: "view", label: "🌐 View Page Button", def: "View Page" },
        { type: "read", label: "📖 Read More (CTA)", def: "Read More" },
        { type: "github", label: "🐙 GitHub Repository", def: "View on GitHub" },
        { type: "sponsor", label: "💖 Sponsor / Donate", def: "Support Project" },
        { type: "plain", label: "⏹ Plain Standard Button", def: "Click Here" },
      ];

      btnStyles.forEach((item) => {
        const row = document.createElement("div");
        row.className = "ds-notes-menu-item";
        row.textContent = item.label;
        row.addEventListener("click", (e) => {
          e.preventDefault();
          menu.remove();
          this._dsPromptButtonConfig(item.type, item.def);
        });
        menu.appendChild(row);
      });

      document.body.appendChild(menu);
      const rect = anchor.getBoundingClientRect();
      menu.style.left = `${Math.max(10, Math.min(window.innerWidth - 220, rect.left))}px`;
      menu.style.top = `${rect.bottom + 6}px`;

      setTimeout(() => {
        const onOutside = (e) => {
          if (!menu.contains(e.target) && !anchor.contains(e.target)) {
            menu.remove();
            document.removeEventListener("pointerdown", onOutside, true);
          }
        };
        document.addEventListener("pointerdown", onOutside, true);
      }, 0);
    };

    nodeType.prototype._dsPromptButtonConfig = function (type, defaultLabel) {
      const body = `
        <div class="ds-notes-form-row">
          <span class="ds-notes-form-label">Button Text</span>
          <input type="text" class="ds-notes-form-input" data-btn-text value="${defaultLabel}">
        </div>
        <div class="ds-notes-form-row">
          <span class="ds-notes-form-label">Destination URL</span>
          <input type="text" class="ds-notes-form-input" data-btn-url placeholder="https://example.com">
        </div>
      `;

      this._dsOpenInnerDialog({
        title: `Insert ${type.charAt(0).toUpperCase() + type.slice(1)} Button`,
        bodyContent: body,
        onConfirm: (card) => {
          const text = card.querySelector("[data-btn-text]").value.trim() || defaultLabel;
          const rawUrl = card.querySelector("[data-btn-url]").value.trim() || "#";
          const href = rawUrl === "#" || /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;

          let icon = ICONS.link;
          if (type === "download") icon = ICONS.download;
          else if (type === "view" || type === "github") icon = ICONS.externalLink;
          else if (type === "sponsor") icon = ICONS.heart;

          const btnHtml = `<a href="${href}" target="_blank" rel="noopener noreferrer" class="ds-notes-doc-btn ds-notes-doc-btn-${type}" contenteditable="false">${icon} <span>${text}</span></a>&nbsp;`;
          this._dsInsertHTML(btnHtml);
          return true;
        },
      });
    };

    // -------------------------------------------------------------
    // VARIETY: FOLDER HINT
    // -------------------------------------------------------------
    nodeType.prototype._dsPromptFolderHint = function () {
      const body = `
        <div class="ds-notes-form-row">
          <span class="ds-notes-form-label">Root Folder</span>
          <input type="text" class="ds-notes-form-input" data-folder-root value="ComfyUI/models/checkpoints">
        </div>
        <div class="ds-notes-form-row">
          <span class="ds-notes-form-label">Target File / Tree Path</span>
          <input type="text" class="ds-notes-form-input" data-folder-file value="v1-5-pruned-emaonly.safetensors">
        </div>
      `;

      this._dsOpenInnerDialog({
        title: "Insert Folder Hint",
        bodyContent: body,
        onConfirm: (card) => {
          const rootDir = card.querySelector("[data-folder-root]").value.trim() || "models";
          const file = card.querySelector("[data-folder-file]").value.trim() || "example.safetensors";

          const hintHtml = `
<div class="ds-notes-folder-hint" contenteditable="false">
  <div class="ds-notes-folder-hint-title">
    <span>📁 ${rootDir}</span>
    <button type="button" class="ds-notes-block-delete-btn" title="Delete folder hint">×</button>
  </div>
  <div class="ds-notes-folder-hint-tree">   └── ${file}</div>
</div><p><br></p>`;
          this._dsInsertHTML(hintHtml);
          return true;
        },
      });
    };

    // -------------------------------------------------------------
    // VARIETY: DISCORD SUBMENU
    // -------------------------------------------------------------
    nodeType.prototype._dsOpenDiscordMenu = function (anchor) {
      closeAllPopups();
      this._dsSavedRange = saveSelection(this._dsModalEditorEl);

      const menu = document.createElement("div");
      menu.className = "ds-notes-menu-popup";
      menu.style.width = "200px";

      const items = [
        { type: "server", label: "💬 Discord Server", title: "Discord Server" },
        { type: "channel", label: "📢 Discord Channel", title: "Discord Channel" },
        { type: "invite", label: "✉️ Discord Invite", title: "Discord Invite" },
      ];

      items.forEach((item) => {
        const row = document.createElement("div");
        row.className = "ds-notes-menu-item";
        row.textContent = item.label;
        row.addEventListener("click", (e) => {
          e.preventDefault();
          menu.remove();
          this._dsPromptDiscordConfig(item.title);
        });
        menu.appendChild(row);
      });

      document.body.appendChild(menu);
      const rect = anchor.getBoundingClientRect();
      menu.style.left = `${Math.max(10, Math.min(window.innerWidth - 210, rect.left))}px`;
      menu.style.top = `${rect.bottom + 6}px`;

      setTimeout(() => {
        const onOutside = (e) => {
          if (!menu.contains(e.target) && !anchor.contains(e.target)) {
            menu.remove();
            document.removeEventListener("pointerdown", onOutside, true);
          }
        };
        document.addEventListener("pointerdown", onOutside, true);
      }, 0);
    };

    nodeType.prototype._dsPromptDiscordConfig = function (badgeLabel) {
      const body = `
        <div class="ds-notes-form-row">
          <span class="ds-notes-form-label">Community / Server Name</span>
          <input type="text" class="ds-notes-form-input" data-discord-name value="Deathshot Arsenal Community">
        </div>
        <div class="ds-notes-form-row">
          <span class="ds-notes-form-label">Description / Subtitle</span>
          <input type="text" class="ds-notes-form-input" data-discord-desc value="Join for workflows, support, and updates">
        </div>
        <div class="ds-notes-form-row">
          <span class="ds-notes-form-label">Invite URL</span>
          <input type="text" class="ds-notes-form-input" data-discord-url placeholder="https://discord.gg/...">
        </div>
      `;

      this._dsOpenInnerDialog({
        title: `Insert ${badgeLabel}`,
        bodyContent: body,
        onConfirm: (card) => {
          const name = card.querySelector("[data-discord-name]").value.trim() || "Discord Community";
          const desc = card.querySelector("[data-discord-desc]").value.trim() || "";
          const rawUrl = card.querySelector("[data-discord-url]").value.trim() || "https://discord.com";
          const href = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;

          const discordHtml = `
<a href="${href}" target="_blank" rel="noopener noreferrer" class="ds-notes-discord-card" contenteditable="false">
  <div class="ds-notes-discord-top">
    <div style="display:flex;align-items:center;gap:6px;">${ICONS.discord} <span>${badgeLabel}</span></div>
    <button type="button" class="ds-notes-block-delete-btn" title="Delete card">×</button>
  </div>
  <div class="ds-notes-discord-content">
    <div class="ds-notes-discord-info">
      <div class="ds-notes-discord-name">${name}</div>
      ${desc ? `<div class="ds-notes-discord-desc">${desc}</div>` : ""}
    </div>
    <div class="ds-notes-discord-join">Join Server</div>
  </div>
</a><p><br></p>`;
          this._dsInsertHTML(discordHtml);
          return true;
        },
      });
    };

    // -------------------------------------------------------------
    // HYPERLINK & ICON PICKERS
    // -------------------------------------------------------------
    nodeType.prototype._dsPromptInsertLink = function () {
      const selectedText = window.getSelection()?.toString() || "";
      const body = `
        <div class="ds-notes-form-row">
          <span class="ds-notes-form-label">Display Text</span>
          <input type="text" class="ds-notes-form-input" data-link-text value="${selectedText}">
        </div>
        <div class="ds-notes-form-row">
          <span class="ds-notes-form-label">Target URL</span>
          <input type="text" class="ds-notes-form-input" data-link-url placeholder="https://example.com">
        </div>
      `;

      this._dsOpenInnerDialog({
        title: "Insert Hyperlink",
        bodyContent: body,
        onConfirm: (card) => {
          const text = card.querySelector("[data-link-text]").value.trim() || "Link";
          const url = card.querySelector("[data-link-url]").value.trim();
          if (!url) return false;
          const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
          this._dsInsertHTML(`<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`);
          return true;
        },
      });
    };

    nodeType.prototype._dsPromptInsertIcon = function () {
      const iconsList = [
        { id: "info", svg: ICONS.info, label: "Info" },
        { id: "alert", svg: ICONS.alert, label: "Alert" },
        { id: "star", svg: ICONS.star, label: "Star" },
        { id: "check", svg: ICONS.check, label: "Check" },
        { id: "flame", svg: ICONS.flame, label: "Flame" },
        { id: "heart", svg: ICONS.heart, label: "Heart" },
        { id: "zap", svg: ICONS.zap, label: "Zap" },
        { id: "code", svg: ICONS.code, label: "Code" },
        { id: "notes", svg: ICONS.notes, label: "Document" },
        { id: "folder", svg: ICONS.folder, label: "Folder" },
        { id: "download", svg: ICONS.download, label: "Download" },
        { id: "link", svg: ICONS.link, label: "Link" },
        { id: "youtube", svg: ICONS.youtube, label: "YouTube" },
        { id: "discord", svg: ICONS.discord, label: "Discord" },
      ];

      const container = document.createElement("div");
      container.style.cssText = "display:grid;grid-template-columns:repeat(7,1fr);gap:6px;";

      let selectedSvg = iconsList[0].svg;

      iconsList.forEach((item, index) => {
        const tile = document.createElement("div");
        tile.className = `ds-notes-btn ds-notes-btn-icon ${index === 0 ? "is-active" : ""}`;
        tile.title = item.label;
        tile.innerHTML = item.svg;
        tile.addEventListener("click", () => {
          container.querySelectorAll(".ds-notes-btn").forEach((t) => t.classList.remove("is-active"));
          tile.classList.add("is-active");
          selectedSvg = item.svg;
        });
        container.appendChild(tile);
      });

      this._dsOpenInnerDialog({
        title: "Select Document Icon",
        bodyContent: container,
        onConfirm: () => {
          this._dsInsertHTML(`<span style="display:inline-flex;vertical-align:middle;width:16px;height:16px;margin:0 3px;" contenteditable="false">${selectedSvg}</span>&nbsp;`);
          return true;
        },
      });
    };

    // -------------------------------------------------------------
    // EDIT EXISTING ELEMENTS (Double Click Handlers)
    // -------------------------------------------------------------
    nodeType.prototype._dsPromptEditLink = function (linkEl) {
      const curText = linkEl.textContent || "";
      const curUrl = linkEl.getAttribute("href") || "";

      const body = `
        <div class="ds-notes-form-row">
          <span class="ds-notes-form-label">Display Text</span>
          <input type="text" class="ds-notes-form-input" data-link-text value="${curText}">
        </div>
        <div class="ds-notes-form-row">
          <span class="ds-notes-form-label">Target URL</span>
          <input type="text" class="ds-notes-form-input" data-link-url value="${curUrl}">
        </div>
      `;

      this._dsOpenInnerDialog({
        title: "Edit Hyperlink",
        bodyContent: body,
        confirmText: "Update Link",
        onConfirm: (card) => {
          const text = card.querySelector("[data-link-text]").value.trim();
          const url = card.querySelector("[data-link-url]").value.trim();
          if (!url) {
            linkEl.replaceWith(document.createTextNode(text || curText));
          } else {
            const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
            linkEl.textContent = text || href;
            linkEl.setAttribute("href", href);
          }
          this._dsDraftDoc.html = this._dsModalEditorEl.innerHTML;
          this._dsPushHistory();
          this._dsUpdateStats();
          return true;
        },
      });
    };

    nodeType.prototype._dsPromptEditButton = function (btnEl) {
      const span = btnEl.querySelector("span");
      const curText = span ? span.textContent : btnEl.textContent;
      const curUrl = btnEl.getAttribute("href") || "";

      const body = `
        <div class="ds-notes-form-row">
          <span class="ds-notes-form-label">Button Text</span>
          <input type="text" class="ds-notes-form-input" data-btn-text value="${curText}">
        </div>
        <div class="ds-notes-form-row">
          <span class="ds-notes-form-label">Destination URL</span>
          <input type="text" class="ds-notes-form-input" data-btn-url value="${curUrl}">
        </div>
      `;

      this._dsOpenInnerDialog({
        title: "Edit Button",
        bodyContent: body,
        confirmText: "Update Button",
        onConfirm: (card) => {
          const text = card.querySelector("[data-btn-text]").value.trim() || curText;
          const url = card.querySelector("[data-btn-url]").value.trim() || "#";
          const href = url === "#" || /^https?:\/\//i.test(url) ? url : `https://${url}`;
          if (span) span.textContent = text;
          else btnEl.textContent = text;
          btnEl.setAttribute("href", href);
          this._dsDraftDoc.html = this._dsModalEditorEl.innerHTML;
          this._dsPushHistory();
          this._dsUpdateStats();
          return true;
        },
      });
    };

    nodeType.prototype._dsPromptEditFolderHint = function (folderEl) {
      const titleEl = folderEl.querySelector(".ds-notes-folder-hint-title span");
      const treeEl = folderEl.querySelector(".ds-notes-folder-hint-tree");
      const curRoot = titleEl ? titleEl.textContent.replace("📁", "").trim() : "models";
      const curFile = treeEl ? treeEl.textContent.replace("└──", "").trim() : "file.ext";

      const body = `
        <div class="ds-notes-form-row">
          <span class="ds-notes-form-label">Root Directory</span>
          <input type="text" class="ds-notes-form-input" data-folder-root value="${curRoot}">
        </div>
        <div class="ds-notes-form-row">
          <span class="ds-notes-form-label">Target File or Path</span>
          <input type="text" class="ds-notes-form-input" data-folder-file value="${curFile}">
        </div>
      `;

      this._dsOpenInnerDialog({
        title: "Edit Folder Hint",
        bodyContent: body,
        confirmText: "Update Hint",
        onConfirm: (card) => {
          const rootDir = card.querySelector("[data-folder-root]").value.trim() || curRoot;
          const file = card.querySelector("[data-folder-file]").value.trim() || curFile;
          if (titleEl) titleEl.textContent = `📁 ${rootDir}`;
          if (treeEl) treeEl.textContent = `   └── ${file}`;
          this._dsDraftDoc.html = this._dsModalEditorEl.innerHTML;
          this._dsPushHistory();
          this._dsUpdateStats();
          return true;
        },
      });
    };

    nodeType.prototype._dsPromptEditYouTube = function (ytEl) {
      const curUrl = ytEl.getAttribute("href") || "";
      const titleEl = ytEl.querySelector(".ds-notes-youtube-title");
      const descEl = ytEl.querySelector(".ds-notes-youtube-desc");
      const curTitle = titleEl ? titleEl.textContent : "Featured Video";
      const curDesc = descEl ? descEl.textContent : "";

      const body = `
        <div class="ds-notes-form-row">
          <span class="ds-notes-form-label">YouTube URL</span>
          <input type="text" class="ds-notes-form-input" data-yt-url value="${curUrl}">
        </div>
        <div class="ds-notes-form-row">
          <span class="ds-notes-form-label">Video Title</span>
          <input type="text" class="ds-notes-form-input" data-yt-title value="${curTitle}">
        </div>
        <div class="ds-notes-form-row">
          <span class="ds-notes-form-label">Subtitle / Description</span>
          <input type="text" class="ds-notes-form-input" data-yt-desc value="${curDesc}">
        </div>
      `;

      this._dsOpenInnerDialog({
        title: "Edit YouTube Card",
        bodyContent: body,
        confirmText: "Update Card",
        onConfirm: (card) => {
          const url = card.querySelector("[data-yt-url]").value.trim();
          if (!url) return false;
          const title = card.querySelector("[data-yt-title]").value.trim() || curTitle;
          const desc = card.querySelector("[data-yt-desc]").value.trim() || "";

          ytEl.setAttribute("href", url);
          if (titleEl) titleEl.textContent = title;
          if (descEl) descEl.textContent = desc;
          const urlEl = ytEl.querySelector(".ds-notes-youtube-url");
          if (urlEl) urlEl.textContent = url;

          this._dsDraftDoc.html = this._dsModalEditorEl.innerHTML;
          this._dsPushHistory();
          this._dsUpdateStats();
          return true;
        },
      });
    };

    nodeType.prototype._dsPromptEditDiscord = function (discordEl) {
      const nameEl = discordEl.querySelector(".ds-notes-discord-name");
      const descEl = discordEl.querySelector(".ds-notes-discord-desc");
      const curName = nameEl ? nameEl.textContent : "Discord Community";
      const curDesc = descEl ? descEl.textContent : "";
      const curUrl = discordEl.getAttribute("href") || "";

      const body = `
        <div class="ds-notes-form-row">
          <span class="ds-notes-form-label">Server / Community Name</span>
          <input type="text" class="ds-notes-form-input" data-discord-name value="${curName}">
        </div>
        <div class="ds-notes-form-row">
          <span class="ds-notes-form-label">Description / Subtitle</span>
          <input type="text" class="ds-notes-form-input" data-discord-desc value="${curDesc}">
        </div>
        <div class="ds-notes-form-row">
          <span class="ds-notes-form-label">Invite URL</span>
          <input type="text" class="ds-notes-form-input" data-discord-url value="${curUrl}">
        </div>
      `;

      this._dsOpenInnerDialog({
        title: "Edit Discord Card",
        bodyContent: body,
        confirmText: "Update Card",
        onConfirm: (card) => {
          const name = card.querySelector("[data-discord-name]").value.trim() || curName;
          const desc = card.querySelector("[data-discord-desc]").value.trim() || curDesc;
          const rawUrl = card.querySelector("[data-discord-url]").value.trim() || curUrl;
          const href = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;

          if (nameEl) nameEl.textContent = name;
          if (descEl) descEl.textContent = desc;
          discordEl.setAttribute("href", href);

          this._dsDraftDoc.html = this._dsModalEditorEl.innerHTML;
          this._dsPushHistory();
          this._dsUpdateStats();
          return true;
        },
      });
    };

    // -------------------------------------------------------------
    // HISTORY (Undo / Redo)
    // -------------------------------------------------------------
    nodeType.prototype._dsPushHistory = function () {
      const current = this._dsDraftDoc.html || "";
      if (this._dsHistory[this._dsHistoryIndex] === current) return;
      this._dsHistory = this._dsHistory.slice(0, this._dsHistoryIndex + 1);
      this._dsHistory.push(current);
      if (this._dsHistory.length > 50) this._dsHistory.shift();
      this._dsHistoryIndex = this._dsHistory.length - 1;
    };

    nodeType.prototype._dsUndo = function () {
      if (this._dsHistoryIndex > 0) {
        this._dsHistoryIndex--;
        const html = this._dsHistory[this._dsHistoryIndex];
        this._dsDraftDoc.html = html;
        if (this._dsModalEditorEl) {
          this._dsModalEditorEl.innerHTML = html;
          this._dsEnsureTrailingParagraph(this._dsModalEditorEl);
        }
        if (this._dsModalCodeEl) this._dsModalCodeEl.value = html;
        this._dsUpdateStats();
      }
    };

    nodeType.prototype._dsRedo = function () {
      if (this._dsHistoryIndex < this._dsHistory.length - 1) {
        this._dsHistoryIndex++;
        const html = this._dsHistory[this._dsHistoryIndex];
        this._dsDraftDoc.html = html;
        if (this._dsModalEditorEl) {
          this._dsModalEditorEl.innerHTML = html;
          this._dsEnsureTrailingParagraph(this._dsModalEditorEl);
        }
        if (this._dsModalCodeEl) this._dsModalCodeEl.value = html;
        this._dsUpdateStats();
      }
    };
  },
});
