/**
 * DeathshotArsenal UI — Panel Container Component
 * Standard visible card/panel surface with scrolling support.
 */

export function Panel(options = {}) {
  const root = document.createElement("div");
  root.className = "ds-ui-panel";
  if (options.className) {
    root.classList.add(...options.className.split(/\s+/).filter(Boolean));
  }

  root.style.boxSizing = "border-box";
  root.style.background = "var(--ds-color-panel-2, #161a23)";
  root.style.border = "1px solid var(--ds-color-border, #242a36)";
  root.style.borderRadius = "var(--ds-radius-card, 8px)";
  root.style.padding = options.padding ?? "var(--ds-card-padding, 10px)";
  root.style.display = "flex";
  root.style.flexDirection = "column";
  root.style.gap = options.gap ?? "var(--ds-gap-sm, 6px)";
  root.style.minWidth = "0";

  if (options.scrollable !== false) {
    root.style.overflowY = "auto";
    root.style.overflowX = "hidden";
  }

  if (Array.isArray(options.children)) {
    options.children.forEach((child) => {
      if (child instanceof HTMLElement) root.appendChild(child);
      else if (child?.root instanceof HTMLElement) root.appendChild(child.root);
    });
  }

  const api = {
    root,
    append(...elements) {
      elements.forEach((el) => {
        if (el instanceof HTMLElement) root.appendChild(el);
        else if (el?.root instanceof HTMLElement) root.appendChild(el.root);
      });
    },
    clear() {
      root.replaceChildren();
    },
    setVisible(visible) {
      root.style.display = visible ? "flex" : "none";
    },
    destroy() {
      root.remove();
    },
  };

  return api;
}
