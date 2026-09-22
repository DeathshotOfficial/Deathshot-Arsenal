/**
 * DS Gallery - Frontend Node UI
 * Deathshot Arsenal / DS Node Pack
 */

import { app } from "/scripts/app.js";
import { normalizeDSWidgetHost, protectDSResizeCorners } from "../Shared/ds_ui_system.js";
import { createSlider } from "../Shared/ui/ds_controls.js";

const TYPE = "DS_Gallery";
const EXT_NAME = "DeathshotArsenal.DSGallery";
const PROP_KEY = "ds_gallery";

function hideWidgets(node) {
  if (!node.widgets) return;
  for (const w of node.widgets) {
    if (w?.name === "gallery_ui") continue;
    w.hidden = true;
    w.type = "hidden";
    w.computeSize = () => [0, -4];
    w.draw = () => {};
    if (w.element) {
      w.element.style.display = "none";
      w.element.style.visibility = "hidden";
    }
  }
}

const DEFAULT_SETTINGS = {
  folder_path: "",
  grid_size: "medium", // tiny, small, medium, large, huge
  media_filter: "all", // all, images, videos
  sort_by: "date_desc", // date_desc, date_asc, name_asc, name_desc, size_desc, size_asc
  search_query: "",
  nsfw_enabled: false,
  nsfw_threshold: 0.65,
  sneak_peek: false, // OFF by default: prevents accidental reveals while scrolling or recording
};

const GRID_SIZES = {
  tiny: 80,
  small: 105,
  medium: 135,
  large: 175,
  huge: 230,
};

// Vector Icons
const ICONS = {
  folder: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
  search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  refresh: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`,
  sort: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>`,
  shield: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  play: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`,
  pause: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
  zoomIn: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>`,
  zoomOut: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>`,
  resetZoom: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>`,
  close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  prev: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>`,
  next: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>`,
  volumeUp: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>`,
  volumeMute: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>`,
  fullscreen: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>`,
  fullscreenExit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>`,
  loop: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`,
  backward5: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 19l-9-7 9-7v14z"/><path d="M22 19l-9-7 9-7v14z"/></svg>`,
  forward5: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 19l9-7-9-7v14z"/><path d="M2 19l9-7-9-7v14z"/></svg>`,
  pip: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><rect x="12" y="9" width="8" height="6" rx="1" ry="1"/></svg>`,
  fit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`,
  cover: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`,
  download: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
};

let cssInjected = false;
function injectCSS() {
  if (cssInjected || document.querySelector("link[data-ds-gallery-css]")) return;
  cssInjected = true;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.dataset.dsGalleryCss = "true";
  link.href = new URL("./ds_gallery.css", import.meta.url).href;
  document.head.appendChild(link);
}

function formatDuration(sec) {
  if (!Number.isFinite(sec) || sec < 0) return "00:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// --------------------------------------------------------------------------
// Core Extension Registration
// --------------------------------------------------------------------------
app.registerExtension({
  name: EXT_NAME,

  commands: [
    {
      id: "DeathshotArsenal.DSGallerySettings",
      label: "Settings",
      icon: "ds-actionbar-gear-btn-icon",
      function: () => {
        const c = app.canvas;
        const node = c?.current_node || (c?.selected_nodes && Object.values(c.selected_nodes)[0]);
        if (node && (node.type === TYPE || node.comfyClass === TYPE)) {
          node._toggleGalleryGearPopover?.(node._findToolboxAnchor?.());
        }
      },
    },
  ],

  getSelectionToolboxCommands(item) {
    const type = item?.comfyClass || item?.type;
    if (type === TYPE) {
      return ["DeathshotArsenal.DSGallerySettings"];
    }
    return [];
  },

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== TYPE) return;

    injectCSS();

    const origOnNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      origOnNodeCreated?.apply(this, arguments);

      // Create hidden state widget synchronously for workflow persistence
      this.widgets = this.widgets || [];
      let stateWidget = this.widgets.find((w) => w?.name === "gallery_state");
      if (!stateWidget) {
        stateWidget = this.addWidget("text", "gallery_state", "", () => {}, { hidden: true });
      }
      stateWidget.hidden = true;
      stateWidget.type = "hidden";
      stateWidget.computeSize = () => [0, 0];
      stateWidget.draw = () => {};
      this._stateWidget = stateWidget;

      hideWidgets(this);

      // Node size standards
      this.size = [480, 520];
      this.min_size = [340, 220];

      // Ensure properties state
      this.properties = this.properties || {};
      this.properties[PROP_KEY] = {
        ...DEFAULT_SETTINGS,
        ...(this.properties[PROP_KEY] || {}),
      };

      // Internal states
      this._allFiles = [];
      this._filteredFiles = [];
      this._selectedSet = new Set();
      this._lastSelectedIndex = -1;
      this._currentViewerItem = null;
      this._intersectionObserver = null;
      this._nsfwPolling = null;

      // Belt-and-suspenders: patch instance serialize/configure
      const self = this;
      const origInstSerialize = this.serialize;
      this.serialize = function () {
        self._persistState?.();
        return origInstSerialize ? origInstSerialize.apply(this, arguments) : {};
      };

      const origInstConfigure = this.configure;
      this.configure = function (info) {
        const r = origInstConfigure ? origInstConfigure.apply(this, arguments) : undefined;
        if (info?.size && Array.isArray(info.size)) {
          self.size = [
            Math.max(340, Number(info.size[0]) || 340),
            Math.max(220, Number(info.size[1]) || 220),
          ];
        }
        setTimeout(() => {
          self._restoreState?.(info);
          self._syncGalleryHostHeight?.();
          try { self.setDirtyCanvas?.(true, true); } catch (_) {}
        }, 30);
        return r;
      };

      // Build DOM Gallery Widget
      this._buildGalleryWidget();

      hideWidgets(this);

      // Hook Deathshot Theme
      window.DSGlobalTheme?.applyNodeBase?.(this);
      window.DSGlobalTheme?.subscribe?.(() => {
        this.setDirtyCanvas(true, true);
      });

      // Initial scan if folder is already configured
      if (this.properties[PROP_KEY].folder_path) {
        setTimeout(() => this._scanFolder(), 50);
      }

      registerGalleryGearMenu();
      setTimeout(() => this._syncGalleryHostHeight?.(), 50);
    };

    // Workflow serialize hook
    const origOnSerialize = nodeType.prototype.onSerialize;
    nodeType.prototype.onSerialize = function (info) {
      if (origOnSerialize) origOnSerialize.apply(this, arguments);
      this._persistState();
      if (info && this.properties?.[PROP_KEY]) {
        info.properties = info.properties || {};
        info.properties[PROP_KEY] = this.properties[PROP_KEY];
      }
    };

    // Workflow configure / restore hook
    const origOnConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function (info) {
      const r = origOnConfigure?.apply(this, arguments);
      hideWidgets(this);
      if (info?.size && Array.isArray(info.size)) {
        this.size = [
          Math.max(340, Number(info.size[0]) || 340),
          Math.max(220, Number(info.size[1]) || 220),
        ];
      }
      setTimeout(() => {
        this._restoreState?.(info);
        this._syncGalleryHostHeight?.();
        try { this.setDirtyCanvas?.(true, true); } catch (_) {}
      }, 30);
      return r;
    };

    // Stable computeSize floor so LiteGraph allows shrinking and smooth resizing
    const origComputeSize = nodeType.prototype.computeSize;
    nodeType.prototype.computeSize = function (out) {
      const minW = Math.max(340, this.min_size?.[0] || 340);
      const minH = Math.max(220, this.min_size?.[1] || 220);
      if (Array.isArray(out)) {
        out[0] = minW;
        out[1] = minH;
        return out;
      }
      return [minW, minH];
    };

    // Dynamic widget height computation so DOM widget fills 100% of node body
    nodeType.prototype._getWidgetHeight = function () {
      const nodeH = Math.max(220, Number(this.size?.[1]) || 520);
      const startY = Number.isFinite(this._galleryWidget?.y) && this._galleryWidget.y > 0
        ? this._galleryWidget.y
        : (30 + ((this.inputs?.length || 0) * 20));
      return Math.max(180, Math.floor(nodeH - startY - 4));
    };

    // Node resizing handler
    const origOnResize = nodeType.prototype.onResize;
    nodeType.prototype.onResize = function (size) {
      if (Array.isArray(size)) {
        size[0] = Math.max(340, Number(size[0]) || 340);
        size[1] = Math.max(220, Number(size[1]) || 220);
      }
      if (typeof this._syncGalleryHostHeight === "function") {
        this._syncGalleryHostHeight();
      }
      return origOnResize ? origOnResize.apply(this, arguments) : undefined;
    };

    // Node Context Menu extensions
    const origGetExtraMenuOptions = nodeType.prototype.getExtraMenuOptions;
    nodeType.prototype.getExtraMenuOptions = function (canvas, options) {
      origGetExtraMenuOptions?.apply(this, arguments);
    };

    // ------------------------------------------------------------------------
    // Helper Commands (called by Context Menu, Gear Menu & Shortcuts)
    // ------------------------------------------------------------------------
    nodeType.prototype._setGridSize = function (size) {
      const state = this.properties[PROP_KEY];
      state.grid_size = size;
      this._updateGridSizeCSS();
      this._persistState();
    };

    nodeType.prototype._toggleSneakPeek = function () {
      const state = this.properties[PROP_KEY];
      state.sneak_peek = !state.sneak_peek;
      this._persistState();
      this._updateSneakPeekDOM();
    };

    nodeType.prototype._updateSneakPeekDOM = function () {
      if (this._galleryRoot) {
        this._galleryRoot.dataset.sneakPeek = this.properties[PROP_KEY]?.sneak_peek ? "true" : "false";
      }
    };

    nodeType.prototype._toggleNSFW = async function () {
      const state = this.properties[PROP_KEY];
      state.nsfw_enabled = !state.nsfw_enabled;
      const nsfwToggle = this._galleryRoot?.querySelector("[data-nsfw-toggle]");
      const nsfwPopBtn = this._galleryRoot?.querySelector("[data-btn-nsfw-pop]");
      if (nsfwToggle) nsfwToggle.classList.toggle("is-on", state.nsfw_enabled);
      if (nsfwPopBtn) nsfwPopBtn.classList.toggle("is-active", state.nsfw_enabled);
      this._persistState();

      if (state.nsfw_enabled) {
        await this._checkAndPromptNSFWModel();
        this._autoQueueUnscoredFiles();
      }
      this._applyNSFWBlurToAllCards();
    };

    nodeType.prototype._clearNSFWCache = async function () {
      await fetch("/ds/gallery/clear_cache", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "nsfw" }),
      });
      if (this._allFiles) {
        this._allFiles.forEach((f) => { f.nsfw_score = null; });
      }
      if (this._nsfwPopover) this._nsfwPopover.style.display = "none";
      this._applyNSFWBlurToAllCards();
      if (this.properties[PROP_KEY]?.nsfw_enabled) {
        this._autoQueueUnscoredFiles();
      }
    };

    nodeType.prototype._clearThumbCache = async function () {
      await fetch("/ds/gallery/clear_cache", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "thumbnails" }),
      });
      this._scanFolder();
    };

    // ------------------------------------------------------------------------
    // DOM Widget Construction
    // ------------------------------------------------------------------------
    nodeType.prototype._buildGalleryWidget = function () {
      const state = this.properties[PROP_KEY] || { ...DEFAULT_SETTINGS };
      const root = document.createElement("div");
      root.className = "ds-gallery-root";
      root.dataset.dsThemed = "true";
      root.dataset.sneakPeek = state.sneak_peek ? "true" : "false";

      root.innerHTML = `
        <!-- Header -->
        <div class="ds-gallery-header">
          <div class="ds-gallery-header-left">
            <div class="ds-gallery-brand">DS</div>
            <button type="button" class="ds-gallery-folder-btn" data-folder-btn title="Select local media folder">
              ${ICONS.folder}
              <span data-folder-label>${state.folder_path ? state.folder_path.split(/[\\/]/).pop() || state.folder_path : "Select Folder..."}</span>
            </button>
            <div class="ds-gallery-search-wrap" data-search-wrap>
              <span class="ds-gallery-search-icon">${ICONS.search}</span>
              <input type="text" class="ds-gallery-search-input" data-search-input placeholder="Search files..." value="${state.search_query || ""}" />
              <button type="button" class="ds-gallery-search-clear" data-search-clear title="Clear search">✕</button>
            </div>
          </div>
          <div class="ds-gallery-header-right">
            <button type="button" class="ds-gallery-btn" data-btn-rescan title="Rescan folder">
              ${ICONS.refresh}
            </button>
            <button type="button" class="ds-gallery-btn ${state.nsfw_enabled ? "is-active" : ""}" data-btn-nsfw-pop title="NSFW Protection Settings">
              ${ICONS.shield}
              <span>NSFW</span>
            </button>
          </div>
        </div>

        <!-- Download Banner (Hidden by default) -->
        <div class="ds-gallery-progress-banner" data-progress-banner style="display: none;">
          <div class="ds-gallery-progress-head">
            <span>Downloading NSFW Detector Model...</span>
            <span data-progress-text>0%</span>
          </div>
          <div class="ds-gallery-progress-bar">
            <div class="ds-gallery-progress-fill" data-progress-fill></div>
          </div>
        </div>

        <!-- Toolbar (Filter Chips, Sort, Count) -->
        <div class="ds-gallery-toolbar">
          <div class="ds-gallery-toolbar-left">
            <div class="ds-gallery-chip-group">
              <button type="button" class="ds-gallery-chip ${state.media_filter === "all" ? "is-active" : ""}" data-filter="all">All</button>
              <button type="button" class="ds-gallery-chip ${state.media_filter === "images" ? "is-active" : ""}" data-filter="images">Images</button>
              <button type="button" class="ds-gallery-chip ${state.media_filter === "videos" ? "is-active" : ""}" data-filter="videos">Videos</button>
            </div>
          </div>
          <div class="ds-gallery-toolbar-right">
            <button type="button" class="ds-gallery-btn" data-btn-sort title="Change sort order">
              ${ICONS.sort}
              <span data-sort-label>Sort</span>
            </button>
            <span class="ds-gallery-count-badge" data-count-badge>0 items</span>
          </div>
        </div>

        <!-- Grid Container -->
        <div class="ds-gallery-grid-wrapper">
          <div class="ds-gallery-grid-container" data-grid-container>
            <div class="ds-gallery-grid" data-grid></div>
            <div class="ds-gallery-empty-state" data-empty-state>
              <div class="ds-gallery-empty-icon">${ICONS.folder}</div>
              <div class="ds-gallery-empty-title">No Folder Selected</div>
              <div class="ds-gallery-empty-hint">Click "Select Folder" to browse your images and videos</div>
            </div>
          </div>
        </div>

        <!-- Floating Selection Toolbar -->
        <div class="ds-gallery-selection-bar" data-selection-bar style="display: none;">
          <span class="ds-gallery-selection-count" data-selection-count>0 selected</span>
          <button type="button" class="ds-gallery-btn" data-btn-select-all>Select All</button>
          <button type="button" class="ds-gallery-btn" data-btn-clear-selection>Clear</button>
          <button type="button" class="ds-gallery-btn ds-gallery-btn-danger" data-btn-delete title="Delete selected files">
            ${ICONS.trash}
            <span>Delete</span>
          </button>
        </div>

        <!-- NSFW Settings Popover (Hidden) -->
        <div class="ds-gallery-nsfw-popover" data-nsfw-popover style="display: none;">
          <div class="ds-gallery-nsfw-row">
            <span class="ds-gallery-nsfw-label">NSFW Blur</span>
            <div class="ds-gallery-switch ${state.nsfw_enabled ? "is-on" : ""}" data-nsfw-toggle>
              <div class="ds-gallery-switch-thumb"></div>
            </div>
          </div>
          <div class="ds-gallery-nsfw-slider-wrap" data-slider-wrap></div>
          <button type="button" class="ds-gallery-btn" style="width: 100%; justify-content: center; margin-top: 4px;" data-btn-clear-nsfw>
            Clear NSFW Cache
          </button>
        </div>

        <!-- Dedicated Corner Resize Grip -->
        <div class="ds-gallery-resize-handle" data-resize-handle title="Drag to resize" aria-label="Resize node" role="separator" tabindex="-1">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="21" y1="15" x2="15" y2="21"></line>
            <line x1="21" y1="9" x2="9" y2="21"></line>
            <line x1="21" y1="3" x2="3" y2="21"></line>
          </svg>
        </div>
      `;

      this._galleryRoot = root;
      this._gridEl = root.querySelector("[data-grid]");
      this._emptyStateEl = root.querySelector("[data-empty-state]");
      this._folderBtn = root.querySelector("[data-folder-btn]");
      this._folderLabel = root.querySelector("[data-folder-label]");
      this._searchInput = root.querySelector("[data-search-input]");
      this._searchWrap = root.querySelector("[data-search-wrap]");
      this._countBadge = root.querySelector("[data-count-badge]");
      this._selectionBar = root.querySelector("[data-selection-bar]");
      this._selectionCount = root.querySelector("[data-selection-count]");
      this._nsfwPopover = root.querySelector("[data-nsfw-popover]");
      this._progressBanner = root.querySelector("[data-progress-banner]");
      this._progressFill = root.querySelector("[data-progress-fill]");
      this._progressText = root.querySelector("[data-progress-text]");

      this._bindWidgetEvents();
      this._updateGridSizeCSS();

      // Attach DOM Widget to ComfyUI node
      const widget = this.addDOMWidget("gallery_ui", "custom", root, {
        serialize: false,
        hideOnZoom: false,
        margin: 0,
        getValue: () => null,
        setValue: () => {},
        getMinHeight: () => 180,
        getHeight: () => (typeof this._getWidgetHeight === "function" ? this._getWidgetHeight() : Math.max(180, (Number(this.size?.[1]) || 520) - 54)),
      });
      this._galleryWidget = widget;

      widget.computeLayoutSize = () => ({
        minHeight: 180,
        minWidth: 340,
        height: typeof this._getWidgetHeight === "function" ? this._getWidgetHeight() : 460,
      });

      widget.computeSize = (width) => [
        Math.max(340, Number(width) || this.size?.[0] || 480),
        typeof this._getWidgetHeight === "function" ? this._getWidgetHeight() : Math.max(180, (Number(this.size?.[1]) || 520) - 54),
      ];

      this._syncGalleryHostHeight = () => {
        const widgetH = typeof this._getWidgetHeight === "function" ? this._getWidgetHeight() : Math.max(180, (Number(this.size?.[1]) || 520) - 54);
        if (this._galleryWidget) {
          this._galleryWidget.computedHeight = widgetH;
        }
        if (root) {
          root.style.boxSizing = "border-box";
          root.style.width = "100%";
          root.style.height = `${widgetH}px`;
          root.style.maxHeight = `${widgetH}px`;
          const host = root.parentElement;
          if (host) {
            host.style.height = `${widgetH}px`;
            host.style.maxHeight = `${widgetH}px`;
          }
        }
      };
      this._syncGalleryHostHeight();

      widget.onPointerDown = (pointer) => {
        const e = pointer?.eDown || pointer?.e;
        if (e && this.size) {
          const rect = root.getBoundingClientRect();
          const fromRight = rect.right - e.clientX;
          const fromBottom = rect.bottom - e.clientY;
          if (fromBottom <= 18 || (fromRight <= 22 && fromBottom <= 22)) {
            return false; // Yield to LiteGraph resize handle
          }
        }
        return undefined;
      };

      normalizeDSWidgetHost(root, this, { shell: false });
      protectDSResizeCorners(this);

      setTimeout(() => {
        const host = root.parentElement;
        if (host) {
          host.style.overflow = "hidden";
          host.style.borderRadius = "0 0 8px 8px";
          host.style.background = "transparent";
          host.style.border = "none";
          host.style.boxSizing = "border-box";
        }
        this._syncGalleryHostHeight?.();
      }, 0);

      // Bind node theme
      window.DSGlobalTheme?.bindNode?.(root, this);
    };

    // ------------------------------------------------------------------------
    // Events & Interactivity
    // ------------------------------------------------------------------------
    nodeType.prototype._bindWidgetEvents = function () {
      const root = this._galleryRoot;
      const state = this.properties[PROP_KEY];

      // Folder Selector
      this._folderBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        await this._browseNativeFolder();
      });

      // Rescan button
      root.querySelector("[data-btn-rescan]").addEventListener("click", (e) => {
        e.stopPropagation();
        this._scanFolder();
      });

      // Search input with debounce
      let searchTimer = null;
      this._searchInput.addEventListener("input", (e) => {
        const val = e.target.value;
        this._searchWrap.classList.toggle("has-val", !!val);
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
          state.search_query = val;
          this._applyLocalFiltersAndRender();
        }, 120);
      });

      root.querySelector("[data-search-clear]").addEventListener("click", (e) => {
        e.stopPropagation();
        this._searchInput.value = "";
        this._searchWrap.classList.remove("has-val");
        state.search_query = "";
        this._applyLocalFiltersAndRender();
      });

      // Media Filter Chips
      root.querySelectorAll("[data-filter]").forEach((chip) => {
        chip.addEventListener("click", (e) => {
          e.stopPropagation();
          const f = chip.dataset.filter;
          this._setMediaFilter(f);
        });
      });

      // Sort Menu Button
      root.querySelector("[data-btn-sort]").addEventListener("click", (e) => {
        e.stopPropagation();
        this._openSortMenu(e.currentTarget);
      });

      // NSFW Popover Button
      const nsfwPopBtn = root.querySelector("[data-btn-nsfw-pop]");
      nsfwPopBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const isOpen = this._nsfwPopover.style.display !== "none";
        this._nsfwPopover.style.display = isOpen ? "none" : "flex";
      });

      // Click outside to dismiss NSFW popover
      document.addEventListener("pointerdown", (e) => {
        if (!this._nsfwPopover.contains(e.target) && !nsfwPopBtn.contains(e.target)) {
          this._nsfwPopover.style.display = "none";
        }
      });

      // NSFW Toggle switch
      const nsfwToggle = root.querySelector("[data-nsfw-toggle]");
      nsfwToggle.addEventListener("click", async (e) => {
        e.stopPropagation();
        state.nsfw_enabled = !state.nsfw_enabled;
        nsfwToggle.classList.toggle("is-on", state.nsfw_enabled);
        nsfwPopBtn.classList.toggle("is-active", state.nsfw_enabled);
        this._persistState();

        if (state.nsfw_enabled) {
          await this._checkAndPromptNSFWModel();
        }
        this._applyNSFWBlurToAllCards();
      });

      // NSFW Sensitivity Slider (Deathshot UI System control)
      const sliderWrap = root.querySelector("[data-slider-wrap]");
      if (sliderWrap) {
        sliderWrap.innerHTML = "";
        this._nsfwSlider = createSlider({
          min: 0,
          max: 100,
          step: 1,
          value: Math.round((state.nsfw_threshold ?? 0.65) * 100),
          label: "Sensitivity",
          suffix: "%",
          onChange: (val) => {
            state.nsfw_threshold = val / 100;
            this._persistState();
            this._applyNSFWBlurToAllCards();
          },
        });
        sliderWrap.appendChild(this._nsfwSlider.root);
      }

      // Clear NSFW Cache button
      root.querySelector("[data-btn-clear-nsfw]").addEventListener("click", async (e) => {
        e.stopPropagation();
        await fetch("/ds/gallery/clear_cache", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "nsfw" }),
        });
        if (this._allFiles) {
          this._allFiles.forEach((f) => { f.nsfw_score = null; });
        }
        this._nsfwPopover.style.display = "none";
        this._applyNSFWBlurToAllCards();
      });

      // Selection bar buttons
      root.querySelector("[data-btn-select-all]").addEventListener("click", (e) => {
        e.stopPropagation();
        this._selectAll();
      });

      root.querySelector("[data-btn-clear-selection]").addEventListener("click", (e) => {
        e.stopPropagation();
        this._clearSelection();
      });

      root.querySelector("[data-btn-delete]").addEventListener("click", (e) => {
        e.stopPropagation();
        this._promptDeleteSelection();
      });

      // Dedicated corner resize grip
      const resizeHandle = root.querySelector("[data-resize-handle]");
      if (resizeHandle) {
        resizeHandle.addEventListener("pointerdown", (event) => {
          if (event.button !== undefined && event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();

          resizeHandle.classList.add("is-active");
          try { resizeHandle.setPointerCapture(event.pointerId); } catch (_) {}

          const startX = event.clientX;
          const startY = event.clientY;
          const startW = Number(this.size?.[0]) || 480;
          const startH = Number(this.size?.[1]) || 520;
          const scale = app?.canvas?.ds?.scale || app?.canvas?.scale || 1;

          const onMove = (moveEvent) => {
            const dx = (moveEvent.clientX - startX) / scale;
            const dy = (moveEvent.clientY - startY) / scale;
            const newW = Math.max(340, Math.round(startW + dx));
            const newH = Math.max(220, Math.round(startH + dy));

            if (!this.size) this.size = [startW, startH];
            this.size[0] = newW;
            this.size[1] = newH;

            if (typeof this.onResize === "function") this.onResize(this.size);
            this.setDirtyCanvas?.(true, true);
          };

          const onUp = (upEvent) => {
            resizeHandle.classList.remove("is-active");
            try { resizeHandle.releasePointerCapture(upEvent.pointerId); } catch (_) {}
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            if (typeof this.onResize === "function") this.onResize(this.size);
            this.setDirtyCanvas?.(true, true);
          };

          window.addEventListener("pointermove", onMove);
          window.addEventListener("pointerup", onUp);
        });
      }
    };

    nodeType.prototype._updateGridSizeCSS = function () {
      const state = this.properties[PROP_KEY];
      const sizePx = GRID_SIZES[state.grid_size] || 135;
      this._galleryRoot.style.setProperty("--ds-gallery-item-size", `${sizePx}px`);
    };

    nodeType.prototype._persistState = function () {
      const state = this.properties?.[PROP_KEY];
      if (state) {
        const jsonStr = JSON.stringify(state);
        const stateWidget = this.widgets?.find((w) => w?.name === "gallery_state") || this._stateWidget;
        if (stateWidget) stateWidget.value = jsonStr;

        const fw = this.widgets?.find((w) => w?.name === "folder_path");
        if (fw) fw.value = state.folder_path || "";
      }
      app.graph?.setDirtyCanvas?.(true, true);
    };

    nodeType.prototype._restoreState = function (info) {
      let restored = null;
      const stateWidget = this.widgets?.find((w) => w?.name === "gallery_state") || this._stateWidget;
      if (stateWidget?.value) {
        try {
          restored = JSON.parse(stateWidget.value);
        } catch (_) {}
      }

      if (!restored) {
        restored = info?.properties?.[PROP_KEY] || this.properties?.[PROP_KEY];
      }

      if (restored && typeof restored === "object") {
        this.properties = this.properties || {};
        this.properties[PROP_KEY] = {
          ...DEFAULT_SETTINGS,
          ...restored,
        };
      }

      const state = this.properties[PROP_KEY];

      if (!state.folder_path && this.widgets) {
        const fw = this.widgets.find((w) => w?.name === "folder_path");
        if (fw?.value) state.folder_path = fw.value;
      }

      if (this._folderLabel && state.folder_path) {
        const name = state.folder_path.split(/[\\/]/).pop() || state.folder_path;
        this._folderLabel.textContent = name;
        this._folderBtn.title = state.folder_path;
      }

      if (this._searchInput) {
        this._searchInput.value = state.search_query || "";
        this._searchWrap?.classList.toggle("has-val", !!state.search_query);
      }

      this._galleryRoot?.querySelectorAll("[data-filter]").forEach((chip) => {
        chip.classList.toggle("is-active", chip.dataset.filter === state.media_filter);
      });

      const nsfwToggle = this._galleryRoot?.querySelector("[data-nsfw-toggle]");
      const nsfwPopBtn = this._galleryRoot?.querySelector("[data-btn-nsfw-pop]");
      if (nsfwToggle) nsfwToggle.classList.toggle("is-on", !!state.nsfw_enabled);
      if (nsfwPopBtn) nsfwPopBtn.classList.toggle("is-active", !!state.nsfw_enabled);

      if (this._nsfwSlider) {
        this._nsfwSlider.setValue(Math.round((state.nsfw_threshold ?? 0.65) * 100), false);
      }

      this._updateGridSizeCSS();
      this._updateSneakPeekDOM();
      this._syncGalleryHostHeight?.();
      hideWidgets(this);

      if (state.folder_path) {
        this._scanFolder();
      }
    };

    // ------------------------------------------------------------------------
    // Folder Browsing & Scanning
    // ------------------------------------------------------------------------
    nodeType.prototype._browseNativeFolder = function () {
      return new Promise(async (resolve) => {
        const state = this.properties[PROP_KEY];
        try {
          const resp = await fetch("/ds/gallery/browse_folder", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ initial_dir: state.folder_path || "" }),
          });
          const data = await resp.json();
          if (data.success && data.path) {
            state.folder_path = data.path;
            this._folderLabel.textContent = data.path.split(/[\\/]/).pop() || data.path;
            this._folderBtn.title = data.path;
            this._persistState();
            await this._scanFolder();
          }
          resolve(data);
        } catch (err) {
          console.error("[DS Gallery] Folder selection error:", err);
          resolve(null);
        }
      });
    };

    nodeType.prototype._scanFolder = async function () {
      const state = this.properties[PROP_KEY];
      if (!state.folder_path) {
        this._showEmptyState("No Folder Selected", "Click 'Select Folder' to choose a local directory");
        return;
      }

      this._countBadge.textContent = "Scanning...";

      try {
        const query = new URLSearchParams({
          folder: state.folder_path,
          sort: state.sort_by,
        });
        const resp = await fetch(`/ds/gallery/scan?${query.toString()}`);
        const data = await resp.json();

        if (data.error) {
          this._showEmptyState("Folder Unavailable", `Could not access: ${state.folder_path}`);
          return;
        }

        this._allFiles = data.files || [];
        this._folderLabel.textContent = state.folder_path.split(/[\\/]/).pop() || state.folder_path;
        this._folderBtn.title = state.folder_path;
        this._clearSelection();
        this._applyLocalFiltersAndRender();
      } catch (err) {
        console.error("[DS Gallery] Scan error:", err);
        this._showEmptyState("Scan Failed", String(err));
      }
    };

    nodeType.prototype._showEmptyState = function (title, hint) {
      this._allFiles = [];
      this._filteredFiles = [];
      this._gridEl.innerHTML = "";
      this._emptyStateEl.style.display = "flex";
      this._emptyStateEl.querySelector(".ds-gallery-empty-title").textContent = title;
      this._emptyStateEl.querySelector(".ds-gallery-empty-hint").textContent = hint;
      this._countBadge.textContent = "0 items";
    };

    nodeType.prototype._setMediaFilter = function (filter) {
      const state = this.properties[PROP_KEY];
      state.media_filter = filter;
      this._galleryRoot.querySelectorAll("[data-filter]").forEach((chip) => {
        chip.classList.toggle("is-active", chip.dataset.filter === filter);
      });
      this._persistState();
      this._applyLocalFiltersAndRender();
    };

    nodeType.prototype._setSort = function (sortKey) {
      const state = this.properties[PROP_KEY];
      state.sort_by = sortKey;
      this._persistState();
      this._scanFolder();
    };

    nodeType.prototype._openSortMenu = function (anchorEl) {
      const sortItems = [
        { id: "date_desc", label: "Date: Newest First" },
        { id: "date_asc", label: "Date: Oldest First" },
        { id: "name_asc", label: "Name: A to Z" },
        { id: "name_desc", label: "Name: Z to A" },
        { id: "size_desc", label: "Size: Largest First" },
        { id: "size_asc", label: "Size: Smallest First" },
      ];

      const current = this.properties[PROP_KEY].sort_by;
      const menuEl = document.createElement("div");
      menuEl.className = "ds-ui-menu";
      menuEl.style.position = "fixed";
      menuEl.style.zIndex = "100000";

      sortItems.forEach((item) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `ds-ui-menu-item ${item.id === current ? "is-active" : ""}`;
        btn.textContent = (item.id === current ? "✓ " : "   ") + item.label;
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          menuEl.remove();
          this._setSort(item.id);
        });
        menuEl.appendChild(btn);
      });

      document.body.appendChild(menuEl);
      const r = anchorEl.getBoundingClientRect();
      menuEl.style.top = `${r.bottom + 4}px`;
      menuEl.style.left = `${Math.min(window.innerWidth - 180, r.left)}px`;

      setTimeout(() => {
        const close = (e) => {
          if (!menuEl.contains(e.target)) {
            menuEl.remove();
            document.removeEventListener("pointerdown", close, true);
          }
        };
        document.addEventListener("pointerdown", close, true);
      }, 0);
    };

    nodeType.prototype._applyLocalFiltersAndRender = function () {
      const state = this.properties[PROP_KEY];
      let files = this._allFiles || [];

      // Filter by type
      if (state.media_filter === "images") {
        files = files.filter((f) => f.type === "image");
      } else if (state.media_filter === "videos") {
        files = files.filter((f) => f.type === "video");
      }

      // Filter by search query
      const q = (state.search_query || "").trim().toLowerCase();
      if (q) {
        files = files.filter((f) => f.name.toLowerCase().includes(q));
      }

      this._filteredFiles = files;
      this._countBadge.textContent = `${files.length} item${files.length === 1 ? "" : "s"}`;

      if (files.length === 0) {
        this._showEmptyState("No Matching Files", "No items matched the current filter or search criteria");
      } else {
        this._emptyStateEl.style.display = "none";
        this._renderGrid();
      }
    };

    // ------------------------------------------------------------------------
    // Grid Rendering with Lazy-Loading
    // ------------------------------------------------------------------------
    nodeType.prototype._renderGrid = function () {
      this._gridEl.innerHTML = "";
      const state = this.properties[PROP_KEY];

      // Disconnect old observer
      if (this._intersectionObserver) {
        this._intersectionObserver.disconnect();
      }

      // Intersection Observer for lazy loading thumbnails
      this._intersectionObserver = new IntersectionObserver(
        (entries, observer) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const imgEl = entry.target.querySelector("[data-thumb-img]");
              if (imgEl && !imgEl.src) {
                const src = imgEl.dataset.src;
                if (src) {
                  imgEl.src = src;
                  imgEl.onload = () => {
                    entry.target.classList.remove("is-loading");
                  };
                  imgEl.onerror = () => {
                    imgEl.style.opacity = "0.3";
                  };
                }
              }

              // Evaluate NSFW score in background if not already known (high-priority for visible viewport)
              const fullPath = entry.target.dataset.path;
              const item = this._filteredFiles?.find((f) => f.full_path === fullPath);
              if (state.nsfw_enabled && item && typeof item.nsfw_score !== "number") {
                this._queueNSFWEval(fullPath, true);
              }

              observer.unobserve(entry.target);
            }
          });
        },
        { root: this._gridEl.parentElement, rootMargin: "150px" }
      );

      const frag = document.createDocumentFragment();

      this._filteredFiles.forEach((item, index) => {
        const itemEl = document.createElement("div");
        itemEl.className = "ds-gallery-item";
        itemEl.dataset.index = index;
        itemEl.dataset.path = item.full_path;

        if (this._selectedSet.has(item.full_path)) {
          itemEl.classList.add("is-selected");
        }

        const isNSFW = Boolean(
          state.nsfw_enabled &&
          typeof item.nsfw_score === "number" &&
          item.nsfw_score >= (state.nsfw_threshold ?? 0.65)
        );
        if (isNSFW) {
          itemEl.classList.add("is-nsfw-blurred");
        }

        // Clean cached thumbnail request URL
        const thumbUrl = `/ds/gallery/thumbnail?path=${encodeURIComponent(item.full_path)}&mtime=${item.mtime}`;

        itemEl.innerHTML = `
          <div class="ds-gallery-thumb-wrap">
            <img class="ds-gallery-thumb-img" data-thumb-img data-src="${thumbUrl}" alt="${item.name}" />
            ${isNSFW ? `<div class="ds-gallery-nsfw-badge">NSFW</div>` : ""}
            ${item.type === "video" ? `<div class="ds-gallery-video-badge">${ICONS.play}</div>` : ""}
            <div class="ds-gallery-select-pill">${ICONS.check}</div>
          </div>
          <div class="ds-gallery-item-footer">
            <span class="ds-gallery-item-name" title="${item.name}">${item.name}</span>
          </div>
        `;

        // Item click handler (selection + lightbox/video viewer)
        itemEl.addEventListener("click", (e) => {
          e.stopPropagation();
          this._handleItemClick(item, index, e);
        });

        // Double click opens fullscreen directly
        itemEl.addEventListener("dblclick", (e) => {
          e.stopPropagation();
          this._openViewer(item);
        });

        frag.appendChild(itemEl);
        this._intersectionObserver.observe(itemEl);
      });

      this._gridEl.appendChild(frag);
      if (state.nsfw_enabled) {
        this._autoQueueUnscoredFiles();
      }
    };

    // ------------------------------------------------------------------------
    // Selection Management
    // ------------------------------------------------------------------------
    nodeType.prototype._handleItemClick = function (item, index, event) {
      if (event.ctrlKey || event.metaKey) {
        // Toggle single item
        if (this._selectedSet.has(item.full_path)) {
          this._selectedSet.delete(item.full_path);
        } else {
          this._selectedSet.add(item.full_path);
        }
        this._lastSelectedIndex = index;
      } else if (event.shiftKey && this._lastSelectedIndex >= 0) {
        // Range select
        const start = Math.min(this._lastSelectedIndex, index);
        const end = Math.max(this._lastSelectedIndex, index);
        for (let i = start; i <= end; i++) {
          if (this._filteredFiles[i]) {
            this._selectedSet.add(this._filteredFiles[i].full_path);
          }
        }
      } else {
        // If clicking already selected item or directly clicking to view
        if (this._selectedSet.size <= 1 && this._selectedSet.has(item.full_path)) {
          this._openViewer(item);
          return;
        }
        this._selectedSet.clear();
        this._selectedSet.add(item.full_path);
        this._lastSelectedIndex = index;
      }

      this._updateSelectionUI();
    };

    nodeType.prototype._selectAll = function () {
      this._filteredFiles.forEach((f) => this._selectedSet.add(f.full_path));
      this._updateSelectionUI();
    };

    nodeType.prototype._clearSelection = function () {
      this._selectedSet.clear();
      this._lastSelectedIndex = -1;
      this._updateSelectionUI();
    };

    nodeType.prototype._updateSelectionUI = function () {
      const count = this._selectedSet.size;

      // Update grid cards
      this._gridEl.querySelectorAll(".ds-gallery-item").forEach((el) => {
        const isSel = this._selectedSet.has(el.dataset.path);
        el.classList.toggle("is-selected", isSel);
      });

      // Show/hide floating selection toolbar
      if (count > 0) {
        this._selectionBar.style.display = "flex";
        this._selectionCount.textContent = `${count} selected`;
      } else {
        this._selectionBar.style.display = "none";
      }
    };

    // ------------------------------------------------------------------------
    // Deletion Dialog
    // ------------------------------------------------------------------------
    nodeType.prototype._promptDeleteSelection = function () {
      const filesToDelete = Array.from(this._selectedSet);
      if (filesToDelete.length === 0) return;

      const overlay = document.createElement("div");
      overlay.className = "ds-gallery-dialog-overlay";

      overlay.innerHTML = `
        <div class="ds-gallery-dialog-card">
          <div class="ds-gallery-dialog-title">Delete ${filesToDelete.length} File${filesToDelete.length === 1 ? "" : "s"}?</div>
          <div class="ds-gallery-dialog-msg">
            This will permanently delete the selected file${filesToDelete.length === 1 ? "" : "s"} from your storage drive. This operation cannot be undone.
          </div>
          <div class="ds-gallery-dialog-foot">
            <button type="button" class="ds-gallery-btn" data-cancel>Cancel</button>
            <button type="button" class="ds-gallery-btn ds-gallery-btn-danger" data-confirm>Delete</button>
          </div>
        </div>
      `;

      const close = () => overlay.remove();
      overlay.querySelector("[data-cancel]").addEventListener("click", close);

      overlay.querySelector("[data-confirm]").addEventListener("click", async () => {
        close();
        try {
          const resp = await fetch("/ds/gallery/delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ files: filesToDelete }),
          });
          const res = await resp.json();
          this._clearSelection();
          await this._scanFolder();
        } catch (err) {
          console.error("[DS Gallery] Deletion error:", err);
        }
      });

      document.body.appendChild(overlay);
    };

    // ------------------------------------------------------------------------
    // NSFW Model Auto-Download Verification
    // ------------------------------------------------------------------------
    nodeType.prototype._checkAndPromptNSFWModel = async function () {
      try {
        const resp = await fetch("/ds/gallery/nsfw/status");
        const status = await resp.json();

        if (status.model_available) return;

        // Model not present; trigger download and display progress banner
        this._progressBanner.style.display = "flex";
        this._progressFill.style.width = "0%";
        this._progressText.textContent = "Connecting...";

        await fetch("/ds/gallery/nsfw/download", { method: "POST" });

        // Poll progress until complete
        clearInterval(this._nsfwPolling);
        this._nsfwPolling = setInterval(async () => {
          const sResp = await fetch("/ds/gallery/nsfw/status");
          const s = await sResp.json();

          if (s.is_downloading) {
            this._progressFill.style.width = `${s.download_progress}%`;
            this._progressText.textContent = `${s.download_progress}%`;
          } else {
            clearInterval(this._nsfwPolling);
            this._progressBanner.style.display = "none";
            if (s.model_available) {
              this._renderGrid();
            } else if (s.download_error) {
              alert(`NSFW model download failed: ${s.download_error}`);
            }
          }
        }, 600);
      } catch (err) {
        console.error("[DS Gallery] NSFW status check failed:", err);
      }
    };

    // ------------------------------------------------------------------------
    // NSFW Batch Evaluation & Instant DOM Blur Updates (Dual-Priority Queue)
    // ------------------------------------------------------------------------
    nodeType.prototype._queueNSFWEval = function (path, isHighPriority = false) {
      if (!path) return;
      this._nsfwEvalHighQueue = this._nsfwEvalHighQueue || new Set();
      this._nsfwEvalLowQueue = this._nsfwEvalLowQueue || new Set();
      this._nsfwEvalPending = this._nsfwEvalPending || new Set();

      if (this._nsfwEvalPending.has(path)) return;

      if (isHighPriority) {
        this._nsfwEvalLowQueue.delete(path);
        this._nsfwEvalHighQueue.add(path);
      } else if (!this._nsfwEvalHighQueue.has(path)) {
        this._nsfwEvalLowQueue.add(path);
      }

      clearTimeout(this._nsfwEvalTimer);
      this._nsfwEvalTimer = setTimeout(() => {
        this._flushNSFWEvalQueue();
      }, isHighPriority ? 25 : 90);
    };

    nodeType.prototype._flushNSFWEvalQueue = async function () {
      this._nsfwEvalHighQueue = this._nsfwEvalHighQueue || new Set();
      this._nsfwEvalLowQueue = this._nsfwEvalLowQueue || new Set();
      this._nsfwEvalPending = this._nsfwEvalPending || new Set();

      if (this._nsfwEvalHighQueue.size === 0 && this._nsfwEvalLowQueue.size === 0) return;

      const batch = [];
      // Pull viewport/high-priority items first
      for (const p of this._nsfwEvalHighQueue) {
        batch.push(p);
        this._nsfwEvalHighQueue.delete(p);
        this._nsfwEvalPending.add(p);
        if (batch.length >= 24) break;
      }
      // Fill remainder with off-screen background items
      if (batch.length < 24) {
        for (const p of this._nsfwEvalLowQueue) {
          batch.push(p);
          this._nsfwEvalLowQueue.delete(p);
          this._nsfwEvalPending.add(p);
          if (batch.length >= 24) break;
        }
      }

      if (batch.length === 0) return;

      try {
        const resp = await fetch("/ds/gallery/nsfw/eval_batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paths: batch }),
        });
        const data = await resp.json();
        const scores = data.scores || {};

        for (const [path, score] of Object.entries(scores)) {
          if (typeof score === "number") {
            const item = this._allFiles?.find((f) => f.full_path === path);
            if (item) item.nsfw_score = score;
            const filteredItem = this._filteredFiles?.find((f) => f.full_path === path);
            if (filteredItem) filteredItem.nsfw_score = score;

            this._updateCardNSFW(path, score);
          }
        }
      } catch (err) {
        console.error("[DS Gallery] NSFW batch eval error:", err);
      } finally {
        // Guarantee pending paths are freed so temporary network drops never deadlock the session
        batch.forEach((p) => this._nsfwEvalPending.delete(p));
      }

      if (this._nsfwEvalHighQueue.size > 0 || this._nsfwEvalLowQueue.size > 0) {
        setTimeout(() => this._flushNSFWEvalQueue(), 15);
      }
    };

    nodeType.prototype._findCardByPath = function (path) {
      if (!this._gridEl) return null;
      for (const card of this._gridEl.children) {
        if (card.dataset?.path === path) return card;
      }
      return null;
    };

    nodeType.prototype._autoQueueUnscoredFiles = function () {
      const state = this.properties[PROP_KEY];
      if (!state.nsfw_enabled || !this._filteredFiles) return;

      // Queue visible cards with high priority first
      if (this._gridEl) {
        const visibleCards = this._gridEl.querySelectorAll(".ds-gallery-item");
        visibleCards.forEach((card) => {
          const p = card.dataset.path;
          const item = this._filteredFiles.find((f) => f.full_path === p);
          if (item && typeof item.nsfw_score !== "number") {
            this._queueNSFWEval(p, true);
          }
        });
      }

      for (const item of this._filteredFiles) {
        if (typeof item.nsfw_score !== "number") {
          this._queueNSFWEval(item.full_path, false);
        }
      }
    };

    nodeType.prototype._updateCardNSFW = function (path, score) {
      const card = this._findCardByPath(path);
      if (!card) return;

      const state = this.properties[PROP_KEY];
      const thresh = Number(state.nsfw_threshold ?? 0.65);
      const isBlurred = Boolean(state.nsfw_enabled && typeof score === "number" && score >= thresh);

      card.classList.toggle("is-nsfw-blurred", isBlurred);
      let badge = card.querySelector(".ds-gallery-nsfw-badge");
      if (isBlurred) {
        if (!badge) {
          badge = document.createElement("div");
          badge.className = "ds-gallery-nsfw-badge";
          badge.textContent = "NSFW";
          card.querySelector(".ds-gallery-thumb-wrap")?.appendChild(badge);
        }
      } else if (badge) {
        badge.remove();
      }
    };

    nodeType.prototype._applyNSFWBlurToAllCards = function () {
      const state = this.properties[PROP_KEY];
      const enabled = Boolean(state.nsfw_enabled);
      const thresh = Number(state.nsfw_threshold ?? 0.65);

      const cards = this._gridEl?.querySelectorAll(".ds-gallery-item");
      if (!cards) return;

      cards.forEach((card) => {
        const fullPath = card.dataset.path;
        const item = this._filteredFiles?.find((f) => f.full_path === fullPath);
        if (!item) return;

        let isBlurred = false;
        if (enabled) {
          if (typeof item.nsfw_score === "number") {
            isBlurred = item.nsfw_score >= thresh;
          } else {
            this._queueNSFWEval(fullPath);
          }
        }

        card.classList.toggle("is-nsfw-blurred", isBlurred);

        let badge = card.querySelector(".ds-gallery-nsfw-badge");
        if (isBlurred) {
          if (!badge) {
            badge = document.createElement("div");
            badge.className = "ds-gallery-nsfw-badge";
            badge.textContent = "NSFW";
            card.querySelector(".ds-gallery-thumb-wrap")?.appendChild(badge);
          }
        } else if (badge) {
          badge.remove();
        }
      });
    };

    // ------------------------------------------------------------------------
    // Fullscreen Viewers (Lightbox & Custom Video Player)
    // ------------------------------------------------------------------------
    nodeType.prototype._openViewer = function (item) {
      if (item.type === "video") {
        this._openVideoPlayer(item);
      } else {
        this._openLightbox(item);
      }
    };

    nodeType.prototype._getEligibleIndex = function (item) {
      return this._filteredFiles.findIndex((f) => f.full_path === item.full_path);
    };

    // --- Fullscreen Lightbox Image Viewer ---
    nodeType.prototype._openLightbox = function (initialItem) {
      document.querySelector(".ds-gallery-lightbox")?.remove();

      let currentIndex = this._getEligibleIndex(initialItem);
      let currentItem = initialItem;
      let zoomScale = 1.0;
      let panX = 0;
      let panY = 0;
      let isPanning = false;
      let startX = 0;
      let startY = 0;

      const overlay = document.createElement("div");
      overlay.className = "ds-gallery-lightbox";
      overlay.dataset.dsThemed = "true";

      overlay.innerHTML = `
        <div class="ds-gallery-lightbox-header">
          <div class="ds-gallery-lightbox-title" data-title>${currentItem.name}</div>
          <div class="ds-gallery-lightbox-actions">
            <button type="button" class="ds-gallery-btn" data-zoom-out title="Zoom Out (-)">${ICONS.zoomOut}</button>
            <button type="button" class="ds-gallery-btn" data-zoom-reset title="Reset Zoom (0)">${ICONS.resetZoom}</button>
            <button type="button" class="ds-gallery-btn" data-zoom-in title="Zoom In (+)">${ICONS.zoomIn}</button>
            <span style="font-size: 11px; color: var(--ds-accent); font-weight: 700; width: 42px; text-align: center;" data-zoom-pct>100%</span>
            <button type="button" class="ds-gallery-btn" data-close title="Close (Esc)">${ICONS.close}</button>
          </div>
        </div>
        <div class="ds-gallery-lightbox-viewport" data-viewport>
          <img class="ds-gallery-lightbox-img" data-img src="/ds/gallery/media?path=${encodeURIComponent(currentItem.full_path)}" alt="${currentItem.name}" />
          <button type="button" class="ds-gallery-lightbox-nav ds-gallery-lightbox-prev" data-prev title="Previous (←)">${ICONS.prev}</button>
          <button type="button" class="ds-gallery-lightbox-nav ds-gallery-lightbox-next" data-next title="Next (→)">${ICONS.next}</button>
        </div>
      `;

      const imgEl = overlay.querySelector("[data-img]");
      const titleEl = overlay.querySelector("[data-title]");
      const zoomPctEl = overlay.querySelector("[data-zoom-pct]");
      const viewport = overlay.querySelector("[data-viewport]");

      const updateTransform = () => {
        imgEl.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomScale})`;
        zoomPctEl.textContent = `${Math.round(zoomScale * 100)}%`;
      };

      const resetZoom = () => {
        zoomScale = 1.0;
        panX = 0;
        panY = 0;
        updateTransform();
      };

      const setZoom = (newScale) => {
        zoomScale = Math.max(0.5, Math.min(6.0, newScale));
        if (zoomScale <= 1.0) {
          panX = 0;
          panY = 0;
        }
        updateTransform();
      };

      const navigate = (delta) => {
        const nextIdx = currentIndex + delta;
        if (nextIdx >= 0 && nextIdx < this._filteredFiles.length) {
          currentIndex = nextIdx;
          currentItem = this._filteredFiles[currentIndex];
          if (currentItem.type === "video") {
            overlay.remove();
            this._openVideoPlayer(currentItem);
            return;
          }
          titleEl.textContent = currentItem.name;
          imgEl.src = `/ds/gallery/media?path=${encodeURIComponent(currentItem.full_path)}`;
          resetZoom();
        }
      };

      // Zoom Controls
      overlay.querySelector("[data-zoom-in]").addEventListener("click", () => setZoom(zoomScale * 1.25));
      overlay.querySelector("[data-zoom-out]").addEventListener("click", () => setZoom(zoomScale / 1.25));
      overlay.querySelector("[data-zoom-reset]").addEventListener("click", resetZoom);
      overlay.querySelector("[data-close]").addEventListener("click", () => {
        overlay.remove();
        document.removeEventListener("keydown", keyHandler);
      });

      overlay.querySelector("[data-prev]").addEventListener("click", (e) => {
        e.stopPropagation();
        navigate(-1);
      });
      overlay.querySelector("[data-next]").addEventListener("click", (e) => {
        e.stopPropagation();
        navigate(1);
      });

      // Mouse Wheel Zoom
      viewport.addEventListener("wheel", (e) => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.15 : 0.85;
        setZoom(zoomScale * factor);
      }, { passive: false });

      // Drag to Pan
      viewport.addEventListener("pointerdown", (e) => {
        if (zoomScale > 1.0) {
          isPanning = true;
          startX = e.clientX - panX;
          startY = e.clientY - panY;
          viewport.classList.add("is-panning");
        }
      });

      window.addEventListener("pointermove", (e) => {
        if (isPanning) {
          panX = e.clientX - startX;
          panY = e.clientY - startY;
          updateTransform();
        }
      });

      window.addEventListener("pointerup", () => {
        isPanning = false;
        viewport.classList.remove("is-panning");
      });

      // Keyboard Controls
      const keyHandler = (e) => {
        if (e.key === "Escape") {
          overlay.remove();
          document.removeEventListener("keydown", keyHandler);
        } else if (e.key === "ArrowLeft") {
          navigate(-1);
        } else if (e.key === "ArrowRight") {
          navigate(1);
        } else if (e.key === "+" || e.key === "=") {
          setZoom(zoomScale * 1.25);
        } else if (e.key === "-") {
          setZoom(zoomScale / 1.25);
        } else if (e.key === "0") {
          resetZoom();
        }
      };
      document.addEventListener("keydown", keyHandler);

      document.body.appendChild(overlay);
    };

    // --- Custom Fullscreen Video Player (NO NATIVE CONTROLS) ---
    nodeType.prototype._openVideoPlayer = function (initialItem) {
      document.querySelector(".ds-gallery-player-modal")?.remove();

      let currentIndex = this._getEligibleIndex(initialItem);
      let currentItem = initialItem;
      let isLooping = false;
      try {
        isLooping = localStorage.getItem("ds_gallery_video_loop") === "1";
      } catch (_) {}
      let isCover = false;
      let prevVolume = 1.0;
      let hideTimeout = null;
      let isScrubbing = false;
      let wasPlayingBeforeScrub = false;
      let pendingSeekPct = null;
      let isSeekingVideo = false;
      let animFrameId = null;

      const overlay = document.createElement("div");
      overlay.className = "ds-gallery-player-modal";

      // Inherit active Deathshot theme variables onto overlay
      try {
        const nodeEl = this.rootEl || this.dom || document.querySelector(".ds-gallery-root[data-ds-themed='true']");
        if (nodeEl) {
          const computed = window.getComputedStyle(nodeEl);
          const vars = [
            "--ds-accent",
            "--ds-accent-rgb",
            "--ds-panel",
            "--ds-panel-2",
            "--ds-border",
            "--ds-hover",
            "--ds-active",
            "--ds-font",
            "--ds-font-family",
          ];
          for (const v of vars) {
            const val = computed.getPropertyValue(v)?.trim();
            if (val) overlay.style.setProperty(v, val);
          }
        }
        if (window.DSGlobalTheme) {
          const cfg = window.DSGlobalTheme.getConfig?.();
          const theme = window.DSGlobalTheme.getTheme?.(cfg?.theme);
          if (theme?.vars) {
            Object.entries(theme.vars).forEach(([k, v]) => overlay.style.setProperty(k, v));
          }
        }
      } catch (_) {}

      overlay.innerHTML = `
        <div class="ds-gallery-player-header" data-header>
          <div class="ds-gallery-player-header-left">
            <span class="ds-gallery-player-badge" data-counter>${currentIndex + 1} / ${this._filteredFiles.length}</span>
            <span class="ds-gallery-player-title" data-title title="${currentItem.name}">${currentItem.name}</span>
          </div>
          <div class="ds-gallery-player-header-right">
            <button type="button" class="ds-gallery-player-btn" data-btn-fit title="Aspect Ratio: Fit / Fill (C)">
              ${ICONS.fit}
            </button>
            <button type="button" class="ds-gallery-player-btn" data-btn-pip title="Picture-in-Picture (P)">
              ${ICONS.pip}
            </button>
            <a class="ds-gallery-player-btn" data-btn-download download="${currentItem.name}" href="/ds/gallery/media?path=${encodeURIComponent(currentItem.full_path)}" title="Download Video">
              ${ICONS.download}
            </a>
            <button type="button" class="ds-gallery-player-btn ds-gallery-player-btn-close" data-close title="Close (Esc)">
              ${ICONS.close}
            </button>
          </div>
        </div>

        <div class="ds-gallery-player-viewport" data-viewport>
          <video class="ds-gallery-player-video" data-video playsinline preload="auto"></video>
          <div class="ds-gallery-player-splash" data-splash>
            ${ICONS.play}
          </div>
          <button type="button" class="ds-gallery-player-nav ds-gallery-player-prev" data-prev title="Previous Video (Shift+←)">${ICONS.prev}</button>
          <button type="button" class="ds-gallery-player-nav ds-gallery-player-next" data-next title="Next Video (Shift+→)">${ICONS.next}</button>
        </div>

        <div class="ds-gallery-player-controls-wrap" data-controls-wrap>
          <div class="ds-gallery-player-scrubber-zone" data-scrubber-zone>
            <div class="ds-gallery-player-tooltip" data-scrubber-tooltip>00:00</div>
            <div class="ds-gallery-player-timeline" data-timeline>
              <div class="ds-gallery-player-buffered" data-buffered></div>
              <div class="ds-gallery-player-fill" data-fill>
                <div class="ds-gallery-player-thumb"></div>
              </div>
            </div>
          </div>

          <div class="ds-gallery-player-bar">
            <div class="ds-gallery-player-bar-left">
              <button type="button" class="ds-gallery-player-btn ds-gallery-player-btn-play" data-btn-play title="Play / Pause (Space)">
                ${ICONS.play}
              </button>
              <button type="button" class="ds-gallery-player-btn" data-btn-seek-back title="Rewind 5s (←)">
                ${ICONS.backward5}
              </button>
              <button type="button" class="ds-gallery-player-btn" data-btn-seek-fwd title="Forward 5s (→)">
                ${ICONS.forward5}
              </button>
              <div class="ds-gallery-player-time">
                <span data-time-cur class="ds-gallery-time-current">00:00</span>
                <span class="ds-gallery-time-sep">/</span>
                <span data-time-dur class="ds-gallery-time-total">00:00</span>
              </div>
            </div>

            <div class="ds-gallery-player-bar-right">
              <div class="ds-gallery-player-vol-group">
                <button type="button" class="ds-gallery-player-btn" data-btn-mute title="Mute / Unmute (M)">
                  ${ICONS.volumeUp}
                </button>
                <input type="range" class="ds-gallery-player-vol-slider" data-vol-slider min="0" max="1" step="0.05" value="1" title="Volume (↑/↓)">
              </div>

              <button type="button" class="ds-gallery-player-btn ${isLooping ? 'is-active' : ''}" data-btn-loop title="${isLooping ? 'Loop: On (L)' : 'Loop: Off (L)'}">
                ${ICONS.loop}
                <span style="font-size:10px;margin-left:2px;font-weight:700;">Loop</span>
              </button>

              <div class="ds-gallery-player-speed-wrap" data-speed-wrap>
                <button type="button" class="ds-gallery-player-btn" data-speed-btn title="Playback Speed">1.0x</button>
                <div class="ds-gallery-player-speed-menu" data-speed-menu>
                  <div class="ds-gallery-player-speed-item" data-speed="0.25">0.25x</div>
                  <div class="ds-gallery-player-speed-item" data-speed="0.5">0.5x</div>
                  <div class="ds-gallery-player-speed-item" data-speed="0.75">0.75x</div>
                  <div class="ds-gallery-player-speed-item active" data-speed="1.0">1.0x</div>
                  <div class="ds-gallery-player-speed-item" data-speed="1.25">1.25x</div>
                  <div class="ds-gallery-player-speed-item" data-speed="1.5">1.5x</div>
                  <div class="ds-gallery-player-speed-item" data-speed="2.0">2.0x</div>
                </div>
              </div>

              <button type="button" class="ds-gallery-player-btn" data-btn-fullscreen title="Toggle Fullscreen (F)">
                ${ICONS.fullscreen}
              </button>
            </div>
          </div>
        </div>
      `;

      const video = overlay.querySelector("[data-video]");
      const playBtn = overlay.querySelector("[data-btn-play]");
      const muteBtn = overlay.querySelector("[data-btn-mute]");
      const volSlider = overlay.querySelector("[data-vol-slider]");
      const timeCur = overlay.querySelector("[data-time-cur]");
      const timeDur = overlay.querySelector("[data-time-dur]");
      const scrubberZone = overlay.querySelector("[data-scrubber-zone]");
      const scrubberTooltip = overlay.querySelector("[data-scrubber-tooltip]");
      const timeline = overlay.querySelector("[data-timeline]");
      const fill = overlay.querySelector("[data-fill]");
      const buffered = overlay.querySelector("[data-buffered]");
      const titleEl = overlay.querySelector("[data-title]");
      const counterEl = overlay.querySelector("[data-counter]");
      const fitBtn = overlay.querySelector("[data-btn-fit]");
      const pipBtn = overlay.querySelector("[data-btn-pip]");
      const downloadBtn = overlay.querySelector("[data-btn-download]");
      const loopBtn = overlay.querySelector("[data-btn-loop]");
      const seekBackBtn = overlay.querySelector("[data-btn-seek-back]");
      const seekFwdBtn = overlay.querySelector("[data-btn-seek-fwd]");
      const speedWrap = overlay.querySelector("[data-speed-wrap]");
      const speedBtn = overlay.querySelector("[data-speed-btn]");
      const speedMenu = overlay.querySelector("[data-speed-menu]");
      const fullscreenBtn = overlay.querySelector("[data-btn-fullscreen]");
      const splashEl = overlay.querySelector("[data-splash]");
      const viewport = overlay.querySelector("[data-viewport]");
      const headerEl = overlay.querySelector("[data-header]");
      const controlsWrap = overlay.querySelector("[data-controls-wrap]");

      // Smooth RAF progress loop for continuous timeline glide
      const syncProgressUI = (curTime, durTime) => {
        const cur = Number.isFinite(curTime) ? curTime : video.currentTime || 0;
        const dur = Number.isFinite(durTime) ? durTime : video.duration || 1;
        const pct = dur > 0 ? Math.max(0, Math.min(100, (cur / dur) * 100)) : 0;
        fill.style.width = `${pct}%`;
        timeCur.textContent = formatDuration(cur);
        if (Number.isFinite(video.duration) && video.duration > 0) {
          timeDur.textContent = formatDuration(video.duration);
        }
      };

      const renderPlayProgress = () => {
        if (!isScrubbing && !video.paused && !video.ended) {
          syncProgressUI();
          animFrameId = requestAnimationFrame(renderPlayProgress);
        } else {
          animFrameId = null;
        }
      };

      const startProgressLoop = () => {
        if (!animFrameId && !isScrubbing && !video.paused && !video.ended) {
          animFrameId = requestAnimationFrame(renderPlayProgress);
        }
      };

      const stopProgressLoop = () => {
        if (animFrameId) {
          cancelAnimationFrame(animFrameId);
          animFrameId = null;
        }
      };

      // Auto-hide controls timer
      const resetHideTimer = () => {
        overlay.classList.remove("is-inactive");
        clearTimeout(hideTimeout);
        if (isScrubbing) return;
        if (!video.paused) {
          hideTimeout = setTimeout(() => {
            if (!isScrubbing) {
              overlay.classList.add("is-inactive");
            }
          }, 2400);
        }
      };

      overlay.addEventListener("pointermove", resetHideTimer);
      overlay.addEventListener("pointerdown", resetHideTimer);

      headerEl.addEventListener("pointerenter", () => {
        clearTimeout(hideTimeout);
        overlay.classList.remove("is-inactive");
      });
      headerEl.addEventListener("pointerleave", resetHideTimer);

      controlsWrap.addEventListener("pointerenter", () => {
        clearTimeout(hideTimeout);
        overlay.classList.remove("is-inactive");
      });
      controlsWrap.addEventListener("pointerleave", resetHideTimer);

      const showSplash = (isPlay) => {
        if (!splashEl) return;
        splashEl.innerHTML = isPlay ? ICONS.play : ICONS.pause;
        splashEl.classList.remove("is-splashing");
        void splashEl.offsetWidth;
        splashEl.classList.add("is-splashing");
        setTimeout(() => splashEl.classList.remove("is-splashing"), 320);
      };

      const loadVideo = (f) => {
        stopProgressLoop();
        currentItem = f;
        titleEl.textContent = f.name;
        titleEl.title = f.name;
        counterEl.textContent = `${currentIndex + 1} / ${this._filteredFiles.length}`;
        const url = `/ds/gallery/media?path=${encodeURIComponent(f.full_path)}`;
        downloadBtn.href = url;
        downloadBtn.download = f.name;
        video.src = url;
        video.loop = isLooping;
        fill.style.width = "0%";
        buffered.style.width = "0%";
        timeCur.textContent = "00:00";
        timeDur.textContent = "00:00";
        video.play().catch(() => {});
        resetHideTimer();
      };

      const togglePlay = () => {
        if (video.paused) {
          video.play();
          showSplash(true);
        } else {
          video.pause();
          showSplash(false);
        }
      };

      // Loop toggle logic
      const updateLoopState = () => {
        video.loop = isLooping;
        loopBtn.classList.toggle("is-active", isLooping);
        loopBtn.title = isLooping ? "Loop: On (L)" : "Loop: Off (L)";
        try {
          localStorage.setItem("ds_gallery_video_loop", isLooping ? "1" : "0");
        } catch (_) {}
      };
      updateLoopState();

      loopBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        isLooping = !isLooping;
        updateLoopState();
        resetHideTimer();
      });

      // Fit / Cover aspect ratio toggle
      fitBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        isCover = !isCover;
        video.classList.toggle("is-cover", isCover);
        fitBtn.innerHTML = isCover ? ICONS.cover : ICONS.fit;
        fitBtn.title = isCover ? "Aspect Ratio: Fill/Crop (C)" : "Aspect Ratio: Fit/Contain (C)";
        resetHideTimer();
      });

      // Picture in Picture
      if (document.pictureInPictureEnabled && typeof video.requestPictureInPicture === "function") {
        pipBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          try {
            if (document.pictureInPictureElement) {
              await document.exitPictureInPicture();
            } else {
              await video.requestPictureInPicture();
            }
          } catch (_) {}
          resetHideTimer();
        });
      } else {
        pipBtn?.remove();
      }

      // Quick seek buttons
      seekBackBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        video.currentTime = Math.max(0, video.currentTime - 5);
        syncProgressUI();
        resetHideTimer();
      });

      seekFwdBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        video.currentTime = Math.min(video.duration || 0, video.currentTime + 5);
        syncProgressUI();
        resetHideTimer();
      });

      // Speed selection
      speedBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        speedWrap.classList.toggle("open");
        resetHideTimer();
      });

      speedMenu.addEventListener("click", (e) => {
        const item = e.target.closest("[data-speed]");
        if (!item) return;
        e.stopPropagation();
        const s = parseFloat(item.dataset.speed);
        video.playbackRate = s;
        speedBtn.textContent = `${s}x`;
        speedMenu.querySelectorAll(".ds-gallery-player-speed-item").forEach((el) => el.classList.remove("active"));
        item.classList.add("active");
        speedWrap.classList.remove("open");
        resetHideTimer();
      });

      const onSpeedOutsideClick = (e) => {
        if (!speedWrap.contains(e.target)) speedWrap.classList.remove("open");
      };
      document.addEventListener("pointerdown", onSpeedOutsideClick);

      // Volume & Mute logic
      const updateVolumeUI = () => {
        volSlider.value = video.muted ? 0 : video.volume;
        if (video.muted || video.volume === 0) {
          muteBtn.innerHTML = ICONS.volumeMute;
          muteBtn.title = "Unmute (M)";
        } else {
          muteBtn.innerHTML = ICONS.volumeUp;
          muteBtn.title = "Mute (M)";
        }
      };

      muteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (video.muted || video.volume === 0) {
          video.muted = false;
          video.volume = prevVolume > 0 ? prevVolume : 0.8;
        } else {
          prevVolume = video.volume > 0 ? video.volume : 0.8;
          video.muted = true;
        }
        updateVolumeUI();
        resetHideTimer();
      });

      volSlider.addEventListener("input", (e) => {
        e.stopPropagation();
        const val = parseFloat(volSlider.value);
        video.volume = val;
        video.muted = val === 0;
        if (val > 0) prevVolume = val;
        updateVolumeUI();
        resetHideTimer();
      });

      // Fullscreen button & icon
      const updateFullscreenIcon = () => {
        const isFs = Boolean(document.fullscreenElement);
        fullscreenBtn.innerHTML = isFs ? ICONS.fullscreenExit : ICONS.fullscreen;
        fullscreenBtn.title = isFs ? "Exit Fullscreen (F)" : "Toggle Fullscreen (F)";
      };

      fullscreenBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!document.fullscreenElement) {
          overlay.requestFullscreen?.().catch(() => {});
        } else {
          document.exitFullscreen?.().catch(() => {});
        }
        resetHideTimer();
      });

      document.addEventListener("fullscreenchange", updateFullscreenIcon);

      // Video event listeners
      video.addEventListener("play", () => {
        playBtn.innerHTML = ICONS.pause;
        startProgressLoop();
        resetHideTimer();
      });

      video.addEventListener("pause", () => {
        playBtn.innerHTML = ICONS.play;
        stopProgressLoop();
        syncProgressUI();
        clearTimeout(hideTimeout);
        overlay.classList.remove("is-inactive");
      });

      video.addEventListener("ended", () => {
        stopProgressLoop();
        syncProgressUI();
        if (!isLooping) {
          playBtn.innerHTML = ICONS.play;
          clearTimeout(hideTimeout);
          overlay.classList.remove("is-inactive");
        }
      });

      video.addEventListener("timeupdate", () => {
        if (!isScrubbing && !animFrameId) {
          syncProgressUI();
        }
      });

      const onMeta = () => {
        if (Number.isFinite(video.duration) && video.duration > 0) {
          timeDur.textContent = formatDuration(video.duration);
        }
        if (!isScrubbing) {
          syncProgressUI();
        }
      };
      video.addEventListener("loadedmetadata", onMeta);
      video.addEventListener("durationchange", onMeta);

      video.addEventListener("progress", () => {
        if (video.buffered.length && Number.isFinite(video.duration) && video.duration > 0) {
          const bEnd = video.buffered.end(video.buffered.length - 1);
          const bPct = Math.min(100, (bEnd / video.duration) * 100);
          buffered.style.width = `${bPct}%`;
        }
      });

      playBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        togglePlay();
        resetHideTimer();
      });

      viewport.addEventListener("click", (e) => {
        if (e.target.closest(".ds-gallery-player-nav")) return;
        togglePlay();
        resetHideTimer();
      });

      viewport.addEventListener("dblclick", (e) => {
        if (e.target.closest(".ds-gallery-player-nav")) return;
        if (!document.fullscreenElement) {
          overlay.requestFullscreen?.().catch(() => {});
        } else {
          document.exitFullscreen?.().catch(() => {});
        }
      });

      // Frame seeking engine for buttery smooth, zero-delay scrubbing
      const dispatchFrameSeek = () => {
        if (pendingSeekPct === null || !Number.isFinite(video.duration) || video.duration <= 0) return;
        const targetTime = pendingSeekPct * video.duration;
        pendingSeekPct = null;
        isSeekingVideo = true;

        if (typeof video.fastSeek === "function") {
          try {
            video.fastSeek(targetTime);
          } catch (_) {
            video.currentTime = targetTime;
          }
        } else {
          video.currentTime = targetTime;
        }
      };

      video.addEventListener("seeked", () => {
        isSeekingVideo = false;
        if (pendingSeekPct !== null) {
          dispatchFrameSeek();
        } else if (!isScrubbing) {
          syncProgressUI();
        }
      });

      video.addEventListener("seeking", () => {
        if (!isScrubbing) {
          syncProgressUI();
        }
        setTimeout(() => {
          if (isSeekingVideo && pendingSeekPct !== null) {
            isSeekingVideo = false;
            dispatchFrameSeek();
          }
        }, 60);
      });

      const requestFrameSeek = (pct) => {
        pendingSeekPct = pct;
        if (!isSeekingVideo) {
          dispatchFrameSeek();
        }
      };

      const updateScrubUI = (pct, r) => {
        const dur = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
        const targetTime = pct * dur;
        fill.style.width = `${pct * 100}%`;
        timeCur.textContent = formatDuration(targetTime);
        scrubberTooltip.textContent = formatDuration(targetTime);
        if (r && r.width) {
          scrubberTooltip.style.left = `${Math.round(pct * r.width)}px`;
        }
      };

      // Scrubber Zone: Hover Tooltip + Dragging
      scrubberZone.addEventListener("pointermove", (e) => {
        if (isScrubbing) return;
        const r = timeline.getBoundingClientRect();
        const pct = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
        if (Number.isFinite(video.duration) && video.duration > 0) {
          scrubberTooltip.textContent = formatDuration(pct * video.duration);
          scrubberTooltip.style.left = `${Math.round(pct * r.width)}px`;
        }
        resetHideTimer();
      });

      const handleScrub = (e) => {
        const r = timeline.getBoundingClientRect();
        if (!r.width) return;
        const pct = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
        updateScrubUI(pct, r);
        requestFrameSeek(pct);
      };

      scrubberZone.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        isScrubbing = true;
        overlay.classList.add("is-scrubbing");
        scrubberZone.classList.add("is-scrubbing");

        stopProgressLoop();
        wasPlayingBeforeScrub = !video.paused && !video.ended;
        if (wasPlayingBeforeScrub) {
          video.pause();
        }

        handleScrub(e);

        const onMove = (ev) => {
          if (!isScrubbing) return;
          handleScrub(ev);
        };

        const onUp = (ev) => {
          if (!isScrubbing) return;
          isScrubbing = false;
          overlay.classList.remove("is-scrubbing");
          scrubberZone.classList.remove("is-scrubbing");

          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
          window.removeEventListener("pointercancel", onUp);

          const r = timeline.getBoundingClientRect();
          if (r.width && Number.isFinite(video.duration) && video.duration > 0) {
            const pct = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
            video.currentTime = pct * video.duration;
            updateScrubUI(pct, r);
          }

          if (wasPlayingBeforeScrub) {
            video.play().catch(() => {});
            startProgressLoop();
          }
          resetHideTimer();
        };

        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        window.addEventListener("pointercancel", onUp);
      });

      // Navigation handler (prev / next video)
      const navigate = (delta) => {
        const nextIdx = currentIndex + delta;
        if (nextIdx >= 0 && nextIdx < this._filteredFiles.length) {
          currentIndex = nextIdx;
          const nextItem = this._filteredFiles[currentIndex];
          if (nextItem.type === "image") {
            video.pause();
            closePlayer();
            this._openLightbox(nextItem);
            return;
          }
          loadVideo(nextItem);
        }
      };

      overlay.querySelector("[data-prev]").addEventListener("click", (e) => {
        e.stopPropagation();
        navigate(-1);
        resetHideTimer();
      });

      overlay.querySelector("[data-next]").addEventListener("click", (e) => {
        e.stopPropagation();
        navigate(1);
        resetHideTimer();
      });

      // Close handler
      const closePlayer = () => {
        stopProgressLoop();
        clearTimeout(hideTimeout);
        video.pause();
        video.src = "";
        overlay.remove();
        document.removeEventListener("keydown", keyHandler);
        document.removeEventListener("pointerdown", onSpeedOutsideClick);
        document.removeEventListener("fullscreenchange", updateFullscreenIcon);
      };

      overlay.querySelector("[data-close]").addEventListener("click", (e) => {
        e.stopPropagation();
        closePlayer();
      });

      // Keyboard shortcuts
      const keyHandler = (e) => {
        if (e.key === "Escape") {
          closePlayer();
        } else if (e.key === " " || e.code === "Space") {
          e.preventDefault();
          togglePlay();
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          if (e.shiftKey) {
            navigate(-1);
          } else {
            video.currentTime = Math.max(0, video.currentTime - 5);
            syncProgressUI();
          }
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          if (e.shiftKey) {
            navigate(1);
          } else {
            video.currentTime = Math.min(video.duration || 0, video.currentTime + 5);
            syncProgressUI();
          }
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          video.volume = Math.min(1, video.volume + 0.1);
          video.muted = false;
          updateVolumeUI();
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          video.volume = Math.max(0, video.volume - 0.1);
          updateVolumeUI();
        } else if (e.key === "m" || e.key === "M") {
          muteBtn.click();
        } else if (e.key === "l" || e.key === "L") {
          loopBtn.click();
        } else if (e.key === "f" || e.key === "F") {
          fullscreenBtn.click();
        } else if (e.key === "c" || e.key === "C") {
          fitBtn.click();
        }
        resetHideTimer();
      };
      document.addEventListener("keydown", keyHandler);

      document.body.appendChild(overlay);
      loadVideo(currentItem);
    };

    // ------------------------------------------------------------------------
    // DS Gallery Settings Popover & Gear Button Handler
    // ------------------------------------------------------------------------
    nodeType.prototype._isGalleryPopoverOpen = function () {
      return Boolean(this._activeGearPopover && this._activeGearPopover.isConnected);
    };

    nodeType.prototype._closeGalleryGearPopover = function () {
      if (this._activeGearAnchor?.classList) {
        this._activeGearAnchor.classList.remove("is-active");
      }
      if (this._activeGearPopover) {
        this._activeGearPopover.remove();
        this._activeGearPopover = null;
      }
      if (this._cleanupPopoverEvents) {
        this._cleanupPopoverEvents();
        this._cleanupPopoverEvents = null;
      }
      this._activeGearAnchor = null;
    };

    nodeType.prototype._findToolboxAnchor = function () {
      const toolbox = document.querySelector('.selection-toolbox, [data-testid="selection-toolbox"]');
      if (toolbox) {
        const gearBtn =
          toolbox.querySelector(".ds-actionbar-gear-btn") ||
          toolbox.querySelector(".ds-gear-svg")?.closest("button") ||
          toolbox.querySelector(".ds-actionbar-gear-btn-icon")?.closest("button") ||
          toolbox.querySelector('button[aria-label*="Setting" i]') ||
          toolbox.querySelector('button[title*="Setting" i]') ||
          toolbox.querySelector('button[aria-label*="Quick" i]') ||
          toolbox.querySelector(".p-button:last-child") ||
          toolbox.querySelector("button:last-child");
        if (gearBtn) return gearBtn;
        return toolbox;
      }
      return (
        document.querySelector(".ds-actionbar-gear-btn") ||
        document.querySelector(".selection-toolbox") ||
        this._galleryRoot
      );
    };

    nodeType.prototype._toggleGalleryGearPopover = function (anchorEl) {
      const anchor = anchorEl || this._findToolboxAnchor();
      if (this._isGalleryPopoverOpen()) {
        const isSameAnchor = this._activeGearAnchor && (this._activeGearAnchor === anchor || this._activeGearAnchor.contains(anchor));
        this._closeGalleryGearPopover();
        if (isSameAnchor) return;
      }
      this._openGalleryGearPopover(anchor);
    };

    nodeType.prototype._openGalleryGearPopover = function (anchorEl) {
      // Close any existing popover
      this._closeGalleryGearPopover();
      window.DSGearMenu?.closePopover?.();

      // Clean up any stray popovers
      document.querySelectorAll(".ds-gallery-settings-popover").forEach((el) => el.remove());

      const anchor = anchorEl || this._findToolboxAnchor();
      const state = this.properties[PROP_KEY] || { ...DEFAULT_SETTINGS };
      const folderName = state.folder_path ? (state.folder_path.split(/[\\/]/).pop() || state.folder_path) : "No Folder Selected";

      const sortOptions = [
        { id: "date_desc", label: "Date: Newest First" },
        { id: "date_asc", label: "Date: Oldest First" },
        { id: "name_asc", label: "Name: A to Z" },
        { id: "name_desc", label: "Name: Z to A" },
        { id: "size_desc", label: "Size: Largest First" },
        { id: "size_asc", label: "Size: Smallest First" },
      ];
      const currentSort = sortOptions.find((o) => o.id === state.sort_by) || sortOptions[0];

      const popover = document.createElement("div");
      popover.className = "ds-gallery-settings-popover";
      popover.dataset.dsThemed = "true";

      // Inherit theme tokens and accent from node and DSGlobalTheme
      if (window.DSGlobalTheme?.applyToElement) {
        window.DSGlobalTheme.applyToElement(popover);
      }
      if (this._galleryRoot) {
        const computed = window.getComputedStyle(this._galleryRoot);
        for (const v of ["--ds-bg", "--ds-panel", "--ds-panel-2", "--ds-text", "--ds-text-muted", "--ds-border", "--ds-accent", "--ds-font", "--ds-hover"]) {
          const val = computed.getPropertyValue(v);
          if (val) popover.style.setProperty(v, val);
        }
      }

      popover.innerHTML = `
        <!-- Header -->
        <div class="ds-gallery-settings-header">
          <div class="ds-gallery-settings-header-left">
            <div class="ds-gallery-brand">DS</div>
            <div class="ds-gallery-settings-title-wrap">
              <span class="ds-gallery-settings-title">DS Gallery Settings</span>
              <span class="ds-gallery-settings-subtitle" title="${state.folder_path || "No Folder Selected"}">${folderName}</span>
            </div>
          </div>
          <button type="button" class="ds-gallery-settings-close-btn" data-close-btn title="Close (Esc)">✕</button>
        </div>

        <!-- Grid Size -->
        <div class="ds-gallery-settings-section">
          <div class="ds-gallery-settings-section-title">Grid Size</div>
          <div class="ds-gallery-settings-segmented" data-grid-size-group>
            <button type="button" class="ds-gallery-settings-seg-btn ${state.grid_size === "tiny" ? "is-active" : ""}" data-size="tiny">Tiny</button>
            <button type="button" class="ds-gallery-settings-seg-btn ${state.grid_size === "small" ? "is-active" : ""}" data-size="small">Small</button>
            <button type="button" class="ds-gallery-settings-seg-btn ${state.grid_size === "medium" ? "is-active" : ""}" data-size="medium">Medium</button>
            <button type="button" class="ds-gallery-settings-seg-btn ${state.grid_size === "large" ? "is-active" : ""}" data-size="large">Large</button>
            <button type="button" class="ds-gallery-settings-seg-btn ${state.grid_size === "huge" ? "is-active" : ""}" data-size="huge">Huge</button>
          </div>
        </div>

        <!-- Show Only -->
        <div class="ds-gallery-settings-section">
          <div class="ds-gallery-settings-section-title">Show Only</div>
          <div class="ds-gallery-settings-segmented" data-media-filter-group>
            <button type="button" class="ds-gallery-settings-seg-btn ${state.media_filter === "all" ? "is-active" : ""}" data-filter="all">All Media</button>
            <button type="button" class="ds-gallery-settings-seg-btn ${state.media_filter === "images" ? "is-active" : ""}" data-filter="images">Images</button>
            <button type="button" class="ds-gallery-settings-seg-btn ${state.media_filter === "videos" ? "is-active" : ""}" data-filter="videos">Videos</button>
          </div>
        </div>

        <!-- Sort Media (Custom DS Dropdown) -->
        <div class="ds-gallery-settings-section">
          <div class="ds-gallery-settings-section-title">Sort Media</div>
          <div class="ds-gallery-dropdown" data-sort-dropdown>
            <button type="button" class="ds-gallery-dropdown-trigger" data-sort-trigger>
              <span data-sort-label>${currentSort.label}</span>
              <span class="ds-gallery-dropdown-arrow">▾</span>
            </button>
            <div class="ds-gallery-dropdown-menu" data-sort-menu style="display: none;">
              ${sortOptions.map((opt) => `
                <div class="ds-gallery-dropdown-item ${opt.id === state.sort_by ? "is-active" : ""}" data-sort-id="${opt.id}">
                  <span>${opt.label}</span>
                  ${opt.id === state.sort_by ? `<span class="ds-gallery-dropdown-check">✓</span>` : ""}
                </div>
              `).join("")}
            </div>
          </div>
        </div>

        <!-- Sneak Peek -->
        <div class="ds-gallery-settings-row" data-sneak-peek-row>
          <div class="ds-gallery-settings-row-text">
            <div class="ds-gallery-settings-row-label">Sneak Peek</div>
            <div class="ds-gallery-settings-row-desc">Hover to Reveal · Safe for recording / streaming</div>
          </div>
          <div class="ds-gallery-switch ${state.sneak_peek ? "is-on" : ""}" data-sneak-toggle>
            <div class="ds-gallery-switch-thumb"></div>
          </div>
        </div>

        <!-- NSFW Protection -->
        <div class="ds-gallery-settings-row" data-nsfw-row>
          <div class="ds-gallery-settings-row-text">
            <div class="ds-gallery-settings-row-label">NSFW Protection</div>
            <div class="ds-gallery-settings-row-desc" data-nsfw-status>
              ${state.nsfw_enabled ? `Active · ${Math.round((state.nsfw_threshold ?? 0.65) * 100)}% sensitivity` : "Disabled"}
            </div>
          </div>
          <div class="ds-gallery-switch ${state.nsfw_enabled ? "is-on" : ""}" data-nsfw-toggle>
            <div class="ds-gallery-switch-thumb"></div>
          </div>
        </div>

        <!-- NSFW Sensitivity Slider (Visible when NSFW is enabled) -->
        <div class="ds-gallery-settings-slider-wrap" data-nsfw-slider-wrap style="display: ${state.nsfw_enabled ? "flex" : "none"};">
          <div class="ds-gallery-settings-slider-head">
            <span>Detection Sensitivity</span>
            <span class="ds-gallery-settings-slider-val" data-nsfw-val>${Math.round((state.nsfw_threshold ?? 0.65) * 100)}%</span>
          </div>
          <input type="range" min="0" max="100" step="1" value="${Math.round((state.nsfw_threshold ?? 0.65) * 100)}" class="ds-gallery-settings-slider" data-nsfw-slider />
        </div>

        <!-- Folder Operations & Caches -->
        <div class="ds-gallery-settings-actions">
          <button type="button" class="ds-gallery-settings-btn" data-btn-rescan title="Rescan media in selected folder">
            ${ICONS.refresh}
            <span>Rescan Folder</span>
          </button>
          <div class="ds-gallery-settings-btn-group">
            <button type="button" class="ds-gallery-settings-btn ds-gallery-settings-btn-sub" data-btn-clear-nsfw title="Clear cached NSFW scores">
              Clear NSFW Cache
            </button>
            <button type="button" class="ds-gallery-settings-btn ds-gallery-settings-btn-sub" data-btn-clear-thumb title="Clear cached thumbnail images">
              Clear Thumb Cache
            </button>
          </div>
        </div>
      `;

      // Wire interactive events
      // Close button
      popover.querySelector("[data-close-btn]").addEventListener("click", (e) => {
        e.stopPropagation();
        this._closeGalleryGearPopover();
      });

      // Grid size buttons
      popover.querySelectorAll("[data-size]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const sz = btn.dataset.size;
          this._setGridSize(sz);
          popover.querySelectorAll("[data-size]").forEach((b) => b.classList.toggle("is-active", b.dataset.size === sz));
        });
      });

      // Show only filter buttons
      popover.querySelectorAll("[data-filter]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const f = btn.dataset.filter;
          this._setMediaFilter(f);
          popover.querySelectorAll("[data-filter]").forEach((b) => b.classList.toggle("is-active", b.dataset.filter === f));
        });
      });

      // Custom DS Dropdown for Sort Media
      const sortDropdown = popover.querySelector("[data-sort-dropdown]");
      const sortTrigger = popover.querySelector("[data-sort-trigger]");
      const sortMenu = popover.querySelector("[data-sort-menu]");
      const sortLabel = popover.querySelector("[data-sort-label]");

      sortTrigger.addEventListener("click", (e) => {
        e.stopPropagation();
        const isOpen = sortMenu.style.display !== "none";
        sortMenu.style.display = isOpen ? "none" : "flex";
        sortDropdown.classList.toggle("is-open", !isOpen);
      });

      sortMenu.querySelectorAll("[data-sort-id]").forEach((item) => {
        item.addEventListener("click", (e) => {
          e.stopPropagation();
          const sortId = item.dataset.sortId;
          this._setSort(sortId);
          sortLabel.textContent = item.querySelector("span").textContent;
          sortMenu.querySelectorAll("[data-sort-id]").forEach((it) => {
            const isAct = it.dataset.sortId === sortId;
            it.classList.toggle("is-active", isAct);
            const check = it.querySelector(".ds-gallery-dropdown-check");
            if (isAct && !check) {
              const c = document.createElement("span");
              c.className = "ds-gallery-dropdown-check";
              c.textContent = "✓";
              it.appendChild(c);
            } else if (!isAct && check) {
              check.remove();
            }
          });
          sortMenu.style.display = "none";
          sortDropdown.classList.remove("is-open");
        });
      });

      popover.addEventListener("pointerdown", (e) => {
        if (!sortDropdown.contains(e.target)) {
          sortMenu.style.display = "none";
          sortDropdown.classList.remove("is-open");
        }
      });

      // Sneak Peek toggle
      const sneakRow = popover.querySelector("[data-sneak-peek-row]");
      const sneakSwitch = popover.querySelector("[data-sneak-toggle]");
      sneakRow.addEventListener("click", (e) => {
        e.stopPropagation();
        this._toggleSneakPeek();
        sneakSwitch.classList.toggle("is-on", Boolean(this.properties[PROP_KEY]?.sneak_peek));
      });

      // NSFW Protection toggle
      const nsfwRow = popover.querySelector("[data-nsfw-row]");
      const nsfwSwitch = popover.querySelector("[data-nsfw-toggle]");
      const nsfwStatus = popover.querySelector("[data-nsfw-status]");
      const nsfwSliderWrap = popover.querySelector("[data-nsfw-slider-wrap]");
      const nsfwSlider = popover.querySelector("[data-nsfw-slider]");
      const nsfwVal = popover.querySelector("[data-nsfw-val]");

      nsfwRow.addEventListener("click", async (e) => {
        e.stopPropagation();
        await this._toggleNSFW();
        const enabled = Boolean(this.properties[PROP_KEY]?.nsfw_enabled);
        const thresh = Math.round((this.properties[PROP_KEY]?.nsfw_threshold ?? 0.65) * 100);
        nsfwSwitch.classList.toggle("is-on", enabled);
        nsfwStatus.textContent = enabled ? `Active · ${thresh}% sensitivity` : "Disabled";
        nsfwSliderWrap.style.display = enabled ? "flex" : "none";
      });

      // NSFW sensitivity slider
      nsfwSlider.addEventListener("input", (e) => {
        const val = Number(e.target.value);
        nsfwVal.textContent = `${val}%`;
        const state = this.properties[PROP_KEY];
        state.nsfw_threshold = val / 100;
        nsfwStatus.textContent = `Active · ${val}% sensitivity`;
        this._persistState();
        this._applyNSFWBlurToAllCards();
      });

      // Rescan folder button
      popover.querySelector("[data-btn-rescan]").addEventListener("click", (e) => {
        e.stopPropagation();
        this._scanFolder();
      });

      // Clear NSFW Cache button
      popover.querySelector("[data-btn-clear-nsfw]").addEventListener("click", async (e) => {
        e.stopPropagation();
        await this._clearNSFWCache();
      });

      // Clear Thumb Cache button
      popover.querySelector("[data-btn-clear-thumb]").addEventListener("click", async (e) => {
        e.stopPropagation();
        await this._clearThumbCache();
      });

      document.body.appendChild(popover);
      this._activeGearPopover = popover;
      this._activeGearAnchor = anchor;
      if (anchor?.classList) anchor.classList.add("is-active");

      // Positioning logic relative to anchor
      const updatePosition = () => {
        if (!popover || !popover.isConnected) return;
        const currentAnchor = anchor && anchor.isConnected ? anchor : this._findToolboxAnchor();
        if (!currentAnchor || !currentAnchor.isConnected) {
          this._closeGalleryGearPopover();
          return;
        }

        const rect = currentAnchor.getBoundingClientRect();
        const popRect = popover.getBoundingClientRect();

        let top = rect.bottom + 6;
        let left = rect.left;

        // Ensure left is within viewport
        if (left + popRect.width > window.innerWidth - 12) {
          left = window.innerWidth - popRect.width - 12;
        }
        if (left < 12) left = 12;

        // If bottom overflow, flip to open above
        if (top + popRect.height > window.innerHeight - 12) {
          const aboveTop = rect.top - popRect.height - 6;
          if (aboveTop >= 12) {
            top = aboveTop;
          } else {
            top = Math.max(12, window.innerHeight - popRect.height - 12);
          }
        }

        popover.style.top = `${Math.round(top)}px`;
        popover.style.left = `${Math.round(left)}px`;
      };

      updatePosition();

      // Dismiss on click outside
      const onPointerDown = (e) => {
        if (popover.contains(e.target)) return;
        if (anchor && (anchor === e.target || anchor.contains(e.target))) return;
        this._closeGalleryGearPopover();
      };

      // Dismiss on Escape key
      const onKeyDown = (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          this._closeGalleryGearPopover();
        }
      };

      // Reposition or close when window resizes or canvas moves
      const onReposition = () => updatePosition();

      setTimeout(() => {
        document.addEventListener("pointerdown", onPointerDown, true);
        document.addEventListener("keydown", onKeyDown, true);
        window.addEventListener("resize", onReposition);
        window.addEventListener("scroll", onReposition, true);
      }, 10);

      this._cleanupPopoverEvents = () => {
        document.removeEventListener("pointerdown", onPointerDown, true);
        document.removeEventListener("keydown", onKeyDown, true);
        window.removeEventListener("resize", onReposition);
        window.removeEventListener("scroll", onReposition, true);
      };
    };
  },
});

// ----------------------------------------------------------------------------
// Gear Menu & Toolbar Registration
// ----------------------------------------------------------------------------
function registerGalleryGearMenu() {
  if (!window.DSGearMenu?.register) return;
  window.DSGearMenu.register(TYPE, {
    tooltip: "DS Gallery Settings",
    onClick: (node, canvas, event) => {
      const anchor = event?.currentTarget || event?.target || node?._findToolboxAnchor?.();
      node?._toggleGalleryGearPopover?.(anchor);
    },
  });
}

if (typeof window !== "undefined") {
  registerGalleryGearMenu();
  window.addEventListener("DOMContentLoaded", registerGalleryGearMenu, { once: true });
  setTimeout(registerGalleryGearMenu, 200);
  setTimeout(registerGalleryGearMenu, 800);
}
