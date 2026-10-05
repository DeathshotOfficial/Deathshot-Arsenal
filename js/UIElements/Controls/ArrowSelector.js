/**
 * DeathshotArsenal UI — ArrowSelector Component
 * Cycles through options with [ < ] [ Selection Display ] [ > ] soft rounded rectangle controls.
 */

import { DSIcon } from "../../Icons/index.js";

export function ArrowSelector(options = {}) {
  const root = document.createElement("div");
  root.className = "ds-ui-arrow-selector";
  if (options.className) root.classList.add(...options.className.split(/\s+/).filter(Boolean));

  let items = options.options || [];
  let currentIndex = 0;
  let disabled = Boolean(options.disabled);

  // Initialize index from value
  if (options.value != null) {
    const idx = items.findIndex((i) => (typeof i === "object" ? i.id === options.value : i === options.value));
    if (idx !== -1) currentIndex = idx;
  }

  // Left button
  const prevBtn = document.createElement("button");
  prevBtn.type = "button";
  prevBtn.className = "ds-ui-arrow-btn";
  prevBtn.title = "Previous";
  prevBtn.disabled = disabled;
  prevBtn.appendChild(DSIcon("chevron-left", { size: 14 }));

  // Display text badge
  const display = document.createElement("div");
  display.className = "ds-ui-arrow-display";

  // Right button
  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.className = "ds-ui-arrow-btn";
  nextBtn.title = "Next";
  nextBtn.disabled = disabled;
  nextBtn.appendChild(DSIcon("chevron-right", { size: 14 }));

  root.append(prevBtn, display, nextBtn);

  const updateDisplay = () => {
    if (items.length === 0) {
      display.textContent = "—";
      return;
    }
    const item = items[currentIndex];
    display.textContent = typeof item === "object" ? (item.label || item.id) : String(item);
  };

  const emit = (fire = true) => {
    updateDisplay();
    if (fire && items.length > 0) {
      const item = items[currentIndex];
      const val = typeof item === "object" ? item.id : item;
      options.onChange?.(val, item, api);
    }
  };

  const prev = () => {
    if (disabled || items.length === 0) return;
    if (currentIndex > 0) currentIndex--;
    else if (options.loop !== false) currentIndex = items.length - 1;
    emit(true);
  };

  const next = () => {
    if (disabled || items.length === 0) return;
    if (currentIndex < items.length - 1) currentIndex++;
    else if (options.loop !== false) currentIndex = 0;
    emit(true);
  };

  prevBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    prev();
  });

  nextBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    next();
  });

  updateDisplay();

  const api = {
    root,
    prev,
    next,
    getValue() {
      if (items.length === 0) return null;
      const item = items[currentIndex];
      return typeof item === "object" ? item.id : item;
    },
    setValue(val, fire = false) {
      const idx = items.findIndex((i) => (typeof i === "object" ? i.id === val : i === val));
      if (idx !== -1) {
        currentIndex = idx;
        emit(fire);
      }
    },
    setOptions(newItems) {
      items = newItems || [];
      currentIndex = 0;
      updateDisplay();
    },
    setDisabled(state) {
      disabled = Boolean(state);
      prevBtn.disabled = disabled;
      nextBtn.disabled = disabled;
    },
    destroy() {
      root.remove();
    },
  };

  return api;
}
