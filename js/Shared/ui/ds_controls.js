/**
 * DeathshotArsenal UI Controls
 *
 * Reusable, theme-aware controls. New DS nodes should use these factories
 * instead of creating ad-hoc range/checkbox widgets.
 */

function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return Number(min) || 0;
  return Math.min(Number(max), Math.max(Number(min), n));
}

function precisionForStep(step) {
  const s = String(step ?? 1);
  const dot = s.indexOf(".");
  return dot < 0 ? 0 : s.length - dot - 1;
}

function formatValue(value, step) {
  const p = precisionForStep(step);
  return Number(value).toFixed(p).replace(/\.0+$/, "").replace(/(\.[0-9]*?)0+$/, "$1");
}

function setSliderPercent(slider, value) {
  const min = Number(slider.min ?? 0);
  const max = Number(slider.max ?? 100);
  const val = Number(value);
  const pct = max === min ? 0 : ((val - min) / (max - min)) * 100;
  slider.style.setProperty("--ds-slider-pct", `${Math.max(0, Math.min(100, pct))}%`);
}

/**
 * Creates a DS slider with a filled track and a numeric input.
 *
 * options: { min, max, step, value, label, suffix, onChange }
 * Returned object: { root, range, input, getValue, setValue, destroy }
 */
export function createSlider(options = {}) {
  const min = Number(options.min ?? 0);
  const max = Number(options.max ?? 100);
  const step = Number(options.step ?? 1);
  const initial = clamp(options.value ?? min, min, max);

  const root = document.createElement("div");
  root.className = "ds-ui-slider";
  if (options.className) root.classList.add(...String(options.className).split(/\s+/).filter(Boolean));

  const head = document.createElement("div");
  head.className = "ds-ui-slider-head";
  const label = document.createElement("span");
  label.className = "ds-ui-slider-label";
  label.textContent = options.label ?? "";
  const suffix = String(options.suffix ?? "");
  const number = document.createElement("input");
  number.className = "ds-ui-slider-number ds-ui-input";
  number.type = "number";
  number.min = String(min);
  number.max = String(max);
  number.step = String(step);
  number.inputMode = "decimal";
  number.setAttribute("aria-label", options.label ? `${options.label} value` : "Value");
  head.append(label, number);

  const track = document.createElement("div");
  track.className = "ds-ui-slider-track";
  const range = document.createElement("input");
  range.className = "ds-ui-slider-range";
  range.type = "range";
  range.min = String(min);
  range.max = String(max);
  range.step = String(step);
  range.setAttribute("aria-label", options.label ?? "Value");
  track.appendChild(range);

  root.append(head, track);

  let current = initial;
  let syncing = false;

  const emit = (source) => {
    if (syncing) return;
    const next = clamp(source === "number" ? number.value : range.value, min, max);
    current = next;
    syncing = true;
    range.value = String(next);
    number.value = formatValue(next, step);
    syncing = false;
    setSliderPercent(range, next);
    options.onChange?.(next, { source, slider: api });
  };

  range.addEventListener("input", () => emit("range"));
  number.addEventListener("input", () => emit("number"));
  number.addEventListener("change", () => emit("number"));

  const api = {
    root,
    range,
    input: number,
    getValue: () => current,
    setValue(value, fire = false) {
      const next = clamp(value, min, max);
      current = next;
      syncing = true;
      range.value = String(next);
      number.value = formatValue(next, step);
      syncing = false;
      setSliderPercent(range, next);
      if (fire) options.onChange?.(next, { source: "program", slider: api });
    },
    destroy() {
      range.replaceWith(range.cloneNode(true));
      number.replaceWith(number.cloneNode(true));
      root.remove();
    },
  };

  api.setValue(initial, false);
  return api;
}

/**
 * Creates a compact, non-native DS toggle switch.
 * options: { checked, label, description, onChange }
 */
export function createToggle(options = {}) {
  const root = document.createElement("button");
  root.type = "button";
  root.className = "ds-ui-toggle";
  root.setAttribute("role", "switch");
  root.setAttribute("aria-checked", options.checked ? "true" : "false");
  if (options.className) root.classList.add(...String(options.className).split(/\s+/).filter(Boolean));

  const copy = document.createElement("span");
  copy.className = "ds-ui-toggle-copy";
  if (options.label != null) {
    const title = document.createElement("strong");
    title.className = "ds-ui-toggle-label";
    title.textContent = options.label;
    copy.appendChild(title);
  }
  if (options.description) {
    const description = document.createElement("small");
    description.className = "ds-ui-toggle-description";
    description.textContent = options.description;
    copy.appendChild(description);
  }

  const track = document.createElement("span");
  track.className = "ds-ui-toggle-track";
  const thumb = document.createElement("span");
  thumb.className = "ds-ui-toggle-thumb";
  track.appendChild(thumb);
  root.append(copy, track);

  let checked = Boolean(options.checked);
  const update = (fire = false) => {
    root.classList.toggle("is-on", checked);
    root.setAttribute("aria-checked", checked ? "true" : "false");
    if (fire) options.onChange?.(checked, api);
  };

  const api = {
    root,
    getValue: () => checked,
    setValue(value, fire = false) {
      checked = Boolean(value);
      update(fire);
    },
    toggle() {
      checked = !checked;
      update(true);
    },
    destroy() {
      root.replaceWith(root.cloneNode(true));
    },
  };

  root.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    api.toggle();
  });

  update(false);
  return api;
}

export function upgradeLegacyDSRange(input) {
  if (!input || input.type !== "range") return input;
  input.classList.add("ds-ui-native-range");
  setSliderPercent(input, input.value);
  if (!input.dataset.dsUiRangeBound) {
    input.dataset.dsUiRangeBound = "true";
    input.addEventListener("input", () => setSliderPercent(input, input.value));
    input.addEventListener("change", () => setSliderPercent(input, input.value));
  }
  return input;
}

/**
 * Creates a theme-consistent Color Picker component.
 * options: { value, label, presets, onChange }
 * returns: { root, trigger, getValue, setValue, destroy }
 */
export function createColorPicker(options = {}) {
  const root = document.createElement("div");
  root.className = "ds-ui-color-picker";
  if (options.className) root.classList.add(...String(options.className).split(/\s+/).filter(Boolean));

  if (options.label) {
    const lbl = document.createElement("span");
    lbl.className = "ds-ui-color-picker-label";
    lbl.textContent = options.label;
    root.appendChild(lbl);
  }

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "ds-ui-color-trigger";

  const swatch = document.createElement("span");
  swatch.className = "ds-ui-color-swatch-box";

  const hexSpan = document.createElement("span");
  hexSpan.className = "ds-ui-color-hex-text";

  trigger.append(swatch, hexSpan);
  root.appendChild(trigger);

  let currentColor = (options.value || "#67e8f9").trim();
  let popupEl = null;

  const defaultPresets = options.presets || [
    "#67e8f9", "#38bdf8", "#818cf8", "#c084fc", "#f472b6", "#fb7185",
    "#34d399", "#a3e635", "#facc15", "#fb923c", "#f87171", "#94a3b8"
  ];

  const updateDisplay = (color) => {
    swatch.style.backgroundColor = color;
    hexSpan.textContent = color.toUpperCase();
  };

  const setColor = (newColor, fire = true) => {
    if (!newColor) return;
    currentColor = newColor.startsWith("#") ? newColor : `#${newColor}`;
    updateDisplay(currentColor);
    if (fire) options.onChange?.(currentColor, api);
  };

  const closePopup = () => {
    if (popupEl) {
      popupEl.remove();
      popupEl = null;
    }
  };

  const openPopup = () => {
    closePopup();
    popupEl = document.createElement("div");
    popupEl.className = "ds-ui-color-popup";
    popupEl.addEventListener("pointerdown", (e) => e.stopPropagation());
    popupEl.addEventListener("mousedown", (e) => e.stopPropagation());

    // Native color input + hex text input row
    const inputRow = document.createElement("div");
    inputRow.className = "ds-ui-color-popup-input-row";

    const nativeInput = document.createElement("input");
    nativeInput.type = "color";
    nativeInput.className = "ds-ui-color-popup-native";
    nativeInput.value = currentColor.slice(0, 7);

    const textInput = document.createElement("input");
    textInput.type = "text";
    textInput.className = "ds-ui-color-popup-hex-input";
    textInput.value = currentColor;
    textInput.maxLength = 7;

    nativeInput.addEventListener("input", (e) => {
      textInput.value = e.target.value.toUpperCase();
      setColor(e.target.value);
    });

    textInput.addEventListener("input", (e) => {
      let val = e.target.value.trim();
      if (!val.startsWith("#")) val = `#${val}`;
      if (/^#[0-9a-fA-F]{6}$/.test(val)) {
        nativeInput.value = val;
        setColor(val);
      }
    });

    inputRow.append(nativeInput, textInput);
    popupEl.appendChild(inputRow);

    // Preset swatches grid
    const grid = document.createElement("div");
    grid.className = "ds-ui-color-presets-grid";
    defaultPresets.forEach((hex) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ds-ui-color-preset-btn";
      btn.style.backgroundColor = hex;
      btn.title = hex;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        nativeInput.value = hex;
        textInput.value = hex.toUpperCase();
        setColor(hex);
      });
      grid.appendChild(btn);
    });
    popupEl.appendChild(grid);

    document.body.appendChild(popupEl);

    // Position popup next to trigger
    const rect = trigger.getBoundingClientRect();
    const popupLeft = Math.max(8, Math.min(window.innerWidth - 216, rect.left));
    const popupTop = rect.bottom + 4 + 140 > window.innerHeight
      ? Math.max(8, rect.top - 150)
      : rect.bottom + 4;
    popupEl.style.left = `${popupLeft}px`;
    popupEl.style.top = `${popupTop}px`;

    setTimeout(() => {
      const clickAway = (e) => {
        if (popupEl && !popupEl.contains(e.target) && !trigger.contains(e.target)) {
          closePopup();
          document.removeEventListener("pointerdown", clickAway, true);
        }
      };
      document.addEventListener("pointerdown", clickAway, true);
    }, 0);
  };

  trigger.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (popupEl) closePopup();
    else openPopup();
  });

  updateDisplay(currentColor);

  const api = {
    root,
    trigger,
    getValue: () => currentColor,
    setValue: (val, fire = false) => setColor(val, fire),
    destroy: () => {
      closePopup();
      root.remove();
    }
  };

  return api;
}

/**
 * Creates a theme-consistent Segmented Button Group (e.g. Snap, Mode selectors).
 * options: { options: [{ id, label }], value, compact, onChange }
 * returns: { root, buttons, getValue, setValue, destroy }
 */
export function createSegmentedGroup(options = {}) {
  const root = document.createElement("div");
  root.className = "ds-ui-segmented" + (options.compact ? " ds-ui-segmented-compact" : "");
  if (options.className) root.classList.add(...String(options.className).split(/\s+/).filter(Boolean));

  const items = options.options || [];
  let currentValue = options.value ?? (items[0]?.id ?? "");
  const btnMap = new Map();

  const updateActive = () => {
    for (const [id, btn] of btnMap.entries()) {
      const active = String(id) === String(currentValue);
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    }
  };

  items.forEach((item) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ds-ui-segmented-btn";
    btn.textContent = item.label ?? String(item.id);
    btn.dataset.id = item.id;
    btnMap.set(item.id, btn);

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (currentValue === item.id) return;
      currentValue = item.id;
      updateActive();
      options.onChange?.(currentValue, api);
    });

    root.appendChild(btn);
  });

  updateActive();

  const api = {
    root,
    buttons: btnMap,
    getValue: () => currentValue,
    setValue: (val, fire = false) => {
      currentValue = val;
      updateActive();
      if (fire) options.onChange?.(currentValue, api);
    },
    destroy: () => root.remove()
  };

  return api;
}

/**
 * Creates a theme-consistent Dropdown / Context Menu template.
 * options: { items: [{ id, label, description, separator }], onSelect, searchable, anchorEl }
 * returns: { show, hide, destroy }
 */
export function createMenu(options = {}) {
  let menuEl = null;

  const hide = () => {
    if (menuEl) {
      menuEl.remove();
      menuEl = null;
    }
  };

  const show = (anchorOrPos) => {
    hide();
    menuEl = document.createElement("div");
    menuEl.className = "ds-ui-menu";
    menuEl.addEventListener("pointerdown", (e) => e.stopPropagation());
    menuEl.addEventListener("mousedown", (e) => e.stopPropagation());

    const items = options.items || [];
    let searchInput = null;

    if (options.searchable) {
      searchInput = document.createElement("input");
      searchInput.className = "ds-ui-menu-search";
      searchInput.placeholder = "Search...";
      menuEl.appendChild(searchInput);
    }

    const itemsContainer = document.createElement("div");
    menuEl.appendChild(itemsContainer);

    const renderItems = (filter = "") => {
      itemsContainer.replaceChildren();
      const q = filter.trim().toLowerCase();
      items.forEach((item) => {
        if (item.separator) {
          const sep = document.createElement("div");
          sep.className = "ds-ui-menu-sep";
          itemsContainer.appendChild(sep);
          return;
        }
        if (q && !String(item.label || item.id).toLowerCase().includes(q)) return;

        const row = document.createElement("button");
        row.type = "button";
        row.className = "ds-ui-menu-item";
        if (item.active) row.classList.add("is-active");

        const label = document.createElement("span");
        label.textContent = item.label || item.id;
        row.appendChild(label);

        if (item.description) {
          const desc = document.createElement("small");
          desc.className = "ds-ui-menu-item-desc";
          desc.textContent = item.description;
          row.appendChild(desc);
        }

        row.addEventListener("click", (e) => {
          e.stopPropagation();
          options.onSelect?.(item.id, item);
          hide();
        });

        itemsContainer.appendChild(row);
      });
    };

    renderItems();

    if (searchInput) {
      searchInput.addEventListener("input", (e) => renderItems(e.target.value));
      setTimeout(() => searchInput.focus(), 20);
    }

    document.body.appendChild(menuEl);

    // Position menu
    let x = 0, y = 0;
    if (anchorOrPos instanceof HTMLElement) {
      const r = anchorOrPos.getBoundingClientRect();
      x = r.left;
      y = r.bottom + 4;
    } else if (anchorOrPos && typeof anchorOrPos.x === "number") {
      x = anchorOrPos.x;
      y = anchorOrPos.y;
    }
    const safeLeft = Math.max(6, Math.min(window.innerWidth - menuEl.offsetWidth - 6, x));
    const safeTop = Math.max(6, Math.min(window.innerHeight - menuEl.offsetHeight - 6, y));
    menuEl.style.left = `${safeLeft}px`;
    menuEl.style.top = `${safeTop}px`;

    setTimeout(() => {
      const clickAway = (e) => {
        if (menuEl && !menuEl.contains(e.target)) {
          hide();
          document.removeEventListener("pointerdown", clickAway, true);
        }
      };
      document.addEventListener("pointerdown", clickAway, true);
    }, 0);
  };

  return { show, hide, destroy: hide };
}

/**
 * Creates a theme-consistent Preview Container for images/HUD.
 * options: { title, badge, height }
 * returns: { root, box, footer, setImage, destroy }
 */
export function createPreviewCard(options = {}) {
  const root = document.createElement("div");
  root.className = "ds-ui-preview-container";
  if (options.className) root.classList.add(...String(options.className).split(/\s+/).filter(Boolean));

  const box = document.createElement("div");
  box.className = "ds-ui-preview-canvas-box";
  if (options.height) box.style.height = `${options.height}px`;

  const img = document.createElement("img");
  img.style.display = "none";
  box.appendChild(img);

  const placeholder = document.createElement("span");
  placeholder.textContent = options.placeholder || "No Image Loaded";
  placeholder.style.color = "var(--ds-text-muted, #9ca3af)";
  placeholder.style.fontSize = "10px";
  placeholder.style.fontWeight = "600";
  box.appendChild(placeholder);

  const footer = document.createElement("div");
  footer.className = "ds-ui-preview-footer";

  const titleSpan = document.createElement("span");
  titleSpan.textContent = options.title || "";
  footer.appendChild(titleSpan);

  const badgeSpan = document.createElement("span");
  badgeSpan.className = "ds-ui-preview-badge";
  badgeSpan.textContent = options.badge || "—";
  footer.appendChild(badgeSpan);

  root.append(box, footer);

  const api = {
    root,
    box,
    img,
    footer,
    setImage: (url, dimensions = "") => {
      if (url) {
        img.src = url;
        img.style.display = "block";
        placeholder.style.display = "none";
      } else {
        img.style.display = "none";
        placeholder.style.display = "block";
      }
      if (dimensions) badgeSpan.textContent = dimensions;
    },
    destroy: () => root.remove()
  };

  return api;
}
