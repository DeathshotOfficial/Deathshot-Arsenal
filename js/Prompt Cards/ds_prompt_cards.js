/**
 * DS Prompt Cards
 * Modern, well-designed inline node for image+prompt reference cards.
 * Perfect for pose/prompt reuse in I2V/video workflows.
 *
 * - Grid + List views with large previews
 * - Large readable previews + detail modal
 * - Proper scrolling container
 * - Auto-saving prompt fields
 * - Copy / Delete / Pin
 * - Export / Import library (JSON)
 * - Drag reorder
 * - Pinned filter + search
 * - Modern inline SVG icons
 * - Resizable with generous min-size guard
 * - No Comfy inputs/outputs
 *
 * IMPORTANT:
 * The card library is persisted on disk through /ds/promptcards/cards.
 * The workflow only stores tiny UI state.
 *
 * This prevents the entire card library and base64 images from being
 * serialized into ComfyUI workflow drafts.
 */

import { app } from "/scripts/app.js";

// Inject CSS
const cssLink = document.createElement("link");
cssLink.rel = "stylesheet";
cssLink.href = "/extensions/DeathshotArsenal/Prompt Cards/ds_prompt_cards.css";
document.head.appendChild(cssLink);

// Inline modern icons
const ICONS = {
  grid: `<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>`,

  list: `<svg viewBox="0 0 24 24"><circle cx="4" cy="6" r="1.5"/><circle cx="4" cy="12" r="1.5"/><circle cx="4" cy="18" r="1.5"/><path d="M8 6h13M8 12h13M8 18h13"/></svg>`,

  plus: `<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>`,

  copy: `<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="1"/><path d="M4 16V5a1 1 0 0 1 1-1h11"/></svg>`,

  trash: `<svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m-9 0v12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V6"/><path d="M10 11v6M14 11v6"/></svg>`,

  pin: `<svg viewBox="0 0 24 24"><path d="M12 2l2.5 6.5L22 10l-5 4.8 1.2 6.7L12 18.5 5.8 21.5 7 14.8 2 10l7.5-1.5L12 2z"/></svg>`,

  pinFilled: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.5 6.5L22 10l-5 4.8 1.2 6.7L12 18.5 5.8 21.5 7 14.8 2 10l7.5-1.5L12 2z"/></svg>`,

  image: `<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="M21 16l-5-5-7 7-2-2-4 4"/></svg>`,

  video: `<svg viewBox="0 0 24 24"><rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/></svg>`,

  search: `<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>`,

  upload: `<svg viewBox="0 0 24 24"><path d="M12 19V6m0 0l-4 4m4-4l4 4"/><path d="M5 19h14"/></svg>`,


  expand: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 9l-7 7M3 15l7-7"/></svg>`,


  export: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,

  import: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,
};

function makeIcon(name, cls = "") {
  const svg = ICONS[name] || ICONS.plus;
  return `<span class="ds-icon ${cls}">${svg}</span>`;
}

function uid() {
  return (
    "pc_" +
    Date.now().toString(36) +
    "_" +
    Math.random().toString(36).slice(2, 9)
  );
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

// Resize image client-side.
async function fileToOptimizedDataUrl(file, maxSide = 360) {
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

        const ctx = canvas.getContext("2d", {
          alpha: true,
        });

        ctx.drawImage(img, 0, 0, width, height);

        let data;

        try {
          data = canvas.toDataURL("image/webp", 0.86);
        } catch (_) {
          data = canvas.toDataURL("image/jpeg", 0.88);
        }

        resolve(data);
      };

      img.src = e.target.result;
    };

    reader.readAsDataURL(file);
  });
}

app.registerExtension({
  name: "DeathshotArsenal.PromptCards",

  async beforeRegisterNodeDef(nodeType, nodeData, app) {
    if (nodeData.name !== "DS_PromptCards") return;

    const onNodeCreated = nodeType.prototype.onNodeCreated;

    nodeType.prototype.onNodeCreated = function () {
      const result = onNodeCreated
        ? onNodeCreated.apply(this, arguments)
        : undefined;

      // Clean node – no inputs, no outputs.
      this.inputs = [];
      this.outputs = [];

      if (!this.size || this.size[1] < 340) {
        this.size = [600, 580];
      }

      this.resizable = true;

      // ============================================================
      // STATE
      // ============================================================

      this.cards = [];

      this.viewMode = "grid";

      this.filter = "all";

      this.search = "";

      this.previewSize = "large";

      // ============================================================
      // DISK PERSISTENCE
      //
      // The actual card library lives on disk.
      //
      // IMPORTANT:
      // This is deliberately NOT stored inside the workflow.
      // ============================================================

      this._saveToServer = debounce(
        async function () {
          try {
            const res = await fetch("/ds/promptcards/cards", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },

              body: JSON.stringify({
                cards: this.cards,
              }),
            });

            if (!res.ok) {
              console.warn(
                "[DS Prompt Cards] Disk save failed:",
                res.status
              );
            }
          } catch (e) {
            console.warn(
              "[DS Prompt Cards] Disk save error:",
              e
            );
          }
        },
        550
      );

      // ============================================================
      // WORKFLOW STATE WIDGET
      //
      // ONLY tiny UI state is stored here.
      //
      // NEVER put this.cards here.
      // NEVER put base64 images here.
      // ============================================================

      this.stateWidget = this.addWidget(
        "text",
        "cards_state",
        "{}",
        () => {},
        {
          hidden: true,
        }
      );

      this._hideStateWidget();

      // ============================================================
      // ROOT DOM
      // ============================================================

      this.root = this._buildRoot();

      this.root.style.display = "flex";
      this.root.style.flexDirection = "column";
      this.root.style.overflow = "hidden";
      this.root.style.boxSizing = "border-box";
      this.root.style.pointerEvents = "auto";

      const initH = Math.max(
        280,
        (this.size && this.size[1] || 580) - 28
      );

      this.root.style.height = initH + "px";

      const domWidget = this.addDOMWidget(
        "prompt_cards_ui",
        "div",
        this.root,
        {
          serialize: false,
          hideOnZoom: false,
        }
      );

      // Only style the direct parent.
      try {
        const direct = this.root.parentElement;

        if (direct) {
          direct.style.height = "100%";
          direct.style.boxSizing = "border-box";
          direct.style.minHeight = "0";
        }
      } catch (e) {}

      // Resize observer.
      try {
        const widgetEl = this.root.parentElement;

        if (widgetEl && !this._ro) {
          this._ro = new ResizeObserver(() => {
            if (this._updateHeight && this.size) {
              this._updateHeight(this.size);
            }
          });

          this._ro.observe(widgetEl);
        }
      } catch (e) {}

      this._applySizeConfig();

      setTimeout(() => {
        if (this._updateHeight) {
          this._updateHeight(this.size);
        }

        if (window.DSGlobalTheme && this.root) {
          window.DSGlobalTheme.bindNode(
            this.root,
            this
          );

          window.DSGlobalTheme.applyNodeBase?.(
            this
          );
        }
      }, 1);

      this._hideStateWidget();

      // ============================================================
      // LOAD GLOBAL LIBRARY FROM DISK
      // ============================================================

      setTimeout(async () => {
        await this._loadFromServer();

        // Save ONLY tiny UI state to the workflow.
        this._saveState();

        this._render();

        this._wireGlobal();

        this._updateHeight(this.size);

        this._hideStateWidget();

        if (this.root) {
          this.root.setAttribute(
            "data-psize",
            this.previewSize || "large"
          );

          this._applySizeConfig();
        }


        requestAnimationFrame(() => {
          try {
            if (app?.canvas?.draggingNode) return;
          } catch (_) {}

          this._updateHeight(this.size);
        });
      }, 70);

      return result;
    };

    // ============================================================
    // RESIZE
    // ============================================================

    nodeType.prototype.onResize = function (size) {
      try {
        if (this.flags && this.flags.dragging) return;

        if (app?.canvas?.draggingNode) return;
      } catch (_) {}

      const minW = 400;
      const minH = 340;

      if (size[0] < minW) {
        size[0] = minW;
      }

      if (size[1] < minH) {
        size[1] = minH;
      }

      this._updateHeight && this._updateHeight(size);

      if (
        this._lastW &&
        Math.abs(this._lastW - size[0]) > 24
      ) {
        this._lastW = size[0];

        if (this._render) {
          this._render();
        }
      } else {
        this._lastW = size[0];
      }
    };

    // ============================================================
    // CONFIGURE
    // ============================================================

    nodeType.prototype.onConfigure = function () {
      setTimeout(async () => {
        try {
          if (app?.canvas?.draggingNode) return;
        } catch (_) {}

        if (this._hideStateWidget) {
          this._hideStateWidget();
        }

        await this._loadFromServer();

        if (this._render) {
          this._render();
        }

        if (this._updateHeight) {
          this._updateHeight(this.size);
        }

        if (this.root) {
          this.root.setAttribute(
            "data-psize",
            this.previewSize || "large"
          );
        }

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
    // LOAD GLOBAL LIBRARY FROM DISK
    // ============================================================

    nodeType.prototype._loadFromServer = async function () {
      try {
        const res = await fetch(
          "/ds/promptcards/cards"
        );

        if (!res.ok) {
          throw new Error("bad response");
        }

        const json = await res.json();

        let loaded =
          json.cards &&
          Array.isArray(json.cards)
            ? json.cards
            : [];

        // ========================================================
        // LEGACY MIGRATION
        //
        // Old versions stored:
        //
        // cards_state = {
        //   cards: [
        //     { image: "data:image/..." }
        //   ]
        // }
        //
        // If disk storage is empty, recover that old library once.
        // Then save it to disk and immediately replace the workflow
        // state with tiny UI-only state.
        // ========================================================

        let migratedLegacyCards = false;

        if (
          loaded.length === 0 &&
          this.stateWidget &&
          this.stateWidget.value
        ) {
          try {
            const snap = JSON.parse(
              this.stateWidget.value || "{}"
            );

            if (
              snap.cards &&
              Array.isArray(snap.cards) &&
              snap.cards.length > 0
            ) {
              loaded = snap.cards;

              migratedLegacyCards = true;

              console.info(
                "[DS Prompt Cards] Migrating legacy embedded library:",
                loaded.length,
                "cards"
              );
            }
          } catch (_) {}
        }

        this.cards = loaded;

        // Normalize card objects.
        this.cards.forEach((c) => {
          if (!c.id) {
            c.id =
              "pc_" +
              Date.now() +
              "_" +
              Math.random()
                .toString(36)
                .slice(2, 9);
          }

          if (typeof c.pinned !== "boolean") {
            c.pinned = !!c.pinned;
          }

          c.type = c.type === "video" ? "video" : "image";

          if (!c.ts) {
            c.ts = Date.now();
          }
        });

        // ========================================================
        // SAVE ACTUAL LIBRARY TO DISK
        // ========================================================

        if (loaded.length > 0) {
          this._saveToServer &&
            this._saveToServer();
        }

        // ========================================================
        // IMPORTANT:
        //
        // If we recovered a legacy 10 MB workflow snapshot,
        // immediately replace it with the tiny UI state.
        // ========================================================

        if (migratedLegacyCards) {
          this._saveState();
        }
      } catch (e) {
        console.warn(
          "[DS Prompt Cards] Could not load from server, starting empty",
          e
        );

        this.cards = [];
      }
    };

    // ============================================================
    // UPDATE HEIGHT
    // ============================================================

    nodeType.prototype._updateHeight = function (size) {
      if (!this.root) return;

      try {
        if (this.flags && this.flags.dragging) return;

        if (app?.canvas?.draggingNode) return;
      } catch (_) {}

      const nodeH =
        (size && size[1]) ||
        (this.size && this.size[1]) ||
        580;

      const rootH = Math.max(
        280,
        nodeH - 28
      );

      this.root.style.height =
        rootH + "px";

      this.root.style.width = "100%";

      this.root.style.boxSizing =
        "border-box";

      this.root.style.overflow =
        "hidden";

      this.root.style.minHeight =
        "0";

      try {
        const direct =
          this.root.parentElement;

        if (direct && direct.style) {
          direct.style.height =
            "100%";

          direct.style.minHeight =
            "0";

          direct.style.boxSizing =
            "border-box";
        }
      } catch (e) {}

      if (
        this.el &&
        this.el.scroll
      ) {
        const header =
          this.root.querySelector(
            ".ds-cards-header"
          );

        const headerH = header
          ? Math.max(
              30,
              header.offsetHeight || 38
            )
          : 38;

        const body =
          this.el.scroll;

        const bodyH = Math.max(
          140,
          rootH - headerH - 4
        );

        body.style.height =
          bodyH + "px";

        body.style.minHeight =
          "140px";

        body.style.maxHeight =
          bodyH + "px";

        body.style.flex =
          "1 1 0%";

        body.style.overflowY =
          "auto";

        body.style.overflowX =
          "hidden";

        body.style.boxSizing =
          "border-box";

        if (
          body.scrollHeight >
          body.clientHeight + 6
        ) {
          body.style.overflowY =
            "scroll";
        }
      }
    };

    // ============================================================
    // BUILD UI
    // ============================================================

    nodeType.prototype._buildRoot =
      function () {
        const root =
          document.createElement("div");

        root.className =
          "ds-cards-root";

        root.dataset.dsThemed =
          "true";

        root.innerHTML = `
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

          <button class="ds-btn primary" data-add type="button" title="Add new card">
            <span>Add</span>
          </button>

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

          <button class="ds-icon-btn" data-export title="Export all cards (JSON)">${ICONS.export}</button>
          <button class="ds-icon-btn" data-import title="Import / Merge cards (JSON)">${ICONS.import}</button>
        </div>

        <div class="ds-cards-body" data-scroll></div>

        <div class="ds-cards-toast" data-toast></div>
      `;

        this.el = {
          count:
            root.querySelector(
              "[data-count]"
            ),

          scroll:
            root.querySelector(
              "[data-scroll]"
            ),

          toast:
            root.querySelector(
              "[data-toast]"
            ),

          viewBtns:
            root.querySelectorAll(
              "[data-view-toggle] button"
            ),


          filterPills:
            root.querySelectorAll(
              "[data-filter]"
            ),

          search:
            root.querySelector(
              "[data-search]"
            ),

          addBtn:
            root.querySelector(
              "[data-add]"
            ),

          exportBtn:
            root.querySelector(
              "[data-export]"
            ),

          importBtn:
            root.querySelector(
              "[data-import]"
            ),
        };

        return root;
      };

    // ============================================================
    // RENDER
    // ============================================================

    nodeType.prototype._render =
      function () {
        if (
          !this.el ||
          !this.el.scroll
        ) {
          return;
        }

        const container =
          this.el.scroll;

        container.innerHTML = "";

        if (this.root) {
          this.root.setAttribute(
            "data-psize",
            this.previewSize ||
              "normal"
          );

          this._applySizeConfig();
        }

        let filtered =
          this.cards.slice();

        if (
          this.search.trim()
        ) {
          const q =
            this.search.toLowerCase();

          filtered =
            filtered.filter(
              (c) =>
                (c.prompt || "")
                  .toLowerCase()
                  .includes(q)
            );
        }

        if (this.filter === "pinned") {
          filtered = filtered.filter((c) => c.pinned);
        } else if (this.filter === "image" || this.filter === "video") {
          filtered = filtered.filter(
            (c) => (c.type === "video" ? "video" : "image") === this.filter
          );
        }

        filtered.sort(
          (a, b) => {
            if (
              a.pinned !==
              b.pinned
            ) {
              return a.pinned
                ? -1
                : 1;
            }

            return (
              (b.ts || 0) -
              (a.ts || 0)
            );
          }
        );

        if (this.el.count) {
          this.el.count.textContent =
            this.cards.length;
        }

        if (this.root) {
          this.root.setAttribute(
            "data-psize",
            this.previewSize ||
              "normal"
          );
        }

        container.className =
          this.viewMode === "grid"
            ? "ds-cards-grid"
            : "ds-cards-list";

        this._updateHeight &&
          this._updateHeight(
            this.size
          );

        if (!filtered.length) {
          const empty =
            document.createElement(
              "div"
            );

          empty.className =
            "ds-cards-empty";

          empty.innerHTML = `
          ${ICONS.upload}
          <div class="title">No cards yet</div>
          <div class="hint">Click Add, or drop an image anywhere.<br>Paste images too.</div>
        `;

          container.appendChild(
            empty
          );

          return;
        }

        filtered.forEach(
          (card) => {
            const el =
              this._createCardElement(
                card
              );

            container.appendChild(
              el
            );
          }
        );

        const forceScrollLayout =
          () => {
            try {
              if (
                app?.canvas
                  ?.draggingNode ||
                (this.flags &&
                  this.flags.dragging)
              ) {
                return;
              }
            } catch (_) {}

            this._updateHeight &&
              this._updateHeight(
                this.size
              );

            if (
              this.el &&
              this.el.scroll
            ) {
              const s =
                this.el.scroll;

              s.style.overflowY =
                s.scrollHeight >
                s.clientHeight + 8
                  ? "scroll"
                  : "auto";
            }
          };

        requestAnimationFrame(
          () => {
            forceScrollLayout();

            requestAnimationFrame(
              forceScrollLayout
            );

            setTimeout(() => {
              try {
                forceScrollLayout();
              } catch (_) {}
            }, 80);
          }
        );
      };

    // ============================================================
    // CREATE CARD
    // ============================================================

    nodeType.prototype._createCardElement =
      function (card) {
        const isList =
          this.viewMode === "list";

        const cardEl =
          document.createElement(
            "div"
          );

        cardEl.className =
          "ds-card";

        cardEl.dataset.id =
          card.id;

        cardEl.draggable = true;

        const hasImage =
          !!card.image;

        const previewHTML =
          hasImage
            ? `<img src="${card.image}" alt="preview" />`
            : `<div class="preview-placeholder">
                 ${ICONS.upload}
                 <div>click / drop / paste</div>
               </div>`;

        const pinHTML =
          card.pinned
            ? `<div class="ds-pin-badge">${ICONS.pinFilled}</div>`
            : "";

        const promptVal =
          (card.prompt || "")
            .replace(
              /"/g,
              "&quot;"
            );

        cardEl.innerHTML = `
        <div class="ds-card-preview" data-preview>
          ${previewHTML}
          ${pinHTML}
          <div class="preview-overlay"><span>replace image</span></div>
          <button class="ds-preview-expand" data-action="expand" title="Open large preview & edit">${ICONS.expand}</button>
        </div>

        <div class="ds-card-body">
          <div class="ds-card-type" role="status" aria-label="Prompt type">
            ${card.type === "video"
              ? `<button class="ds-type-tag active" data-action="set-type" data-type="video" type="button" title="Video prompt — click to switch to Image">${ICONS.video}<span>Video</span></button>`
              : `<button class="ds-type-tag active" data-action="set-type" data-type="image" type="button" title="Image prompt — click to switch to Video">${ICONS.image}<span>Image</span></button>`}
          </div>

          <textarea class="ds-prompt-text prompt-text" data-prompt rows="3" placeholder="Describe the pose / subject...">${promptVal}</textarea>

          <div class="ds-card-actions">
            <button class="ds-icon-btn ${card.pinned ? "pinned" : ""}" data-action="pin" title="${card.pinned ? "Unpin" : "Pin"}">
              ${card.pinned ? ICONS.pinFilled : ICONS.pin}
            </button>

            <button class="ds-icon-btn" data-action="copy" title="Copy prompt">
              ${ICONS.copy}
            </button>
<button class="ds-icon-btn danger" data-action="delete" title="Delete">
              ${ICONS.trash}
            </button>
          </div>
        </div>
      `;

        if (isList) {
          cardEl.style.flexDirection =
            "row";
        }

        cardEl.style.flexShrink =
          "0";

        cardEl.style.flexGrow =
          "0";

        const preview =
          cardEl.querySelector(
            "[data-preview]"
          );

        const textarea =
          cardEl.querySelector(
            "[data-prompt]"
          );

        // ========================================================
        // IMAGE CLICK
        // ========================================================

        preview.addEventListener(
          "click",
          (e) => {
            if (
              e.target.closest(
                "[data-action='expand']"
              )
            ) {
              return;
            }

            e.stopPropagation();

            this._pickImageForCard(
              card.id,
              preview
            );
          }
        );

        // ========================================================
        // DOUBLE CLICK
        // ========================================================

        preview.addEventListener(
          "dblclick",
          (e) => {
            e.stopPropagation();

            this._openCardModal(
              card.id
            );
          }
        );

        // ========================================================
        // IMAGE DROP
        // ========================================================

        preview.addEventListener(
          "dragover",
          (e) => {
            e.preventDefault();

            preview.style.outline =
              "1px solid var(--ds-accent)";
          }
        );

        preview.addEventListener(
          "dragleave",
          () => {
            preview.style.outline =
              "";
          }
        );

        preview.addEventListener(
          "drop",
          async (e) => {
            e.preventDefault();

            preview.style.outline =
              "";

            const file =
              e.dataTransfer
                .files[0];

            if (
              file &&
              file.type.startsWith(
                "image/"
              )
            ) {
              const dataUrl =
                await fileToOptimizedDataUrl(
                  file
                );

              this._setCardImage(
                card.id,
                dataUrl
              );
            }
          }
        );

        // ========================================================
        // PASTE IMAGE
        // ========================================================

        cardEl.addEventListener(
          "paste",
          async (e) => {
            const items =
              e.clipboardData?.items ||
              [];

            for (
              const item of items
            ) {
              if (
                item.type.startsWith(
                  "image"
                )
              ) {
                e.preventDefault();

                const file =
                  item.getAsFile();

                if (file) {
                  const dataUrl =
                    await fileToOptimizedDataUrl(
                      file
                    );

                  this._setCardImage(
                    card.id,
                    dataUrl
                  );
                }

                return;
              }
            }
          }
        );

        // ========================================================
        // PROMPT AUTOSAVE
        // ========================================================

        const savePrompt =
          debounce(
            (val) => {
              const c =
                this.cards.find(
                  (x) =>
                    x.id ===
                    card.id
                );

              if (c) {
                c.prompt = val;

                c.ts =
                  Date.now();

                this._saveState();
              }
            },
            260
          );

        textarea.addEventListener(
          "input",
          () => {
            savePrompt(
              textarea.value
            );
          }
        );

        textarea.addEventListener(
          "focus",
          () => {
            if (
              this.viewMode ===
              "grid"
            ) {
              textarea.style.maxHeight =
                "148px";
            }
          }
        );

        textarea.addEventListener(
          "blur",
          () => {
            if (
              this.viewMode ===
              "grid"
            ) {
              textarea.style.maxHeight =
                "118px";
            }

            this._saveState();

            if (
              this._saveToServer
            ) {
              this._saveToServer.flush?.();
            }
          }
        );

        // ========================================================
        // ACTION BUTTONS
        // ========================================================

        cardEl
          .querySelectorAll(
            "[data-action]"
          )
          .forEach(
            (btn) => {
              btn.addEventListener(
                "click",
                (e) => {
                  e.stopPropagation();

                  const action =
                    btn.dataset.action;

                  if (
                    action ===
                    "pin"
                  ) {
                    this._togglePin(
                      card.id
                    );
                  }

                  if (
                    action ===
                    "copy"
                  ) {
                    this._copyPrompt(
                      card.prompt ||
                        ""
                    );
                  }

                  if (
                    action ===
                    "delete"
                  ) {
                    this._deleteCard(
                      card.id
                    );
                  }

                  if (action === "set-type") {
                    const nextType = btn.dataset.type === "video" ? "image" : "video";
                    this._setCardType(card.id, nextType);
                  }

                  if (
                    action ===
                    "expand"
                  ) {
                    this._openCardModal(
                      card.id
                    );
                  }
                }
              );
            }
          );

        // ========================================================
        // DRAG REORDER
        // ========================================================

        cardEl.addEventListener(
          "dragstart",
          (e) => {
            cardEl.classList.add(
              "dragging"
            );

            e.dataTransfer.setData(
              "text/plain",
              card.id
            );

            e.dataTransfer.effectAllowed =
              "move";
          }
        );

        cardEl.addEventListener(
          "dragend",
          () => {
            cardEl.classList.remove(
              "dragging"
            );

            this.root
              .querySelectorAll(
                ".drop-target"
              )
              .forEach(
                (el) =>
                  el.classList.remove(
                    "drop-target"
                  )
              );
          }
        );

        cardEl.addEventListener(
          "dragover",
          (e) => {
            e.preventDefault();

            cardEl.classList.add(
              "drop-target"
            );
          }
        );

        cardEl.addEventListener(
          "dragleave",
          () => {
            cardEl.classList.remove(
              "drop-target"
            );
          }
        );

        cardEl.addEventListener(
          "drop",
          (e) => {
            e.preventDefault();

            cardEl.classList.remove(
              "drop-target"
            );

            const draggedId =
              e.dataTransfer.getData(
                "text/plain"
              );

            if (
              draggedId &&
              draggedId !== card.id
            ) {
              this._reorderCards(
                draggedId,
                card.id,
                e
              );
            }
          }
        );

        return cardEl;
      };

    // ============================================================
    // ADD CARD
    // ============================================================

    nodeType.prototype._addCard =
      function (
        imageData = null
      ) {
        const newCard = {
          id: uid(),
          prompt: "",
          image: imageData,
          type: "image",
          pinned: false,
          ts: Date.now(),
        };

        this.cards.unshift(
          newCard
        );

        this._saveState();
        this._saveToServer?.();
        this._saveToServer?.flush?.();

        this._render();

        this._updateHeight(
          this.size
        );

        setTimeout(() => {
          const el =
            this.root.querySelector(
              `[data-id="${newCard.id}"] textarea`
            );

          if (el) {
            el.focus();
          }
        }, 30);
      };

    // ============================================================
    // DELETE
    // ============================================================

    nodeType.prototype._deleteCard =
      function (id) {
        if (
          !confirm(
            "Delete this card?"
          )
        ) {
          return;
        }

        this.cards =
          this.cards.filter(
            (c) => c.id !== id
          );

        this._saveState();

        this._render();

        this._updateHeight(
          this.size
        );
      };

    // ============================================================
    // PIN
    // ============================================================

    nodeType.prototype._togglePin =
      function (id) {
        const c =
          this.cards.find(
            (x) => x.id === id
          );

        if (!c) return;

        c.pinned =
          !c.pinned;

        c.ts =
          Date.now();

        this._saveState();

        this._render();
      };

    // ============================================================
    // COPY PROMPT
    // ============================================================

    nodeType.prototype._copyPrompt =
      function (text) {
        if (!text) {
          this._showToast(
            "Nothing to copy"
          );

          return;
        }

        navigator.clipboard
          .writeText(text)
          .then(() => {
            this._showToast(
              "Copied prompt"
            );
          })
          .catch(() => {
            const ta =
              document.createElement(
                "textarea"
              );

            ta.value = text;

            document.body.appendChild(
              ta
            );

            ta.select();

            document.execCommand(
              "copy"
            );

            document.body.removeChild(
              ta
            );

            this._showToast(
              "Copied"
            );
          });
      };

    // ============================================================
    // SET IMAGE
    // ============================================================

    nodeType.prototype._setCardImage =
      function (
        id,
        dataUrl
      ) {
        const c =
          this.cards.find(
            (x) => x.id === id
          );

        if (!c) return;

        c.image =
          dataUrl;

        c.ts =
          Date.now();

        this._saveState();

        this._render();

        this._updateHeight(
          this.size
        );
      };

    // ============================================================
    // PICK IMAGE
    // ============================================================

    nodeType.prototype._pickImageForCard =
      function (
        id,
        previewEl
      ) {
        const input =
          document.createElement(
            "input"
          );

        input.type =
          "file";

        input.accept =
          "image/*";

        input.onchange =
          async () => {
            if (
              input.files &&
              input.files[0]
            ) {
              const dataUrl =
                await fileToOptimizedDataUrl(
                  input.files[0]
                );

              this._setCardImage(
                id,
                dataUrl
              );
            }
          };

        input.click();
      };
    // ============================================================
    // REORDER
    // ============================================================

    nodeType.prototype._reorderCards =
      function (
        draggedId,
        targetId,
        dropEvent
      ) {
        const from =
          this.cards.findIndex(
            (c) =>
              c.id ===
              draggedId
          );

        let to =
          this.cards.findIndex(
            (c) =>
              c.id ===
              targetId
          );

        if (
          from === -1 ||
          to === -1 ||
          from === to
        ) {
          return;
        }

        const targetRect =
          dropEvent.currentTarget
            ? dropEvent.currentTarget.getBoundingClientRect()
            : null;

        if (
          targetRect &&
          dropEvent.clientY >
            targetRect.top +
              targetRect.height *
                0.5
        ) {
          to =
            to + 1;
        }

        const [moved] =
          this.cards.splice(
            from,
            1
          );

        if (to > from) {
          to -= 1;
        }

        this.cards.splice(
          to,
          0,
          moved
        );

        this._saveState();

        this._render();

        this._updateHeight(
          this.size
        );
      };

    // ============================================================
    // GLOBAL UI WIRING
    // ============================================================

    nodeType.prototype._wireGlobal =
      function () {
        const root =
          this.root;

        const scroll =
          this.el.scroll;

        // Add button
        this.el.addBtn.addEventListener(
          "click",
          () =>
            this._addCard()
        );

        // View toggle
        this.el.viewBtns.forEach(
          (btn) => {
            btn.addEventListener(
              "click",
              () => {
                const mode =
                  btn.dataset.view;

                this.viewMode =
                  mode;

                this.el.viewBtns.forEach(
                  (b) =>
                    b.classList.toggle(
                      "active",
                      b.dataset.view ===
                        mode
                    )
                );

                this._saveState();

                this._render();
              }
            );
          }
        );


        // Export
        if (
          this.el.exportBtn
        ) {
          this.el.exportBtn.addEventListener(
            "click",
            () =>
              this._exportCards()
          );
        }

        // Import
        if (
          this.el.importBtn
        ) {
          this.el.importBtn.addEventListener(
            "click",
            () =>
              this._importCards()
          );
        }

        // Filters
        this.el.filterPills.forEach(
          (pill) => {
            pill.addEventListener(
              "click",
              () => {
                this.filter =
                  pill.dataset.filter;

                this.el.filterPills.forEach(
                  (p) =>
                    p.classList.toggle(
                      "active",
                      p.dataset.filter ===
                        this.filter
                    )
                );

                this._render();
              }
            );
          }
        );

        // Search
        const onSearch =
          debounce(
            (val) => {
              this.search =
                val;

              this._render();
            },
            120
          );

        this.el.search.addEventListener(
          "input",
          (e) =>
            onSearch(
              e.target.value
            )
        );

        // Global drop zone
        scroll.addEventListener(
          "dragover",
          (e) => {
            e.preventDefault();

            scroll.style.outline =
              "1px dashed var(--ds-accent)";
          }
        );

        scroll.addEventListener(
          "dragleave",
          () => {
            scroll.style.outline =
              "";
          }
        );

        scroll.addEventListener(
          "drop",
          async (e) => {
            e.preventDefault();

            scroll.style.outline =
              "";

            const file =
              e.dataTransfer
                .files[0];

            if (
              file &&
              file.type.startsWith(
                "image/"
              )
            ) {
              const dataUrl =
                await fileToOptimizedDataUrl(
                  file
                );

              this._addCard(
                dataUrl
              );
            }
          }
        );

        // Paste images anywhere on node
        root.addEventListener(
          "paste",
          async (e) => {
            const items =
              e.clipboardData?.items ||
              [];

            for (
              const item of items
            ) {
              if (
                item.type.startsWith(
                  "image/"
                )
              ) {
                e.preventDefault();

                const file =
                  item.getAsFile();

                if (file) {
                  const dataUrl =
                    await fileToOptimizedDataUrl(
                      file
                    );

                  this._addCard(
                    dataUrl
                  );
                }

                return;
              }
            }
          }
        );

        // Keyboard shortcut
        root.addEventListener(
          "keydown",
          (e) => {
            if (
              e.key === "/" &&
              document.activeElement
                .tagName ===
                "BODY"
            ) {
              e.preventDefault();

              this.el.search.focus();

              this.el.search.select();
            }
          }
        );
      };

    // ============================================================
    // TOAST
    // ============================================================

    nodeType.prototype._showToast =
      function (
        msg,
        ms = 1400
      ) {
        const t =
          this.el.toast;

        if (!t) return;

        t.textContent =
          msg;

        t.classList.add(
          "show"
        );

        clearTimeout(
          this._toastTimer
        );

        this._toastTimer =
          setTimeout(() => {
            t.classList.remove(
              "show"
            );
          }, ms);
      };

    // ============================================================
    // PERSISTENCE
    // ============================================================

    nodeType.prototype._saveState =
      function () {
        /*
         * ========================================================
         * CRITICAL FIX
         * ========================================================
         *
         * NEVER serialize this.cards here.
         *
         * Previously this function did:
         *
         *     cards: this.cards
         *
         * That meant every prompt and every base64 image was placed
         * inside the ComfyUI workflow widget.
         *
         * With 214 cards this produced a ~10.2 MB node and caused:
         *
         *     Failed to save workflow draft
         *
         * The actual library is already persisted on disk through:
         *
         *     /ds/promptcards/cards
         *
         * Therefore the workflow only needs tiny UI state.
         */

        const payload = {
          version: 3,

          viewMode:
            this.viewMode,

          filter:
            this.filter,

          search:
            this.search,

        };

        if (
          this.stateWidget
        ) {
          this.stateWidget.value =
            JSON.stringify(
              payload
            );
        }

        // Mark canvas dirty, but don't do it during dragging.
        clearTimeout(
          this._dirtyTimer
        );

        this._dirtyTimer =
          setTimeout(() => {
            try {
              if (
                app?.canvas
                  ?.draggingNode ||
                (this.flags &&
                  this.flags.dragging)
              ) {
                return;
              }
            } catch (_) {}

            if (
              typeof this.setDirtyCanvas ===
              "function"
            ) {
              this.setDirtyCanvas(
                true,
                true
              );
            }
          }, 120);

        // Save the actual library to disk.
        this._saveToServer &&
          this._saveToServer();
      };

    // ============================================================
    // RESTORE STATE
    //
    // Only restores tiny UI state.
    //
    // Legacy cards are handled by _loadFromServer().
    // ============================================================

    nodeType.prototype._restoreState =
      function () {
        let raw =
          "{}";

        if (
          this.stateWidget &&
          this.stateWidget.value
        ) {
          raw =
            this.stateWidget.value;
        } else if (
          this.widgets
        ) {
          const w =
            this.widgets.find(
              (x) =>
                x.name ===
                "cards_state"
            );

          if (
            w &&
            w.value
          ) {
            raw =
              w.value;
          }
        }

        try {
          const data =
            JSON.parse(
              raw || "{}"
            );

          /*
           * IMPORTANT:
           *
           * Do NOT restore cards from cards_state.
           *
           * The library comes from disk.
           *
           * This also prevents accidentally re-introducing the
           * old 10 MB snapshot into the node.
           */

          this.viewMode =
            data.viewMode ===
            "list"
              ? "list"
              : "grid";

          this.filter =
            ["all", "pinned", "image", "video"].includes(data.filter)
              ? data.filter
              : "all";

          this.search =
            data.search ||
            "";

          this.previewSize = "large";

          // UI toggles
          if (this.el) {
            this.el.viewBtns.forEach(
              (b) =>
                b.classList.toggle(
                  "active",
                  b.dataset.view ===
                    this.viewMode
                )
            );

            this.el.filterPills.forEach(
              (p) =>
                p.classList.toggle(
                  "active",
                  p.dataset.filter ===
                    this.filter
                )
            );


            if (
              this.el.search
            ) {
              this.el.search.value =
                this.search;
            }
          }

          if (
            this.root
          ) {
            this._applySizeConfig();
          }
        } catch (e) {
          this.viewMode =
            "grid";

          this.filter =
            "all";

          this.search =
            "";

          this.previewSize =
            "large";
        }
      };

    // ============================================================
    // VIEW MODE
    // ============================================================

    nodeType.prototype._setViewMode =
      function (mode) {
        this.viewMode =
          mode;

        if (this.el) {
          this.el.viewBtns.forEach(
            (b) =>
              b.classList.toggle(
                "active",
                b.dataset.view ===
                  mode
              )
          );
        }

        this._saveState();

        this._render();
      };

    // ============================================================
    // PREVIEW SIZE
    // ============================================================

    // Preview size is intentionally fixed to large.
    nodeType.prototype._setPreviewSize = function () {
      this.previewSize = "large";
      this._applySizeConfig();
      this._render();
      this._updateHeight && this._updateHeight(this.size);
    };

    // ============================================================
    // SIZE CONFIG
    // ============================================================

    nodeType.prototype._applySizeConfig = function () {
      if (!this.root) return;

      this.previewSize = "large";

      this.root.style.setProperty("--preview-h", "280px");
      this.root.style.setProperty("--list-preview-w", "220px");
      this.root.style.setProperty("--list-preview-size", "220px");
      this.root.style.setProperty("--grid-min-col", "265px");
      this.root.style.setProperty("--card-gap", "12px");
    };

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

    nodeType.prototype._exportCards =
      function () {
        try {
          const data =
            JSON.stringify(
              {
                version: 1,

                exportedAt:
                  new Date().toISOString(),

                cards:
                  this.cards,
              },
              null,
              2
            );

          const blob =
            new Blob(
              [data],
              {
                type:
                  "application/json",
              }
            );

          const url =
            URL.createObjectURL(
              blob
            );

          const a =
            document.createElement(
              "a"
            );

          a.href =
            url;

          a.download =
            "deathshot_prompt_cards.json";

          document.body.appendChild(
            a
          );

          a.click();

          document.body.removeChild(
            a
          );

          URL.revokeObjectURL(
            url
          );

          this._showToast(
            "Exported " +
              this.cards.length +
              " cards"
          );
        } catch (e) {
          this._showToast(
            "Export failed"
          );
        }
      };

    // ============================================================
    // IMPORT
    // ============================================================

    nodeType.prototype._importCards =
      function () {
        const input =
          document.createElement(
            "input"
          );

        input.type =
          "file";

        input.accept =
          ".json,application/json";

        input.onchange =
          async () => {
            const file =
              input.files &&
              input.files[0];

            if (!file) {
              return;
            }

            try {
              const text =
                await file.text();

              const parsed =
                JSON.parse(
                  text
                );

              let incoming =
                [];

              if (
                Array.isArray(
                  parsed
                )
              ) {
                incoming =
                  parsed;
              } else if (
                parsed.cards &&
                Array.isArray(
                  parsed.cards
                )
              ) {
                incoming =
                  parsed.cards;
              }

              if (
                !incoming.length
              ) {
                this._showToast(
                  "No cards found in file"
                );

                return;
              }

              let added = 0;
              let updated = 0;

              incoming.forEach(
                (ic) => {
                  if (!ic) {
                    return;
                  }

                  const existing =
                    this.cards.find(
                      (c) =>
                        c.id ===
                        ic.id
                    );

                  if (
                    existing
                  ) {
                    existing.prompt =
                      ic.prompt ||
                      existing.prompt ||
                      "";

                    if (
                      ic.image
                    ) {
                      existing.image =
                        ic.image;
                    }

                    if (ic.type === "image" || ic.type === "video") {
                      existing.type = ic.type;
                    }

                    if (
                      typeof ic.pinned ===
                      "boolean"
                    ) {
                      existing.pinned =
                        ic.pinned;
                    }

                    existing.ts =
                      Date.now();

                    updated++;
                  } else {
                    this.cards.push(
                      {
                        id:
                          ic.id ||
                          uid(),

                        prompt:
                          ic.prompt ||
                          "",

                        image:
                          ic.image ||
                          null,

                        type:
                          ic.type === "video"
                            ? "video"
                            : "image",

                        pinned:
                          !!ic.pinned,

                        ts:
                          Date.now(),
                      }
                    );

                    added++;
                  }
                }
              );

              this._saveState();

              this._render();

              this._updateHeight(
                this.size
              );

              this._showToast(
                `Imported: +${added} new, ${updated} updated`
              );
            } catch (e) {
              console.error(
                e
              );

              this._showToast(
                "Import failed (bad JSON?)"
              );
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
        "--ds-bg", "--ds-panel", "--ds-panel-2", "--ds-accent",
        "--ds-accent-2", "--ds-text", "--ds-text-muted", "--ds-border",
        "--ds-danger", "--ds-success", "--ds-radius", "--ds-radius-sm",
        "--ds-gap", "--ds-font", "--ds-scrollbar"
      ];

      const computed = getComputedStyle(this.root);
      vars.forEach((name) => {
        const value = computed.getPropertyValue(name).trim();
        if (value) modal.style.setProperty(name, value);
      });

      if (this._modalThemeObserver) {
        this._modalThemeObserver.disconnect();
      }

      this._modalThemeObserver = new MutationObserver(() => {
        if (document.body.contains(modal)) {
          const latest = getComputedStyle(this.root);
          vars.forEach((name) => {
            const value = latest.getPropertyValue(name).trim();
            if (value) modal.style.setProperty(name, value);
          });
        }
      });

      this._modalThemeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class", "style", "data-theme", "data-color-scheme"]
      });

      this._modalThemeBodyObserver = new MutationObserver(() => {
        if (document.body.contains(modal)) {
          const latest = getComputedStyle(this.root);
          vars.forEach((name) => {
            const value = latest.getPropertyValue(name).trim();
            if (value) modal.style.setProperty(name, value);
          });
        }
      });
      this._modalThemeBodyObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ["class", "style", "data-theme", "data-color-scheme"]
      });
    };

    // ============================================================
    // CARD MODAL
    // ============================================================

    nodeType.prototype._openCardModal =
      function (id) {
        const card =
          this.cards.find(
            (c) => c.id === id
          );

        if (!card) {
          return;
        }

        const old =
          document.querySelector(
            ".ds-pc-modal"
          );

        if (old) {
          old.remove();
        }

        const modal =
          document.createElement(
            "div"
          );

        modal.className =
          "ds-pc-modal";

        modal.innerHTML = `
        <div class="ds-pc-modal-backdrop"></div>

        <div class="ds-pc-modal-content">

          <div class="ds-pc-modal-header">

            <div class="ds-pc-modal-title">
              Card Preview &amp; Edit
            </div>

            <div class="ds-pc-modal-actions">

              <button class="ds-icon-btn"
                      data-maction="pin"
                      title="Toggle pin">
                ${
                  card.pinned
                    ? ICONS.pinFilled
                    : ICONS.pin
                }
              </button>

              <button class="ds-icon-btn"
                      data-maction="copy"
                      title="Copy prompt">
                ${ICONS.copy}
              </button>
<button class="ds-icon-btn danger"
                      data-maction="delete"
                      title="Delete">
                ${ICONS.trash}
              </button>

              <button class="ds-icon-btn"
                      data-maction="close"
                      title="Close">
                ✕
              </button>

            </div>

          </div>

          <div class="ds-pc-modal-image-wrap">

            ${
              card.image
                ? `<img src="${card.image}"
                        class="ds-pc-modal-img"
                        alt="large preview" />`
                : `<div class="ds-pc-modal-placeholder">
                     ${ICONS.upload}
                     <div>No image yet — click Replace</div>
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

            <button class="ds-btn"
                    data-maction="replace">
              Replace Image
            </button>

          </div>

          <div class="ds-pc-modal-body">

            <textarea
              class="ds-pc-modal-prompt"
              placeholder="Describe the pose / subject..."
            >${(card.prompt || "")
              .replace(
                /</g,
                "&lt;"
              )
              .replace(
                />/g,
                "&gt;"
              )}</textarea>

          </div>

          <div class="ds-pc-modal-footer">

            <div class="ds-pc-hint">
              Changes save automatically.
              Double-click small preview
              or use expand to open here.
            </div>

            <button class="ds-btn"
                    data-maction="close">
              Done
            </button>

          </div>

        </div>
      `;

        document.body.appendChild(
          modal
        );

        this._applyModalTheme(modal);

        const backdrop =
          modal.querySelector(
            ".ds-pc-modal-backdrop"
          );

        const imgWrap =
          modal.querySelector(
            ".ds-pc-modal-image-wrap"
          );

        const ta =
          modal.querySelector(
            ".ds-pc-modal-prompt"
          );

        const savePrompt =
          debounce(
            (val) => {
              const c =
                this.cards.find(
                  (x) =>
                    x.id === id
                );

              if (c) {
                c.prompt =
                  val;

                c.ts =
                  Date.now();

                this._saveState();

                const small =
                  this.root &&
                  this.root.querySelector(
                    `[data-id="${id}"] .ds-prompt-text`
                  );

                if (small) {
                  small.value =
                    val;
                }
              }
            },
            220
          );

        ta.addEventListener(
          "input",
          () =>
            savePrompt(
              ta.value
            )
        );

        const close =
          () => {
            if (
              savePrompt.flush
            ) {
              savePrompt.flush();
            }

            if (this._modalThemeObserver) {
              this._modalThemeObserver.disconnect();
              this._modalThemeObserver = null;
            }
            if (this._modalThemeBodyObserver) {
              this._modalThemeBodyObserver.disconnect();
              this._modalThemeBodyObserver = null;
            }

            modal.remove();

            this._render();
          };

        backdrop.addEventListener(
          "click",
          close
        );

        modal
          .querySelectorAll(
            "[data-maction]"
          )
          .forEach(
            (btn) => {
              btn.addEventListener(
                "click",
                (e) => {
                  const act =
                    btn.dataset.maction;

                  const c =
                    this.cards.find(
                      (x) =>
                        x.id === id
                    );

                  if (!c) {
                    close();
                    return;
                  }

                  if (
                    act ===
                    "close"
                  ) {
                    close();
                  }

                  else if (
                    act ===
                    "copy"
                  ) {
                    this._copyPrompt(
                      c.prompt ||
                        ""
                    );
                  }

                  else if (
                    act ===
                    "pin"
                  ) {
                    c.pinned =
                      !c.pinned;

                    c.ts =
                      Date.now();

                    this._saveState();

                    btn.innerHTML =
                      c.pinned
                        ? ICONS.pinFilled
                        : ICONS.pin;
                  }

                  else if (act === "set-type") {
                    const nextType = btn.dataset.type === "video" ? "video" : "image";
                    this._setCardType(id, nextType);
                    modal.querySelectorAll("[data-maction='set-type']").forEach((b) => {
                      b.classList.toggle("active", b.dataset.type === nextType);
                    });
                  }

                  else if (
                    act ===
                    "delete"
                  ) {
                    if (
                      confirm(
                        "Delete this card?"
                      )
                    ) {
                      this.cards =
                        this.cards.filter(
                          (x) =>
                            x.id !==
                            id
                        );

                      this._saveState();

                      close();
                    }
                  }

                  else if (
                    act ===
                    "replace"
                  ) {
                    const input =
                      document.createElement(
                        "input"
                      );

                    input.type =
                      "file";

                    input.accept =
                      "image/*";

                    input.onchange =
                      async () => {
                        if (
                          input.files &&
                          input.files[0]
                        ) {
                          const dataUrl =
                            await fileToOptimizedDataUrl(
                              input.files[0]
                            );

                          c.image =
                            dataUrl;

                          c.ts =
                            Date.now();

                          this._saveState();

                          imgWrap.innerHTML =
                            `<img src="${dataUrl}" class="ds-pc-modal-img" alt="large preview" />`;

                          this._render();
                        }
                      };

                    input.click();
                  }
                }
              );
            }
          );

        const onKey =
          (ev) => {
            if (
              ev.key ===
              "Escape"
            ) {
              document.removeEventListener(
                "keydown",
                onKey
              );

              close();
            }
          };

        document.addEventListener(
          "keydown",
          onKey,
          {
            once: true,
          }
        );

        setTimeout(
          () =>
            ta.focus(),
          30
        );
      };
  },
});