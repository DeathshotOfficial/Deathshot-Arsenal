/**
 * DeathshotArsenal UI — Section Component
 * Creates standardized sub-section headers and dividers within cards.
 */

import { DSIcon } from "../../Icons/index.js";

export function Section(options = {}) {
  const root = document.createElement("div");
  root.className = "ds-ui-section";
  if (options.className) root.classList.add(...options.className.split(/\s+/).filter(Boolean));

  if (options.icon) {
    root.appendChild(DSIcon(options.icon, { size: 12, color: "var(--ds-color-accent, #67e8f9)" }));
  }

  const titleEl = document.createElement("span");
  titleEl.className = "ds-ui-section-title";
  titleEl.textContent = options.title || "";
  root.appendChild(titleEl);

  const api = {
    root,
    setTitle(text) {
      titleEl.textContent = text;
    },
    destroy() {
      root.remove();
    },
  };

  return api;
}
