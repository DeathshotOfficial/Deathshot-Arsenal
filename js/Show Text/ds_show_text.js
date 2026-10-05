/* ============================================================
   DS Show Text - DeathshotArsenal
   Read-only STRING preview with persistent native source widget.
   Built with DeathshotArsenal UIElements design system.
   ============================================================ */

import { app } from "/scripts/app.js";
import {
  Card,
  DSIcon,
  normalizeDSWidgetHost,
  protectDSResizeCorners,
} from "../UIElements/index.js";

const cssId = "ds-show-text-css";
if (!document.getElementById(cssId)) {
  const cssLink = document.createElement("link");
  cssLink.id = cssId;
  cssLink.rel = "stylesheet";
  cssLink.href = "/extensions/DeathshotArsenal/Show Text/ds_show_text.css";
  document.head.appendChild(cssLink);
}

function getWidget(node, name) {
  return (node.widgets || []).find((widget) => widget?.name === name) || null;
}

function hideNativeWidget(widget) {
  if (!widget) return;
  widget.hidden = true;
  widget.options = widget.options || {};
  widget.options.hidden = true;
  widget.computeSize = () => [0, 0];
  for (const element of [widget.inputEl, widget.element]) {
    if (!element?.style) continue;
    element.style.display = "none";
    element.style.visibility = "hidden";
    element.style.pointerEvents = "none";
  }
}

function ensureProperties(node) {
  node.properties = node.properties || {};
  return node.properties;
}

function setNativeText(node, value) {
  const widget = node._dsShowTextNative;
  if (widget) widget.value = value;
  node._dsShowTextValue = value;
}

function readNativeText(node) {
  if (node._dsShowTextNative) {
    const value = node._dsShowTextNative.value;
    return value == null ? "" : String(value);
  }
  return node._dsShowTextValue == null ? "" : String(node._dsShowTextValue);
}

function normalizePreviewValue(value) {
  if (value == null) return "";
  return String(value);
}

function setPreview(node, value) {
  const text = normalizePreviewValue(value);
  node._dsShowTextValue = text;
  if (node._dsShowTextPreview) {
    node._dsShowTextPreview.value = text;
  }
}

async function copyText(text) {
  const value = normalizePreviewValue(text);
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch (_) {
    // Fallback for non-secure contexts
  }

  try {
    const area = document.createElement("textarea");
    area.value = value;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.left = "-10000px";
    area.style.top = "-10000px";
    document.body.appendChild(area);
    area.focus();
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch (_) {
    return false;
  }
}

function buildShowTextUI(node) {
  const card = Card({
    title: "Show Text",
    icon: "terminal",
    className: "ds-show-text-card",
  });

  const actionsGroup = card.head?.querySelector(".ds-ui-card-actions");

  const statusEl = document.createElement("span");
  statusEl.className = "ds-show-text-status";
  statusEl.setAttribute("aria-live", "polite");

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "ds-ui-btn ds-ui-btn-icon-only ds-ui-btn-compact ds-show-text-copy-btn";
  copyBtn.title = "Copy text";
  copyBtn.setAttribute("aria-label", "Copy text");
  copyBtn.appendChild(DSIcon("copy", { size: 12 }));

  if (actionsGroup) {
    actionsGroup.appendChild(statusEl);
    actionsGroup.appendChild(copyBtn);
  }

  const textarea = document.createElement("textarea");
  textarea.className = "ds-show-text-area";
  textarea.readOnly = true;
  textarea.spellcheck = false;
  textarea.placeholder = "Nothing to display";
  textarea.setAttribute("aria-label", "Text preview");
  card.body.appendChild(textarea);

  node._dsShowTextCard = card;
  node._dsShowTextPreview = textarea;
  node._dsShowTextStatus = statusEl;
  node._dsShowTextCopy = copyBtn;

  copyBtn.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    await node._dsShowTextCopyValue?.();
  });

  return card;
}

app.registerExtension({
  name: "DeathshotArsenal.ShowText",

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== "DS_ShowText") return;

    const originalCreated = nodeType.prototype.onNodeCreated;
    const originalConfigure = nodeType.prototype.onConfigure;
    const originalExecuted = nodeType.prototype.onExecuted;
    const originalSerialize = nodeType.prototype.serialize;
    const originalOnSerialize = nodeType.prototype.onSerialize;
    const originalRemoved = nodeType.prototype.onRemoved;
    const originalResize = nodeType.prototype.onResize;

    nodeType.prototype.onNodeCreated = function () {
      const result = originalCreated
        ? originalCreated.apply(this, arguments)
        : undefined;

      this.resizable = true;
      protectDSResizeCorners(this);
      this._dsShowTextValue = "";
      this._dsShowTextNative = getWidget(this, "text");
      hideNativeWidget(this._dsShowTextNative);

      const current = Array.isArray(this.size) ? this.size : [360, 220];
      this.size = [
        Math.max(Number(current[0]) || 360, 300),
        Math.max(Number(current[1]) || 220, 160),
      ];

      const card = buildShowTextUI(this);

      const CARD_MARGIN = 5;
      const MIN_CARD_HEIGHT = 120;
      const MIN_WIDGET_HEIGHT = MIN_CARD_HEIGHT + (CARD_MARGIN * 2);

      const domWidget = this.addDOMWidget("ds_show_text_ui", "custom", card.root, {
        serialize: false,
        margin: CARD_MARGIN,
        getMinHeight: () => MIN_WIDGET_HEIGHT,
        getMaxHeight: () => {
          const widgetY = Number(domWidget?.y ?? this._getWidgetY?.() ?? 0);
          const nodeHeight = Number(this.size?.[1] ?? 0);
          return Math.max(MIN_WIDGET_HEIGHT, nodeHeight - widgetY);
        },
        getHeight: () => {
          const widgetY = Number(domWidget?.y ?? this._getWidgetY?.() ?? 0);
          const nodeHeight = Number(this.size?.[1] ?? 0);
          return Math.max(MIN_WIDGET_HEIGHT, nodeHeight - widgetY);
        },
      });

      this._dsShowTextWidget = domWidget;
      normalizeDSWidgetHost(card.root, this, { shell: false });

      const initial = readNativeText(this);
      setPreview(this, initial);

      this._dsShowTextUnsubscribe = window.DSGlobalTheme?.bindNode?.(card.root, this);
      if (window.DSGlobalTheme) {
        window.DSGlobalTheme.applyNodeBase?.(this);
      }

      this._dsShowTextCopyValue = async () => {
        const value = normalizePreviewValue(this._dsShowTextPreview?.value ?? readNativeText(this));
        const ok = await copyText(value);
        const status = this._dsShowTextStatus;
        const button = this._dsShowTextCopy;

        if (ok) {
          if (status) {
            status.textContent = value ? "Copied" : "Copied empty text";
            status.classList.remove("is-error");
            status.classList.add("is-success");
          }
          if (button) {
            button.replaceChildren(DSIcon("check", { size: 12, color: "var(--ds-color-success, #34d399)" }));
            button.classList.add("is-success");
          }
        } else {
          if (status) {
            status.textContent = "Copy failed";
            status.classList.remove("is-success");
            status.classList.add("is-error");
          }
          if (button) {
            button.classList.add("is-error");
          }
        }

        window.clearTimeout(this._dsShowTextStatusTimer);
        this._dsShowTextStatusTimer = window.setTimeout(() => {
          if (status) {
            status.textContent = "";
            status.classList.remove("is-success", "is-error");
          }
          if (button) {
            button.replaceChildren(DSIcon("copy", { size: 12 }));
            button.classList.remove("is-success", "is-error");
          }
        }, 1400);
      };

      return result;
    };

    nodeType.prototype.onConfigure = function (info) {
      const result = originalConfigure
        ? originalConfigure.apply(this, arguments)
        : undefined;

      const props = info?.properties || this.properties || {};
      const value = Object.prototype.hasOwnProperty.call(props, "ds_show_text_value")
        ? normalizePreviewValue(props.ds_show_text_value)
        : readNativeText(this);
      setNativeText(this, value);
      setPreview(this, value);
      return result;
    };

    nodeType.prototype.onExecuted = function (output) {
      const result = originalExecuted
        ? originalExecuted.apply(this, arguments)
        : undefined;

      try {
        const values = output?.text_preview;
        if (Array.isArray(values) && values.length) {
          setPreview(this, values[0]);
        } else {
          setPreview(this, readNativeText(this));
        }
      } catch (_) {
        setPreview(this, readNativeText(this));
      }
      return result;
    };

    nodeType.prototype.serialize = function () {
      const value = readNativeText(this);
      setPreview(this, value);
      ensureProperties(this).ds_show_text_value = value;

      let data;
      try {
        data = originalSerialize
          ? originalSerialize.apply(this, arguments)
          : { ...this };
      } catch (_) {
        data = { ...this };
      }

      if (data) {
        data.properties = data.properties || {};
        data.properties.ds_show_text_value = value;
      }
      return data;
    };

    nodeType.prototype.onSerialize = function (info) {
      try {
        const value = readNativeText(this);
        ensureProperties(this).ds_show_text_value = value;
        if (info) {
          info.properties = info.properties || {};
          info.properties.ds_show_text_value = value;
        }
      } catch (_) {}
      return originalOnSerialize ? originalOnSerialize.apply(this, arguments) : undefined;
    };

    nodeType.prototype.onResize = function (size) {
      if (size) {
        size[0] = Math.max(Number(size[0]) || 0, 300);
        size[1] = Math.max(Number(size[1]) || 0, 160);
      }
      const result = originalResize
        ? originalResize.apply(this, arguments)
        : undefined;
      this.setDirtyCanvas?.(true, true);
      return result;
    };

    nodeType.prototype.onRemoved = function () {
      try { this._dsShowTextUnsubscribe?.(); } catch (_) {}
      window.clearTimeout(this._dsShowTextStatusTimer);
      return originalRemoved ? originalRemoved.apply(this, arguments) : undefined;
    };
  },
});
