/**
 * DeathshotArsenal — DS Prompt Cards Extension
 * Overhauled with UIElements design system and Card-as-Base hierarchy.
 *
 * - Unified Card primitive as the visual base & DOM widget root (5px margin rule)
 * - Grid + List views with dynamic content scaling
 * - Small (S: 90px compact thumbnails), Med (M: 170px balanced), Large (L: 270px spacious)
 * - Smooth 120 FPS resizing without layout thrashing
 * - Copy prompt and Paste from clipboard button on each card and detail modal
 * - Auto-saving prompt textarea with disk persistence (/ds/promptcards/cards)
 * - Drag-and-drop reorder & image drag-and-drop
 * - Pinned filter, Image/Video type filter, and instant search
 * - Large preview & edit modal with responsive theme bridge
 * - Tiny UI state serialization in workflow (avoids heavy 10MB draft bug)
 */

import { app } from "/scripts/app.js";
import {
  DSIconMarkup,
  installDSUI,
  normalizeDSWidgetHost,
  protectDSResizeCorners,
} from "../UIElements/index.js";

installDSUI();

const CSS_HREF = "/extensions/DeathshotArsenal/Prompt Cards/ds_prompt_cards.css";
const cacheBustHref = `${CSS_HREF}?v=${Date.now()}`;
let cssLink = document.querySelector(`link[data-ds-prompt-cards="1"], link[href*="ds_prompt_cards.css"]`);
if (!cssLink) {
  cssLink = document.createElement("link");
  cssLink.rel = "stylesheet";
  cssLink.href = cacheBustHref;
  cssLink.dataset.dsPromptCards = "1";
  document.head.appendChild(cssLink);
} else {
  cssLink.href = cacheBustHref;
}

// Inline SVGs optimized for DeathshotArsenal
const ICONS = {
  grid: `<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>`,
  list: `<svg viewBox="0 0 24 24"><circle cx="4" cy="6" r="1.5"/><circle cx="4" cy="12" r="1.5"/><circle cx="4" cy="18" r="1.5"/><path d="M8 6h13M8 12h13M8 18h13"/></svg>`,
  plus: `<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>`,
  copy: `<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="1.5"/><path d="M4 16V5a1.5 1.5 0 0 1 1.5-1.5H16"/></svg>`,
  paste: `<svg viewBox="0 0 24 24"><path d="M15 2H9a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1Z"/><path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/><path d="M16 4h2a2 2 0 0 1 2 2v4"/><path d="M21 14H11"/><path d="m15 10-4 4 4 4"/></svg>`,
  trash: `<svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m-9 0v12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V6"/><path d="M10 11v6M14 11v6"/></svg>`,
  pin: `<svg viewBox="0 0 24 24"><path d="M12 2l2.5 6.5L22 10l-5 4.8 1.2 6.7L12 18.5 5.8 21.5 7 14.8 2 10l7.5-1.5L12 2z"/></svg>`,
  pinFilled: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.5 6.5L22 10l-5 4.8 1.2 6.7L12 18.5 5.8 21.5 7 14.8 2 10l7.5-1.5L12 2z"/></svg>`,
  image: `<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="M21 16l-5-5-7 7-2-2-4 4"/></svg>`,
  video: `<svg viewBox="0 0 24 24"><rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/></svg>`,
  search: `<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>`,
  upload: `<svg viewBox="0 0 24 24"><path d="M12 19V6m0 0l-4 4m4-4l4 4"/><path d="M5 19h14"/></svg>`,
  expand: `<svg viewBox="0 0 24 24"><path d="M15 3h6v6M9 21H3v-6M21 9l-7 7M3 15l7-7"/></svg>`,
  export: `<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
  import: `<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,
};

function uid() {
  return "pc_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 9);
}

function debounce(fn, ms = 280) {
  let t;
  let lastThis;
  let lastArgs;

  const debounced = function (...args) {
    lastThis = this;
    lastArgs = args;
    clearTimeout(t);
    t = setTimeout(() => {
      fn.apply(lastThis, lastArgs);
    }, ms);
  };

  debounced.flush = function () {
    clearTimeout(t);
    if (lastThis !== undefined) {
      fn.apply(lastThis, lastArgs || []);
    }
  };

  return debounced;
}

// Resize image client-side before saving to disk
async function fileToOptimizedDataUrl(file, maxSide = 480) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxSide || height > maxSide) {
          if (width > height) {
            height = Math.round((height / width) * maxSide);
            width = maxSide;
          } else {
            width = Math.round((width / height) * maxSide);
            height = maxSide;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d", { alpha: true });
        ctx.drawImage(img, 0, 0, width, height);

        let data;
        try {
          data = canvas.toDataURL("image/webp", 0.88);
        } catch (_) {
          data = canvas.toDataURL("image/jpeg", 0.90);
        }
        resolve(data);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

const MIN_NODE_WIDTH = 340;
const MIN_NODE_HEIGHT = 260;
const CARD_MARGIN = 5;

app.registerExtension({
  name: "DeathshotArsenal.PromptCards",

  async beforeRegisterNodeDef(nodeType, nodeData, app) {
    if (nodeData.name !== "DS_PromptCards") return;

    const onNodeCreated = nodeType.prototype.onNodeCreated;
    const onConfigure = nodeType.prototype.onConfigure;

    nodeType.prototype.onNodeCreated = function () {
      const result = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;

      this.inputs = [];
      this.outputs = [];

      const currentSize = Array.isArray(this.size) ? this.size : [600, 580];
      this.size = [
        Math.max(MIN_NODE_WIDTH, Number(currentSize[0]) || 600),
        Math.max(MIN_NODE_HEIGHT, Number(currentSize[1]) || 580),
      ];

      this.resizable = true;

      // ============================================================
      // STATE
      // ============================================================
      this.cards = [];
      this.viewMode = "grid";
      this.filter = "all";
      this.search = "";
      this.previewSize = "med"; // "small" | "med" | "large"

      // ============================================================
      // DISK PERSISTENCE
      // ============================================================
      this._saveToServer = debounce(async function () {
        try {
          const res = await fetch("/ds/promptcards/cards", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cards: this.cards }),
          });
          if (!res.ok) {
            console.warn("[DS Prompt Cards] Disk save failed:", res.status);
          }
        } catch (e) {
          console.warn("[DS Prompt Cards] Disk save error:", e);
        }
      }, 550);

      // ============================================================
      // WORKFLOW STATE WIDGET (UI State Only)
      // ============================================================
      this.stateWidget = this.addWidget("text", "cards_state", "{}", () => {}, { hidden: true });
      this._hideStateWidget();

      // ============================================================
      // CARD ROOT AS VISIBLE DOM WIDGET SURFACE (Canonical 5px / 10px Geometry)
      // ============================================================
      const root = document.createElement("div");
      root.className = "ds-ui-card ds-prompt-cards-card";
      root.dataset.dsThemed = "true";

      this.root = root;
      this._buildUI();

      const domWidget = this.addDOMWidget("prompt_cards_ui", "custom", this.root, {
        serialize: false,
        margin: CARD_MARGIN, // exactly 5px margin from node base
        getMinHeight: () => MIN_NODE_HEIGHT - 10,
        // NEVER supply getMaxHeight: ComfyUI naturally assigns all remaining node height!
      });
      domWidget.serialize = false;

      // Card starts exactly 5px below the node top / socket rows (removes ComfyUI's +2px default offset)
      Object.defineProperty(this, "widgets_start_y", {
        configurable: true,
        get() {
          const slotH = globalThis.LiteGraph?.NODE_SLOT_HEIGHT ?? 20;
          const inputs = (this.inputs ?? []).filter((i) => !i.widget).length;
          const outputs = (this.outputs ?? []).length;
          const rows = Math.max(inputs, outputs);
          return rows ? rows * slotH + (this.constructor.slot_start_y || 0) : 0;
        },
        set() {},
      });

      // Canvas hit-test bypass for empty card areas so node can be dragged and corner-resized:
      const baseGetWidgetOnPos = this.getWidgetOnPos;
      this.getWidgetOnPos = function (...args) {
        const hit = baseGetWidgetOnPos.apply(this, args);
        return hit === domWidget ? undefined : hit;
      };

      this.domWidget = domWidget;
      protectDSResizeCorners(this);
      normalizeDSWidgetHost(this.root, this, { shell: false });

      // Enforce zero native scrollbar on the parent host container
      requestAnimationFrame(() => {
        if (root.parentElement) {
          root.parentElement.style.setProperty("overflow", "hidden", "important");
          root.parentElement.style.setProperty("scrollbar-width", "none", "important");
        }
      });

      this.computeSize = function (out) {
        const size = out || [MIN_NODE_WIDTH, MIN_NODE_HEIGHT];
        size[0] = Math.max(size[0], MIN_NODE_WIDTH);
        size[1] = Math.max(size[1], MIN_NODE_HEIGHT);
        return size;
      };

      this._applySizeConfig();

      if (window.DSGlobalTheme && this.root) {
        window.DSGlobalTheme.bindNode?.(this.root, this);
        window.DSGlobalTheme.applyNodeBase?.(this);
      }

      this._hideStateWidget();

      // Load library from disk and render
      setTimeout(async () => {
        await this._loadFromServer();
        this._restoreState();
        this._applySizeConfig();
        this._render();
        this._wireGlobal();
        this._hideStateWidget();
      }, 70);

      return result;
    };

    // ============================================================
    // RESIZE (Silky smooth 120 FPS, Flexbox layout, Zero DOM reflows)
    // ============================================================
    nodeType.prototype.onResize = function (size) {
      if (size[0] < MIN_NODE_WIDTH) size[0] = MIN_NODE_WIDTH;
      if (size[1] < MIN_NODE_HEIGHT) size[1] = MIN_NODE_HEIGHT;
    };

    // ============================================================
    // CONFIGURE
    // ============================================================
    nodeType.prototype.onConfigure = function () {
      if (onConfigure) onConfigure.apply(this, arguments);

      setTimeout(async () => {
        this._hideStateWidget();
        await this._loadFromServer();
        this._restoreState();
        this._applySizeConfig();
        if (this._render) this._render();
      }, 110);
    };

    // ============================================================
    // HIDE STATE WIDGET
    // ============================================================
    nodeType.prototype._hideStateWidget = function () {
      const widgets = this.widgets || [];
      widgets.forEach((w) => {
        if (w && w.name === "cards_state") {
          w.hidden = true;
          w.type = "hidden";
          if (w.inputEl) {
            w.inputEl.style.display = "none";
            w.inputEl.style.height = "0";
            w.inputEl.style.opacity = "0";
            w.inputEl.style.pointerEvents = "none";
          }
          w.computeSize = () => [0, 0];
          w.draw = () => {};
        }
      });
      if (this.stateWidget) {
        this.stateWidget.hidden = true;
        this.stateWidget.computeSize = () => [0, 0];
      }
    };

    // ============================================================
    // LOAD LIBRARY FROM DISK
    // ============================================================
    nodeType.prototype._loadFromServer = async function () {
      try {
        const res = await fetch("/ds/promptcards/cards");
        if (!res.ok) throw new Error("bad response");

        const json = await res.json();
        let loaded = Array.isArray(json.cards) ? json.cards : [];

        // Legacy migration check
        let migratedLegacy = false;
        if (loaded.length === 0 && this.stateWidget?.value) {
          try {
            const snap = JSON.parse(this.stateWidget.value || "{}");
            if (Array.isArray(snap.cards) && snap.cards.length > 0) {
              loaded = snap.cards;
              migratedLegacy = true;
              console.info("[DS Prompt Cards] Migrated legacy library:", loaded.length, "cards");
            }
          } catch (_) {}
        }

        this.cards = loaded;

        // Normalize card objects
        this.cards.forEach((c) => {
          if (!c.id) c.id = uid();
          if (typeof c.pinned !== "boolean") c.pinned = !!c.pinned;
          c.type = c.type === "video" ? "video" : "image";
          if (!c.ts) c.ts = Date.now();
        });

        if (loaded.length > 0) {
          this._saveToServer && this._saveToServer();
        }

        if (migratedLegacy) {
          this._saveState();
        }
      } catch (e) {
        console.warn("[DS Prompt Cards] Could not load from server, starting empty:", e);
        this.cards = [];
      }
    };

    // ============================================================
    // UPDATE HEIGHT & SCROLL CONTAINER (Handled natively by CSS Flexbox)
    // ============================================================
    nodeType.prototype._updateHeight = function () {};

    // ============================================================
    // BUILD UI STRUCTURE
    // ============================================================
    nodeType.prototype._buildUI = function () {
      this.root.innerHTML = `
        <div class="ds-cards-header-wrap">
          <div class="ds-cards-header">
            <div class="ds-cards-title">
              <span class="logo">◈</span>
              <span>Prompt Cards</span>
              <span class="ds-cards-count" data-count>0</span>
            </div>

            <div class="ds-segmented" data-view-toggle role="group" aria-label="View mode">
              <button data-view="grid" class="active" type="button" aria-label="Grid view" title="Grid view">${ICONS.grid}</button>
              <button data-view="list" type="button" aria-label="List view" title="List view">${ICONS.list}</button>
            </div>

            <div class="ds-segmented ds-size-toggle" data-size-toggle role="group" aria-label="Content size">
              <button data-size="small" type="button" title="Small (Thumbnail size)">S</button>
              <button data-size="med" class="active" type="button" title="Medium (Balanced size)">M</button>
              <button data-size="large" type="button" title="Large (Spacious size)">L</button>
            </div>

            <button class="ds-btn primary" data-add type="button" title="Add new card">
              ${ICONS.plus}
              <span>Add</span>
            </button>

            <div class="ds-header-spacer"></div>

            <button class="ds-icon-btn" data-export title="Export all cards (JSON)">${ICONS.export}</button>
            <button class="ds-icon-btn" data-import title="Import / Merge cards (JSON)">${ICONS.import}</button>
          </div>

          <div class="ds-cards-subtoolbar">
            <div class="ds-filters" role="group" aria-label="Prompt filters">
              <button class="ds-filter-pill active" data-filter="all" type="button">All</button>
              <button class="ds-filter-pill" data-filter="pinned" type="button">${ICONS.pin} <span>Pinned</span></button>
              <button class="ds-filter-pill" data-filter="image" type="button">${ICONS.image} <span>Image</span></button>
              <button class="ds-filter-pill" data-filter="video" type="button">${ICONS.video} <span>Video</span></button>
            </div>

            <div class="ds-search">
              <span class="search-icon">${ICONS.search}</span>
              <input type="text" class="search-input" placeholder="Search prompts..." data-search />
            </div>
          </div>
        </div>

        <div class="ds-cards-body" data-scroll></div>

        <div class="ds-cards-toast" data-toast></div>
      `;

      this.el = {
        count: this.root.querySelector("[data-count]"),
        scroll: this.root.querySelector("[data-scroll]"),
        toast: this.root.querySelector("[data-toast]"),
        viewBtns: this.root.querySelectorAll("[data-view-toggle] button"),
        sizeBtns: this.root.querySelectorAll("[data-size-toggle] button"),
        filterPills: this.root.querySelectorAll("[data-filter]"),
        search: this.root.querySelector("[data-search]"),
        addBtn: this.root.querySelector("[data-add]"),
        exportBtn: this.root.querySelector("[data-export]"),
        importBtn: this.root.querySelector("[data-import]"),
      };
    };

    // ============================================================
    // RENDER CARDS
    // ============================================================
    nodeType.prototype._render = function () {
      if (!this.el?.scroll) return;

      const container = this.el.scroll;
      container.innerHTML = "";

      this._applySizeConfig();

      let filtered = this.cards.slice();

      if (this.search && this.search.trim()) {
        const q = this.search.toLowerCase();
        filtered = filtered.filter((c) => (c.prompt || "").toLowerCase().includes(q));
      }

      if (this.filter === "pinned") {
        filtered = filtered.filter((c) => c.pinned);
      } else if (this.filter === "image" || this.filter === "video") {
        filtered = filtered.filter((c) => (c.type === "video" ? "video" : "image") === this.filter);
      }

      filtered.sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return (b.ts || 0) - (a.ts || 0);
      });

      if (this.el.count) {
        this.el.count.textContent = this.cards.length;
      }

      container.className = this.viewMode === "grid" ? "ds-cards-body ds-cards-grid" : "ds-cards-body ds-cards-list";

      if (!filtered.length) {
        const empty = document.createElement("div");
        empty.className = "ds-cards-empty";
        empty.innerHTML = `
          ${ICONS.upload}
          <div class="title">No cards yet</div>
          <div class="hint">Click Add, drop an image, or paste from clipboard.</div>
        `;
        container.appendChild(empty);
        return;
      }

      filtered.forEach((card) => {
        const el = this._createCardElement(card);
        container.appendChild(el);
      });
    };

    // ============================================================
    // CREATE CARD ELEMENT
    // ============================================================
    nodeType.prototype._createCardElement = function (card) {
      const isList = this.viewMode === "list";
      const cardEl = document.createElement("div");
      cardEl.className = "ds-card";
      cardEl.dataset.id = card.id;
      cardEl.draggable = true;

      const hasImage = !!card.image;
      const previewHTML = hasImage
        ? `<img src="${card.image}" alt="preview" />`
        : `<div class="preview-placeholder">
             ${ICONS.upload}
             <div>click / drop / paste</div>
           </div>`;

      const pinHTML = card.pinned ? `<div class="ds-pin-badge">${ICONS.pinFilled}</div>` : "";
      const promptVal = (card.prompt || "").replace(/"/g, "&quot;");

      cardEl.innerHTML = `
        <div class="ds-card-preview" data-preview>
          ${previewHTML}
          ${pinHTML}
          <div class="preview-overlay"><span>replace image</span></div>
          <button class="ds-preview-expand" data-action="expand" title="Open large preview & edit">${ICONS.expand}</button>
        </div>

        <div class="ds-card-body">
          <div class="ds-card-meta-row">
            <div class="ds-card-type" role="status" aria-label="Prompt type">
              ${
                card.type === "video"
                  ? `<button class="ds-type-tag active" data-action="set-type" data-type="video" type="button" title="Video prompt — click to switch to Image">${ICONS.video}<span>Video</span></button>`
                  : `<button class="ds-type-tag active" data-action="set-type" data-type="image" type="button" title="Image prompt — click to switch to Video">${ICONS.image}<span>Image</span></button>`
              }
            </div>

            <div class="ds-card-actions">
              <button class="ds-icon-btn ${card.pinned ? "pinned" : ""}" data-action="pin" title="${card.pinned ? "Unpin" : "Pin"}">
                ${card.pinned ? ICONS.pinFilled : ICONS.pin}
              </button>
              <button class="ds-icon-btn" data-action="copy" title="Copy prompt">
                ${ICONS.copy}
              </button>
              <button class="ds-icon-btn" data-action="paste" title="Paste prompt from clipboard into box">
                ${ICONS.paste}
              </button>
              <button class="ds-icon-btn danger" data-action="delete" title="Delete card">
                ${ICONS.trash}
              </button>
            </div>
          </div>

          <textarea class="ds-prompt-text prompt-text" data-prompt rows="3" placeholder="Describe the pose / subject...">${promptVal}</textarea>
        </div>
      `;

      if (isList) {
        cardEl.style.flexDirection = "row";
      }

      const preview = cardEl.querySelector("[data-preview]");
      const textarea = cardEl.querySelector("[data-prompt]");

      // Prevent ComfyUI keyboard shortcuts while typing in prompt
      textarea.addEventListener("keydown", (e) => {
        e.stopPropagation();
      });

      // Image Click -> Pick
      preview.addEventListener("click", (e) => {
        if (e.target.closest("[data-action='expand']")) return;
        e.stopPropagation();
        this._pickImageForCard(card.id);
      });

      // Double Click -> Modal
      preview.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        this._openCardModal(card.id);
      });

      // Drag & Drop Image directly on preview
      preview.addEventListener("dragover", (e) => {
        e.preventDefault();
        preview.style.outline = "2px solid var(--ds-color-accent, #67e8f9)";
      });
      preview.addEventListener("dragleave", () => {
        preview.style.outline = "";
      });
      preview.addEventListener("drop", async (e) => {
        e.preventDefault();
        preview.style.outline = "";
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith("image/")) {
          const dataUrl = await fileToOptimizedDataUrl(file);
          this._setCardImage(card.id, dataUrl);
        }
      });

      // Paste image on card
      cardEl.addEventListener("paste", async (e) => {
        const items = e.clipboardData?.items || [];
        for (const item of items) {
          if (item.type.startsWith("image")) {
            e.preventDefault();
            const file = item.getAsFile();
            if (file) {
              const dataUrl = await fileToOptimizedDataUrl(file);
              this._setCardImage(card.id, dataUrl);
            }
            return;
          }
        }
      });

      // Autosave prompt
      const savePrompt = debounce((val) => {
        const c = this.cards.find((x) => x.id === card.id);
        if (c) {
          c.prompt = val;
          c.ts = Date.now();
          this._saveState();
        }
      }, 260);

      textarea.addEventListener("input", () => {
        savePrompt(textarea.value);
      });

      textarea.addEventListener("blur", () => {
        this._saveState();
        if (this._saveToServer) {
          this._saveToServer.flush?.();
        }
      });

      // Action Buttons
      cardEl.querySelectorAll("[data-action]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const action = btn.dataset.action;

          if (action === "pin") {
            this._togglePin(card.id);
          } else if (action === "copy") {
            this._copyPrompt(card.prompt || "");
          } else if (action === "paste") {
            this._pastePrompt(card.id, textarea);
          } else if (action === "delete") {
            this._deleteCard(card.id);
          } else if (action === "set-type") {
            const nextType = btn.dataset.type === "video" ? "image" : "video";
            this._setCardType(card.id, nextType);
          } else if (action === "expand") {
            this._openCardModal(card.id);
          }
        });
      });

      // Drag to Reorder
      cardEl.addEventListener("dragstart", (e) => {
        cardEl.classList.add("dragging");
        e.dataTransfer.setData("text/plain", card.id);
        e.dataTransfer.effectAllowed = "move";
      });

      cardEl.addEventListener("dragend", () => {
        cardEl.classList.remove("dragging");
        this.root.querySelectorAll(".drop-target").forEach((el) => el.classList.remove("drop-target"));
      });

      cardEl.addEventListener("dragover", (e) => {
        e.preventDefault();
        cardEl.classList.add("drop-target");
      });

      cardEl.addEventListener("dragleave", () => {
        cardEl.classList.remove("drop-target");
      });

      cardEl.addEventListener("drop", (e) => {
        e.preventDefault();
        cardEl.classList.remove("drop-target");
        const draggedId = e.dataTransfer.getData("text/plain");
        if (draggedId && draggedId !== card.id) {
          this._reorderCards(draggedId, card.id, e);
        }
      });

      return cardEl;
    };

    // ============================================================
    // ADD CARD
    // ============================================================
    nodeType.prototype._addCard = function (imageData = null) {
      const newCard = {
        id: uid(),
        prompt: "",
        image: imageData,
        type: "image",
        pinned: false,
        ts: Date.now(),
      };

      this.cards.unshift(newCard);

      this._saveState();
      this._saveToServer?.();
      this._saveToServer?.flush?.();
      this._render();
      this._updateHeight(this.size);

      setTimeout(() => {
        const el = this.root.querySelector(`[data-id="${newCard.id}"] textarea`);
        if (el) el.focus();
      }, 30);
    };

    // ============================================================
    // DELETE CARD
    // ============================================================
    nodeType.prototype._deleteCard = function (id) {
      if (!confirm("Delete this card?")) return;
      this.cards = this.cards.filter((c) => c.id !== id);
      this._saveState();
      this._render();
      this._updateHeight(this.size);
    };

    // ============================================================
    // PIN CARD
    // ============================================================
    nodeType.prototype._togglePin = function (id) {
      const c = this.cards.find((x) => x.id === id);
      if (!c) return;
      c.pinned = !c.pinned;
      c.ts = Date.now();
      this._saveState();
      this._render();
    };

    // ============================================================
    // COPY PROMPT
    // ============================================================
    nodeType.prototype._copyPrompt = function (text) {
      if (!text) {
        this._showToast("Nothing to copy");
        return;
      }
      navigator.clipboard
        .writeText(text)
        .then(() => {
          this._showToast("Copied prompt");
        })
        .catch(() => {
          const ta = document.createElement("textarea");
          ta.value = text;
          ta.style.position = "fixed";
          ta.style.left = "-9999px";
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
          this._showToast("Copied");
        });
    };

    // ============================================================
    // PASTE PROMPT FROM CLIPBOARD INTO CARD
    // ============================================================
    nodeType.prototype._pastePrompt = async function (id, targetTextarea = null) {
      try {
        let text = "";
        if (navigator?.clipboard?.readText) {
          text = await navigator.clipboard.readText();
        }
        if (!text || !text.trim()) {
          this._showToast("Clipboard is empty");
          return;
        }

        const c = this.cards.find((x) => x.id === id);
        if (!c) return;

        c.prompt = text;
        c.ts = Date.now();
        this._saveState();

        if (targetTextarea) {
          targetTextarea.value = text;
          targetTextarea.focus();
        } else {
          const ta = this.root?.querySelector(`[data-id="${id}"] .ds-prompt-text`);
          if (ta) {
            ta.value = text;
            ta.focus();
          }
        }
        this._showToast("Pasted prompt");
      } catch (e) {
        console.warn("[DS Prompt Cards] Clipboard read failed:", e);
        this._showToast("Clipboard access denied");
      }
    };

    // ============================================================
    // SET IMAGE
    // ============================================================
    nodeType.prototype._setCardImage = function (id, dataUrl) {
      const c = this.cards.find((x) => x.id === id);
      if (!c) return;
      c.image = dataUrl;
      c.ts = Date.now();
      this._saveState();
      this._render();
      this._updateHeight(this.size);
    };

    // ============================================================
    // PICK IMAGE
    // ============================================================
    nodeType.prototype._pickImageForCard = function (id) {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = async () => {
        if (input.files && input.files[0]) {
          const dataUrl = await fileToOptimizedDataUrl(input.files[0]);
          this._setCardImage(id, dataUrl);
        }
      };
      input.click();
    };

    // ============================================================
    // REORDER CARDS
    // ============================================================
    nodeType.prototype._reorderCards = function (draggedId, targetId, dropEvent) {
      const from = this.cards.findIndex((c) => c.id === draggedId);
      let to = this.cards.findIndex((c) => c.id === targetId);

      if (from === -1 || to === -1 || from === to) return;

      const targetRect = dropEvent.currentTarget ? dropEvent.currentTarget.getBoundingClientRect() : null;
      if (targetRect && dropEvent.clientY > targetRect.top + targetRect.height * 0.5) {
        to = to + 1;
      }

      const [moved] = this.cards.splice(from, 1);
      if (to > from) to -= 1;
      this.cards.splice(to, 0, moved);

      this._saveState();
      this._render();
      this._updateHeight(this.size);
    };

    // ============================================================
    // GLOBAL UI WIRING
    // ============================================================
    nodeType.prototype._wireGlobal = function () {
      const root = this.root;
      const scroll = this.el.scroll;

      // Add Button
      this.el.addBtn?.addEventListener("click", () => this._addCard());

      // View Mode Toggle (Grid / List)
      this.el.viewBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
          const mode = btn.dataset.view;
          this._setViewMode(mode);
        });
      });

      // Size Mode Toggle (Small / Med / Large)
      this.el.sizeBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
          const size = btn.dataset.size;
          this._setPreviewSize(size);
        });
      });

      // Export
      this.el.exportBtn?.addEventListener("click", () => this._exportCards());

      // Import
      this.el.importBtn?.addEventListener("click", () => this._importCards());

      // Filter Pills
      this.el.filterPills.forEach((pill) => {
        pill.addEventListener("click", () => {
          this.filter = pill.dataset.filter;
          this.el.filterPills.forEach((p) => p.classList.toggle("active", p.dataset.filter === this.filter));
          this._saveState();
          this._render();
        });
      });

      // Search
      const onSearch = debounce((val) => {
        this.search = val;
        this._render();
      }, 120);

      this.el.search?.addEventListener("input", (e) => onSearch(e.target.value));

      this.el.search?.addEventListener("keydown", (e) => {
        e.stopPropagation();
      });

      // Global Drop Zone
      scroll.addEventListener("dragover", (e) => {
        e.preventDefault();
        scroll.style.outline = "2px dashed var(--ds-color-accent, #67e8f9)";
      });

      scroll.addEventListener("dragleave", () => {
        scroll.style.outline = "";
      });

      scroll.addEventListener("drop", async (e) => {
        e.preventDefault();
        scroll.style.outline = "";
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith("image/")) {
          const dataUrl = await fileToOptimizedDataUrl(file);
          this._addCard(dataUrl);
        }
      });

      // Paste images anywhere on node
      root.addEventListener("paste", async (e) => {
        if (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT") return;
        const items = e.clipboardData?.items || [];
        for (const item of items) {
          if (item.type.startsWith("image/")) {
            e.preventDefault();
            const file = item.getAsFile();
            if (file) {
              const dataUrl = await fileToOptimizedDataUrl(file);
              this._addCard(dataUrl);
            }
            return;
          }
        }
      });

      // Keyboard shortcut for search
      root.addEventListener("keydown", (e) => {
        if (e.key === "/" && document.activeElement?.tagName === "BODY") {
          e.preventDefault();
          this.el.search?.focus();
          this.el.search?.select();
        }
      });
    };

    // ============================================================
    // TOAST NOTIFICATIONS
    // ============================================================
    nodeType.prototype._showToast = function (msg, ms = 1400) {
      const t = this.el?.toast;
      if (!t) return;

      t.textContent = msg;
      t.classList.add("show");

      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => {
        t.classList.remove("show");
      }, ms);
    };

    // ============================================================
    // PERSISTENCE (Tiny UI State Only)
    // ============================================================
    nodeType.prototype._saveState = function () {
      const payload = {
        version: 3,
        viewMode: this.viewMode,
        filter: this.filter,
        search: this.search,
        previewSize: this.previewSize,
      };

      if (this.stateWidget) {
        this.stateWidget.value = JSON.stringify(payload);
      }

      clearTimeout(this._dirtyTimer);
      this._dirtyTimer = setTimeout(() => {
        if (app?.canvas?.draggingNode || this.flags?.dragging) return;
        if (typeof this.setDirtyCanvas === "function") {
          this.setDirtyCanvas(true, true);
        }
      }, 120);

      this._saveToServer && this._saveToServer();
    };

    // ============================================================
    // RESTORE STATE
    // ============================================================
    nodeType.prototype._restoreState = function () {
      let raw = "{}";
      if (this.stateWidget?.value) {
        raw = this.stateWidget.value;
      } else if (this.widgets) {
        const w = this.widgets.find((x) => x.name === "cards_state");
        if (w?.value) raw = w.value;
      }

      try {
        const data = JSON.parse(raw || "{}");
        this.viewMode = data.viewMode === "list" ? "list" : "grid";
        this.filter = ["all", "pinned", "image", "video"].includes(data.filter) ? data.filter : "all";
        this.search = data.search || "";
        this.previewSize = ["small", "med", "large"].includes(data.previewSize) ? data.previewSize : "med";

        if (this.el) {
          this.el.viewBtns.forEach((b) => b.classList.toggle("active", b.dataset.view === this.viewMode));
          this.el.sizeBtns.forEach((b) => b.classList.toggle("active", b.dataset.size === this.previewSize));
          this.el.filterPills.forEach((p) => p.classList.toggle("active", p.dataset.filter === this.filter));
          if (this.el.search) this.el.search.value = this.search;
        }

        this._applySizeConfig();
      } catch (e) {
        this.viewMode = "grid";
        this.filter = "all";
        this.search = "";
        this.previewSize = "med";
      }
    };

    // ============================================================
    // VIEW MODE (Grid / List)
    // ============================================================
    nodeType.prototype._setViewMode = function (mode) {
      this.viewMode = mode;
      if (this.el?.viewBtns) {
        this.el.viewBtns.forEach((b) => b.classList.toggle("active", b.dataset.view === mode));
      }
      this._saveState();
      this._render();
    };

    // ============================================================
    // PREVIEW SIZE (Small / Med / Large)
    // ============================================================
    nodeType.prototype._setPreviewSize = function (size) {
      if (!["small", "med", "large"].includes(size)) size = "med";
      this.previewSize = size;
      if (this.el?.sizeBtns) {
        this.el.sizeBtns.forEach((b) => b.classList.toggle("active", b.dataset.size === size));
      }
      this._applySizeConfig();
      this._saveState();
      this._render();
      this._updateHeight && this._updateHeight(this.size);
    };

    // ============================================================
    // SIZE CONFIGURATION
    // ============================================================
    nodeType.prototype._applySizeConfig = function () {
      if (!this.root) return;

      const sz = this.previewSize || "med";
      this.root.setAttribute("data-psize", sz);

      if (sz === "small") {
        this.root.style.setProperty("--preview-h", "75px");
        this.root.style.setProperty("--list-card-h", "88px");
        this.root.style.setProperty("--list-preview-w", "75px");
        this.root.style.setProperty("--list-preview-size", "75px");
        this.root.style.setProperty("--grid-min-col", "105px");
        this.root.style.setProperty("--card-gap", "5px");
        this.root.style.setProperty("--prompt-font-size", "10px");
        this.root.style.setProperty("--prompt-min-h", "28px");
        this.root.style.setProperty("--prompt-max-h", "60px");
        this.root.style.setProperty("--btn-action-size", "18px");
        this.root.style.setProperty("--btn-action-icon", "10px");
      } else if (sz === "large") {
        this.root.style.setProperty("--preview-h", "240px");
        this.root.style.setProperty("--list-card-h", "165px");
        this.root.style.setProperty("--list-preview-w", "180px");
        this.root.style.setProperty("--list-preview-size", "180px");
        this.root.style.setProperty("--grid-min-col", "240px");
        this.root.style.setProperty("--card-gap", "10px");
        this.root.style.setProperty("--prompt-font-size", "13px");
        this.root.style.setProperty("--prompt-min-h", "65px");
        this.root.style.setProperty("--prompt-max-h", "180px");
        this.root.style.setProperty("--btn-action-size", "24px");
        this.root.style.setProperty("--btn-action-icon", "14px");
      } else {
        // med (balanced standard)
        this.root.style.setProperty("--preview-h", "140px");
        this.root.style.setProperty("--list-card-h", "120px");
        this.root.style.setProperty("--list-preview-w", "110px");
        this.root.style.setProperty("--list-preview-size", "110px");
        this.root.style.setProperty("--grid-min-col", "165px");
        this.root.style.setProperty("--card-gap", "8px");
        this.root.style.setProperty("--prompt-font-size", "11.5px");
        this.root.style.setProperty("--prompt-min-h", "44px");
        this.root.style.setProperty("--prompt-max-h", "100px");
        this.root.style.setProperty("--btn-action-size", "22px");
        this.root.style.setProperty("--btn-action-icon", "12px");
      }
    };

    // ============================================================
    // CARD TYPE (Image / Video)
    // ============================================================
    nodeType.prototype._setCardType = function (id, type) {
      const card = this.cards.find((c) => c.id === id);
      if (!card) return;

      card.type = type === "video" ? "video" : "image";
      card.ts = Date.now();

      this._saveState();
      this._saveToServer?.();
      this._saveToServer?.flush?.();
      this._render();
    };

    // ============================================================
    // EXPORT
    // ============================================================
    nodeType.prototype._exportCards = function () {
      try {
        const data = JSON.stringify(
          {
            version: 1,
            exportedAt: new Date().toISOString(),
            cards: this.cards,
          },
          null,
          2
        );

        const blob = new Blob([data], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "deathshot_prompt_cards.json";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this._showToast("Exported " + this.cards.length + " cards");
      } catch (e) {
        this._showToast("Export failed");
      }
    };

    // ============================================================
    // IMPORT
    // ============================================================
    nodeType.prototype._importCards = function () {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json,application/json";

      input.onchange = async () => {
        const file = input.files && input.files[0];
        if (!file) return;

        try {
          const text = await file.text();
          const parsed = JSON.parse(text);

          let incoming = [];
          if (Array.isArray(parsed)) {
            incoming = parsed;
          } else if (parsed.cards && Array.isArray(parsed.cards)) {
            incoming = parsed.cards;
          }

          if (!incoming.length) {
            this._showToast("No cards found in file");
            return;
          }

          let added = 0;
          let updated = 0;

          incoming.forEach((ic) => {
            if (!ic) return;
            const existing = this.cards.find((c) => c.id === ic.id);

            if (existing) {
              existing.prompt = ic.prompt || existing.prompt || "";
              if (ic.image) existing.image = ic.image;
              if (ic.type === "image" || ic.type === "video") existing.type = ic.type;
              if (typeof ic.pinned === "boolean") existing.pinned = ic.pinned;
              existing.ts = Date.now();
              updated++;
            } else {
              this.cards.push({
                id: ic.id || uid(),
                prompt: ic.prompt || "",
                image: ic.image || null,
                type: ic.type === "video" ? "video" : "image",
                pinned: !!ic.pinned,
                ts: Date.now(),
              });
              added++;
            }
          });

          this._saveState();
          this._render();
          this._updateHeight(this.size);
          this._showToast(`Imported: +${added} new, ${updated} updated`);
        } catch (e) {
          console.error(e);
          this._showToast("Import failed (bad JSON?)");
        }
      };

      input.click();
    };

    // ============================================================
    // MODAL THEME BRIDGE
    // ============================================================
    nodeType.prototype._applyModalTheme = function (modal) {
      if (!modal || !this.root) return;

      const vars = [
        "--ds-color-bg",
        "--ds-color-card",
        "--ds-color-card-border",
        "--ds-color-panel",
        "--ds-color-panel-2",
        "--ds-color-accent",
        "--ds-color-accent-hover",
        "--ds-color-on-accent",
        "--ds-color-text",
        "--ds-color-muted-text",
        "--ds-color-border",
        "--ds-color-danger",
        "--ds-color-success",
        "--ds-radius-card",
        "--ds-radius-sm",
        "--ds-font",
        "--ds-color-scrollbar",
      ];

      const copyStyles = () => {
        const computed = getComputedStyle(this.root);
        vars.forEach((name) => {
          const value = computed.getPropertyValue(name).trim();
          if (value) modal.style.setProperty(name, value);
        });
      };

      copyStyles();

      if (this._modalThemeObserver) {
        this._modalThemeObserver.disconnect();
      }

      this._modalThemeObserver = new MutationObserver(() => {
        if (document.body.contains(modal)) copyStyles();
      });

      this._modalThemeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class", "style", "data-theme", "data-color-scheme"],
      });
    };

    // ============================================================
    // CARD DETAIL MODAL
    // ============================================================
    nodeType.prototype._openCardModal = function (id) {
      const card = this.cards.find((c) => c.id === id);
      if (!card) return;

      const old = document.querySelector(".ds-pc-modal");
      if (old) old.remove();

      const modal = document.createElement("div");
      modal.className = "ds-pc-modal";
      modal.innerHTML = `
        <div class="ds-pc-modal-backdrop"></div>
        <div class="ds-pc-modal-content">
          <div class="ds-pc-modal-header">
            <div class="ds-pc-modal-title">
              Card Preview &amp; Edit
            </div>
            <div class="ds-pc-modal-actions">
              <button class="ds-icon-btn ${card.pinned ? "pinned" : ""}" data-maction="pin" title="Toggle pin">
                ${card.pinned ? ICONS.pinFilled : ICONS.pin}
              </button>
              <button class="ds-icon-btn" data-maction="copy" title="Copy prompt">
                ${ICONS.copy}
              </button>
              <button class="ds-icon-btn" data-maction="paste" title="Paste prompt from clipboard">
                ${ICONS.paste}
              </button>
              <button class="ds-icon-btn danger" data-maction="delete" title="Delete card">
                ${ICONS.trash}
              </button>
              <button class="ds-icon-btn" data-maction="close" title="Close modal">
                ✕
              </button>
            </div>
          </div>

          <div class="ds-pc-modal-image-wrap">
            ${
              card.image
                ? `<img src="${card.image}" class="ds-pc-modal-img" alt="large preview" />`
                : `<div class="ds-pc-modal-placeholder">
                     ${ICONS.upload}
                     <div>No image yet — click Replace to add one</div>
                   </div>`
            }
          </div>

          <div class="ds-pc-modal-controls">
            <div class="ds-modal-type" role="group" aria-label="Prompt type">
              <button class="ds-type-tag ${card.type !== "video" ? "active" : ""}" data-maction="set-type" data-type="image" type="button">
                ${ICONS.image}<span>Image</span>
              </button>
              <button class="ds-type-tag ${card.type === "video" ? "active" : ""}" data-maction="set-type" data-type="video" type="button">
                ${ICONS.video}<span>Video</span>
              </button>
            </div>

            <button class="ds-btn" data-maction="replace">
              ${ICONS.upload}
              <span>Replace Image</span>
            </button>
          </div>

          <div class="ds-pc-modal-body">
            <textarea
              class="ds-pc-modal-prompt"
              placeholder="Describe the pose / subject..."
            >${(card.prompt || "").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</textarea>
          </div>

          <div class="ds-pc-modal-footer">
            <div class="ds-pc-hint">
              Changes save automatically. Press Esc to exit.
            </div>
            <button class="ds-btn primary" data-maction="close">
              Done
            </button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);
      this._applyModalTheme(modal);

      const backdrop = modal.querySelector(".ds-pc-modal-backdrop");
      const imgWrap = modal.querySelector(".ds-pc-modal-image-wrap");
      const ta = modal.querySelector(".ds-pc-modal-prompt");

      // Prevent shortcuts while editing prompt
      ta.addEventListener("keydown", (e) => {
        e.stopPropagation();
      });

      const savePrompt = debounce((val) => {
        const c = this.cards.find((x) => x.id === id);
        if (c) {
          c.prompt = val;
          c.ts = Date.now();
          this._saveState();

          const small = this.root?.querySelector(`[data-id="${id}"] .ds-prompt-text`);
          if (small) small.value = val;
        }
      }, 220);

      ta.addEventListener("input", () => savePrompt(ta.value));

      const close = () => {
        if (savePrompt.flush) savePrompt.flush();
        if (this._modalThemeObserver) {
          this._modalThemeObserver.disconnect();
          this._modalThemeObserver = null;
        }
        modal.remove();
        this._render();
      };

      backdrop.addEventListener("click", close);

      modal.querySelectorAll("[data-maction]").forEach((btn) => {
        btn.addEventListener("click", async (e) => {
          const act = btn.dataset.maction;
          const c = this.cards.find((x) => x.id === id);
          if (!c) {
            close();
            return;
          }

          if (act === "close") {
            close();
          } else if (act === "copy") {
            this._copyPrompt(c.prompt || "");
          } else if (act === "paste") {
            try {
              let text = "";
              if (navigator?.clipboard?.readText) {
                text = await navigator.clipboard.readText();
              }
              if (!text || !text.trim()) {
                this._showToast("Clipboard is empty");
                return;
              }
              c.prompt = text;
              c.ts = Date.now();
              this._saveState();
              ta.value = text;
              ta.focus();
              const small = this.root?.querySelector(`[data-id="${id}"] .ds-prompt-text`);
              if (small) small.value = text;
              this._showToast("Pasted prompt");
            } catch (err) {
              this._showToast("Clipboard access denied");
            }
          } else if (act === "pin") {
            c.pinned = !c.pinned;
            c.ts = Date.now();
            this._saveState();
            btn.innerHTML = c.pinned ? ICONS.pinFilled : ICONS.pin;
            btn.classList.toggle("pinned", c.pinned);
          } else if (act === "set-type") {
            const nextType = btn.dataset.type === "video" ? "image" : "video";
            this._setCardType(id, nextType);
            modal.querySelectorAll("[data-maction='set-type']").forEach((b) => {
              b.classList.toggle("active", b.dataset.type === nextType);
            });
          } else if (act === "delete") {
            if (confirm("Delete this card?")) {
              this.cards = this.cards.filter((x) => x.id !== id);
              this._saveState();
              close();
            }
          } else if (act === "replace") {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = "image/*";
            input.onchange = async () => {
              if (input.files && input.files[0]) {
                const dataUrl = await fileToOptimizedDataUrl(input.files[0]);
                c.image = dataUrl;
                c.ts = Date.now();
                this._saveState();
                imgWrap.innerHTML = `<img src="${dataUrl}" class="ds-pc-modal-img" alt="large preview" />`;
                this._render();
              }
            };
            input.click();
          }
        });
      });

      const onKey = (ev) => {
        if (ev.key === "Escape") {
          document.removeEventListener("keydown", onKey);
          close();
        }
      };

      document.addEventListener("keydown", onKey, { once: true });
      setTimeout(() => ta.focus(), 30);
    };
  },
});