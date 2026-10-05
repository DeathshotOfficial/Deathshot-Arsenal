/**
 * DeathshotArsenal UI — TextEditor Component
 * Custom multiline text editor with toolbar and theme styling.
 */

import { DSIcon } from "../../Icons/index.js";

export function TextEditor(options = {}) {
  const root = document.createElement("div");
  root.className = "ds-ui-text-editor-container";
  if (options.className) root.classList.add(...options.className.split(/\s+/).filter(Boolean));

  if (options.label || options.showToolbar) {
    const head = document.createElement("div");
    head.className = "ds-ui-field-head";

    if (options.label) {
      const label = document.createElement("span");
      label.className = "ds-ui-field-label";
      label.textContent = options.label;
      head.appendChild(label);
    }

    if (options.showToolbar) {
      const toolbar = document.createElement("div");
      toolbar.className = "ds-ui-card-actions";

      // Clear button
      const clearBtn = document.createElement("button");
      clearBtn.type = "button";
      clearBtn.className = "ds-ui-btn ds-ui-btn-icon-only ds-ui-btn-compact";
      clearBtn.title = "Clear text";
      clearBtn.appendChild(DSIcon("trash-2", { size: 12 }));
      clearBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        textarea.value = "";
        options.onChange?.("", api);
      });

      // Copy button
      const copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "ds-ui-btn ds-ui-btn-icon-only ds-ui-btn-compact";
      copyBtn.title = "Copy text";
      copyBtn.appendChild(DSIcon("copy", { size: 12 }));
      copyBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(textarea.value);
        } catch (_) {}
      });

      toolbar.append(copyBtn, clearBtn);
      head.appendChild(toolbar);
    }

    root.appendChild(head);
  }

  const textarea = document.createElement("textarea");
  textarea.className = "ds-ui-text-editor";
  if (options.rows) textarea.rows = options.rows;
  if (options.placeholder) textarea.placeholder = options.placeholder;
  if (options.minHeight) textarea.style.minHeight = typeof options.minHeight === "number" ? `${options.minHeight}px` : options.minHeight;
  if (options.maxHeight) textarea.style.maxHeight = typeof options.maxHeight === "number" ? `${options.maxHeight}px` : options.maxHeight;
  textarea.value = options.value || "";
  textarea.readOnly = Boolean(options.readOnly);

  textarea.addEventListener("input", () => {
    options.onChange?.(textarea.value, api);
  });

  root.appendChild(textarea);

  const api = {
    root,
    textarea,
    getValue: () => textarea.value,
    setValue(val) {
      textarea.value = val || "";
    },
    setReadOnly(ro) {
      textarea.readOnly = Boolean(ro);
    },
    focus() {
      textarea.focus();
    },
    destroy() {
      root.remove();
    },
  };

  return api;
}
