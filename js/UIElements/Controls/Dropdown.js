/**
 * DeathshotArsenal UI — Dropdown Component
 * Custom non-native select control with search, keyboard navigation, and theme highlights.
 */

import { DSIcon } from "../../Icons/index.js";
import { Popup } from "../Core/Popup.js";

function normalizePath(str) {
  return String(str || "")
    .replace(/[\\/]+/g, "/")
    .replace(/^\.\//, "")
    .toLowerCase()
    .trim();
}

function findMatchingItem(items, val) {
  if (val == null || val === "") return null;
  const sVal = String(val);
  const normVal = normalizePath(sVal);

  // Exact match first
  let found = items.find((i) => !i.separator && String(i.id ?? i.value ?? i) === sVal);
  if (found) return found;

  // Normalized path match (handles \ vs / across OS)
  found = items.find((i) => !i.separator && normalizePath(i.id ?? i.value ?? i) === normVal);
  if (found) return found;

  // Filename-only fallback if subfolders differ
  const baseVal = sVal.split(/[\\/]/).pop()?.toLowerCase();
  if (baseVal) {
    found = items.find((i) => {
      if (i.separator) return false;
      const baseI = String(i.id ?? i.value ?? i).split(/[\\/]/).pop()?.toLowerCase();
      return baseI === baseVal;
    });
    if (found) return found;
  }

  return null;
}

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
  popupContent.className = "ds-ui-dropdown-popup-content";
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
    const activeItem = findMatchingItem(items, currentValue);
    if (activeItem) {
      triggerLabel.textContent = activeItem.label ?? String(activeItem.id ?? currentValue);
    } else if (currentValue != null && String(currentValue).trim() !== "") {
      triggerLabel.textContent = String(currentValue);
    } else {
      triggerLabel.textContent = options.placeholder || "Select...";
    }
  };

  const renderItems = (filter = "") => {
    itemsContainer.replaceChildren();
    const query = filter.trim().toLowerCase();
    const activeItem = findMatchingItem(items, currentValue);
    let matchCount = 0;

    items.forEach((item) => {
      if (item.separator) {
        const sep = document.createElement("div");
        sep.className = "ds-ui-popup-sep";
        itemsContainer.appendChild(sep);
        return;
      }

      const text = String(item.label || item.id);
      if (query && !text.toLowerCase().includes(query)) return;
      matchCount++;

      const row = document.createElement("button");
      row.type = "button";
      row.className = "ds-ui-popup-item";
      const isSelected = activeItem ? (item === activeItem) : (String(item.id) === String(currentValue) || normalizePath(item.id) === normalizePath(currentValue));
      if (isSelected) row.classList.add("is-selected");

      const labelSpan = document.createElement("span");
      labelSpan.textContent = text;
      row.appendChild(labelSpan);

      if (isSelected) {
        row.appendChild(DSIcon("check", { size: 12, color: "var(--ds-color-accent, #67e8f9)" }));
      }

      row.addEventListener("click", (e) => {
        e.stopPropagation();
        currentValue = item.id !== undefined ? item.id : (item.value !== undefined ? item.value : item);
        updateTriggerText();
        popup.hide();
        options.onChange?.(currentValue, item, api);
      });

      itemsContainer.appendChild(row);
    });

    if (matchCount === 0) {
      const empty = document.createElement("div");
      empty.className = "ds-ui-popup-empty";
      empty.textContent = options.emptyText || "No matching options";
      itemsContainer.appendChild(empty);
    }

    // Immediately re-anchor so shrinking/growing options stay attached to dropdown
    popup.reposition(trigger);
  };

  if (searchInput) {
    searchInput.addEventListener("input", (e) => renderItems(e.target.value));
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        popup.hide();
      } else if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        const firstItem = itemsContainer.querySelector(".ds-ui-popup-item");
        if (firstItem) {
          firstItem.click();
        }
      }
    });
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
        const item = findMatchingItem(items, currentValue);
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
