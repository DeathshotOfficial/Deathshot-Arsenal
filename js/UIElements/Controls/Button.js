/**
 * DeathshotArsenal UI — Button Component
 * Reusable button with standard, compact, primary, active, and icon-only variants.
 */

import { DSIcon } from "../../Icons/index.js";

export function Button(options = {}) {
  const root = document.createElement("button");
  root.type = "button";
  root.className = "ds-ui-btn";

  if (options.className) root.classList.add(...options.className.split(/\s+/).filter(Boolean));
  if (options.variant) root.classList.add(`ds-ui-btn-${options.variant}`);
  if (options.size === "compact" || options.compact) root.classList.add("ds-ui-btn-compact");
  if (options.tooltip) root.title = options.tooltip;

  let labelEl = null;
  let iconEl = null;

  if (options.icon) {
    iconEl = DSIcon(options.icon, { size: options.size === "compact" || options.compact ? 12 : 14 });
    root.appendChild(iconEl);
  }

  if (options.label) {
    labelEl = document.createElement("span");
    labelEl.textContent = options.label;
    root.appendChild(labelEl);
  } else if (options.icon && !options.label) {
    root.classList.add("ds-ui-btn-icon-only");
  }

  if (options.active) {
    root.classList.add("is-active");
    root.setAttribute("aria-pressed", "true");
  }

  let disabled = Boolean(options.disabled);
  root.disabled = disabled;

  root.addEventListener("click", (e) => {
    if (disabled) return;
    options.onClick?.(e, api);
  });

  const api = {
    root,
    setLabel(text) {
      if (!labelEl) {
        labelEl = document.createElement("span");
        root.appendChild(labelEl);
      }
      labelEl.textContent = text;
      root.classList.remove("ds-ui-btn-icon-only");
    },
    setIcon(name) {
      if (iconEl) iconEl.remove();
      if (name) {
        iconEl = DSIcon(name, { size: options.size === "compact" || options.compact ? 12 : 14 });
        root.prepend(iconEl);
      }
    },
    setActive(state) {
      const active = Boolean(state);
      root.classList.toggle("is-active", active);
      root.setAttribute("aria-pressed", active ? "true" : "false");
    },
    setDisabled(state) {
      disabled = Boolean(state);
      root.disabled = disabled;
    },
    destroy() {
      root.remove();
    },
  };

  return api;
}
