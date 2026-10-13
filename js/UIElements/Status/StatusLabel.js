/**
 * DeathshotArsenal UI — StatusLabel Component
 * Compact read-only status text display for cards and headers.
 */

export function StatusLabel(options = {}) {
  const root = document.createElement("span");
  root.className = "ds-ui-status-text";
  if (options.className) {
    root.classList.add(...options.className.split(/\s+/).filter(Boolean));
  }

  root.style.boxSizing = "border-box";
  root.style.display = "inline-flex";
  root.style.alignItems = "center";
  root.style.fontSize = "11px";
  root.style.fontFamily = "var(--ds-font)";
  root.style.overflow = "hidden";
  root.style.textOverflow = "ellipsis";
  root.style.whiteSpace = "nowrap";
  root.style.userSelect = "text";
  root.style.minWidth = "0";

  let currentVariant = options.variant || "muted";
  let currentText = options.text || "";

  const colorForVariant = (variant) => {
    switch (variant) {
      case "danger":
      case "error":
        return "var(--ds-color-danger, #f87171)";
      case "success":
        return "var(--ds-color-success, #34d399)";
      case "warning":
        return "var(--ds-color-warning, #facc15)";
      case "primary":
      case "accent":
        return "var(--ds-color-accent, #67e8f9)";
      case "muted":
      default:
        return "var(--ds-color-muted-text, #9ca3af)";
    }
  };

  const apply = () => {
    root.textContent = currentText;
    root.title = currentText;
    root.style.color = colorForVariant(currentVariant);
  };

  apply();

  const api = {
    root,
    setText(text, variant = "muted") {
      currentText = String(text ?? "");
      currentVariant = variant;
      apply();
    },
    getText: () => currentText,
    getVariant: () => currentVariant,
    clear() {
      currentText = "";
      apply();
    },
    destroy() {
      root.remove();
    },
  };

  return api;
}
