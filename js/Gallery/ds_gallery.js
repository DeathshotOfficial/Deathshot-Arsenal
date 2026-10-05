/**
 * DS Gallery - Frontend Node UI
 * Deathshot Arsenal / DS Node Pack
 * Overhauled to strict UIElements Design System.
 */

import { app } from "/scripts/app.js";
import {
  normalizeDSWidgetHost,
  protectDSResizeCorners,
  Slider,
  Toggle,
  Dropdown,
  DSIcon,
  DSIconMarkup,
} from "../UIElements/index.js";

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
    w.draw = () => { };
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
  sneak_peek: false,
};

const GRID_SIZES = {
  tiny: 80,
  small: 105,
  medium: 135,
  large: 175,
  huge: 230,
};

const SORT_OPTIONS = [
  { id: "date_desc", label: "Date: Newest First" },
  { id: "date_asc", label: "Date: Oldest First" },
  { id: "name_asc", label: "Name: A to Z" },
  { id: "name_desc", label: "Name: Z to A" },
  { id: "size_desc", label: "Size: Largest First" },
  { id: "size_asc", label: "Size: Smallest First" },
];

// Specialized media control vector icons not in generic Lucide set
const SPECIAL_ICONS = {
  loop: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`,
  backward5: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 19l-9-7 9-7v14z"/><path d="M22 19l-9-7 9-7v14z"/></svg>`,
  forward5: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 19l9-7-9-7v14z"/><path d="M2 19l9-7-9-7v14z"/></svg>`,
  pip: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><rect x="12" y="9" width="8" height="6" rx="1" ry="1"/></svg>`,
  fit: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`,
  cover: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`,
  minimize: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
};

let cssInjected = false;
function injectCSS() {
  if (cssInjected || document.querySelector("link[data-ds-gallery-css]")) return;
  cssInjected = true;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.dataset.dsGalleryCss = "true";
  link.href = new URL(`./ds_gallery.css?v=${Date.now()}`, import.meta.url).href;
  document.head.appendChild(link);
}

function formatDuration(sec) {
  if (!Number.isFinite(sec) || sec < 0) return "00:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const RESUME_PREFIX = "ds_video_resume_";
function getResumeKey(id) {
  if (!id) return null;
  const clean = String(id).replace(/[^a-zA-Z0-9_\-]/g, "_").slice(-120);
  return `${RESUME_PREFIX}${clean}`;
}

function saveResume(id, time, dur, title) {
  const key = getResumeKey(id);
  if (!key) return;
  try {
    if (!Number.isFinite(time) || time < 5) return;
    if (Number.isFinite(dur) && dur > 0 && dur - time < 10) {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, JSON.stringify({
      time: Math.floor(time),
      duration: Math.floor(dur || 0),
      title: title || "",
      ts: Date.now()
    }));
  } catch (_) {}
}

function getResume(id) {
  const key = getResumeKey(id);
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data && Number.isFinite(data.time) && data.time >= 5) {
      return data;
    }
  } catch (_) {}
  return null;
}

function clearResume(id) {
  const key = getResumeKey(id);
  if (!key) return;
  try { localStorage.removeItem(key); } catch (_) {}
}

// --------------------------------------------------------------------------
// Core Extension Registration
// --------------------------------------------------------------------------
app.registerExtension({
  name: EXT_NAME,

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
        stateWidget = this.addWidget("text", "gallery_state", "", () => { }, { hidden: true });
      }
      stateWidget.hidden = true;
      stateWidget.type = "hidden";
      stateWidget.computeSize = () => [0, 0];
      stateWidget.draw = () => { };
      this._stateWidget = stateWidget;

      hideWidgets(this);

      // Node size standards: 480x520 default, 340x220 minimum
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

      // Instance serialize/configure patch
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
            Math.max(340, Number(info.size[0]) || 480),
            Math.max(400, Number(info.size[1]) || 520),
          ];
          self._sizeRestoredFromWorkflow = true;
        }
        window.DSGlobalTheme?.applyNodeBase?.(self);
        setTimeout(() => {
          self._restoreState?.(info);
          self._syncGalleryHostHeight?.();
          try { self.setDirtyCanvas?.(true, true); } catch (_) { }
        }, 30);
        return r;
      };


      // Build DOM Gallery Widget
      this._buildGalleryWidget();

      hideWidgets(this);

      // Hook Deathshot Theme
      window.DSGlobalTheme?.applyNodeBase?.(this);
      window.DSGlobalTheme?.subscribe?.(() => {
        window.DSGlobalTheme?.applyNodeBase?.(this);
        this.setDirtyCanvas(true, true);
      });

      // Initial scan if folder is configured
      if (this.properties[PROP_KEY].folder_path) {
        setTimeout(() => this._scanFolder(), 50);
      }

      registerGalleryGearMenu();
      // Re-assert size after LiteGraph's auto-fit may have called computeSize()
      // and snapped the node to the minimum [340, 220].
      setTimeout(() => {
        if (!this._sizeRestoredFromWorkflow) {
          if (this.size[1] < 400) this.size = [Math.max(480, this.size[0]), 520];
        }
        this._syncGalleryHostHeight?.();
        try { this.setDirtyCanvas?.(true, true); } catch (_) {}
      }, 0);
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
          Math.max(340, Number(info.size[0]) || 480),
          Math.max(400, Number(info.size[1]) || 520),
        ];
        this._sizeRestoredFromWorkflow = true;
      }
      window.DSGlobalTheme?.applyNodeBase?.(this);
      setTimeout(() => {
        this._restoreState?.(info);
        this._syncGalleryHostHeight?.();
        try { this.setDirtyCanvas?.(true, true); } catch (_) { }
      }, 30);
      return r;
    };

    // Node removed hook - destroy active video players, popovers, and background timers
    const origOnRemoved = nodeType.prototype.onRemoved;
    nodeType.prototype.onRemoved = function () {
      if (typeof window._dsActiveGalleryVideoPlayer === "function") {
        try { window._dsActiveGalleryVideoPlayer(); } catch (_) {}
        window._dsActiveGalleryVideoPlayer = null;
      }
      this._closeGalleryGearPopover?.();
      document.querySelectorAll(".ds-gallery-player-modal, .ds-gallery-lightbox").forEach((el) => {
        try { el.remove(); } catch (_) {}
      });
      if (this._nsfwPolling) {
        clearInterval(this._nsfwPolling);
        this._nsfwPolling = null;
      }
      if (this._batchTimer) {
        clearTimeout(this._batchTimer);
        this._batchTimer = null;
      }
      if (origOnRemoved) {
        return origOnRemoved.apply(this, arguments);
      }
    };

    // node.computeSize returns the TRUE MINIMUM [340, 220].
    // LiteGraph uses this as the floor during drag-resize. If we return current
    // size here, the node can never be dragged smaller (returns current as minimum).
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

    // Compute the pixel height the gallery widget should fill.
    // LiteGraph title bar = 30px. Each slot row = 20px.
    // We use widget.y when available (most accurate), otherwise estimate.
    nodeType.prototype._getWidgetHeight = function () {
      const nodeH = Math.max(220, Number(this.size?.[1]) || 520);
      const TITLE_H = (typeof LiteGraph !== "undefined" && LiteGraph.NODE_TITLE_HEIGHT) || 30;
      const slotCount = Math.max(this.inputs?.length || 0, this.outputs?.length || 0);
      const slotH = slotCount > 0 ? slotCount * 20 : 0;
      const startY = Number.isFinite(this._galleryWidget?.y) && this._galleryWidget.y > TITLE_H
        ? this._galleryWidget.y
        : (TITLE_H + slotH);
      return Math.max(160, Math.floor(nodeH - startY));
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

    // Helper Commands
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
      if (this._galleryHost) {
        this._galleryHost.dataset.sneakPeek = this.properties[PROP_KEY]?.sneak_peek ? "true" : "false";
      }
    };

    nodeType.prototype._toggleNSFW = async function () {
      const state = this.properties[PROP_KEY];
      state.nsfw_enabled = !state.nsfw_enabled;
      this._nsfwToggle?.setValue(state.nsfw_enabled, false);
      const nsfwPopBtn = this._galleryCard?.querySelector("[data-btn-nsfw-pop]");
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
    // DOM Widget Construction: Card-as-Base, 5px node margin, 10px card padding
    // ------------------------------------------------------------------------
    nodeType.prototype._buildGalleryWidget = function () {
      const state = this.properties[PROP_KEY] || { ...DEFAULT_SETTINGS };

      // Root host container
      const root = document.createElement("div");
      root.className = "ds-gallery-host";
      root.dataset.dsUiHost = "true";
      root.dataset.dsThemed = "true";
      root.dataset.sneakPeek = state.sneak_peek ? "true" : "false";
      root.style.boxSizing = "border-box";
      root.style.width = "100%";
      root.style.padding = "0 5px 5px 5px";
      root.style.setProperty("--ds-ui-margin", "5px");
      root.style.setProperty("--ds-card-padding", "10px");

      // The Card itself is the visible container
      const card = document.createElement("div");
      card.className = "ds-ui-card ds-gallery-card";
      card.style.boxSizing = "border-box";
      card.style.width = "100%";
      card.style.height = "100%";
      card.style.flex = "1 1 auto";
      card.style.minHeight = "0";
      card.style.display = "flex";
      card.style.flexDirection = "column";
      card.style.background = "var(--ds-color-card, #12151c)";
      card.style.border = "1px solid var(--ds-color-card-border, #242a36)";
      card.style.borderRadius = "var(--ds-radius-card, 8px)";
      card.style.padding = "var(--ds-card-padding, 10px)";
      card.style.boxShadow = "none";
      card.style.pointerEvents = "auto";
      card.style.position = "relative";
      card.style.overflow = "hidden";

      const folderName = state.folder_path
        ? (state.folder_path.split(/[\\/]/).pop() || state.folder_path)
        : "Select Folder...";

      card.innerHTML = `
        <!-- Header -->
        <div class="ds-gallery-header">
          <div class="ds-gallery-header-left">
            <div class="ds-gallery-brand">DS</div>
            <button type="button" class="ds-ui-btn ds-ui-btn-compact ds-gallery-folder-btn" data-folder-btn title="Select local media folder">
              ${DSIconMarkup("folder", { size: 13 })}
              <span data-folder-label>${folderName}</span>
            </button>
            <div class="ds-gallery-search-wrap" data-search-wrap>
              <span class="ds-gallery-search-icon">${DSIconMarkup("search", { size: 12 })}</span>
              <input type="text" class="ds-gallery-search-input" data-search-input placeholder="Search files..." value="${state.search_query || ""}" />
              <button type="button" class="ds-gallery-search-clear" data-search-clear title="Clear search">✕</button>
            </div>
          </div>
          <div class="ds-gallery-header-right">
            <button type="button" class="ds-ui-btn ds-ui-btn-compact ds-ui-btn-icon-only" data-btn-rescan title="Rescan folder">
              ${DSIconMarkup("refresh-cw", { size: 12 })}
            </button>
            <button type="button" class="ds-ui-btn ds-ui-btn-compact ${state.nsfw_enabled ? "is-active" : ""}" data-btn-nsfw-pop title="NSFW Protection Settings">
              ${DSIconMarkup("lock", { size: 12 })}
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
              <button type="button" class="ds-ui-btn ds-ui-btn-compact ds-gallery-chip ${state.media_filter === "all" ? "is-active" : ""}" data-filter="all">All</button>
              <button type="button" class="ds-ui-btn ds-ui-btn-compact ds-gallery-chip ${state.media_filter === "images" ? "is-active" : ""}" data-filter="images">Images</button>
              <button type="button" class="ds-ui-btn ds-ui-btn-compact ds-gallery-chip ${state.media_filter === "videos" ? "is-active" : ""}" data-filter="videos">Videos</button>
            </div>
          </div>
          <div class="ds-gallery-toolbar-right">
            <button type="button" class="ds-ui-btn ds-ui-btn-compact" data-btn-sort title="Change sort order">
              ${DSIconMarkup("chevrons-up-down", { size: 12 })}
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
              <div class="ds-gallery-empty-icon">${DSIconMarkup("folder", { size: 36 })}</div>
              <div class="ds-gallery-empty-title">No Folder Selected</div>
              <div class="ds-gallery-empty-hint">Click "Select Folder" to browse your images and videos</div>
            </div>
          </div>
        </div>

        <!-- Floating Selection Toolbar -->
        <div class="ds-gallery-selection-bar" data-selection-bar style="display: none;">
          <span class="ds-gallery-selection-count" data-selection-count>0 selected</span>
          <button type="button" class="ds-ui-btn ds-ui-btn-compact" data-btn-select-all>Select All</button>
          <button type="button" class="ds-ui-btn ds-ui-btn-compact" data-btn-clear-selection>Clear</button>
          <button type="button" class="ds-ui-btn ds-ui-btn-compact ds-gallery-btn-danger" data-btn-delete title="Delete selected files">
            ${DSIconMarkup("trash-2", { size: 12 })}
            <span>Delete</span>
          </button>
        </div>

        <!-- NSFW Settings Popover (Hidden) -->
        <div class="ds-ui-popup ds-gallery-nsfw-popover" data-nsfw-popover style="display: none;">
          <div data-nsfw-toggle-slot></div>
          <div class="ds-gallery-nsfw-slider-container" data-slider-wrap></div>
          <button type="button" class="ds-ui-btn ds-ui-btn-compact" style="width: 100%; justify-content: center; margin-top: 4px;" data-btn-clear-nsfw>
            Clear NSFW Cache
          </button>
        </div>
      `;

      root.appendChild(card);

      this._galleryHost = root;
      this._galleryRoot = root;
      this._galleryCard = card;
      this._gridEl = card.querySelector("[data-grid]");
      this._emptyStateEl = card.querySelector("[data-empty-state]");
      this._folderBtn = card.querySelector("[data-folder-btn]");
      this._folderLabel = card.querySelector("[data-folder-label]");
      this._searchInput = card.querySelector("[data-search-input]");
      this._searchWrap = card.querySelector("[data-search-wrap]");
      this._countBadge = card.querySelector("[data-count-badge]");
      this._selectionBar = card.querySelector("[data-selection-bar]");
      this._selectionCount = card.querySelector("[data-selection-count]");
      this._nsfwPopover = card.querySelector("[data-nsfw-popover]");
      this._progressBanner = card.querySelector("[data-progress-banner]");
      this._progressFill = card.querySelector("[data-progress-fill]");
      this._progressText = card.querySelector("[data-progress-text]");

      // NSFW Toggle component
      const nsfwToggleSlot = card.querySelector("[data-nsfw-toggle-slot]");
      if (nsfwToggleSlot) {
        this._nsfwToggle = Toggle({
          label: "NSFW Blur",
          description: "Detect and blur sensitive media",
          checked: Boolean(state.nsfw_enabled),
          onChange: async (checked) => {
            state.nsfw_enabled = checked;
            const nsfwPopBtn = this._galleryCard?.querySelector("[data-btn-nsfw-pop]");
            if (nsfwPopBtn) nsfwPopBtn.classList.toggle("is-active", checked);
            this._persistState();

            if (checked) {
              await this._checkAndPromptNSFWModel();
              this._autoQueueUnscoredFiles();
            }
            this._applyNSFWBlurToAllCards();
          },
        });
        nsfwToggleSlot.appendChild(this._nsfwToggle.root);
      }

      // NSFW Sensitivity Slider component
      const sliderWrap = card.querySelector("[data-slider-wrap]");
      if (sliderWrap) {
        this._nsfwSlider = Slider({
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

      this._bindWidgetEvents();
      this._updateGridSizeCSS();

      // Attach DOM Widget to ComfyUI node
      const widget = this.addDOMWidget("gallery_ui", "custom", root, {
        serialize: false,
        hideOnZoom: false,
        margin: 0,
        getValue: () => null,
        setValue: () => { },
        getMinHeight: () => 160,
        getHeight: () => this._getWidgetHeight(),
      });
      this._galleryWidget = widget;

      widget.computeLayoutSize = () => ({
        minHeight: 160,
        minWidth: 340,
      });

      // CRITICAL: widget.computeSize()[1] is what LiteGraph uses to set the
      // CSS height of the DOM wrapper div. Must return the real desired height.
      widget.computeSize = (width) => [
        Math.max(340, Number(width) || this.size?.[0] || 480),
        this._getWidgetHeight ? this._getWidgetHeight() : Math.max(160, (this.size?.[1] || 520) - 50),
      ];

      this._syncGalleryHostHeight = () => {
        const widgetH = this._getWidgetHeight();

        // Only update computedHeight — ComfyUI reads this and sets
        // root.style.height = computedHeight × canvasScale (screen pixels).
        // Do NOT override root.style.height here; we'd be setting canvas-coord
        // units as CSS pixels which is wrong at any zoom level other than 1.0.
        if (this._galleryWidget) {
          this._galleryWidget.computedHeight = widgetH;
        }
        // Card fills root's content area via flex (root padding-bottom = 5px → 5px gap)
        if (card) {
          card.style.flex = "1 1 auto";
          card.style.minHeight = "0";
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

      // After DOM attachment, ComfyUI has assigned widget.y — sync height then.
      const doPostAttachSync = () => {
        const host = root.parentElement;
        if (host) {
          host.style.overflow = "hidden";
          host.style.borderRadius = "0 0 8px 8px";
          host.style.boxSizing = "border-box";
          host.style.margin = "0";
          host.style.padding = "0";
          host.style.background = "transparent";
        }
        this._syncGalleryHostHeight?.();
        try { this.setDirtyCanvas?.(true, true); } catch (_) {}
      };
      setTimeout(doPostAttachSync, 0);
      setTimeout(doPostAttachSync, 50);
      setTimeout(doPostAttachSync, 150);

      window.DSGlobalTheme?.bindNode?.(root, this);
    };

    // Keep DOM size in sync on every canvas draw — fires every frame while canvas is dirty.
    const origOnDrawBackground = nodeType.prototype.onDrawBackground;
    nodeType.prototype.onDrawBackground = function (ctx) {
      if (typeof origOnDrawBackground === "function") origOnDrawBackground.call(this, ctx);
      if (typeof this._syncGalleryHostHeight === "function") {
        this._syncGalleryHostHeight();
      }
    };

    // ------------------------------------------------------------------------
    // Events & Interactivity
    // ------------------------------------------------------------------------
    nodeType.prototype._bindWidgetEvents = function () {
      const card = this._galleryCard;
      const state = this.properties[PROP_KEY];

      // Folder Selector
      this._folderBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        await this._browseNativeFolder();
      });

      // Rescan button
      card.querySelector("[data-btn-rescan]").addEventListener("click", (e) => {
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

      card.querySelector("[data-search-clear]").addEventListener("click", (e) => {
        e.stopPropagation();
        this._searchInput.value = "";
        this._searchWrap.classList.remove("has-val");
        state.search_query = "";
        this._applyLocalFiltersAndRender();
      });

      // Media Filter Chips
      card.querySelectorAll("[data-filter]").forEach((chip) => {
        chip.addEventListener("click", (e) => {
          e.stopPropagation();
          const f = chip.dataset.filter;
          this._setMediaFilter(f);
        });
      });

      // Sort Menu Button
      card.querySelector("[data-btn-sort]").addEventListener("click", (e) => {
        e.stopPropagation();
        this._openSortMenu(e.currentTarget);
      });

      // NSFW Popover Button
      const nsfwPopBtn = card.querySelector("[data-btn-nsfw-pop]");
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

      // Clear NSFW Cache button
      card.querySelector("[data-btn-clear-nsfw]").addEventListener("click", async (e) => {
        e.stopPropagation();
        await this._clearNSFWCache();
      });

      // Selection bar buttons
      card.querySelector("[data-btn-select-all]").addEventListener("click", (e) => {
        e.stopPropagation();
        this._selectAll();
      });

      card.querySelector("[data-btn-clear-selection]").addEventListener("click", (e) => {
        e.stopPropagation();
        this._clearSelection();
      });

      card.querySelector("[data-btn-delete]").addEventListener("click", (e) => {
        e.stopPropagation();
        this._promptDeleteSelection();
      });

      // Native LiteGraph corner handles are used for resize (protectDSResizeCorners
      // ensures DOM widget doesn't swallow them). No custom handle needed.
    };

    nodeType.prototype._updateGridSizeCSS = function () {
      const state = this.properties[PROP_KEY];
      const sizePx = GRID_SIZES[state.grid_size] || 135;
      this._galleryCard?.style.setProperty("--ds-gallery-item-size", `${sizePx}px`);
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
        } catch (_) { }
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

      this._galleryCard?.querySelectorAll("[data-filter]").forEach((chip) => {
        chip.classList.toggle("is-active", chip.dataset.filter === state.media_filter);
      });

      this._nsfwToggle?.setValue(Boolean(state.nsfw_enabled), false);
      const nsfwPopBtn = this._galleryCard?.querySelector("[data-btn-nsfw-pop]");
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
      this._galleryCard.querySelectorAll("[data-filter]").forEach((chip) => {
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
      const current = this.properties[PROP_KEY].sort_by;
      const menuEl = document.createElement("div");
      menuEl.className = "ds-ui-popup";
      menuEl.style.position = "fixed";
      menuEl.style.zIndex = "100000";

      SORT_OPTIONS.forEach((item) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `ds-ui-popup-item ${item.id === current ? "is-selected" : ""}`;
        btn.innerHTML = `<span>${item.label}</span>${item.id === current ? DSIconMarkup("check", { size: 12 }) : ""}`;
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

      if (this._intersectionObserver) {
        this._intersectionObserver.disconnect();
      }

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

        const thumbUrl = `/ds/gallery/thumbnail?path=${encodeURIComponent(item.full_path)}&mtime=${item.mtime}`;

        itemEl.innerHTML = `
          <div class="ds-gallery-thumb-wrap">
            <img class="ds-gallery-thumb-img" data-thumb-img data-src="${thumbUrl}" alt="${item.name}" />
            ${isNSFW ? `<div class="ds-gallery-nsfw-badge">NSFW</div>` : ""}
            ${item.type === "video" ? `<div class="ds-gallery-video-badge">${DSIconMarkup("play", { size: 12 })}</div>` : ""}
            <div class="ds-gallery-select-pill">${DSIconMarkup("check", { size: 12 })}</div>
          </div>
          <div class="ds-gallery-item-footer">
            <span class="ds-gallery-item-name" title="${item.name}">${item.name}</span>
          </div>
        `;

        itemEl.addEventListener("click", (e) => {
          e.stopPropagation();
          this._handleItemClick(item, index, e);
        });

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
        if (this._selectedSet.has(item.full_path)) {
          this._selectedSet.delete(item.full_path);
        } else {
          this._selectedSet.add(item.full_path);
        }
        this._lastSelectedIndex = index;
      } else if (event.shiftKey && this._lastSelectedIndex >= 0) {
        const start = Math.min(this._lastSelectedIndex, index);
        const end = Math.max(this._lastSelectedIndex, index);
        for (let i = start; i <= end; i++) {
          if (this._filteredFiles[i]) {
            this._selectedSet.add(this._filteredFiles[i].full_path);
          }
        }
      } else {
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

      this._gridEl.querySelectorAll(".ds-gallery-item").forEach((el) => {
        const isSel = this._selectedSet.has(el.dataset.path);
        el.classList.toggle("is-selected", isSel);
      });

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
            <button type="button" class="ds-ui-btn ds-ui-btn-compact" data-cancel>Cancel</button>
            <button type="button" class="ds-ui-btn ds-ui-btn-compact ds-gallery-btn-danger" data-confirm>Delete</button>
          </div>
        </div>
      `;

      const close = () => overlay.remove();
      overlay.querySelector("[data-cancel]").addEventListener("click", close);

      overlay.querySelector("[data-confirm]").addEventListener("click", async () => {
        close();
        try {
          await fetch("/ds/gallery/delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ files: filesToDelete }),
          });
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

        this._progressBanner.style.display = "flex";
        this._progressFill.style.width = "0%";
        this._progressText.textContent = "Connecting...";

        await fetch("/ds/gallery/nsfw/download", { method: "POST" });

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
    // NSFW Batch Evaluation
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
      for (const p of this._nsfwEvalHighQueue) {
        batch.push(p);
        this._nsfwEvalHighQueue.delete(p);
        this._nsfwEvalPending.add(p);
        if (batch.length >= 24) break;
      }
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
            <button type="button" class="ds-ui-btn ds-ui-btn-compact ds-ui-btn-icon-only" data-zoom-out title="Zoom Out (-)">${DSIconMarkup("minus", { size: 14 })}</button>
            <button type="button" class="ds-ui-btn ds-ui-btn-compact ds-ui-btn-icon-only" data-zoom-reset title="Reset Zoom (0)">${DSIconMarkup("maximize-2", { size: 14 })}</button>
            <button type="button" class="ds-ui-btn ds-ui-btn-compact ds-ui-btn-icon-only" data-zoom-in title="Zoom In (+)">${DSIconMarkup("plus", { size: 14 })}</button>
            <span style="font-size: 11px; color: var(--ds-color-accent, #67e8f9); font-weight: 700; width: 42px; text-align: center;" data-zoom-pct>100%</span>
            <button type="button" class="ds-ui-btn ds-ui-btn-compact ds-ui-btn-icon-only" data-close title="Close (Esc)">${DSIconMarkup("x", { size: 14 })}</button>
          </div>
        </div>
        <div class="ds-gallery-lightbox-viewport" data-viewport>
          <img class="ds-gallery-lightbox-img" data-img src="/ds/gallery/media?path=${encodeURIComponent(currentItem.full_path)}" alt="${currentItem.name}" />
          <button type="button" class="ds-gallery-lightbox-nav ds-gallery-lightbox-prev" data-prev title="Previous (←)">${DSIconMarkup("chevron-left", { size: 18 })}</button>
          <button type="button" class="ds-gallery-lightbox-nav ds-gallery-lightbox-next" data-next title="Next (→)">${DSIconMarkup("chevron-right", { size: 18 })}</button>
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

      const closeLightbox = () => {
        document.removeEventListener("keydown", keyHandler);
        overlay.remove();
      };

      const navigate = (delta) => {
        const nextIdx = currentIndex + delta;
        if (nextIdx >= 0 && nextIdx < this._filteredFiles.length) {
          currentIndex = nextIdx;
          currentItem = this._filteredFiles[currentIndex];
          if (currentItem.type === "video") {
            closeLightbox();
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
        closeLightbox();
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

      const keyHandler = (e) => {
        if (!overlay.isConnected) {
          document.removeEventListener("keydown", keyHandler);
          return;
        }
        const activeTag = e.target?.tagName?.toLowerCase();
        if (activeTag === "input" || activeTag === "textarea" || e.target?.isContentEditable) {
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          closeLightbox();
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
      if (typeof window._dsActiveGalleryVideoPlayer === "function") {
        try { window._dsActiveGalleryVideoPlayer(); } catch (_) {}
        window._dsActiveGalleryVideoPlayer = null;
      }
      document.querySelectorAll(".ds-gallery-player-modal").forEach((el) => {
        try { el.remove(); } catch (_) {}
      });

      let currentIndex = this._getEligibleIndex(initialItem);
      let currentItem = initialItem;
      let isLooping = false;
      try {
        isLooping = localStorage.getItem("ds_gallery_video_loop") === "1";
      } catch (_) { }
      let isCover = false;
      let prevVolume = 1.0;
      let hideTimeout = null;
      let isScrubbing = false;
      let wasPlayingBeforeScrub = false;
      let scrubTargetPct = null;
      let lastScrubSeekTime = 0;
      let animFrameId = null;
      let isClosed = false;
      let currentPlayPromise = null;

      const overlay = document.createElement("div");
      overlay.className = "ds-gallery-player-modal";

      overlay.innerHTML = `
        <div class="ds-gallery-player-header" data-header>
          <div class="ds-gallery-player-header-left">
            <span class="ds-gallery-player-badge" data-counter>${currentIndex + 1} / ${this._filteredFiles.length}</span>
            <span class="ds-gallery-player-title" data-title title="${currentItem.name}">${currentItem.name}</span>
          </div>
          <div class="ds-gallery-player-header-right">
            <button type="button" class="ds-ui-btn ds-ui-btn-compact ds-ui-btn-icon-only" data-btn-fit title="Aspect Ratio: Fit / Fill (C)">
              ${SPECIAL_ICONS.fit}
            </button>
            <button type="button" class="ds-ui-btn ds-ui-btn-compact ds-ui-btn-icon-only" data-btn-pip title="Picture-in-Picture (P)">
              ${SPECIAL_ICONS.pip}
            </button>
            <button type="button" class="ds-ui-btn ds-ui-btn-compact ds-ui-btn-icon-only" data-btn-minimize title="Minimize to Dock (Pass-Through)">
              ${SPECIAL_ICONS.minimize}
            </button>
            <a class="ds-ui-btn ds-ui-btn-compact ds-ui-btn-icon-only" data-btn-download download="${currentItem.name}" href="/ds/gallery/media?path=${encodeURIComponent(currentItem.full_path)}" title="Download Video">
              ${DSIconMarkup("download", { size: 14 })}
            </a>
            <button type="button" class="ds-ui-btn ds-ui-btn-compact ds-ui-btn-icon-only" data-close title="Close (Esc)">
              ${DSIconMarkup("x", { size: 14 })}
            </button>
          </div>
        </div>

        <div class="ds-gallery-player-pip-dock" data-pip-dock style="display:none;">
          <div class="ds-gallery-player-pip-dock-info">
            <span class="ds-gallery-player-pip-dock-pulse"></span>
            <span class="ds-gallery-player-pip-dock-icon">${SPECIAL_ICONS.pip}</span>
            <span class="ds-gallery-player-pip-dock-title" data-pip-dock-title title="${currentItem.name}">${currentItem.name}</span>
            <span class="ds-gallery-player-pip-dock-time" data-pip-dock-time>00:00 / 00:00</span>
          </div>
          <div class="ds-gallery-player-pip-dock-actions">
            <button type="button" class="ds-gallery-pip-btn-restore" data-pip-restore title="Restore Full Player">
              ${DSIconMarkup("maximize-2", { size: 12 })}
              <span>Restore</span>
            </button>
            <button type="button" class="ds-ui-btn ds-ui-btn-compact ds-ui-btn-icon-only ds-gallery-pip-btn-close" data-pip-close title="Close Video">
              ${DSIconMarkup("x", { size: 12 })}
            </button>
          </div>
        </div>

        <div class="ds-gallery-player-viewport" data-viewport>
          <video class="ds-gallery-player-video" data-video playsinline preload="auto"></video>
          <div class="ds-gallery-player-splash" data-splash>
            ${DSIconMarkup("play", { size: 32 })}
          </div>
          <div class="ds-gallery-player-loading" data-loading style="display:none;">
            <div class="ds-gallery-player-spinner"></div>
            <span>Buffering...</span>
          </div>
          <div class="ds-gallery-continue-badge" data-continue-badge style="display:none;">
            <div class="ds-gallery-continue-content">
              <span class="ds-gallery-continue-icon">${DSIconMarkup("play", { size: 14 })}</span>
              <div class="ds-gallery-continue-text">
                <span class="ds-gallery-continue-label">Resume playback?</span>
                <span class="ds-gallery-continue-time" data-continue-time>00:00</span>
              </div>
              <button type="button" class="ds-gallery-continue-btn" data-btn-continue>
                Continue
              </button>
              <button type="button" class="ds-ui-btn ds-ui-btn-compact ds-ui-btn-icon-only ds-gallery-continue-close" data-btn-continue-close title="Dismiss">
                ${DSIconMarkup("x", { size: 12 })}
              </button>
            </div>
            <div class="ds-gallery-continue-progress-bar">
              <div class="ds-gallery-continue-progress-fill" data-continue-progress></div>
            </div>
          </div>
          <button type="button" class="ds-gallery-player-nav ds-gallery-player-prev" data-prev title="Previous Video (Shift+←)">${DSIconMarkup("chevron-left", { size: 18 })}</button>
          <button type="button" class="ds-gallery-player-nav ds-gallery-player-next" data-next title="Next Video (Shift+→)">${DSIconMarkup("chevron-right", { size: 18 })}</button>
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
              <button type="button" class="ds-ui-btn ds-ui-btn-compact ds-ui-btn-icon-only ds-ui-btn-primary" data-btn-play title="Play / Pause (Space)">
                ${DSIconMarkup("play", { size: 14 })}
              </button>
              <button type="button" class="ds-ui-btn ds-ui-btn-compact ds-ui-btn-icon-only" data-btn-seek-back title="Rewind 5s (←)">
                ${SPECIAL_ICONS.backward5}
              </button>
              <button type="button" class="ds-ui-btn ds-ui-btn-compact ds-ui-btn-icon-only" data-btn-seek-fwd title="Forward 5s (→)">
                ${SPECIAL_ICONS.forward5}
              </button>
              <div class="ds-gallery-player-time">
                <span data-time-cur class="ds-gallery-time-current">00:00</span>
                <span class="ds-gallery-time-sep">/</span>
                <span data-time-dur class="ds-gallery-time-total">00:00</span>
              </div>
            </div>

            <div class="ds-gallery-player-bar-right">
              <div class="ds-gallery-player-vol-group">
                <button type="button" class="ds-ui-btn ds-ui-btn-compact ds-ui-btn-icon-only" data-btn-mute title="Mute / Unmute (M)">
                  ${DSIconMarkup("volume-2", { size: 14 })}
                </button>
                <input type="range" class="ds-gallery-player-vol-slider" data-vol-slider min="0" max="1" step="0.05" value="1" title="Volume (↑/↓)">
              </div>

              <button type="button" class="ds-ui-btn ds-ui-btn-compact ${isLooping ? 'is-active' : ''}" data-btn-loop title="${isLooping ? 'Loop: On (L)' : 'Loop: Off (L)'}">
                ${SPECIAL_ICONS.loop}
                <span style="font-size:10px;margin-left:2px;font-weight:700;">Loop</span>
              </button>

              <div class="ds-gallery-player-speed-wrap" data-speed-wrap>
                <button type="button" class="ds-ui-btn ds-ui-btn-compact" data-speed-btn title="Playback Speed">1.0x</button>
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

              <button type="button" class="ds-ui-btn ds-ui-btn-compact ds-ui-btn-icon-only" data-btn-fullscreen title="Toggle Fullscreen (F)">
                ${DSIconMarkup("maximize-2", { size: 14 })}
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
      const minimizeBtn = overlay.querySelector("[data-btn-minimize]");
      const pipDock = overlay.querySelector("[data-pip-dock]");
      const pipDockTitle = overlay.querySelector("[data-pip-dock-title]");
      const pipDockTime = overlay.querySelector("[data-pip-dock-time]");
      const pipDockRestore = overlay.querySelector("[data-pip-restore]");
      const pipDockClose = overlay.querySelector("[data-pip-close]");
      const continueBadge = overlay.querySelector("[data-continue-badge]");
      const continueTimeEl = overlay.querySelector("[data-continue-time]");
      const continueBtn = overlay.querySelector("[data-btn-continue]");
      const continueCloseBtn = overlay.querySelector("[data-btn-continue-close]");
      const continueProgress = overlay.querySelector("[data-continue-progress]");
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

      let isPipMode = false;
      let continueTimer = null;
      let pendingResumeTime = 0;
      let lastSaveResumeTime = 0;

      const setPipMode = (active) => {
        isPipMode = Boolean(active);
        overlay.classList.toggle("is-pip-mode", isPipMode);
        if (isPipMode) {
          pipDock.style.display = "flex";
          pipDockTitle.textContent = currentItem?.name || "Media Player";
          pipDockTitle.title = currentItem?.name || "Media Player";
          pipDockTime.textContent = `${formatDuration(video.currentTime || 0)} / ${formatDuration(video.duration || 0)}`;
        } else {
          pipDock.style.display = "none";
        }
      };

      const hideContinueBadge = () => {
        if (continueTimer) {
          clearTimeout(continueTimer);
          continueTimer = null;
        }
        if (continueBadge) {
          continueBadge.style.display = "none";
        }
      };

      const showContinueBadge = (savedTime) => {
        hideContinueBadge();
        if (!Number.isFinite(savedTime) || savedTime < 5) return;
        pendingResumeTime = savedTime;
        if (continueTimeEl) {
          continueTimeEl.textContent = `Resume from ${formatDuration(savedTime)}`;
        }
        if (continueProgress) {
          continueProgress.style.animation = "none";
          void continueProgress.offsetWidth;
          continueProgress.style.animation = "ds-continue-shrink 10s linear forwards";
        }
        if (continueBadge) {
          continueBadge.style.display = "block";
        }
        continueTimer = setTimeout(() => {
          hideContinueBadge();
        }, 10000);
      };

      const safePlay = () => {
        if (isClosed) return;
        try {
          const p = video.play();
          if (p !== undefined) {
            currentPlayPromise = p;
            p.then(() => {
              if (isClosed) {
                video.pause();
                video.removeAttribute("src");
                video.src = "";
                try { video.load(); } catch (_) {}
              }
            }).catch(() => {});
          }
        } catch (_) {}
      };

      const syncProgressUI = (curTime, durTime) => {
        const cur = Number.isFinite(curTime) ? curTime : video.currentTime || 0;
        const dur = Number.isFinite(durTime) ? durTime : video.duration || 1;
        const pct = dur > 0 ? Math.max(0, Math.min(100, (cur / dur) * 100)) : 0;
        fill.style.width = `${pct}%`;
        timeCur.textContent = formatDuration(cur);
        if (Number.isFinite(video.duration) && video.duration > 0) {
          timeDur.textContent = formatDuration(video.duration);
        }
        if (isPipMode && pipDockTime) {
          pipDockTime.textContent = `${formatDuration(cur)} / ${formatDuration(Number.isFinite(video.duration) ? video.duration : 0)}`;
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
        splashEl.innerHTML = isPlay ? DSIconMarkup("play", { size: 32 }) : DSIconMarkup("pause", { size: 32 });
        splashEl.classList.remove("is-splashing");
        void splashEl.offsetWidth;
        splashEl.classList.add("is-splashing");
        setTimeout(() => splashEl.classList.remove("is-splashing"), 320);
      };

      const loadingEl = overlay.querySelector("[data-loading]");
      const showLoading = (show) => {
        if (!loadingEl) return;
        loadingEl.style.display = show ? "flex" : "none";
      };

      const loadVideo = (f) => {
        if (isClosed) return;
        stopProgressLoop();
        hideContinueBadge();
        currentItem = f;
        titleEl.textContent = f.name;
        titleEl.title = f.name;
        if (pipDockTitle) {
          pipDockTitle.textContent = f.name;
          pipDockTitle.title = f.name;
        }
        counterEl.textContent = `${currentIndex + 1} / ${this._filteredFiles.length}`;
        const url = `/ds/gallery/media?path=${encodeURIComponent(f.full_path)}`;
        downloadBtn.href = url;
        downloadBtn.download = f.name;
        video.pause();
        video.preload = "auto";
        video.src = url;
        video.loop = isLooping;
        fill.style.width = "0%";
        buffered.style.width = "0%";
        timeCur.textContent = "00:00";
        timeDur.textContent = "00:00";
        showLoading(true);
        safePlay();
        resetHideTimer();

        const savedResume = getResume(f.full_path || f.name);
        if (savedResume && savedResume.time >= 5) {
          showContinueBadge(savedResume.time);
        }
      };

      const togglePlay = () => {
        if (isClosed) return;
        if (video.paused) {
          safePlay();
          showSplash(true);
        } else {
          video.pause();
          showSplash(false);
        }
      };

      const updateLoopState = () => {
        video.loop = isLooping;
        loopBtn.classList.toggle("is-active", isLooping);
        loopBtn.title = isLooping ? "Loop: On (L)" : "Loop: Off (L)";
        try {
          localStorage.setItem("ds_gallery_video_loop", isLooping ? "1" : "0");
        } catch (_) { }
      };
      updateLoopState();

      loopBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        isLooping = !isLooping;
        updateLoopState();
        resetHideTimer();
      });

      fitBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        isCover = !isCover;
        video.classList.toggle("is-cover", isCover);
        fitBtn.innerHTML = isCover ? SPECIAL_ICONS.cover : SPECIAL_ICONS.fit;
        fitBtn.title = isCover ? "Aspect Ratio: Fill/Crop (C)" : "Aspect Ratio: Fit/Contain (C)";
        resetHideTimer();
      });

      video.addEventListener("enterpictureinpicture", () => {
        setPipMode(true);
      });

      video.addEventListener("leavepictureinpicture", () => {
        setPipMode(false);
      });

      if (document.pictureInPictureEnabled && typeof video.requestPictureInPicture === "function") {
        pipBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          try {
            if (document.pictureInPictureElement) {
              await document.exitPictureInPicture();
              setPipMode(false);
            } else {
              await video.requestPictureInPicture();
              setPipMode(true);
            }
          } catch (_) { }
          resetHideTimer();
        });
      } else {
        pipBtn?.remove();
      }

      minimizeBtn?.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (document.pictureInPictureEnabled && typeof video.requestPictureInPicture === "function" && !document.pictureInPictureElement) {
          try {
            await video.requestPictureInPicture();
          } catch (_) {}
        }
        setPipMode(true);
      });

      pipDockRestore?.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (document.pictureInPictureElement) {
          try { await document.exitPictureInPicture(); } catch (_) {}
        }
        setPipMode(false);
      });

      pipDockClose?.addEventListener("click", (e) => {
        e.stopPropagation();
        closePlayer();
      });

      continueBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        if (pendingResumeTime > 0 && Number.isFinite(pendingResumeTime)) {
          video.currentTime = pendingResumeTime;
          safePlay();
        }
        hideContinueBadge();
      });

      continueCloseBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        hideContinueBadge();
      });

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

      const updateVolumeUI = () => {
        volSlider.value = video.muted ? 0 : video.volume;
        muteBtn.innerHTML = video.muted || video.volume === 0
          ? DSIconMarkup("volume-x", { size: 14 })
          : DSIconMarkup("volume-2", { size: 14 });
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

      const updateFullscreenIcon = () => {
        const isFs = Boolean(document.fullscreenElement);
        fullscreenBtn.innerHTML = isFs ? DSIconMarkup("minimize-2", { size: 14 }) : DSIconMarkup("maximize-2", { size: 14 });
      };

      fullscreenBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!document.fullscreenElement) {
          overlay.requestFullscreen?.().catch(() => { });
        } else {
          document.exitFullscreen?.().catch(() => { });
        }
        resetHideTimer();
      });

      document.addEventListener("fullscreenchange", updateFullscreenIcon);

      video.addEventListener("play", () => {
        playBtn.innerHTML = DSIconMarkup("pause", { size: 14 });
        startProgressLoop();
        resetHideTimer();
      });

      video.addEventListener("pause", () => {
        playBtn.innerHTML = DSIconMarkup("play", { size: 14 });
        stopProgressLoop();
        syncProgressUI();
        clearTimeout(hideTimeout);
        overlay.classList.remove("is-inactive");
        if (currentItem && Number.isFinite(video.currentTime)) {
          saveResume(currentItem.full_path || currentItem.name, video.currentTime, video.duration, currentItem.name);
        }
      });

      video.addEventListener("ended", () => {
        stopProgressLoop();
        syncProgressUI();
        if (currentItem) {
          clearResume(currentItem.full_path || currentItem.name);
        }
        if (!isLooping) {
          playBtn.innerHTML = DSIconMarkup("play", { size: 14 });
          clearTimeout(hideTimeout);
          overlay.classList.remove("is-inactive");
        }
      });

      video.addEventListener("timeupdate", () => {
        if (!isScrubbing && !animFrameId) {
          syncProgressUI();
        }
        const now = performance.now();
        if (now - lastSaveResumeTime > 3000) {
          lastSaveResumeTime = now;
          if (currentItem && !video.paused && Number.isFinite(video.currentTime)) {
            saveResume(currentItem.full_path || currentItem.name, video.currentTime, video.duration, currentItem.name);
          }
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
          overlay.requestFullscreen?.().catch(() => { });
        } else {
          document.exitFullscreen?.().catch(() => { });
        }
      });

      video.addEventListener("waiting", () => showLoading(true));
      video.addEventListener("seeking", () => {
        if (!isScrubbing) showLoading(true);
      });
      video.addEventListener("loadstart", () => showLoading(true));
      video.addEventListener("loadeddata", () => showLoading(false));
      video.addEventListener("canplay", () => showLoading(false));
      video.addEventListener("playing", () => showLoading(false));
      video.addEventListener("seeked", () => {
        showLoading(false);
        if (!isScrubbing) {
          syncProgressUI();
        }
      });
      video.addEventListener("error", () => showLoading(false));

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

      const applyScrubFramePreview = (pct) => {
        const now = performance.now();
        // Throttle frame seeks during drag to avoid thrashed Range requests on large files.
        // Only seek if previous seek has settled (!video.seeking) and at least 150ms has passed.
        if (!video.seeking && now - lastScrubSeekTime > 150) {
          lastScrubSeekTime = now;
          const targetTime = pct * (video.duration || 0);
          if (typeof video.fastSeek === "function") {
            try { video.fastSeek(targetTime); } catch (_) { video.currentTime = targetTime; }
          } else {
            video.currentTime = targetTime;
          }
        }
      };

      const handleScrubMove = (e) => {
        const r = timeline.getBoundingClientRect();
        if (!r.width) return;
        const pct = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
        scrubTargetPct = pct;
        updateScrubUI(pct, r);
        applyScrubFramePreview(pct);
      };

      scrubberZone.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        isScrubbing = true;
        overlay.classList.add("is-scrubbing");

        stopProgressLoop();
        wasPlayingBeforeScrub = !video.paused && !video.ended;
        if (wasPlayingBeforeScrub) {
          video.pause();
        }

        handleScrubMove(e);

        const onMove = (ev) => {
          if (!isScrubbing) return;
          handleScrubMove(ev);
        };

        const onUp = (ev) => {
          if (!isScrubbing) return;
          isScrubbing = false;
          overlay.classList.remove("is-scrubbing");

          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
          window.removeEventListener("pointercancel", onUp);

          const r = timeline.getBoundingClientRect();
          const pct = scrubTargetPct !== null ? scrubTargetPct : (r.width ? Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) : 0);
          scrubTargetPct = null;

          if (Number.isFinite(video.duration) && video.duration > 0) {
            const finalTime = Math.max(0, Math.min(video.duration, pct * video.duration));
            video.currentTime = finalTime;
            updateScrubUI(pct, r);
          }

          if (wasPlayingBeforeScrub && !isClosed) {
            const onSeekedResume = () => {
              video.removeEventListener("seeked", onSeekedResume);
              if (!isClosed && !isScrubbing) {
                safePlay();
                startProgressLoop();
              }
            };
            if (video.seeking) {
              video.addEventListener("seeked", onSeekedResume, { once: true });
              setTimeout(() => {
                if (!isClosed && !isScrubbing && video.paused && wasPlayingBeforeScrub) {
                  safePlay();
                  startProgressLoop();
                }
              }, 400);
            } else {
              safePlay();
              startProgressLoop();
            }
          }
          resetHideTimer();
        };

        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        window.addEventListener("pointercancel", onUp);
      });

      const navigate = (delta) => {
        const nextIdx = currentIndex + delta;
        if (nextIdx >= 0 && nextIdx < this._filteredFiles.length) {
          currentIndex = nextIdx;
          const nextItem = this._filteredFiles[currentIndex];
          if (nextItem.type === "image") {
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

      const closePlayer = () => {
        if (isClosed) return;
        isClosed = true;
        hideContinueBadge();
        showLoading(false);
        if (window._dsActiveGalleryVideoPlayer === closePlayer) {
          window._dsActiveGalleryVideoPlayer = null;
        }
        stopProgressLoop();
        clearTimeout(hideTimeout);
        document.removeEventListener("keydown", keyHandler);
        document.removeEventListener("pointerdown", onSpeedOutsideClick);
        document.removeEventListener("fullscreenchange", updateFullscreenIcon);
        if (currentItem && Number.isFinite(video.currentTime)) {
          saveResume(currentItem.full_path || currentItem.name, video.currentTime, video.duration, currentItem.name);
        }
        if (document.pictureInPictureElement) {
          try { document.exitPictureInPicture(); } catch (_) {}
        }
        try {
          video.pause();
          video.removeAttribute("src");
          video.src = "";
          video.load();
        } catch (_) {}
        if (document.fullscreenElement) {
          document.exitFullscreen?.().catch(() => {});
        }
        overlay.remove();
      };
      window._dsActiveGalleryVideoPlayer = closePlayer;

      overlay.querySelector("[data-close]").addEventListener("click", (e) => {
        e.stopPropagation();
        closePlayer();
      });

      const keyHandler = (e) => {
        if (isClosed || !overlay.isConnected) {
          document.removeEventListener("keydown", keyHandler);
          return;
        }
        if (isPipMode || overlay.classList.contains("is-pip-mode")) {
          return;
        }
        const activeTag = e.target?.tagName?.toLowerCase();
        if (activeTag === "input" || activeTag === "textarea" || e.target?.isContentEditable) {
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
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
          e.preventDefault();
          muteBtn.click();
        } else if (e.key === "l" || e.key === "L") {
          e.preventDefault();
          loopBtn.click();
        } else if (e.key === "f" || e.key === "F") {
          e.preventDefault();
          fullscreenBtn.click();
        } else if (e.key === "c" || e.key === "C") {
          e.preventDefault();
          fitBtn.click();
        } else if (e.key === "p" || e.key === "P") {
          e.preventDefault();
          pipBtn?.click();
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
        this._galleryCard
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
      this._closeGalleryGearPopover();
      window.DSGearMenu?.closePopover?.();

      document.querySelectorAll(".ds-gallery-settings-popover").forEach((el) => el.remove());

      const anchor = anchorEl || this._findToolboxAnchor();
      const state = this.properties[PROP_KEY] || { ...DEFAULT_SETTINGS };
      const folderName = state.folder_path ? (state.folder_path.split(/[\\/]/).pop() || state.folder_path) : "No Folder Selected";

      const popover = document.createElement("div");
      popover.className = "ds-ui-popup ds-gallery-settings-popover";
      popover.dataset.dsThemed = "true";

      popover.innerHTML = `
        <div class="ds-gallery-settings-header">
          <div class="ds-gallery-settings-header-left">
            <div class="ds-gallery-brand">DS</div>
            <div class="ds-gallery-settings-title-wrap">
              <span class="ds-gallery-settings-title">DS Gallery Settings</span>
              <span class="ds-gallery-settings-subtitle" title="${state.folder_path || "No Folder Selected"}">${folderName}</span>
            </div>
          </div>
          <button type="button" class="ds-ui-btn ds-ui-btn-compact ds-ui-btn-icon-only" data-close-btn title="Close (Esc)">
            ${DSIconMarkup("x", { size: 14 })}
          </button>
        </div>

        <div class="ds-gallery-settings-section">
          <div class="ds-gallery-settings-section-title">Grid Size</div>
          <div class="ds-gallery-settings-segmented" data-grid-size-group>
            <button type="button" class="ds-ui-btn ds-ui-btn-compact ${state.grid_size === "tiny" ? "is-active" : ""}" data-size="tiny">Tiny</button>
            <button type="button" class="ds-ui-btn ds-ui-btn-compact ${state.grid_size === "small" ? "is-active" : ""}" data-size="small">Small</button>
            <button type="button" class="ds-ui-btn ds-ui-btn-compact ${state.grid_size === "medium" ? "is-active" : ""}" data-size="medium">Medium</button>
            <button type="button" class="ds-ui-btn ds-ui-btn-compact ${state.grid_size === "large" ? "is-active" : ""}" data-size="large">Large</button>
            <button type="button" class="ds-ui-btn ds-ui-btn-compact ${state.grid_size === "huge" ? "is-active" : ""}" data-size="huge">Huge</button>
          </div>
        </div>

        <div class="ds-gallery-settings-section">
          <div class="ds-gallery-settings-section-title">Show Only</div>
          <div class="ds-gallery-settings-segmented" data-media-filter-group>
            <button type="button" class="ds-ui-btn ds-ui-btn-compact ${state.media_filter === "all" ? "is-active" : ""}" data-filter="all">All Media</button>
            <button type="button" class="ds-ui-btn ds-ui-btn-compact ${state.media_filter === "images" ? "is-active" : ""}" data-filter="images">Images</button>
            <button type="button" class="ds-ui-btn ds-ui-btn-compact ${state.media_filter === "videos" ? "is-active" : ""}" data-filter="videos">Videos</button>
          </div>
        </div>

        <div class="ds-gallery-settings-section">
          <div class="ds-gallery-settings-section-title">Sort Media</div>
          <div data-sort-dropdown-slot></div>
        </div>

        <div class="ds-gallery-settings-section" data-sneak-toggle-slot></div>
        <div class="ds-gallery-settings-section" data-nsfw-toggle-slot></div>
        <div class="ds-gallery-settings-section" data-nsfw-slider-slot style="display: ${state.nsfw_enabled ? "flex" : "none"};"></div>

        <div class="ds-gallery-settings-actions">
          <button type="button" class="ds-ui-btn ds-ui-btn-compact" data-btn-rescan title="Rescan media in selected folder" style="width: 100%;">
            ${DSIconMarkup("refresh-cw", { size: 12 })}
            <span>Rescan Folder</span>
          </button>
          <div class="ds-gallery-settings-btn-group">
            <button type="button" class="ds-ui-btn ds-ui-btn-compact" style="flex: 1;" data-btn-clear-nsfw title="Clear cached NSFW scores">
              Clear NSFW Cache
            </button>
            <button type="button" class="ds-ui-btn ds-ui-btn-compact" style="flex: 1;" data-btn-clear-thumb title="Clear cached thumbnail images">
              Clear Thumb Cache
            </button>
          </div>
        </div>
      `;

      // Mount Sort Dropdown component
      const sortSlot = popover.querySelector("[data-sort-dropdown-slot]");
      if (sortSlot) {
        const sortDropdown = Dropdown({
          options: SORT_OPTIONS,
          value: state.sort_by,
          onChange: (val) => {
            this._setSort(val);
          },
        });
        sortSlot.appendChild(sortDropdown.root);
      }

      // Mount Sneak Peek toggle component
      const sneakSlot = popover.querySelector("[data-sneak-toggle-slot]");
      if (sneakSlot) {
        const sneakToggle = Toggle({
          label: "Sneak Peek",
          description: "Hover to reveal · Safe for recording / streaming",
          checked: Boolean(state.sneak_peek),
          onChange: (checked) => {
            state.sneak_peek = checked;
            this._persistState();
            this._updateSneakPeekDOM();
          },
        });
        sneakSlot.appendChild(sneakToggle.root);
      }

      // Mount NSFW Protection toggle and slider components
      const nsfwSlot = popover.querySelector("[data-nsfw-toggle-slot]");
      const sliderSlot = popover.querySelector("[data-nsfw-slider-slot]");
      let popoverSlider = null;

      if (sliderSlot) {
        popoverSlider = Slider({
          min: 0,
          max: 100,
          step: 1,
          value: Math.round((state.nsfw_threshold ?? 0.65) * 100),
          label: "Detection Sensitivity",
          suffix: "%",
          onChange: (val) => {
            state.nsfw_threshold = val / 100;
            this._persistState();
            this._applyNSFWBlurToAllCards();
          },
        });
        sliderSlot.appendChild(popoverSlider.root);
      }

      if (nsfwSlot) {
        const nsfwToggle = Toggle({
          label: "NSFW Protection",
          description: state.nsfw_enabled ? "Active" : "Disabled",
          checked: Boolean(state.nsfw_enabled),
          onChange: async (checked) => {
            await this._toggleNSFW();
            if (sliderSlot) sliderSlot.style.display = checked ? "flex" : "none";
          },
        });
        nsfwSlot.appendChild(nsfwToggle.root);
      }

      // Wire interactive events
      popover.querySelector("[data-close-btn]").addEventListener("click", (e) => {
        e.stopPropagation();
        this._closeGalleryGearPopover();
      });

      popover.querySelectorAll("[data-size]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const sz = btn.dataset.size;
          this._setGridSize(sz);
          popover.querySelectorAll("[data-size]").forEach((b) => b.classList.toggle("is-active", b.dataset.size === sz));
        });
      });

      popover.querySelectorAll("[data-filter]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const f = btn.dataset.filter;
          this._setMediaFilter(f);
          popover.querySelectorAll("[data-filter]").forEach((b) => b.classList.toggle("is-active", b.dataset.filter === f));
        });
      });

      popover.querySelector("[data-btn-rescan]").addEventListener("click", (e) => {
        e.stopPropagation();
        this._scanFolder();
      });

      popover.querySelector("[data-btn-clear-nsfw]").addEventListener("click", async (e) => {
        e.stopPropagation();
        await this._clearNSFWCache();
      });

      popover.querySelector("[data-btn-clear-thumb]").addEventListener("click", async (e) => {
        e.stopPropagation();
        await this._clearThumbCache();
      });

      document.body.appendChild(popover);
      this._activeGearPopover = popover;
      this._activeGearAnchor = anchor;
      if (anchor?.classList) anchor.classList.add("is-active");

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

        if (left + popRect.width > window.innerWidth - 12) {
          left = window.innerWidth - popRect.width - 12;
        }
        if (left < 12) left = 12;

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

      const onPointerDown = (e) => {
        if (popover.contains(e.target)) return;
        if (anchor && (anchor === e.target || anchor.contains(e.target))) return;
        this._closeGalleryGearPopover();
      };

      const onKeyDown = (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          this._closeGalleryGearPopover();
        }
      };

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
