/* ============================================================
   DS Show Text - DeathshotArsenal
   Read-only STRING preview with persistent native source widget.

   The copy icon is the Lucide "Copy" icon path, embedded locally so the
   node has no CDN/runtime package dependency.
   ============================================================ */

import { app } from "/scripts/app.js";
import { protectDSResizeCorners } from "../Shared/ds_ui_system.js";

const cssId = "ds-show-text-css";
if (!document.getElementById(cssId)) {
  const cssLink = document.createElement("link");
  cssLink.id = cssId;
  cssLink.rel = "stylesheet";
  cssLink.href = "/extensions/DeathshotArsenal/Show Text/ds_show_text.css";
  document.head.appendChild(cssLink);
}

const ICONS = {
  text: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 6v12M17 6v12M5 18h4M15 18h4"/></svg>`,
  // Lucide Copy icon.
  copy: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2v2"/></svg>`,
};

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
    node._dsShowTextPreview.dataset.empty = text.length ? "false" : "true";
  }
}

function makeRoot(node) {
  const root = document.createElement("div");
  root.className = "ds-show-text-root";
  root.dataset.dsThemed = "true";
  root.innerHTML = `
    <div class="ds-show-text-header">
      <div class="ds-show-text-title">
        <span class="ds-show-text-title-icon">${ICONS.text}</span>
        <span>Show Text</span>
      </div>
      <span class="ds-show-text-status" data-status aria-live="polite"></span>
      <button class="ds-show-text-copy ds-ui-button ds-ui-icon-button" type="button"
              data-copy title="Copy text" aria-label="Copy text">
        ${ICONS.copy}
      </button>
    </div>
    <div class="ds-show-text-body">
      <textarea class="ds-show-text-preview" data-preview readonly spellcheck="false"
                aria-label="Text preview" placeholder="Nothing to display"></textarea>
    </div>
  `;

  node._dsShowTextRoot = root;
  node._dsShowTextPreview = root.querySelector("[data-preview]");
  node._dsShowTextStatus = root.querySelector("[data-status]");
  node._dsShowTextCopy = root.querySelector("[data-copy]");

  node._dsShowTextCopy.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    await node._dsShowTextCopyValue?.();
  });

  return root;
}

function setStatus(node, message, kind = "") {
  const status = node._dsShowTextStatus;
  const button = node._dsShowTextCopy;
  if (status) status.textContent = message || "";
  if (button) {
    button.classList.remove("is-success", "is-error");
    if (kind === "success") button.classList.add("is-success");
    if (kind === "error") button.classList.add("is-error");
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
    // Fall through to the compatibility path below.
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
        Math.max(Number(current[1]) || 220, 170),
      ];

      const root = makeRoot(this);
      this._dsShowTextWidget = this.addDOMWidget("ds_show_text_ui", "div", root, {
        serialize: false,
        hideOnZoom: false,
        getMinHeight: () => 170 - 30,
        getHeight: () => Math.max(1, (Number(this.size?.[1]) || 220) - 30),
      });

      const initial = readNativeText(this);
      setPreview(this, initial);

      this._dsShowTextUnsubscribe = window.DSGlobalTheme?.bindNode?.(root, this);
      if (window.DSGlobalTheme) {
        window.DSGlobalTheme.applyNodeBase?.(this);
      }

      this._dsShowTextCopyValue = async () => {
        const value = normalizePreviewValue(this._dsShowTextPreview?.value ?? readNativeText(this));
        const ok = await copyText(value);
        if (ok) {
          setStatus(this, value ? "Copied" : "Copied empty text", "success");
        } else {
          setStatus(this, "Copy failed", "error");
        }
        window.clearTimeout(this._dsShowTextStatusTimer);
        this._dsShowTextStatusTimer = window.setTimeout(() => setStatus(this, ""), 1400);
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
        setStatus(this, "Preview update failed", "error");
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
        size[1] = Math.max(Number(size[1]) || 0, 170);
      }
      const result = originalResize
        ? originalResize.apply(this, arguments)
        : undefined;
      if (this._dsShowTextRoot && size) {
        const height = Math.max(1, size[1] - 30);
        this._dsShowTextRoot.style.height = `${height}px`;
      }
      this.setDirtyCanvas(true, true);
      return result;
    };

    nodeType.prototype.onRemoved = function () {
      try { this._dsShowTextUnsubscribe?.(); } catch (_) {}
      window.clearTimeout(this._dsShowTextStatusTimer);
      return originalRemoved ? originalRemoved.apply(this, arguments) : undefined;
    };
  },
});
