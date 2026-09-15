/* ============================================================
   DS Prompt - DeathshotArsenal
   Custom DOM STRING editor.

   The backend keeps the real `text` STRING widget for workflow
   serialization. The native widget is hidden rather than removed;
   the visible editor is a separate DOM widget. This avoids the
   duplicate-widget / widget-store strip seen in newer ComfyUI builds.
   ============================================================ */

import { app } from "/scripts/app.js";
import { protectDSResizeCorners } from "../Shared/ds_ui_system.js";

const cssLink = document.createElement("link");
cssLink.rel = "stylesheet";
cssLink.href = "/extensions/DeathshotArsenal/Prompt/ds_prompt.css";
if (!document.head.querySelector('link[data-ds-prompt-css]')) {
  cssLink.dataset.dsPromptCss = "true";
  document.head.appendChild(cssLink);
}

const ICONS = {
  prompt: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.5h14v15H5z"/><path d="M8 8h8M8 11.5h8M8 15h5"/></svg>`,
  copy: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="1.5"/><path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4H6.5A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8"/></svg>`,
  clear: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>`,
  replace: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h9a4 4 0 0 1 4 4v1"/><path d="m15 9 3 3 3-3"/><path d="M19 17h-9a4 4 0 0 1-4-4v-1"/><path d="m9 15-3-3-3 3"/></svg>`,
  expand: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5"/><path d="m3 8 5-5M21 8l-5-5M21 16l-5 5M3 16l5 5"/></svg>`,
  collapse: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 3-6 6M15 3l6 6M21 15l-6 6M3 15l6 6"/><path d="M3 9h6V3M15 3v6h6M21 15h-6v6M9 21v-6H3"/></svg>`,
  resize: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 21 21 6M12 21 21 12M18 21 21 18"/></svg>`,
};

async function copyText(text) {
  const value = String(text ?? "");
  if (!value) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch (_) {
    try {
      const area = document.createElement("textarea");
      area.value = value;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.left = "-10000px";
      area.style.top = "-10000px";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    } catch (_) {
      return false;
    }
  }
}

async function readClipboard() {
  try {
    return await navigator.clipboard.readText();
  } catch (_) {
    return null;
  }
}

function getWidget(node, name) {
  return (node.widgets || []).find((widget) => widget?.name === name) || null;
}

function ensurePromptProperties(node) {
  node.properties = node.properties || {};
  return node.properties;
}

function hideNativeWidget(widget) {
  if (!widget) return;
  widget.hidden = true;
  widget.options = widget.options || {};
  widget.options.hidden = true;
  widget.computeSize = () => [0, 0];

  // Some ComfyUI builds still keep the legacy input element mounted even
  // after the widget is marked hidden. Hide those DOM remnants as well; this
  // is the thin link-to-link strip visible with customtext widgets.
  for (const element of [widget.inputEl, widget.element]) {
    if (element?.style) {
      element.style.display = "none";
      element.style.visibility = "hidden";
      element.style.pointerEvents = "none";
    }
  }

  // Keep the real widget in node.widgets so ComfyUI's workflow serializer and
  // widget-value store continue to own the actual STRING value.
}

function getPersistedExpandedState(node) {
  try {
    if (node?.id != null) {
      const stored = localStorage.getItem(`ds_prompt_expanded_${node.id}`);
      if (stored !== null) return stored === "true";
    }
  } catch (_) {}
  const props = node?.properties || {};
  if (Object.prototype.hasOwnProperty.call(props, "ds_prompt_expanded")) {
    return Boolean(props.ds_prompt_expanded);
  }
  return false;
}

function fixInvalidNodeId(node) {
  if (!node) return;
  const graph = node.graph || app?.graph;
  if (!graph) return;
  if (node.id !== -1 && node.id != null && graph._nodes_by_id?.[node.id] === node) return;

  let maxId = Number(graph.last_node_id || graph.lastNodeId || 0);
  for (const n of graph._nodes || []) {
    const nid = Number(n?.id);
    if (!isNaN(nid) && nid > maxId) maxId = nid;
  }
  const newId = maxId + 1;
  graph.last_node_id = newId;
  if (graph.lastNodeId !== undefined) graph.lastNodeId = newId;
  if (node.id != null && graph._nodes_by_id?.[node.id] === node) {
    delete graph._nodes_by_id[node.id];
  }
  node.id = newId;
  if (graph._nodes_by_id) graph._nodes_by_id[newId] = node;
}

app.registerExtension({
  name: "DeathshotArsenal.Prompt",

  setup() {
    const healStaleNodes = () => {
      const g = app.graph;
      if (!g?._nodes) return;
      for (const n of g._nodes) {
        if (n && n.type === "DS_Prompt" && (n.id === -1 || n.id == null || g._nodes_by_id?.[n.id] !== n)) {
          fixInvalidNodeId(n);
        }
      }
    };
    setTimeout(healStaleNodes, 150);
    setTimeout(healStaleNodes, 600);
  },

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== "DS_Prompt") return;

    const originalCreated = nodeType.prototype.onNodeCreated;
    const originalConfigure = nodeType.prototype.configure;
    const originalConfigured = nodeType.prototype.onConfigure;
    const originalExecuted = nodeType.prototype.onExecuted;
    const originalConnections = nodeType.prototype.onConnectionsChange;
    const originalResize = nodeType.prototype.onResize;
    const originalSerialize = nodeType.prototype.serialize;
    const originalOnSerialize = nodeType.prototype.onSerialize;
    const originalRemoved = nodeType.prototype.onRemoved;
    const originalSelected = nodeType.prototype.onSelected;
    const originalComputeSize = nodeType.prototype.computeSize;
    const originalClone = nodeType.prototype.clone;

    nodeType.prototype.onNodeCreated = function () {
      const result = originalCreated
        ? originalCreated.apply(this, arguments)
        : undefined;

      this.resizable = true;
      protectDSResizeCorners(this);
      this._dsPromptExpanded = false;

      // Never remove the native `text` widget. Newer ComfyUI versions can
      // keep a widget-store registration after removal, which creates the
      // thin strip/duplicate DOM artifact. Hide it and use it only as the
      // serialized source of truth.
      this._dsPromptNativeText = getWidget(this, "text");
      hideNativeWidget(this._dsPromptNativeText);

      this._dsPromptPositionWidget = getWidget(this, "trigger_position");
      hideNativeWidget(this._dsPromptPositionWidget);

      const current = Array.isArray(this.size) ? this.size : [400, 220];
      this.size = [
        Math.max(Number(current[0]) || 0, 320),
        Math.max(Number(current[1]) || 0, 110),
      ];

      const root = document.createElement("div");
      root.className = "ds-prompt-root";
      root.dataset.dsThemed = "true";
      root.innerHTML = `
        <div class="ds-prompt-toolbar">
          <div class="ds-prompt-title">
            <span class="ds-prompt-title-icon">${ICONS.prompt}</span>
            <span>Prompt</span>
          </div>
          <span class="ds-prompt-status" data-status aria-live="polite"></span>
          <div class="ds-prompt-actions" role="toolbar" aria-label="Prompt actions">
            <button class="ds-prompt-icon-btn ds-ui-button ds-ui-icon-button" type="button" data-action="copy"
                    title="Copy prompt" aria-label="Copy prompt">
              ${ICONS.copy}
            </button>
            <button class="ds-prompt-icon-btn ds-ui-button ds-ui-icon-button" type="button" data-action="replace"
                    title="Replace prompt with clipboard text" aria-label="Replace prompt with clipboard text">
              ${ICONS.replace}
            </button>
            <button class="ds-prompt-icon-btn ds-ui-button ds-ui-icon-button" type="button" data-action="clear"
                    title="Clear prompt" aria-label="Clear prompt">
              ${ICONS.clear}
            </button>
          </div>
          <div class="ds-prompt-trigger-control" role="group" aria-label="LoRA trigger position">
            <span class="ds-prompt-trigger-label">Triggers</span>
            <button class="ds-prompt-segment" type="button" data-position="before">Before</button>
            <button class="ds-prompt-segment active" type="button" data-position="after">After</button>
          </div>
          <button class="ds-prompt-icon-btn ds-ui-button ds-ui-icon-button" type="button" data-action="expand"
                  title="Show effective prompt preview" aria-label="Show effective prompt preview">
            ${ICONS.expand}
          </button>
        </div>

        <div class="ds-prompt-editor">
          <textarea class="ds-prompt-textarea" data-prompt spellcheck="false"
                    placeholder="Write your prompt..."></textarea>
          <div class="ds-prompt-preview" data-preview-wrap>
            <div class="ds-prompt-preview-head">Effective prompt</div>
            <div class="ds-prompt-preview-text" data-preview></div>
          </div>
        </div>

        <div class="ds-prompt-resize-handle" data-resize-handle title="Drag to resize" aria-label="Resize node" role="separator" tabindex="-1">
          ${ICONS.resize}
        </div>
      `;

      this._dsPromptRoot = root;
      this._dsPromptTextarea = root.querySelector("[data-prompt]");
      this._dsPromptPreview = root.querySelector("[data-preview]");
      this._dsPromptStatus = root.querySelector("[data-status]");
      this._dsPromptExpand = root.querySelector('[data-action="expand"]');
      this._dsPromptPositionButtons = [...root.querySelectorAll("[data-position]")];
      this._dsPromptResizeHandle = root.querySelector("[data-resize-handle]");

      // Native LiteGraph corner-resize hit-testing can't reach through this
      // full-bleed DOM overlay reliably across ComfyUI frontend versions, so
      // the node gets its own resize grip instead of depending on it. This
      // drags node.size directly and reuses the same onResize() clamp/sync
      // logic defined below, so behavior stays identical either way.
      if (this._dsPromptResizeHandle) {
        this._dsPromptResizeHandle.addEventListener("pointerdown", (event) => {
          if (event.button !== undefined && event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();

          const handle = this._dsPromptResizeHandle;
          handle.classList.add("is-active");
          try { handle.setPointerCapture(event.pointerId); } catch (_) {}

          const startX = event.clientX;
          const startY = event.clientY;
          const startW = Number(this.size?.[0]) || 400;
          const startH = Number(this.size?.[1]) || 200;
          // Divide screen-space drag distance by the canvas zoom so the grip
          // tracks the cursor 1:1 regardless of how far zoomed in/out.
          const scale = app?.canvas?.ds?.scale || 1;

          const onMove = (moveEvent) => {
            const dx = (moveEvent.clientX - startX) / scale;
            const dy = (moveEvent.clientY - startY) / scale;
            if (!this.size) this.size = [startW, startH];
            this.size[0] = Math.max(startW + dx, 320);
            this.size[1] = Math.max(startH + dy, 110);
            if (typeof this.onResize === "function") this.onResize(this.size);
            this.setDirtyCanvas(true, true);
          };

          const onUp = (upEvent) => {
            handle.classList.remove("is-active");
            try { handle.releasePointerCapture(upEvent.pointerId); } catch (_) {}
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
          };

          window.addEventListener("pointermove", onMove);
          window.addEventListener("pointerup", onUp);
        });
      }

      const props = ensurePromptProperties(this);
      const hasSavedPrompt = Object.prototype.hasOwnProperty.call(props, "ds_prompt_text");
      const hasSavedPosition = Object.prototype.hasOwnProperty.call(props, "ds_prompt_trigger_position");
      const hasSavedExpanded = Object.prototype.hasOwnProperty.call(props, "ds_prompt_expanded");

      const nativeInitialText = String(this._dsPromptNativeText?.value ?? "");
      const nativeInitialPosition = this._dsPromptPositionWidget?.value === "before" ? "before" : "after";

      // Prefer the node property values when present. They survive workflow
      // save/load independently of the hidden/native widget and the DOM widget.
      const initialText = hasSavedPrompt ? String(props.ds_prompt_text ?? "") : nativeInitialText;
      const initialPosition = hasSavedPosition
        ? (props.ds_prompt_trigger_position === "before" ? "before" : "after")
        : nativeInitialPosition;
      const initialExpanded = getPersistedExpandedState(this);

      this._dsPromptValue = initialText;
      this._dsPromptPosition = initialPosition;
      this._dsPromptTextarea.value = initialText;
      this._dsPromptPreview.textContent = initialText;

      if (hasSavedPrompt && this._dsPromptNativeText) {
        this._dsPromptNativeText.value = initialText;
      }
      if (hasSavedPosition && this._dsPromptPositionWidget) {
        this._dsPromptPositionWidget.value = initialPosition;
      }

      const setExpanded = (expanded) => {
        this._dsPromptExpanded = Boolean(expanded);
        ensurePromptProperties(this).ds_prompt_expanded = this._dsPromptExpanded;
        if (this.id != null) {
          try {
            localStorage.setItem(`ds_prompt_expanded_${this.id}`, String(this._dsPromptExpanded));
          } catch (_) {}
        }
        root.classList.toggle("is-expanded", this._dsPromptExpanded);
        if (this._dsPromptExpand) {
          this._dsPromptExpand.classList.toggle("active", this._dsPromptExpanded);
          this._dsPromptExpand.setAttribute("aria-pressed", this._dsPromptExpanded ? "true" : "false");
          this._dsPromptExpand.innerHTML = this._dsPromptExpanded ? ICONS.collapse : ICONS.expand;
          this._dsPromptExpand.title = this._dsPromptExpanded
            ? "Hide effective prompt preview"
            : "Show effective prompt preview";
          this._dsPromptExpand.setAttribute("aria-label", this._dsPromptExpand.title);
        }
        if (this._dsPromptExpanded && this._dsPromptPreview) {
          const props = ensurePromptProperties(this);
          const savedPreview = props.ds_prompt_effective_text;
          if (savedPreview) {
            this._dsPromptPreview.textContent = savedPreview;
          } else if (!this._dsPromptPreview.textContent) {
            this._dsPromptPreview.textContent = this._dsPromptValue || "";
          }
        }
        try {
          const g = this.graph || app?.graph;
          if (g) {
            if (typeof g.beforeChange === "function") g.beforeChange();
            if (typeof g.afterChange === "function") g.afterChange();
            if (typeof g.change === "function") g.change();
          }
          if (app?.canvas?.setDirty) app.canvas.setDirty(true, true);
        } catch (_) {}
        this.setDirtyCanvas(true, true);
      };

      setExpanded(initialExpanded);
      this._dsSetPromptExpanded = setExpanded;

      const syncValue = (value, updatePreview = true) => {
        const next = String(value ?? "");
        this._dsPromptValue = next;
        ensurePromptProperties(this).ds_prompt_text = next;
        this._dsPromptTextarea.value = next;
        if (this._dsPromptNativeText) this._dsPromptNativeText.value = next;
        if (updatePreview && !this._dsPromptExpanded) {
          this._dsPromptPreview.textContent = next;
        }
        this.setDirtyCanvas(true, true);
      };

      const setPosition = (position) => {
        // This is a true two-state switch: normalize the value first, then
        // derive BOTH button states from that single value. Never toggle a
        // button independently, so "Before" and "After" cannot both be active.
        const next = position === "before" ? "before" : "after";
        this._dsPromptPosition = next;
        ensurePromptProperties(this).ds_prompt_trigger_position = next;
        if (this._dsPromptPositionWidget) this._dsPromptPositionWidget.value = next;
        this._dsPromptPositionButtons.forEach((button) => {
          const active = button.dataset.position === next;
          button.classList.toggle("active", active);
          button.setAttribute("aria-pressed", active ? "true" : "false");
        });
        this.setDirtyCanvas(true, true);
      };

      // Apply the saved/default state immediately. The old UI started with
      // "After" visually active even when the stored value was "Before",
      // until a later sync pass corrected it.
      setPosition(initialPosition);

      this._dsSetPromptValue = syncValue;
      this._dsSetTriggerPosition = setPosition;

      this._dsPromptTextarea.addEventListener("input", () => {
        syncValue(this._dsPromptTextarea.value, false);
        this._dsPromptStatus.textContent = "";
      });

      root.addEventListener("click", async (event) => {
        const positionButton = event.target.closest("button[data-position]");
        if (positionButton) {
          event.preventDefault();
          event.stopPropagation();
          setPosition(positionButton.dataset.position);
          return;
        }

        const button = event.target.closest("button[data-action]");
        if (!button) return;
        event.preventDefault();
        event.stopPropagation();

        const action = button.dataset.action;
        if (action === "expand") {
          setExpanded(!this._dsPromptExpanded);
          return;
        }

        const showStatus = (text, btn = null) => {
          if (this._dsPromptStatus) {
            this._dsPromptStatus.textContent = text;
            this._dsPromptStatus.classList.add("is-visible");
          }
          if (btn) {
            btn.classList.add("is-success");
          }
          clearTimeout(this._dsPromptStatusTimer);
          this._dsPromptStatusTimer = setTimeout(() => {
            if (this._dsPromptStatus) {
              this._dsPromptStatus.textContent = "";
              this._dsPromptStatus.classList.remove("is-visible");
            }
            if (btn) {
              btn.classList.remove("is-success");
            }
          }, 1500);
        };

        if (action === "copy") {
          const text = this._dsPromptExpanded
            ? this._dsPromptPreview.textContent
            : this._dsPromptValue;
          const ok = await copyText(text);
          showStatus(ok ? "Copied" : "Copy failed", button);
          return;
        }

        if (action === "clear") {
          syncValue("");
          this._dsPromptPreview.textContent = "";
          showStatus("Cleared", button);
          return;
        }

        if (action === "replace") {
          const clipboard = await readClipboard();
          if (clipboard === null) {
            showStatus("Unavailable", button);
            return;
          }
          syncValue(clipboard);
          this._dsPromptPreview.textContent = clipboard;
          showStatus("Replaced", button);
        }
      });

      this._dsPromptDOMWidget = this.addDOMWidget("ds_prompt_ui", "custom", root, {
        serialize: false,
        hideOnZoom: false,
        margin: 0,
        getValue: () => this._dsPromptValue ?? "",
        setValue: (value) => syncValue(value),
        getMinHeight: () => 60,
        getMaxHeight: () => 2000,
        getHeight: () => Math.max(60, (Number(this.size?.[1]) || 200) - 30),
      });

      // ComfyUI wraps whatever element addDOMWidget() is given in its own
      // positioning container ("host") and clips it with overflow: hidden -
      // but that host never gets a border-radius of its own. Root's rounded
      // corners get clipped back to square by that flat-edged host, which is
      // why only the canvas-drawn title bar (outside this DOM host) looked
      // rounded while the DOM widget's own bottom corners stayed sharp.
      // Round the host to match so the clip mask itself is rounded too.
      this._dsSyncPromptHostRadius = () => {
        const host = this._dsPromptRoot?.parentElement;
        if (!host) return;
        host.style.borderRadius = "var(--ds-radius, 6px)";
        host.style.overflow = "hidden";
      };
      this._dsSyncPromptHostRadius();

      // This is the widget's own render-size function (distinct from the
      // node-level computeSize() below, which intentionally stays fixed so
      // LiteGraph's drag-resize minimum never ratchets up). ComfyUI uses
      // THIS function to size the DOM widget's actual content box each
      // layout pass, so it must track the live node height via the cached
      // value onResize() maintains below - a fixed height here is what
      // previously kept the textarea pinned at the floor while the node
      // itself grew.
      this._dsPromptWidgetHeight = Math.max(60, (Number(this.size?.[1]) || 200) - 30);
      this._dsPromptDOMWidget.computeSize = (width) => [
        Math.max(200, Number(width) || 320),
        this._dsPromptWidgetHeight,
      ];

      // The DOM widget itself is the root element. ComfyUI's DOM-widget
      // layout owns its position and height; do not resize its parent host
      // manually (doing so causes a one-frame jump while LiteGraph is
      // applying the resize). We only keep the root's explicit height in
      // sync with the node so its flex children have a stable containing box.
      this._dsSyncPromptWidgetHeight = () => {
        const widget = this._dsPromptDOMWidget;
        const rootEl = this._dsPromptRoot;
        if (!widget || !rootEl) return;

        const nodeHeight = Math.max(110, Number(this.size?.[1]) || 200);
        const widgetHeight = Math.max(60, nodeHeight - 30);

        widget.computedHeight = widgetHeight;
        this._dsPromptWidgetHeight = widgetHeight;
        rootEl.style.boxSizing = "border-box";
        rootEl.style.width = "100%";
        rootEl.style.height = `${widgetHeight}px`;
        rootEl.style.minHeight = "0";
        rootEl.style.maxHeight = `${widgetHeight}px`;
      };

      this._dsSyncPromptWidgetHeight();
      this._dsSyncPromptHostRadius?.();

      setTimeout(() => {
        try {
          if (window.DSGlobalTheme) {
            window.DSGlobalTheme.bindNode?.(root, this);
            window.DSGlobalTheme.applyNodeBase?.(this);
          }
        } catch (_) {}
        this._dsSyncPromptUI?.();
        this._dsSyncPromptHostRadius?.();
        this.setDirtyCanvas(true, true);
      }, 0);

      return result;
    };

    nodeType.prototype._dsSyncPromptUI = function () {
      if (!this._dsPromptTextarea) return;

      const nativeText = getWidget(this, "text");
      if (nativeText) this._dsPromptNativeText = nativeText;
      hideNativeWidget(this._dsPromptNativeText);

      const positionWidget = getWidget(this, "trigger_position");
      if (positionWidget) this._dsPromptPositionWidget = positionWidget;
      hideNativeWidget(this._dsPromptPositionWidget);

      const props = ensurePromptProperties(this);
      const hasSavedPrompt = Object.prototype.hasOwnProperty.call(props, "ds_prompt_text");
      const hasSavedPosition = Object.prototype.hasOwnProperty.call(props, "ds_prompt_trigger_position");

      const value = hasSavedPrompt
        ? String(props.ds_prompt_text ?? "")
        : String(this._dsPromptNativeText?.value ?? this._dsPromptValue ?? "");

      this._dsPromptValue = value;
      if (this._dsPromptNativeText) this._dsPromptNativeText.value = value;
      if (document.activeElement !== this._dsPromptTextarea) {
        this._dsPromptTextarea.value = value;
      }

      const position = hasSavedPosition
        ? (props.ds_prompt_trigger_position === "before" ? "before" : "after")
        : (this._dsPromptPositionWidget?.value === "before" ? "before" : (this._dsPromptPosition || "after"));

      this._dsPromptPosition = position;
      if (this._dsPromptPositionWidget) this._dsPromptPositionWidget.value = position;
      this._dsPromptPositionButtons?.forEach((button) => {
        const active = button.dataset.position === position;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", active ? "true" : "false");
      });

      const isExpanded = getPersistedExpandedState(this);
      this._dsPromptExpanded = isExpanded;
      ensurePromptProperties(this).ds_prompt_expanded = isExpanded;
      if (typeof this._dsSetPromptExpanded === "function") {
        this._dsSetPromptExpanded(isExpanded);
      }

      if (this._dsPromptExpanded) {
        const effective = props.ds_prompt_effective_text || this._dsPromptPreview?.textContent || value;
        if (this._dsPromptPreview) {
          this._dsPromptPreview.textContent = effective;
        }
      } else {
        if (this._dsPromptPreview) {
          this._dsPromptPreview.textContent = value;
        }
      }
    };

    nodeType.prototype.onRemoved = function () {
      if (this.id != null) {
        try { localStorage.removeItem(`ds_prompt_expanded_${this.id}`); } catch (_) {}
      }
      clearTimeout(this._dsPromptStatusTimer);
      if (this._dsPromptResizeObserver) {
        try { this._dsPromptResizeObserver.disconnect(); } catch (_) {}
        this._dsPromptResizeObserver = null;
      }
      return originalRemoved
        ? originalRemoved.apply(this, arguments)
        : undefined;
    };

    nodeType.prototype.clone = function () {
      const cloned = originalClone
        ? originalClone.apply(this, arguments)
        : (globalThis.LiteGraph?.createNode?.(this.type) || null);
      if (cloned && Array.isArray(this.size)) {
        cloned.size = [
          Math.max(Number(this.size[0]) || 0, 320),
          Math.max(Number(this.size[1]) || 0, 110),
        ];
        if (typeof cloned.onResize === "function") {
          cloned.onResize(cloned.size);
        }
      }
      return cloned;
    };

    nodeType.prototype.configure = function (info) {
      if (info?.id != null && info.id !== -1) {
        this.id = info.id;
      }
      if (originalConfigure) {
        originalConfigure.apply(this, arguments);
      }
      if (this.id === -1 || this.id == null) {
        fixInvalidNodeId(this);
      }
      const props = info?.properties || this.properties || {};
      const targetSize = (info?.size && Array.isArray(info.size))
        ? info.size
        : (props?.ds_prompt_size && Array.isArray(props.ds_prompt_size) ? props.ds_prompt_size : null);
      if (targetSize) {
        this.size = [
          Math.max(Number(targetSize[0]) || 0, 320),
          Math.max(Number(targetSize[1]) || 0, 110),
        ];
        if (typeof this.onResize === "function") {
          this.onResize(this.size);
        }
      }
      const isExp = getPersistedExpandedState(this);
      this._dsPromptExpanded = isExp;
      ensurePromptProperties(this).ds_prompt_expanded = isExp;
      if (typeof this._dsSetPromptExpanded === "function") {
        this._dsSetPromptExpanded(isExp);
      }
      if (Object.prototype.hasOwnProperty.call(props, "ds_prompt_effective_text")) {
        ensurePromptProperties(this).ds_prompt_effective_text = String(props.ds_prompt_effective_text ?? "");
      }
      setTimeout(() => {
        this._dsSyncPromptUI?.();
        this._dsSyncPromptWidgetHeight?.();
      }, 0);
    };

    nodeType.prototype.onConfigure = function (info) {
      if (info?.id != null && info.id !== -1) {
        this.id = info.id;
      }
      const result = originalConfigured
        ? originalConfigured.apply(this, arguments)
        : undefined;

      if (this.id === -1 || this.id == null) {
        fixInvalidNodeId(this);
      }

      const props = info?.properties || ensurePromptProperties(this);
      const targetSize = (info?.size && Array.isArray(info.size))
        ? info.size
        : (props?.ds_prompt_size && Array.isArray(props.ds_prompt_size) ? props.ds_prompt_size : null);
      if (targetSize) {
        this.size = [
          Math.max(Number(targetSize[0]) || 0, 320),
          Math.max(Number(targetSize[1]) || 0, 110),
        ];
        if (typeof this.onResize === "function") {
          this.onResize(this.size);
        }
      }

      const isExp = getPersistedExpandedState(this);
      this._dsPromptExpanded = isExp;
      ensurePromptProperties(this).ds_prompt_expanded = isExp;
      if (typeof this._dsSetPromptExpanded === "function") {
        this._dsSetPromptExpanded(isExp);
      }

      if (Object.prototype.hasOwnProperty.call(props, "ds_prompt_text")) {
        const value = String(props.ds_prompt_text ?? "");
        this._dsPromptValue = value;
        if (this._dsPromptNativeText) this._dsPromptNativeText.value = value;
        if (this._dsPromptTextarea) this._dsPromptTextarea.value = value;
      }

      if (Object.prototype.hasOwnProperty.call(props, "ds_prompt_trigger_position")) {
        this._dsPromptPosition = props.ds_prompt_trigger_position === "before" ? "before" : "after";
        if (this._dsPromptPositionWidget) this._dsPromptPositionWidget.value = this._dsPromptPosition;
      }

      if (Object.prototype.hasOwnProperty.call(props, "ds_prompt_effective_text")) {
        const eff = String(props.ds_prompt_effective_text ?? "");
        ensurePromptProperties(this).ds_prompt_effective_text = eff;
        if (this._dsPromptPreview && eff) {
          this._dsPromptPreview.textContent = eff;
        }
      }

      setTimeout(() => {
        this._dsSyncPromptUI?.();
        this._dsSyncPromptWidgetHeight?.();
        this._dsSyncPromptHostRadius?.();
      }, 0);
      return result;
    };

    nodeType.prototype.onSelected = function () {
      if (this.id === -1 || this.id == null || app?.graph?._nodes_by_id?.[this.id] !== this) {
        fixInvalidNodeId(this);
      }
      return originalSelected ? originalSelected.apply(this, arguments) : undefined;
    };

    nodeType.prototype.serialize = function () {
      try {
        const props = ensurePromptProperties(this);

        if (this._dsPromptTextarea) {
          const value = this._dsPromptTextarea.value;
          this._dsPromptValue = value;
          props.ds_prompt_text = value;
          if (this._dsPromptNativeText) this._dsPromptNativeText.value = value;
        } else if (this._dsPromptValue != null) {
          props.ds_prompt_text = String(this._dsPromptValue);
        }

        const position = this._dsPromptPosition === "before" ? "before" : "after";
        props.ds_prompt_trigger_position = position;
        if (this._dsPromptPositionWidget) this._dsPromptPositionWidget.value = position;

        props.ds_prompt_expanded = Boolean(this._dsPromptExpanded);
        if (this._dsPromptPreview?.textContent) {
          props.ds_prompt_effective_text = this._dsPromptPreview.textContent;
        }

        if (Array.isArray(this.size)) {
          props.ds_prompt_size = [
            Math.max(Number(this.size[0]) || 0, 320),
            Math.max(Number(this.size[1]) || 0, 110),
          ];
        }
      } catch (_) {}

      let o;
      if (originalSerialize) {
        o = originalSerialize.apply(this, arguments);
      } else {
        o = { ...this };
      }

      if (o) {
        if (Array.isArray(this.size)) {
          o.size = [
            Math.max(Number(this.size[0]) || 0, 320),
            Math.max(Number(this.size[1]) || 0, 110),
          ];
        }
        o.properties = o.properties || {};
        if (Array.isArray(this.size)) {
          o.properties.ds_prompt_size = [
            Math.max(Number(this.size[0]) || 0, 320),
            Math.max(Number(this.size[1]) || 0, 110),
          ];
        }
        o.properties.ds_prompt_text = this._dsPromptValue ?? "";
        o.properties.ds_prompt_trigger_position = this._dsPromptPosition === "before" ? "before" : "after";
        o.properties.ds_prompt_expanded = Boolean(this._dsPromptExpanded);
        if (this._dsPromptPreview?.textContent) {
          o.properties.ds_prompt_effective_text = this._dsPromptPreview.textContent;
        } else if (this.properties?.ds_prompt_effective_text) {
          o.properties.ds_prompt_effective_text = this.properties.ds_prompt_effective_text;
        }
      }
      return o;
    };

    nodeType.prototype.onSerialize = function (info) {
      try {
        const props = ensurePromptProperties(this);

        if (this._dsPromptTextarea) {
          const value = this._dsPromptTextarea.value;
          this._dsPromptValue = value;
          props.ds_prompt_text = value;
          if (this._dsPromptNativeText) this._dsPromptNativeText.value = value;
        } else if (this._dsPromptValue != null) {
          props.ds_prompt_text = String(this._dsPromptValue);
        }

        const position = this._dsPromptPosition === "before" ? "before" : "after";
        props.ds_prompt_trigger_position = position;
        if (this._dsPromptPositionWidget) this._dsPromptPositionWidget.value = position;

        props.ds_prompt_expanded = Boolean(this._dsPromptExpanded);
        if (this._dsPromptPreview?.textContent) {
          props.ds_prompt_effective_text = this._dsPromptPreview.textContent;
        }

        if (Array.isArray(this.size)) {
          props.ds_prompt_size = [
            Math.max(Number(this.size[0]) || 0, 320),
            Math.max(Number(this.size[1]) || 0, 110),
          ];
        }

        if (info && typeof info === "object") {
          if (Array.isArray(this.size)) {
            info.size = [
              Math.max(Number(this.size[0]) || 0, 320),
              Math.max(Number(this.size[1]) || 0, 110),
            ];
          }
          info.properties = info.properties || {};
          if (props.ds_prompt_size) {
            info.properties.ds_prompt_size = props.ds_prompt_size;
          }
          info.properties.ds_prompt_text = props.ds_prompt_text;
          info.properties.ds_prompt_trigger_position = props.ds_prompt_trigger_position;
          info.properties.ds_prompt_expanded = props.ds_prompt_expanded;
          if (props.ds_prompt_effective_text) {
            info.properties.ds_prompt_effective_text = props.ds_prompt_effective_text;
          }
        }
      } catch (_) {}

      if (originalOnSerialize) return originalOnSerialize.apply(this, arguments);
    };

    nodeType.prototype.onExecuted = function (message) {
      const result = originalExecuted
        ? originalExecuted.apply(this, arguments)
        : undefined;

      const raw = message?.prompt_preview ?? message?.ui?.prompt_preview;
      const preview = Array.isArray(raw) ? raw[0] : raw;
      if (typeof preview === "string" && this._dsPromptPreview) {
        this._dsPromptPreview.textContent = preview;
        ensurePromptProperties(this).ds_prompt_effective_text = preview;
        if (this._dsPromptExpanded && this._dsPromptStatus) {
          this._dsPromptStatus.textContent = "Updated";
          this._dsPromptStatus.classList.add("is-visible");
          clearTimeout(this._dsPromptStatusTimer);
          this._dsPromptStatusTimer = setTimeout(() => {
            if (this._dsPromptStatus) {
              this._dsPromptStatus.textContent = "";
              this._dsPromptStatus.classList.remove("is-visible");
            }
          }, 1500);
        }
      }
      return result;
    };

    nodeType.prototype.onConnectionsChange = function () {
      const result = originalConnections
        ? originalConnections.apply(this, arguments)
        : undefined;
      if (this._dsPromptPreview && this._dsPromptExpanded && this._dsPromptStatus) {
        this._dsPromptStatus.textContent = "Run to refresh";
        this._dsPromptStatus.classList.add("is-visible");
        clearTimeout(this._dsPromptStatusTimer);
        this._dsPromptStatusTimer = setTimeout(() => {
          if (this._dsPromptStatus) {
            this._dsPromptStatus.textContent = "";
            this._dsPromptStatus.classList.remove("is-visible");
          }
        }, 1500);
      }
      return result;
    };

    nodeType.prototype.computeSize = function () {
      const base = originalComputeSize
        ? originalComputeSize.apply(this, arguments)
        : [340, 110];
      const width = Math.max(320, Number(base?.[0]) || 0);
      // Stable floor for resize. Never use this.size here: LiteGraph calls
      // computeSize() while dragging a resize handle to determine the minimum.
      //
      // Also never fall through to base[1] for the height: LiteGraph's default
      // computeSize() sums each widget's own computeSize(), and the DOM prompt
      // widget's computeSize() now intentionally tracks the live node height
      // (that's what lets the textarea grow with the node). If that dynamic
      // value leaked into this floor, LiteGraph would re-apply the "minimum"
      // to node.size on every layout pass, and each pass would grow it a
      // little more than the last - runaway height growth on every resize.
      // The floor must stay a fixed constant, fully independent of widgets.
      return [width, 110];
    };

    nodeType.prototype.onResize = function (size) {
      // LiteGraph gives us the proposed size before its DOM-widget layout pass.
      // Clamp that proposal and update the widget geometry ONCE, before the
      // original handler runs. Do not perform a second correction after the
      // handler: that was the source of the visible resize snap/jump.
      if (size) {
        size[0] = Math.max(Number(size[0]) || 0, 320);
        size[1] = Math.max(Number(size[1]) || 0, 110);

        const widgetHeight = Math.max(60, size[1] - 30);
        this._dsPromptWidgetHeight = widgetHeight;
        if (this._dsPromptDOMWidget) {
          this._dsPromptDOMWidget.computedHeight = widgetHeight;
        }
        if (this._dsPromptRoot) {
          this._dsPromptRoot.style.boxSizing = "border-box";
          this._dsPromptRoot.style.width = "100%";
          this._dsPromptRoot.style.height = `${widgetHeight}px`;
          this._dsPromptRoot.style.minHeight = "0";
          this._dsPromptRoot.style.maxHeight = `${widgetHeight}px`;
        }
      }

      const result = originalResize
        ? originalResize.apply(this, arguments)
        : undefined;

      this._dsSyncPromptHostRadius?.();
      this.setDirtyCanvas(true, true);
      return result;
    };
  },
});
