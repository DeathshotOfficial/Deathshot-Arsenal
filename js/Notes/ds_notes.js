/* ============================================================
   DS Notes - Deathshot Arsenal
   Feature-Rich Rich-Text Document Editor with Popup Workspace
   ============================================================ */

import { app } from "/scripts/app.js";
import {
  Card,
  Button,
  Field,
  StatusBar,
  DSIcon,
  DSIconMarkup,
  protectDSResizeCorners,
  normalizeDSWidgetHost,
  installDSUI,
} from "../UIElements/index.js";


installDSUI();

// Ensure stylesheet is loaded
const CSS_ID = "ds-notes-css";
if (!document.getElementById(CSS_ID)) {
  const link = document.createElement("link");
  link.id = CSS_ID;
  link.rel = "stylesheet";
  link.href = "/extensions/DeathshotArsenal/Notes/ds_notes.css";
  document.head.appendChild(link);
}

// Modern Unified SVG Icons (Sourced from Lucide via DSIconMarkup)
const ICONS = {
  notes: DSIconMarkup("notes", { size: 14 }),
  edit: DSIconMarkup("edit", { size: 13 }),
  bold: DSIconMarkup("bold", { size: 13 }),
  italic: DSIconMarkup("italic", { size: 13 }),
  underline: DSIconMarkup("underline", { size: 13 }),
  strike: DSIconMarkup("strike", { size: 13 }),
  clear: DSIconMarkup("clear", { size: 13 }),
  ul: DSIconMarkup("list", { size: 13 }),
  ol: DSIconMarkup("list-ordered", { size: 13 }),
  link: DSIconMarkup("external-link", { size: 13 }),
  code: DSIconMarkup("code", { size: 13 }),
  grid: DSIconMarkup("table", { size: 13 }),
  folder: DSIconMarkup("folder", { size: 13 }),
  youtube: DSIconMarkup("youtube", { size: 13 }),
  discord: DSIconMarkup("discord", { size: 13 }),
  callout: DSIconMarkup("alert-circle", { size: 13 }),
  undo: DSIconMarkup("undo", { size: 13 }),
  redo: DSIconMarkup("redo", { size: 13 }),
  download: DSIconMarkup("download", { size: 13 }),
  externalLink: DSIconMarkup("external-link", { size: 13 }),
  star: DSIconMarkup("star", { size: 13 }),
  check: DSIconMarkup("check", { size: 13 }),
  flame: DSIconMarkup("flame", { size: 13 }),
  info: DSIconMarkup("info", { size: 13 }),
  alert: DSIconMarkup("alert-triangle", { size: 13 }),
  heart: DSIconMarkup("heart", { size: 13 }),
  zap: DSIconMarkup("zap", { size: 13 }),
  close: DSIconMarkup("x", { size: 14 }),
  lightbulb: DSIconMarkup("lightbulb", { size: 13 }),
  pin: DSIconMarkup("pin", { size: 13 }),
  tag: DSIconMarkup("tag", { size: 13 }),
  globe: DSIconMarkup("globe", { size: 13 }),
  book: DSIconMarkup("book-open", { size: 13 }),
  github: DSIconMarkup("github", { size: 13 }),
  copy: DSIconMarkup("copy", { size: 12 }),
  palette: DSIconMarkup("palette", { size: 13 }),
  users: DSIconMarkup("users", { size: 13 }),
  hash: DSIconMarkup("hash", { size: 13 }),
  mail: DSIconMarkup("mail", { size: 13 }),
  play: DSIconMarkup("play", { size: 12 }),
  mousePointer: DSIconMarkup("mouse-pointer", { size: 13 }),
  square: DSIconMarkup("square", { size: 13 }),
  film: DSIconMarkup("film", { size: 13 }),
  save: DSIconMarkup("save", { size: 13 }),
  type: DSIconMarkup("type", { size: 13 }),
  icon: DSIconMarkup("sparkles", { size: 13 }),
};

const FONT_FAMILIES = [
  { id: "Inter, sans-serif",                       label: "Inter",           sample: "Aa" },
  { id: "system-ui, sans-serif",                   label: "System UI",       sample: "Aa" },
  { id: "'Segoe UI', Roboto, sans-serif",           label: "Segoe UI",        sample: "Aa" },
  { id: "Georgia, serif",                          label: "Georgia",         sample: "Aa" },
  { id: "'Times New Roman', Times, serif",         label: "Times New Roman", sample: "Aa" },
  { id: "'JetBrains Mono', Consolas, monospace",   label: "JetBrains Mono",  sample: "Aa" },
  { id: "'Fira Code', monospace",                  label: "Fira Code",       sample: "Aa" },
  { id: "Consolas, monospace",                     label: "Consolas",        sample: "Aa" },
];

const FONT_SIZES = [
  { id: "1", label: "10px",  px: 10 },
  { id: "2", label: "13px",  px: 13 },
  { id: "3", label: "16px",  px: 16 },
  { id: "4", label: "18px",  px: 18 },
  { id: "5", label: "24px",  px: 24 },
  { id: "6", label: "32px",  px: 32 },
  { id: "7", label: "48px",  px: 48 },
];

const DEFAULT_DOC = {
  version: 1,
  settings: {
    bgColor: "",
  },
  html: `<h2>Workflow Documentation</h2>
<p>Document checkpoints, LoRA trigger words, prompt recipes, and instructions for this workflow.</p>
<div class="ds-notes-callout ds-notes-callout-tip">
  <div class="ds-notes-callout-icon">${DSIconMarkup("lightbulb", { size: 16 })}</div>
  <div class="ds-notes-callout-content">
    <div class="ds-notes-callout-title">PRO TIP</div>
    <div class="ds-notes-callout-body">Click <strong>Edit</strong> in the top-right to open the dedicated full-screen editor to format notes, add callouts, code blocks, tables, and links.</div>
  </div>
</div>
<hr class="ds-notes-sep ds-notes-sep-glow">
<p>This note is displayed in read-only mode directly on the canvas. All editing is performed in the dedicated editor workspace.</p>`,
};

function sanitizeDoc(doc) {
  if (!doc || typeof doc !== "object") {
    return JSON.parse(JSON.stringify(DEFAULT_DOC));
  }
  const bg = typeof doc.settings?.bgColor === "string" ? doc.settings.bgColor.trim() : "";
  const isYellow = bg.toLowerCase() === "#e5a93c" || bg.toLowerCase() === "#f2c94c" || bg.toLowerCase() === "yellow";
  return {
    version: doc.version || 1,
    settings: {
      bgColor: isYellow ? "" : bg,
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

    const DS_NOTES_CARD_MARGIN = 5;
    const DS_NOTES_MIN_CARD_HEIGHT = 160;
    const DS_NOTES_MIN_WIDGET_HEIGHT = DS_NOTES_MIN_CARD_HEIGHT + (DS_NOTES_CARD_MARGIN * 2);

    nodeType.prototype._getNotesWidgetY = function () {
      const widget = this._dsNotesDOMWidget;
      const y = Number(widget?.y);
      if (Number.isFinite(y) && y >= 0) return y;
      const lastY = Number(widget?.last_y);
      if (Number.isFinite(lastY) && lastY >= 0) return lastY;
      return 0;
    };

    nodeType.prototype._calcStats = function (html) {
      const temp = document.createElement("div");
      temp.innerHTML = html || "";
      const text = temp.innerText || "";
      const words = text.trim() ? text.trim().split(/\s+/).length : 0;
      const chars = text.length;
      const readingTime = Math.max(1, Math.ceil(words / 200));
      return { words, chars, readingTime };
    };

    nodeType.prototype._getPlainText = function () {
      const temp = document.createElement("div");
      temp.innerHTML = this._dsDoc?.html || "";
      return temp.innerText.trim();
    };

    nodeType.prototype.onNodeCreated = function () {
      const res = origCreated ? origCreated.apply(this, arguments) : undefined;

      this.resizable = true;
      this.shape = "round";
      protectDSResizeCorners(this);

      // Default dark palette so LiteGraph base NEVER shows bright yellow
      this.color = "#161b24";
      this.bgcolor = "#0b0f17";
      this.boxcolor = "#242a36";

      // Spacious, high-grade dimensions on canvas
      const curW = Number(this.size?.[0]) || 0;
      const curH = Number(this.size?.[1]) || 0;
      this.size = [
        curW >= 480 ? curW : 520,
        curH >= 420 ? curH : 480,
      ];

      // Card starts exactly 5px below title bar (no sockets = bodyTop 0, margin:5 handles the gap)
      Object.defineProperty(this, "widgets_start_y", {
        configurable: true,
        get() { return 0; },
        set() { },
      });

      this.properties = this.properties || {};
      if (!this.properties.ds_notes_data) {
        this.properties.ds_notes_data = JSON.parse(JSON.stringify(DEFAULT_DOC));
      }

      this._dsDoc = sanitizeDoc(this.properties.ds_notes_data);

      // Card primitive from UIElements
      const card = Card({
        title: "DS Notes",
        icon: "notes",
        className: "ds-notes-card",
      });
      this._dsCard = card;
      this._dsRoot = card.root;

      // Mount DOM Widget on canvas
      const domWidget = this.addDOMWidget("ds_notes_ui", "custom", card.root, {
        serialize: false,
        hideOnZoom: false,
        margin: DS_NOTES_CARD_MARGIN,
        getMinHeight: () => DS_NOTES_MIN_WIDGET_HEIGHT,
        getMaxHeight: () => {
          const widgetY = Number(domWidget?.y ?? this._getNotesWidgetY?.() ?? 0);
          const nodeHeight = Number(this.size?.[1] || 480);
          return Math.max(DS_NOTES_MIN_WIDGET_HEIGHT, nodeHeight - widgetY);
        },
        getHeight: () => {
          const widgetY = Number(domWidget?.y ?? this._getNotesWidgetY?.() ?? 0);
          const nodeHeight = Number(this.size?.[1] || 480);
          return Math.max(DS_NOTES_MIN_WIDGET_HEIGHT, nodeHeight - widgetY);
        },
      });
      this._dsNotesDOMWidget = domWidget;

      normalizeDSWidgetHost(card.root, this, { shell: false });

      if (Array.isArray(this.widgets)) {
        const domIdx = this.widgets.indexOf(this._dsNotesDOMWidget);
        if (domIdx > 0) {
          this.widgets.splice(domIdx, 1);
          this.widgets.unshift(this._dsNotesDOMWidget);
        }
      }

      // Render the in-node canvas card (Read-Only Content Display)
      this._dsRenderCanvasPreview();

      // Theme Integration
      try {
        if (window.DSGlobalTheme) {
          window.DSGlobalTheme.bindNode?.(card.root, this);
          window.DSGlobalTheme.applyNodeBase?.(this);
        }
      } catch (_) { }

      if (!this._dsThemeSubscribed && window.DSGlobalTheme?.subscribe) {
        this._dsThemeSubscribed = true;
        window.DSGlobalTheme.subscribe(() => {
          try {
            window.DSGlobalTheme?.applyNodeBase?.(this);
          } catch (_) { }
          this._dsRenderCanvasPreview?.();
          this.setDirtyCanvas?.(true, true);
        });
      }

      setTimeout(() => {
        try {
          if (window.DSGlobalTheme) {
            window.DSGlobalTheme.bindNode?.(card.root, this);
            window.DSGlobalTheme.applyNodeBase?.(this);
          }
        } catch (_) { }
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

      this.color = "#161b24";
      this.bgcolor = "#0b0f17";
      this.boxcolor = "#242a36";

      // Upgrade squished old dimensions
      if (this.size) {
        const curW = Number(this.size[0]) || 0;
        const curH = Number(this.size[1]) || 0;
        if (curW < 480 || curH < 420) {
          this.setSize([
            curW >= 480 ? curW : 520,
            curH >= 420 ? curH : 480,
          ]);
        }
      }

      // Re-apply global theme base
      try {
        if (window.DSGlobalTheme) {
          window.DSGlobalTheme.bindNode?.(this._dsCard?.root, this);
          window.DSGlobalTheme.applyNodeBase?.(this);
        }
      } catch (_) { }

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
      if (this.size) {
        this.size[0] = Math.max(Number(this.size[0]) || 480, 320);
        this.size[1] = Math.max(Number(this.size[1]) || 420, 200);
      }
      this.setDirtyCanvas?.(true, true);
    };

    nodeType.prototype.onRemoved = function () {
      closeAllPopups();
      this._dsCloseEditorModal?.(true);
      origRemoved?.apply(this, arguments);
    };

    // -------------------------------------------------------------
    // CANVAS CARD RENDERER (Read-Only Content Display, Proper Sizing)
    // -------------------------------------------------------------
    nodeType.prototype._dsRenderCanvasPreview = function () {
      const card = this._dsCard;
      if (!card) return;

      // Header Actions: Dedicated Edit Button & Copy Button
      const actionsGroup = card.head?.querySelector(".ds-ui-card-actions");
      if (actionsGroup) {
        actionsGroup.replaceChildren();

        // 1. Open Dedicated Editor Button (UIElements Button)
        const editBtn = Button({
          icon: "edit",
          label: "Edit",
          size: "compact",
          variant: "primary",
          tooltip: "Open Note Editor",
          onClick: (e) => {
            e.stopPropagation();
            this._dsOpenEditorModal();
          },
        });

        // 2. Copy Note to Clipboard Button (UIElements Button)
        const copyBtn = Button({
          icon: "copy",
          size: "compact",
          tooltip: "Copy Note to Clipboard",
          onClick: async (e) => {
            e.stopPropagation();
            const plain = this._getPlainText();
            if (navigator.clipboard) {
              await navigator.clipboard.writeText(plain);
              copyBtn.setIcon("check");
              copyBtn.root.classList.add("is-success");
              setTimeout(() => {
                copyBtn.setIcon("copy");
                copyBtn.root.classList.remove("is-success");
              }, 1400);
            }
          },
        });

        actionsGroup.append(editBtn.root, copyBtn.root);
      }

      // Clear card body
      card.clear();

      // STRICTLY READ-ONLY CONTENT VIEWER (No editing allowed on the node itself)
      const previewBody = document.createElement("div");
      previewBody.className = "ds-notes-card-body ds-notes-preview-body";
      if (this._dsDoc.settings?.bgColor) {
        previewBody.style.backgroundColor = this._dsDoc.settings.bgColor;
      }

      const rawHtml = (this._dsDoc.html || "").trim();
      if (!rawHtml) {
        const emptyState = document.createElement("div");
        emptyState.className = "ds-notes-empty-state";
        emptyState.innerHTML = `
          <div class="ds-notes-empty-icon">${DSIconMarkup("notes", { size: 30 })}</div>
          <div class="ds-notes-empty-title">Empty Note</div>
          <div class="ds-notes-empty-desc">Click <strong>Edit</strong> in the header to open the editor and write documentation.</div>
        `;
        emptyState.addEventListener("click", () => this._dsOpenEditorModal());
        previewBody.appendChild(emptyState);
      } else {
        previewBody.innerHTML = this._dsDoc.html;

        // Strip any contenteditable attributes to guarantee 100% read-only on canvas
        previewBody.querySelectorAll("[contenteditable]").forEach((el) => {
          el.removeAttribute("contenteditable");
        });

        // Ensure links open safely in new window/tab
        previewBody.querySelectorAll("a").forEach((link) => {
          link.setAttribute("target", "_blank");
          link.setAttribute("rel", "noopener noreferrer");
        });

        // Copy buttons inside code blocks
        previewBody.querySelectorAll("[data-copy-code]").forEach((btn) => {
          btn.addEventListener("click", async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const block = btn.closest(".ds-notes-code-block");
            const codeEl = block ? block.querySelector("code") : null;
            const text = codeEl ? codeEl.innerText : "";
            if (navigator.clipboard) {
              await navigator.clipboard.writeText(text);
              const origHtml = btn.innerHTML;
              btn.innerHTML = `${DSIconMarkup("check", { size: 12, color: "var(--ds-color-success, #34d399)" })} <span>Copied!</span>`;
              setTimeout(() => { btn.innerHTML = origHtml; }, 1400);
            }
          });
        });
      }

      card.append(previewBody);
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
      this._dsInitialHtml = this._dsDraftDoc.html || "";
      this._dsIsDirty = false;
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
      modal.className = "ds-ui-card ds-notes-editor-modal";
      backdrop.appendChild(modal);

      // Top Bar (Tabs: Editor, Code View, Live Preview + Title + Close)
      const topbar = document.createElement("div");
      topbar.className = "ds-ui-card-head ds-notes-modal-topbar";

      const titleWrap = document.createElement("div");
      titleWrap.className = "ds-notes-modal-title-wrap";
      titleWrap.innerHTML = `
        <div class="ds-notes-modal-title">
          ${DSIconMarkup("notes", { size: 16, color: "var(--ds-color-accent, #67e8f9)" })}
          <span>DS Notes Editor</span>
        </div>
      `;

      const tabsGroup = document.createElement("div");
      tabsGroup.className = "ds-notes-view-tabs";

      const tabEdit = document.createElement("button");
      tabEdit.className = "ds-ui-btn is-active";
      tabEdit.innerHTML = `${DSIconMarkup("edit", { size: 13 })} <span>Editor</span>`;
      tabEdit.addEventListener("click", () => this._dsSwitchModalTab("edit"));

      const tabCode = document.createElement("button");
      tabCode.className = "ds-ui-btn";
      tabCode.innerHTML = `${DSIconMarkup("code", { size: 13 })} <span>Code View</span>`;
      tabCode.addEventListener("click", () => this._dsSwitchModalTab("code"));

      const tabPreview = document.createElement("button");
      tabPreview.className = "ds-ui-btn";
      tabPreview.innerHTML = `${DSIconMarkup("eye", { size: 13 })} <span>Live Preview</span>`;
      tabPreview.addEventListener("click", () => this._dsSwitchModalTab("preview"));

      tabsGroup.append(tabEdit, tabCode, tabPreview);
      this._dsModalTabs = { tabEdit, tabCode, tabPreview };

      const closeBtn = Button({
        icon: "x",
        tooltip: "Close Editor",
        onClick: () => this._dsRequestCancel(),
      });

      topbar.append(titleWrap, tabsGroup, closeBtn.root);
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

      // Clean normalized baseline: document is completely unmodified on open
      this._dsNormalizedBaselineHtml = editor.innerHTML;
      this._dsIsDirty = false;

      editor.addEventListener("input", () => {
        this._dsIsDirty = true;
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
            this._dsIsDirty = true;
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
        this._dsIsDirty = true;
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

      // Bottom Bar (Stats via DS StatusBar, Cancel, Save)
      const bottombar = document.createElement("div");
      bottombar.className = "ds-notes-bottombar";

      const statusBar = StatusBar({ text: "Ready", state: "idle" });
      statusBar.root.className += " ds-notes-bottom-stats";
      this._dsModalStatsEl = statusBar.root;
      this._dsModalStatusBar = statusBar;

      const actions = document.createElement("div");
      actions.style.cssText = "display:flex;gap:8px;align-items:center;flex-shrink:0;";

      const cancelBtn = Button({
        label: "Cancel",
        onClick: () => this._dsRequestCancel(),
      });

      const saveBtn = Button({
        label: "Save Changes",
        icon: "save",
        variant: "primary",
        onClick: () => this._dsCommitSave(),
      });

      actions.append(cancelBtn.root, saveBtn.root);
      bottombar.append(statusBar.root, actions);
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

      const makeToolBtn = (iconSvg, title, onClick) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "ds-ui-btn ds-ui-btn-icon-only";
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

      const makeTextBtn = (label, title, onClick) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "ds-ui-btn";
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

      // 1. Font Family picker
      const gFont = document.createElement("div");
      gFont.className = "ds-notes-tool-group";
      const fontLabel = this._dsLastFont
        ? FONT_FAMILIES.find((f) => f.id === this._dsLastFont)?.label || "Font"
        : "Font";
      const fontTrigger = makeTextBtn(
        `${ICONS.type} <span class="ds-notes-font-label">${fontLabel}</span> <span>▾</span>`,
        "Change Font Family",
        (e, b) => this._dsOpenFontMenu(b)
      );
      this._dsFontTrigger = fontTrigger;
      gFont.appendChild(fontTrigger);
      tb.appendChild(gFont);
      tb.appendChild(makeDivider());

      // 2. Font Size picker
      const gSize = document.createElement("div");
      gSize.className = "ds-notes-tool-group";
      const sizePx = this._dsLastFontSize
        ? FONT_SIZES.find((s) => s.id === this._dsLastFontSize)?.label || "Size"
        : "Size";
      const sizeTrigger = makeTextBtn(
        `<span class="ds-notes-size-label">${sizePx}</span> <span>▾</span>`,
        "Change Font Size",
        (e, b) => this._dsOpenFontSizeMenu(b)
      );
      this._dsSizeTrigger = sizeTrigger;
      gSize.appendChild(sizeTrigger);
      tb.appendChild(gSize);
      tb.appendChild(makeDivider());

      // 3. Text Style
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

      // 4. Headings (Strictly 28px height)
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
        `${DSIconMarkup("palette", { size: 13 })} <span class="ds-notes-color-swatch-dot" style="background:${dotColor}"></span> <span>Color ▾</span>`,
        "Text, Highlight & Page Background Colors",
        (e, btn) => this._dsOpenColorPopover(btn)
      );
      this._dsColorBtn = colorBtn;
      gColors.appendChild(colorBtn);
      tb.appendChild(gColors);
      tb.appendChild(makeDivider());

      // 5. Lists
      const gLists = document.createElement("div");
      gLists.className = "ds-notes-tool-group";
      gLists.append(
        makeToolBtn(ICONS.ul, "Bulleted List", () => this._dsExec("insertUnorderedList")),
        makeToolBtn(ICONS.ol, "Numbered List", () => this._dsExec("insertOrderedList"))
      );
      tb.appendChild(gLists);
      tb.appendChild(makeDivider());

      // 6. Variety: Separator Dropdown
      const gSep = document.createElement("div");
      gSep.className = "ds-notes-tool-group";
      const sepTrigger = makeTextBtn(
        `${DSIconMarkup("minus", { size: 13 })} <span>Sep ▾</span>`,
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
        `${DSIconMarkup("square", { size: 12 })} <span>Button ▾</span>`,
        "Insert Styled Button",
        (e, b) => this._dsOpenButtonMenu(b)
      );

      const folderBtn = makeToolBtn(ICONS.folder, "Insert Folder Hint", () => this._dsPromptFolderHint());
      const ytBtn = makeToolBtn(ICONS.youtube, "Insert YouTube Video / Embed", () => this._dsPromptYouTube());

      const discordMenuTrigger = makeTextBtn(
        `${DSIconMarkup("discord", { size: 13 })} <span>Discord ▾</span>`,
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
    // FONT FAMILY MENU
    // -------------------------------------------------------------
    nodeType.prototype._dsOpenFontMenu = function (anchor) {
      closeAllPopups();
      this._dsSavedRange = saveSelection(this._dsModalEditorEl);

      const menu = document.createElement("div");
      menu.className = "ds-notes-menu-popup ds-notes-font-menu";

      FONT_FAMILIES.forEach((item) => {
        const row = document.createElement("div");
        row.className = "ds-notes-menu-item ds-notes-font-menu-item";
        row.innerHTML = `
          <span class="ds-notes-font-sample" style="font-family:${item.id}">${item.sample}</span>
          <span class="ds-notes-font-name">${item.label}</span>
          ${this._dsLastFont === item.id ? `<span class="ds-notes-font-check">${DSIconMarkup("check", { size: 12 })}</span>` : ""}
        `;
        row.addEventListener("click", (e) => {
          e.preventDefault();
          menu.remove();
          this._dsLastFont = item.id;
          this._dsExecFont(item.id);
          const lbl = this._dsFontTrigger?.querySelector(".ds-notes-font-label");
          if (lbl) lbl.textContent = item.label;
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

    // -------------------------------------------------------------
    // FONT SIZE MENU
    // -------------------------------------------------------------
    nodeType.prototype._dsOpenFontSizeMenu = function (anchor) {
      closeAllPopups();
      this._dsSavedRange = saveSelection(this._dsModalEditorEl);

      const menu = document.createElement("div");
      menu.className = "ds-notes-menu-popup ds-notes-fontsize-menu";

      FONT_SIZES.forEach((item) => {
        const row = document.createElement("div");
        row.className = "ds-notes-menu-item ds-notes-fontsize-menu-item";
        row.innerHTML = `
          <span class="ds-notes-fontsize-preview" style="font-size:${item.px}px">${item.label}</span>
          ${this._dsLastFontSize === item.id ? `<span class="ds-notes-font-check">${DSIconMarkup("check", { size: 12 })}</span>` : ""}
        `;
        row.addEventListener("click", (e) => {
          e.preventDefault();
          menu.remove();
          this._dsLastFontSize = item.id;
          this._dsExecFontSize(item.id);
          const lbl = this._dsSizeTrigger?.querySelector(".ds-notes-size-label");
          if (lbl) lbl.textContent = item.label;
        });
        menu.appendChild(row);
      });

      document.body.appendChild(menu);
      const rect = anchor.getBoundingClientRect();
      menu.style.left = `${Math.max(10, Math.min(window.innerWidth - 200, rect.left))}px`;
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
    // FONT EXEC HELPERS
    // -------------------------------------------------------------
    nodeType.prototype._dsExecFont = function (fontFamily) {
      if (!this._dsModalEditorEl) return;
      this._dsIsDirty = true;
      this._dsModalEditorEl.focus();
      restoreSelection(this._dsSavedRange);

      const sel = window.getSelection();
      if (sel && sel.rangeCount && !sel.isCollapsed) {
        // Wrap selected text in a span with the font-family
        const range = sel.getRangeAt(0);
        const span = document.createElement("span");
        span.style.fontFamily = fontFamily;
        try {
          range.surroundContents(span);
        } catch (_) {
          // If surroundContents fails (partial nodes), extract and wrap
          const fragment = range.extractContents();
          span.appendChild(fragment);
          range.insertNode(span);
        }
        range.selectNodeContents(span);
        sel.removeAllRanges();
        sel.addRange(range);
      } else {
        // No selection — apply to the contenteditable element as a whole style hint
        this._dsModalEditorEl.style.fontFamily = fontFamily;
      }

      this._dsSavedRange = saveSelection(this._dsModalEditorEl);
      this._dsDraftDoc.html = this._dsModalEditorEl.innerHTML;
      this._dsPushHistory();
      this._dsUpdateStats();
    };

    nodeType.prototype._dsExecFontSize = function (sizeId) {
      if (!this._dsModalEditorEl) return;
      this._dsIsDirty = true;
      this._dsModalEditorEl.focus();
      restoreSelection(this._dsSavedRange);
      document.execCommand("fontSize", false, sizeId);
      this._dsSavedRange = saveSelection(this._dsModalEditorEl);
      this._dsDraftDoc.html = this._dsModalEditorEl.innerHTML;
      this._dsPushHistory();
      this._dsUpdateStats();
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
    // STATS COUNTER (uses DS StatusBar component)
    // -------------------------------------------------------------
    nodeType.prototype._dsUpdateStats = function () {
      if (!this._dsModalStatusBar) return;
      const text = this._dsModalEditorEl?.innerText || "";
      const words = text.trim() ? text.trim().split(/\s+/).length : 0;
      const chars = text.length;
      const readingTime = Math.max(1, Math.ceil(words / 200));
      this._dsModalStatusBar.setStatus(`${words} words · ${chars} chars · ~${readingTime} min read`, "idle");
    };

    // -------------------------------------------------------------
    // CANCEL & SAVE LOGIC (WITH ACCIDENTAL LOSS WARNING!)
    // -------------------------------------------------------------
    nodeType.prototype._dsRequestCancel = function () {
      // If user never touched anything, close immediately without prompting
      if (!this._dsIsDirty) {
        this._dsCloseEditorModal(false);
        return;
      }

      const currentHtml = this._dsEditorTab === "code" && this._dsModalCodeEl
        ? this._dsModalCodeEl.value
        : (this._dsModalEditorEl?.innerHTML || "");

      // If current HTML matches the initial normalized baseline, close immediately
      if (currentHtml === this._dsNormalizedBaselineHtml || currentHtml.trim() === this._dsInitialHtml) {
        this._dsCloseEditorModal(false);
        return;
      }

      this._dsOpenConfirmDialog({
        title: "Discard Unsaved Changes?",
        message: "You have unsaved changes in this note. Are you sure you want to discard them?",
        confirmText: "Discard Changes",
        cancelText: "Keep Editing",
        onConfirm: () => {
          this._dsCloseEditorModal(false);
        },
      });
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
      this._dsIsDirty = false;

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
    // ACCIDENTAL CANCEL CONFIRMATION DIALOG (DS UIElements Card)
    // -------------------------------------------------------------
    nodeType.prototype._dsOpenConfirmDialog = function ({ title, message, confirmText, cancelText, onConfirm }) {
      const overlay = document.createElement("div");
      overlay.className = "ds-notes-dialog-overlay";

      // Build card using DS UIElements Card
      const dlgCard = Card({
        title,
        icon: "alert-triangle",
        className: "ds-notes-confirm-modal",
      });
      dlgCard.root.style.cssText = "--ds-ui-card-title-color: var(--ds-color-danger,#f87171);min-width:360px;max-width:520px;";

      const msgEl = document.createElement("p");
      msgEl.className = "ds-notes-confirm-msg";
      msgEl.textContent = message;
      dlgCard.append(msgEl);

      const foot = document.createElement("div");
      foot.className = "ds-notes-dialog-foot";

      const close = () => overlay.remove();

      const cancelBtn = Button({
        label: cancelText || "Keep Editing",
        onClick: close,
      });

      const confirmBtn = Button({
        label: confirmText || "Discard Changes",
        variant: "danger",
        onClick: () => {
          close();
          onConfirm();
        },
      });

      foot.append(cancelBtn.root, confirmBtn.root);
      dlgCard.body.appendChild(foot);

      overlay.appendChild(dlgCard.root);
      overlay.addEventListener("pointerdown", (e) => {
        if (e.target === overlay) close();
      });
      document.body.appendChild(overlay);
    };

    // -------------------------------------------------------------
    // COMMAND EXECUTION & EDITING
    // -------------------------------------------------------------
    nodeType.prototype._dsExec = function (cmd, val = null) {
      if (!this._dsModalEditorEl) return;
      this._dsIsDirty = true;
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
      this._dsIsDirty = true;
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
      this._dsIsDirty = true;
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
    // MODAL INNER DIALOG HELPER (DS UIElements Card + Field + Button)
    // -------------------------------------------------------------
    nodeType.prototype._dsOpenInnerDialog = function ({ title, bodyContent, confirmText = "Insert", onConfirm }) {
      closeAllPopups();
      this._dsSavedRange = saveSelection(this._dsModalEditorEl);

      const overlay = document.createElement("div");
      overlay.className = "ds-notes-dialog-overlay";

      // Modal card using DS UIElements Card
      const dlgCard = Card({
        title,
        icon: "plus",
        className: "ds-notes-dialog-card",
      });

      const bodyEl = document.createElement("div");
      bodyEl.className = "ds-notes-dialog-body";
      if (typeof bodyContent === "string") {
        const tmpDiv = document.createElement("div");
        tmpDiv.style.cssText = "display:flex;flex-direction:column;gap:12px;width:100%;box-sizing:border-box;";
        tmpDiv.innerHTML = bodyContent;
        tmpDiv.querySelectorAll(".ds-notes-form-label").forEach((el) => {
          el.classList.add("ds-ui-field-label");
        });
        tmpDiv.querySelectorAll(".ds-notes-form-input").forEach((el) => {
          el.classList.add("ds-ui-input");
        });
        tmpDiv.querySelectorAll(".ds-notes-form-row").forEach((el) => {
          el.classList.add("ds-ui-field");
        });
        bodyEl.appendChild(tmpDiv);
      } else if (bodyContent instanceof HTMLElement) {
        bodyContent.querySelectorAll?.(".ds-notes-form-label").forEach((el) => el.classList.add("ds-ui-field-label"));
        bodyContent.querySelectorAll?.(".ds-notes-form-input").forEach((el) => el.classList.add("ds-ui-input"));
        bodyContent.querySelectorAll?.(".ds-notes-form-row").forEach((el) => el.classList.add("ds-ui-field"));
        bodyEl.appendChild(bodyContent);
      }
      dlgCard.body.appendChild(bodyEl);

      const foot = document.createElement("div");
      foot.className = "ds-notes-dialog-foot";

      const close = () => overlay.remove();

      const cancelBtn = Button({
        label: "Cancel",
        onClick: close,
      });

      const confirmBtn = Button({
        label: confirmText,
        variant: "primary",
        icon: "check",
        onClick: () => {
          const ok = onConfirm(bodyEl);
          if (ok !== false) close();
        },
      });

      const closeHeaderBtn = Button({
        icon: "x",
        compact: true,
        tooltip: "Close",
        onClick: close,
      });
      if (dlgCard.head) dlgCard.head.querySelector(".ds-ui-card-actions")?.appendChild(closeHeaderBtn.root);

      foot.append(cancelBtn.root, confirmBtn.root);
      dlgCard.body.appendChild(foot);

      overlay.appendChild(dlgCard.root);
      overlay.addEventListener("pointerdown", (e) => {
        if (e.target === overlay) close();
      });

      document.body.appendChild(overlay);

      setTimeout(() => {
        const firstInput = overlay.querySelector("input");
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
        if (opt.icon) {
          btn.innerHTML = `<span class="ds-notes-menu-icon" style="display:inline-flex;align-items:center;margin-right:6px;">${opt.icon}</span><span>${opt.label}</span>`;
        } else {
          btn.textContent = opt.label;
        }
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
      head.innerHTML = `<span class="ds-notes-color-popover-title">Color Palette</span>`;
      const closeColorBtn = Button({ icon: "x", compact: true, tooltip: "Close" });
      closeColorBtn.root.setAttribute("data-color-close", "");
      head.appendChild(closeColorBtn.root);

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
        const eyeBtn = Button({
          icon: "pipette",
          className: "ds-notes-color-eyedropper-btn",
          tooltip: "Pick color from screen",
        });
        eyeBtn.root.addEventListener("click", async () => {
          try {
            const dropper = new window.EyeDropper();
            const res = await dropper.open();
            if (res?.sRGBHex) colorEngine.setColor(res.sRGBHex, true);
          } catch (_) { }
        });
        bottomRow.appendChild(eyeBtn.root);
      }

      const resetBtn = Button({
        label: "Reset",
        className: "ds-notes-color-reset-btn",
        tooltip: "Reset to default for this tab",
      });
      resetBtn.root.addEventListener("click", () => {
        const defaults = { text: "#67e8f9", highlight: "#facc15", bg: "#0b0f17" };
        colorEngine.setColor(defaults[currentTab], true);
      });
      bottomRow.appendChild(resetBtn.root);

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
        try { satValBox.releasePointerCapture(e.pointerId); } catch (_) { }
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
        try { hueStrip.releasePointerCapture(e.pointerId); } catch (_) { }
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
        { label: "Solid Line", icon: DSIconMarkup("minus", { size: 14 }), html: `<hr class="ds-notes-sep ds-notes-sep-solid"><p><br></p>` },
        { label: "Dashed Line", icon: DSIconMarkup("minus", { size: 14 }), html: `<hr class="ds-notes-sep ds-notes-sep-dashed"><p><br></p>` },
        { label: "Dotted Line", icon: DSIconMarkup("minus", { size: 14 }), html: `<hr class="ds-notes-sep ds-notes-sep-dotted"><p><br></p>` },
        { label: "Gradient Glow Line", icon: DSIconMarkup("sparkles", { size: 14 }), html: `<hr class="ds-notes-sep ds-notes-sep-glow"><p><br></p>` },
        { label: "Double Line", icon: DSIconMarkup("minus", { size: 14 }), html: `<hr class="ds-notes-sep ds-notes-sep-double"><p><br></p>` },
        {
          label: "Star Center Divider",
          icon: DSIconMarkup("star", { size: 14 }),
          html: `<div class="ds-notes-sep-icon-wrap" contenteditable="false">${DSIconMarkup("star", { size: 18 })}</div><p><br></p>`,
        },
        {
          label: "Zap Center Divider",
          icon: DSIconMarkup("zap", { size: 14 }),
          html: `<div class="ds-notes-sep-icon-wrap" contenteditable="false">${DSIconMarkup("zap", { size: 18 })}</div><p><br></p>`,
        },
        {
          label: "Section Text Divider...",
          icon: DSIconMarkup("tag", { size: 14 }),
          isCustomText: true,
        },
      ];

      sepTypes.forEach((item) => {
        const row = document.createElement("div");
        row.className = "ds-notes-menu-item";
        row.innerHTML = `<span class="ds-notes-menu-icon">${item.icon}</span> <span>${item.label}</span>`;
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
        <div class="ds-ui-field ds-notes-form-row">
          <span class="ds-ui-field-label ds-notes-form-label">Divider Section Text</span>
          <input type="text" class="ds-ui-input ds-notes-form-input" data-div-text value="SECTION OVERVIEW">
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
    // VARIETY: CALLOUT / ALERT BOXES (With Delete [x] and editable text)
    // -------------------------------------------------------------
    nodeType.prototype._dsOpenCalloutMenu = function (anchor) {
      closeAllPopups();
      this._dsSavedRange = saveSelection(this._dsModalEditorEl);

      const menu = document.createElement("div");
      menu.className = "ds-notes-menu-popup";
      menu.style.width = "200px";

      const callouts = [
        { type: "tip", label: "Tip / Hint", title: "PRO TIP", icon: DSIconMarkup("lightbulb", { size: 16 }), menuIcon: DSIconMarkup("lightbulb", { size: 14 }) },
        { type: "note", label: "Note / Reference", title: "NOTE", icon: DSIconMarkup("notes", { size: 16 }), menuIcon: DSIconMarkup("notes", { size: 14 }) },
        { type: "warning", label: "Warning / Heads Up", title: "WARNING", icon: DSIconMarkup("alert-triangle", { size: 16 }), menuIcon: DSIconMarkup("alert-triangle", { size: 14 }) },
        { type: "danger", label: "Caution / Danger", title: "CAUTION", icon: DSIconMarkup("flame", { size: 16 }), menuIcon: DSIconMarkup("flame", { size: 14 }) },
        { type: "success", label: "Important / Success", title: "IMPORTANT", icon: DSIconMarkup("check-circle", { size: 16 }), menuIcon: DSIconMarkup("check-circle", { size: 14 }) },
      ];

      callouts.forEach((item) => {
        const row = document.createElement("div");
        row.className = "ds-notes-menu-item";
        row.innerHTML = `<span class="ds-notes-menu-icon">${item.menuIcon}</span> <span>${item.label}</span>`;
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
  <button type="button" class="ds-notes-block-delete-btn" title="Delete block">${DSIconMarkup("x", { size: 12 })}</button>
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
      <button type="button" class="ds-notes-copy-code-btn" data-copy-code>${DSIconMarkup("copy", { size: 12 })} <span>Copy</span></button>
      <button type="button" class="ds-notes-block-delete-btn" style="opacity:1;" title="Delete code block">${DSIconMarkup("x", { size: 12 })}</button>
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
          let tableHtml = `<div class="ds-notes-table-wrap" contenteditable="false"><button type="button" class="ds-notes-block-delete-btn" style="position:absolute;top:6px;right:6px;z-index:2;" title="Delete table">${DSIconMarkup("x", { size: 12 })}</button><table class="ds-notes-table"><thead><tr>`;
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
        <div class="ds-ui-field ds-notes-form-row">
          <span class="ds-ui-field-label ds-notes-form-label">YouTube URL</span>
          <input type="text" class="ds-ui-input ds-notes-form-input" data-yt-url placeholder="https://www.youtube.com/watch?v=...">
        </div>
        <div class="ds-ui-field ds-notes-form-row">
          <span class="ds-ui-field-label ds-notes-form-label">Video Title</span>
          <input type="text" class="ds-ui-input ds-notes-form-input" data-yt-title value="Featured Video">
        </div>
        <div class="ds-ui-field ds-notes-form-row">
          <span class="ds-ui-field-label ds-notes-form-label">Subtitle / Description</span>
          <input type="text" class="ds-ui-input ds-notes-form-input" data-yt-desc value="Click to watch video">
        </div>
      `;

      const formatRow = document.createElement("div");
      formatRow.className = "ds-notes-form-row";
      const formatLabel = document.createElement("span");
      formatLabel.className = "ds-notes-form-label";
      formatLabel.textContent = "Display Format";
      formatRow.appendChild(formatLabel);

      const formatModes = [
        { id: "card", label: "Video Card", icon: DSIconMarkup("external-link", { size: 13 }) },
        { id: "embed", label: "Embedded Player", icon: DSIconMarkup("film", { size: 13 }) },
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
  <button type="button" class="ds-notes-block-delete-btn" style="position:absolute;top:6px;right:6px;z-index:2;" title="Delete embed">${DSIconMarkup("x", { size: 12 })}</button>
  <iframe src="https://www.youtube-nocookie.com/embed/${videoId}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
</div><p><br></p>`;
            this._dsInsertHTML(embedHtml);
          } else {
            const cardHtml = `
<a href="${url}" target="_blank" rel="noopener noreferrer" class="ds-notes-youtube-card" contenteditable="false">
  <div class="ds-notes-youtube-header">${DSIconMarkup("youtube", { size: 14 })} <span>YouTube Video</span> <button type="button" class="ds-notes-block-delete-btn" title="Delete card">${DSIconMarkup("x", { size: 12 })}</button></div>
  <div class="ds-notes-youtube-body">
    <div class="ds-notes-youtube-play">${DSIconMarkup("play", { size: 14 })}</div>
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
        { type: "download", label: "Download File", icon: DSIconMarkup("download", { size: 14 }), def: "Download Model" },
        { type: "view", label: "View Page", icon: DSIconMarkup("external-link", { size: 14 }), def: "View Page" },
        { type: "read", label: "Read More (CTA)", icon: DSIconMarkup("book-open", { size: 14 }), def: "Read More" },
        { type: "github", label: "GitHub Repository", icon: DSIconMarkup("github", { size: 14 }), def: "View on GitHub" },
        { type: "sponsor", label: "Sponsor / Donate", icon: DSIconMarkup("heart", { size: 14 }), def: "Support Project" },
        { type: "plain", label: "Standard Button", icon: DSIconMarkup("square", { size: 14 }), def: "Click Here" },
      ];

      btnStyles.forEach((item) => {
        const row = document.createElement("div");
        row.className = "ds-notes-menu-item";
        row.innerHTML = `<span class="ds-notes-menu-icon">${item.icon}</span> <span>${item.label}</span>`;
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
        <div class="ds-ui-field ds-notes-form-row">
          <span class="ds-ui-field-label ds-notes-form-label">Button Text</span>
          <input type="text" class="ds-ui-input ds-notes-form-input" data-btn-text value="${defaultLabel}">
        </div>
        <div class="ds-ui-field ds-notes-form-row">
          <span class="ds-ui-field-label ds-notes-form-label">Destination URL</span>
          <input type="text" class="ds-ui-input ds-notes-form-input" data-btn-url placeholder="https://example.com">
        </div>
      `;

      this._dsOpenInnerDialog({
        title: `Insert ${type.charAt(0).toUpperCase() + type.slice(1)} Button`,
        bodyContent: body,
        onConfirm: (card) => {
          const text = card.querySelector("[data-btn-text]").value.trim() || defaultLabel;
          const rawUrl = card.querySelector("[data-btn-url]").value.trim() || "#";
          const href = rawUrl === "#" || /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;

          let icon = DSIconMarkup("link", { size: 13 });
          if (type === "download") icon = DSIconMarkup("download", { size: 13 });
          else if (type === "view") icon = DSIconMarkup("external-link", { size: 13 });
          else if (type === "read") icon = DSIconMarkup("book-open", { size: 13 });
          else if (type === "github") icon = DSIconMarkup("github", { size: 13 });
          else if (type === "sponsor") icon = DSIconMarkup("heart", { size: 13 });
          else if (type === "plain") icon = DSIconMarkup("square", { size: 13 });

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
        <div class="ds-ui-field ds-notes-form-row">
          <span class="ds-ui-field-label ds-notes-form-label">Root Folder</span>
          <input type="text" class="ds-ui-input ds-notes-form-input" data-folder-root value="ComfyUI/models/checkpoints">
        </div>
        <div class="ds-ui-field ds-notes-form-row">
          <span class="ds-ui-field-label ds-notes-form-label">Target File / Tree Path</span>
          <input type="text" class="ds-ui-input ds-notes-form-input" data-folder-file value="v1-5-pruned-emaonly.safetensors">
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
    <span class="ds-notes-folder-hint-title-text">${DSIconMarkup("folder", { size: 14 })} <span>${rootDir}</span></span>
    <button type="button" class="ds-notes-block-delete-btn" title="Delete folder hint">${DSIconMarkup("x", { size: 12 })}</button>
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
        { type: "server", label: "Discord Server", icon: DSIconMarkup("users", { size: 14 }), title: "Discord Server" },
        { type: "channel", label: "Discord Channel", icon: DSIconMarkup("hash", { size: 14 }), title: "Discord Channel" },
        { type: "invite", label: "Discord Invite", icon: DSIconMarkup("mail", { size: 14 }), title: "Discord Invite" },
      ];

      items.forEach((item) => {
        const row = document.createElement("div");
        row.className = "ds-notes-menu-item";
        row.innerHTML = `<span class="ds-notes-menu-icon">${item.icon}</span> <span>${item.label}</span>`;
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
        <div class="ds-ui-field ds-notes-form-row">
          <span class="ds-ui-field-label ds-notes-form-label">Community / Server Name</span>
          <input type="text" class="ds-ui-input ds-notes-form-input" data-discord-name value="Deathshot Arsenal Community">
        </div>
        <div class="ds-ui-field ds-notes-form-row">
          <span class="ds-ui-field-label ds-notes-form-label">Description / Subtitle</span>
          <input type="text" class="ds-ui-input ds-notes-form-input" data-discord-desc value="Join for workflows, support, and updates">
        </div>
        <div class="ds-ui-field ds-notes-form-row">
          <span class="ds-ui-field-label ds-notes-form-label">Invite URL</span>
          <input type="text" class="ds-ui-input ds-notes-form-input" data-discord-url placeholder="https://discord.gg/...">
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
    <div style="display:flex;align-items:center;gap:6px;">${DSIconMarkup("discord", { size: 14 })} <span>${badgeLabel}</span></div>
    <button type="button" class="ds-notes-block-delete-btn" title="Delete card">${DSIconMarkup("x", { size: 12 })}</button>
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
        <div class="ds-ui-field ds-notes-form-row">
          <span class="ds-ui-field-label ds-notes-form-label">Display Text</span>
          <input type="text" class="ds-ui-input ds-notes-form-input" data-link-text value="${selectedText}">
        </div>
        <div class="ds-ui-field ds-notes-form-row">
          <span class="ds-ui-field-label ds-notes-form-label">Target URL</span>
          <input type="text" class="ds-ui-input ds-notes-form-input" data-link-url placeholder="https://example.com">
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
      const iconNames = [
        { id: "notes", label: "Note" },
        { id: "info", label: "Info" },
        { id: "alert-triangle", label: "Alert" },
        { id: "star", label: "Star" },
        { id: "check", label: "Check" },
        { id: "flame", label: "Flame" },
        { id: "heart", label: "Heart" },
        { id: "zap", label: "Zap" },
        { id: "code", label: "Code" },
        { id: "folder", label: "Folder" },
        { id: "download", label: "Download" },
        { id: "external-link", label: "Link" },
        { id: "youtube", label: "YouTube" },
        { id: "discord", label: "Discord" },
        { id: "globe", label: "Globe" },
        { id: "book-open", label: "Book" },
        { id: "github", label: "GitHub" },
        { id: "lightbulb", label: "Lightbulb" },
        { id: "pin", label: "Pin" },
        { id: "tag", label: "Tag" },
        { id: "palette", label: "Palette" },
      ];

      const iconsList = iconNames.map((item) => ({
        id: item.id,
        label: item.label,
        svg: DSIconMarkup(item.id, { size: 16 }),
      }));

      const container = document.createElement("div");
      container.style.cssText = "display:grid;grid-template-columns:repeat(7,36px);gap:8px;justify-content:center;padding:4px 0;";

      let selectedSvg = iconsList[0].svg;

      iconsList.forEach((item, index) => {
        const tile = document.createElement("button");
        tile.type = "button";
        tile.className = `ds-ui-btn ds-ui-btn-icon-only ${index === 0 ? "is-active" : ""}`;
        tile.title = item.label;
        tile.innerHTML = item.svg;
        tile.addEventListener("click", () => {
          container.querySelectorAll(".ds-ui-btn").forEach((t) => t.classList.remove("is-active"));
          tile.classList.add("is-active");
          selectedSvg = item.svg;
        });
        container.appendChild(tile);
      });

      this._dsOpenInnerDialog({
        title: "Select Document Icon",
        bodyContent: container,
        onConfirm: () => {
          this._dsInsertHTML(`<span class="ds-notes-inline-icon" contenteditable="false">${selectedSvg}</span>&nbsp;`);
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
        <div class="ds-ui-field ds-notes-form-row">
          <span class="ds-ui-field-label ds-notes-form-label">Display Text</span>
          <input type="text" class="ds-ui-input ds-notes-form-input" data-link-text value="${curText}">
        </div>
        <div class="ds-ui-field ds-notes-form-row">
          <span class="ds-ui-field-label ds-notes-form-label">Target URL</span>
          <input type="text" class="ds-ui-input ds-notes-form-input" data-link-url value="${curUrl}">
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
        <div class="ds-ui-field ds-notes-form-row">
          <span class="ds-ui-field-label ds-notes-form-label">Button Text</span>
          <input type="text" class="ds-ui-input ds-notes-form-input" data-btn-text value="${curText}">
        </div>
        <div class="ds-ui-field ds-notes-form-row">
          <span class="ds-ui-field-label ds-notes-form-label">Destination URL</span>
          <input type="text" class="ds-ui-input ds-notes-form-input" data-btn-url value="${curUrl}">
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
      const titleSpan = folderEl.querySelector(".ds-notes-folder-hint-title-text span") || folderEl.querySelector(".ds-notes-folder-hint-title span");
      const treeEl = folderEl.querySelector(".ds-notes-folder-hint-tree");
      const curRoot = titleSpan ? titleSpan.textContent.replace(/^[\uD83D\uDCC1\s]+/, "").trim() : "models";
      const curFile = treeEl ? treeEl.textContent.replace(/^[└─\s]+/, "").trim() : "file.ext";

      const body = `
        <div class="ds-ui-field ds-notes-form-row">
          <span class="ds-ui-field-label ds-notes-form-label">Root Directory</span>
          <input type="text" class="ds-ui-input ds-notes-form-input" data-folder-root value="${curRoot}">
        </div>
        <div class="ds-ui-field ds-notes-form-row">
          <span class="ds-ui-field-label ds-notes-form-label">Target File or Path</span>
          <input type="text" class="ds-ui-input ds-notes-form-input" data-folder-file value="${curFile}">
        </div>
      `;

      this._dsOpenInnerDialog({
        title: "Edit Folder Hint",
        bodyContent: body,
        confirmText: "Update Hint",
        onConfirm: (card) => {
          const rootDir = card.querySelector("[data-folder-root]").value.trim() || curRoot;
          const file = card.querySelector("[data-folder-file]").value.trim() || curFile;
          const titleContainer = folderEl.querySelector(".ds-notes-folder-hint-title");
          if (titleContainer) {
            titleContainer.innerHTML = `
              <span class="ds-notes-folder-hint-title-text">${DSIconMarkup("folder", { size: 14 })} <span>${rootDir}</span></span>
              <button type="button" class="ds-notes-block-delete-btn" title="Delete folder hint">${DSIconMarkup("x", { size: 12 })}</button>
            `;
          }
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
        <div class="ds-ui-field ds-notes-form-row">
          <span class="ds-ui-field-label ds-notes-form-label">YouTube URL</span>
          <input type="text" class="ds-ui-input ds-notes-form-input" data-yt-url value="${curUrl}">
        </div>
        <div class="ds-ui-field ds-notes-form-row">
          <span class="ds-ui-field-label ds-notes-form-label">Video Title</span>
          <input type="text" class="ds-ui-input ds-notes-form-input" data-yt-title value="${curTitle}">
        </div>
        <div class="ds-ui-field ds-notes-form-row">
          <span class="ds-ui-field-label ds-notes-form-label">Subtitle / Description</span>
          <input type="text" class="ds-ui-input ds-notes-form-input" data-yt-desc value="${curDesc}">
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
        <div class="ds-ui-field ds-notes-form-row">
          <span class="ds-ui-field-label ds-notes-form-label">Server / Community Name</span>
          <input type="text" class="ds-ui-input ds-notes-form-input" data-discord-name value="${curName}">
        </div>
        <div class="ds-ui-field ds-notes-form-row">
          <span class="ds-ui-field-label ds-notes-form-label">Description / Subtitle</span>
          <input type="text" class="ds-ui-input ds-notes-form-input" data-discord-desc value="${curDesc}">
        </div>
        <div class="ds-ui-field ds-notes-form-row">
          <span class="ds-ui-field-label ds-notes-form-label">Invite URL</span>
          <input type="text" class="ds-ui-input ds-notes-form-input" data-discord-url value="${curUrl}">
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
      this._dsIsDirty = true;
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
        this._dsIsDirty = true;
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
        this._dsIsDirty = true;
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
