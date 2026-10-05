/**
 * DeathshotArsenal UI — Card Component
 * Primary grouping primitive. 8px soft-cornered surface with optional header, actions, and collapsible body.
 */

import { DSIcon } from "../../Icons/index.js";

export function Card(options = {}) {
  const root = document.createElement("div");
  root.className = "ds-ui-card";
  if (options.className) root.classList.add(...options.className.split(/\s+/).filter(Boolean));
  if (options.variant) root.classList.add(`ds-ui-card-${options.variant}`);

  let isCollapsed = Boolean(options.collapsed);
  if (isCollapsed) root.classList.add("is-collapsed");

  let head = null;
  let titleEl = null;

  if (options.title || options.icon || options.collapsible || options.actions?.length) {
    head = document.createElement("div");
    head.className = "ds-ui-card-head";

    const titleGroup = document.createElement("div");
    titleGroup.className = "ds-ui-card-title-group";

    if (options.icon) {
      const iconEl = DSIcon(options.icon, { size: 14, color: "var(--ds-color-accent, #67e8f9)" });
      titleGroup.appendChild(iconEl);
    }

    if (options.title) {
      titleEl = document.createElement("span");
      titleEl.className = "ds-ui-card-title";
      titleEl.textContent = options.title;
      titleGroup.appendChild(titleEl);
    }

    head.appendChild(titleGroup);

    const actionsGroup = document.createElement("div");
    actionsGroup.className = "ds-ui-card-actions";

    if (Array.isArray(options.actions)) {
      options.actions.forEach((act) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "ds-ui-btn ds-ui-btn-icon-only ds-ui-btn-compact";
        btn.title = act.tooltip || "";
        btn.appendChild(DSIcon(act.icon, { size: 12 }));
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          act.onClick?.(e, api);
        });
        actionsGroup.appendChild(btn);
      });
    }

    if (options.collapsible) {
      const collapseBtn = document.createElement("button");
      collapseBtn.type = "button";
      collapseBtn.className = "ds-ui-btn ds-ui-btn-icon-only ds-ui-btn-compact";
      const icon = DSIcon(isCollapsed ? "chevron-down" : "chevron-up", { size: 12 });
      collapseBtn.appendChild(icon);

      collapseBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        api.setCollapsed(!isCollapsed);
      });
      actionsGroup.appendChild(collapseBtn);
    }

    head.appendChild(actionsGroup);
    root.appendChild(head);
  }

  const body = document.createElement("div");
  body.className = "ds-ui-card-body";
  root.appendChild(body);

  if (Array.isArray(options.children)) {
    options.children.forEach((child) => {
      if (child instanceof HTMLElement) body.appendChild(child);
      else if (child?.root instanceof HTMLElement) body.appendChild(child.root);
    });
  }

  const api = {
    root,
    head,
    body,
    setTitle(text) {
      if (titleEl) titleEl.textContent = text;
    },
    setCollapsed(collapsed) {
      isCollapsed = Boolean(collapsed);
      root.classList.toggle("is-collapsed", isCollapsed);
      options.onCollapseChange?.(isCollapsed, api);
    },
    append(...elements) {
      elements.forEach((el) => {
        if (el instanceof HTMLElement) body.appendChild(el);
        else if (el?.root instanceof HTMLElement) body.appendChild(el.root);
      });
    },
    clear() {
      body.replaceChildren();
    },
    destroy() {
      root.remove();
    },
  };

  return api;
}
