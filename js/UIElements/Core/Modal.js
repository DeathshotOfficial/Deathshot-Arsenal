/**
 * DeathshotArsenal UI — Modal Component
 * Centered dialog over a dimmed backdrop: header (icon, title, subtitle, close),
 * scrollable body and an optional footer. Closes on Esc, the close button and
 * (by default) a click on the backdrop.
 */

import { DSIcon } from "../../Icons/index.js";

export function Modal(options = {}) {
  const overlay = document.createElement("div");
  overlay.className = "ds-ui-modal-overlay";

  const win = document.createElement("div");
  win.className = "ds-ui-modal";
  win.dataset.dsThemed = "true";
  if (options.className) win.classList.add(...options.className.split(/\s+/).filter(Boolean));
  if (options.width) win.style.width = typeof options.width === "number" ? `${options.width}px` : options.width;

  const head = document.createElement("div");
  head.className = "ds-ui-modal-head";

  const titleGroup = document.createElement("div");
  titleGroup.className = "ds-ui-modal-title-group";
  if (options.icon) {
    const badge = document.createElement("span");
    badge.className = "ds-ui-modal-icon";
    badge.appendChild(DSIcon(options.icon, { size: 15 }));
    titleGroup.appendChild(badge);
  }
  const titles = document.createElement("div");
  const titleEl = document.createElement("div");
  titleEl.className = "ds-ui-modal-title";
  titleEl.textContent = options.title || "";
  titles.appendChild(titleEl);
  if (options.subtitle) {
    const sub = document.createElement("div");
    sub.className = "ds-ui-modal-subtitle";
    sub.textContent = options.subtitle;
    titles.appendChild(sub);
  }
  titleGroup.appendChild(titles);

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "ds-ui-btn ds-ui-btn-icon-only ds-ui-btn-compact";
  closeBtn.title = "Close (Esc)";
  closeBtn.appendChild(DSIcon("x", { size: 14 }));
  head.append(titleGroup, closeBtn);

  const body = document.createElement("div");
  body.className = "ds-ui-modal-body";

  const footer = document.createElement("div");
  footer.className = "ds-ui-modal-foot";

  win.append(head, body);
  if (options.footer !== false) win.appendChild(footer);
  overlay.appendChild(win);

  const onKey = (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      api.close();
    } else {
      options.onKeyDown?.(e, api);
    }
  };

  let isOpen = false;
  const api = {
    root: overlay,
    window: win,
    head,
    body,
    footer,
    open() {
      if (isOpen) return api;
      isOpen = true;
      document.body.appendChild(overlay);
      document.addEventListener("keydown", onKey, true);
      return api;
    },
    close() {
      if (!isOpen) return;
      isOpen = false;
      document.removeEventListener("keydown", onKey, true);
      overlay.remove();
      options.onClose?.(api);
    },
  };

  closeBtn.addEventListener("click", () => api.close());
  if (options.closeOnBackdrop !== false) {
    overlay.addEventListener("pointerdown", (e) => {
      if (e.target === overlay) api.close();
    });
  }

  return api;
}
