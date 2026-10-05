/**
 * DeathshotArsenal UI — Dropdown Component
 * Custom non-native select control with search, keyboard navigation, and theme highlights.
 */

import { DSIcon } from "../../Icons/index.js";
import { Popup } from "../Core/Popup.js";

export function Dropdown(options = {}) {
  const root = document.createElement("div");
  root.className = "ds-ui-dropdown";
  if (options.className) root.classList.add(...options.className.split(/\s+/).filter(Boolean));
  if (options.width) root.style.width = typeof options.width === "number" ? `${options.width}px` : options.width;

  let items = options.options || [];
  let currentValue = options.value ?? (items[0]?.id ?? "");
  let disabled = Boolean(options.disabled);

  // Trigger button
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "ds-ui-dropdown-trigger" + (options.compact ? " ds-ui-btn-compact" : "");
  trigger.disabled = disabled;

  let titleEl = null;
  if (options.label != null && options.label !== "") {
    titleEl = document.createElement("span");
    titleEl.className = "ds-ui-dropdown-title";
    titleEl.textContent = options.label;
    trigger.appendChild(titleEl);
    trigger.classList.add("has-label");
    root.classList.add("has-label");
  }

  const triggerLabel = document.createElement("span");
  triggerLabel.className = "ds-ui-dropdown-label";
  trigger.appendChild(triggerLabel);

  const chevron = DSIcon("chevron-down", { size: 12 });
  trigger.appendChild(chevron);
  root.appendChild(trigger);

  // Popup surface
  const popupContent = document.createElement("div");
  let searchInput = null;
  const isSearchable = options.searchable ?? items.length > 8;

  if (isSearchable) {
    searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.className = "ds-ui-popup-search";
    searchInput.placeholder = "Search...";
    popupContent.appendChild(searchInput);
  }

  const itemsContainer = document.createElement("div");
  itemsContainer.className = "ds-ui-popup-items-container";
  popupContent.appendChild(itemsContainer);

  const popup = Popup({
    anchor: trigger,
    content: popupContent,
    width: options.width,
    onOpen: () => {
      trigger.classList.add("is-open");
      renderItems();
      if (searchInput) {
        searchInput.value = "";
        setTimeout(() => searchInput.focus(), 20);
      }
    },
    onClose: () => {
      trigger.classList.remove("is-open");
    },
  });

  popup.root.appendChild(popupContent);

  const updateTriggerText = () => {
    const activeItem = items.find((i) => String(i.id) === String(currentValue));
    triggerLabel.textContent = activeItem?.label ?? (options.placeholder || String(currentValue || "Select..."));
  };

  const renderItems = (filter = "") => {
    itemsContainer.replaceChildren();
    const query = filter.trim().toLowerCase();

    items.forEach((item) => {
      if (item.separator) {
        const sep = document.createElement("div");
        sep.className = "ds-ui-popup-sep";
        itemsContainer.appendChild(sep);
        return;
      }

      const text = String(item.label || item.id);
      if (query && !text.toLowerCase().includes(query)) return;

      const row = document.createElement("button");
      row.type = "button";
      row.className = "ds-ui-popup-item";
      const isSelected = String(item.id) === String(currentValue);
      if (isSelected) row.classList.add("is-selected");

      const labelSpan = document.createElement("span");
      labelSpan.textContent = text;
      row.appendChild(labelSpan);

      if (isSelected) {
        row.appendChild(DSIcon("check", { size: 12, color: "var(--ds-color-accent, #67e8f9)" }));
      }

      row.addEventListener("click", (e) => {
        e.stopPropagation();
        currentValue = item.id;
        updateTriggerText();
        popup.hide();
        options.onChange?.(currentValue, item, api);
      });

      itemsContainer.appendChild(row);
    });
  };

  if (searchInput) {
    searchInput.addEventListener("input", (e) => renderItems(e.target.value));
  }

  trigger.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    if (popup.isOpen()) popup.hide();
    else popup.show(trigger);
  });

  updateTriggerText();

  const api = {
    root,
    trigger,
    getValue: () => currentValue,
    setValue(val, fire = false) {
      currentValue = val;
      updateTriggerText();
      if (fire) {
        const item = items.find((i) => String(i.id) === String(currentValue));
        options.onChange?.(currentValue, item, api);
      }
    },
    setOptions(newOptions) {
      items = newOptions || [];
      updateTriggerText();
    },
    setDisabled(state) {
      disabled = Boolean(state);
      trigger.disabled = disabled;
    },
    setLabel(lbl) {
      if (lbl != null && lbl !== "") {
        if (!titleEl) {
          titleEl = document.createElement("span");
          titleEl.className = "ds-ui-dropdown-title";
          trigger.insertBefore(titleEl, triggerLabel);
        }
        titleEl.textContent = lbl;
        trigger.classList.add("has-label");
        root.classList.add("has-label");
      } else {
        if (titleEl) {
          titleEl.remove();
          titleEl = null;
        }
        trigger.classList.remove("has-label");
        root.classList.remove("has-label");
      }
    },
    getLabel: () => (titleEl ? titleEl.textContent : (options.label || "")),
    destroy() {
      popup.destroy();
      root.remove();
    },
  };

  return api;
}
