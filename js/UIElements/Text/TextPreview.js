/**
 * DeathshotArsenal UI — TextPreview Component
 * Read-only text viewer with copy action and soft rounded rectangle surface.
 */

import { DSIcon } from "../../Icons/index.js";

export function TextPreview(options = {}) {
  const root = document.createElement("div");
  root.className = "ds-ui-text-preview-container";
  if (options.className) root.classList.add(...options.className.split(/\s+/).filter(Boolean));

  let textContent = options.text || "";

  if (options.label || options.copyable !== false) {
    const head = document.createElement("div");
    head.className = "ds-ui-field-head";

    if (options.label) {
      const label = document.createElement("span");
      label.className = "ds-ui-field-label";
      label.textContent = options.label;
      head.appendChild(label);
    }

    if (options.copyable !== false) {
      const copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "ds-ui-btn ds-ui-btn-icon-only ds-ui-btn-compact";
      copyBtn.title = "Copy to clipboard";
      const icon = DSIcon("copy", { size: 12 });
      copyBtn.appendChild(icon);

      copyBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(textContent);
          icon.replaceWith(DSIcon("check", { size: 12, color: "var(--ds-color-success, #34d399)" }));
          setTimeout(() => {
            copyBtn.replaceChildren(DSIcon("copy", { size: 12 }));
          }, 1500);
        } catch (_) {}
      });

      head.appendChild(copyBtn);
    }

    root.appendChild(head);
  }

  const box = document.createElement("div");
  box.className = "ds-ui-text-preview";
  if (options.maxHeight) box.style.maxHeight = typeof options.maxHeight === "number" ? `${options.maxHeight}px` : options.maxHeight;
  box.textContent = textContent || options.placeholder || "";
  root.appendChild(box);

  const api = {
    root,
    box,
    getText: () => textContent,
    setText(text) {
      textContent = String(text ?? "");
      box.textContent = textContent || options.placeholder || "";
    },
    destroy() {
      root.remove();
    },
  };

  return api;
}
