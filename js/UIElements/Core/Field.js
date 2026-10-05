/**
 * DeathshotArsenal UI — Field Component
 * Standardized field wrapper for controls with consistent label, error, and layout.
 */

export function Field(options = {}) {
  const root = document.createElement("div");
  root.className = "ds-ui-field" + (options.layout === "inline" ? " ds-ui-field-inline" : "");
  if (options.className) root.classList.add(...options.className.split(/\s+/).filter(Boolean));

  let labelEl = null;
  let errorEl = null;

  if (options.label != null) {
    const head = document.createElement("div");
    head.className = "ds-ui-field-head";

    labelEl = document.createElement("span");
    labelEl.className = "ds-ui-field-label";
    labelEl.textContent = options.label + (options.required ? " *" : "");
    head.appendChild(labelEl);

    errorEl = document.createElement("span");
    errorEl.className = "ds-ui-field-error";
    if (options.error) errorEl.textContent = options.error;
    head.appendChild(errorEl);

    root.appendChild(head);
  }

  if (options.control instanceof HTMLElement) {
    root.appendChild(options.control);
  } else if (options.control?.root instanceof HTMLElement) {
    root.appendChild(options.control.root);
  }

  const api = {
    root,
    setLabel(text) {
      if (labelEl) labelEl.textContent = text + (options.required ? " *" : "");
    },
    setError(msg) {
      if (errorEl) errorEl.textContent = msg || "";
    },
    clearError() {
      if (errorEl) errorEl.textContent = "";
    },
    destroy() {
      root.remove();
    },
  };

  return api;
}
