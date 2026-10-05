import { app } from "/scripts/app.js";
import {
  DSIconMarkup,
  protectDSResizeCorners,
  normalizeDSWidgetHost,
  installDSUI,
} from "../UIElements/index.js";

installDSUI();

const cssLink = document.createElement("link");
cssLink.rel = "stylesheet";
cssLink.href = "/extensions/DeathshotArsenal/Prompt/ds_prompt.css";
if (!document.head.querySelector('link[data-ds-prompt-css]')) {
  cssLink.dataset.dsPromptCss = "true";
  document.head.appendChild(cssLink);
}

async function copyToClipboard(text) {
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
      area.style.left = "-9999px";
      area.style.top = "-9999px";
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

async function readFromClipboard() {
  try {
    return await navigator.clipboard.readText();
  } catch (_) {
    return null;
  }
}

function ensurePromptProperties(node) {
  node.properties = node.properties || {};
  return node.properties;
}

function getWidget(node, name) {
  return (node.widgets || []).find((w) => w?.name === name) || null;
}

function hideNativeWidget(widget) {
  if (!widget) return;
  widget.type = "hidden";
  widget.hidden = true;
  widget.options = widget.options || {};
  widget.options.hidden = true;
  widget.computeSize = () => [0, -4];
  widget.draw = () => {};

  for (const element of [widget.inputEl, widget.element]) {
    if (element?.style) {
      element.style.display = "none";
      element.style.visibility = "hidden";
      element.style.pointerEvents = "none";
    }
    try {
      element?.remove?.();
    } catch (_) {}
  }
  widget.inputEl = null;
  widget.element = null;
}

function deduplicateWidgets(node) {
  if (!Array.isArray(node.widgets)) return;
  const seen = new Set();
  for (let i = node.widgets.length - 1; i >= 0; i--) {
    const w = node.widgets[i];
    if (!w) {
      node.widgets.splice(i, 1);
      continue;
    }
    if (w.name === "text" || w.name === "trigger_position") {
      if (seen.has(w.name)) {
        w.inputEl?.remove?.();
        w.element?.remove?.();
        node.widgets.splice(i, 1);
      } else {
        seen.add(w.name);
        hideNativeWidget(w);
      }
    }
  }
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
    const originalClone = nodeType.prototype.clone;

    // DS Prompt uses ComfyUI's growable DOM-widget layout. The widget itself is
    // the visible card; there is no extra DS HTML wrapper between the node base
    // and the card. The DOM widget is intentionally 5px shorter than the node
    // so the card bottom stays 5px above the node base and LiteGraph's native
    // bottom resize corners remain outside the DOM hit area.
    const DS_PROMPT_SIZE_VERSION = 10;
    const DS_PROMPT_BOTTOM_GAP = 5;
    const DS_PROMPT_CARD_MARGIN = 5;
    const DS_PROMPT_NATURAL_CARD_HEIGHT = 138;
    // ComfyUI renders the DOM widget element inside its widget margin: the
    // rendered card is computedHeight - 2*margin. Include both margins in the
    // widget allocation so the visible card retains its full 138px height.
    const DS_PROMPT_MIN_WIDGET_HEIGHT =
      DS_PROMPT_NATURAL_CARD_HEIGHT + (DS_PROMPT_CARD_MARGIN * 2);

    nodeType.prototype._getPromptMinimumWidgetHeight = function () {
      return DS_PROMPT_MIN_WIDGET_HEIGHT;
    };

    // Classic LiteGraph checks getWidgetOnPos() before findResizeDirection().
    // A full-size DOM widget therefore must explicitly give all four native
    // corner hit zones back to LiteGraph. The shared helper only releases the
    // bottom edge/corners, so DS Prompt adds the top-corner release locally.
    const protectPromptResizeCorners = (node) => {
      if (!node || node._dsPromptResizeCornersProtected) return;
      const originalGetWidgetOnPos = node.getWidgetOnPos;
      if (typeof originalGetWidgetOnPos !== "function") return;

      node._dsPromptResizeCornersProtected = true;
      node._dsPromptOriginalGetWidgetOnPos = originalGetWidgetOnPos;
      node.getWidgetOnPos = function (canvasX, canvasY, includeDisabled = false) {
        if (this.resizable !== false) {
          const localX = Number(canvasX) - Number(this.pos?.[0] ?? 0);
          const localY = Number(canvasY) - Number(this.pos?.[1] ?? 0);
          const width = Number(this.size?.[0]) || 0;
          const height = Number(this.size?.[1]) || 0;
          const handle = Number(this.constructor?.resizeHandleSize) || 15;

          const inLeft = localX <= handle;
          const inRight = localX >= width - handle;
          const inTop = localY <= handle;
          const inBottom = localY >= height - handle;

          if ((inLeft || inRight) && (inTop || inBottom)) {
            return undefined;
          }
        }

        return originalGetWidgetOnPos.call(this, canvasX, canvasY, includeDisabled);
      };
    };

    nodeType.prototype._getPromptWidgetY = function () {
      const widget = this._dsPromptDOMWidget;
      const y = Number(widget?.y);
      if (Number.isFinite(y) && y >= 0) return y;
      const lastY = Number(widget?.last_y);
      if (Number.isFinite(lastY) && lastY >= 0) return lastY;
      return 70;
    };

    nodeType.prototype._getPromptMinimumNodeHeight = function () {
      return Math.ceil(
        this._getPromptWidgetY() +
        this._getPromptMinimumWidgetHeight() +
        DS_PROMPT_BOTTOM_GAP,
      );
    };

    nodeType.prototype._fitPromptToNaturalHeight = function () {
      const widget = this._dsPromptDOMWidget;
      if (!widget || !Array.isArray(this.size)) return;

      const y = Number(widget.y);
      if (!Number.isFinite(y) || y < 0) {
        requestAnimationFrame(() => this._fitPromptToNaturalHeight?.());
        return;
      }

      const width = Math.max(Number(this.size[0]) || 340, 340);
      const targetHeight = Math.ceil(
        y + this._getPromptMinimumWidgetHeight() + DS_PROMPT_BOTTOM_GAP,
      );
      this.setSize([width, targetHeight]);
      this.size[0] = width;
      this.size[1] = targetHeight;
      this.setDirtyCanvas(true, true);
    };

    nodeType.prototype.onNodeCreated = function () {
      const result = originalCreated
        ? originalCreated.apply(this, arguments)
        : undefined;

      this.resizable = true;
      protectDSResizeCorners(this);
      protectPromptResizeCorners(this);

      deduplicateWidgets(this);
      this._dsPromptNativeText = getWidget(this, "text");
      hideNativeWidget(this._dsPromptNativeText);

      this._dsPromptPositionWidget = getWidget(this, "trigger_position");
      hideNativeWidget(this._dsPromptPositionWidget);

      this._dsPromptExpanded = getPersistedExpandedState(this);

      const current = Array.isArray(this.size) ? this.size : [400, 200];
      this.size = [
        Math.max(Number(current[0]) || 0, 340),
        Math.max(Number(current[1]) || 0, 180),
      ];

      if (this._dsPromptDOMWidget) {
        const idx = (this.widgets || []).indexOf(this._dsPromptDOMWidget);
        if (idx !== -1) this.widgets.splice(idx, 1);
        this._dsPromptDOMWidget.element?.remove?.();
        this._dsPromptDOMWidget = null;
      }

      const root = document.createElement("div");
      root.className = "ds-ui-card ds-prompt-card";
      root.dataset.dsThemed = "true";
      root.innerHTML = `
          <div class="ds-ui-card-head ds-prompt-head">
            <div class="ds-ui-card-title-group ds-prompt-title-group">
              <span class="ds-prompt-title-icon">${DSIconMarkup("edit", { size: 13, color: "var(--ds-color-accent, #67e8f9)" })}</span>
              <span class="ds-prompt-title">Prompt</span>
              <span class="ds-prompt-status-badge" data-status aria-live="polite"></span>
            </div>
            <div class="ds-prompt-actions" role="toolbar" aria-label="Prompt controls">
              <div class="ds-prompt-trigger-control" role="group" aria-label="LoRA trigger placement">
                <span class="ds-prompt-trigger-label">Triggers</span>
                <button type="button" class="ds-prompt-seg" data-pos="before" aria-pressed="false">Before</button>
                <button type="button" class="ds-prompt-seg is-active" data-pos="after" aria-pressed="true">After</button>
              </div>
              <button type="button" class="ds-ui-btn ds-ui-btn-compact ds-ui-btn-icon-only ds-prompt-action-btn"
                      data-action="copy" title="Copy prompt text" aria-label="Copy prompt text">
                ${DSIconMarkup("copy", { size: 12 })}
              </button>
              <button type="button" class="ds-ui-btn ds-ui-btn-compact ds-ui-btn-icon-only ds-prompt-action-btn"
                      data-action="replace" title="Replace from clipboard" aria-label="Replace from clipboard">
                ${DSIconMarkup("refresh-cw", { size: 12 })}
              </button>
              <button type="button" class="ds-ui-btn ds-ui-btn-compact ds-ui-btn-icon-only ds-prompt-action-btn"
                      data-action="clear" title="Clear prompt" aria-label="Clear prompt">
                ${DSIconMarkup("trash-2", { size: 12 })}
              </button>
              <button type="button" class="ds-ui-btn ds-ui-btn-compact ds-ui-btn-icon-only ds-prompt-action-btn"
                      data-action="expand" title="Show effective prompt preview" aria-label="Show effective prompt preview" aria-pressed="false">
                ${DSIconMarkup("maximize-2", { size: 12 })}
              </button>
            </div>
          </div>
          <div class="ds-prompt-body">
            <textarea class="ds-prompt-textarea" data-prompt spellcheck="false"
                      placeholder="Write your prompt..."></textarea>
            <div class="ds-prompt-preview-wrap" data-preview-wrap>
              <div class="ds-prompt-preview-head">
                <span class="ds-prompt-preview-title">Effective Prompt</span>
                <span class="ds-prompt-preview-subtitle">Prompt + Wired Triggers</span>
              </div>
              <div class="ds-prompt-preview-content" data-preview></div>
            </div>
          </div>
      `;

      this._dsPromptRoot = root;
      normalizeDSWidgetHost(root, this, { shell: false });

      // The card itself is the widget surface. Keep the surface styling on
      // the actual widget element so no transparent host/theme rule can erase
      // the card background or border.
      root.style.setProperty("background", "var(--ds-color-card, #12151c)", "important");
      root.style.setProperty("background-color", "var(--ds-color-card, #12151c)", "important");
      root.style.setProperty("border", "1px solid var(--ds-color-card-border, #242a36)", "important");
      root.style.setProperty("border-radius", "var(--ds-radius-card, 8px)", "important");
      root.style.setProperty("box-sizing", "border-box", "important");

      // The card is the DOM widget root. Keep the root itself transparent to
      // canvas hit-testing; only the actual controls opt back in.
      root.style.pointerEvents = "none";
      this._dsPromptCard = root;
      this._dsPromptTextarea = root.querySelector("[data-prompt]");
      this._dsPromptPreview = root.querySelector("[data-preview]");
      this._dsPromptStatus = root.querySelector("[data-status]");
      this._dsPromptExpandBtn = root.querySelector('[data-action="expand"]');
      this._dsPromptPosButtons = [...root.querySelectorAll("[data-pos]")];

      const props = ensurePromptProperties(this);
      const hasSavedPrompt = Object.prototype.hasOwnProperty.call(props, "ds_prompt_text");
      const hasSavedPosition = Object.prototype.hasOwnProperty.call(props, "ds_prompt_trigger_position");

      const nativeInitialText = String(this._dsPromptNativeText?.value ?? "");
      const nativeInitialPos = this._dsPromptPositionWidget?.value === "before" ? "before" : "after";

      const initialText = hasSavedPrompt ? String(props.ds_prompt_text ?? "") : nativeInitialText;
      const initialPos = hasSavedPosition
        ? (props.ds_prompt_trigger_position === "before" ? "before" : "after")
        : nativeInitialPos;

      this._dsPromptValue = initialText;
      this._dsPromptPosition = initialPos;
      this._dsPromptTextarea.value = initialText;
      this._dsPromptPreview.textContent = props.ds_prompt_effective_text || initialText;

      if (hasSavedPrompt && this._dsPromptNativeText) {
        this._dsPromptNativeText.value = initialText;
      }
      if (hasSavedPosition && this._dsPromptPositionWidget) {
        this._dsPromptPositionWidget.value = initialPos;
      }

      const showStatus = (text) => {
        if (!this._dsPromptStatus) return;
        this._dsPromptStatus.textContent = text;
        this._dsPromptStatus.classList.add("is-visible");
        clearTimeout(this._dsPromptStatusTimer);
        this._dsPromptStatusTimer = setTimeout(() => {
          if (this._dsPromptStatus) {
            this._dsPromptStatus.textContent = "";
            this._dsPromptStatus.classList.remove("is-visible");
          }
        }, 1400);
      };
      this._showStatus = showStatus;

      const setPosition = (position) => {
        const next = position === "before" ? "before" : "after";
        this._dsPromptPosition = next;
        ensurePromptProperties(this).ds_prompt_trigger_position = next;
        if (this._dsPromptPositionWidget) this._dsPromptPositionWidget.value = next;

        this._dsPromptPosButtons.forEach((btn) => {
          const active = btn.dataset.pos === next;
          btn.classList.toggle("is-active", active);
          btn.setAttribute("aria-pressed", active ? "true" : "false");
        });
        this.setDirtyCanvas(true, true);
      };
      setPosition(initialPos);
      this._dsSetTriggerPosition = setPosition;

      const setExpanded = (expanded) => {
        this._dsPromptExpanded = Boolean(expanded);
        ensurePromptProperties(this).ds_prompt_expanded = this._dsPromptExpanded;
        if (this.id != null) {
          try {
            localStorage.setItem(`ds_prompt_expanded_${this.id}`, String(this._dsPromptExpanded));
          } catch (_) {}
        }

        this._dsPromptCard?.classList.toggle("is-expanded", this._dsPromptExpanded);

        if (this._dsPromptExpandBtn) {
          this._dsPromptExpandBtn.classList.toggle("is-active", this._dsPromptExpanded);
          this._dsPromptExpandBtn.setAttribute("aria-pressed", this._dsPromptExpanded ? "true" : "false");
          this._dsPromptExpandBtn.innerHTML = this._dsPromptExpanded
            ? DSIconMarkup("minimize-2", { size: 12 })
            : DSIconMarkup("maximize-2", { size: 12 });
          this._dsPromptExpandBtn.title = this._dsPromptExpanded
            ? "Hide effective prompt preview"
            : "Show effective prompt preview";
          this._dsPromptExpandBtn.setAttribute("aria-label", this._dsPromptExpandBtn.title);
        }

        if (this._dsPromptExpanded) {
          const eff = props.ds_prompt_effective_text || this._dsPromptValue || "";
          if (this._dsPromptPreview) this._dsPromptPreview.textContent = eff;
        }

        this.setDirtyCanvas(true, true);
      };
      setExpanded(this._dsPromptExpanded);
      this._dsSetPromptExpanded = setExpanded;

      const syncValue = (value, updatePreview = true) => {
        const next = String(value ?? "");
        this._dsPromptValue = next;
        ensurePromptProperties(this).ds_prompt_text = next;
        this._dsPromptTextarea.value = next;
        if (this._dsPromptNativeText) this._dsPromptNativeText.value = next;
        if (updatePreview && !this._dsPromptExpanded && this._dsPromptPreview) {
          this._dsPromptPreview.textContent = next;
        }
        this.setDirtyCanvas(true, true);
      };
      this._dsSetPromptValue = syncValue;

      this._dsPromptTextarea.addEventListener("input", () => {
        syncValue(this._dsPromptTextarea.value, false);
      });

      root.addEventListener("click", async (event) => {
        const posBtn = event.target.closest("button[data-pos]");
        if (posBtn) {
          event.preventDefault();
          event.stopPropagation();
          setPosition(posBtn.dataset.pos);
          return;
        }

        const actionBtn = event.target.closest("button[data-action]");
        if (!actionBtn) return;
        event.preventDefault();
        event.stopPropagation();

        const action = actionBtn.dataset.action;
        if (action === "expand") {
          setExpanded(!this._dsPromptExpanded);
          return;
        }

        if (action === "copy") {
          const textToCopy = this._dsPromptExpanded && this._dsPromptPreview?.textContent
            ? this._dsPromptPreview.textContent
            : this._dsPromptValue;
          const ok = await copyToClipboard(textToCopy);
          showStatus(ok ? "Copied" : "Copy failed");
          return;
        }

        if (action === "clear") {
          syncValue("");
          if (this._dsPromptPreview) this._dsPromptPreview.textContent = "";
          showStatus("Cleared");
          return;
        }

        if (action === "replace") {
          const clipText = await readFromClipboard();
          if (clipText === null) {
            showStatus("Unavailable");
            return;
          }
          syncValue(clipText);
          if (this._dsPromptPreview) this._dsPromptPreview.textContent = clipText;
          showStatus("Replaced");
        }
      });

      this._dsPromptDOMWidget = this.addDOMWidget("ds_prompt_ui", "custom", root, {
        serialize: false,
        hideOnZoom: false,
        margin: DS_PROMPT_CARD_MARGIN,
        getValue: () => this._dsPromptValue ?? "",
        setValue: (val) => syncValue(val),
        // The widget itself is exactly the card. Its preferred height consumes
        // the node's remaining space minus the 5px canvas gap reserved below
        // the card for LiteGraph's native resize handles.
        getMinHeight: () => this._getPromptMinimumWidgetHeight(),
        // The DOM widget host is the actual hit-test surface used by ComfyUI.
        // Cap that host itself to 5px above the node bottom so the native
        // LiteGraph resize corners are physically outside the DOM overlay.
        // This is the key difference from getHeight(): current ComfyUI uses
        // getMaxHeight() during computeLayoutSize() to constrain the allocated
        // DOM-widget height.
        getMaxHeight: () => {
          const y = this._getPromptWidgetY();
          const nodeHeight = Number(this.size?.[1]) || 0;
          const available = nodeHeight - y - DS_PROMPT_BOTTOM_GAP;
          // With margin=5, the visible card ends at y + computedHeight - 5.
          // Allow the widget allocation to reach nodeHeight - y so the visible
          // card stays exactly 5px above the node base while retaining 5px
          // margins on both horizontal sides.
          return Math.max(
            this._getPromptMinimumWidgetHeight(),
            available + DS_PROMPT_BOTTOM_GAP,
          );
        },
      });

      if (Array.isArray(this.widgets)) {
        const domIdx = this.widgets.indexOf(this._dsPromptDOMWidget);
        if (domIdx > 0) {
          this.widgets.splice(domIdx, 1);
          this.widgets.unshift(this._dsPromptDOMWidget);
        }
      }


      setTimeout(() => {
        this._dsSyncPromptUI?.();
        const props = this.properties || {};
        if (!Array.isArray(props.ds_prompt_size)) {
          this._fitPromptToNaturalHeight();
        }
      }, 0);

      return result;
    };

    nodeType.prototype._dsSyncPromptUI = function () {
      if (!this._dsPromptTextarea) return;

      deduplicateWidgets(this);
      const nativeText = getWidget(this, "text");
      if (nativeText) this._dsPromptNativeText = nativeText;
      hideNativeWidget(this._dsPromptNativeText);

      const positionWidget = getWidget(this, "trigger_position");
      if (positionWidget) this._dsPromptPositionWidget = positionWidget;
      hideNativeWidget(this._dsPromptPositionWidget);

      const props = ensurePromptProperties(this);
      const hasSavedPrompt = Object.prototype.hasOwnProperty.call(props, "ds_prompt_text");
      const hasSavedPosition = Object.prototype.hasOwnProperty.call(props, "ds_prompt_trigger_position");

      const val = hasSavedPrompt
        ? String(props.ds_prompt_text ?? "")
        : String(this._dsPromptNativeText?.value ?? this._dsPromptValue ?? "");

      this._dsPromptValue = val;
      if (this._dsPromptNativeText) this._dsPromptNativeText.value = val;
      if (document.activeElement !== this._dsPromptTextarea) {
        this._dsPromptTextarea.value = val;
      }

      const pos = hasSavedPosition
        ? (props.ds_prompt_trigger_position === "before" ? "before" : "after")
        : (this._dsPromptPositionWidget?.value === "before" ? "before" : (this._dsPromptPosition || "after"));

      this._dsPromptPosition = pos;
      if (this._dsPromptPositionWidget) this._dsPromptPositionWidget.value = pos;
      this._dsPromptPosButtons?.forEach((btn) => {
        const active = btn.dataset.pos === pos;
        btn.classList.toggle("is-active", active);
        btn.setAttribute("aria-pressed", active ? "true" : "false");
      });

      const isExp = getPersistedExpandedState(this);
      this._dsPromptExpanded = isExp;
      ensurePromptProperties(this).ds_prompt_expanded = isExp;
      if (typeof this._dsSetPromptExpanded === "function") {
        this._dsSetPromptExpanded(isExp);
      }

      const effectiveText = props.ds_prompt_effective_text || this._dsPromptPreview?.textContent || val;
      if (this._dsPromptPreview) {
        this._dsPromptPreview.textContent = effectiveText;
      }

    };

    nodeType.prototype.onRemoved = function () {
      if (this.id != null) {
        try { localStorage.removeItem(`ds_prompt_expanded_${this.id}`); } catch (_) {}
      }
      clearTimeout(this._dsPromptStatusTimer);
      return originalRemoved
        ? originalRemoved.apply(this, arguments)
        : undefined;
    };

    nodeType.prototype.clone = function () {
      const cloned = originalClone
        ? originalClone.apply(this, arguments)
        : (globalThis.LiteGraph?.createNode?.(this.type) || null);
      if (cloned && Array.isArray(this.size)) {
        const minHeight = typeof cloned._getPromptMinimumNodeHeight === "function"
          ? cloned._getPromptMinimumNodeHeight()
          : 160;
        cloned.size = [
          Math.max(Number(this.size[0]) || 0, 340),
          Math.max(Number(this.size[1]) || 0, minHeight),
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
      const savedSizeVersion = Number(props?.ds_prompt_size_version || 0);
      const migrateLegacyBaseSize = savedSizeVersion < DS_PROMPT_SIZE_VERSION;
      const targetSize = (info?.size && Array.isArray(info.size))
        ? info.size
        : (props?.ds_prompt_size && Array.isArray(props.ds_prompt_size) ? props.ds_prompt_size : null);

      if (targetSize && !migrateLegacyBaseSize) {
        this.size = [
          Math.max(Number(targetSize[0]) || 0, 340),
          Math.max(Number(targetSize[1]) || 0, this._getPromptMinimumNodeHeight()),
        ];
        if (typeof this.onResize === "function") {
          this.onResize(this.size);
        }
      }

      setTimeout(() => {
        this._dsSyncPromptUI?.();
        if (migrateLegacyBaseSize) {
          this._fitPromptToNaturalHeight();
        } else {
          }
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
      const isExp = getPersistedExpandedState(this);
      this._dsPromptExpanded = isExp;
      ensurePromptProperties(this).ds_prompt_expanded = isExp;

      const savedSizeVersion = Number(props?.ds_prompt_size_version || 0);
      const migrateLegacyBaseSize = savedSizeVersion < DS_PROMPT_SIZE_VERSION;
      const targetSize = (info?.size && Array.isArray(info.size))
        ? info.size
        : (props?.ds_prompt_size && Array.isArray(props.ds_prompt_size) ? props.ds_prompt_size : null);

      if (targetSize && !migrateLegacyBaseSize) {
        this.size = [
          Math.max(Number(targetSize[0]) || 0, 340),
          Math.max(Number(targetSize[1]) || 0, this._getPromptMinimumNodeHeight()),
        ];
        if (typeof this.onResize === "function") {
          this.onResize(this.size);
        }
      }

      if (Object.prototype.hasOwnProperty.call(props, "ds_prompt_text")) {
        const val = String(props.ds_prompt_text ?? "");
        this._dsPromptValue = val;
        if (this._dsPromptNativeText) this._dsPromptNativeText.value = val;
        if (this._dsPromptTextarea) this._dsPromptTextarea.value = val;
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
        if (migrateLegacyBaseSize) {
          this._fitPromptToNaturalHeight();
        } else {
          }
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
          const val = this._dsPromptTextarea.value;
          this._dsPromptValue = val;
          props.ds_prompt_text = val;
          if (this._dsPromptNativeText) this._dsPromptNativeText.value = val;
        } else if (this._dsPromptValue != null) {
          props.ds_prompt_text = String(this._dsPromptValue);
        }

        const pos = this._dsPromptPosition === "before" ? "before" : "after";
        props.ds_prompt_trigger_position = pos;
        if (this._dsPromptPositionWidget) this._dsPromptPositionWidget.value = pos;

        props.ds_prompt_expanded = Boolean(this._dsPromptExpanded);
        if (this._dsPromptPreview?.textContent) {
          props.ds_prompt_effective_text = this._dsPromptPreview.textContent;
        }

        if (Array.isArray(this.size)) {
          props.ds_prompt_size = [
            Math.max(Number(this.size[0]) || 0, 340),
            Math.max(Number(this.size[1]) || 0, this._getPromptMinimumNodeHeight()),
          ];
          props.ds_prompt_size_version = DS_PROMPT_SIZE_VERSION;
        }
      } catch (_) {}

      let o = originalSerialize ? originalSerialize.apply(this, arguments) : { ...this };
      if (o) {
        if (Array.isArray(this.size)) {
          o.size = [
            Math.max(Number(this.size[0]) || 0, 340),
            Math.max(Number(this.size[1]) || 0, this._getPromptMinimumNodeHeight()),
          ];
        }
        o.properties = o.properties || {};
        o.properties.ds_prompt_text = this._dsPromptValue ?? "";
        o.properties.ds_prompt_trigger_position = this._dsPromptPosition === "before" ? "before" : "after";
        o.properties.ds_prompt_expanded = Boolean(this._dsPromptExpanded);
        o.properties.ds_prompt_size_version = DS_PROMPT_SIZE_VERSION;
        if (this._dsPromptPreview?.textContent) {
          o.properties.ds_prompt_effective_text = this._dsPromptPreview.textContent;
        }
      }
      return o;
    };

    nodeType.prototype.onSerialize = function (info) {
      try {
        const props = ensurePromptProperties(this);

        if (this._dsPromptTextarea) {
          const val = this._dsPromptTextarea.value;
          this._dsPromptValue = val;
          props.ds_prompt_text = val;
          if (this._dsPromptNativeText) this._dsPromptNativeText.value = val;
        } else if (this._dsPromptValue != null) {
          props.ds_prompt_text = String(this._dsPromptValue);
        }

        const pos = this._dsPromptPosition === "before" ? "before" : "after";
        props.ds_prompt_trigger_position = pos;
        if (this._dsPromptPositionWidget) this._dsPromptPositionWidget.value = pos;

        props.ds_prompt_expanded = Boolean(this._dsPromptExpanded);
        if (this._dsPromptPreview?.textContent) {
          props.ds_prompt_effective_text = this._dsPromptPreview.textContent;
        }

        if (info && typeof info === "object") {
          if (Array.isArray(this.size)) {
            info.size = [
              Math.max(Number(this.size[0]) || 0, 340),
              Math.max(Number(this.size[1]) || 0, this._getPromptMinimumNodeHeight()),
            ];
          }
          info.properties = info.properties || {};
          info.properties.ds_prompt_size = [
            Math.max(Number(this.size[0]) || 0, 340),
            Math.max(Number(this.size[1]) || 0, this._getPromptMinimumNodeHeight()),
          ];
          info.properties.ds_prompt_size_version = DS_PROMPT_SIZE_VERSION;
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
      if (typeof preview === "string") {
        if (this._dsPromptPreview) {
          this._dsPromptPreview.textContent = preview;
        }
        ensurePromptProperties(this).ds_prompt_effective_text = preview;
        if (this._dsPromptExpanded) {
          this._showStatus?.("Updated");
        }
      }
      return result;
    };

    nodeType.prototype.onConnectionsChange = function () {
      const result = originalConnections
        ? originalConnections.apply(this, arguments)
        : undefined;
      if (this._dsPromptExpanded) {
        this._showStatus?.("Run to update");
      }
      return result;
    };

    nodeType.prototype.computeSize = function () {
      return [340, this._getPromptMinimumNodeHeight()];
    };

    nodeType.prototype.onResize = function (size) {
      if (size) {
        size[0] = Math.max(Number(size[0]) || 0, 340);
        size[1] = Math.max(Number(size[1]) || 0, this._getPromptMinimumNodeHeight());
        this.size[0] = size[0];
        this.size[1] = size[1];
        ensurePromptProperties(this).ds_prompt_size_version = DS_PROMPT_SIZE_VERSION;
      }

      const result = originalResize
        ? originalResize.apply(this, arguments)
        : undefined;

      this.setDirtyCanvas(true, true);
      return result;
    };
  },
});
